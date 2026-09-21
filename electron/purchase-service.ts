import type { AuthService } from './auth-service.js'
import type { AdminPurchasesApi, Purchase, PurchaseDocument, PurchaseImportResult, PurchaseItem, PurchasePage } from './purchase-contract.js'

export type PurchaseErrorCode = 'validation' | 'duplicate' | 'forbidden' | 'not-found' | 'server' | 'session-invalid' | 'malformed-response'

export class PurchaseError extends Error {
  readonly code: PurchaseErrorCode
  readonly status: number | null
  constructor(code: PurchaseErrorCode, message: string, status: number | null = null) { super(message); this.name = 'PurchaseError'; this.code = code; this.status = status }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isNullableString = (value: unknown): value is string | null => isString(value) || value === null
const decimal = (value: unknown): string | null => isString(value) ? value : isNumber(value) ? value.toFixed(2) : null

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  try { const body: unknown = await response.json(); if (isRecord(body) && isString(body.error)) return body.error } catch { /* fallback */ }
  return fallback
}

const responseError = async (response: Response): Promise<PurchaseError> => {
  const message = await errorMessage(response, 'The purchase operation could not be completed.')
  if (response.status === 400) return new PurchaseError('validation', message, response.status)
  if (response.status === 401) return new PurchaseError('session-invalid', 'Your session is no longer valid. Please sign in again.', response.status)
  if (response.status === 403) return new PurchaseError('forbidden', 'This account cannot manage purchase documents.', response.status)
  if (response.status === 404) return new PurchaseError('not-found', 'The purchase could not be found.', response.status)
  if (response.status === 409) return new PurchaseError('duplicate', 'This purchase document has already been imported.', response.status)
  return new PurchaseError('server', response.status >= 500 ? 'The Colorful Life service is unavailable right now.' : message, response.status)
}

const parseItem = (value: unknown): PurchaseItem => {
  if (!isRecord(value) || !isNumber(value.id) || (!isNumber(value.productListingId) && value.productListingId !== null) || !isNullableString(value.externalProductId) || !isString(value.sourceDescription) || !isNullableString(value.sourceSetNumber) || (!isNumber(value.sourceLineNumber) && value.sourceLineNumber !== null) || !isNumber(value.quantity)) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase item.')
  const money = ['originalGrossUnitCost', 'originalGrossLineTotal', 'allocatedShipping', 'allocatedDiscount', 'finalLineCost', 'finalUnitCost']
  const values = Object.fromEntries(money.map((field) => [field, decimal(value[field])]))
  if (Object.values(values).some((entry) => entry === null) || (!isNullableString(value.receivedAt)) || (!isNullableString(value.returnedAt))) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase item.')
  return { id: value.id, productListingId: value.productListingId, externalProductId: value.externalProductId, sourceDescription: value.sourceDescription, sourceSetNumber: value.sourceSetNumber, sourceLineNumber: value.sourceLineNumber, quantity: value.quantity, originalGrossUnitCost: values.originalGrossUnitCost!, originalGrossLineTotal: values.originalGrossLineTotal!, allocatedShipping: values.allocatedShipping!, allocatedDiscount: values.allocatedDiscount!, finalLineCost: values.finalLineCost!, finalUnitCost: values.finalUnitCost!, receivedAt: value.receivedAt, returnedAt: value.returnedAt }
}

const parseDocument = (value: unknown, requireItems = false): PurchaseDocument => {
  if (!isRecord(value) || !isNumber(value.id) || !isNumber(value.purchaseId) || !isNumber(value.partNumber) || !isNullableString(value.sourceInvoiceReference) || !isString(value.importHash) || !isNullableString(value.sourceDocumentDate) || !isNumber(value.importedByUserId) || !isString(value.createdAt) || !isString(value.updatedAt) || (requireItems && !Array.isArray(value.purchaseItems)) || (value.purchaseItems !== undefined && !Array.isArray(value.purchaseItems))) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase document.')
  const money = ['originalGrossMerchandiseTotal', 'shippingTotal', 'discountTotal', 'finalTotalPaid']
  const values = Object.fromEntries(money.map((field) => [field, decimal(value[field])]))
  if (Object.values(values).some((entry) => entry === null)) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase document.')
  return { id: value.id, purchaseId: value.purchaseId, partNumber: value.partNumber, sourceInvoiceReference: value.sourceInvoiceReference, importHash: value.importHash, sourceDocumentDate: value.sourceDocumentDate, importedByUserId: value.importedByUserId, originalGrossMerchandiseTotal: values.originalGrossMerchandiseTotal!, shippingTotal: values.shippingTotal!, discountTotal: values.discountTotal!, finalTotalPaid: values.finalTotalPaid!, createdAt: value.createdAt, updatedAt: value.updatedAt, ...(value.purchaseItems === undefined ? {} : { purchaseItems: value.purchaseItems.map(parseItem) }) }
}

const parsePurchase = (value: unknown, requireItems = false): Purchase => {
  if (!isRecord(value) || !isNumber(value.id) || !isString(value.sourceOrderReference) || !isNullableString(value.sourceOrderDate) || !isNullableString(value.merchantName) || !isString(value.createdAt) || !isString(value.updatedAt) || !Array.isArray(value.purchaseDocuments)) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase response.')
  return { id: value.id, sourceOrderReference: value.sourceOrderReference, sourceOrderDate: value.sourceOrderDate, merchantName: value.merchantName, createdAt: value.createdAt, updatedAt: value.updatedAt, purchaseDocuments: value.purchaseDocuments.map((document) => parseDocument(document, requireItems)) }
}

const parsePage = (value: unknown): PurchasePage => {
  if (!isRecord(value) || !Array.isArray(value.purchases) || !isRecord(value.pagination) || !isNumber(value.pagination.page) || !isNumber(value.pagination.limit) || !isNumber(value.pagination.total) || !isNumber(value.pagination.totalPages)) throw new PurchaseError('malformed-response', 'The server returned an invalid purchase history response.')
  return { purchases: value.purchases.map((purchase) => parsePurchase(purchase)), pagination: { page: value.pagination.page, limit: value.pagination.limit, total: value.pagination.total, totalPages: value.pagination.totalPages } }
}

export class PurchaseService implements AdminPurchasesApi {
  private readonly auth: AuthService

  constructor(auth: AuthService) { this.auth = auth }

  async importPdf(file: { bytes: Uint8Array; filename: string; mimeType: 'application/pdf' }): Promise<PurchaseImportResult> {
    const form = new FormData()
    form.append('file', new Blob([file.bytes.buffer as ArrayBuffer], { type: file.mimeType }), file.filename)
    const response = await this.auth.authenticatedFetch('/purchases/import', { method: 'POST', body: form })
    if (!response.ok) throw await responseError(response)
    const value: unknown = await response.json()
    if (!isRecord(value) || !isString(value.message) || !isString(value.importHash)) throw new PurchaseError('malformed-response', 'The server returned an invalid import response.')
    return { message: value.message, importHash: value.importHash }
  }

  async list(page = 1, limit = 20): Promise<PurchasePage> {
    const response = await this.auth.authenticatedFetch(`/purchases?page=${page}&limit=${limit}`)
    if (!response.ok) throw await responseError(response)
    return parsePage(await response.json())
  }

  async get(purchaseId: number): Promise<Purchase> {
    const response = await this.auth.authenticatedFetch(`/purchases/${purchaseId}`)
    if (!response.ok) throw await responseError(response)
    return parsePurchase(await response.json(), true)
  }
}

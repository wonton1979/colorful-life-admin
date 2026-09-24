import type { AuthService } from './auth-service.js'
import type { AdminPurchasesApi, ManualPurchaseCreated, ManualPurchaseInput, Purchase, PurchaseDocument, PurchaseImportResult, PurchaseItem, PurchasePage } from './purchase-contract.js'
import type { PurchaseReview, ReviewGroup, PurchaseAmendment, ReviewProduct, ReviewListingCreation } from './purchase-contract.js'
import { parseProduct } from './product-service.js'

export type PurchaseErrorCode = 'validation' | 'duplicate' | 'conflict' | 'forbidden' | 'not-found' | 'server' | 'session-invalid' | 'malformed-response'

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

const responseError = async (response: Response, importing = false): Promise<PurchaseError> => {
  const message = await errorMessage(response, 'The purchase operation could not be completed.')
  if (response.status === 400) return new PurchaseError('validation', message, response.status)
  if (response.status === 401) return new PurchaseError('session-invalid', 'Your session is no longer valid. Please sign in again.', response.status)
  if (response.status === 403) return new PurchaseError('forbidden', 'This account cannot manage purchase documents.', response.status)
  if (response.status === 404) return new PurchaseError('not-found', 'The purchase could not be found.', response.status)
  if (response.status === 409) return new PurchaseError(importing ? 'duplicate' : 'conflict', importing ? 'This purchase document has already been imported.' : message, response.status)
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

const poundsToPence = (value: unknown, field: string): number => {
  if (!isString(value) || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new PurchaseError('validation', `${field} must be a nonnegative amount with up to two decimal places.`)
  const [whole, fraction = ''] = value.trim().split('.')
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(pence)) throw new PurchaseError('validation', `${field} is too large.`)
  return pence
}

const optionalText = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined
  if (!isString(value)) throw new PurchaseError('validation', `${field} must be text.`)
  return value.trim() || undefined
}

export function validateManualPurchaseInput(value: unknown) {
  if (!isRecord(value)) throw new PurchaseError('validation', 'Enter valid purchase details.')
  const sourceOrderReference = optionalText(value.sourceOrderReference, 'Purchase reference')
  if (!sourceOrderReference) throw new PurchaseError('validation', 'Purchase reference is required.')
  const sourceOrderDate = optionalText(value.sourceOrderDate, 'Purchase date')
  const sourceDocumentDate = optionalText(value.sourceDocumentDate, 'Document date')
  for (const [label, date] of [['Purchase date', sourceOrderDate], ['Document date', sourceDocumentDate]] as const) {
    if (date && Number.isNaN(Date.parse(date))) throw new PurchaseError('validation', `${label} must be a valid date.`)
  }
  const originalGrossMerchandiseTotal = poundsToPence(value.originalGrossMerchandiseTotal, 'Merchandise total')
  const shippingTotal = poundsToPence(value.shippingTotal ?? '0', 'Shipping')
  const discountTotal = poundsToPence(value.discountTotal ?? '0', 'Discount')
  const finalTotalPaid = poundsToPence(value.finalTotalPaid, 'Total paid')
  if (!Array.isArray(value.items) || value.items.length === 0) throw new PurchaseError('validation', 'Add at least one purchase item.')
  const items = value.items.map((raw: unknown, index) => {
    const row = index + 1
    if (!isRecord(raw)) throw new PurchaseError('validation', `Item ${row} is invalid.`)
    const sourceDescription = optionalText(raw.sourceDescription, `Item ${row} description`)
    if (!sourceDescription) throw new PurchaseError('validation', `Item ${row} description is required.`)
    if (!isNumber(raw.quantity) || !Number.isInteger(raw.quantity) || raw.quantity <= 0) throw new PurchaseError('validation', `Item ${row} quantity must be a positive whole number.`)
    const sourceSetNumber = optionalText(raw.sourceSetNumber, `Item ${row} LEGO set number`)
    const originalGrossUnitCost = poundsToPence(raw.originalGrossUnitCost, `Item ${row} unit cost`)
    const originalGrossLineTotal = poundsToPence(raw.originalGrossLineTotal, `Item ${row} line total`)
    return { sourceDescription, quantity: raw.quantity, originalGrossUnitCost, originalGrossLineTotal, ...(sourceSetNumber ? { sourceSetNumber } : {}) }
  })
  if (items.reduce((sum, item) => sum + item.originalGrossLineTotal, 0) !== originalGrossMerchandiseTotal) throw new PurchaseError('validation', 'Merchandise total must equal the sum of item line totals.')
  if (finalTotalPaid !== originalGrossMerchandiseTotal + shippingTotal - discountTotal) throw new PurchaseError('validation', 'Total paid must equal merchandise plus shipping minus discount.')
  return {
    sourceOrderReference,
    ...(sourceOrderDate ? { sourceOrderDate } : {}),
    ...(optionalText(value.merchantName, 'Supplier / Retailer') ? { merchantName: optionalText(value.merchantName, 'Supplier / Retailer') } : {}),
    ...(optionalText(value.sourceInvoiceReference, 'Invoice reference') ? { sourceInvoiceReference: optionalText(value.sourceInvoiceReference, 'Invoice reference') } : {}),
    ...(sourceDocumentDate ? { sourceDocumentDate } : {}),
    originalGrossMerchandiseTotal, shippingTotal, discountTotal, finalTotalPaid, items,
  }
}

export class PurchaseService implements AdminPurchasesApi {
  private readonly auth: AuthService

  constructor(auth: AuthService) { this.auth = auth }

  async createManual(input: ManualPurchaseInput): Promise<ManualPurchaseCreated> {
    const response = await this.auth.authenticatedFetch('/purchases/manual', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validateManualPurchaseInput(input)),
    })
    if (!response.ok) throw await responseError(response)
    const value: unknown = await response.json()
    if (!isRecord(value) || !isRecord(value.purchase) || !positiveId(value.purchase.id) || !isString(value.purchase.sourceOrderReference)) throw new PurchaseError('malformed-response', 'The server returned an invalid manual purchase response.')
    const document = parseDocument(value, true)
    return { purchaseId: value.purchase.id, documentId: document.id }
  }

  private async reviewRequest(purchaseId: number, path = '', method = 'GET', body?: unknown): Promise<PurchaseReview> {
    const response = await this.auth.authenticatedFetch(`/purchases/${purchaseId}/review${path}`, {
      method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (!response.ok) throw await responseError(response)
    return parseReview(await response.json())
  }
  review(purchaseId: number) { return this.reviewRequest(purchaseId) }
  amend(purchaseId: number, itemId: number, input: PurchaseAmendment) {
    return this.reviewRequest(purchaseId, `/items/${itemId}`, 'PATCH', input)
  }
  resolve(purchaseId: number, groupId: number, input: { revision: string; productListingId: number | null }) {
    return this.reviewRequest(purchaseId, `/groups/${groupId}/listing`, 'PATCH', input)
  }
  receive(purchaseId: number, groupId: number, input: { revision: string }) {
    return this.reviewRequest(purchaseId, `/groups/${groupId}/receive`, 'POST', input)
  }
  async searchProducts(purchaseId: number, query: string): Promise<ReviewProduct[]> {
    const response = await this.auth.authenticatedFetch(`/purchases/${purchaseId}/review/products?q=${encodeURIComponent(query)}`)
    if (!response.ok) throw await responseError(response)
    const body: unknown = await response.json()
    if (!Array.isArray(body)) throw malformedReview()
    return body.map(parseReviewProduct)
  }
  async createListing(purchaseId: number, input: ReviewListingCreation) {
    const response = await this.auth.authenticatedFetch(`/purchases/${purchaseId}/review/listings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })
    if (!response.ok) throw await responseError(response)
    return parseProduct(await response.json())
  }

  async importPdf(file: { bytes: Uint8Array; filename: string; mimeType: 'application/pdf' }): Promise<PurchaseImportResult> {
    const form = new FormData()
    form.append('file', new Blob([file.bytes.buffer as ArrayBuffer], { type: file.mimeType }), file.filename)
    const response = await this.auth.authenticatedFetch('/purchases/import', { method: 'POST', body: form })
    if (!response.ok) throw await responseError(response, true)
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

const malformedReview = () => new PurchaseError('malformed-response', 'The server returned an invalid purchase review.')
const positiveId = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v > 0
const moneyString = (v: unknown): v is string => isString(v) && /^\d+(\.\d{1,6})?$/.test(v)
function parseReviewProduct(value: unknown): ReviewProduct {
  if (!isRecord(value) || !positiveId(value.id) || !isString(value.setNumber) || !isString(value.title)) throw malformedReview()
  return { id: value.id, setNumber: value.setNumber, title: value.title }
}
export function parseReview(value: unknown): PurchaseReview {
  if (!isRecord(value) || !isString(value.revision) || !/^[a-f0-9]{64}$/.test(value.revision) || !moneyString(value.totalCost) || !Array.isArray(value.groups)) throw malformedReview()
  const purchase = parsePurchase(value.purchase, true)
  const groups = value.groups.map((g: unknown): ReviewGroup => {
    if (!isRecord(g) || !positiveId(g.id) || !Array.isArray(g.sourceItemIds) || !g.sourceItemIds.every(positiveId) ||
      !isString(g.description) || !isNullableString(g.externalProductId) || !isNullableString(g.sourceSetNumber) ||
      !positiveId(g.quantity) || !isNumber(g.pendingQuantity) || !Number.isInteger(g.pendingQuantity) || g.pendingQuantity < 0 || g.pendingQuantity > g.quantity ||
      !moneyString(g.totalCost) || !moneyString(g.unitCost) || (g.costKind !== 'UNIT' && g.costKind !== 'WEIGHTED_AVERAGE') ||
      !['UNRESOLVED', 'MATCHED', 'RECEIVED'].includes(String(g.state)) || typeof g.canResolve !== 'boolean' || !Array.isArray(g.lines)) throw malformedReview()
    let listing: ReviewGroup['listing'] = null
    if (g.listing !== null) {
      if (!isRecord(g.listing) || (g.listing.condition !== 'NEW' && g.listing.condition !== 'USED_LIKE_NEW') || typeof g.listing.active !== 'boolean') throw malformedReview()
      listing = { ...parseReviewProduct(g.listing), condition: g.listing.condition, active: g.listing.active }
    }
    const lines = g.lines.map((l: unknown) => {
      if (!isRecord(l) || !positiveId(l.purchaseDocumentId) || typeof l.canAmend !== 'boolean' || typeof l.canAmendCost !== 'boolean') throw malformedReview()
      return { ...parseItem(l), purchaseDocumentId: l.purchaseDocumentId, canAmend: l.canAmend, canAmendCost: l.canAmendCost }
    })
    const sourceItemIds = g.sourceItemIds
    if (!lines.length || lines.length !== sourceItemIds.length || lines.some((l, i) => l.id !== sourceItemIds[i]) ||
      lines.reduce((n, l) => n + l.quantity, 0) !== g.quantity) throw malformedReview()
    return { id: g.id, sourceItemIds: g.sourceItemIds, description: g.description, externalProductId: g.externalProductId,
      sourceSetNumber: g.sourceSetNumber, quantity: g.quantity, pendingQuantity: g.pendingQuantity, totalCost: g.totalCost,
      unitCost: g.unitCost, costKind: g.costKind, listing, state: g.state as ReviewGroup['state'], canResolve: g.canResolve, lines }
  })
  return { purchase, revision: value.revision, totalCost: value.totalCost, groups }
}

export function validateReviewInput(value: unknown): { revision: string } {
  if (!isRecord(value) || !isString(value.revision) || !/^[a-f0-9]{64}$/.test(value.revision)) throw new PurchaseError('validation', 'Invalid review revision')
  return { revision: value.revision }
}
export function validateReceipt(value: unknown) {
  const revision = validateReviewInput(value)
  if (!isRecord(value) || Object.keys(value).some(k => k !== 'revision')) throw new PurchaseError('validation', 'Receiving accepts only a review revision')
  return revision
}
export function validateAmendment(value: unknown): PurchaseAmendment {
  const revision = validateReviewInput(value)
  if (!isRecord(value) || Object.keys(value).some(k => !['revision', 'sourceDescription', 'sourceSetNumber', 'quantity', 'originalGrossUnitCost'].includes(k)) ||
    !isString(value.sourceDescription) || !isNullableString(value.sourceSetNumber) ||
    (value.quantity !== undefined && !positiveId(value.quantity)) ||
    (value.originalGrossUnitCost !== undefined && !moneyString(value.originalGrossUnitCost))) throw new PurchaseError('validation', 'Invalid amendment')
  return { ...revision, sourceDescription: value.sourceDescription, sourceSetNumber: value.sourceSetNumber,
    ...(value.quantity === undefined ? {} : { quantity: value.quantity }),
    ...(value.originalGrossUnitCost === undefined ? {} : { originalGrossUnitCost: value.originalGrossUnitCost }) }
}
export function validateResolution(value: unknown) {
  const revision = validateReviewInput(value)
  if (!isRecord(value) || Object.keys(value).some(k => !['revision', 'productListingId'].includes(k)) ||
    (value.productListingId !== null && !positiveId(value.productListingId))) throw new PurchaseError('validation', 'Invalid listing selection')
  return { ...revision, productListingId: value.productListingId }
}
export function validateListingCreation(value: unknown): ReviewListingCreation {
  if (!isRecord(value) || value.currentStock !== 0 || (value.condition !== 'NEW' && value.condition !== 'USED_LIKE_NEW') ||
    !isNumber(value.originalPrice) || value.originalPrice <= 0 || (value.salePrice !== undefined && (!isNumber(value.salePrice) || value.salePrice < 0))) throw new PurchaseError('validation', 'Invalid purchase listing')
  const price: Pick<ReviewListingCreation, 'currentStock' | 'condition' | 'originalPrice' | 'salePrice'> = { currentStock: 0 as const, condition: value.condition, originalPrice: value.originalPrice,
    ...(value.salePrice === undefined ? {} : { salePrice: value.salePrice }) }
  if (positiveId(value.existingProductId)) return { ...price, existingProductId: value.existingProductId }
  if (!isString(value.setNumber) || !isString(value.title) || !isString(value.theme) || !positiveId(value.categoryId) ||
    !isString(value.ageRecommendation) || !positiveId(value.pieceCount) || (value.description !== undefined && !isString(value.description))) throw new PurchaseError('validation', 'Invalid new product')
  return { ...price, setNumber: value.setNumber, title: value.title, theme: value.theme, categoryId: value.categoryId,
    ageRecommendation: value.ageRecommendation, pieceCount: value.pieceCount, ...(value.description === undefined ? {} : { description: value.description }) }
}

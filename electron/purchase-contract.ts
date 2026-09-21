export interface PurchaseItem {
  id: number
  productListingId: number | null
  externalProductId: string | null
  sourceDescription: string
  sourceSetNumber: string | null
  sourceLineNumber: number | null
  quantity: number
  originalGrossUnitCost: string
  originalGrossLineTotal: string
  allocatedShipping: string
  allocatedDiscount: string
  finalLineCost: string
  finalUnitCost: string
  receivedAt: string | null
  returnedAt: string | null
}

export interface PurchaseDocument {
  id: number
  purchaseId: number
  partNumber: number
  sourceInvoiceReference: string | null
  importHash: string
  sourceDocumentDate: string | null
  importedByUserId: number
  originalGrossMerchandiseTotal: string
  shippingTotal: string
  discountTotal: string
  finalTotalPaid: string
  createdAt: string
  updatedAt: string
  purchaseItems?: PurchaseItem[]
}

export interface Purchase {
  id: number
  sourceOrderReference: string
  sourceOrderDate: string | null
  merchantName: string | null
  createdAt: string
  updatedAt: string
  purchaseDocuments: PurchaseDocument[]
}

export interface PurchasePage {
  purchases: Purchase[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface PurchaseImportResult {
  message: string
  importHash: string
}

export interface AdminPurchasesApi {
  importPdf(file: { bytes: Uint8Array; filename: string; mimeType: 'application/pdf' }): Promise<PurchaseImportResult>
  list(page?: number, limit?: number): Promise<PurchasePage>
  get(purchaseId: number): Promise<Purchase>
}

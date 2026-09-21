import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../electron/auth-service.js'
import { PurchaseError, PurchaseService } from '../electron/purchase-service.js'

const item = { id: 1, productListingId: null, externalProductId: 'ASIN', sourceDescription: 'Example set', sourceSetNumber: '12345', sourceLineNumber: 1, quantity: 2, originalGrossUnitCost: '10.00', originalGrossLineTotal: '20.00', allocatedShipping: '1.00', allocatedDiscount: '0.50', finalLineCost: '20.50', finalUnitCost: '10.250000', receivedAt: null, returnedAt: null }
const document = { id: 2, purchaseId: 3, partNumber: 1, sourceInvoiceReference: 'INV-1', importHash: 'hash', sourceDocumentDate: '2026-09-20T00:00:00.000Z', importedByUserId: 7, originalGrossMerchandiseTotal: '20.00', shippingTotal: '1.00', discountTotal: '0.50', finalTotalPaid: '20.50', createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseItems: [item] }
const purchase = { id: 3, sourceOrderReference: 'ORDER-1', sourceOrderDate: '2026-09-20T00:00:00.000Z', merchantName: null, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseDocuments: [document] }
const historyPurchase = { ...purchase, purchaseDocuments: [{ ...document, purchaseItems: undefined }] }

describe('PurchaseService', () => {
  it('posts one multipart PDF and parses the import response', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Purchase invoice imported successfully', importHash: 'abc' }), { status: 201 }))
    const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.importPdf({ bytes: new Uint8Array([37, 80, 68, 70, 45]), filename: 'invoice.pdf', mimeType: 'application/pdf' })
    expect(result.importHash).toBe('abc')
    const init = authenticatedFetch.mock.calls[0][1] as RequestInit
    expect(authenticatedFetch.mock.calls[0][0]).toBe('/purchases/import')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('parses history and details using the backend contracts', async () => {
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ purchases: [historyPurchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(purchase), { status: 200 }))
    const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
    expect((await service.list()).purchases[0].purchaseDocuments[0].purchaseItems).toBeUndefined()
    expect((await service.get(3)).sourceOrderReference).toBe('ORDER-1')
    expect(authenticatedFetch.mock.calls.map((call) => call[0])).toEqual(['/purchases?page=1&limit=20', '/purchases/3'])
  })

  it('maps duplicate and server responses to safe errors', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Duplicate import hash' }), { status: 409 })).mockResolvedValueOnce(new Response(null, { status: 500 }))
    const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.importPdf({ bytes: new Uint8Array([1]), filename: 'invoice.pdf', mimeType: 'application/pdf' })).rejects.toMatchObject({ code: 'duplicate', status: 409 } satisfies Partial<PurchaseError>)
    await expect(service.list()).rejects.toMatchObject({ code: 'server', status: 500 } satisfies Partial<PurchaseError>)
  })
})

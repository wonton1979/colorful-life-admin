import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../electron/auth-service.js'
import { PurchaseError, PurchaseService, validateManualPurchaseInput } from '../electron/purchase-service.js'
import type { ManualPurchaseInput } from '../electron/purchase-contract.js'

const input: ManualPurchaseInput = {
  sourceOrderReference: ' ORDER-17 ', sourceOrderDate: '2026-09-20', merchantName: ' Example Retailer ',
  sourceInvoiceReference: ' INV-17 ', sourceDocumentDate: '2026-09-20', originalGrossMerchandiseTotal: '27.50',
  shippingTotal: '2.00', discountTotal: '1.50', finalTotalPaid: '28.00',
  items: [
    { sourceDescription: 'Set one', sourceSetNumber: '12345', quantity: 2, originalGrossUnitCost: '10.00', originalGrossLineTotal: '20.00' },
    { sourceDescription: 'Set two', quantity: 1, originalGrossUnitCost: '7.50', originalGrossLineTotal: '7.50' },
  ],
}
const response = {
  id: 44, purchaseId: 17, partNumber: 1, sourceInvoiceReference: 'INV-17', importHash: 'manual:abc',
  sourceDocumentDate: '2026-09-20T00:00:00.000Z', importedByUserId: 9,
  originalGrossMerchandiseTotal: '27.50', shippingTotal: '2.00', discountTotal: '1.50', finalTotalPaid: '28.00',
  createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
  purchase: { id: 17, sourceOrderReference: 'ORDER-17' },
  purchaseItems: [
    { id: 1, productListingId: null, externalProductId: null, sourceDescription: 'Set one', sourceSetNumber: '12345', sourceLineNumber: null, quantity: 2, originalGrossUnitCost: '10.00', originalGrossLineTotal: '20.00', allocatedShipping: '1.45', allocatedDiscount: '1.09', finalLineCost: '20.36', finalUnitCost: '10.180000', receivedAt: null, returnedAt: null },
    { id: 2, productListingId: null, externalProductId: null, sourceDescription: 'Set two', sourceSetNumber: null, sourceLineNumber: null, quantity: 1, originalGrossUnitCost: '7.50', originalGrossLineTotal: '7.50', allocatedShipping: '0.55', allocatedDiscount: '0.41', finalLineCost: '7.64', finalUnitCost: '7.640000', receivedAt: null, returnedAt: null },
  ],
}

describe('manual purchase service', () => {
  it('posts the backend contract with pound amounts converted to integer pence and parses the created purchase', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 201 }))
    const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createManual(input)).resolves.toEqual({ purchaseId: 17, documentId: 44 })
    expect(authenticatedFetch).toHaveBeenCalledWith('/purchases/manual', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }))
    expect(JSON.parse(authenticatedFetch.mock.calls[0][1].body as string)).toEqual({
      sourceOrderReference: 'ORDER-17', sourceOrderDate: '2026-09-20', merchantName: 'Example Retailer',
      sourceInvoiceReference: 'INV-17', sourceDocumentDate: '2026-09-20', originalGrossMerchandiseTotal: 2750,
      shippingTotal: 200, discountTotal: 150, finalTotalPaid: 2800,
      items: [
        { sourceDescription: 'Set one', sourceSetNumber: '12345', quantity: 2, originalGrossUnitCost: 1000, originalGrossLineTotal: 2000 },
        { sourceDescription: 'Set two', quantity: 1, originalGrossUnitCost: 750, originalGrossLineTotal: 750 },
      ],
    })
  })

  it('defaults omitted shipping and discount and validates required fields, quantities, money, and reconciliation', () => {
    const valid = { sourceOrderReference: 'R', originalGrossMerchandiseTotal: '5.00', finalTotalPaid: '5.00', items: [{ sourceDescription: 'Set', quantity: 1, originalGrossUnitCost: '5.00', originalGrossLineTotal: '5.00' }] }
    expect(validateManualPurchaseInput(valid)).toMatchObject({ shippingTotal: 0, discountTotal: 0, finalTotalPaid: 500 })
    for (const invalid of [
      { ...valid, sourceOrderReference: ' ' },
      { ...valid, items: [] },
      { ...valid, items: [{ ...valid.items[0], quantity: 0 }] },
      { ...valid, items: [{ ...valid.items[0], originalGrossUnitCost: '1.001' }] },
      { ...valid, originalGrossMerchandiseTotal: '4.99' },
      { ...valid, finalTotalPaid: '4.99' },
    ]) expect(() => validateManualPurchaseInput(invalid)).toThrow(PurchaseError)
  })

  it('surfaces backend validation errors using PurchaseError conventions', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'The source order reference already exists.' }), { status: 400 }))
    const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createManual(input)).rejects.toMatchObject({ code: 'validation', status: 400, message: 'The source order reference already exists.' })
  })
})

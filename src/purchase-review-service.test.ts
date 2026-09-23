import { expect, it, vi } from 'vitest'
import { PurchaseService, parseReview, validateAmendment, validateListingCreation } from '../electron/purchase-service'
import type { AuthService } from '../electron/auth-service'
import fixture from './test-fixtures/purchase-review.json'

it("validates the full grouped review without losing source lines", () => {
  const r = parseReview(fixture)
  expect(r.groups[0].quantity).toBe(3)
  expect(r.groups[0].lines.map(l => l.quantity)).toEqual([1, 2])
  expect(r.purchase.purchaseDocuments[0].purchaseItems).toHaveLength(2)
  for (const invalid of [
    { ...fixture, revision: 'missing' },
    { ...fixture, totalCost: 'NaN' },
    { ...fixture, groups: [{ ...fixture.groups[0], quantity: 99 }] },
    { ...fixture, groups: [{ ...fixture.groups[0], listing: {} }] },
    { ...fixture, groups: [{ ...fixture.groups[0], lines: [] }] },
  ]) expect(() => parseReview(invalid)).toThrow('invalid purchase review')
})
it("routes amendment, resolution and receiving through authenticated requests with revisions", async () => {
  const authenticatedFetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(fixture))))
  const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
  await service.review(1)
  await service.amend(1, 101, { revision: fixture.revision, sourceDescription: 'Amended', sourceSetNumber: null })
  await service.resolve(1, 101, { revision: fixture.revision, productListingId: 7 })
  await service.receive(1, 101, { revision: fixture.revision })
  expect(authenticatedFetch.mock.calls.map(c => [c[0], c[1].method])).toEqual([
    ['/purchases/1/review', 'GET'], ['/purchases/1/review/items/101', 'PATCH'],
    ['/purchases/1/review/groups/101/listing', 'PATCH'], ['/purchases/1/review/groups/101/receive', 'POST'],
  ])
  expect(JSON.parse(authenticatedFetch.mock.calls[3][1].body)).toEqual({ revision: fixture.revision })
})
it("preserves review conflict messages instead of reporting duplicate import", async () => {
  const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Purchase changed. Refresh.' }), { status: 409 }))
  const service = new PurchaseService({ authenticatedFetch } as unknown as AuthService)
  await expect(service.receive(1, 101, { revision: fixture.revision })).rejects.toMatchObject({ code: 'conflict', message: 'Purchase changed. Refresh.' })
})
it("rejects protected amendment fields and nonzero purchase-backed initial stock", () => {
  for (const field of ['receivedAt', 'returnedAt', 'productListingId', 'currentStock', 'finalUnitCost', 'importHash']) {
    expect(() => validateAmendment({ revision: fixture.revision, sourceDescription: 'Line', sourceSetNumber: null, [field]: 1 })).toThrow()
  }
  expect(() => validateListingCreation({ existingProductId: 1, condition: 'NEW', originalPrice: 10, currentStock: 3 })).toThrow()
})

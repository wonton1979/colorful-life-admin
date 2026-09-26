import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PurchaseReview from './PurchaseReview'
import AddProduct from './AddProduct'
import type { ProductListing } from '../electron/product-contract'
import { parseReview } from '../electron/purchase-service'
import fixture from './test-fixtures/purchase-review.json'
const review = () => parseReview(structuredClone(fixture))
beforeEach(() => {
  window.adminPurchases = {
    createManual: vi.fn(), importPdf: vi.fn(), list: vi.fn(), get: vi.fn(), review: vi.fn().mockResolvedValue(review()),
    amend: vi.fn().mockResolvedValue(review()), resolve: vi.fn().mockResolvedValue(review()),
    receive: vi.fn().mockResolvedValue(review()), searchProducts: vi.fn().mockResolvedValue([]), createListing: vi.fn(),
  }
  window.adminProducts = { createProduct: vi.fn(), listProducts: vi.fn().mockResolvedValue([]), listAdminProductListings: vi.fn().mockResolvedValue([]), updateProductMetadata: vi.fn(), listProductImages: vi.fn().mockResolvedValue([]), uploadProductImage: vi.fn(), reorderProductImages: vi.fn().mockResolvedValue([]), updateProductImageAltText: vi.fn(), deleteProductImage: vi.fn(),
    setFeatureProduct: vi.fn(), uploadCatalogueArtwork: vi.fn(), removeCatalogueArtwork: vi.fn(), searchLegoProducts: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }), createUsedOffer: vi.fn() }
  window.adminCategories = { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn() }
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it("renders one product with quantity 3, truthful costs and two traceable lines", () => {
  render(<PurchaseReview initialReview={review()} onBack={vi.fn()} />)
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Approve & Receive 3' })).toBeInTheDocument()
  expect(screen.getByText('Source lines and cost breakdown (2)')).toBeInTheDocument()
  expect(screen.getByText(/Purchase Total/)).toHaveTextContent('£209.97')
})
it("uses backend weighted cost and received states", () => {
  const r = review(); r.groups[0].costKind = 'WEIGHTED_AVERAGE'; r.groups[0].unitCost = '63.323333'
  r.groups[0].state = 'RECEIVED'; r.groups[0].canResolve = false
  r.groups[0].lines.forEach(l => { l.canAmend = false; l.canAmendCost = false; l.receivedAt = '2026-09-22' })
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  expect(screen.getByText('Weighted average unit cost')).toHaveTextContent('£63.32')
  expect(screen.queryByRole('button', { name: /Approve|Amend|Listing/ })).not.toBeInTheDocument()
})
it("preserves failed amendment draft, cancels locally, and saves only business inputs", async () => {
  const r = review()
  vi.mocked(window.adminPurchases.amend).mockRejectedValueOnce(new Error('Server unavailable'))
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Amend' }))
  fireEvent.change(screen.getAllByLabelText('Quantity')[0], { target: { value: '4' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Save source line' })[0])
  expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
  expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue(4)
  expect(window.adminPurchases.amend).toHaveBeenCalledWith(1, 101, {
    revision: r.revision, sourceDescription: 'Display model', sourceSetNumber: '75446', quantity: 4, originalGrossUnitCost: '69.99',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel amendment' }))
  fireEvent.click(screen.getByRole('button', { name: 'Amend' }))
  expect(screen.getAllByLabelText('Quantity')[0]).toHaveValue(1)
})
it("locks submissions while pending and renders authoritative receive response", async () => {
  let finish: (r: ReturnType<typeof review>) => void = () => {}
  vi.mocked(window.adminPurchases.receive).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<PurchaseReview initialReview={review()} onBack={vi.fn()} />)
  const button = screen.getByRole('button', { name: 'Approve & Receive 3' })
  fireEvent.click(button); fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(document.querySelector('.purchase-review')).toHaveAttribute('aria-busy', 'true')
  expect(window.adminPurchases.receive).toHaveBeenCalledTimes(1)
  expect(window.adminPurchases.receive).toHaveBeenCalledWith(1, 101, { revision: 'a'.repeat(64) })
  const r = review(); r.groups[0].state = 'RECEIVED'; r.groups[0].canResolve = false; r.groups[0].lines.forEach(l => { l.canAmend = false })
  finish(r)
  expect(await screen.findByText('RECEIVED')).toBeInTheDocument()
  expect(document.querySelector('.purchase-review')).toHaveAttribute('aria-busy', 'false')
  expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
})
it("cancelling approval makes no request; backend failure retains actionable review", async () => {
  vi.mocked(window.confirm).mockReturnValueOnce(false)
  vi.mocked(window.adminPurchases.receive).mockRejectedValue(new Error('Purchase changed'))
  render(<PurchaseReview initialReview={review()} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
  expect(window.adminPurchases.receive).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Purchase changed')
  expect(screen.getByRole('button', { name: 'Refresh review' })).toBeEnabled()
  const retryReceive = screen.getByRole('button', { name: /Approve & Receive/ })
  expect(retryReceive).toBeEnabled()
  expect(retryReceive).toHaveAttribute('aria-busy', 'false')
})
it("resolves a whole group explicitly and preserves the choice on failure", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null
  vi.mocked(window.adminProducts.listProducts).mockResolvedValue([{ id: 7, condition: 'NEW', legoProduct: { setNumber: '75446', title: 'Display model' } }] as Awaited<ReturnType<typeof window.adminProducts.listProducts>>)
  vi.mocked(window.adminPurchases.resolve).mockRejectedValueOnce(new Error('Selection rejected'))
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  fireEvent.change(await screen.findByLabelText('Product listing'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link selected listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Selection rejected')
  expect(screen.getByLabelText('Product listing')).toHaveValue('7')
  fireEvent.click(screen.getByRole('button', { name: 'Link selected listing' }))
  expect(await screen.findByText('MATCHED')).toBeInTheDocument()
  expect(window.adminPurchases.resolve).toHaveBeenCalledWith(1, 101, { revision: r.revision, productListingId: 7 })
})
it("shows listing request failure without a false empty result", async () => {
  vi.mocked(window.adminProducts.listProducts).mockRejectedValue(new Error('Listings unavailable'))
  render(<PurchaseReview initialReview={review()} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Change Listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Listings unavailable')
  expect(screen.queryByLabelText('Product listing')).not.toBeInTheDocument()
})
it("prefills the parsed set number and selects one exact listing without linking it", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null
  vi.mocked(window.adminProducts.listProducts).mockResolvedValue([{ id: 7, condition: 'NEW', legoProduct: { setNumber: '75446', title: 'Display model' } }] as Awaited<ReturnType<typeof window.adminProducts.listProducts>>)
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  expect(await screen.findByLabelText('Search listings by set number or title')).toHaveValue('75446')
  expect(screen.getByLabelText('Product listing')).toHaveValue('7')
  expect(window.adminPurchases.resolve).not.toHaveBeenCalled()
})
it("does not guess between multiple set-number listings and allows a different selection", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null
  vi.mocked(window.adminProducts.listProducts).mockResolvedValue([
    { id: 7, condition: 'NEW', legoProduct: { setNumber: '75446', title: 'Display model' } },
    { id: 8, condition: 'USED_LIKE_NEW', legoProduct: { setNumber: '75446', title: 'Used display model' } },
  ] as Awaited<ReturnType<typeof window.adminProducts.listProducts>>)
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  const dropdown = await screen.findByLabelText('Product listing')
  expect(dropdown).toHaveValue('')
  fireEvent.change(dropdown, { target: { value: '8' } })
  expect(dropdown).toHaveValue('8')
})
it("lets the user edit the automatic search and keeps zero matches unresolved", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null
  vi.mocked(window.adminProducts.listProducts).mockResolvedValue([
    { id: 7, condition: 'NEW', legoProduct: { setNumber: '75446', title: 'Display model' } },
    { id: 9, condition: 'NEW', legoProduct: { setNumber: '60325', title: 'City vehicle' } },
  ] as Awaited<ReturnType<typeof window.adminProducts.listProducts>>)
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  const search = await screen.findByLabelText('Search listings by set number or title')
  const dropdown = screen.getByLabelText('Product listing')
  fireEvent.change(search, { target: { value: '60325' } })
  expect(dropdown).toHaveValue('')
  expect(screen.getByRole('option', { name: /60325/ })).toBeInTheDocument()
  fireEvent.change(search, { target: { value: '99999' } })
  expect(dropdown).toHaveValue('')
  expect(screen.getByRole('option', { name: 'Unresolved (clear association)' })).toBeInTheDocument()
  expect(window.adminPurchases.resolve).not.toHaveBeenCalled()
})
it("keeps manual resolver behavior when no set number was parsed", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null; r.groups[0].sourceSetNumber = null
  vi.mocked(window.adminProducts.listProducts).mockResolvedValue([{ id: 9, condition: 'NEW', legoProduct: { setNumber: '60325', title: 'City vehicle' } }] as Awaited<ReturnType<typeof window.adminProducts.listProducts>>)
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  expect(await screen.findByLabelText('Search listings by set number or title')).toHaveValue('')
  expect(screen.getByLabelText('Product listing')).toHaveValue('')
})
it("purchase-backed listing creation defaults to NEW and always sends zero stock", async () => {
  render(<AddProduct purchaseContext={{ purchaseId: 1, groupId: 101, revision: 'a'.repeat(64), sourceSetNumber: '75446', sourceDescription: 'Display model', existingProduct: { id: 9, setNumber: '75446', title: 'Display model' } }} />)
  expect(screen.getByLabelText('Condition')).toHaveValue('NEW')
  expect(screen.getByLabelText('Condition')).toBeDisabled()
  expect(screen.queryByLabelText('Current stock')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Original price'), { target: { value: '50' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form')!)
  await waitFor(() => expect(window.adminPurchases.createListing).toHaveBeenCalledWith(1, { existingProductId: 9, condition: 'NEW', originalPrice: 50, currentStock: 0 }))
  expect(window.adminProducts.createProduct).not.toHaveBeenCalled()
})
it("prefills a new purchase product and links the created listing back to the review", async () => {
  const r = review(); r.groups[0].state = 'UNRESOLVED'; r.groups[0].listing = null
  const refreshed = review(); refreshed.groups[0].state = 'MATCHED'; refreshed.groups[0].listing = { id: 88, setNumber: '75446', title: 'Clean Grogu', condition: 'NEW', active: true }
  const listing = { id: 88 } as ProductListing
  vi.mocked(window.adminCategories.list).mockResolvedValue([{ id: 1, name: 'Star Wars', subtitle: null, description: null, imageUrl: null, imagePublicId: null }])
  vi.mocked(window.adminPurchases.createListing).mockResolvedValue(listing)
  vi.mocked(window.adminPurchases.resolve).mockResolvedValue(refreshed)
  render(<PurchaseReview initialReview={r} onBack={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Listing' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Create new product + listing' }))
  expect(await screen.findByLabelText('Set number')).toHaveValue('75446')
  expect(screen.getByLabelText('Title')).toHaveValue('Display model')
  expect(screen.getByLabelText('Condition')).toHaveValue('NEW')
  expect(screen.getByLabelText('Description')).toHaveValue('')
  expect(screen.getByLabelText('Theme')).toHaveValue('')
  expect(screen.queryByLabelText('Current stock')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Clean Grogu' } })
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'Star Wars' } })
  fireEvent.change(await screen.findByLabelText('Category'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Age recommendation'), { target: { value: '10+' } })
  fireEvent.change(screen.getByLabelText('Piece count'), { target: { value: '100' } })
  fireEvent.change(screen.getByLabelText('Original price'), { target: { value: '69.99' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form')!)
  await waitFor(() => expect(window.adminPurchases.createListing).toHaveBeenCalledWith(1, expect.objectContaining({ setNumber: '75446', title: 'Clean Grogu', condition: 'NEW', currentStock: 0 })))
  await waitFor(() => expect(window.adminPurchases.resolve).toHaveBeenCalledWith(1, 101, { revision: r.revision, productListingId: 88 }))
  expect(await screen.findByText('MATCHED')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Approve & Receive 3' })).toBeInTheDocument()
})
it("refresh and back remain available without importing or receiving", async () => {
  const back = vi.fn()
  render(<PurchaseReview initialReview={review()} onBack={back} />)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh review' }))
  await waitFor(() => expect(window.adminPurchases.review).toHaveBeenCalledWith(1))
  fireEvent.click(screen.getByRole('button', { name: /Purchase History/ }))
  expect(back).toHaveBeenCalled()
  expect(within(screen.getByRole('article')).getByText('MATCHED')).toBeInTheDocument()
})

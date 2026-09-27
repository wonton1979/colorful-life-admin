import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Purchases from './Purchases'
import type { Purchase, PurchaseReview as Review } from '../electron/purchase-contract.js'

const purchase: Purchase = { id: 3, sourceOrderReference: 'ORDER-1', sourceOrderDate: '2026-09-20T00:00:00.000Z', merchantName: null, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseDocuments: [] }
const supplierOptions = { canonicalSuppliers: ['LEGO', 'Amazon', 'eBay', 'B&M', "Sainsbury's"], customSupplierOption: 'Others' }
const fillMinimalPurchase = () => {
  fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
  fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Technic set' } })
  fireEvent.change(screen.getByLabelText('Unit cost (£) *'), { target: { value: '10.00' } })
}
const historyRow = (id: number, sourceOrderReference: string, importHash: string): Purchase => ({
  ...purchase,
  id,
  sourceOrderReference,
  purchaseDocuments: [{
    id: id * 10, purchaseId: id, partNumber: 1, sourceInvoiceReference: null, importHash, sourceDocumentDate: null,
    importedByUserId: 7, originalGrossMerchandiseTotal: '10.00', shippingTotal: '0.00', discountTotal: '0.00',
    finalTotalPaid: '10.00', createdAt: purchase.createdAt, updatedAt: purchase.updatedAt,
  }],
})
const reviewState = (purchase: Purchase, state: 'UNRESOLVED' | 'MATCHED'): Review => ({
  purchase,
  revision: 'a'.repeat(64),
  totalCost: '10.00',
  groups: [{ state, lines: [{ purchaseDocumentId: purchase.purchaseDocuments[0].id }] }],
} as unknown as Review)

describe('Purchases', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminPurchases = {
      getManualSupplierOptions: vi.fn().mockResolvedValue(supplierOptions),
      createManual: vi.fn().mockResolvedValue({ purchaseId: purchase.id, documentId: 4 }),
      review: vi.fn().mockResolvedValue({ purchase, revision: 'a'.repeat(64), totalCost: '0.00', groups: [] }),
      amend: vi.fn(), resolve: vi.fn(), receive: vi.fn(), searchProducts: vi.fn(), createListing: vi.fn(),
      importPdf: vi.fn().mockResolvedValue({ message: 'Purchase invoice imported successfully', importHash: 'hash' }),
      list: vi.fn().mockResolvedValue({ purchases: [purchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
      get: vi.fn().mockResolvedValue(purchase),
      purchaseAnalyticsSummary: vi.fn().mockResolvedValue({ totalQuantity: 0, totalAmount: '0.00', suppliers: [] }),
      supplierMonthlyAnalytics: vi.fn().mockResolvedValue({ supplierKey: 'unknown', supplierName: 'Unknown supplier', months: [], undatedTotalAmount: '0.00' }),
    }
  })

  it('rejects non-PDF files and imports a selected PDF', async () => {
    render(<Purchases />)
    const input = screen.getByLabelText('PDF purchase document upload').querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF')
    fireEvent.change(input, { target: { files: [new File(['%PDF-'], 'invoice.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Import purchase document' }))
    await waitFor(() => expect(window.adminPurchases.importPdf).toHaveBeenCalled())
    expect(screen.getByRole('status')).toHaveTextContent('Purchase invoice imported successfully')
  })

  it('renders history and opens purchase details', async () => {
    render(<Purchases />)
    await waitFor(() => expect(screen.getByText('ORDER-1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    await waitFor(() => expect(window.adminPurchases.review).toHaveBeenCalledWith(3))
    expect(screen.getByRole('heading', { name: 'ORDER-1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Purchase History/ }))
    expect(screen.getByText('Purchase History')).toBeInTheDocument()
  })

  it('opens and cancels the Add Purchase form without changing the existing workflow', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    expect(screen.getByRole('heading', { name: 'Add Purchase' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Add Purchase' })).not.toBeInTheDocument()
    expect(window.adminPurchases.importPdf).not.toHaveBeenCalled()
  })

  it('loads supplier options from the Electron API and does not show a fake list while loading', async () => {
    let finish!: (value: typeof supplierOptions) => void
    vi.mocked(window.adminPurchases.getManualSupplierOptions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))

    const select = screen.getByLabelText('Supplier / Retailer')
    expect(select).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Loading supplier options')
    expect(within(select).queryByRole('option', { name: 'LEGO' })).not.toBeInTheDocument()
    expect(window.adminPurchases.getManualSupplierOptions).toHaveBeenCalledTimes(1)

    finish(supplierOptions)
    expect(await screen.findByRole('option', { name: "Sainsbury's" })).toBeInTheDocument()
    expect(select).toBeEnabled()
  })

  it('shows supplier-options load failures and retries through the Electron API', async () => {
    vi.mocked(window.adminPurchases.getManualSupplierOptions)
      .mockRejectedValueOnce(new Error('Supplier options are temporarily unavailable.'))
      .mockResolvedValueOnce(supplierOptions)
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Supplier options are temporarily unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry supplier options' }))
    expect(await screen.findByRole('option', { name: 'B&M' })).toBeInTheDocument()
    expect(window.adminPurchases.getManualSupplierOptions).toHaveBeenCalledTimes(2)
  })

  it('renders only supplier choices returned by the backend', async () => {
    vi.mocked(window.adminPurchases.getManualSupplierOptions).mockResolvedValueOnce({
      canonicalSuppliers: ['Backend-provided retailer'], customSupplierOption: 'Others',
    })
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))

    const select = screen.getByLabelText('Supplier / Retailer')
    expect(await screen.findByRole('option', { name: 'Backend-provided retailer' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'LEGO' })).not.toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Others' })).toBeInTheDocument()
  })

  it('creates a purchase with pound totals and opens it in the existing Purchase Review flow', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
    await screen.findByRole('option', { name: "Sainsbury's" })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: "Sainsbury's" } })
    fireEvent.change(screen.getByLabelText('Shipping (£)'), { target: { value: '2.00' } })
    fireEvent.change(screen.getByLabelText('Discount (£)'), { target: { value: '1.50' } })
    fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Technic set' } })
    fireEvent.change(screen.getByLabelText('LEGO set number'), { target: { value: '42100' } })
    fireEvent.change(screen.getByLabelText('Quantity *'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Unit cost (£) *'), { target: { value: '10.00' } })
    expect(screen.getAllByText('£20.00')).toHaveLength(2)
    expect(screen.getByText('£20.50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    await waitFor(() => expect(window.adminPurchases.createManual).toHaveBeenCalledWith(expect.objectContaining({
      sourceOrderReference: 'ORDER-17', merchantName: "Sainsbury's", originalGrossMerchandiseTotal: '20.00',
      shippingTotal: '2.00', discountTotal: '1.50', finalTotalPaid: '20.50',
      items: [{ sourceDescription: 'Technic set', sourceSetNumber: '42100', quantity: 2, originalGrossUnitCost: '10.00', originalGrossLineTotal: '20.00' }],
    })))
    await waitFor(() => expect(window.adminPurchases.review).toHaveBeenCalledWith(3))
    expect(window.adminPurchases.list).toHaveBeenCalledTimes(2)
    expect(window.adminPurchases.receive).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'ORDER-1' })).toBeInTheDocument()
  })

  it.each(["Sainsbury's", 'eBay', 'B&M'])('submits the exact backend canonical supplier value %s', async supplier => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    await screen.findByRole('option', { name: supplier })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: supplier } })
    fillMinimalPurchase()
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))

    await waitFor(() => expect(window.adminPurchases.createManual).toHaveBeenCalledWith(expect.objectContaining({ merchantName: supplier })))
  })

  it('requires a meaningful custom supplier and submits its trimmed value rather than Others', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    await screen.findByRole('option', { name: 'Others' })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: 'Others' } })
    expect(screen.getByLabelText('Other supplier / retailer')).toBeInTheDocument()
    fillMinimalPurchase()
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the other supplier / retailer name')
    expect(window.adminPurchases.createManual).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Other supplier / retailer'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the other supplier / retailer name')
    expect(window.adminPurchases.createManual).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Other supplier / retailer'), { target: { value: '  Local Toy Shop  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    await waitFor(() => expect(window.adminPurchases.createManual).toHaveBeenCalledWith(expect.objectContaining({ merchantName: 'Local Toy Shop' })))
    expect(vi.mocked(window.adminPurchases.createManual).mock.calls[0][0].merchantName).not.toBe('Others')
  })

  it('discards stale custom supplier text when switching back to a predefined supplier', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    await screen.findByRole('option', { name: 'Others' })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: 'Others' } })
    fireEvent.change(screen.getByLabelText('Other supplier / retailer'), { target: { value: 'Local Toy Shop' } })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: 'LEGO' } })
    expect(screen.queryByLabelText('Other supplier / retailer')).not.toBeInTheDocument()
    fillMinimalPurchase()
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))

    await waitFor(() => expect(window.adminPurchases.createManual).toHaveBeenCalledWith(expect.objectContaining({ merchantName: 'LEGO' })))
    expect(vi.mocked(window.adminPurchases.createManual).mock.calls[0][0].merchantName).not.toBe('Local Toy Shop')
  })

  it('preserves optional no-supplier submission by omitting merchantName', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    await screen.findByRole('option', { name: 'B&M' })
    fillMinimalPurchase()
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))

    await waitFor(() => expect(window.adminPurchases.createManual).toHaveBeenCalledTimes(1))
    expect(vi.mocked(window.adminPurchases.createManual).mock.calls[0][0]).not.toHaveProperty('merchantName')
  })

  it('supports adding and removing purchase item rows', () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }))
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument()
    expect(screen.getByText('Item 1')).toBeInTheDocument()
  })

  it('validates required purchase data and positive integer quantities', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Purchase reference is required')
    expect(window.adminPurchases.createManual).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
    fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Set' } })
    fireEvent.change(screen.getByLabelText('Quantity *'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Unit cost (£) *'), { target: { value: '4.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    expect(screen.getByRole('alert')).toHaveTextContent('positive whole number')
    expect(window.adminPurchases.createManual).not.toHaveBeenCalled()
  })

  it('prevents duplicate submission while a manual purchase request is pending', async () => {
    let finish!: (value: { purchaseId: number; documentId: number }) => void
    vi.mocked(window.adminPurchases.createManual).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
    fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Set' } })
    fireEvent.change(screen.getByLabelText('Unit cost (£) *'), { target: { value: '4.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    const pendingButton = screen.getByRole('button', { name: 'Creating purchase…' })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelButton).toBeDisabled()
    expect(cancelButton).not.toHaveAttribute('aria-busy', 'true')
    expect(window.adminPurchases.createManual).toHaveBeenCalledTimes(1)
    finish({ purchaseId: 3, documentId: 4 })
    await waitFor(() => expect(window.adminPurchases.review).toHaveBeenCalledWith(3))
  })

  it('shows backend creation errors to the user', async () => {
    vi.mocked(window.adminPurchases.createManual).mockRejectedValueOnce(new Error('Purchase reference already exists.'))
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
    fireEvent.change(screen.getByLabelText('Description *'), { target: { value: 'Set' } })
    fireEvent.change(screen.getByLabelText('Unit cost (£) *'), { target: { value: '4.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create purchase' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Purchase reference already exists.'))
  })

  it('opens Purchase Analytics from Purchases and returns to purchase history', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Purchase Analytics' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Purchase Summary' })).toBeInTheDocument())
    expect(window.adminPurchases.purchaseAnalyticsSummary).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Purchases' }))
    expect(screen.getByRole('heading', { name: 'Purchases' })).toBeInTheDocument()
  })

  it('shows review-state status for unresolved purchases from either origin and preserves order and View details', async () => {
    const unresolvedPdf = historyRow(9, 'PDF-UNRESOLVED', 'pdf-hash-9')
    const unresolvedManual = historyRow(6724838930, '6724838930', 'manual:manual-hash-6724838930')
    const resolvedPdf = historyRow(7, 'PDF-RESOLVED', 'pdf-hash-7')
    const resolvedManual = historyRow(5, 'MANUAL-RESOLVED', 'manual:manual-hash-5')
    vi.mocked(window.adminPurchases.list).mockResolvedValueOnce({
      purchases: [unresolvedPdf, unresolvedManual, resolvedPdf, resolvedManual],
      pagination: { page: 1, limit: 20, total: 4, totalPages: 1 },
    })
    const reviewByPurchaseId = new Map([
      [unresolvedPdf.id, reviewState(unresolvedPdf, 'UNRESOLVED')],
      [unresolvedManual.id, reviewState(unresolvedManual, 'UNRESOLVED')],
      [resolvedPdf.id, reviewState(resolvedPdf, 'MATCHED')],
      [resolvedManual.id, reviewState(resolvedManual, 'MATCHED')],
    ])
    vi.mocked(window.adminPurchases.review).mockImplementation(async (purchaseId) => reviewByPurchaseId.get(purchaseId)!)

    render(<Purchases />)
    expect(await screen.findAllByText('WAITING FOR REVIEW')).toHaveLength(2)
    const rows = screen.getAllByRole('article')
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'PDF-UNRESOLVED', '6724838930', 'PDF-RESOLVED', 'MANUAL-RESOLVED',
    ])
    expect(within(rows[0]).getByText('PDF-UNRESOLVED').parentElement).toHaveClass('purchase-row-reference')
    expect(within(rows[0]).getByText('WAITING FOR REVIEW')).toHaveClass('purchase-review-status')
    expect(within(rows[0]).getByText('20 Sept 2026 · 1 document')).toBeInTheDocument()
    expect(within(rows[1]).getByText('WAITING FOR REVIEW')).toHaveClass('purchase-review-status')
    expect(within(rows[2]).queryByText('WAITING FOR REVIEW')).not.toBeInTheDocument()
    expect(within(rows[3]).queryByText('WAITING FOR REVIEW')).not.toBeInTheDocument()
    expect(window.adminPurchases.review).toHaveBeenCalledWith(9)
    expect(window.adminPurchases.review).toHaveBeenCalledWith(6724838930)
    expect(window.adminPurchases.review).toHaveBeenCalledWith(7)
    expect(window.adminPurchases.review).toHaveBeenCalledWith(5)

    const detailReview: Review = { purchase, revision: 'b'.repeat(64), totalCost: '0.00', groups: [] }
    vi.mocked(window.adminPurchases.review).mockResolvedValueOnce(detailReview)
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'View details' }))
    expect(await screen.findByRole('heading', { name: 'ORDER-1' })).toBeInTheDocument()
    expect(window.adminPurchases.review).toHaveBeenLastCalledWith(9)
  })
})

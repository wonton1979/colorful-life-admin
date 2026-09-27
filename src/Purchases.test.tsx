import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Purchases from './Purchases'
import type { Purchase, PurchaseReview as Review } from '../electron/purchase-contract.js'

const purchase: Purchase = { id: 3, sourceOrderReference: 'ORDER-1', sourceOrderDate: '2026-09-20T00:00:00.000Z', merchantName: null, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseDocuments: [] }
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
    window.adminPurchases = { createManual: vi.fn().mockResolvedValue({ purchaseId: purchase.id, documentId: 4 }), review: vi.fn().mockResolvedValue({ purchase, revision: 'a'.repeat(64), totalCost: '0.00', groups: [] }), amend: vi.fn(), resolve: vi.fn(), receive: vi.fn(), searchProducts: vi.fn(), createListing: vi.fn(), importPdf: vi.fn().mockResolvedValue({ message: 'Purchase invoice imported successfully', importHash: 'hash' }), list: vi.fn().mockResolvedValue({ purchases: [purchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), get: vi.fn().mockResolvedValue(purchase), purchaseAnalyticsSummary: vi.fn().mockResolvedValue({ totalQuantity: 0, totalAmount: '0.00', suppliers: [] }), supplierMonthlyAnalytics: vi.fn().mockResolvedValue({ supplierKey: 'unknown', supplierName: 'Unknown supplier', months: [], undatedTotalAmount: '0.00' }) }
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

  it('creates a purchase with pound totals and opens it in the existing Purchase Review flow', async () => {
    render(<Purchases />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Purchase' }))
    fireEvent.change(screen.getByLabelText('Purchase reference *'), { target: { value: 'ORDER-17' } })
    fireEvent.change(screen.getByLabelText('Supplier / Retailer'), { target: { value: 'Example Retailer' } })
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
      sourceOrderReference: 'ORDER-17', merchantName: 'Example Retailer', originalGrossMerchandiseTotal: '20.00',
      shippingTotal: '2.00', discountTotal: '1.50', finalTotalPaid: '20.50',
      items: [{ sourceDescription: 'Technic set', sourceSetNumber: '42100', quantity: 2, originalGrossUnitCost: '10.00', originalGrossLineTotal: '20.00' }],
    })))
    await waitFor(() => expect(window.adminPurchases.review).toHaveBeenCalledWith(3))
    expect(window.adminPurchases.list).toHaveBeenCalledTimes(2)
    expect(window.adminPurchases.receive).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'ORDER-1' })).toBeInTheDocument()
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

  it('marks only unresolved imported purchases, keeps API order, and preserves View details', async () => {
    const unresolvedPdf = historyRow(9, 'PDF-UNRESOLVED', 'pdf-hash-9')
    const resolvedPdf = historyRow(7, 'PDF-RESOLVED', 'pdf-hash-7')
    const unresolvedManual = historyRow(5, 'MANUAL-UNRESOLVED', 'manual:manual-hash-5')
    vi.mocked(window.adminPurchases.list).mockResolvedValueOnce({
      purchases: [unresolvedPdf, resolvedPdf, unresolvedManual],
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    })
    vi.mocked(window.adminPurchases.review).mockImplementation(async (purchaseId) => purchaseId === 9
      ? reviewState(unresolvedPdf, 'UNRESOLVED')
      : reviewState(resolvedPdf, 'MATCHED'))

    render(<Purchases />)
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument()
    const rows = screen.getAllByRole('article')
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'PDF-UNRESOLVED', 'PDF-RESOLVED', 'MANUAL-UNRESOLVED',
    ])
    expect(rows[0]).toHaveTextContent('20 Sept 2026 · 1 document · Waiting for review')
    expect(within(rows[0]).getByText('Waiting for review')).toHaveClass('purchase-review-status')
    expect(within(rows[1]).queryByText('Waiting for review')).not.toBeInTheDocument()
    expect(within(rows[2]).queryByText('Waiting for review')).not.toBeInTheDocument()
    expect(window.adminPurchases.review).toHaveBeenCalledWith(9)
    expect(window.adminPurchases.review).toHaveBeenCalledWith(7)
    expect(window.adminPurchases.review).not.toHaveBeenCalledWith(5)

    const detailReview: Review = { purchase, revision: 'b'.repeat(64), totalCost: '0.00', groups: [] }
    vi.mocked(window.adminPurchases.review).mockResolvedValueOnce(detailReview)
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'View details' }))
    expect(await screen.findByRole('heading', { name: 'ORDER-1' })).toBeInTheDocument()
    expect(window.adminPurchases.review).toHaveBeenLastCalledWith(9)
  })
})

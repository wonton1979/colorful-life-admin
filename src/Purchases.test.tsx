import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Purchases from './Purchases'

const purchase = { id: 3, sourceOrderReference: 'ORDER-1', sourceOrderDate: '2026-09-20T00:00:00.000Z', merchantName: null, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseDocuments: [] }

describe('Purchases', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminPurchases = { createManual: vi.fn().mockResolvedValue({ purchaseId: purchase.id, documentId: 4 }), review: vi.fn().mockResolvedValue({ purchase, revision: 'a'.repeat(64), totalCost: '0.00', groups: [] }), amend: vi.fn(), resolve: vi.fn(), receive: vi.fn(), searchProducts: vi.fn(), createListing: vi.fn(), importPdf: vi.fn().mockResolvedValue({ message: 'Purchase invoice imported successfully', importHash: 'hash' }), list: vi.fn().mockResolvedValue({ purchases: [purchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), get: vi.fn().mockResolvedValue(purchase) }
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
    expect(screen.getByRole('button', { name: 'Creating purchase…' })).toBeDisabled()
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
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Purchases from './Purchases'

const purchase = { id: 3, sourceOrderReference: 'ORDER-1', sourceOrderDate: '2026-09-20T00:00:00.000Z', merchantName: null, createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', purchaseDocuments: [] }

describe('Purchases', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminPurchases = { review: vi.fn().mockResolvedValue({ purchase, revision: 'a'.repeat(64), totalCost: '0.00', groups: [] }), amend: vi.fn(), resolve: vi.fn(), receive: vi.fn(), searchProducts: vi.fn(), createListing: vi.fn(), importPdf: vi.fn().mockResolvedValue({ message: 'Purchase invoice imported successfully', importHash: 'hash' }), list: vi.fn().mockResolvedValue({ purchases: [purchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), get: vi.fn().mockResolvedValue(purchase) }
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
})

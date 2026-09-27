import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPurchasesApi, PurchaseAnalyticsSummary, SupplierMonthlyPurchaseAnalytics } from '../electron/purchase-contract.js'
import PurchaseAnalytics from './PurchaseAnalytics'

const summary: PurchaseAnalyticsSummary = {
  totalQuantity: 1250,
  totalAmount: '18420.50',
  suppliers: [
    { supplierKey: 'supplier-acme', supplierName: 'Acme Supplier', totalAmount: '8250.25' },
    { supplierKey: 'unknown', supplierName: 'Unknown supplier', totalAmount: '450.00' },
  ],
}

const monthly: SupplierMonthlyPurchaseAnalytics = {
  supplierKey: 'supplier-acme',
  supplierName: 'Acme Supplier',
  months: [
    { month: '2026-09', totalAmount: '1820.40' },
    { month: '2026-08', totalAmount: '2130.00' },
  ],
  undatedTotalAmount: '123.45',
}

const analyticsApi = () => window.adminPurchases as unknown as Pick<AdminPurchasesApi, 'purchaseAnalyticsSummary' | 'supplierMonthlyAnalytics'>

describe('Purchase Analytics', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminPurchases = {
      getManualSupplierOptions: vi.fn(),
      purchaseAnalyticsSummary: vi.fn().mockResolvedValue(summary),
      supplierMonthlyAnalytics: vi.fn().mockResolvedValue(monthly),
    } as unknown as AdminPurchasesApi
  })

  it('shows the backend-provided historical quantity, GBP totals, suppliers and Unknown supplier', async () => {
    render(<PurchaseAnalytics onBack={vi.fn()} />)

    expect(await screen.findByText('1,250 items')).toBeInTheDocument()
    expect(screen.getByText('Gross historical purchases, not current stock.')).toBeInTheDocument()
    expect(screen.getByText('£18,420.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Acme Supplier.*£8,250.25/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unknown supplier.*£450.00/ })).toBeInTheDocument()
  })

  it('shows a loading state and does not show stale summary data during a retry', async () => {
    let finish!: (value: PurchaseAnalyticsSummary) => void
    vi.mocked(analyticsApi().purchaseAnalyticsSummary).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading purchase summary')
    expect(screen.queryByText('£18,420.50')).not.toBeInTheDocument()
    await waitFor(() => expect(analyticsApi().purchaseAnalyticsSummary).toHaveBeenCalledTimes(1))
    finish(summary)
    expect(await screen.findByText('£18,420.50')).toBeInTheDocument()
  })

  it('shows a useful empty state when the backend reports no purchase history', async () => {
    vi.mocked(analyticsApi().purchaseAnalyticsSummary).mockResolvedValueOnce({ totalQuantity: 0, totalAmount: '0.00', suppliers: [] })
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    expect(await screen.findByText('There is no purchase history to summarise yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows summary failures and allows retrying', async () => {
    vi.mocked(analyticsApi().purchaseAnalyticsSummary)
      .mockRejectedValueOnce(new Error('The Colorful Life service is unavailable right now.'))
      .mockResolvedValueOnce(summary)
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The Colorful Life service is unavailable right now.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('£18,420.50')).toBeInTheDocument()
  })

  it('uses supplierKey, presents readable newest-first months, and includes undated spend', async () => {
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ }))

    await waitFor(() => expect(analyticsApi().supplierMonthlyAnalytics).toHaveBeenCalledWith('supplier-acme'))
    expect(await screen.findByRole('heading', { name: 'Acme Supplier', level: 2 })).toBeInTheDocument()
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['September 2026£1,820.40', 'August 2026£2,130.00'])
    expect(screen.getByText('Undated purchases')).toBeInTheDocument()
    expect(screen.getByText('£123.45')).toBeInTheDocument()
  })

  it('shows an undated-only supplier and omits a zero undated amount', async () => {
    vi.mocked(analyticsApi().supplierMonthlyAnalytics).mockResolvedValueOnce({
      supplierKey: 'unknown', supplierName: 'Unknown supplier', months: [], undatedTotalAmount: '23.00',
    })
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Unknown supplier.*£450.00/ }))
    expect(await screen.findByText('No dated monthly purchases are available for this supplier.')).toBeInTheDocument()
    expect(screen.getByText('Undated purchases')).toBeInTheDocument()
    expect(screen.getByText('£23.00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Purchase Summary' }))
    vi.mocked(analyticsApi().supplierMonthlyAnalytics).mockResolvedValueOnce({ ...monthly, undatedTotalAmount: '0.00' })
    fireEvent.click(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ }))
    await screen.findByText('August 2026')
    expect(screen.queryByText('Undated purchases')).not.toBeInTheDocument()
  })

  it('shows a clear empty monthly state without inventing months or zero undated spend', async () => {
    vi.mocked(analyticsApi().supplierMonthlyAnalytics).mockResolvedValueOnce({
      supplierKey: 'supplier-acme', supplierName: 'Acme Supplier', months: [], undatedTotalAmount: '0.00',
    })
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ }))
    expect(await screen.findByText('No dated monthly purchases are available for this supplier.')).toBeInTheDocument()
    expect(screen.queryByText('Undated purchases')).not.toBeInTheDocument()
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument()
  })

  it('does not leave one supplier month data visible while a new supplier request is loading', async () => {
    let finish!: (value: SupplierMonthlyPurchaseAnalytics) => void
    vi.mocked(analyticsApi().supplierMonthlyAnalytics)
      .mockResolvedValueOnce(monthly)
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ }))
    expect(await screen.findByText('September 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Purchase Summary' }))
    fireEvent.click(await screen.findByRole('button', { name: /Unknown supplier.*£450.00/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading monthly totals')
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Purchase Summary' }))
    finish({ supplierKey: 'unknown', supplierName: 'Unknown supplier', months: [], undatedTotalAmount: '0.00' })
    expect(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ })).toBeInTheDocument()
    expect(screen.queryByText('No dated monthly purchases are available for this supplier.')).not.toBeInTheDocument()
  })

  it('prevents repeated supplier selection from issuing duplicate monthly requests', async () => {
    let finish!: (value: SupplierMonthlyPurchaseAnalytics) => void
    vi.mocked(analyticsApi().supplierMonthlyAnalytics).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    const supplierButton = await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ })
    fireEvent.click(supplierButton)
    await waitFor(() => expect(analyticsApi().supplierMonthlyAnalytics).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('Loading monthly totals')
    fireEvent.click(supplierButton)
    expect(analyticsApi().supplierMonthlyAnalytics).toHaveBeenCalledTimes(1)
    finish(monthly)
  })

  it('shows monthly request errors and the Back action returns to the summary', async () => {
    vi.mocked(analyticsApi().supplierMonthlyAnalytics).mockRejectedValueOnce(Object.assign(
      new Error('This supplier is no longer available in purchase analytics.'),
      { backendCode: 'PURCHASE_ANALYTICS_SUPPLIER_NOT_FOUND' },
    ))
    render(<PurchaseAnalytics onBack={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Acme Supplier.*£8,250.25/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This supplier is no longer available in purchase analytics.')
    fireEvent.click(screen.getByRole('button', { name: 'Back to Purchase Summary' }))
    expect(await screen.findByText('£18,420.50')).toBeInTheDocument()
  })
})

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PurchaseAnalyticsSummary, SupplierMonthlyPurchaseAnalytics } from '../electron/purchase-contract.js'
import { adminPurchases } from './admin-api'

interface PurchaseAnalyticsProps {
  onBack: () => void
}

interface SelectedSupplier {
  supplierKey: string
  supplierName: string
}

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const formatMoney = (amount: string) => currency.format(Number(amount))
const formatMonth = (month: string) => new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${month}-01T00:00:00.000Z`))
const isZeroAmount = (amount: string) => /^0(?:\.0+)?$/.test(amount)
const messageFor = (error: unknown) => error instanceof Error ? error.message : 'Purchase analytics could not be retrieved.'

function PurchaseAnalytics({ onBack }: PurchaseAnalyticsProps) {
  const [summary, setSummary] = useState<PurchaseAnalyticsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<SelectedSupplier | null>(null)
  const [monthly, setMonthly] = useState<SupplierMonthlyPurchaseAnalytics | null>(null)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthlyError, setMonthlyError] = useState('')
  const summaryRequest = useRef(0)
  const monthlyRequest = useRef(0)
  const monthlyPending = useRef(false)

  const loadSummary = useCallback(async () => {
    const request = ++summaryRequest.current
    setSummary(null)
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const result = await adminPurchases.purchaseAnalyticsSummary()
      if (summaryRequest.current === request) setSummary(result)
    } catch (error) {
      if (summaryRequest.current === request) setSummaryError(messageFor(error))
    } finally {
      if (summaryRequest.current === request) setSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadSummary)
    return () => {
      summaryRequest.current += 1
      monthlyRequest.current += 1
    }
  }, [loadSummary])

  const openSupplier = (supplier: SelectedSupplier) => {
    if (monthlyPending.current) return
    const request = ++monthlyRequest.current
    monthlyPending.current = true
    setSelectedSupplier(supplier)
    setMonthly(null)
    setMonthlyError('')
    setMonthlyLoading(true)
    void adminPurchases.supplierMonthlyAnalytics(supplier.supplierKey).then(
      (result) => {
        if (monthlyRequest.current === request) setMonthly(result)
      },
      (error: unknown) => {
        if (monthlyRequest.current === request) setMonthlyError(messageFor(error))
      },
    ).finally(() => {
      if (monthlyRequest.current === request) {
        monthlyPending.current = false
        setMonthlyLoading(false)
      }
    })
  }

  const backToSummary = () => {
    monthlyRequest.current += 1
    monthlyPending.current = false
    setSelectedSupplier(null)
    setMonthly(null)
    setMonthlyError('')
    setMonthlyLoading(false)
  }

  const noPurchaseHistory = summary !== null && summary.totalQuantity === 0 && summary.totalAmount === '0.00' && summary.suppliers.length === 0
  const showUndated = monthly !== null && !isZeroAmount(monthly.undatedTotalAmount)

  return (
    <section className="purchases-workspace purchase-analytics-workspace" aria-labelledby="purchase-analytics-title">
      <div className="purchases-heading">
        <div>
          <p className="eyebrow">PURCHASE ANALYTICS</p>
          <h2 id="purchase-analytics-title">{selectedSupplier ? monthly?.supplierName ?? selectedSupplier.supplierName : 'Purchase Summary'}</h2>
        </div>
        {selectedSupplier
          ? <button className="button button-secondary" type="button" onClick={backToSummary}>Back to Purchase Summary</button>
          : <button className="button button-secondary" type="button" onClick={onBack}>Back to Purchases</button>}
      </div>

      {!selectedSupplier && <>
        {summaryLoading && <p className="status-message" role="status" aria-busy="true">Loading purchase summary…</p>}
        {!summaryLoading && summaryError && <div className="purchase-analytics-state">
          <p className="error-message" role="alert">{summaryError}</p>
          <button className="button button-secondary" type="button" onClick={() => void loadSummary()} disabled={summaryLoading}>Try again</button>
        </div>}
        {!summaryLoading && !summaryError && summary && <>
          <div className="purchase-analytics-totals">
            <article className="purchase-analytics-total">
              <p>Total purchased quantity</p>
              <strong>{summary.totalQuantity.toLocaleString('en-GB')} {summary.totalQuantity === 1 ? 'item' : 'items'}</strong>
              <span>Gross historical purchases, not current stock.</span>
            </article>
            <article className="purchase-analytics-total">
              <p>Total purchase spend</p>
              <strong>{formatMoney(summary.totalAmount)}</strong>
            </article>
          </div>
          <section className="purchase-history-card purchase-analytics-suppliers" aria-labelledby="supplier-spend-title">
            <div className="product-panel-heading"><div><p className="eyebrow">SUPPLIERS</p><h3 id="supplier-spend-title">Spend by supplier</h3></div></div>
            {noPurchaseHistory
              ? <p className="status-message">There is no purchase history to summarise yet.</p>
              : summary.suppliers.length === 0
                ? <p className="status-message">No supplier totals are available.</p>
                : <ul className="supplier-analytics-list">{summary.suppliers.map((supplier) => <li key={supplier.supplierKey}>
                  <button className="supplier-analytics-row" type="button" onClick={() => openSupplier(supplier)} disabled={monthlyLoading}>
                    <span>{supplier.supplierName}</span><strong>{formatMoney(supplier.totalAmount)}</strong>
                  </button>
                </li>)}</ul>}
          </section>
        </>}
      </>}

      {selectedSupplier && <section className="purchase-history-card supplier-monthly-card" aria-labelledby="supplier-monthly-title" aria-busy={monthlyLoading}>
        <div className="product-panel-heading"><div><p className="eyebrow">MONTHLY PURCHASE SPEND</p><h3 id="supplier-monthly-title">{monthly?.supplierName ?? selectedSupplier.supplierName}</h3></div></div>
        {monthlyLoading && <p className="status-message" role="status">Loading monthly totals…</p>}
        {!monthlyLoading && monthlyError && <div className="purchase-analytics-state">
          <p className="error-message" role="alert">{monthlyError}</p>
          <button className="button button-secondary" type="button" onClick={() => openSupplier(selectedSupplier)}>Try again</button>
        </div>}
        {!monthlyLoading && !monthlyError && monthly && <>
          {monthly.months.length > 0
            ? <ul className="supplier-monthly-list">{monthly.months.map((row) => <li key={row.month}><span>{formatMonth(row.month)}</span><strong>{formatMoney(row.totalAmount)}</strong></li>)}</ul>
            : <p className="status-message">No dated monthly purchases are available for this supplier.</p>}
          {showUndated && <div className="supplier-undated-total"><span>Undated purchases</span><strong>{formatMoney(monthly.undatedTotalAmount)}</strong></div>}
        </>}
      </section>}
    </section>
  )
}

export default PurchaseAnalytics

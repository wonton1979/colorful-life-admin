import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import PurchaseReview from './PurchaseReview'
import PurchaseAnalytics from './PurchaseAnalytics'
import ManualPurchaseForm from './ManualPurchaseForm'
import type { ManualPurchaseInput, Purchase, PurchaseImportResult, PurchaseReview as Review } from '../electron/purchase-contract.js'
import { adminPurchases } from './admin-api'

const maximumPdfBytes = 10 * 1024 * 1024
const pageSize = 20

const messageFor = (error: unknown): string => error instanceof Error ? error.message : 'The purchase operation could not be completed.'
const formatDate = (value: string | null): string => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value)) : 'Date not provided'
const hasItemsWaitingForReview = (review: Review): boolean =>
  review.groups.some((group) => group.state === 'UNRESOLVED' && group.lines.length > 0)

function Purchases() {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<PurchaseImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [selectedPurchase, setSelectedPurchase] = useState<Review | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [openingPurchaseId, setOpeningPurchaseId] = useState<number | null>(null)
  const [detailsError, setDetailsError] = useState('')
  const [manualPurchaseOpen, setManualPurchaseOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [purchasesWaitingForReview, setPurchasesWaitingForReview] = useState<Set<number>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRequest = useRef(0)
  const reviewRequests = useRef(new Map<number, Promise<Review>>())

  const requestReview = (purchaseId: number): Promise<Review> => {
    const existingRequest = reviewRequests.current.get(purchaseId)
    if (existingRequest) return existingRequest
    const request = adminPurchases.review(purchaseId)
    reviewRequests.current.set(purchaseId, request)
    const clearRequest = () => {
      if (reviewRequests.current.get(purchaseId) === request) reviewRequests.current.delete(purchaseId)
    }
    void request.then(clearRequest, clearRequest)
    return request
  }

  const loadHistory = useCallback(async (nextPage: number) => {
    const request = ++historyRequest.current
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const result = await adminPurchases.list(nextPage, pageSize)
      if (historyRequest.current !== request) return
      setPurchases(result.purchases)
      setPurchasesWaitingForReview(new Set())
      setPage(result.pagination.page)
      setTotalPages(Math.max(1, result.pagination.totalPages))
      void Promise.all(result.purchases.map(async (purchase) => {
        try {
          return { purchaseId: purchase.id, waiting: hasItemsWaitingForReview(await requestReview(purchase.id)) }
        } catch {
          return null
        }
      })).then((reviewStates) => {
        if (historyRequest.current !== request) return
        setPurchasesWaitingForReview(new Set(reviewStates.flatMap((state) => state?.waiting ? [state.purchaseId] : [])))
      })
    } catch (error) {
      if (historyRequest.current === request) setHistoryError(messageFor(error))
    } finally {
      if (historyRequest.current === request) setHistoryLoading(false)
    }
  }, [])

  // Initialising the remote-backed history is the purpose of this effect.
  useEffect(() => {
    void Promise.resolve().then(() => loadHistory(1))
    return () => { historyRequest.current += 1 }
  }, [loadHistory])

  const chooseFile = (candidate: File | undefined) => {
    setImportResult(null)
    setImportError('')
    if (!candidate) return
    if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) {
      setFile(null)
      setImportError('Choose a PDF purchase document.')
      return
    }
    if (candidate.size > maximumPdfBytes) {
      setFile(null)
      setImportError('The PDF must be no larger than 10 MB.')
      return
    }
    setFile(candidate)
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { chooseFile(event.target.files?.[0]); event.target.value = '' }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]) }

  const importDocument = async () => {
    if (!file || importing) return
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const result = await adminPurchases.importPdf({ bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, mimeType: 'application/pdf' })
      setImportResult(result)
      setFile(null)
      await loadHistory(1)
    } catch (error) {
      setImportError(messageFor(error))
    } finally {
      setImporting(false)
    }
  }

  const openDetails = async (purchaseId: number) => {
    setDetailsLoading(true)
    setOpeningPurchaseId(purchaseId)
    setDetailsError('')
    try {
      const review = await requestReview(purchaseId)
      setPurchasesWaitingForReview((current) => {
        const next = new Set(current)
        if (hasItemsWaitingForReview(review)) next.add(purchaseId)
        else next.delete(purchaseId)
        return next
      })
      setSelectedPurchase(review)
    } catch (error) {
      setDetailsError(messageFor(error))
    } finally {
      setDetailsLoading(false)
      setOpeningPurchaseId(null)
    }
  }

  const createManualPurchase = async (input: ManualPurchaseInput) => {
    const created = await adminPurchases.createManual(input)
    setManualPurchaseOpen(false)
    await loadHistory(1)
    await openDetails(created.purchaseId)
  }

  if (selectedPurchase) return <PurchaseReview initialReview={selectedPurchase} onBack={() => { setSelectedPurchase(null); void loadHistory(page) }} />
  if (analyticsOpen) return <PurchaseAnalytics onBack={() => setAnalyticsOpen(false)} />

  return (
    <section className="purchases-workspace" aria-labelledby="purchases-title">
      <div className="purchases-heading"><div><p className="eyebrow">OPERATIONS</p><h2 id="purchases-title">Purchases</h2></div><div className="purchase-heading-actions"><button className="button button-primary" type="button" onClick={() => { setManualPurchaseOpen(true) }}>Add Purchase</button><button className="button button-secondary" type="button" onClick={() => setAnalyticsOpen(true)}>Purchase Analytics</button><button className="button button-secondary" type="button" onClick={() => void loadHistory(page)} disabled={historyLoading} aria-busy={historyLoading}>{historyLoading ? 'Loading…' : 'Refresh history'}</button></div></div>
      {manualPurchaseOpen && <ManualPurchaseForm onCancel={() => setManualPurchaseOpen(false)} onCreate={createManualPurchase} />}
      <div className="purchase-import-card">
        <p className="eyebrow">PURCHASE IMPORT</p><h3>Import Purchase Document</h3><p className="panel-intro">Upload a purchase document in PDF format. It will be checked and recorded securely.</p>
        <div className="pdf-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop} role="group" aria-label="PDF purchase document upload">
          <strong>{file ? file.name : 'Choose a PDF or drop it here'}</strong><span>PDF only · maximum 10 MB</span>
          <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()} disabled={importing}>{file ? 'Change PDF' : 'Choose PDF'}</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={onFileChange} />
        </div>
        {file && <div className="selected-file"><span>{file.name}</span><button type="button" onClick={() => setFile(null)} disabled={importing}>Clear</button></div>}
        {importError && <p className="error-message" role="alert">{importError}</p>}
        {importResult && <p className="success-message" role="status">{importResult.message}</p>}
        <button className="button button-primary" type="button" onClick={() => void importDocument()} disabled={!file || importing} aria-busy={importing}>{importing ? 'Importing…' : 'Import purchase document'}</button>
      </div>
      <div className="purchase-history-card" aria-busy={historyLoading || detailsLoading}>
        <div className="product-panel-heading"><div><p className="eyebrow">HISTORY</p><h3>Purchase History</h3></div><span className="history-count">{historyLoading ? '' : `${purchases.length} shown`}</span></div>
        {historyError && <p className="error-message" role="alert">{historyError}</p>}
        {detailsError && <p className="error-message" role="alert">{detailsError}</p>}
        {historyLoading && <p className="status-message">Loading purchase history…</p>}
        {!historyLoading && !historyError && purchases.length === 0 && <p className="status-message">No purchase documents have been imported yet.</p>}
        {!historyLoading && purchases.length > 0 && <div className="purchase-list">{purchases.map((purchase) => <article className="purchase-row" key={purchase.id}><div><div className="purchase-row-reference"><strong>{purchase.sourceOrderReference}</strong>{purchasesWaitingForReview.has(purchase.id) && <span className="purchase-review-status">WAITING FOR REVIEW</span>}</div><span>{formatDate(purchase.sourceOrderDate)} · {purchase.purchaseDocuments.length} document{purchase.purchaseDocuments.length === 1 ? '' : 's'}</span></div><button className="button button-secondary" type="button" onClick={() => void openDetails(purchase.id)} disabled={detailsLoading} aria-busy={openingPurchaseId === purchase.id}>{openingPurchaseId === purchase.id ? 'Opening…' : 'View details'}</button></article>)}</div>}
        {totalPages > 1 && <nav className="purchase-pagination" aria-label="Purchase history pages"><button className="button button-secondary" type="button" onClick={() => void loadHistory(page - 1)} disabled={page <= 1 || historyLoading}>Previous</button><span>Page {page} of {totalPages}</span><button className="button button-secondary" type="button" onClick={() => void loadHistory(page + 1)} disabled={page >= totalPages || historyLoading}>Next</button></nav>}
      </div>
    </section>
  )
}

export default Purchases

import { useRef, useState } from 'react'
import type { PurchaseReview as Review, ReviewGroup, ReviewLine, ReviewProduct, PurchaseAmendment } from '../electron/purchase-contract'
import type { ProductListing } from '../electron/product-contract'
import AddProduct from './AddProduct'
import './PurchaseReview.css'

const money = (v: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(v))
const date = (v: string | null) => v ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(v)) : 'Date not provided'
const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Purchase review could not be completed.'
const listingMatches = (listings: ProductListing[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return listings
  return listings.filter(listing => `${listing.legoProduct.setNumber} ${listing.legoProduct.title}`.toLowerCase().includes(normalizedQuery))
}

export default function PurchaseReview({ initialReview, onBack }: { initialReview: Review; onBack: () => void }) {
  const [review, setReview] = useState(initialReview)
  const [panel, setPanel] = useState<{ id: number; kind: 'amend' | 'resolve' } | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [listings, setListings] = useState<ProductListing[]>([])
  const [loadedListings, setLoadedListings] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedListing, setSelectedListing] = useState('')
  const [products, setProducts] = useState<ReviewProduct[]>([])
  const [searchedProducts, setSearchedProducts] = useState(false)
  const [creation, setCreation] = useState<{
    purchaseId: number
    groupId: number
    revision: string
    sourceSetNumber: string | null
    sourceDescription: string
    existingProduct?: ReviewProduct
  } | null>(null)
  const purchaseId = review.purchase.id

  const mutate = async (action: () => Promise<Review>, message: string) => {
    if (busy.current) return false
    busy.current = true; setPending(true); setError(''); setFeedback('')
    try {
      setReview(await action()); setPanel(null); setFeedback(message)
      return true
    } catch (e) { setError(errorMessage(e)); return false }
    finally { busy.current = false; setPending(false) }
  }
  const openResolution = async (group: ReviewGroup) => {
    if (busy.current) return
    const initialQuery = group.listing ? '' : group.sourceSetNumber ?? ''
    setPanel({ id: group.id, kind: 'resolve' }); setSelectedListing(group.listing ? String(group.listing.id) : '')
    setQuery(initialQuery); setProducts([]); setSearchedProducts(false); setError(''); setLoadedListings(false)
    busy.current = true; setPending(true)
    try {
      const nextListings = await window.adminProducts.listProducts()
      setListings(nextListings); setLoadedListings(true)
      if (!group.listing && initialQuery) {
        const matches = listingMatches(nextListings, initialQuery).filter(listing => listing.legoProduct.setNumber.trim().toLowerCase() === initialQuery.trim().toLowerCase())
        if (matches.length === 1) setSelectedListing(String(matches[0].id))
      }
    }
    catch (e) { setError(errorMessage(e)) }
    finally { busy.current = false; setPending(false) }
  }
  const searchProducts = async () => {
    if (busy.current || !query.trim()) return
    busy.current = true; setPending(true); setError(''); setSearchedProducts(false)
    try { setProducts(await window.adminPurchases.searchProducts(purchaseId, query.trim())); setSearchedProducts(true) }
    catch (e) { setError(errorMessage(e)) }
    finally { busy.current = false; setPending(false) }
  }
  const completeCreation = async (listing: ProductListing) => {
    if (!creation || busy.current) return
    busy.current = true; setPending(true); setError(''); setFeedback('')
    try {
      const refreshed = await window.adminPurchases.resolve(creation.purchaseId, creation.groupId, {
        revision: creation.revision, productListingId: listing.id,
      })
      setReview(refreshed); setCreation(null); setPanel(null)
      setFeedback('Listing created and linked. Review it before approving receipt into inventory.')
    } catch (e) { setError(errorMessage(e)) }
    finally { busy.current = false; setPending(false) }
  }
  if (creation) return <section className="purchases-workspace">
    <button className="button button-secondary" onClick={() => setCreation(null)}>Back to Purchase Review</button>
    {error && <p className="error-message" role="alert">{error}</p>}
    {pending && <p role="status">Linking created listing…</p>}
    <AddProduct purchaseContext={creation} onProductCreated={listing => void completeCreation(listing)} />
  </section>

  return <section className="purchases-workspace purchase-review" aria-labelledby="purchase-review-title">
    <div className="review-toolbar">
      <button className="button button-secondary" disabled={pending} onClick={onBack}>← Purchase History</button>
      <button className="button button-secondary" disabled={pending} onClick={() => void mutate(() => window.adminPurchases.review(purchaseId), 'Review refreshed.')}>Refresh review</button>
    </div>
    <p className="eyebrow">PURCHASE REVIEW</p>
    <h2 id="purchase-review-title">{review.purchase.sourceOrderReference}</h2>
    <p>{date(review.purchase.sourceOrderDate)}{review.purchase.merchantName ? ' · ' + review.purchase.merchantName : ''}</p>
    <p>Review the source details and listing before approving stock for inventory.</p>
    {error && <p className="error-message" role="alert">{error} Use Refresh review if the purchase has changed.</p>}
    {feedback && <p className="success-message" role="status">{feedback}</p>}
    {pending && <p role="status">Working…</p>}
    {review.groups.map(group => <article className="purchase-document" key={group.id} aria-label={group.description}>
      <div className="document-heading"><h3>{group.description}</h3><strong>{group.state}</strong></div>
      <p>{group.externalProductId && <>Product identity: {group.externalProductId} · </>}{group.sourceSetNumber && <>Set: {group.sourceSetNumber}</>}</p>
      <div className="review-facts">
        <span>Quantity <strong>{group.quantity}</strong></span>
        <span>{group.costKind === 'UNIT' ? 'Unit purchase cost' : 'Weighted average unit cost'} <strong>{money(group.unitCost)}</strong></span>
        <span>Total <strong>{money(group.totalCost)}</strong></span>
      </div>
      <p>Listing: {group.listing ? `${group.listing.condition} / ${group.listing.setNumber} · ${group.listing.title}${group.listing.active ? '' : ' (inactive)'}` : 'Unresolved — select a listing'}</p>
      {group.pendingQuantity !== group.quantity && group.pendingQuantity > 0 && <p>{group.quantity - group.pendingQuantity} already received; {group.pendingQuantity} remaining.</p>}
      <div className="review-actions">
        {group.lines.some(l => l.canAmend) && <button className="button button-secondary" disabled={pending} onClick={() => { setPanel({ id: group.id, kind: 'amend' }); setError('') }}>Amend</button>}
        {group.canResolve && <button className="button button-secondary" disabled={pending} onClick={() => void openResolution(group)}>{group.listing ? 'Change Listing' : 'Resolve Listing'}</button>}
        {group.state === 'MATCHED' && group.listing?.active && <button className="button button-primary" disabled={pending} onClick={() => {
          if (window.confirm(`Approve and receive ${group.pendingQuantity} units into ${group.listing?.condition} / ${group.listing?.setNumber}? This cannot be amended afterward.`))
            void mutate(() => window.adminPurchases.receive(purchaseId, group.id, { revision: review.revision }), 'Purchase item received into inventory.')
        }}>Approve &amp; Receive {group.pendingQuantity}</button>}
      </div>
      {panel?.id === group.id && panel.kind === 'amend' && <div className="review-editor">
        <p>Amend individual source lines. Quantity and price changes recalculate this document’s allocations and total; shipping and discount stay unchanged.</p>
        {group.lines.map(line => <LineAmend key={line.id + review.revision} line={line} pending={pending} onSave={input =>
          mutate(() => window.adminPurchases.amend(purchaseId, line.id, { ...input, revision: review.revision }), 'Source line amended; costs recalculated where required.')} />)}
        <button className="button button-secondary" disabled={pending} onClick={() => setPanel(null)}>Cancel amendment</button>
      </div>}
      {panel?.id === group.id && panel.kind === 'resolve' && <div className="review-editor">
        <label>Search listings by set number or title<input value={query} onChange={e => { setQuery(e.target.value); setSelectedListing('') }} disabled={pending} /></label>
        {loadedListings && <>
          <label>Product listing<select value={selectedListing} onChange={e => setSelectedListing(e.target.value)} disabled={pending}>
            <option value="">Unresolved (clear association)</option>
            {listingMatches(listings, query).map(l =>
              <option key={l.id} value={l.id}>{l.condition} / {l.legoProduct.setNumber} · {l.legoProduct.title}</option>)}
          </select></label>
          <button className="button button-primary" disabled={pending} onClick={() => void mutate(() => window.adminPurchases.resolve(purchaseId, group.id, {
            revision: review.revision, productListingId: selectedListing ? Number(selectedListing) : null,
          }), 'Listing association saved for all source lines.')}>Link selected listing</button>
        </>}
        <button className="button button-secondary" disabled={pending || !query.trim()} onClick={() => void searchProducts()}>Create listing for existing product</button>
        {searchedProducts && <p>{products.length ? 'Select the product for which to create a listing. Up to 50 results; refine the search if needed.' : 'No products found.'}</p>}
        {products.map(p => <button className="button button-secondary" key={p.id} disabled={pending} onClick={() => setCreation({ purchaseId, groupId: group.id, revision: review.revision, sourceSetNumber: group.sourceSetNumber, sourceDescription: group.description, existingProduct: p })}>Create listing for {p.setNumber} · {p.title}</button>)}
        <button className="button button-secondary" disabled={pending} onClick={() => setCreation({ purchaseId, groupId: group.id, revision: review.revision, sourceSetNumber: group.sourceSetNumber, sourceDescription: group.description })}>Create new product + listing</button>
        <button className="button button-secondary" disabled={pending} onClick={() => setPanel(null)}>Cancel</button>
      </div>}
      <details><summary>Source lines and cost breakdown ({group.lines.length})</summary>
        {group.lines.map(line => <div className="purchase-item" key={line.id}>
          <div><strong>{line.sourceDescription}</strong><span>Document {review.purchase.purchaseDocuments.find(d => d.id === line.purchaseDocumentId)?.partNumber} · Line {line.sourceLineNumber ?? 'not provided'} · Quantity {line.quantity}</span>
            <span>{line.receivedAt ? 'Received ' + date(line.receivedAt) : 'Not received'}{line.returnedAt ? ' · Returned ' + date(line.returnedAt) : ''}</span></div>
          <div className="purchase-item-costs"><span>Original unit {money(line.originalGrossUnitCost)}</span><span>Original line {money(line.originalGrossLineTotal)}</span>
            <span>Shipping {money(line.allocatedShipping)}</span><span>Discount −{money(line.allocatedDiscount)}</span><strong>Final {money(line.finalLineCost)}</strong></div>
        </div>)}
      </details>
    </article>)}
    <p className="review-total">Purchase Total: <strong>{money(review.totalCost)}</strong></p>
    <details><summary>Document references and totals</summary>{review.purchase.purchaseDocuments.map(doc =>
      <div className="purchase-document" key={doc.id}><h3>Document {doc.partNumber}</h3>
        <p>Invoice {doc.sourceInvoiceReference ?? 'reference not provided'} · {date(doc.sourceDocumentDate)}</p>
        <div className="purchase-totals"><span>Merchandise <strong>{money(doc.originalGrossMerchandiseTotal)}</strong></span><span>Shipping <strong>{money(doc.shippingTotal)}</strong></span><span>Discount <strong>−{money(doc.discountTotal)}</strong></span><span>Total paid <strong>{money(doc.finalTotalPaid)}</strong></span></div>
      </div>)}</details>
  </section>
}

function LineAmend({ line, pending, onSave }: { line: ReviewLine; pending: boolean; onSave: (input: Omit<PurchaseAmendment, 'revision'>) => Promise<boolean> }) {
  const [description, setDescription] = useState(line.sourceDescription)
  const [setNumber, setSetNumber] = useState(line.sourceSetNumber ?? '')
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [cost, setCost] = useState(line.originalGrossUnitCost)
  if (!line.canAmend) return <p>Source line {line.sourceLineNumber}: received; amendment unavailable.</p>
  return <form className="review-line-form" onSubmit={e => {
    e.preventDefault()
    void onSave({ sourceDescription: description, sourceSetNumber: setNumber.trim() || null,
      ...(line.canAmendCost ? { quantity: Number(quantity), originalGrossUnitCost: cost } : {}) })
  }}>
    <strong>Source line {line.sourceLineNumber ?? line.id}</strong>
    <label>Description<input value={description} onChange={e => setDescription(e.target.value)} required maxLength={2000} disabled={pending} /></label>
    <label>Set number<input value={setNumber} onChange={e => setSetNumber(e.target.value)} maxLength={100} disabled={pending} /></label>
    <label>Quantity<input type="number" min="1" max="1000000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required disabled={pending || !line.canAmendCost} /></label>
    <label>Original unit purchase cost<input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)} required disabled={pending || !line.canAmendCost} /></label>
    {!line.canAmendCost && <p>Quantity and price are read-only because this document has received stock or the source line total differs from quantity × unit price.</p>}
    <button className="button button-primary" disabled={pending}>Save source line</button>
  </form>
}

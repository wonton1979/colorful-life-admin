import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ManualPurchaseInput, ManualPurchaseSupplierOptions } from '../electron/purchase-contract.js'
import { isAdminIpcError } from '../electron/ipc-error-contract.js'
import { adminPurchases } from './admin-api'

type DraftItem = { description: string; setNumber: string; quantity: string; unitCost: string }
const blankItem = (): DraftItem => ({ description: '', setNumber: '', quantity: '1', unitCost: '' })
const toPence = (value: string): number | null => {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [pounds, fraction = ''] = normalized.split('.')
  const result = Number(pounds) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : null
}
const pounds = (pence: number): string => `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`

export default function ManualPurchaseForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (input: ManualPurchaseInput) => Promise<void> }) {
  const [reference, setReference] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [supplierOptions, setSupplierOptions] = useState<ManualPurchaseSupplierOptions | null>(null)
  const [supplierOptionsLoading, setSupplierOptionsLoading] = useState(true)
  const [supplierOptionsError, setSupplierOptionsError] = useState('')
  const [supplierOptionsRetry, setSupplierOptionsRetry] = useState(0)
  const [supplierChoice, setSupplierChoice] = useState('')
  const [customSupplier, setCustomSupplier] = useState('')
  const [invoiceReference, setInvoiceReference] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [shipping, setShipping] = useState('0.00')
  const [discount, setDiscount] = useState('0.00')
  const [items, setItems] = useState<DraftItem[]>([blankItem()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submitLock = useRef(false)

  useEffect(() => {
    let active = true
    void adminPurchases.getManualSupplierOptions().then((options) => {
      if (active) setSupplierOptions(options)
    }).catch((cause: unknown) => {
      if (!active) return
      const sessionEnded = isAdminIpcError(cause) &&
        (cause.code === 'session-invalid' || cause.code === 'auth-required' || cause.backendCode === 'SESSION_INVALID' || cause.backendCode === 'AUTH_REQUIRED')
      if (sessionEnded) return
      setSupplierOptionsError(cause instanceof Error ? cause.message : 'Supplier options could not be loaded.')
    }).finally(() => {
      if (active) setSupplierOptionsLoading(false)
    })
    return () => { active = false }
  }, [supplierOptionsRetry])

  const itemCosts = items.map(item => {
    const quantity = Number(item.quantity)
    const unitPence = toPence(item.unitCost)
    return Number.isInteger(quantity) && quantity > 0 && unitPence !== null && Number.isSafeInteger(unitPence * quantity)
      ? { unitPence, linePence: unitPence * quantity }
      : null
  })
  const merchandisePence = itemCosts.every(Boolean) ? itemCosts.reduce((sum, cost) => sum + cost!.linePence, 0) : null
  const shippingPence = toPence(shipping)
  const discountPence = toPence(discount)
  const totalPence = merchandisePence !== null && shippingPence !== null && discountPence !== null && merchandisePence + shippingPence >= discountPence
    ? merchandisePence + shippingPence - discountPence : null

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitLock.current) return
    setError('')
    if (!reference.trim()) { setError('Purchase reference is required.'); return }
    if (items.length === 0) { setError('Add at least one purchase item.'); return }
    if (items.some(item => !item.description.trim())) { setError('Enter a description for every purchase item.'); return }
    if (items.some(item => !/^\d+$/.test(item.quantity) || Number(item.quantity) <= 0)) { setError('Each item quantity must be a positive whole number.'); return }
    if (items.some((_, index) => itemCosts[index] === null)) { setError('Enter a valid nonnegative unit cost for every item, using up to two decimal places.'); return }
    if (shippingPence === null || discountPence === null) { setError('Shipping and discount must be nonnegative pound amounts with up to two decimal places.'); return }
    if (merchandisePence === null || totalPence === null) { setError('Discount cannot make the total paid negative.'); return }
    const customSupplierName = customSupplier.trim()
    if (supplierOptions && supplierChoice === supplierOptions.customSupplierOption && !customSupplierName) {
      setError('Enter the other supplier / retailer name.')
      return
    }
    submitLock.current = true
    setSubmitting(true)
    try {
      const input: ManualPurchaseInput = {
        sourceOrderReference: reference.trim(),
        ...(purchaseDate ? { sourceOrderDate: purchaseDate } : {}),
        ...(supplierOptions && supplierChoice === supplierOptions.customSupplierOption
          ? { merchantName: customSupplierName }
          : supplierChoice ? { merchantName: supplierChoice } : {}),
        ...(invoiceReference.trim() ? { sourceInvoiceReference: invoiceReference.trim() } : {}),
        ...(documentDate ? { sourceDocumentDate: documentDate } : {}),
        originalGrossMerchandiseTotal: pounds(merchandisePence),
        shippingTotal: pounds(shippingPence),
        discountTotal: pounds(discountPence),
        finalTotalPaid: pounds(totalPence),
        items: items.map((item, index) => ({
          sourceDescription: item.description.trim(),
          quantity: Number(item.quantity),
          originalGrossUnitCost: pounds(itemCosts[index]!.unitPence),
          originalGrossLineTotal: pounds(itemCosts[index]!.linePence),
          ...(item.setNumber.trim() ? { sourceSetNumber: item.setNumber.trim() } : {}),
        })),
      }
      await onCreate(input)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The purchase could not be created.')
      submitLock.current = false
      setSubmitting(false)
    }
  }

  return <section className="purchase-import-card manual-purchase-card" aria-labelledby="manual-purchase-title">
    <p className="eyebrow">KNOWN PURCHASE</p>
    <h3 id="manual-purchase-title">Add Purchase</h3>
    <p className="panel-intro">Record purchase details and items. Inventory changes only after receiving in Purchase Review.</p>
    <form className="manual-purchase-form" onSubmit={event => void submit(event)} noValidate>
      <label>Purchase reference *<input value={reference} onChange={event => setReference(event.target.value)} required autoComplete="off" /></label>
      <label>Purchase date<input type="date" value={purchaseDate} onChange={event => setPurchaseDate(event.target.value)} /></label>
      <div className="manual-purchase-supplier">
        <label htmlFor="manual-purchase-supplier">Supplier / Retailer
          <select id="manual-purchase-supplier" value={supplierChoice} disabled={supplierOptionsLoading || !supplierOptions} aria-busy={supplierOptionsLoading} aria-describedby={supplierOptionsError ? 'manual-purchase-supplier-error' : supplierOptionsLoading ? 'manual-purchase-supplier-loading' : undefined} onChange={event => {
            const nextChoice = event.target.value
            setSupplierChoice(nextChoice)
            if (supplierOptions && supplierChoice === supplierOptions.customSupplierOption && nextChoice !== supplierOptions.customSupplierOption) setCustomSupplier('')
          }}>
            <option value="">No supplier specified</option>
            {supplierOptions?.canonicalSuppliers.map(supplier => <option key={supplier} value={supplier}>{supplier}</option>)}
            {supplierOptions && <option value={supplierOptions.customSupplierOption}>{supplierOptions.customSupplierOption}</option>}
          </select>
        </label>
        {supplierOptionsLoading && <p id="manual-purchase-supplier-loading" className="manual-purchase-supplier-loading" role="status">Loading supplier options…</p>}
        {supplierOptionsError && <div className="manual-purchase-supplier-error">
          <p id="manual-purchase-supplier-error" className="error-message" role="alert">{supplierOptionsError}</p>
          <button className="button button-secondary" type="button" disabled={supplierOptionsLoading} onClick={() => {
            setSupplierOptionsError('')
            setSupplierOptionsLoading(true)
            setSupplierOptionsRetry(current => current + 1)
          }}>Retry supplier options</button>
        </div>}
        {supplierOptions && supplierChoice === supplierOptions.customSupplierOption && <label htmlFor="manual-purchase-custom-supplier">Other supplier / retailer
          <input id="manual-purchase-custom-supplier" value={customSupplier} onChange={event => setCustomSupplier(event.target.value)} autoComplete="off" />
        </label>}
      </div>
      <label>Invoice reference<input value={invoiceReference} onChange={event => setInvoiceReference(event.target.value)} /></label>
      <label>Document date<input type="date" value={documentDate} onChange={event => setDocumentDate(event.target.value)} /></label>
      <div className="manual-purchase-items">
        <div className="product-panel-heading"><h3>Purchase items</h3><button className="button button-secondary" type="button" onClick={() => setItems(current => [...current, blankItem()])}>Add item</button></div>
        {items.map((item, index) => <fieldset className="manual-purchase-item" key={index}>
          <legend>Item {index + 1}</legend>
          <label>Description *<input value={item.description} onChange={event => setItems(current => current.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry))} required /></label>
          <label>LEGO set number<input value={item.setNumber} onChange={event => setItems(current => current.map((entry, i) => i === index ? { ...entry, setNumber: event.target.value } : entry))} /></label>
          <label>Quantity *<input type="number" min="1" step="1" value={item.quantity} onChange={event => setItems(current => current.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} required /></label>
          <label>Unit cost (£) *<input inputMode="decimal" value={item.unitCost} onChange={event => setItems(current => current.map((entry, i) => i === index ? { ...entry, unitCost: event.target.value } : entry))} placeholder="0.00" required /></label>
          <p className="manual-line-total">Line total <strong>{itemCosts[index] ? `£${pounds(itemCosts[index]!.linePence)}` : 'Enter quantity and unit cost'}</strong></p>
          {items.length > 1 && <button className="button button-secondary manual-remove-item" type="button" onClick={() => setItems(current => current.filter((_, i) => i !== index))}>Remove item {index + 1}</button>}
        </fieldset>)}
      </div>
      <div className="manual-purchase-totals">
        <p>Merchandise total <strong>{merchandisePence === null ? '—' : `£${pounds(merchandisePence)}`}</strong></p>
        <label>Shipping (£)<input inputMode="decimal" value={shipping} onChange={event => setShipping(event.target.value)} /></label>
        <label>Discount (£)<input inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label>
        <p>Total paid <strong>{totalPence === null ? '—' : `£${pounds(totalPence)}`}</strong></p>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="manual-purchase-actions"><button className="button button-secondary" type="button" onClick={onCancel} disabled={submitting}>Cancel</button><button className="button button-primary" type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Creating purchase…' : 'Create purchase'}</button></div>
    </form>
  </section>
}

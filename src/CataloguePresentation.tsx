import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { colorfulLifeCategoryOptions } from '../electron/product-contract'
import type { ColorfulLifeCategory, ProductListing } from '../electron/product-contract'

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximumArtworkBytes = 8 * 1024 * 1024
const itemsPerPage = 3

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The catalogue presentation action failed.'

interface CataloguePresentationProps {
  refreshToken?: number
  refreshCategory?: ColorfulLifeCategory | null
}

function CataloguePresentation({ refreshToken = 0, refreshCategory = null }: CataloguePresentationProps) {
  const [listings, setListings] = useState<ProductListing[]>([])
  const [selectedCategory, setSelectedCategory] = useState<ColorfulLifeCategory | ''>('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const loadListings = async ({ category = selectedCategory, resetPage = false }: { category?: ColorfulLifeCategory | ''; resetPage?: boolean } = {}) => {
    setIsLoading(true)
    setHasLoaded(false)
    setError('')
    try {
      const nextListings = await window.adminProducts.listProducts()
      setListings(nextListings)
      setHasLoaded(true)
      if (resetPage) {
        setPage(1)
      } else {
        const categoryCount = nextListings.filter((listing) => !category || listing.colorfulLifeCategory === category).length
        setPage((current) => Math.min(current, Math.max(1, Math.ceil(categoryCount / itemsPerPage))))
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      const category = refreshToken > 0 ? refreshCategory ?? '' : selectedCategory
      if (refreshToken > 0) {
        setSelectedCategory(category)
        setPage(1)
      }
      return loadListings({ category, resetPage: refreshToken > 0 })
    })
    // The refresh token intentionally controls this effect; category changes are local and do not reload data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  const visibleListings = selectedCategory ? listings.filter((listing) => listing.colorfulLifeCategory === selectedCategory) : listings
  const pageCount = Math.max(1, Math.ceil(visibleListings.length / itemsPerPage))
  const currentPage = Math.min(page, pageCount)
  const paginatedListings = visibleListings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const setFeature = async (listingId: number) => {
    if (activeAction !== null) return
    setActiveAction(`feature-${listingId}`)
    setError('')
    setFeedback('')
    try {
      await window.adminProducts.setFeatureProduct(listingId)
      setListings(await window.adminProducts.listProducts())
      setFeedback('Feature product updated.')
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setActiveAction(null)
    }
  }

  const uploadArtwork = async (listingId: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!supportedTypes.has(file.type)) {
      setError(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`)
      return
    }
    if (file.size > maximumArtworkBytes) {
      setError(`${file.name} exceeds the 8 MiB image limit.`)
      return
    }
    if (activeAction !== null) return
    setActiveAction(`artwork-${listingId}`)
    setError('')
    setFeedback('')
    try {
      const artwork = await window.adminProducts.uploadCatalogueArtwork(listingId, {
        bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      })
      setListings((current) => current.map((listing) => listing.id === listingId ? { ...listing, catalogueArtworkUrl: artwork.url, catalogueArtworkPublicId: artwork.publicId } : listing))
      setFeedback('Catalogue artwork saved.')
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setActiveAction(null)
    }
  }

  const removeArtwork = async (listingId: number) => {
    if (activeAction !== null || !window.confirm('Remove this catalogue artwork?')) return
    setActiveAction(`remove-artwork-${listingId}`)
    setError('')
    setFeedback('')
    try {
      await window.adminProducts.removeCatalogueArtwork(listingId)
      setListings((current) => current.map((listing) => listing.id === listingId ? { ...listing, catalogueArtworkUrl: null, catalogueArtworkPublicId: null } : listing))
      setFeedback('Catalogue artwork removed.')
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <section className="product-panel catalogue-presentation" aria-labelledby="catalogue-presentation-title">
      <div className="product-panel-heading"><div><p className="eyebrow">CATALOGUE</p><h2 id="catalogue-presentation-title">Presentation management</h2></div><button className="button button-secondary" type="button" onClick={() => void loadListings()} disabled={isLoading || activeAction !== null}>{isLoading ? 'Loading…' : 'Refresh listings'}</button></div>
      <p className="panel-intro">Choose one Feature listing per category and manage its separate catalogue artwork.</p>
      <label className="category-filter">Filter category<select aria-label="Presentation category" value={selectedCategory} onChange={(event) => { setSelectedCategory(event.target.value as ColorfulLifeCategory | ''); setPage(1) }}><option value="">All categories</option>{colorfulLifeCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p className="error-message" role="alert">{error}</p>}
      {feedback && <p className="success-message" role="status">{feedback}</p>}
      {isLoading && <p className="status-message">Loading catalogue listings…</p>}
      {!isLoading && hasLoaded && visibleListings.length === 0 && <p className="status-message">No listings found for this category.</p>}
      {!isLoading && visibleListings.length > 0 && <>
        <div className="presentation-list" aria-label="Catalogue presentation listings">{paginatedListings.map((listing) => {
        const featureAction = activeAction === `feature-${listing.id}`
        const artworkAction = activeAction === `artwork-${listing.id}`
        const removeAction = activeAction === `remove-artwork-${listing.id}`
        return <article className={`presentation-card${listing.isFeatureProduct ? ' presentation-card-feature' : ''}`} key={listing.id}>
          <div className="presentation-preview">{listing.catalogueArtworkUrl ? <img src={listing.catalogueArtworkUrl} alt={`Catalogue artwork for ${listing.legoProduct.title}`} /> : <span>No catalogue artwork</span>}</div>
          <div className="presentation-details"><div className="presentation-heading"><div><h3>{listing.legoProduct.title}</h3><p>Listing #{listing.id} · Set {listing.legoProduct.setNumber}</p></div><span className={`presentation-badge${listing.isFeatureProduct ? ' feature-badge' : ''}`}>{listing.isFeatureProduct ? 'Feature' : 'Standard'}</span></div>
            <p className="presentation-category">{colorfulLifeCategoryOptions.find(([value]) => value === listing.colorfulLifeCategory)?.[1] ?? listing.colorfulLifeCategory}</p>
            <p className="artwork-state">{listing.catalogueArtworkUrl ? 'Catalogue artwork available' : 'No catalogue artwork'}</p>
            <div className="presentation-actions"><button className="button button-primary" type="button" onClick={() => void setFeature(listing.id)} disabled={activeAction !== null || listing.isFeatureProduct}>{featureAction ? 'Saving…' : listing.isFeatureProduct ? 'Current Feature' : 'Make Feature'}</button><label className="button button-secondary upload-artwork-button">{artworkAction ? 'Uploading…' : listing.catalogueArtworkUrl ? 'Replace artwork' : 'Upload artwork'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadArtwork(listing.id, event)} disabled={activeAction !== null} /></label>{listing.catalogueArtworkUrl && <button className="button button-secondary" type="button" onClick={() => void removeArtwork(listing.id)} disabled={activeAction !== null}>{removeAction ? 'Removing…' : 'Remove artwork'}</button>}</div>
          </div>
        </article>
        })}</div>
        {pageCount > 1 && <nav className="presentation-pagination" aria-label="Presentation listing pages"><button className="button button-secondary" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="button button-secondary" type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount}>Next</button></nav>}
      </>}
    </section>
  )
}

export default CataloguePresentation

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react'
import type { AdminCategory, CategoryTextUpdate } from '../electron/category-contract.js'
import { adminCategories } from './admin-api'
import './Categories.css'

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximumArtworkBytes = 8 * 1024 * 1024
const messageFor = (error: unknown) => error instanceof Error ? error.message : 'The category action could not be completed.'
type Draft = { name: string; subtitle: string; description: string }
type ArtworkAction = 'upload' | 'remove'
type ArtworkActions = Partial<Record<number, ArtworkAction>>

const orderCategories = (items: AdminCategory[]) => [...items.filter(category => !category.imageUrl), ...items.filter(category => !!category.imageUrl)]
const draftOf = (category: AdminCategory): Draft => ({ name: category.name, subtitle: category.subtitle ?? '', description: category.description ?? '' })
const normalizeDraft = (draft: Draft): CategoryTextUpdate => ({ name: draft.name.trim(), subtitle: draft.subtitle.trim() || null, description: draft.description.trim() || null })

function CategoryArtworkSection({ title, description, imageUrl, categoryName, emptyLabel, action, onUpload, onRemove }: {
  title: string
  description: string
  imageUrl: string | null
  categoryName: string
  emptyLabel: string
  action?: ArtworkAction
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  const hasArtwork = Boolean(imageUrl)
  const uploadLabel = title === 'Catalogue Thumbnail' ? 'catalogue thumbnail' : 'opening artwork'

  return <section className="category-artwork-section" aria-label={title}>
    <div className="category-artwork-heading">
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
    <div className="category-artwork-body">
      <div className="category-preview">
        {imageUrl
          ? <img src={imageUrl} alt={`${title} for ${categoryName}`} />
          : <span>{emptyLabel}</span>}
      </div>
      <div className="category-artwork-controls">
        <div className="category-actions">
          <label className="button button-secondary upload-artwork-button" aria-busy={action === 'upload'}>
            {action === 'upload' ? 'Uploading…' : hasArtwork ? `Replace ${uploadLabel}` : `Upload ${uploadLabel}`}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} disabled={action !== undefined} />
          </label>
          {hasArtwork && <button className="button button-secondary" type="button" onClick={onRemove} disabled={action !== undefined} aria-busy={action === 'remove'}>
            {action === 'remove' ? 'Removing…' : `Remove ${uploadLabel}`}
          </button>}
        </div>
      </div>
    </div>
  </section>
}

function Categories() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [openingArtworkActions, setOpeningArtworkActions] = useState<ArtworkActions>({})
  const [thumbnailActions, setThumbnailActions] = useState<ArtworkActions>({})
  const openingArtworkLocks = useRef(new Set<number>())
  const thumbnailLocks = useRef(new Set<number>())
  const [loadSucceeded, setLoadSucceeded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>({ name: '', subtitle: '', description: '' })

  const load = async () => {
    setLoading(true)
    setLoadSucceeded(false)
    setError('')
    try {
      setCategories(await adminCategories.list())
      setEditingId(null)
      setDrafts({})
      setLoadSucceeded(true)
    } catch (loadError) {
      setError(messageFor(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void Promise.resolve().then(load) }, [])

  const beginEdit = (category: AdminCategory) => {
    setEditingId(category.id)
    setDrafts(current => ({ ...current, [category.id]: draftOf(category) }))
    setError('')
    setFeedback('')
  }

  const cancelEdit = (id: number) => {
    setEditingId(null)
    setDrafts(current => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const updateDraft = (id: number, field: keyof Draft, value: string) => setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }))

  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeAction !== null) return
    setActiveAction('create')
    setError('')
    setFeedback('')
    try {
      const created = await adminCategories.create(normalizeDraft(createDraft))
      setCategories(current => [...current, created])
      setCreateDraft({ name: '', subtitle: '', description: '' })
      setShowCreate(false)
      setFeedback('Category created.')
    } catch (createError) {
      setError(messageFor(createError))
    } finally {
      setActiveAction(null)
    }
  }

  const save = async (id: number) => {
    if (activeAction !== null) return
    const draft = drafts[id]
    if (!draft) return
    setActiveAction(`save-${id}`)
    setError('')
    setFeedback('')
    try {
      const saved = await adminCategories.update(id, normalizeDraft(draft))
      setCategories(current => current.map(category => category.id === id
        ? { ...category, name: saved.name, subtitle: saved.subtitle, description: saved.description }
        : category))
      cancelEdit(id)
      setFeedback('Category details saved.')
    } catch (saveError) {
      setError(messageFor(saveError))
    } finally {
      setActiveAction(null)
    }
  }

  const readArtworkFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return null
    if (!supportedTypes.has(file.type)) {
      setError(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`)
      return null
    }
    if (file.size > maximumArtworkBytes) {
      setError(`${file.name} exceeds the 8 MiB image limit.`)
      return null
    }
    return file
  }

  const changeArtworkAction = (setActions: Dispatch<SetStateAction<ArtworkActions>>, id: number, action?: ArtworkAction) => {
    setActions(current => {
      const next = { ...current }
      if (action) next[id] = action
      else delete next[id]
      return next
    })
  }

  const uploadOpeningArtwork = async (category: AdminCategory, event: ChangeEvent<HTMLInputElement>) => {
    if (openingArtworkLocks.current.has(category.id)) return
    const file = readArtworkFile(event)
    if (!file) return
    openingArtworkLocks.current.add(category.id)
    changeArtworkAction(setOpeningArtworkActions, category.id, 'upload')
    setError('')
    setFeedback('')
    try {
      const saved = await adminCategories.uploadArtwork(category.id, { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, mimeType: file.type })
      setCategories(current => current.map(entry => entry.id === category.id
        ? { ...entry, imageUrl: saved.imageUrl, imagePublicId: saved.imagePublicId }
        : entry))
      setFeedback('Category opening artwork saved.')
    } catch (uploadError) {
      setError(messageFor(uploadError))
    } finally {
      openingArtworkLocks.current.delete(category.id)
      changeArtworkAction(setOpeningArtworkActions, category.id)
    }
  }

  const removeOpeningArtwork = async (category: AdminCategory) => {
    if (openingArtworkLocks.current.has(category.id) || !window.confirm(`Remove opening artwork for ${category.name}?`)) return
    openingArtworkLocks.current.add(category.id)
    changeArtworkAction(setOpeningArtworkActions, category.id, 'remove')
    setError('')
    setFeedback('')
    try {
      const saved = await adminCategories.removeArtwork(category.id)
      setCategories(current => current.map(entry => entry.id === category.id
        ? { ...entry, imageUrl: saved.imageUrl, imagePublicId: saved.imagePublicId }
        : entry))
      setFeedback('Category opening artwork removed.')
    } catch (removeError) {
      setError(messageFor(removeError))
    } finally {
      openingArtworkLocks.current.delete(category.id)
      changeArtworkAction(setOpeningArtworkActions, category.id)
    }
  }

  const uploadThumbnail = async (category: AdminCategory, event: ChangeEvent<HTMLInputElement>) => {
    if (thumbnailLocks.current.has(category.id)) return
    const file = readArtworkFile(event)
    if (!file) return
    thumbnailLocks.current.add(category.id)
    changeArtworkAction(setThumbnailActions, category.id, 'upload')
    setError('')
    setFeedback('')
    try {
      const saved = await adminCategories.uploadThumbnailArtwork(category.id, { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name, mimeType: file.type })
      setCategories(current => current.map(entry => entry.id === category.id
        ? { ...entry, thumbnailUrl: saved.thumbnailUrl, thumbnailPublicId: saved.thumbnailPublicId }
        : entry))
      setFeedback('Catalogue thumbnail saved.')
    } catch (uploadError) {
      setError(messageFor(uploadError))
    } finally {
      thumbnailLocks.current.delete(category.id)
      changeArtworkAction(setThumbnailActions, category.id)
    }
  }

  const removeThumbnail = async (category: AdminCategory) => {
    if (thumbnailLocks.current.has(category.id) || !window.confirm(`Remove catalogue thumbnail for ${category.name}?`)) return
    thumbnailLocks.current.add(category.id)
    changeArtworkAction(setThumbnailActions, category.id, 'remove')
    setError('')
    setFeedback('')
    try {
      const saved = await adminCategories.removeThumbnailArtwork(category.id)
      setCategories(current => current.map(entry => entry.id === category.id
        ? { ...entry, thumbnailUrl: saved.thumbnailUrl, thumbnailPublicId: saved.thumbnailPublicId }
        : entry))
      setFeedback('Catalogue thumbnail removed.')
    } catch (removeError) {
      setError(messageFor(removeError))
    } finally {
      thumbnailLocks.current.delete(category.id)
      changeArtworkAction(setThumbnailActions, category.id)
    }
  }

  const orderedCategories = orderCategories(categories)

  return <section className="product-panel categories-panel" aria-labelledby="categories-title">
    <div className="product-panel-heading">
      <div><p className="eyebrow">CATALOGUE</p><h2 id="categories-title">Categories</h2></div>
      <div className="category-actions">
        <button className="button button-secondary" type="button" onClick={() => { setShowCreate(true); setError(''); setFeedback('') }} disabled={loading || activeAction !== null}>Add Category</button>
        <button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading || activeAction !== null} aria-busy={loading}>{loading ? 'Loading…' : 'Refresh categories'}</button>
      </div>
    </div>
    <p className="panel-intro">Manage category copy, opening artwork, and catalogue thumbnails.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {feedback && <p className="success-message" role="status">{feedback}</p>}
    {showCreate && <form className="category-edit-form" aria-label="Add category form" onSubmit={event => void createCategory(event)}>
      <label>Name<input aria-label="New category name" value={createDraft.name} onChange={event => setCreateDraft(current => ({ ...current, name: event.target.value }))} required maxLength={200} disabled={activeAction === 'create'} /></label>
      <label>Subtitle<input aria-label="New category subtitle" value={createDraft.subtitle} onChange={event => setCreateDraft(current => ({ ...current, subtitle: event.target.value }))} maxLength={300} disabled={activeAction === 'create'} /></label>
      <label>Description<textarea aria-label="New category description" value={createDraft.description} onChange={event => setCreateDraft(current => ({ ...current, description: event.target.value }))} maxLength={2000} disabled={activeAction === 'create'} /></label>
      <div className="category-actions">
        <button className="button button-primary" type="submit" disabled={activeAction !== null} aria-busy={activeAction === 'create'}>{activeAction === 'create' ? 'Creating…' : 'Create category'}</button>
        <button className="button button-secondary" type="button" onClick={() => { setShowCreate(false); setCreateDraft({ name: '', subtitle: '', description: '' }); setError('') }} disabled={activeAction !== null}>Cancel</button>
      </div>
    </form>}
    {loading && <p className="status-message">Loading categories…</p>}
    {!loading && loadSucceeded && categories.length === 0 && <p className="status-message">No categories found.</p>}
    <div className="category-list">
      {orderedCategories.map(category => {
        const editing = editingId === category.id
        const draft = drafts[category.id] ?? draftOf(category)
        const saveAction = activeAction === `save-${category.id}`
        return <article className="category-card" key={category.id}>
          <div className="category-details">
            {editing
              ? <div className="category-edit-form">
                <label>Name<input value={draft.name} onChange={event => updateDraft(category.id, 'name', event.target.value)} disabled={saveAction} /></label>
                <label>Subtitle<input value={draft.subtitle} onChange={event => updateDraft(category.id, 'subtitle', event.target.value)} disabled={saveAction} /></label>
                <label>Description<textarea value={draft.description} onChange={event => updateDraft(category.id, 'description', event.target.value)} disabled={saveAction} /></label>
                <div className="category-actions">
                  <button className="button button-primary" type="button" onClick={() => void save(category.id)} disabled={activeAction !== null} aria-busy={saveAction}>{saveAction ? 'Saving…' : 'Save changes'}</button>
                  <button className="button button-secondary" type="button" onClick={() => cancelEdit(category.id)} disabled={activeAction !== null}>Cancel</button>
                </div>
              </div>
              : <>
                <div className="category-heading">
                  <div><h3>{category.name}</h3>{category.subtitle && <p>{category.subtitle}</p>}</div>
                  <span className="category-id">#{category.id}</span>
                </div>
                {category.description && <p className="category-description">{category.description}</p>}
                <div className="category-actions category-details-actions">
                  <button className="button button-secondary" type="button" onClick={() => beginEdit(category)} disabled={activeAction !== null}>Edit details</button>
                </div>
                <div className="category-artwork-grid">
                  <CategoryArtworkSection
                    title="Category Opening Artwork"
                    description="The larger artwork shown after entering this category."
                    imageUrl={category.imageUrl}
                    categoryName={category.name}
                    emptyLabel="No opening artwork"
                    action={openingArtworkActions[category.id]}
                    onUpload={event => void uploadOpeningArtwork(category, event)}
                    onRemove={() => void removeOpeningArtwork(category)}
                  />
                  <CategoryArtworkSection
                    title="Catalogue Thumbnail"
                    description="The smaller illustration used on catalogue category-selection and index pages."
                    imageUrl={category.thumbnailUrl}
                    categoryName={category.name}
                    emptyLabel="No catalogue thumbnail"
                    action={thumbnailActions[category.id]}
                    onUpload={event => void uploadThumbnail(category, event)}
                    onRemove={() => void removeThumbnail(category)}
                  />
                </div>
              </>}
          </div>
        </article>
      })}
    </div>
  </section>
}

export default Categories

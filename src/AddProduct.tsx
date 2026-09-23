import { useEffect, useRef, useState } from 'react'
import type { AdminCategory } from '../electron/category-contract'
import type { ReviewProduct } from '../electron/purchase-contract'
import type { FormEvent, ChangeEvent } from 'react'
import { colorfulLifeCategoryOptions } from '../electron/product-contract'
import type { ColorfulLifeCategory, CreateProductRequest, ListingImage, ProductListing } from '../electron/product-contract'

type ImageStatus = 'pending' | 'uploading' | 'uploaded' | 'failed'

interface SelectedImage {
  id: string
  file: File
  previewUrl: string
  altText: string
  status: ImageStatus
  result?: ListingImage
  error?: string
}

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximumImageBytes = 8 * 1024 * 1024
const maximumImages = 10

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The product could not be created.'

interface AddProductProps {
  purchaseContext?: {
    purchaseId: number
    groupId: number
    revision: string
    sourceSetNumber: string | null
    sourceDescription: string
    existingProduct?: ReviewProduct
  }
  onProductCreated?: (product: ProductListing) => void
}

function AddProduct({ onProductCreated, purchaseContext }: AddProductProps) {
  const [setNumber, setSetNumber] = useState(purchaseContext?.sourceSetNumber ?? '')
  const [title, setTitle] = useState(purchaseContext?.sourceDescription ?? '')
  const [description, setDescription] = useState('')
  const [theme, setTheme] = useState('')
  const [colorfulLifeCategory, setColorfulLifeCategory] = useState<ColorfulLifeCategory | ''>('')
  const [ageRecommendation, setAgeRecommendation] = useState('')
  const [pieceCount, setPieceCount] = useState('')
  const [condition, setCondition] = useState<CreateProductRequest['condition']>('NEW')
  const [originalPrice, setOriginalPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [currentStock, setCurrentStock] = useState('')
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [images, setImages] = useState<SelectedImage[]>([])
  const [formError, setFormError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isInitialUploadActive, setIsInitialUploadActive] = useState(false)
  const [createdProduct, setCreatedProduct] = useState<ProductListing | null>(null)
  const creationNotifiedRef = useRef(false)
  const imagesRef = useRef(images)
  imagesRef.current = images

  useEffect(() => {
    if (!purchaseContext || purchaseContext.existingProduct) return
    let cancelled = false
    void window.adminCategories.list().then(data => { if (!cancelled) setCategories(data) }, error => { if (!cancelled) setFormError(getErrorMessage(error)) })
    return () => { cancelled = true }
  }, [purchaseContext])

  useEffect(() => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl)), [])

  const uploadedCount = images.filter((image) => image.status === 'uploaded').length
  const isWorkflowActive = isCreating || isInitialUploadActive
  const isWorkflowComplete = createdProduct !== null && !isWorkflowActive && images.every((image) => image.status === 'uploaded')

  useEffect(() => {
    if (!isWorkflowComplete || !createdProduct || creationNotifiedRef.current) return
    creationNotifiedRef.current = true
    onProductCreated?.(createdProduct)
  }, [createdProduct, isWorkflowComplete, onProductCreated])

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    setFormError('')
    const nextImages = [...images]
    for (const file of files) {
      if (nextImages.length >= maximumImages) {
        setFormError('A product can have at most 10 images.')
        break
      }
      if (!supportedTypes.has(file.type)) {
        setFormError(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`)
        continue
      }
      if (file.size > maximumImageBytes) {
        setFormError(`${file.name} exceeds the 8 MiB image limit.`)
        continue
      }
      nextImages.push({ id: `${file.name}-${file.lastModified}-${nextImages.length}`, file, previewUrl: URL.createObjectURL(file), altText: '', status: 'pending' })
    }
    setImages(nextImages)
  }

  const removeImage = (imageId: string) => {
    setImages((current) => current.filter((image) => {
      if (image.id !== imageId) return true
      URL.revokeObjectURL(image.previewUrl)
      return false
    }))
  }

  const updateAltText = (imageId: string, altText: string) => {
    setImages((current) => current.map((image) => image.id === imageId ? { ...image, altText } : image))
  }

  const uploadImage = async (listingId: number, imageIndex: number) => {
    const image = imagesRef.current[imageIndex]
    if (!image) return
    setImages((current) => current.map((entry, index) => index === imageIndex ? { ...entry, status: 'uploading', error: undefined } : entry))
    try {
      const result = await window.adminProducts.uploadListingImage(listingId, {
        bytes: new Uint8Array(await image.file.arrayBuffer()),
        filename: image.file.name,
        mimeType: image.file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        ...(image.altText ? { altText: image.altText } : {}),
      })
      setImages((current) => current.map((entry, index) => index === imageIndex ? { ...entry, status: 'uploaded', result } : entry))
    } catch (error) {
      setImages((current) => current.map((entry, index) => index === imageIndex ? { ...entry, status: 'failed', error: getErrorMessage(error) } : entry))
    }
  }

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreating || !condition) return
    setFormError('')
    setIsCreating(true)
    try {
      const request: CreateProductRequest = {
        setNumber, title, theme, colorfulLifeCategory: colorfulLifeCategory as ColorfulLifeCategory, ageRecommendation, pieceCount: Number(pieceCount), condition, originalPrice: Number(originalPrice),
        ...(description ? { description } : {}), ...(salePrice ? { salePrice: Number(salePrice) } : {}), ...(currentStock ? { currentStock: Number(currentStock) } : {}),
      }
      const product = purchaseContext
        ? await window.adminPurchases.createListing(purchaseContext.purchaseId, {
          ...(purchaseContext.existingProduct ? { existingProductId: purchaseContext.existingProduct.id } : {
            setNumber, title, description, theme, categoryId: Number(categoryId), ageRecommendation, pieceCount: Number(pieceCount),
          }),
          condition, originalPrice: Number(originalPrice), ...(salePrice ? { salePrice: Number(salePrice) } : {}), currentStock: 0,
        })
        : await window.adminProducts.createProduct(request)
      setCreatedProduct(product)
      setIsInitialUploadActive(true)
      for (let index = 0; index < imagesRef.current.length; index += 1) await uploadImage(product.id, index)
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsCreating(false)
      setIsInitialUploadActive(false)
    }
  }

  const retryFailedImages = () => {
    if (!createdProduct || isCreating || isInitialUploadActive) return
    void Promise.all(imagesRef.current.map((image, index) => image.status === 'failed' || image.status === 'pending' ? uploadImage(createdProduct.id, index) : Promise.resolve()))
  }

  const resetWorkflow = () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    setSetNumber('')
    setTitle('')
    setDescription('')
    setTheme('')
    setColorfulLifeCategory('')
    setAgeRecommendation('')
    setPieceCount('')
    setCondition('NEW')
    setOriginalPrice('')
    setSalePrice('')
    setCurrentStock('')
    setImages([])
    setFormError('')
    setIsCreating(false)
    setIsInitialUploadActive(false)
    setCreatedProduct(null)
    creationNotifiedRef.current = false
  }

  const hasFailedImages = images.some((image) => image.status === 'failed' || image.status === 'pending')
  const canRetryImages = createdProduct !== null && !isWorkflowActive && hasFailedImages

  return (
    <section className="product-panel" aria-labelledby="add-product-title">
      <div className="product-panel-heading"><div><p className="eyebrow">CATALOGUE</p><h2 id="add-product-title">Add product listing</h2></div>{createdProduct && <p role="status">Listing created: {createdProduct.id}</p>}</div>
      <form className="product-form" onSubmit={(event) => void createProduct(event)}>
        {!purchaseContext?.existingProduct && <>
        <label>Set number<input value={setNumber} onChange={(event) => setSetNumber(event.target.value)} required disabled={!!createdProduct} /></label>
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required disabled={!!createdProduct} /></label>
        <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!!createdProduct} /></label>
        <label>Theme<input value={theme} onChange={(event) => setTheme(event.target.value)} required disabled={!!createdProduct} /></label>
        {purchaseContext ? <label>Category<select value={categoryId} onChange={e => setCategoryId(e.target.value)} required disabled={!!createdProduct}><option value="">Select a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <label>Colorful Life Category<select aria-label="Colorful Life Category" value={colorfulLifeCategory} onChange={(event) => setColorfulLifeCategory(event.target.value as ColorfulLifeCategory)} required disabled={!!createdProduct}><option value="">Select a category</option>{colorfulLifeCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <label>Age recommendation<input value={ageRecommendation} onChange={(event) => setAgeRecommendation(event.target.value)} required disabled={!!createdProduct} /></label>
        <label>Piece count<input type="number" min="1" step="1" value={pieceCount} onChange={(event) => setPieceCount(event.target.value)} required disabled={!!createdProduct} /></label>
        </>}
        {purchaseContext?.existingProduct && <p>New listing for {purchaseContext.existingProduct.setNumber} · {purchaseContext.existingProduct.title}</p>}
        <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value as CreateProductRequest['condition'])} required disabled={!!createdProduct || !!purchaseContext}><option value="NEW">New</option><option value="USED_LIKE_NEW">Used like new</option></select></label>
        <label>Original price<input type="number" min="0.01" step="0.01" value={originalPrice} onChange={(event) => setOriginalPrice(event.target.value)} required disabled={!!createdProduct} /></label>
        <label>Sale price<input type="number" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} disabled={!!createdProduct} /></label>
        {purchaseContext ? <p>Initial stock: 0. Stock is added only after approval in Purchase Review.</p> : <label>Current stock<input type="number" min="0" step="1" value={currentStock} onChange={(event) => setCurrentStock(event.target.value)} disabled={!!createdProduct} /></label>}
        {!createdProduct && <label>Product images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelection} /></label>}
        {images.length > 0 && <div className="image-list" aria-label="Selected product images">{images.map((image, index) => <div className="selected-image" key={image.id}>
          <img src={image.previewUrl} alt={image.altText || `Selected product image ${index + 1}`} />
          <div><strong>{index === 0 ? 'Cover image' : `Image ${index + 1}`}</strong><span>{image.status === 'uploading' ? 'Uploading…' : image.status === 'uploaded' ? 'Uploaded' : image.status === 'failed' ? `Failed: ${image.error}` : 'Pending'}</span><label>Alt text<input value={image.altText} onChange={(event) => updateAltText(image.id, event.target.value)} disabled={image.status === 'uploaded'} /></label></div>
          {!createdProduct && <button type="button" onClick={() => removeImage(image.id)}>Remove</button>}
        </div>)}</div>}
        {formError && <p className="error-message" role="alert">{formError}</p>}
        {!createdProduct && <button className="button button-primary" type="submit" disabled={isCreating}>{isCreating ? 'Creating product…' : 'Create product listing'}</button>}
      </form>
      {createdProduct && <div className="upload-summary"><p role="status">Product created. {uploadedCount} of {images.length} images uploaded.</p>{canRetryImages && <button className="button button-primary" type="button" onClick={retryFailedImages}>Retry failed images</button>}{isWorkflowComplete && <><p role="status">Product listing and images are ready.</p><button className="button button-secondary" type="button" onClick={resetWorkflow}>Add another product</button></>}</div>}
    </section>
  )
}

export default AddProduct

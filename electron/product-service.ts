import type { AuthService } from './auth-service.js'
import type { ColorfulLifeCategory, CreateProductRequest, ImageUploadPayload, ListingImage, ProductListing } from './product-contract.js'

export type ProductErrorCode = 'validation' | 'conflict' | 'not-found' | 'limit' | 'forbidden' | 'server' | 'malformed-response'

export class ProductError extends Error {
  readonly code: ProductErrorCode
  readonly status: number | null

  constructor(code: ProductErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = 'ProductError'
    this.code = code
    this.status = status
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && isString(body.error)) return body.error
  } catch {
    // Use the safe operation-specific fallback below.
  }
  return fallback
}

const errorForResponse = async (response: Response, operation: 'create' | 'upload'): Promise<ProductError> => {
  const message = await errorMessage(response, 'The Colorful Life service could not complete this request.')
  if (response.status === 403) return new ProductError('forbidden', 'This account cannot manage products.', response.status)
  if (response.status === 404) return new ProductError('not-found', operation === 'upload' ? 'The product listing could not be found.' : message, response.status)
  if (response.status === 409) return new ProductError(response.status === 409 && operation === 'upload' ? 'limit' : 'conflict', message, response.status)
  if (response.status === 400) return new ProductError('validation', message, response.status)
  if (response.status >= 500) return new ProductError('server', 'The Colorful Life service is unavailable right now.', response.status)
  return new ProductError('server', message, response.status)
}

const parseImage = (value: unknown): ListingImage => {
  if (!isRecord(value) || !isNumber(value.id) || !isNumber(value.listingId) || !isString(value.url) || !isString(value.publicId) || (!isString(value.altText) && value.altText !== null) || !isNumber(value.sortOrder) || !isString(value.createdAt)) {
    throw new ProductError('malformed-response', 'The server returned an invalid product image response.')
  }
  return { id: value.id, listingId: value.listingId, url: value.url, publicId: value.publicId, altText: value.altText, sortOrder: value.sortOrder, createdAt: value.createdAt }
}

const parseProduct = (value: unknown): ProductListing => {
  if (!isRecord(value) || !isNumber(value.id) || !isNumber(value.legoProductId) || !isString(value.colorfulLifeCategory) || !isString(value.condition) || !isString(value.originalPrice) || (!isString(value.salePrice) && value.salePrice !== null) || !isNumber(value.currentStock) || !isString(value.createdAt) || !isString(value.updatedAt) || !isRecord(value.legoProduct) || !Array.isArray(value.listingImages)) {
    throw new ProductError('malformed-response', 'The server returned an invalid product response.')
  }
  const legoProduct = value.legoProduct
  if (!isNumber(legoProduct.id) || !isString(legoProduct.setNumber) || !isString(legoProduct.title) || (!isString(legoProduct.description) && legoProduct.description !== null) || !isString(legoProduct.theme) || !isString(legoProduct.ageRecommendation) || !isNumber(legoProduct.pieceCount) || !isString(legoProduct.createdAt) || !isString(legoProduct.updatedAt) || (value.condition !== 'NEW' && value.condition !== 'USED_LIKE_NEW') || !['HARRY_POTTER', 'STAR_WARS', 'FRIENDS', 'CITY', 'DISNEY', 'MARVEL', 'JURASSIC_WORLD', 'FLOWERS_AND_BOTANICALS', 'NINJAGO', 'HEROES', 'VEHICLES', 'CREATOR', 'OTHERS'].includes(value.colorfulLifeCategory)) {
    throw new ProductError('malformed-response', 'The server returned an invalid product response.')
  }
  return {
    id: value.id, legoProductId: value.legoProductId, colorfulLifeCategory: value.colorfulLifeCategory as ColorfulLifeCategory, condition: value.condition, originalPrice: value.originalPrice, salePrice: value.salePrice,
    currentStock: value.currentStock, createdAt: value.createdAt, updatedAt: value.updatedAt,
    legoProduct: { id: legoProduct.id, setNumber: legoProduct.setNumber, title: legoProduct.title, description: legoProduct.description, theme: legoProduct.theme, ageRecommendation: legoProduct.ageRecommendation, pieceCount: legoProduct.pieceCount, createdAt: legoProduct.createdAt, updatedAt: legoProduct.updatedAt },
    listingImages: value.listingImages.map(parseImage),
  }
}

const parseUploadResponse = (value: unknown): ListingImage => {
  if (!isRecord(value) || !('image' in value)) throw new ProductError('malformed-response', 'The server returned an invalid image response.')
  return parseImage(value.image)
}

export class ProductService {
  private readonly authService: AuthService

  constructor(authService: AuthService) {
    this.authService = authService
  }

  async createProduct(request: CreateProductRequest): Promise<ProductListing> {
    const response = await this.authService.authenticatedFetch('/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
    if (!response.ok) throw await errorForResponse(response, 'create')
    return parseProduct(await response.json())
  }

  async uploadListingImage(listingId: number, image: ImageUploadPayload): Promise<ListingImage> {
    const form = new FormData()
    form.append('file', new Blob([image.bytes.buffer as ArrayBuffer], { type: image.mimeType }), image.filename)
    if (image.altText !== undefined) form.append('altText', image.altText)
    const response = await this.authService.authenticatedFetch(`/products/${listingId}/images`, { method: 'POST', body: form })
    if (!response.ok) throw await errorForResponse(response, 'upload')
    return parseUploadResponse(await response.json())
  }
}

export const isImageUploadPayload = (value: unknown): value is ImageUploadPayload => {
  if (!isRecord(value) || !(value.bytes instanceof Uint8Array) || value.bytes.byteLength > 8 * 1024 * 1024 || !isString(value.filename) || value.filename.length === 0 || !isString(value.mimeType) || !['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType)) return false
  return value.altText === undefined || (isString(value.altText) && value.altText.length <= 300)
}

export const isCreateProductRequest = (value: unknown): value is CreateProductRequest => {
  if (!isRecord(value)) return false
  const { pieceCount, condition, originalPrice } = value
  if (!isString(value.setNumber) || !isString(value.title) || !isString(value.theme) || !isString(value.ageRecommendation) || typeof pieceCount !== 'number' || !Number.isInteger(pieceCount) || pieceCount <= 0 || (condition !== 'NEW' && condition !== 'USED_LIKE_NEW') || !isString(value.colorfulLifeCategory) || !['HARRY_POTTER', 'STAR_WARS', 'FRIENDS', 'CITY', 'DISNEY', 'MARVEL', 'JURASSIC_WORLD', 'FLOWERS_AND_BOTANICALS', 'NINJAGO', 'HEROES', 'VEHICLES', 'CREATOR', 'OTHERS'].includes(value.colorfulLifeCategory) || !isNumber(originalPrice) || originalPrice <= 0) return false
  const salePrice = value.salePrice
  const currentStock = value.currentStock
  return (value.description === undefined || isString(value.description)) && (salePrice === undefined || (isNumber(salePrice) && salePrice >= 0)) && (currentStock === undefined || (typeof currentStock === 'number' && Number.isInteger(currentStock) && currentStock >= 0))
}

export type ListingCondition = 'NEW' | 'USED_LIKE_NEW'
export type ColorfulLifeCategory = 'HARRY_POTTER' | 'STAR_WARS' | 'FRIENDS' | 'CITY' | 'DISNEY' | 'MARVEL' | 'JURASSIC_WORLD' | 'FLOWERS_AND_BOTANICALS' | 'NINJAGO' | 'HEROES' | 'VEHICLES' | 'CREATOR' | 'OTHERS'

export const colorfulLifeCategoryOptions = [
  ['HARRY_POTTER', 'Harry Potter'], ['STAR_WARS', 'Star Wars'], ['FRIENDS', 'Friends'], ['CITY', 'City'], ['DISNEY', 'Disney'], ['MARVEL', 'Marvel'],
  ['JURASSIC_WORLD', 'Jurassic World'], ['FLOWERS_AND_BOTANICALS', 'Flowers & Botanicals'], ['NINJAGO', 'Ninjago'], ['HEROES', 'Heroes'], ['VEHICLES', 'Vehicles'], ['CREATOR', 'Creator'], ['OTHERS', 'Others'],
] as const satisfies ReadonlyArray<readonly [ColorfulLifeCategory, string]>

export interface CreateProductRequest {
  setNumber: string
  title: string
  description?: string
  theme: string
  colorfulLifeCategory: ColorfulLifeCategory
  ageRecommendation: string
  pieceCount: number
  condition: ListingCondition
  originalPrice: number
  salePrice?: number
  currentStock?: number
}

export interface LegoProduct {
  id: number
  setNumber: string
  title: string
  description: string | null
  theme: string
  ageRecommendation: string
  pieceCount: number
  createdAt: string
  updatedAt: string
}

export interface ListingImage {
  id: number
  listingId: number
  url: string
  publicId: string
  altText: string | null
  sortOrder: number
  createdAt: string
}

export interface ProductListing {
  id: number
  legoProductId: number
  colorfulLifeCategory: ColorfulLifeCategory
  condition: ListingCondition
  originalPrice: string
  salePrice: string | null
  currentStock: number
  createdAt: string
  updatedAt: string
  legoProduct: LegoProduct
  listingImages: ListingImage[]
}

export interface ImageUploadPayload {
  bytes: Uint8Array
  filename: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  altText?: string
}

export interface AdminProductsApi {
  createProduct(request: CreateProductRequest): Promise<ProductListing>
  uploadListingImage(listingId: number, image: ImageUploadPayload): Promise<ListingImage>
}

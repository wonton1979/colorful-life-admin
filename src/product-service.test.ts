import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../electron/auth-service.js'
import { isImageUploadPayload, isProductMetadataUpdate, ProductError, ProductService } from '../electron/product-service.js'
import { normalizeImageUploadBytes } from './image-normalization.js'

const productBody = {
  id: 123, legoProductId: 456, colorfulLifeCategory: 'VEHICLES', category: { id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null }, condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2, availableStock: 2,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  legoProduct: { id: 456, setNumber: '60325', title: 'Example Set', description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 235, isRetired: false, isFeatureProduct: false, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, productImages: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
}

const imageBody = { image: { id: 1, legoProductId: 456, url: 'https://res.cloudinary.com/example/image/upload/image.jpg', publicId: 'colorful-life/products/456-example', altText: 'Cover', sortOrder: 0, createdAt: '2026-01-01' } }
const updatedLegoProductBody = {
  id: 456, setNumber: '60325', title: 'Updated Example Set', description: 'A shorter description', theme: 'City', ageRecommendation: '6+', pieceCount: 240, isRetired: true,
  categoryId: 29, category: { id: 29, name: 'Juniors', subtitle: null, description: null, imageUrl: null },
  productImages: [{ id: 9, url: 'https://cdn.example/product-image.jpg', publicId: 'product-image-9', altText: 'Box front', sortOrder: 0 }],
}
const bytesFromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16))
const pngBytes = bytesFromHex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082')
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])

const ipcCloneWithSurroundingBytes = (bytes: Uint8Array, offset: number) => {
  const backing = new Uint8Array(bytes.byteLength + offset + 5).fill(0x5a)
  backing.set(bytes, offset)
  return structuredClone(new Uint8Array(backing.buffer, offset, bytes.byteLength))
}

describe('ProductService', () => {
  it('updates shared LegoProduct metadata by product ID and parses category and ordered images', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(updatedLegoProductBody)))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const update = { title: 'Updated Example Set', categoryId: 29, isRetired: true }

    const result = await service.updateProductMetadata(456, update)

    expect(authenticatedFetch).toHaveBeenCalledWith('/admin/products/456', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
    })
    expect(result).toMatchObject({ id: 456, title: 'Updated Example Set', categoryId: 29, category: { id: 29, name: 'Juniors' } })
    expect(result.productImages).toEqual([{ id: 9, legoProductId: 456, url: 'https://cdn.example/product-image.jpg', publicId: 'product-image-9', altText: 'Box front', sortOrder: 0 }])
  })

  it('surfaces Admin metadata validation and duplicate set-number responses', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'setNumber already exists' }), { status: 409 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.updateProductMetadata(456, { title: 'Updated title' })).rejects.toMatchObject({ code: 'conflict', status: 409, message: 'setNumber already exists' } satisfies Partial<ProductError>)
  })

  it('sends the backend product JSON contract and parses the created listing', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(productBody), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.createProduct({ setNumber: '60325', title: 'Example Set', theme: 'City', categoryId: 11, ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99, currentStock: 2 })
    expect(result.id).toBe(123)
    expect(authenticatedFetch).toHaveBeenCalledWith('/products', expect.objectContaining({ method: 'POST', body: JSON.stringify({ setNumber: '60325', title: 'Example Set', theme: 'City', categoryId: 11, ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99, currentStock: 2 }) }))
  })

  it('constructs one multipart file upload from the safe binary payload', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(imageBody), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const bytes = new Uint8Array([1, 2, 3])
    const result = await service.uploadProductImage(456, { bytes, filename: 'cover.webp', mimeType: 'image/webp', altText: ' Cover ' })
    const init = authenticatedFetch.mock.calls[0][1] as RequestInit
    const form = init.body as FormData
    expect(form.get('altText')).toBe(' Cover ')
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(result.id).toBe(1)
    expect(result.legoProductId).toBe(456)
    expect(authenticatedFetch.mock.calls[0][0]).toBe('/products/by-product/456/images')
    expect(JSON.stringify(init)).not.toContain('publicId')
    expect(JSON.stringify(init)).not.toContain('folder')
  })

  it('maps product conflicts to a safe ProductError', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'setNumber already exists' }), { status: 409 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createProduct({ setNumber: '60325', title: 'Example Set', theme: 'City', categoryId: 11, ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99 })).rejects.toMatchObject({ code: 'conflict', status: 409, message: 'setNumber already exists' } satisfies Partial<ProductError>)
  })

  it('lists all public catalogue pages and parses shared presentation from LegoProduct', async () => {
    const second = { ...productBody, id: 124, legoProduct: { ...productBody.legoProduct, isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/artwork.jpg', catalogueArtworkPublicId: 'stored-artwork' } }
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [productBody], pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 2 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [second], pagination: { page: 2, pageSize: 100, totalItems: 2, totalPages: 2 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.listProducts()
    expect(result.map((listing) => listing.id)).toEqual([123, 124])
    expect(result[1].legoProduct.catalogueArtworkUrl).toBe('https://cdn.example/artwork.jpg')
    expect(authenticatedFetch.mock.calls.map((call) => call[0])).toEqual(['/products?page=1&pageSize=100', '/products?page=2&pageSize=100'])
  })

  it('parses the current category-based catalogue response contract', async () => {
    const currentBackendProduct = { ...productBody, colorfulLifeCategory: undefined, category: { id: 1, name: 'Harry Potter', subtitle: 'Magic in every build', description: null, imageUrl: null }, availableStock: 1 }
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [currentBackendProduct], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.listProducts()
    expect(result[0]).toMatchObject({ category: currentBackendProduct.category, availableStock: 1, colorfulLifeCategory: 'HARRY_POTTER' })
  })

  it('adapts product-level public offers with shared Product Images and presentation on LegoProduct', async () => {
    const backendProduct = { id: 456, setNumber: '60325', title: 'Example Set', description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 235, isRetired: true, isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/catalogue.jpg', catalogueArtworkPublicId: 'catalogue-artwork-123', productImages: [{ id: 9, legoProductId: 456, url: 'https://cdn.example/listing.jpg', publicId: 'listing-image-123', altText: 'Product front', sortOrder: 0, createdAt: '2026-01-01' }], createdAt: '2026-01-01', updatedAt: '2026-01-02', category: { id: 11, name: 'Vehicles' }, offers: [{ id: 123, condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2, availableStock: 2 }] }
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [backendProduct], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    expect(await service.listProducts()).toMatchObject([{
      id: 123,
      legoProductId: 456,
      condition: 'NEW',
      legoProduct: { setNumber: '60325', isRetired: true, isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/catalogue.jpg', catalogueArtworkPublicId: 'catalogue-artwork-123', productImages: [{ id: 9, legoProductId: 456, url: 'https://cdn.example/listing.jpg', publicId: 'listing-image-123', altText: 'Product front', sortOrder: 0, createdAt: '2026-01-01' }] },
    }])
  })

  it('loads every page of Admin listing records, including zero-stock listings and nested shared product presentation', async () => {
    const adminListing = (id: number, legoProductId: number, stock: number) => ({
      id, condition: 'NEW', active: true, usedLifecycle: null, currentStock: stock, availableStock: stock,
      legoProduct: { id: legoProductId, setNumber: id === 16900 ? '10759' : `SET-${id}`, title: id === 16900 ? 'Juniors set' : `Product ${id}`, category: id === 16900 ? { id: 29, name: 'Juniors' } : null, isFeatureProduct: id === 16900, catalogueArtworkUrl: id === 16900 ? 'https://cdn.example/juniors-art.jpg' : null, catalogueArtworkPublicId: id === 16900 ? 'juniors-art' : null, productImages: [] },
    })
    const page = (number: number, items: unknown[]) => ({ items, pagination: { page: number, pageSize: 50, totalItems: 51, totalPages: 2 } })
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page(1, Array.from({ length: 50 }, (_, index) => adminListing(index + 1, index + 2000, 2))))))
      .mockResolvedValueOnce(new Response(JSON.stringify(page(2, [adminListing(16900, 10759, 0)]))))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const listings = await service.listAdminProductListings()
    expect(authenticatedFetch.mock.calls.map(call => call[0])).toEqual([
      '/admin/product-listings?page=1&pageSize=50', '/admin/product-listings?page=2&pageSize=50',
    ])
    expect(listings).toHaveLength(51)
    expect(listings[50]).toMatchObject({ id: 16900, currentStock: 0, availableStock: 0, legoProduct: { id: 10759, isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/juniors-art.jpg', catalogueArtworkPublicId: 'juniors-art', category: { id: 29, name: 'Juniors' }, productImages: [] } })
  })

  it('rejects malformed Admin listing rows instead of returning partial listing data', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 1 }], pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.listAdminProductListings()).rejects.toMatchObject({ code: 'malformed-response' })
  })

  it('preserves shared LegoProduct presentation across zero-stock NEW and sellable Used sibling rows', async () => {
    const sharedProduct = {
      id: 14947, setNumber: '10759', title: "Lego Juniors Elastigirl's Rooftop Pursuit", category: { id: 29, name: 'Juniors' },
      isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/10759-artwork.jpg', catalogueArtworkPublicId: 'artwork-14947',
      productImages: [{ id: 771, url: 'https://cdn.example/10759-front.jpg', publicId: 'image-771', altText: null, sortOrder: 0 }],
    }
    const items = [
      { id: 16900, condition: 'NEW', active: true, usedLifecycle: null, currentStock: 0, availableStock: 0, legoProduct: sharedProduct },
      { id: 16901, condition: 'USED_LIKE_NEW', active: true, usedLifecycle: 'AVAILABLE', currentStock: 1, availableStock: 1, legoProduct: sharedProduct },
    ]
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items, pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)

    const listings = await service.listAdminProductListings()
    expect(listings.map(listing => [listing.id, listing.condition, listing.currentStock])).toEqual([
      [16900, 'NEW', 0], [16901, 'USED_LIKE_NEW', 1],
    ])
    for (const listing of listings) {
      expect(listing.legoProduct).toMatchObject({
        id: 14947, category: { id: 29, name: 'Juniors' }, isFeatureProduct: true,
        catalogueArtworkUrl: 'https://cdn.example/10759-artwork.jpg', catalogueArtworkPublicId: 'artwork-14947',
        productImages: [{ id: 771, legoProductId: 14947 }],
      })
    }
  })

  it('searches the bounded Admin LegoProduct endpoint and retains each Used status', async () => {
    const statuses = ['AVAILABLE', 'HISTORICAL_ONLY', 'NONE']
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: statuses.map((usedOfferStatus, id) => ({ id: id + 1, setNumber: `SET-${id}`, title: `Product ${id}`, description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 1, category: null, isRetired: id === 1, usedOfferStatus })), pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.searchLegoProducts('Harry Potter 1')
    expect(new URL(`https://admin.test${authenticatedFetch.mock.calls[0][0]}`).pathname).toBe('/admin/products')
    expect(new URL(`https://admin.test${authenticatedFetch.mock.calls[0][0]}`).searchParams.get('q')).toBe('Harry Potter 1')
    expect(result.items.map(item => item.usedOfferStatus)).toEqual(statuses)
    expect(result.items.map(item => item.isRetired)).toEqual([false, true, false])
  })

  it('preserves genuine PNG/JPEG condition-photo bytes and metadata through the IPC clone and multipart request', async () => {
    const created = { id: 99, legoProductId: 456, condition: 'USED_LIKE_NEW', originalPrice: '45.00', salePrice: null, currentStock: 1, usedLifecycle: 'AVAILABLE', damageDescription: 'Small crease' }
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const conditionPhotos = [
      { bytes: ipcCloneWithSurroundingBytes(pngBytes, 7), filename: '10759-used-1.png', mimeType: 'image/png' as const },
      { bytes: ipcCloneWithSurroundingBytes(jpegBytes, 11), filename: '10759-used-2.jpg', mimeType: 'image/jpeg' as const },
      { bytes: ipcCloneWithSurroundingBytes(pngBytes, 3), filename: '10759-used-3.png', mimeType: 'image/png' as const },
    ]
    expect(conditionPhotos.every(photo => photo.bytes.byteOffset > 0 && photo.bytes.byteLength < photo.bytes.buffer.byteLength)).toBe(true)
    expect(isImageUploadPayload({ ...conditionPhotos[0], bytes: Uint8Array.from(conditionPhotos[0].bytes) })).toBe(true)
    const input = { salePrice: 45, damageDescription: ' Small crease ', conditionPhotos }
    expect(await service.createUsedOffer(456, input)).toEqual({ ...created, condition: 'USED_LIKE_NEW', currentStock: 1, usedLifecycle: 'AVAILABLE' })
    const [url, init] = authenticatedFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/products/456/used-offers')
    expect(init.method).toBe('POST')
    expect(init.headers).toBeUndefined()
    const body = init.body as FormData
    expect(body.get('originalPrice')).toBe('45.00')
    expect(body.get('salePrice')).toBeNull()
    expect(body.get('damageDescription')).toBe('Small crease')
    const files = body.getAll('conditionPhotos') as File[]
    expect(files).toHaveLength(3)
    expect(files.map(file => [file.name, file.type])).toEqual([
      ['10759-used-1.png', 'image/png'], ['10759-used-2.jpg', 'image/jpeg'], ['10759-used-3.png', 'image/png'],
    ])
    for (const [index, expected] of [pngBytes, jpegBytes, pngBytes].entries()) {
      expect(new Uint8Array(await files[index].arrayBuffer())).toEqual(expected)
    }
    expect(Array.from(new Uint8Array(await files[0].arrayBuffer()).slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(authenticatedFetch.mock.calls[0][0]).not.toContain('/images')
  })

  it('copies only the PNG view bytes for Product Images uploads too', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(imageBody), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const bytes = ipcCloneWithSurroundingBytes(pngBytes, 9)
    await service.uploadProductImage(456, { bytes, filename: 'cover.png', mimeType: 'image/png' })
    expect(authenticatedFetch.mock.calls[0][0]).toBe('/products/by-product/456/images')
    const form = authenticatedFetch.mock.calls[0][1].body as FormData
    const file = form.get('file') as File
    expect(file.name).toBe('cover.png')
    expect(file.type).toBe('image/png')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pngBytes)
  })

  it('sends normalized mislabeled JPEG metadata and unchanged bytes in Used-offer multipart', async () => {
    const created = { id: 99, legoProductId: 456, condition: 'USED_LIKE_NEW', originalPrice: '19.99', salePrice: null, currentStock: 1, usedLifecycle: 'AVAILABLE', damageDescription: 'Creased box' }
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const payload = normalizeImageUploadBytes(jpegBytes, '10759-used-1.png')
    await service.createUsedOffer(456, { salePrice: 19.99, damageDescription: 'Creased box', conditionPhotos: [payload] })
    const [url, init] = authenticatedFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/products/456/used-offers')
    const file = (init.body as FormData).get('conditionPhotos') as File
    expect([file.name, file.type]).toEqual(['10759-used-1.jpg', 'image/jpeg'])
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(jpegBytes)
  })

  it('surfaces Backend magic-byte rejection for non-image content without treating the offer as created', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Uploaded content is not a valid supported image' }), { status: 400 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createUsedOffer(456, { salePrice: 45, damageDescription: 'Creased box', conditionPhotos: [{ bytes: new TextEncoder().encode('not a png'), filename: 'fake.png', mimeType: 'image/png' }] })).rejects.toMatchObject({ code: 'validation', message: 'Uploaded content is not a valid supported image' })
  })

  it('preserves backend Used-offer conflicts as ProductError 409', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'An available Used offer already exists for this product' }), { status: 409 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createUsedOffer(456, { salePrice: 10, damageDescription: 'Damage', conditionPhotos: [{ bytes: new Uint8Array([1]), filename: 'a.jpg', mimeType: 'image/jpeg' }] })).rejects.toMatchObject({ code: 'conflict', status: 409, message: 'An available Used offer already exists for this product' })
  })

  it('parses the actual feature response and refreshes presentation state separately', async () => {
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 456, isFeatureProduct: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ catalogueArtwork: { url: 'https://cdn.example/artwork.jpg', publicId: 'stored-artwork' } })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    expect(await service.setFeatureProduct(456)).toEqual({ id: 456, isFeatureProduct: true })
    const artwork = await service.uploadCatalogueArtwork(456, { bytes: new Uint8Array([1]), filename: 'artwork.jpg', mimeType: 'image/jpeg' })
    expect(artwork).toEqual({ url: 'https://cdn.example/artwork.jpg', publicId: 'stored-artwork' })
    await service.removeCatalogueArtwork(456)
    expect(authenticatedFetch.mock.calls[0]).toEqual(['/products/by-product/456/feature', { method: 'PATCH' }])
    expect(authenticatedFetch.mock.calls[1][0]).toBe('/products/by-product/456/catalogue-artwork')
    expect((authenticatedFetch.mock.calls[1][1] as RequestInit).method).toBe('PUT')
    expect(authenticatedFetch.mock.calls[2]).toEqual(['/products/by-product/456/catalogue-artwork', { method: 'DELETE' }])
  })

  it('uses LegoProduct identity for Product Image list, reorder, alt-text, and delete operations', async () => {
    const image = { id: 9, legoProductId: 456, url: 'https://cdn.example/image.jpg', publicId: 'image-9', altText: 'Front', sortOrder: 0 }
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ productImages: [image] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ productImages: [{ ...image, sortOrder: 1 }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ image: { ...image, altText: 'Box front' } })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)

    expect(await service.listProductImages(456)).toMatchObject([{ id: 9, legoProductId: 456, sortOrder: 0 }])
    expect(await service.reorderProductImages(456, [9])).toMatchObject([{ id: 9, legoProductId: 456, sortOrder: 1 }])
    expect(await service.updateProductImageAltText(456, 9, 'Box front')).toMatchObject({ id: 9, legoProductId: 456, altText: 'Box front' })
    await service.deleteProductImage(456, 9)

    expect(authenticatedFetch.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['/products/by-product/456/images', 'GET'],
      ['/products/by-product/456/images/order', 'PATCH'],
      ['/products/by-product/456/images/9', 'PATCH'],
      ['/products/by-product/456/images/9', 'DELETE'],
    ])
    expect(JSON.parse((authenticatedFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({ imageIds: [9] })
    expect(JSON.parse((authenticatedFetch.mock.calls[2][1] as RequestInit).body as string)).toEqual({ altText: 'Box front' })
  })
})

describe('Product metadata update validation', () => {
  it('accepts valid non-empty partial updates while rejecting empty, unknown, or invalid fields', () => {
    expect(isProductMetadataUpdate({ title: 'A corrected title' })).toBe(true)
    expect(isProductMetadataUpdate({ description: '' })).toBe(true)
    expect(isProductMetadataUpdate({ categoryId: 29, pieceCount: 240, isRetired: true })).toBe(true)
    expect(isProductMetadataUpdate({})).toBe(false)
    expect(isProductMetadataUpdate({ title: '  ' })).toBe(false)
    expect(isProductMetadataUpdate({ pieceCount: 2.5 })).toBe(false)
    expect(isProductMetadataUpdate({ categoryId: 0 })).toBe(false)
    expect(isProductMetadataUpdate({ isRetired: 'true' })).toBe(false)
    expect(isProductMetadataUpdate({ currentStock: 1 })).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../electron/auth-service.js'
import { ProductError, ProductService } from '../electron/product-service.js'

const productBody = {
  id: 123, legoProductId: 456, colorfulLifeCategory: 'VEHICLES', category: { id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null }, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, isFeatureProduct: false, condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2, availableStock: 2,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  legoProduct: { id: 456, setNumber: '60325', title: 'Example Set', description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 235, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  listingImages: [],
}

const imageBody = { image: { id: 1, listingId: 123, url: 'https://res.cloudinary.com/example/image/upload/image.jpg', publicId: 'colorful-life/products/123-example', altText: 'Cover', sortOrder: 0, createdAt: '2026-01-01' } }

describe('ProductService', () => {
  it('sends the backend product JSON contract and parses the created listing', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(productBody), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.createProduct({ setNumber: '60325', title: 'Example Set', theme: 'City', colorfulLifeCategory: 'VEHICLES', ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99, currentStock: 2 })
    expect(result.id).toBe(123)
    expect(authenticatedFetch).toHaveBeenCalledWith('/products', expect.objectContaining({ method: 'POST', body: JSON.stringify({ setNumber: '60325', title: 'Example Set', theme: 'City', colorfulLifeCategory: 'VEHICLES', ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99, currentStock: 2 }) }))
  })

  it('constructs one multipart file upload from the safe binary payload', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(imageBody), { status: 201 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const bytes = new Uint8Array([1, 2, 3])
    const result = await service.uploadListingImage(123, { bytes, filename: 'cover.webp', mimeType: 'image/webp', altText: ' Cover ' })
    const init = authenticatedFetch.mock.calls[0][1] as RequestInit
    const form = init.body as FormData
    expect(form.get('altText')).toBe(' Cover ')
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect(result.id).toBe(1)
    expect(JSON.stringify(init)).not.toContain('publicId')
    expect(JSON.stringify(init)).not.toContain('folder')
  })

  it('maps product conflicts to a safe ProductError', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'setNumber already exists' }), { status: 409 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    await expect(service.createProduct({ setNumber: '60325', title: 'Example Set', theme: 'City', colorfulLifeCategory: 'CITY', ageRecommendation: '6+', pieceCount: 235, condition: 'NEW', originalPrice: 29.99 })).rejects.toMatchObject({ code: 'conflict', status: 409, message: 'setNumber already exists' } satisfies Partial<ProductError>)
  })

  it('lists all catalogue pages and parses presentation fields from the backend', async () => {
    const second = { ...productBody, id: 124, isFeatureProduct: true, catalogueArtworkUrl: 'https://cdn.example/artwork.jpg', catalogueArtworkPublicId: 'stored-artwork' }
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [productBody], pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 2 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [second], pagination: { page: 2, pageSize: 100, totalItems: 2, totalPages: 2 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.listProducts()
    expect(result.map((listing) => listing.id)).toEqual([123, 124])
    expect(result[1].catalogueArtworkUrl).toBe('https://cdn.example/artwork.jpg')
    expect(authenticatedFetch.mock.calls.map((call) => call[0])).toEqual(['/products?page=1&pageSize=100', '/products?page=2&pageSize=100'])
  })

  it('parses the current category-based catalogue response contract', async () => {
    const currentBackendProduct = { ...productBody, colorfulLifeCategory: undefined, category: { id: 1, name: 'Harry Potter', subtitle: 'Magic in every build', description: null, imageUrl: null }, availableStock: 1 }
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [currentBackendProduct], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } })))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    const result = await service.listProducts()
    expect(result[0]).toMatchObject({ category: currentBackendProduct.category, availableStock: 1, colorfulLifeCategory: 'HARRY_POTTER' })
  })

  it('parses the actual feature response and refreshes presentation state separately', async () => {
    const authenticatedFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, isFeatureProduct: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ catalogueArtwork: { url: 'https://cdn.example/artwork.jpg', publicId: 'stored-artwork' } })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const service = new ProductService({ authenticatedFetch } as unknown as AuthService)
    expect(await service.setFeatureProduct(123)).toEqual({ id: 123, isFeatureProduct: true })
    const artwork = await service.uploadCatalogueArtwork(123, { bytes: new Uint8Array([1]), filename: 'artwork.jpg', mimeType: 'image/jpeg' })
    expect(artwork).toEqual({ url: 'https://cdn.example/artwork.jpg', publicId: 'stored-artwork' })
    await service.removeCatalogueArtwork(123)
    expect(authenticatedFetch.mock.calls[0]).toEqual(['/products/123/feature', { method: 'PATCH' }])
    expect(authenticatedFetch.mock.calls[1][0]).toBe('/products/123/catalogue-artwork')
    expect((authenticatedFetch.mock.calls[1][1] as RequestInit).method).toBe('PUT')
    expect(authenticatedFetch.mock.calls[2]).toEqual(['/products/123/catalogue-artwork', { method: 'DELETE' }])
  })
})

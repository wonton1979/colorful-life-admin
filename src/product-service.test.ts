import { describe, expect, it, vi } from 'vitest'
import type { AuthService } from '../electron/auth-service.js'
import { ProductError, ProductService } from '../electron/product-service.js'

const productBody = {
  id: 123, legoProductId: 456, colorfulLifeCategory: 'VEHICLES', condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2,
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
})

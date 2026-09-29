import { expect, it, vi } from 'vitest'
import { CategoryError, CategoryService, validateCategoryCreate } from '../electron/category-service'
import type { AuthService } from '../electron/auth-service'

const category = { id: 8, name: 'Technic', subtitle: null, description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }

it('normalizes optional category text and posts the category contract', async () => {
  const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(category), { status: 201 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)
  await expect(service.create({ name: '  Technic ', subtitle: '   ', description: '  ' })).resolves.toEqual(category)
  expect(authenticatedFetch).toHaveBeenCalledWith('/admin/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Technic', subtitle: null, description: null }),
  })
})

it('parses populated and nullable catalogue thumbnail fields without changing opening artwork', async () => {
  const populated = { ...category, imageUrl: 'https://cdn.example/opening.jpg', imagePublicId: 'category-artwork/8-opening', thumbnailUrl: 'https://cdn.example/thumbnail.jpg', thumbnailPublicId: 'category-thumbnail/8-thumb' }
  const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([populated, category]), { status: 200 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)

  await expect(service.list()).resolves.toEqual([populated, category])
  expect(authenticatedFetch).toHaveBeenCalledWith('/admin/categories')
})

it('fetches complete category product availability from the authenticated category endpoint', async () => {
  const availability = { totalProducts: 15, totalInventory: 66, activeProducts: 12, inactiveProducts: 3 }
  const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(availability), { status: 200 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)

  await expect(service.getProductAvailability(42)).resolves.toEqual(availability)
  expect(authenticatedFetch).toHaveBeenCalledWith('/admin/categories/42/product-availability')
})

it('accepts zero availability counts and rejects malformed category summaries', async () => {
  const authenticatedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ totalProducts: 0, totalInventory: 0, activeProducts: 0, inactiveProducts: 0 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ totalProducts: 1, totalInventory: -1, activeProducts: 1, inactiveProducts: 0 }), { status: 200 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)

  await expect(service.getProductAvailability(42)).resolves.toEqual({ totalProducts: 0, totalInventory: 0, activeProducts: 0, inactiveProducts: 0 })
  await expect(service.getProductAvailability(42)).rejects.toMatchObject({ code: 'malformed-response' })
})

it('uploads, replaces, and deletes thumbnail artwork through the Backend thumbnail-artwork endpoint', async () => {
  const uploaded = { ...category, imageUrl: 'https://cdn.example/opening.jpg', imagePublicId: 'category-artwork/8-opening', thumbnailUrl: 'https://cdn.example/thumbnail.jpg', thumbnailPublicId: 'category-thumbnail/8-thumb' }
  const deleted = { ...uploaded, thumbnailUrl: null, thumbnailPublicId: null }
  const authenticatedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(uploaded), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(deleted), { status: 200 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)
  const image = { bytes: new Uint8Array([1, 2, 3]), filename: 'thumbnail.png', mimeType: 'image/png' }

  await expect(service.uploadThumbnailArtwork(8, image)).resolves.toEqual(uploaded)
  await expect(service.removeThumbnailArtwork(8)).resolves.toEqual(deleted)
  expect(authenticatedFetch).toHaveBeenNthCalledWith(1, '/admin/categories/8/thumbnail-artwork', expect.objectContaining({ method: 'PUT', body: expect.any(FormData) }))
  const form = authenticatedFetch.mock.calls[0][1].body as FormData
  expect((form.get('file') as File).name).toBe('thumbnail.png')
  expect(authenticatedFetch).toHaveBeenNthCalledWith(2, '/admin/categories/8/thumbnail-artwork', { method: 'DELETE' })
})

it('keeps category opening artwork upload and delete on the existing artwork endpoint', async () => {
  const openingArtwork = { ...category, imageUrl: 'https://cdn.example/opening.jpg', imagePublicId: 'category-artwork/8-opening' }
  const authenticatedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(openingArtwork), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(category), { status: 200 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)

  await service.uploadArtwork(8, { bytes: new Uint8Array([4]), filename: 'opening.jpg', mimeType: 'image/jpeg' })
  await service.removeArtwork(8)
  expect(authenticatedFetch.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
    ['/admin/categories/8/artwork', 'PUT'],
    ['/admin/categories/8/artwork', 'DELETE'],
  ])
})

it('validates and trims create payload fields at the Electron boundary', () => {
  expect(validateCategoryCreate({ name: ' City ', subtitle: ' Streets ', description: null })).toEqual({ name: 'City', subtitle: 'Streets', description: null })
  for (const value of [
    {}, { name: '  ' }, { name: 'x'.repeat(201) }, { name: 'City', subtitle: 'x'.repeat(301) },
    { name: 'City', description: 'x'.repeat(2001) }, { name: 'City', artwork: 'not supported' },
  ]) expect(() => validateCategoryCreate(value)).toThrow(CategoryError)
})

it('surfaces duplicate, validation, and authentication errors with useful feedback', async () => {
  const authenticatedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'A category with this name already exists.' }), { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Category name is required.' }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'SESSION_INVALID', message: 'Invalid or expired token' } }), { status: 401 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'conflict', message: 'A category with this name already exists.' })
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'validation', message: 'Category name is required.' })
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'session-invalid', backendCode: 'SESSION_INVALID', message: 'Your session has expired. Please sign in again.' })
})

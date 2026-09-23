import { expect, it, vi } from 'vitest'
import { CategoryError, CategoryService, validateCategoryCreate } from '../electron/category-service'
import type { AuthService } from '../electron/auth-service'

const category = { id: 8, name: 'Technic', subtitle: null, description: null, imageUrl: null, imagePublicId: null }

it('normalizes optional category text and posts the category contract', async () => {
  const authenticatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(category), { status: 201 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)
  await expect(service.create({ name: '  Technic ', subtitle: '   ', description: '  ' })).resolves.toEqual(category)
  expect(authenticatedFetch).toHaveBeenCalledWith('/admin/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Technic', subtitle: null, description: null }),
  })
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
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
  const service = new CategoryService({ authenticatedFetch } as unknown as AuthService)
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'conflict', message: 'A category with this name already exists.' })
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'validation', message: 'Category name is required.' })
  await expect(service.create({ name: 'Technic', subtitle: null, description: null })).rejects.toMatchObject({ code: 'session-invalid', message: 'Your session is no longer valid. Please sign in again.' })
})

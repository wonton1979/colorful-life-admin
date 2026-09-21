import type { AuthService } from './auth-service.js'
import type { AdminCategory, AdminCategoriesApi, CategoryTextUpdate } from './category-contract.js'

export type CategoryErrorCode = 'validation' | 'conflict' | 'not-found' | 'forbidden' | 'server' | 'malformed-response'

export class CategoryError extends Error {
  readonly code: CategoryErrorCode
  readonly status: number | null
  constructor(code: CategoryErrorCode, message: string, status: number | null = null) { super(message); this.name = 'CategoryError'; this.code = code; this.status = status }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const errorMessage = async (response: Response, fallback: string) => {
  try { const body: unknown = await response.json(); if (isRecord(body) && isString(body.error)) return body.error } catch { /* fallback */ }
  return fallback
}

const parseCategory = (value: unknown): AdminCategory => {
  if (!isRecord(value) || !isNumber(value.id) || !isString(value.name) || (!isString(value.subtitle) && value.subtitle !== null) || (!isString(value.description) && value.description !== null) || (!isString(value.imageUrl) && value.imageUrl !== null) || (!isString(value.imagePublicId) && value.imagePublicId !== null)) throw new CategoryError('malformed-response', 'The server returned an invalid category response.')
  return { id: value.id, name: value.name, subtitle: value.subtitle, description: value.description, imageUrl: value.imageUrl, imagePublicId: value.imagePublicId }
}

export class CategoryService implements AdminCategoriesApi {
  private readonly auth: AuthService
  constructor(auth: AuthService) { this.auth = auth }

  async list() { const response = await this.auth.authenticatedFetch('/admin/categories'); if (!response.ok) throw await this.responseError(response, 'list'); const body: unknown = await response.json(); if (!Array.isArray(body)) throw new CategoryError('malformed-response', 'The server returned invalid categories.'); return body.map(parseCategory) }

  async update(categoryId: number, update: CategoryTextUpdate) { return this.sendJson(`/admin/categories/${categoryId}`, update) }

  async uploadArtwork(categoryId: number, image: { bytes: Uint8Array; filename: string; mimeType: string }) {
    const form = new FormData(); form.append('file', new Blob([image.bytes], { type: image.mimeType }), image.filename)
    const response = await this.auth.authenticatedFetch(`/admin/categories/${categoryId}/artwork`, { method: 'PUT', body: form })
    return this.parseMutation(response)
  }

  async removeArtwork(categoryId: number) {
    const response = await this.auth.authenticatedFetch(`/admin/categories/${categoryId}/artwork`, { method: 'DELETE' })
    return this.parseMutation(response)
  }

  private async sendJson(path: string, update: CategoryTextUpdate) {
    const response = await this.auth.authenticatedFetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) })
    return this.parseMutation(response)
  }

  private async parseMutation(response: Response) { if (!response.ok) throw await this.responseError(response, 'mutation'); return parseCategory(await response.json()) }

  private async responseError(response: Response, operation: 'list' | 'mutation') {
    const message = await errorMessage(response, 'The category action could not be completed.')
    if (response.status === 400) return new CategoryError('validation', message, response.status)
    if (response.status === 403) return new CategoryError('forbidden', 'This account cannot manage categories.', response.status)
    if (response.status === 404 && operation === 'list') return new CategoryError('server', 'The category management endpoint was not found. Restart the backend and try again.', response.status)
    if (response.status === 404) return new CategoryError('not-found', 'The category could not be found.', response.status)
    if (response.status === 409) return new CategoryError('conflict', message, response.status)
    return new CategoryError('server', response.status >= 500 ? 'The Colorful Life service is unavailable right now.' : message, response.status)
  }
}

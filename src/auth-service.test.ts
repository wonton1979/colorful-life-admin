import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError, AuthService } from '../electron/auth-service.js'

const adminProfile = { id: 7, email: 'admin@example.com', role: 'ADMIN', createdAt: '2026-01-01', updatedAt: '2026-01-01' }

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('AuthService', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('logs in, verifies the profile, and keeps the token out of the result', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ token: 'jwt-token' })).mockResolvedValueOnce(response(adminProfile))
    const service = new AuthService('http://backend.test', fetcher)

    await expect(service.login({ email: 'admin@example.com', password: 'secret' })).resolves.toEqual(adminProfile)
    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://backend.test/auth/login', expect.objectContaining({ method: 'POST' }))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://backend.test/profile', { headers: { Authorization: 'Bearer jwt-token' } })
  })

  it('rejects invalid credentials', async () => {
    const service = new AuthService('http://backend.test', vi.fn().mockResolvedValue(response({ error: 'Invalid credentials' }, 401)))
    await expect(service.login({ email: 'admin@example.com', password: 'wrong' })).rejects.toMatchObject({ code: 'invalid-credentials' })
  })

  it('rejects a valid login when the profile is not ADMIN', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ token: 'customer-token' })).mockResolvedValueOnce(response({ ...adminProfile, role: 'CUSTOMER' }))
    const service = new AuthService('http://backend.test', fetcher)
    await expect(service.login({ email: 'customer@example.com', password: 'secret' })).rejects.toMatchObject({ code: 'not-authorized' })
    await expect(service.restore()).resolves.toBeNull()
  })

  it('maps network and malformed responses safely', async () => {
    const networkService = new AuthService('http://backend.test', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(networkService.login({ email: 'a@example.com', password: 'secret' })).rejects.toMatchObject({ code: 'network' })

    const malformedService = new AuthService('http://backend.test', vi.fn().mockResolvedValue(response({ nope: true })))
    await expect(malformedService.login({ email: 'a@example.com', password: 'secret' })).rejects.toBeInstanceOf(AuthError)
  })

  it('restores a session and clears an expired session or logout', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ token: 'jwt-token' })).mockResolvedValueOnce(response(adminProfile)).mockResolvedValueOnce(response({ error: 'Invalid or expired token' }, 401))
    const service = new AuthService('http://backend.test', fetcher)
    await service.login({ email: 'admin@example.com', password: 'secret' })
    await expect(service.restore()).resolves.toBeNull()
    await expect(service.restore()).resolves.toBeNull()

    const secondService = new AuthService('http://backend.test', vi.fn())
    secondService.logout()
    await expect(secondService.restore()).resolves.toBeNull()
  })
})

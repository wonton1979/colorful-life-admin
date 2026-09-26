import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminProductsApi } from '../electron/product-contract.js'
import { serializeIpcError } from '../electron/ipc-error-contract.js'
import { adminProducts } from './admin-api.js'

describe('renderer Admin API bridge', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restores structured error fields into a renderer Error after preload forwarding', async () => {
    const errorEnvelope = serializeIpcError(Object.assign(new Error('The Colorful Life service is unavailable right now.'), {
      code: 'server',
      backendCode: 'INTERNAL_SERVER_ERROR',
      status: 500,
    }))
    vi.stubGlobal('window', {
      adminProducts: { listProducts: vi.fn().mockResolvedValue(errorEnvelope) } as unknown as AdminProductsApi,
    })

    await expect(adminProducts.listProducts()).rejects.toMatchObject({
      message: 'The Colorful Life service is unavailable right now.',
      code: 'server',
      backendCode: 'INTERNAL_SERVER_ERROR',
      status: 500,
    })
  })
})

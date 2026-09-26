export interface BackendErrorDetails {
  code: string | null
  message: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export async function readBackendError(response: Response, fallback: string): Promise<BackendErrorDetails> {
  try {
    const body: unknown = await response.clone().json()
    if (!isRecord(body)) return { code: null, message: fallback }

    if (isRecord(body.error)) {
      return {
        code: typeof body.error.code === 'string' ? body.error.code : null,
        message: typeof body.error.message === 'string' ? body.error.message : fallback,
      }
    }

    if (typeof body.error === 'string') return { code: null, message: body.error }
  } catch {
    // Keep the operation-specific fallback for unreadable response bodies.
  }
  return { code: null, message: fallback }
}

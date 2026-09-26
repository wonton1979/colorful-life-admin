export interface SerializedIpcError {
  name: string
  message: string
  code: string | null
  backendCode: string | null
  status: number | null
}

export interface IpcErrorEnvelope {
  __colorfulLifeAdminIpcError: SerializedIpcError
}

export type AdminIpcError = Error & SerializedIpcError

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function serializeIpcError(error: unknown): IpcErrorEnvelope {
  const value = isRecord(error) ? error : {}
  return {
    __colorfulLifeAdminIpcError: {
      name: typeof value.name === 'string' ? value.name : 'Error',
      message: error instanceof Error ? error.message : 'The Admin operation could not be completed.',
      code: typeof value.code === 'string' ? value.code : null,
      backendCode: typeof value.backendCode === 'string' ? value.backendCode : null,
      status: typeof value.status === 'number' ? value.status : null,
    },
  }
}

export function isIpcErrorEnvelope(value: unknown): value is IpcErrorEnvelope {
  if (!isRecord(value) || !isRecord(value.__colorfulLifeAdminIpcError)) return false
  const details = value.__colorfulLifeAdminIpcError
  return typeof details.name === 'string' && typeof details.message === 'string' &&
    (typeof details.code === 'string' || details.code === null) &&
    (typeof details.backendCode === 'string' || details.backendCode === null) &&
    (typeof details.status === 'number' || details.status === null)
}

export function restoreIpcError(envelope: IpcErrorEnvelope): AdminIpcError {
  const details = envelope.__colorfulLifeAdminIpcError
  const error = new Error(details.message) as Error & SerializedIpcError
  error.name = details.name
  error.code = details.code
  error.backendCode = details.backendCode
  error.status = details.status
  return error
}

export function isAdminIpcError(value: unknown): value is AdminIpcError {
  if (!(value instanceof Error) || !isRecord(value)) return false
  return (typeof value.code === 'string' || value.code === null) &&
    (typeof value.backendCode === 'string' || value.backendCode === null) &&
    (typeof value.status === 'number' || value.status === null)
}

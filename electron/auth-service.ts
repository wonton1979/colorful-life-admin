import type { AdminUser, LoginCredentials } from './auth-contract.js'

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'validation'
  | 'not-authorized'
  | 'network'
  | 'server'
  | 'malformed-response'
  | 'session-invalid'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(
    code: AuthErrorCode,
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'AuthError'
  }
}

interface LoginResponse {
  token: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    throw new AuthError('malformed-response', 'The server returned an unreadable response.')
  }
}

const parseLoginResponse = (value: unknown): LoginResponse => {
  if (!isRecord(value) || typeof value.token !== 'string' || value.token.trim() === '') {
    throw new AuthError('malformed-response', 'The server returned an invalid sign-in response.')
  }
  return { token: value.token }
}

const parseProfileResponse = (value: unknown): AdminUser => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    typeof value.email !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new AuthError('malformed-response', 'The server returned an invalid profile response.')
  }

  if (value.role !== 'ADMIN') {
    throw new AuthError('not-authorized', 'This account does not have administrator access.')
  }

  return {
    id: value.id,
    email: value.email,
    role: 'ADMIN',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

const errorForResponse = (status: number, operation: 'login' | 'profile'): AuthError => {
  if (operation === 'login' && status === 400) {
    return new AuthError('validation', 'Enter a valid email address and password.')
  }
  if (operation === 'login' && status === 401) {
    return new AuthError('invalid-credentials', 'The email or password is incorrect.')
  }
  if (operation === 'profile' && status === 401) {
    return new AuthError('session-invalid', 'Your session is no longer valid. Please sign in again.')
  }
  if (status >= 500) {
    return new AuthError('server', 'The Colorful Life service is unavailable right now.')
  }
  return new AuthError('server', 'The Colorful Life service could not complete the request.')
}

export class AuthService {
  private token: string | null = null
  private readonly backendUrl: string
  private readonly fetcher: Fetcher

  constructor(
    backendUrl: string,
    fetcher: Fetcher,
  ) {
    this.backendUrl = backendUrl
    this.fetcher = fetcher
  }

  async login(credentials: LoginCredentials): Promise<AdminUser> {
    this.token = null
    let loginResponse: Response
    try {
      loginResponse = await this.fetcher(`${this.backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
    } catch {
      throw new AuthError('network', 'Unable to reach the Colorful Life service.')
    }

    if (!loginResponse.ok) {
      throw errorForResponse(loginResponse.status, 'login')
    }

    const loginBody = parseLoginResponse(await parseJson(loginResponse))
    this.token = loginBody.token
    try {
      return await this.fetchProfile()
    } catch (error) {
      this.token = null
      throw error
    }
  }

  async restore(): Promise<AdminUser | null> {
    if (this.token === null) return null
    try {
      return await this.fetchProfile()
    } catch (error) {
      this.token = null
      if (error instanceof AuthError && error.code === 'session-invalid') return null
      throw error
    }
  }

  logout(): void {
    this.token = null
  }

  private async fetchProfile(): Promise<AdminUser> {
    let profileResponse: Response
    try {
      profileResponse = await this.fetcher(`${this.backendUrl}/profile`, {
        headers: { Authorization: `Bearer ${this.token ?? ''}` },
      })
    } catch {
      throw new AuthError('network', 'Unable to reach the Colorful Life service.')
    }
    if (!profileResponse.ok) {
      throw errorForResponse(profileResponse.status, 'profile')
    }
    return parseProfileResponse(await parseJson(profileResponse))
  }
}

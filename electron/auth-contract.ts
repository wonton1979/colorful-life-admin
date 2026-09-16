export interface AdminUser {
  id: number
  email: string
  role: 'ADMIN'
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AdminAuthApi {
  login(credentials: LoginCredentials): Promise<AdminUser>
  restore(): Promise<AdminUser | null>
  logout(): Promise<void>
}

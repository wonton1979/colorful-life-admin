import type { AdminProductsApi } from '../electron/product-contract.js'
import type { AdminCategoriesApi } from '../electron/category-contract.js'

declare global {
  interface AdminUser {
    id: number
    email: string
    role: 'ADMIN'
    createdAt: string
    updatedAt: string
  }

  interface AdminAuthApi {
    login(credentials: { email: string; password: string }): Promise<AdminUser>
    restore(): Promise<AdminUser | null>
    logout(): Promise<void>
  }

  interface Window {
    adminAuth: AdminAuthApi
    adminProducts: AdminProductsApi
    adminCategories: AdminCategoriesApi
  }
}

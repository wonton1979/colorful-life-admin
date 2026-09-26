import type { AdminProductsApi } from '../electron/product-contract.js'
import type { AdminCategoriesApi } from '../electron/category-contract.js'
import type { AdminPurchasesApi } from '../electron/purchase-contract.js'
import type { AdminAuthApi } from '../electron/auth-contract.js'

declare global {
  interface AdminUser {
    id: number
    email: string
    role: 'ADMIN'
    createdAt: string
    updatedAt: string
  }

  interface Window {
    adminAuth: AdminAuthApi
    adminProducts: AdminProductsApi
    adminCategories: AdminCategoriesApi
    adminPurchases: AdminPurchasesApi
  }
}

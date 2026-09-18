import { contextBridge, ipcRenderer } from 'electron'
import type { AdminAuthApi } from './auth-contract.js'
import type { AdminProductsApi } from './product-contract.js'

// Keep the preload as the only future boundary for renderer-to-main IPC.
const adminAuth: AdminAuthApi = {
  login: (credentials) => ipcRenderer.invoke('admin-auth:login', credentials),
  restore: () => ipcRenderer.invoke('admin-auth:restore'),
  logout: () => ipcRenderer.invoke('admin-auth:logout'),
}

contextBridge.exposeInMainWorld('adminAuth', adminAuth)

const adminProducts: AdminProductsApi = {
  createProduct: (request) => ipcRenderer.invoke('admin-products:create', request),
  uploadListingImage: (listingId, image) => ipcRenderer.invoke('admin-products:upload-image', listingId, image),
}

contextBridge.exposeInMainWorld('adminProducts', adminProducts)

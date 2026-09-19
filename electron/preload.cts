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
  listProducts: () => ipcRenderer.invoke('admin-products:list'),
  uploadListingImage: (listingId, image) => ipcRenderer.invoke('admin-products:upload-image', listingId, image),
  setFeatureProduct: (listingId) => ipcRenderer.invoke('admin-products:set-feature', listingId),
  uploadCatalogueArtwork: (listingId, image) => ipcRenderer.invoke('admin-products:upload-catalogue-artwork', listingId, image),
  removeCatalogueArtwork: (listingId) => ipcRenderer.invoke('admin-products:remove-catalogue-artwork', listingId),
}

contextBridge.exposeInMainWorld('adminProducts', adminProducts)

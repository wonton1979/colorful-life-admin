import { contextBridge, ipcRenderer } from 'electron'
import type { AdminAuthApi } from './auth-contract.js'
import type { AdminProductsApi } from './product-contract.js'
import type { AdminCategoriesApi } from './category-contract.js'
import type { AdminPurchasesApi } from './purchase-contract.js'

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

const adminCategories: AdminCategoriesApi = {
  list: () => ipcRenderer.invoke('admin-categories:list'),
  create: (input) => ipcRenderer.invoke('admin-categories:create', input),
  update: (categoryId, update) => ipcRenderer.invoke('admin-categories:update', categoryId, update),
  uploadArtwork: (categoryId, image) => ipcRenderer.invoke('admin-categories:upload-artwork', categoryId, image),
  removeArtwork: (categoryId) => ipcRenderer.invoke('admin-categories:remove-artwork', categoryId),
}

contextBridge.exposeInMainWorld('adminCategories', adminCategories)

const adminPurchases: AdminPurchasesApi = {
  createManual: (input) => ipcRenderer.invoke('admin-purchases:create-manual', input),
  review: (id) => ipcRenderer.invoke('admin-purchases:review', id),
  amend: (id, itemId, input) => ipcRenderer.invoke('admin-purchases:amend', id, itemId, input),
  resolve: (id, groupId, input) => ipcRenderer.invoke('admin-purchases:resolve', id, groupId, input),
  receive: (id, groupId, input) => ipcRenderer.invoke('admin-purchases:receive', id, groupId, input),
  searchProducts: (id, query) => ipcRenderer.invoke('admin-purchases:search-products', id, query),
  createListing: (id, input) => ipcRenderer.invoke('admin-purchases:create-listing', id, input),
  importPdf: (file) => ipcRenderer.invoke('admin-purchases:import-pdf', file),
  list: (page, limit) => ipcRenderer.invoke('admin-purchases:list', page, limit),
  get: (purchaseId) => ipcRenderer.invoke('admin-purchases:get', purchaseId),
}

contextBridge.exposeInMainWorld('adminPurchases', adminPurchases)

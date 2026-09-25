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
  listAdminProductListings: () => ipcRenderer.invoke('admin-products:list-admin-product-listings'),
  listProductImages: (productId) => ipcRenderer.invoke('admin-products:list-product-images', productId),
  uploadProductImage: (productId, image) => ipcRenderer.invoke('admin-products:upload-image', productId, image),
  reorderProductImages: (productId, imageIds) => ipcRenderer.invoke('admin-products:reorder-product-images', productId, imageIds),
  updateProductImageAltText: (productId, imageId, altText) => ipcRenderer.invoke('admin-products:update-product-image-alt-text', productId, imageId, altText),
  deleteProductImage: (productId, imageId) => ipcRenderer.invoke('admin-products:delete-product-image', productId, imageId),
  setFeatureProduct: (productId) => ipcRenderer.invoke('admin-products:set-feature', productId),
  uploadCatalogueArtwork: (productId, image) => ipcRenderer.invoke('admin-products:upload-catalogue-artwork', productId, image),
  removeCatalogueArtwork: (productId) => ipcRenderer.invoke('admin-products:remove-catalogue-artwork', productId),
  searchLegoProducts: (query, page, pageSize) => ipcRenderer.invoke('admin-products:lookup-lego-products', query, page, pageSize),
  createUsedOffer: (productId, input) => ipcRenderer.invoke('admin-products:create-used-offer', productId, input),
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

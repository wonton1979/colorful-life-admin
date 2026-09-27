import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AdminAuthApi, AdminSessionEndedNotice } from './auth-contract.js'
import type { AdminProductsApi } from './product-contract.js'
import type { AdminCategoriesApi } from './category-contract.js'
import type { AdminPurchasesApi } from './purchase-contract.js'

// Keep cloneable IPC error envelopes as data until the renderer restores their Error fields.
const forwardIpcResult = <Result,>(request: Promise<Result>): Promise<Result> => request

// Keep the preload as the only future boundary for renderer-to-main IPC.
const adminAuth: AdminAuthApi = {
  login: (credentials) => forwardIpcResult(ipcRenderer.invoke('admin-auth:login', credentials)),
  restore: () => forwardIpcResult(ipcRenderer.invoke('admin-auth:restore')),
  renewSession: () => forwardIpcResult(ipcRenderer.invoke('admin-auth:renew')),
  onSessionRenewed: (listener) => {
    const channelListener = (_event: IpcRendererEvent, accessTokenExpiresAt: string) => listener(accessTokenExpiresAt)
    ipcRenderer.on('admin-auth:session-renewed', channelListener)
    return () => ipcRenderer.removeListener('admin-auth:session-renewed', channelListener)
  },
  onSessionEnded: (listener) => {
    const channelListener = (_event: IpcRendererEvent, notice: AdminSessionEndedNotice) => listener(notice)
    ipcRenderer.on('admin-auth:session-ended', channelListener)
    return () => ipcRenderer.removeListener('admin-auth:session-ended', channelListener)
  },
  logout: () => forwardIpcResult(ipcRenderer.invoke('admin-auth:logout')),
}

contextBridge.exposeInMainWorld('adminAuth', adminAuth)

const adminProducts: AdminProductsApi = {
  createProduct: (request) => forwardIpcResult(ipcRenderer.invoke('admin-products:create', request)),
  listProducts: () => forwardIpcResult(ipcRenderer.invoke('admin-products:list')),
  listAdminProductListings: () => forwardIpcResult(ipcRenderer.invoke('admin-products:list-admin-product-listings')),
  updateProductMetadata: (productId, update) => forwardIpcResult(ipcRenderer.invoke('admin-products:update-metadata', productId, update)),
  listProductImages: (productId) => forwardIpcResult(ipcRenderer.invoke('admin-products:list-product-images', productId)),
  uploadProductImage: (productId, image) => forwardIpcResult(ipcRenderer.invoke('admin-products:upload-image', productId, image)),
  reorderProductImages: (productId, imageIds) => forwardIpcResult(ipcRenderer.invoke('admin-products:reorder-product-images', productId, imageIds)),
  updateProductImageAltText: (productId, imageId, altText) => forwardIpcResult(ipcRenderer.invoke('admin-products:update-product-image-alt-text', productId, imageId, altText)),
  deleteProductImage: (productId, imageId) => forwardIpcResult(ipcRenderer.invoke('admin-products:delete-product-image', productId, imageId)),
  setFeatureProduct: (productId) => forwardIpcResult(ipcRenderer.invoke('admin-products:set-feature', productId)),
  uploadCatalogueArtwork: (productId, image) => forwardIpcResult(ipcRenderer.invoke('admin-products:upload-catalogue-artwork', productId, image)),
  removeCatalogueArtwork: (productId) => forwardIpcResult(ipcRenderer.invoke('admin-products:remove-catalogue-artwork', productId)),
  searchLegoProducts: (query, page, pageSize) => forwardIpcResult(ipcRenderer.invoke('admin-products:lookup-lego-products', query, page, pageSize)),
  createUsedOffer: (productId, input) => forwardIpcResult(ipcRenderer.invoke('admin-products:create-used-offer', productId, input)),
}

contextBridge.exposeInMainWorld('adminProducts', adminProducts)

const adminCategories: AdminCategoriesApi = {
  list: () => forwardIpcResult(ipcRenderer.invoke('admin-categories:list')),
  create: (input) => forwardIpcResult(ipcRenderer.invoke('admin-categories:create', input)),
  update: (categoryId, update) => forwardIpcResult(ipcRenderer.invoke('admin-categories:update', categoryId, update)),
  uploadArtwork: (categoryId, image) => forwardIpcResult(ipcRenderer.invoke('admin-categories:upload-artwork', categoryId, image)),
  removeArtwork: (categoryId) => forwardIpcResult(ipcRenderer.invoke('admin-categories:remove-artwork', categoryId)),
}

contextBridge.exposeInMainWorld('adminCategories', adminCategories)

const adminPurchases: AdminPurchasesApi = {
  getManualSupplierOptions: () => forwardIpcResult(ipcRenderer.invoke('admin-purchases:manual-supplier-options')),
  createManual: (input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:create-manual', input)),
  review: (id) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:review', id)),
  amend: (id, itemId, input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:amend', id, itemId, input)),
  resolve: (id, groupId, input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:resolve', id, groupId, input)),
  setInventoryDisposition: (id, groupId, input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:set-inventory-disposition', id, groupId, input)),
  receive: (id, groupId, input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:receive', id, groupId, input)),
  searchProducts: (id, query) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:search-products', id, query)),
  createListing: (id, input) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:create-listing', id, input)),
  importPdf: (file) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:import-pdf', file)),
  list: (page, limit) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:list', page, limit)),
  get: (purchaseId) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:get', purchaseId)),
  purchaseAnalyticsSummary: () => forwardIpcResult(ipcRenderer.invoke('admin-purchases:analytics-summary')),
  supplierMonthlyAnalytics: (supplierKey) => forwardIpcResult(ipcRenderer.invoke('admin-purchases:supplier-monthly-analytics', supplierKey)),
}

contextBridge.exposeInMainWorld('adminPurchases', adminPurchases)

import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthError, AuthService } from './auth-service.js'
import type { LoginCredentials } from './auth-contract.js'
import { isCreateProductRequest, isImageUploadPayload, isProductMetadataUpdate, ProductError, ProductService } from './product-service.js'
import { CategoryError, CategoryService, validateCategoryCreate } from './category-service.js'
import { PurchaseError, PurchaseService, validateAmendment, validateReceipt, validateResolution, validateListingCreation } from './purchase-service.js'
import type { ManualPurchaseInput } from './purchase-contract.js'
import { handleEditContextMenu } from './edit-context-menu.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
const backendUrl = process.env.COLORFUL_LIFE_BACKEND_URL ?? 'http://localhost:3000'
const authService = new AuthService(backendUrl, (input, init) => fetch(input, init))
const productService = new ProductService(authService)
const categoryService = new CategoryService(authService)
const purchaseService = new PurchaseService(authService)

const isLoginCredentials = (value: unknown): value is LoginCredentials =>
  typeof value === 'object' &&
  value !== null &&
  'email' in value &&
  'password' in value &&
  typeof value.email === 'string' &&
  typeof value.password === 'string'

ipcMain.handle('admin-auth:login', async (_event, credentials: unknown) => {
  if (!isLoginCredentials(credentials)) {
    throw new AuthError('validation', 'Invalid sign-in details.')
  }
  return authService.login(credentials)
})

ipcMain.handle('admin-auth:restore', () => authService.restore())
ipcMain.handle('admin-auth:logout', () => authService.logout())

ipcMain.handle('admin-products:create', async (_event, request: unknown) => {
  if (!isCreateProductRequest(request)) throw new ProductError('validation', 'Invalid product details.')
  return productService.createProduct(request)
})

ipcMain.handle('admin-products:list', () => productService.listProducts())
ipcMain.handle('admin-products:list-admin-product-listings', () => productService.listAdminProductListings())
ipcMain.handle('admin-products:update-metadata', async (_event, productId: unknown, update: unknown) => {
  if (!isProductMetadataUpdate(update)) throw new ProductError('validation', 'Enter valid product details to update.')
  return productService.updateProductMetadata(validateProductId(productId), update)
})

ipcMain.handle('admin-products:lookup-lego-products', async (_event, query: unknown, page: unknown = 1, pageSize: unknown = 20) => {
  if (typeof query !== 'string' || query.trim().length < 1 || query.trim().length > 100 || typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 10000 || typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ProductError('validation', 'Enter a search term of up to 100 characters.')
  }
  return productService.searchLegoProducts(query.trim(), page, pageSize)
})

ipcMain.handle('admin-products:create-used-offer', async (_event, productId: unknown, input: unknown) => {
  if (typeof productId !== 'number' || !Number.isInteger(productId) || productId <= 0 || typeof input !== 'object' || input === null || !('salePrice' in input) || typeof input.salePrice !== 'number' || !Number.isFinite(input.salePrice) || input.salePrice <= 0 || !('damageDescription' in input) || typeof input.damageDescription !== 'string' || input.damageDescription.trim().length < 1 || input.damageDescription.trim().length > 2000 || !('conditionPhotos' in input) || !Array.isArray(input.conditionPhotos) || input.conditionPhotos.length < 1 || input.conditionPhotos.length > 3 || !input.conditionPhotos.every((photo: unknown) => isImageUploadPayload(photo) && photo.bytes.byteLength > 0 && photo.altText === undefined)) {
    throw new ProductError('validation', 'Provide a valid price, damage description, and 1 to 3 condition photos.')
  }
  return productService.createUsedOffer(productId, input as import('./product-contract.js').UsedOfferCreateInput)
})

const validateProductId = (productId: unknown): number => {
  if (typeof productId !== 'number' || !Number.isInteger(productId) || productId <= 0) throw new ProductError('validation', 'Invalid LEGO product.')
  return productId
}

const validateImageId = (imageId: unknown): number => {
  if (typeof imageId !== 'number' || !Number.isInteger(imageId) || imageId <= 0) throw new ProductError('validation', 'Invalid product image.')
  return imageId
}

const validateCatalogueArtwork = (image: unknown) => {
  if (!isImageUploadPayload(image)) throw new ProductError('validation', 'Invalid catalogue artwork.')
  return image
}

ipcMain.handle('admin-products:list-product-images', async (_event, productId: unknown) => productService.listProductImages(validateProductId(productId)))
ipcMain.handle('admin-products:upload-image', async (_event, productId: unknown, image: unknown) => {
  if (!isImageUploadPayload(image)) throw new ProductError('validation', 'Invalid product image.')
  return productService.uploadProductImage(validateProductId(productId), image)
})
ipcMain.handle('admin-products:reorder-product-images', async (_event, productId: unknown, imageIds: unknown) => {
  if (!Array.isArray(imageIds) || imageIds.some(imageId => typeof imageId !== 'number' || !Number.isInteger(imageId) || imageId <= 0)) throw new ProductError('validation', 'Invalid product image order.')
  return productService.reorderProductImages(validateProductId(productId), imageIds as number[])
})
ipcMain.handle('admin-products:update-product-image-alt-text', async (_event, productId: unknown, imageId: unknown, altText: unknown) => {
  if (altText !== null && (typeof altText !== 'string' || altText.length > 300)) throw new ProductError('validation', 'Invalid product image alt text.')
  return productService.updateProductImageAltText(validateProductId(productId), validateImageId(imageId), altText as string | null)
})
ipcMain.handle('admin-products:delete-product-image', async (_event, productId: unknown, imageId: unknown) => productService.deleteProductImage(validateProductId(productId), validateImageId(imageId)))
ipcMain.handle('admin-products:set-feature', async (_event, productId: unknown) => productService.setFeatureProduct(validateProductId(productId)))
ipcMain.handle('admin-products:upload-catalogue-artwork', async (_event, productId: unknown, image: unknown) => productService.uploadCatalogueArtwork(validateProductId(productId), validateCatalogueArtwork(image)))
ipcMain.handle('admin-products:remove-catalogue-artwork', async (_event, productId: unknown) => productService.removeCatalogueArtwork(validateProductId(productId)))

const validateCategoryId = (categoryId: unknown): number => {
  if (typeof categoryId !== 'number' || !Number.isInteger(categoryId) || categoryId <= 0) throw new CategoryError('validation', 'Invalid category.')
  return categoryId
}

ipcMain.handle('admin-categories:list', () => categoryService.list())
ipcMain.handle('admin-categories:create', (_event, input: unknown) => categoryService.create(validateCategoryCreate(input)))
ipcMain.handle('admin-categories:update', async (_event, categoryId: unknown, update: unknown) => {
  if (typeof update !== 'object' || update === null || typeof (update as Record<string, unknown>).name !== 'string') throw new CategoryError('validation', 'Invalid category details.')
  return categoryService.update(validateCategoryId(categoryId), update as { name: string; subtitle: string | null; description: string | null })
})
ipcMain.handle('admin-categories:upload-artwork', async (_event, categoryId: unknown, image: unknown) => {
  if (!isImageUploadPayload(image)) throw new CategoryError('validation', 'Invalid category artwork.')
  return categoryService.uploadArtwork(validateCategoryId(categoryId), image)
})
ipcMain.handle('admin-categories:remove-artwork', async (_event, categoryId: unknown) => categoryService.removeArtwork(validateCategoryId(categoryId)))

const validatePurchaseId = (purchaseId: unknown): number => {
  if (typeof purchaseId !== 'number' || !Number.isInteger(purchaseId) || purchaseId <= 0) throw new PurchaseError('validation', 'Invalid purchase.')
  return purchaseId
}
const validatePage = (value: unknown, fallback: number): number => value === undefined ? fallback : typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : (() => { throw new PurchaseError('validation', 'Invalid purchase history page.') })()
const validateLimit = (value: unknown, fallback: number): number => value === undefined ? fallback : typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100 ? value : (() => { throw new PurchaseError('validation', 'Invalid purchase history limit.') })()

const validatePdf = (file: unknown): { bytes: Uint8Array; filename: string; mimeType: 'application/pdf' } => {
  if (typeof file !== 'object' || file === null) throw new PurchaseError('validation', 'Choose a PDF purchase document.')
  const value = file as Record<string, unknown>
  if (!(value.bytes instanceof Uint8Array) || value.bytes.byteLength === 0 || value.bytes.byteLength > 10 * 1024 * 1024 || typeof value.filename !== 'string' || value.filename.trim() === '' || value.mimeType !== 'application/pdf') throw new PurchaseError('validation', 'Choose a PDF purchase document no larger than 10 MB.')
  return { bytes: value.bytes, filename: value.filename, mimeType: 'application/pdf' }
}

ipcMain.handle('admin-purchases:import-pdf', async (_event, file: unknown) => purchaseService.importPdf(validatePdf(file)))
ipcMain.handle('admin-purchases:create-manual', (_event, input: unknown) => purchaseService.createManual(input as ManualPurchaseInput))
ipcMain.handle('admin-purchases:list', async (_event, page: unknown, limit: unknown) => purchaseService.list(validatePage(page, 1), validateLimit(limit, 20)))
ipcMain.handle('admin-purchases:get', async (_event, purchaseId: unknown) => purchaseService.get(validatePurchaseId(purchaseId)))
ipcMain.handle('admin-purchases:review', (_event, id: unknown) => purchaseService.review(validatePurchaseId(id)))
ipcMain.handle('admin-purchases:amend', (_event, id: unknown, itemId: unknown, input: unknown) => purchaseService.amend(validatePurchaseId(id), validatePurchaseId(itemId), validateAmendment(input)))
ipcMain.handle('admin-purchases:resolve', (_event, id: unknown, groupId: unknown, input: unknown) => purchaseService.resolve(validatePurchaseId(id), validatePurchaseId(groupId), validateResolution(input)))
ipcMain.handle('admin-purchases:receive', (_event, id: unknown, groupId: unknown, input: unknown) => purchaseService.receive(validatePurchaseId(id), validatePurchaseId(groupId), validateReceipt(input)))
ipcMain.handle('admin-purchases:search-products', (_event, id: unknown, query: unknown) => {
  if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new PurchaseError('validation', 'Enter a product search')
  return purchaseService.searchProducts(validatePurchaseId(id), query.trim())
})
ipcMain.handle('admin-purchases:create-listing', (_event, id: unknown, input: unknown) => purchaseService.createListing(validatePurchaseId(id), validateListingCreation(input)))

const createWindow = (): void => {
  const window = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, 'preload.cjs'),
    },
  })

  window.webContents.on('context-menu', (event, params) => {
    handleEditContextMenu(event, { ...params.editFlags, isEditable: params.isEditable, x: params.x, y: params.y }, (template, x, y) => {
      Menu.buildFromTemplate(template).popup({ window, x, y })
    })
  })

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
    return
  }

  void window.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

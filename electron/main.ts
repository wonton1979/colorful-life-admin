import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthError, AuthService } from './auth-service.js'
import type { LoginCredentials } from './auth-contract.js'
import { isCreateProductRequest, isImageUploadPayload, ProductError, ProductService } from './product-service.js'
import { CategoryError, CategoryService, validateCategoryCreate } from './category-service.js'
import { PurchaseError, PurchaseService, validateAmendment, validateReceipt, validateResolution, validateListingCreation } from './purchase-service.js'
import type { ManualPurchaseInput } from './purchase-contract.js'

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

ipcMain.handle('admin-products:upload-image', async (_event, listingId: unknown, image: unknown) => {
  if (typeof listingId !== 'number' || !Number.isInteger(listingId) || listingId <= 0 || !isImageUploadPayload(image)) throw new ProductError('validation', 'Invalid product image.')
  const validListingId = listingId
  return productService.uploadListingImage(validListingId, image)
})

const validateListingId = (listingId: unknown): number => {
  if (typeof listingId !== 'number' || !Number.isInteger(listingId) || listingId <= 0) throw new ProductError('validation', 'Invalid product listing.')
  return listingId
}

const validateCatalogueArtwork = (image: unknown) => {
  if (!isImageUploadPayload(image)) throw new ProductError('validation', 'Invalid catalogue artwork.')
  return image
}

ipcMain.handle('admin-products:set-feature', async (_event, listingId: unknown) => productService.setFeatureProduct(validateListingId(listingId)))
ipcMain.handle('admin-products:upload-catalogue-artwork', async (_event, listingId: unknown, image: unknown) => productService.uploadCatalogueArtwork(validateListingId(listingId), validateCatalogueArtwork(image)))
ipcMain.handle('admin-products:remove-catalogue-artwork', async (_event, listingId: unknown) => productService.removeCatalogueArtwork(validateListingId(listingId)))

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

import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthError, AuthService } from './auth-service.js'
import type { LoginCredentials } from './auth-contract.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
const backendUrl = process.env.COLORFUL_LIFE_BACKEND_URL ?? 'http://localhost:3000'
const authService = new AuthService(backendUrl, (input, init) => fetch(input, init))

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

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const preloadSource = readFileSync(resolve('electron', 'preload.cts'), 'utf8')
const mainSource = readFileSync(resolve('electron', 'main.ts'), 'utf8')
const builtPreloadSource = readFileSync(resolve('dist-electron', 'preload.cjs'), 'utf8')
const builtMainSource = readFileSync(resolve('dist-electron', 'main.js'), 'utf8')
const channels = [...preloadSource.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1])

if (!preloadSource.includes("contextBridge.exposeInMainWorld('adminAuth'")) {
  throw new Error('The preload must expose the typed adminAuth bridge.')
}
if (preloadSource.includes("exposeInMainWorld('electron'") || preloadSource.includes("exposeInMainWorld('ipcRenderer'")) {
  throw new Error('The preload must not expose raw Electron objects.')
}
if (JSON.stringify(channels) !== JSON.stringify(['admin-auth:login', 'admin-auth:restore', 'admin-auth:logout', 'admin-products:create', 'admin-products:list', 'admin-products:upload-image', 'admin-products:set-feature', 'admin-products:upload-catalogue-artwork', 'admin-products:remove-catalogue-artwork', 'admin-categories:list', 'admin-categories:create', 'admin-categories:update', 'admin-categories:upload-artwork', 'admin-categories:remove-artwork', 'admin-purchases:review', 'admin-purchases:amend', 'admin-purchases:resolve', 'admin-purchases:receive', 'admin-purchases:search-products', 'admin-purchases:create-listing', 'admin-purchases:import-pdf', 'admin-purchases:list', 'admin-purchases:get'])) {
  throw new Error(`Unexpected exposed IPC channels: ${channels.join(', ')}`)
}
if (!mainSource.includes('contextIsolation: true') || !mainSource.includes('nodeIntegration: false')) {
  throw new Error('Electron renderer security settings are not enabled.')
}
if (!mainSource.includes("preload: join(currentDirectory, 'preload.cjs')")) {
  throw new Error('Electron must load the CommonJS-compatible preload output.')
}

if (!preloadSource.includes("contextBridge.exposeInMainWorld('adminProducts'")) {
  throw new Error('The preload must expose the typed adminProducts bridge.')
}
if (!preloadSource.includes("contextBridge.exposeInMainWorld('adminPurchases'")) {
  throw new Error('The preload must expose the typed adminPurchases bridge.')
}
if (!builtPreloadSource.includes("exposeInMainWorld('adminPurchases'")) {
  throw new Error('The compiled preload must expose the adminPurchases bridge.')
}
if (!builtPreloadSource.includes('admin-categories:create') || !builtMainSource.includes("ipcMain.handle('admin-categories:create'")) {
  throw new Error('The compiled Electron boundary must expose category creation.')
}
for (const channel of ['admin-purchases:review', 'admin-purchases:amend', 'admin-purchases:resolve', 'admin-purchases:receive', 'admin-purchases:search-products', 'admin-purchases:create-listing', 'admin-purchases:import-pdf', 'admin-purchases:list', 'admin-purchases:get']) {
  if (!builtPreloadSource.includes(channel)) throw new Error('Compiled preload missing ' + channel)
  if (!builtMainSource.includes(`ipcMain.handle('${channel}'`)) {
    throw new Error(`The compiled main process must register ${channel}.`)
  }
}
if (preloadSource.includes('readFile') || preloadSource.includes('readdir') || preloadSource.includes('writeFile')) {
  throw new Error('The preload must not expose filesystem access.')
}

console.log('Verified the narrow Electron authentication boundary.')

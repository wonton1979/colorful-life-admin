// Real Electron + compiled main/preload + production renderer. Only HTTP is a disposable fixture server.
import { app } from 'electron'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

async function run() {
const root = resolve(import.meta.dirname, '..')
const review = JSON.parse(readFileSync(join(root, 'src/test-fixtures/purchase-review.json'), 'utf8'))
const requests = []
let failReview = false
const server = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString()
  const body = text ? JSON.parse(text) : undefined
  requests.push({ path: req.url, method: req.method, body, auth: req.headers.authorization })
  let data
  if (req.url === '/auth/login') data = { token: 'disposable-runtime-token' }
  else if (req.url === '/profile') data = { id: 1, email: 'runtime@test.invalid', role: 'ADMIN', createdAt: '2026-09-21', updatedAt: '2026-09-21' }
  else if (req.url.startsWith('/products?')) data = { items: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } }
  else if (req.url === '/admin/categories') data = []
  else if (req.url.startsWith('/purchases?')) data = { purchases: [review.purchase], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }
  else if (req.url === '/purchases/1/review' && failReview) { res.statusCode = 500; data = { error: 'Unavailable' } }
  else if (req.url === '/purchases/1/review/products?q=model') data = [{ id: 1, title: 'Display model', setNumber: '75446' }]
  else if (req.url.endsWith('/listing')) { review.revision = 'b'.repeat(64); data = review }
  else if (req.url.endsWith('/items/101')) { review.revision = 'c'.repeat(64); data = review }
  else if (req.url.endsWith('/receive')) {
    assert.deepEqual(Object.keys(body), ['revision'])
    review.revision = 'd'.repeat(64)
    review.groups[0].state = 'RECEIVED'; review.groups[0].canResolve = false; review.groups[0].pendingQuantity = 0
    for (const line of review.groups[0].lines) { line.receivedAt = '2026-09-22'; line.canAmend = false; line.canAmendCost = false }
    data = review
  } else if (req.url === '/purchases/1/review') data = review
  else { res.statusCode = 404; data = { error: 'Unexpected test request' } }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const folder = mkdtempSync(join(tmpdir(), 'colorful-life-purchase-runtime-'))
app.setPath('userData', join(folder, 'profile'))
process.env.COLORFUL_LIFE_BACKEND_URL = 'http://127.0.0.1:' + server.address().port
process.env.ELECTRON_RENDERER_URL = pathToFileURL(join(root, 'dist/index.html')).href
let window
const ready = new Promise(resolve => app.once('browser-window-created', (_event, win) => {
  window = win; win.hide()
  win.webContents.on('preload-error', (_event, path, error) => console.error('Preload failed', path, error))
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message) })
  win.webContents.once('did-finish-load', resolve)
}))
const timeout = setTimeout(() => { console.error('Electron runtime check timed out'); app.exit(1) }, 45000)
try {
  await import(pathToFileURL(join(root, 'dist-electron/main.js')).href)
  await ready
  const js = async expression => {
    try { return await window.webContents.executeJavaScript(expression) }
    catch (error) { console.error('Failed runtime expression:', expression); throw error }
  }
  const until = async expression => {
    for (let n = 0; n < 100; n++) {
      if (await js(expression)) return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Runtime condition failed: ' + expression)
  }
  const click = async label => {
    await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`)
    return js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true)
  assert.equal(window.webContents.getLastWebPreferences().nodeIntegration, false)
  assert.deepEqual(await js(`['review','amend','resolve','receive','searchProducts','createListing'].map(k => typeof window.adminPurchases[k])`), Array(6).fill('function'))
  assert.equal(await js("typeof window.require"), 'undefined')
  await until("!!document.querySelector('#email')")
  await js(`for (const [id,value] of [['email','runtime@test.invalid'],['password','test']]) {
    const input = document.getElementById(id)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input,value)
    input.dispatchEvent(new Event('input',{bubbles:true}))
  }`)
  await js("document.querySelector('form').requestSubmit()")
  await until("document.body.textContent.includes('Admin workspace')")
  await click('Purchases')
  await until("document.body.textContent.includes('ORDER-1')")
  await click('View details')
  await until("document.body.textContent.includes('Approve & Receive 3')")
  assert.equal(await js("document.querySelectorAll('article').length"), 1)
  assert(await js("document.body.textContent.includes('£209.97')"))
  for (const width of [1200, 480]) {
    window.setSize(width, 1000)
    await new Promise(resolve => setTimeout(resolve, 150))
    const geometry = await js("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
    assert(geometry.scroll <= geometry.width + 1, 'Review must not overflow horizontally')
    writeFileSync(join(folder, 'review-' + width + '.png'), (await window.webContents.capturePage()).toPNG())
  }
  await click('Amend')
  await until("document.body.textContent.includes('Save source line')")
  await js("document.querySelector('.review-line-form').requestSubmit()")
  await until("document.body.textContent.includes('Source line amended')")
  await click('Change Listing')
  await until("document.body.textContent.includes('Link selected listing')")
  await click('Link selected listing')
  await until("document.body.textContent.includes('Listing association saved')")
  await js("void (window.confirm = () => true)")
  await click('Approve & Receive 3')
  await until("document.body.textContent.includes('Purchase item received into inventory')")
  assert.equal(await js("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Approve & Receive'))"), false)
  failReview = true
  await click('Refresh review')
  await until("!!document.querySelector('[role=alert]')")
  failReview = false
  await click('Refresh review')
  await until("document.body.textContent.includes('Review refreshed.')")
  await click('← Purchase History')
  await until("document.body.textContent.includes('Import Purchase Document')")
  const spacing = await js(`(() => {
    const h = document.querySelector('.purchase-import-card h3').getBoundingClientRect()
    const p = document.querySelector('.purchase-import-card .panel-intro').getBoundingClientRect()
    return p.top - h.bottom
  })()`)
  assert(spacing >= 7)
  await js("window.adminCategories.list()")
  await js("window.adminProducts.listProducts()")
  await js("window.adminPurchases.searchProducts(1,'model')")
  assert(requests.filter(r => r.path.startsWith('/purchases/1/review')).every(r => r.auth === 'Bearer disposable-runtime-token'))
  assert(requests.some(r => r.path.endsWith('/receive')))
  console.log('Verified compiled Electron review, amendment, resolution, receiving, refresh/failure/back, existing bridges, and responsive layout.')
  console.log('Runtime screenshots: ' + folder)
  clearTimeout(timeout)
  server.close()
  app.exit(0)
} catch (error) {
  console.error(error)
  clearTimeout(timeout)
  server.close()
  app.exit(1)
}
}
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })

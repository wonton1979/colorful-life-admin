import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const indexPath = resolve('dist', 'index.html')
const html = readFileSync(indexPath, 'utf8')
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => reference && !reference.startsWith('#') && !reference.includes('://'))

if (references.some((reference) => reference.startsWith('/'))) {
  throw new Error('Renderer build contains root-relative asset references, which do not work with file:// loading.')
}

const missingReferences = references.filter((reference) => !existsSync(resolve('dist', reference)))

if (missingReferences.length > 0) {
  throw new Error(`Renderer build contains missing assets: ${missingReferences.join(', ')}`)
}

console.log(`Verified ${references.length} file-relative renderer assets.`)

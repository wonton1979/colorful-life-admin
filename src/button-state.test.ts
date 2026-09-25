/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('shared button state styles', () => {
  it('keeps disabled controls static and reserves progress feedback for explicit pending state', () => {
    const disabledRule = stylesheet.match(/\.button:disabled\s*\{([^}]*)\}/)?.[1]
    expect(disabledRule).toContain('cursor: not-allowed')
    expect(disabledRule).not.toMatch(/wait|progress|spin|animation/i)
    expect(stylesheet).toContain('.button[aria-busy="true"] { cursor: progress; }')
    expect(stylesheet).not.toMatch(/\.button:disabled[^{}]*::(?:before|after)/)
  })
})

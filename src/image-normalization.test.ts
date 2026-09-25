import { describe, expect, it } from 'vitest'
import { detectSupportedImageFormat, normalizeImageFile, normalizeImageUploadBytes } from './image-normalization'

const bytesFromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16))
const jpeg = bytesFromHex('ffd8ffe000104a46494600010100000100010000ffd9')
const png = bytesFromHex('89504e470d0a1a0a0000000d494844520000000100000001')
const webp = bytesFromHex('5249464612000000574542505650382006000000')

describe('Admin image normalization', () => {
  it('detects only the supported signatures and requires RIFF plus WEBP for WebP', () => {
    expect(detectSupportedImageFormat(jpeg)?.mimeType).toBe('image/jpeg')
    expect(detectSupportedImageFormat(png)?.mimeType).toBe('image/png')
    expect(detectSupportedImageFormat(webp)?.mimeType).toBe('image/webp')
    expect(detectSupportedImageFormat(bytesFromHex('524946461200000057415645'))).toBeNull()
  })

  it('reproduces the mislabeled real-phone JPEG and preserves all bytes', () => {
    const result = normalizeImageUploadBytes(jpeg, '10759-used-1.png')
    expect(result.filename).toBe('10759-used-1.jpg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.bytes).toEqual(jpeg)
    expect(result.bytes).not.toBe(jpeg)
  })

  it('normalizes the inverse JPEG/PNG mismatch without changing content', () => {
    const result = normalizeImageUploadBytes(png, 'photo.jpg')
    expect(result).toMatchObject({ filename: 'photo.png', mimeType: 'image/png' })
    expect(result.bytes).toEqual(png)
  })

  it('normalizes WebP metadata and replaces only the final extension', () => {
    const result = normalizeImageUploadBytes(webp, 'picture.tar.PNG')
    expect(result).toMatchObject({ filename: 'picture.tar.webp', mimeType: 'image/webp' })
    expect(result.bytes).toEqual(webp)
    expect(normalizeImageUploadBytes(webp, 'picture').filename).toBe('picture.webp')
  })

  it('preserves correctly named JPEG, PNG, and WebP uploads consistently', () => {
    expect(normalizeImageUploadBytes(jpeg, 'box.JPG')).toMatchObject({ filename: 'box.jpg', mimeType: 'image/jpeg', bytes: jpeg })
    expect(normalizeImageUploadBytes(png, 'cover.png')).toMatchObject({ filename: 'cover.png', mimeType: 'image/png', bytes: png })
    expect(normalizeImageUploadBytes(webp, 'art.webp')).toMatchObject({ filename: 'art.webp', mimeType: 'image/webp', bytes: webp })
  })

  it('rejects unsupported content regardless of filename and browser MIME', async () => {
    expect(() => normalizeImageUploadBytes(new TextEncoder().encode('not an image'), 'fake.png')).toThrow('fake.png is not a supported JPEG, PNG, or WebP image.')
    const file = new File([new TextEncoder().encode('not an image')], 'fake.png', { type: 'image/png' })
    await expect(normalizeImageFile(file)).rejects.toThrow('fake.png is not a supported JPEG, PNG, or WebP image.')
  })

  it('uses file bytes rather than the File MIME metadata', async () => {
    const file = new File([jpeg], '10759-used-1.png', { type: 'image/png' })
    expect(await normalizeImageFile(file)).toMatchObject({ filename: '10759-used-1.jpg', mimeType: 'image/jpeg', bytes: jpeg })
  })
})

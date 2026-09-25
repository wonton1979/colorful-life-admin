import type { ImageUploadPayload } from '../electron/product-contract.js'

type ImageFormat = {
  extension: 'jpg' | 'png' | 'webp'
  mimeType: ImageUploadPayload['mimeType']
}

const supportedFormats = {
  jpeg: { extension: 'jpg', mimeType: 'image/jpeg' },
  png: { extension: 'png', mimeType: 'image/png' },
  webp: { extension: 'webp', mimeType: 'image/webp' },
} satisfies Record<string, ImageFormat>

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte)

export const detectSupportedImageFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return supportedFormats.jpeg
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return supportedFormats.png
  if (bytes.byteLength >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8, 12), [0x57, 0x45, 0x42, 0x50])) return supportedFormats.webp
  return null
}

const normalizeFilename = (filename: string, extension: ImageFormat['extension']) => {
  const lastDot = filename.lastIndexOf('.')
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename
  return `${base}.${extension}`
}

export const normalizeImageUploadBytes = (bytes: Uint8Array, filename: string): ImageUploadPayload => {
  const format = detectSupportedImageFormat(bytes)
  if (!format) throw new Error(`${filename} is not a supported JPEG, PNG, or WebP image.`)
  return {
    bytes: Uint8Array.from(bytes),
    filename: normalizeFilename(filename, format.extension),
    mimeType: format.mimeType,
  }
}

export const normalizeImageFile = async (file: Pick<File, 'name' | 'arrayBuffer'>): Promise<ImageUploadPayload> => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return normalizeImageUploadBytes(bytes, file.name)
}

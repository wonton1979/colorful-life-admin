import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductListing } from '../electron/product-contract'
import AddProduct from './AddProduct'

const product: ProductListing = {
  id: 123, legoProductId: 456, colorfulLifeCategory: 'VEHICLES', category: { id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null }, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, isFeatureProduct: false, condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2, availableStock: 2,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  legoProduct: { id: 456, setNumber: '60325', title: 'Example Set', description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 235, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  listingImages: [],
}

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText('Set number'), { target: { value: '60325' } })
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Example Set' } })
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'City' } })
  fireEvent.change(screen.getByLabelText('Colorful Life Category'), { target: { value: 'VEHICLES' } })
  fireEvent.change(screen.getByLabelText('Age recommendation'), { target: { value: '6+' } })
  fireEvent.change(screen.getByLabelText('Piece count'), { target: { value: '235' } })
  fireEvent.change(screen.getByLabelText('Original price'), { target: { value: '29.99' } })
}

const imageFile = (name: string, type = 'image/jpeg', size = 4) => new File([new Uint8Array(size)], name, { type, lastModified: 1 })

describe('AddProduct workflow', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
    window.adminProducts = { createProduct: vi.fn().mockResolvedValue(product), listProducts: vi.fn().mockResolvedValue([]), uploadListingImage: vi.fn().mockResolvedValue({ id: 1, listingId: 123, url: 'https://cdn.test/image.jpg', publicId: 'image', altText: null, sortOrder: 0, createdAt: '2026-01-01' }), setFeatureProduct: vi.fn(), uploadCatalogueArtwork: vi.fn(), removeCatalogueArtwork: vi.fn() }
  })

  afterEach(() => cleanup())

  it('creates a product without images', async () => {
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByText('Listing created: 123')).toBeInTheDocument())
    expect(window.adminProducts.createProduct).toHaveBeenCalledOnce()
    expect(window.adminProducts.createProduct).toHaveBeenCalledWith(expect.objectContaining({ theme: 'City', colorfulLifeCategory: 'VEHICLES' }))
    expect(window.adminProducts.uploadListingImage).not.toHaveBeenCalled()
  })

  it('notifies the parent only after the product workflow is complete', async () => {
    const onProductCreated = vi.fn()
    render(<AddProduct onProductCreated={onProductCreated} />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('cover.jpg')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(onProductCreated).toHaveBeenCalledWith(product))
    expect(window.adminProducts.uploadListingImage).toHaveBeenCalledOnce()
  })

  it('renders every backend category option and requires an explicit independent selection', () => {
    render(<AddProduct />)
    const selector = screen.getByLabelText('Colorful Life Category')
    expect(selector).toBeRequired()
    expect(Array.from(selector.querySelectorAll('option')).map((option) => option.value)).toEqual(['', 'HARRY_POTTER', 'STAR_WARS', 'FRIENDS', 'CITY', 'DISNEY', 'MARVEL', 'JURASSIC_WORLD', 'FLOWERS_AND_BOTANICALS', 'NINJAGO', 'HEROES', 'VEHICLES', 'CREATOR', 'OTHERS'])
    expect(screen.getByLabelText('Theme')).toHaveValue('')
    expect(selector).toHaveValue('')
  })

  it('uploads one image with the selected binary and keeps it as the cover', async () => {
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('cover.jpg')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByText('Product listing and images are ready.')).toBeInTheDocument())
    const [, payload] = (window.adminProducts.uploadListingImage as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(payload.filename).toBe('cover.jpg')
    expect(payload.mimeType).toBe('image/jpeg')
    expect(payload.bytes).toBeInstanceOf(Uint8Array)
    expect(window.adminProducts.createProduct).toHaveBeenCalledOnce()
  })

  it('uploads multiple images sequentially in selection order', async () => {
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('cover.jpg'), imageFile('second.png', 'image/png')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByText('Product listing and images are ready.')).toBeInTheDocument())
    expect((window.adminProducts.uploadListingImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan((window.adminProducts.uploadListingImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1])
    expect((window.adminProducts.uploadListingImage as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1].filename)).toEqual(['cover.jpg', 'second.png'])
  })

  it('keeps the created listing and retries only a failed later image', async () => {
    const upload = vi.fn().mockResolvedValueOnce({ id: 1, listingId: 123, url: 'https://cdn.test/one.jpg', publicId: 'one', altText: null, sortOrder: 0, createdAt: '2026-01-01' }).mockRejectedValueOnce(new Error('Image upload failed')).mockResolvedValueOnce({ id: 2, listingId: 123, url: 'https://cdn.test/two.jpg', publicId: 'two', altText: null, sortOrder: 1, createdAt: '2026-01-01' })
    window.adminProducts.uploadListingImage = upload
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('one.jpg'), imageFile('two.jpg')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry failed images' })).toBeInTheDocument())
    expect(window.adminProducts.createProduct).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed images' }))
    await waitFor(() => expect(screen.getByText('Product listing and images are ready.')).toBeInTheDocument())
    expect(window.adminProducts.createProduct).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledTimes(3)
    expect(upload.mock.calls[2][1].filename).toBe('two.jpg')
  })

  it('does not offer retry while the initial sequential upload is active', async () => {
    let resolveSecond: (() => void) | undefined
    const secondUpload = new Promise<void>((resolve) => { resolveSecond = resolve })
    const upload = vi.fn()
      .mockResolvedValueOnce({ id: 1, listingId: 123, url: 'https://cdn.test/one.jpg', publicId: 'one', altText: null, sortOrder: 0, createdAt: '2026-01-01' })
      .mockImplementationOnce(() => secondUpload.then(() => { throw new Error('Image upload failed') }))
      .mockResolvedValueOnce({ id: 2, listingId: 123, url: 'https://cdn.test/two.jpg', publicId: 'two', altText: null, sortOrder: 1, createdAt: '2026-01-01' })
    window.adminProducts.uploadListingImage = upload
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('one.jpg'), imageFile('two.jpg')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByText('Product created. 1 of 2 images uploaded.')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Retry failed images' })).not.toBeInTheDocument()
    resolveSecond?.()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry failed images' })).toBeInTheDocument())
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('resets only the completed renderer workflow and allows another product submission', async () => {
    render(<AddProduct />)
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'First product' } })
    fireEvent.change(screen.getByLabelText('Product images'), { target: { files: [imageFile('first.jpg')] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add another product' })).toBeInTheDocument())
    const createProduct = window.adminProducts.createProduct as ReturnType<typeof vi.fn>
    const uploadImage = window.adminProducts.uploadListingImage as ReturnType<typeof vi.fn>
    expect(createProduct).toHaveBeenCalledOnce()
    expect(uploadImage).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Add another product' }))
    expect(screen.getByLabelText('Set number')).toHaveValue('')
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.getByLabelText('Colorful Life Category')).toHaveValue('')
    expect(screen.queryByText('Listing created: 123')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create product listing' })).toBeInTheDocument()
    expect(createProduct).toHaveBeenCalledOnce()
    expect(uploadImage).toHaveBeenCalledOnce()

    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Set number'), { target: { value: '60400' } })
    fireEvent.change(screen.getByLabelText('Colorful Life Category'), { target: { value: 'CITY' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(2))
    expect(createProduct).toHaveBeenLastCalledWith(expect.objectContaining({ setNumber: '60400', theme: 'City', colorfulLifeCategory: 'CITY' }))
    expect(uploadImage).toHaveBeenCalledOnce()
  })

  it('rejects unsupported, oversized, and excess images before submission', () => {
    render(<AddProduct />)
    const input = screen.getByLabelText('Product images')
    fireEvent.change(input, { target: { files: [imageFile('bad.gif', 'image/gif')] } })
    expect(screen.getByRole('alert')).toHaveTextContent('not a supported image')
    fireEvent.change(input, { target: { files: [imageFile('large.jpg', 'image/jpeg', 8 * 1024 * 1024 + 1)] } })
    expect(screen.getByRole('alert')).toHaveTextContent('exceeds the 8 MiB')
    fireEvent.change(input, { target: { files: Array.from({ length: 11 }, (_, index) => imageFile(`${index}.jpg`)) } })
    expect(screen.getByRole('alert')).toHaveTextContent('at most 10 images')
    expect(screen.getAllByRole('img')).toHaveLength(10)
  })
})

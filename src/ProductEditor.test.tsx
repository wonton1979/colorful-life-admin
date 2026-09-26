import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminLegoProduct, AdminLegoProductDetails, ProductImage } from '../electron/product-contract'
import ProductEditor from './ProductEditor'

const normalizeImageFileMock = vi.hoisted(() => vi.fn())
vi.mock('./image-normalization', () => ({ normalizeImageFile: normalizeImageFileMock }))

const product: AdminLegoProduct = {
  id: 456, setNumber: '60325', title: 'Example Set', description: 'Shared description', theme: 'City', ageRecommendation: '6+', pieceCount: 235,
  category: { id: 11, name: 'Vehicles' }, isRetired: false, usedOfferStatus: 'NONE',
}

const image = (id: number, sortOrder: number): ProductImage => ({
  id, legoProductId: product.id, url: `https://cdn.test/${id}.jpg`, publicId: `image-${id}`, altText: `Image ${id}`, sortOrder,
})

const details = (values: Partial<AdminLegoProductDetails> = {}): AdminLegoProductDetails => ({
  id: product.id, setNumber: product.setNumber, title: product.title, description: product.description, theme: product.theme,
  ageRecommendation: product.ageRecommendation, pieceCount: product.pieceCount, isRetired: product.isRetired, categoryId: 11,
  category: { id: 11, name: 'Vehicles', subtitle: null, description: null, imageUrl: null }, productImages: [image(9, 0), image(10, 1)], ...values,
})

let storedImages: ProductImage[]
let imageOperationOrder: string[]

const searchAndSelectProduct = async () => {
  fireEvent.change(screen.getByLabelText('Set number or product title'), { target: { value: product.setNumber } })
  fireEvent.click(screen.getByRole('button', { name: 'Search products' }))
  fireEvent.click(await screen.findByRole('button', { name: /60325 · Example Set/ }))
  await screen.findByRole('heading', { name: 'Shared product details' })
  await waitFor(() => expect(window.adminProducts.listProductImages).toHaveBeenCalledWith(456))
}

describe('ProductEditor', () => {
  beforeEach(() => {
    storedImages = [image(9, 0), image(10, 1)]
    imageOperationOrder = []
    window.adminCategories = {
      list: vi.fn().mockResolvedValue([
        { id: 11, name: 'Vehicles', subtitle: null, description: null, imageUrl: null, imagePublicId: null },
        { id: 29, name: 'Juniors', subtitle: null, description: null, imageUrl: null, imagePublicId: null },
      ]), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn(),
    }
    window.adminProducts = {
      createProduct: vi.fn(),
      listProducts: vi.fn().mockResolvedValue([]),
      listAdminProductListings: vi.fn().mockResolvedValue([]),
      updateProductMetadata: vi.fn().mockResolvedValue(details()),
      listProductImages: vi.fn().mockImplementation(async () => storedImages),
      uploadProductImage: vi.fn().mockImplementation(async () => {
        imageOperationOrder.push('upload')
        const nextImageId = Math.max(0, ...storedImages.map(entry => entry.id)) + 1
        const uploaded = image(nextImageId, storedImages.length)
        storedImages = [...storedImages, uploaded]
        return uploaded
      }),
      reorderProductImages: vi.fn().mockImplementation(async (_productId: number, imageIds: number[]) => {
        storedImages = imageIds.map((id, sortOrder) => ({ ...storedImages.find(entry => entry.id === id)!, sortOrder }))
        return storedImages
      }),
      updateProductImageAltText: vi.fn(),
      deleteProductImage: vi.fn().mockImplementation(async (_productId: number, imageId: number) => {
        imageOperationOrder.push('delete')
        storedImages = storedImages.filter(entry => entry.id !== imageId).map((entry, sortOrder) => ({ ...entry, sortOrder }))
      }),
      setFeatureProduct: vi.fn(), uploadCatalogueArtwork: vi.fn(), removeCatalogueArtwork: vi.fn(),
      searchLegoProducts: vi.fn().mockResolvedValue({ items: [product], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }),
      createUsedOffer: vi.fn(),
    }
    normalizeImageFileMock.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), filename: 'replacement.jpg', mimeType: 'image/jpeg' })
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads a product from lookup by set number and reads shared images with the LegoProduct ID', async () => {
    render(<ProductEditor />)
    await searchAndSelectProduct()

    expect(screen.getByLabelText('Title')).toHaveValue('Example Set')
    expect(screen.getByLabelText('Description')).toHaveValue('Shared description')
    expect(screen.getByLabelText('Theme')).toHaveValue('City')
    expect(screen.getByLabelText('Age recommendation')).toHaveValue('6+')
    expect(screen.getByLabelText('Piece count')).toHaveValue(235)
    expect(screen.getByLabelText('Retired Set')).not.toBeChecked()
    expect(screen.getByLabelText('Category')).toHaveValue('11')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(window.adminProducts.searchLegoProducts).toHaveBeenCalledWith('60325')
    expect(window.adminProducts.listProducts).not.toHaveBeenCalled()
    expect(window.adminProducts.listAdminProductListings).not.toHaveBeenCalled()
  })

  it('clears the selected product, images, and product messages when a new search has no results', async () => {
    vi.mocked(window.adminProducts.updateProductMetadata).mockRejectedValueOnce(new Error('The service is unavailable.'))
    render(<ProductEditor />)
    await searchAndSelectProduct()

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved description' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable.')

    fireEvent.change(screen.getByLabelText('Add images'), { target: { files: [new File(['new'], 'new.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('1 image added.')).toBeInTheDocument()
    expect(screen.getByAltText('Image 9')).toBeInTheDocument()

    vi.mocked(window.adminProducts.searchLegoProducts).mockResolvedValueOnce({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } })
    fireEvent.change(screen.getByLabelText('Set number or product title'), { target: { value: '99999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search products' }))

    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved product changes and search for another product?')
    expect(await screen.findByText('No products found.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Shared product details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Product Images' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Product Images' })).not.toBeInTheDocument()
    expect(screen.queryByAltText('Image 9')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('1 image added.')).not.toBeInTheDocument()
    expect(window.adminProducts.searchLegoProducts).toHaveBeenNthCalledWith(2, '99999')
    expect(window.adminProducts.listProductImages).toHaveBeenCalledTimes(1)
  })

  it('preserves the current editing context and aborts the search when unsaved changes are not confirmed', async () => {
    render(<ProductEditor />)
    await searchAndSelectProduct()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited title' } })
    fireEvent.change(screen.getByLabelText('Piece count'), { target: { value: '0' } })
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.change(screen.getByLabelText('Set number or product title'), { target: { value: '99999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search products' }))

    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved product changes and search for another product?')
    expect(window.adminProducts.searchLegoProducts).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Shared product details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Edited title')
    expect(screen.getByLabelText('Piece count')).toHaveValue(0)
    expect(screen.getByAltText('Image 9')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search products' })).toBeEnabled()
  })

  it('clears the previous selection before showing results from a successful new search', async () => {
    const anotherProduct: AdminLegoProduct = { ...product, id: 789, setNumber: '99999', title: 'Another Set' }
    let resolveSearch!: (result: Awaited<ReturnType<typeof window.adminProducts.searchLegoProducts>>) => void
    const pendingSearch = new Promise<Awaited<ReturnType<typeof window.adminProducts.searchLegoProducts>>>(resolve => { resolveSearch = resolve })
    render(<ProductEditor />)
    await searchAndSelectProduct()
    vi.mocked(window.adminProducts.searchLegoProducts).mockReturnValueOnce(pendingSearch)
    fireEvent.change(screen.getByLabelText('Set number or product title'), { target: { value: 'Another Set' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search products' }))

    expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Shared product details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Product Images' })).not.toBeInTheDocument()
    expect(screen.queryByAltText('Image 9')).not.toBeInTheDocument()

    resolveSearch({ items: [anotherProduct], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })
    const anotherResult = await screen.findByRole('button', { name: /99999 · Another Set/ })
    expect(anotherResult).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('heading', { name: 'Shared product details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Product Images' })).not.toBeInTheDocument()
    expect(screen.queryByAltText('Image 9')).not.toBeInTheDocument()
    expect(window.adminProducts.listProductImages).toHaveBeenCalledTimes(1)
    expect(window.adminProducts.listProductImages).toHaveBeenCalledWith(456)
  })

  it('saves changed shared metadata and category by LegoProduct ID only', async () => {
    const updatedCategory = { id: 29, name: 'Juniors', subtitle: null, description: null, imageUrl: null }
    vi.mocked(window.adminProducts.updateProductMetadata).mockResolvedValue(details({
      title: 'Corrected Set', description: 'Corrected description', theme: 'City 2026', ageRecommendation: '7+', pieceCount: 240,
      isRetired: true, categoryId: 29, category: updatedCategory,
    }))
    render(<ProductEditor />)
    await searchAndSelectProduct()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Corrected Set' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Corrected description' } })
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'City 2026' } })
    fireEvent.change(screen.getByLabelText('Age recommendation'), { target: { value: '7+' } })
    fireEvent.change(screen.getByLabelText('Piece count'), { target: { value: '240' } })
    fireEvent.click(screen.getByLabelText('Retired Set'))
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '29' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Product details saved.')
    expect(window.adminProducts.updateProductMetadata).toHaveBeenCalledWith(456, {
      title: 'Corrected Set', description: 'Corrected description', theme: 'City 2026', ageRecommendation: '7+', pieceCount: 240, isRetired: true, categoryId: 29,
    })
    expect(screen.getByLabelText('Category')).toHaveValue('29')
    expect(window.adminProducts.listProducts).not.toHaveBeenCalled()
    expect(window.adminProducts.listAdminProductListings).not.toHaveBeenCalled()
    expect(window.adminProducts.createUsedOffer).not.toHaveBeenCalled()
  })

  it('keeps unchanged and invalid form states from enabling Save', async () => {
    render(<ProductEditor />)
    await searchAndSelectProduct()
    const saveButton = screen.getByRole('button', { name: 'Save changes' })
    expect(saveButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } })
    expect(saveButton).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Complete the required fields')

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Example Set' } })
    expect(saveButton).toBeDisabled()
    expect(window.adminProducts.updateProductMetadata).not.toHaveBeenCalled()
  })

  it('keeps edited values and reports a failed metadata save', async () => {
    vi.mocked(window.adminProducts.updateProductMetadata).mockRejectedValue(new Error('The service is unavailable.'))
    render(<ProductEditor />)
    await searchAndSelectProduct()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The service is unavailable.')
    expect(screen.getByLabelText('Description')).toHaveValue('New description')
    expect(window.adminProducts.updateProductMetadata).toHaveBeenCalledWith(456, { description: 'New description' })
  })

  it('shows an image-load error and lets the Admin retry', async () => {
    vi.mocked(window.adminProducts.listProductImages)
      .mockRejectedValueOnce(new Error('Image service unavailable.'))
      .mockResolvedValueOnce([image(9, 0), image(10, 1)])
    render(<ProductEditor />)
    await searchAndSelectProduct()

    expect(await screen.findByRole('alert')).toHaveTextContent('Image service unavailable.')
    expect(screen.getByLabelText('Add images')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading images' }))
    expect(await screen.findByText('Cover image')).toBeInTheDocument()
    expect(window.adminProducts.listProductImages).toHaveBeenCalledTimes(2)
  })

  it('adds and replaces Product Images through the shared image pipeline and product identity', async () => {
    render(<ProductEditor />)
    await searchAndSelectProduct()

    fireEvent.change(screen.getByLabelText('Add images'), { target: { files: [new File(['new'], 'new.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText('1 image added.')
    expect(normalizeImageFileMock).toHaveBeenCalledOnce()
    expect(window.adminProducts.uploadProductImage).toHaveBeenCalledWith(456, expect.objectContaining({ filename: 'replacement.jpg', mimeType: 'image/jpeg' }))

    const firstImageRow = within(screen.getByRole('list', { name: 'Product Images' })).getAllByRole('listitem')[0]!
    const replaceInput = within(firstImageRow).getByLabelText('Replace image 1')
    fireEvent.change(replaceInput, { target: { files: [new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('Product image replaced.')).toBeInTheDocument()
    expect(window.adminProducts.deleteProductImage).toHaveBeenCalledWith(456, 9)
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Upload a replacement'))
    expect(window.adminProducts.listProductImages).toHaveBeenCalledWith(456)
  })

  it('keeps the current image when a staged replacement upload fails', async () => {
    vi.mocked(window.adminProducts.uploadProductImage).mockRejectedValueOnce(new Error('Image upload failed.'))
    render(<ProductEditor />)
    await searchAndSelectProduct()

    const firstImageRow = within(screen.getByRole('list', { name: 'Product Images' })).getAllByRole('listitem')[0]!
    fireEvent.change(within(firstImageRow).getByLabelText('Replace image 1'), { target: { files: [new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' })] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Image upload failed.')
    expect(window.adminProducts.deleteProductImage).not.toHaveBeenCalled()
    expect(screen.getByAltText('Image 9')).toBeInTheDocument()
  })

  it('confirms delete-first replacement when the product already has the 10-image limit', async () => {
    storedImages = Array.from({ length: 10 }, (_, index) => image(index + 9, index))
    vi.mocked(window.adminProducts.listProductImages).mockImplementation(async () => storedImages)
    render(<ProductEditor />)
    await searchAndSelectProduct()

    const firstImageRow = within(screen.getByRole('list', { name: 'Product Images' })).getAllByRole('listitem')[0]!
    fireEvent.change(within(firstImageRow).getByLabelText('Replace image 1'), { target: { files: [new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' })] } })

    expect(await screen.findByText('Product image replaced.')).toBeInTheDocument()
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('already has 10 images'))
    expect(imageOperationOrder).toEqual(['delete', 'upload'])
    expect(storedImages).toHaveLength(10)
  })

  it('confirms removals and persists image ordering with the LegoProduct ID', async () => {
    render(<ProductEditor />)
    await searchAndSelectProduct()

    const imageList = screen.getByRole('list', { name: 'Product Images' })
    const imageRows = within(imageList).getAllByRole('listitem')
    fireEvent.click(within(imageRows[1]!).getByRole('button', { name: 'Move image 2 up' }))
    await screen.findByText('Product image order saved.')
    expect(window.adminProducts.reorderProductImages).toHaveBeenCalledWith(456, [10, 9])

    const firstImage = within(imageList).getAllByRole('listitem')[0]!
    fireEvent.click(within(firstImage).getByRole('button', { name: 'Remove image 1' }))
    await screen.findByText('Product image removed.')
    expect(window.adminProducts.deleteProductImage).toHaveBeenCalledWith(456, 10)
    expect(window.confirm).toHaveBeenCalled()
  })
})

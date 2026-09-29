import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminProductListing } from '../electron/product-contract'
import CataloguePresentation from './CataloguePresentation'

const categories = [{ id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }, { id: 4, name: 'City', subtitle: 'Every street tells a story', description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }, { id: 29, name: 'Juniors', subtitle: null, description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }, { id: 43, name: 'Friends', subtitle: null, description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }, { id: 57, name: 'BrickHeadz', subtitle: null, description: null, imageUrl: null, imagePublicId: null, thumbnailUrl: null, thumbnailPublicId: null }]
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])
const makeListing = (id: number, isFeatureProduct = false, catalogueArtworkUrl: string | null = null, colorfulLifeCategory: 'VEHICLES' | 'CITY' | 'JUNIORS' = 'VEHICLES', legoProductId = id + 100, condition: 'NEW' | 'USED_LIKE_NEW' = 'NEW', currentStock = 2): AdminProductListing => ({
  id, condition, active: true, usedLifecycle: condition === 'USED_LIKE_NEW' ? 'AVAILABLE' : null, currentStock, availableStock: currentStock,
  legoProduct: { id: legoProductId, setNumber: `SET-${legoProductId}`, title: `Vehicle ${legoProductId === id + 100 ? id : legoProductId}`, category: colorfulLifeCategory === 'CITY' ? categories[1] : colorfulLifeCategory === 'JUNIORS' ? categories[2] : categories[0], isFeatureProduct, catalogueArtworkUrl, catalogueArtworkPublicId: catalogueArtworkUrl ? `stored-${legoProductId}` : null, productImages: [] },
})

describe('CataloguePresentation', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminProducts = {
      createProduct: vi.fn(), listProductImages: vi.fn().mockResolvedValue([]), uploadProductImage: vi.fn(), reorderProductImages: vi.fn().mockResolvedValue([]), updateProductImageAltText: vi.fn(), deleteProductImage: vi.fn(), setFeatureProduct: vi.fn().mockResolvedValue({ id: 102, isFeatureProduct: true }),
      updateProductMetadata: vi.fn(),
      uploadCatalogueArtwork: vi.fn().mockResolvedValue({ url: 'https://cdn.example/new-artwork.jpg', publicId: 'stored-1' }), removeCatalogueArtwork: vi.fn().mockResolvedValue(undefined),
      listProducts: vi.fn(), listAdminProductListings: vi.fn().mockResolvedValue([makeListing(1, true, 'https://cdn.example/current.jpg'), makeListing(2)]),
      getProductAvailability: vi.fn().mockResolvedValue({ totalProducts: 2, totalInventory: 6, activeProducts: 1, inactiveProducts: 1 }),
      searchLegoProducts: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }), createUsedOffer: vi.fn(),
    }
    window.adminCategories = { list: vi.fn().mockResolvedValue(categories), getProductAvailability: vi.fn().mockResolvedValue({ totalProducts: 2, totalInventory: 6, activeProducts: 1, inactiveProducts: 1 }), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn(), uploadThumbnailArtwork: vi.fn(), removeThumbnailArtwork: vi.fn() }
  })

  it('renders Feature and Standard state, category, and only catalogue artwork preview', async () => {
    render(<CataloguePresentation />)
    expect(await screen.findByText('Vehicle 1')).toBeInTheDocument()
    expect(screen.getByText('Feature')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    const currentFeature = screen.getByRole('button', { name: 'Current Feature' })
    expect(currentFeature).toBeDisabled()
    expect(currentFeature).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByAltText('Catalogue artwork for Vehicle 1')).toHaveAttribute('src', 'https://cdn.example/current.jpg')
    expect(screen.getAllByText('No catalogue artwork')).toHaveLength(2)
    expect(screen.queryByAltText(/listing/i)).not.toBeInTheDocument()
    expect(window.adminProducts.listAdminProductListings).toHaveBeenCalledOnce()
    expect(window.adminProducts.listProducts).not.toHaveBeenCalled()
  })

  it('shows a zero-stock NEW Admin listing when its dynamic category is selected', async () => {
    const zeroStockJuniors: AdminProductListing = {
      ...makeListing(16900), currentStock: 0, availableStock: 0,
      legoProduct: { ...makeListing(16900).legoProduct, id: 10759, setNumber: '10759', title: 'Juniors zero stock set', category: categories[2] },
    }
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue([zeroStockJuniors])
    render(<CataloguePresentation />)
    await screen.findByText('Juniors zero stock set')
    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '29' } })
    expect(screen.getByText('Listing #16900 · Set 10759')).toBeInTheDocument()
    expect(screen.getAllByText('Juniors').length).toBeGreaterThan(0)
    expect(screen.queryByText('No listings found for this category.')).not.toBeInTheDocument()
  })

  it('sorts missing artwork first, newest-first within both groups, and keeps filtering by dynamic category ID', async () => {
    const completedNewest = makeListing(20, false, 'https://cdn.example/city-art.jpg', 'CITY', 120)
    const incompleteSiblingNew = makeListing(16900, false, null, 'JUNIORS', 14947, 'NEW', 0)
    const incompleteSiblingUsed = makeListing(16901, false, null, 'JUNIORS', 14947, 'USED_LIKE_NEW', 1)
    const listings = [
      makeListing(3, false, 'https://cdn.example/old-art.jpg', 'VEHICLES', 103),
      makeListing(7, false, null, 'VEHICLES', 107),
      completedNewest,
      incompleteSiblingNew,
      incompleteSiblingUsed,
    ]
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue(listings)
    render(<CataloguePresentation />)

    await screen.findByText(/Listing #16901/)
    const listingIds = () => Array.from(document.querySelectorAll('.presentation-heading p')).map(node => node.textContent?.match(/Listing #(\d+)/)?.[1])
    expect(listingIds()).toEqual(['16901', '16900', '7'])
    const siblingCards = Array.from(document.querySelectorAll('.presentation-list article')).slice(0, 2)
    expect(siblingCards.map(card => card.querySelector('.artwork-state')?.textContent)).toEqual(['No catalogue artwork', 'No catalogue artwork'])

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(listingIds()).toEqual(['20', '3'])

    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '29' } })
    expect(listingIds()).toEqual(['16901', '16900'])
    expect(screen.queryByText('Vehicle 20')).not.toBeInTheDocument()
  })

  it('uses LegoProduct ID, refreshes authoritative state after changing Feature, and prevents duplicate selection', async () => {
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValueOnce([makeListing(1, true), makeListing(2)]).mockResolvedValueOnce([makeListing(1), makeListing(2, true)])
    const setFeatureProduct = window.adminProducts.setFeatureProduct as ReturnType<typeof vi.fn>
    let resolveFeature: (value: { id: number; isFeatureProduct: true }) => void = () => undefined
    setFeatureProduct.mockImplementation(() => new Promise((resolve) => { resolveFeature = resolve }))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')
    const makeFeature = screen.getByRole('button', { name: 'Make Feature' })
    fireEvent.click(makeFeature)
    fireEvent.click(makeFeature)
    expect(setFeatureProduct).toHaveBeenCalledOnce()
    expect(setFeatureProduct).toHaveBeenCalledWith(102)
    expect(makeFeature).toBeDisabled()
    expect(makeFeature).toHaveAttribute('aria-busy', 'true')
    resolveFeature({ id: 102, isFeatureProduct: true })
    await waitFor(() => expect(screen.getAllByText('Feature')).toHaveLength(1))
    expect(screen.getByText('Vehicle 2').closest('article')).toHaveClass('presentation-card-feature')
    expect(screen.getByText('Vehicle 1').closest('article')).not.toHaveClass('presentation-card-feature')
    const currentFeature = screen.getByRole('button', { name: 'Current Feature' })
    expect(currentFeature).toBeDisabled()
    expect(currentFeature).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledTimes(2)
  })

  it('clears pending semantics after a failed Feature update and restores the action', async () => {
    const setFeatureProduct = window.adminProducts.setFeatureProduct as ReturnType<typeof vi.fn>
    setFeatureProduct.mockRejectedValueOnce(new Error('Feature update failed'))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')
    fireEvent.click(screen.getByRole('button', { name: 'Make Feature' }))

    const pendingButton = screen.getByRole('button', { name: 'Saving…' })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('alert')).toHaveTextContent('Feature update failed')

    const retryButton = screen.getByRole('button', { name: 'Make Feature' })
    expect(retryButton).toBeEnabled()
    expect(retryButton).toHaveAttribute('aria-busy', 'false')
  })

  it('shares artwork and Feature state across sibling NEW and Used listings and mutates by LegoProduct ID', async () => {
    const artworkUrl = 'https://cdn.example/10759-artwork.jpg'
    const siblings = [
      makeListing(16900, false, artworkUrl, 'JUNIORS', 14947, 'NEW', 0),
      makeListing(16901, false, artworkUrl, 'JUNIORS', 14947, 'USED_LIKE_NEW', 1),
    ].map(listing => ({ ...listing, legoProduct: { ...listing.legoProduct, setNumber: '10759', title: "Lego Juniors Elastigirl's Rooftop Pursuit" } }))
    const refreshedSiblings = siblings.map(listing => ({ ...listing, legoProduct: { ...listing.legoProduct, isFeatureProduct: true } }))
    const listAdminListings = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listAdminListings.mockResolvedValueOnce(siblings).mockResolvedValueOnce(refreshedSiblings)
    const setFeature = window.adminProducts.setFeatureProduct as ReturnType<typeof vi.fn>
    setFeature.mockResolvedValue({ id: 14947, isFeatureProduct: true })
    const uploadArtwork = window.adminProducts.uploadCatalogueArtwork as ReturnType<typeof vi.fn>

    render(<CataloguePresentation />)
    expect(await screen.findByText(/Listing #16900 · Set 10759/)).toBeInTheDocument()
    expect(screen.getByText(/Listing #16901 · Set 10759/)).toBeInTheDocument()
    expect(screen.getAllByAltText("Catalogue artwork for Lego Juniors Elastigirl's Rooftop Pursuit")).toHaveLength(2)
    expect(screen.getAllByText('Standard')).toHaveLength(2)
    expect(Array.from(document.querySelectorAll('.presentation-category')).map(node => node.textContent)).toEqual(['Juniors', 'Juniors'])

    fireEvent.click(screen.getAllByRole('button', { name: 'Make Feature' })[0])
    await waitFor(() => expect(setFeature).toHaveBeenCalledWith(14947))
    await waitFor(() => expect(screen.getAllByText('Feature')).toHaveLength(2))

    const inputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(inputs[0], { target: { files: [new File([jpegBytes], 'new-artwork.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(uploadArtwork).toHaveBeenCalledWith(14947, expect.objectContaining({ filename: 'new-artwork.jpg', mimeType: 'image/jpeg' })))
    expect(await screen.findAllByAltText("Catalogue artwork for Lego Juniors Elastigirl's Rooftop Pursuit")).toHaveLength(2)
    for (const image of screen.getAllByAltText("Catalogue artwork for Lego Juniors Elastigirl's Rooftop Pursuit")) {
      expect(image).toHaveAttribute('src', 'https://cdn.example/new-artwork.jpg')
    }
  })

  it('uploads replacement artwork with LegoProduct ID and consumes the backend URL without touching Product Images', async () => {
    const upload = window.adminProducts.uploadCatalogueArtwork as ReturnType<typeof vi.fn>
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    const card = screen.getByText('Vehicle 1').closest('article') as HTMLElement
    const input = card.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([jpegBytes], 'replacement.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith(101, expect.objectContaining({ filename: 'replacement.jpg', mimeType: 'image/jpeg', bytes: jpegBytes })))
    expect(await screen.findByAltText('Catalogue artwork for Vehicle 1')).toHaveAttribute('src', 'https://cdn.example/new-artwork.jpg')
    expect(upload.mock.calls[0][1]).not.toHaveProperty('publicId')
  })

  it('removes artwork after confirmation and handles API errors', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const remove = window.adminProducts.removeCatalogueArtwork as ReturnType<typeof vi.fn>
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(101))
    expect(await screen.findByText('Catalogue artwork removed.')).toBeInTheDocument()

    cleanup()
    remove.mockRejectedValueOnce(new Error('Artwork removal failed'))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Artwork removal failed')
  })

  it('paginates missing-artwork listings newest-first and preserves the page through mutations', async () => {
    const listings = Array.from({ length: 9 }, (_, index) => makeListing(index + 1))
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue(listings)
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 9')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Vehicle 7')).toBeInTheDocument()
    expect(screen.queryByText('Vehicle 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Vehicle 5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Vehicle 6')).toBeInTheDocument()
    expect(screen.getByText('Vehicle 4')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Make Feature' })[0])
    await waitFor(() => expect(screen.getByText('Feature product updated.')).toBeInTheDocument())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    const artworkInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(artworkInput, { target: { files: [new File([jpegBytes], 'page-two.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(screen.getByText('Catalogue artwork saved.')).toBeInTheDocument())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('resets to page one when the category changes or a creation refresh selects a category', async () => {
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue([makeListing(1), makeListing(2), makeListing(3), makeListing(4), makeListing(5), makeListing(6, false, null, 'CITY')])
    const { rerender } = render(<CataloguePresentation />)
    await screen.findByText('Vehicle 6')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '4' } })
    expect(screen.getByText('Vehicle 6')).toBeInTheDocument()
    expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument()

    listProducts.mockResolvedValue([makeListing(7, false, null, 'CITY')])
    rerender(<CataloguePresentation refreshToken={1} refreshCategory={4} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Presentation category' })).toHaveValue('4'))
    expect(screen.getByText('Vehicle 7')).toBeInTheDocument()
  })

  it('uses backend categories for filters and retains All categories', async () => {
    render(<CataloguePresentation />)
    const filter = screen.getByRole('combobox', { name: 'Presentation category' })
    expect(await screen.findByRole('option', { name: 'Juniors' })).toHaveValue('29')
    expect(filter.querySelector('option')?.textContent).toBe('All categories')
  })

  it('does not fall back to static categories when category loading fails', async () => {
    window.adminCategories.list = vi.fn().mockRejectedValue(new Error('Category service unavailable'))
    render(<CataloguePresentation />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Category service unavailable')
    expect(screen.getByRole('combobox', { name: 'Presentation category' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'Vehicles' })).not.toBeInTheDocument()
  })

  it('clamps the current page after a refresh removes later listings', async () => {
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValueOnce([makeListing(1), makeListing(2), makeListing(3), makeListing(4), makeListing(5)])
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 5')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    listProducts.mockResolvedValueOnce([makeListing(1), makeListing(2)])
    fireEvent.click(screen.getByRole('button', { name: 'Refresh listings' }))
    await waitFor(() => expect(screen.getByText('Vehicle 2')).toBeInTheDocument())
    expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument()
  })

  it('preserves the selected dynamic category during Refresh listings', async () => {
    const listAdminListings = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listAdminListings.mockResolvedValueOnce([makeListing(1), makeListing(2, false, null, 'JUNIORS', 202), makeListing(3, false, null, 'CITY')])
      .mockResolvedValueOnce([makeListing(4, false, null, 'JUNIORS', 204), makeListing(5, false, null, 'CITY')])
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 202')
    const filter = screen.getByRole('combobox', { name: 'Presentation category' })
    fireEvent.change(filter, { target: { value: '29' } })
    expect(filter).toHaveValue('29')
    expect(screen.getByText('Vehicle 202')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh listings' }))
    await screen.findByText('Vehicle 204')
    expect(filter).toHaveValue('29')
    expect(screen.queryByText('Vehicle 5')).not.toBeInTheDocument()
  })

  it('preserves manual category browsing during a parent refresh without product context', async () => {
    const listAdminListings = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listAdminListings.mockResolvedValue([makeListing(1), makeListing(2, false, null, 'JUNIORS', 202)])
    const { rerender } = render(<CataloguePresentation />)
    await screen.findByText('Vehicle 202')
    const filter = screen.getByRole('combobox', { name: 'Presentation category' })
    fireEvent.change(filter, { target: { value: '29' } })

    rerender(<CataloguePresentation refreshToken={1} refreshCategory={null} />)
    await waitFor(() => expect(listAdminListings).toHaveBeenCalledTimes(2))
    expect(filter).toHaveValue('29')
    expect(screen.getByText('Vehicle 202')).toBeInTheDocument()
    expect(screen.queryByText('Vehicle 1')).not.toBeInTheDocument()
  })

  it('falls back to All categories only when the backend category list lacks the selected ID', async () => {
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue([makeListing(1)])
    render(<CataloguePresentation refreshToken={1} refreshCategory={999} />)
    await screen.findByText('Vehicle 1')
    expect(screen.getByRole('combobox', { name: 'Presentation category' })).toHaveValue('')
  })

  it('shows a genuine empty result only after a successful empty response', async () => {
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue([])
    render(<CataloguePresentation />)
    expect(await screen.findByText('No listings found for this category.')).toBeInTheDocument()
  })

  it('shows a load error without presenting it as an empty result', async () => {
    const listProducts = window.adminProducts.listAdminProductListings as ReturnType<typeof vi.fn>
    listProducts.mockRejectedValue(new Error('The catalogue service is unavailable.'))
    render(<CataloguePresentation />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The catalogue service is unavailable.')
    expect(screen.queryByText('No listings found for this category.')).not.toBeInTheDocument()
  })

  it('displays backend category totals including zero Active and zero Inactive without changing Feature state', async () => {
    const getAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getAvailability.mockImplementation(async (categoryId: number) => categoryId === 11
      ? { totalProducts: 5, totalInventory: 11, activeProducts: 0, inactiveProducts: 5 }
      : { totalProducts: 3, totalInventory: 8, activeProducts: 3, inactiveProducts: 0 })
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')

    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '11' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'Vehicles · 5 Products · 11 Inventory · 0 Active · 5 Inactive')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenCalledWith(11)
    expect(screen.getByText('Feature')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '4' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'City · 3 Products · 8 Inventory · 3 Active · 0 Inactive')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenLastCalledWith(4)
  })

  it('hides old counts during category switching and ignores stale availability responses', async () => {
    const getAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    const pending: Partial<Record<number, (value: { totalProducts: number; totalInventory: number; activeProducts: number; inactiveProducts: number }) => void>> = {}
    getAvailability.mockImplementation((categoryId: number) => new Promise((resolve) => { pending[categoryId] = resolve }))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')

    const filter = screen.getByRole('combobox', { name: 'Presentation category' })
    fireEvent.change(filter, { target: { value: '43' } })
    expect(getAvailability).toHaveBeenCalledWith(43)
    fireEvent.change(filter, { target: { value: '57' } })
    expect(getAvailability).toHaveBeenCalledWith(57)
    expect(document.querySelector('.category-availability-summary')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading category availability')

    pending[57]?.({ totalProducts: 9, totalInventory: 22, activeProducts: 7, inactiveProducts: 2 })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'BrickHeadz · 9 Products · 22 Inventory · 7 Active · 2 Inactive')).toBeInTheDocument()
    pending[43]?.({ totalProducts: 15, totalInventory: 39, activeProducts: 12, inactiveProducts: 3 })
    await waitFor(() => expect(screen.getByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'BrickHeadz · 9 Products · 22 Inventory · 7 Active · 2 Inactive')).toBeInTheDocument())
    expect(document.querySelector('.category-availability-summary')).not.toHaveTextContent('Friends')
  })

  it('keeps specific-category counts unchanged through pagination and switches to the global summary for All Categories', async () => {
    const getAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getAvailability.mockResolvedValue({ totalProducts: 12, totalInventory: 66, activeProducts: 9, inactiveProducts: 3 })
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 2, totalInventory: 13, activeProducts: 1, inactiveProducts: 1 })
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue(Array.from({ length: 9 }, (_, index) => makeListing(index + 1)))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 9')

    const filter = screen.getByRole('combobox', { name: 'Presentation category' })
    fireEvent.change(filter, { target: { value: '11' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'Vehicles · 12 Products · 66 Inventory · 9 Active · 3 Inactive')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'Vehicles · 12 Products · 66 Inventory · 9 Active · 3 Inactive')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenCalledOnce()

    fireEvent.change(filter, { target: { value: '' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 2 Products · 13 Inventory · 1 Active · 1 Inactive')).toBeInTheDocument()
    expect(getAvailability).toHaveBeenCalledOnce()
    expect(getGlobalAvailability).toHaveBeenCalledTimes(2)
  })

  it('loads global unique-product availability by default and leaves Feature/Standard presentation unchanged', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    const getCategoryAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 17, totalInventory: 143, activeProducts: 12, inactiveProducts: 5 })
    render(<CataloguePresentation />)

    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 17 Products · 143 Inventory · 12 Active · 5 Inactive')).toBeInTheDocument()
    expect(getGlobalAvailability).toHaveBeenCalledOnce()
    expect(getCategoryAvailability).not.toHaveBeenCalled()
    expect(screen.getByText('Feature')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
  })

  it('renders totalProducts from availability when the same LEGO product has NEW and USED listings', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 1, totalInventory: 4, activeProducts: 1, inactiveProducts: 0 })
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue([
      makeListing(1, false, null, 'VEHICLES', 900, 'NEW'),
      makeListing(2, false, null, 'VEHICLES', 900, 'USED_LIKE_NEW'),
    ])
    render(<CataloguePresentation />)

    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 1 Products · 4 Inventory · 1 Active · 0 Inactive')).toBeInTheDocument()
    expect(screen.getByText('Listing #1 · Set SET-900')).toBeInTheDocument()
    expect(screen.getByText('Listing #2 · Set SET-900')).toBeInTheDocument()
    expect(getGlobalAvailability).toHaveBeenCalledOnce()
  })

  it('displays zero global Active and Inactive products without inventing other totals', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 0, totalInventory: 0, activeProducts: 0, inactiveProducts: 0 })
    render(<CataloguePresentation />)

    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 0 Products · 0 Inventory · 0 Active · 0 Inactive')).toBeInTheDocument()
  })

  it('requests independent backend summaries as the scope changes in both directions', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    const getCategoryAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 17, totalInventory: 143, activeProducts: 12, inactiveProducts: 5 })
    getCategoryAvailability.mockImplementation(async (categoryId: number) => categoryId === 43
      ? { totalProducts: 15, totalInventory: 39, activeProducts: 10, inactiveProducts: 5 }
      : { totalProducts: 9, totalInventory: 22, activeProducts: 7, inactiveProducts: 2 })
    render(<CataloguePresentation />)
    const filter = screen.getByRole('combobox', { name: 'Presentation category' })

    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 17 Products · 143 Inventory · 12 Active · 5 Inactive')).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '43' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'Friends · 15 Products · 39 Inventory · 10 Active · 5 Inactive')).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '57' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'BrickHeadz · 9 Products · 22 Inventory · 7 Active · 2 Inactive')).toBeInTheDocument()
    fireEvent.change(filter, { target: { value: '' } })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 17 Products · 143 Inventory · 12 Active · 5 Inactive')).toBeInTheDocument()

    expect(getGlobalAvailability).toHaveBeenCalledTimes(2)
    expect(getCategoryAvailability).toHaveBeenNthCalledWith(1, 43)
    expect(getCategoryAvailability).toHaveBeenNthCalledWith(2, 57)
  })

  it('ignores stale global and category summaries after rapid scope switching', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    const getCategoryAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    const pendingGlobal: Array<(value: { totalProducts: number; totalInventory: number; activeProducts: number; inactiveProducts: number }) => void> = []
    const pendingCategories: Partial<Record<number, (value: { totalProducts: number; totalInventory: number; activeProducts: number; inactiveProducts: number }) => void>> = {}
    getGlobalAvailability.mockImplementation(() => new Promise((resolve) => { pendingGlobal.push(resolve) }))
    getCategoryAvailability.mockImplementation((categoryId: number) => new Promise((resolve) => { pendingCategories[categoryId] = resolve }))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')
    const filter = screen.getByRole('combobox', { name: 'Presentation category' })

    fireEvent.change(filter, { target: { value: '43' } })
    fireEvent.change(filter, { target: { value: '57' } })
    fireEvent.change(filter, { target: { value: '' } })
    expect(pendingGlobal).toHaveLength(2)
    expect(document.querySelector('.category-availability-summary')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading catalogue availability')

    pendingGlobal[1]({ totalProducts: 21, totalInventory: 66, activeProducts: 14, inactiveProducts: 7 })
    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 21 Products · 66 Inventory · 14 Active · 7 Inactive')).toBeInTheDocument()
    pendingCategories[57]?.({ totalProducts: 9, totalInventory: 22, activeProducts: 7, inactiveProducts: 2 })
    pendingCategories[43]?.({ totalProducts: 15, totalInventory: 39, activeProducts: 12, inactiveProducts: 3 })
    pendingGlobal[0]({ totalProducts: 1, totalInventory: 999, activeProducts: 1, inactiveProducts: 0 })
    await waitFor(() => expect(screen.getByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 21 Products · 66 Inventory · 14 Active · 7 Inactive')).toBeInTheDocument())
    expect(document.querySelector('.category-availability-summary')).not.toHaveTextContent('Friends')
    expect(document.querySelector('.category-availability-summary')).not.toHaveTextContent('BrickHeadz')
  })

  it('keeps global counts fixed across listing pages and does not aggregate category summaries', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    const getCategoryAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockResolvedValue({ totalProducts: 31, totalInventory: 143, activeProducts: 24, inactiveProducts: 7 })
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValue(Array.from({ length: 9 }, (_, index) => makeListing(index + 1)))
    render(<CataloguePresentation />)

    expect(await screen.findByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 31 Products · 143 Inventory · 24 Active · 7 Inactive')).toBeInTheDocument()
    expect(getGlobalAvailability).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByText((_, element) => element !== null && element.classList.contains('category-availability-summary') && element.textContent === 'All categories · 31 Products · 143 Inventory · 24 Active · 7 Inactive')).toBeInTheDocument()
    expect(getGlobalAvailability).toHaveBeenCalledOnce()
    expect(getCategoryAvailability).not.toHaveBeenCalled()
  })

  it('keeps listings usable and displays a global availability error without showing zero counts', async () => {
    const getGlobalAvailability = window.adminProducts.getProductAvailability as ReturnType<typeof vi.fn>
    getGlobalAvailability.mockRejectedValue(new Error('Global availability unavailable'))
    render(<CataloguePresentation />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load catalogue availability: Global availability unavailable')
    expect(screen.getByText('Vehicle 1')).toBeInTheDocument()
    expect(document.querySelector('.category-availability-summary')).not.toBeInTheDocument()
    expect(screen.queryByText(/Products ·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 Active · 0 Inactive/)).not.toBeInTheDocument()
  })

  it('preserves listings and shows an availability error without inventing zero counts', async () => {
    const getAvailability = window.adminCategories.getProductAvailability as ReturnType<typeof vi.fn>
    getAvailability.mockRejectedValue(new Error('Category availability unavailable'))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: '11' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load category availability: Category availability unavailable')
    expect(screen.getByText('Vehicle 1')).toBeInTheDocument()
    expect(document.querySelector('.category-availability-summary')).not.toBeInTheDocument()
    expect(screen.queryByText(/Products ·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 Active · 0 Inactive/)).not.toBeInTheDocument()
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminProductListing } from '../electron/product-contract'
import CataloguePresentation from './CataloguePresentation'

const categories = [{ id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null, imagePublicId: null }, { id: 4, name: 'City', subtitle: 'Every street tells a story', description: null, imageUrl: null, imagePublicId: null }, { id: 29, name: 'Juniors', subtitle: null, description: null, imageUrl: null, imagePublicId: null }]
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
      uploadCatalogueArtwork: vi.fn().mockResolvedValue({ url: 'https://cdn.example/new-artwork.jpg', publicId: 'stored-1' }), removeCatalogueArtwork: vi.fn().mockResolvedValue(undefined),
      listProducts: vi.fn(), listAdminProductListings: vi.fn().mockResolvedValue([makeListing(1, true, 'https://cdn.example/current.jpg'), makeListing(2)]),
      searchLegoProducts: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }), createUsedOffer: vi.fn(),
    }
    window.adminCategories = { list: vi.fn().mockResolvedValue(categories), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn() }
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
})

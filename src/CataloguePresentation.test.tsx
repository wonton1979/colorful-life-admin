import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductListing } from '../electron/product-contract'
import CataloguePresentation from './CataloguePresentation'

const categories = [{ id: 11, name: 'Vehicles', subtitle: 'Built for the thrill', description: null, imageUrl: null }, { id: 4, name: 'City', subtitle: 'Every street tells a story', description: null, imageUrl: null }]
const makeListing = (id: number, isFeatureProduct = false, catalogueArtworkUrl: string | null = null, colorfulLifeCategory: 'VEHICLES' | 'CITY' = 'VEHICLES'): ProductListing => ({
  id, legoProductId: id + 100, colorfulLifeCategory, category: colorfulLifeCategory === 'CITY' ? categories[1] : categories[0], catalogueArtworkUrl, catalogueArtworkPublicId: catalogueArtworkUrl ? `stored-${id}` : null, isFeatureProduct,
  condition: 'NEW', originalPrice: '29.99', salePrice: null, currentStock: 2, availableStock: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  legoProduct: { id: id + 100, setNumber: `SET-${id}`, title: `Vehicle ${id}`, description: null, theme: 'City', ageRecommendation: '6+', pieceCount: 100, createdAt: '2026-01-01', updatedAt: '2026-01-01' }, listingImages: [],
})

describe('CataloguePresentation', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminProducts = {
      createProduct: vi.fn(), uploadListingImage: vi.fn(), setFeatureProduct: vi.fn().mockResolvedValue({ id: 1, colorfulLifeCategory: 'VEHICLES', isFeatureProduct: true }),
      uploadCatalogueArtwork: vi.fn().mockResolvedValue({ url: 'https://cdn.example/new-artwork.jpg', publicId: 'stored-1' }), removeCatalogueArtwork: vi.fn().mockResolvedValue(undefined),
      listProducts: vi.fn().mockResolvedValue([makeListing(1, true, 'https://cdn.example/current.jpg'), makeListing(2)]),
    }
    window.adminCategories = { list: vi.fn().mockResolvedValue(categories), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn() }
  })

  it('renders Feature and Standard state, category, and only catalogue artwork preview', async () => {
    render(<CataloguePresentation />)
    expect(await screen.findByText('Vehicle 1')).toBeInTheDocument()
    expect(screen.getByText('Feature')).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByAltText('Catalogue artwork for Vehicle 1')).toHaveAttribute('src', 'https://cdn.example/current.jpg')
    expect(screen.getAllByText('No catalogue artwork')).toHaveLength(2)
    expect(screen.queryByAltText(/listing/i)).not.toBeInTheDocument()
  })

  it('uses listing ID, refreshes authoritative state after changing Feature, and prevents duplicate selection', async () => {
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValueOnce([makeListing(1, true), makeListing(2)]).mockResolvedValueOnce([makeListing(1), makeListing(2, true)])
    const setFeatureProduct = window.adminProducts.setFeatureProduct as ReturnType<typeof vi.fn>
    let resolveFeature: (value: { id: number; colorfulLifeCategory: 'VEHICLES'; isFeatureProduct: true }) => void = () => undefined
    setFeatureProduct.mockImplementation(() => new Promise((resolve) => { resolveFeature = resolve }))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 2')
    const makeFeature = screen.getByRole('button', { name: 'Make Feature' })
    fireEvent.click(makeFeature)
    fireEvent.click(makeFeature)
    expect(setFeatureProduct).toHaveBeenCalledOnce()
    expect(setFeatureProduct).toHaveBeenCalledWith(2)
    expect(makeFeature).toBeDisabled()
    resolveFeature({ id: 2, colorfulLifeCategory: 'VEHICLES', isFeatureProduct: true })
    await waitFor(() => expect(screen.getAllByText('Feature')).toHaveLength(1))
    expect(screen.getByText('Vehicle 2').closest('article')).toHaveClass('presentation-card-feature')
    expect(screen.getByText('Vehicle 1').closest('article')).not.toHaveClass('presentation-card-feature')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledTimes(2)
  })

  it('uploads replacement artwork with listing ID and consumes the backend URL without touching listing images', async () => {
    const upload = window.adminProducts.uploadCatalogueArtwork as ReturnType<typeof vi.fn>
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'replacement.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith(1, expect.objectContaining({ filename: 'replacement.png', mimeType: 'image/png', bytes: expect.any(Uint8Array) })))
    expect(await screen.findByAltText('Catalogue artwork for Vehicle 1')).toHaveAttribute('src', 'https://cdn.example/new-artwork.jpg')
    expect(upload.mock.calls[0][1]).not.toHaveProperty('publicId')
  })

  it('removes artwork after confirmation and handles API errors', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const remove = window.adminProducts.removeCatalogueArtwork as ReturnType<typeof vi.fn>
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Catalogue artwork removed.')).toBeInTheDocument()

    cleanup()
    remove.mockRejectedValueOnce(new Error('Artwork removal failed'))
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Artwork removal failed')
  })

  it('paginates the filtered listings in backend order and preserves the page through mutations', async () => {
    const listings = Array.from({ length: 9 }, (_, index) => makeListing(index + 1))
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue(listings)
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Vehicle 3')).toBeInTheDocument()
    expect(screen.queryByText('Vehicle 4')).not.toBeInTheDocument()
    expect(screen.queryByText('Vehicle 5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Vehicle 5')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Make Feature' })[0])
    await waitFor(() => expect(screen.getByText('Feature product updated.')).toBeInTheDocument())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    const artworkInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(artworkInput, { target: { files: [new File([new Uint8Array([1])], 'page-two.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(screen.getByText('Catalogue artwork saved.')).toBeInTheDocument())
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('resets to page one when the category changes or a creation refresh selects a category', async () => {
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue([makeListing(1), makeListing(2), makeListing(3), makeListing(4), makeListing(5), makeListing(6, false, null, 'CITY')])
    const { rerender } = render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Presentation category' }), { target: { value: 'CITY' } })
    expect(screen.getByText('Vehicle 6')).toBeInTheDocument()
    expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument()

    listProducts.mockResolvedValue([makeListing(7, false, null, 'CITY')])
    rerender(<CataloguePresentation refreshToken={1} refreshCategory="CITY" />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Presentation category' })).toHaveValue('CITY'))
    expect(screen.getByText('Vehicle 7')).toBeInTheDocument()
  })

  it('clamps the current page after a refresh removes later listings', async () => {
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValueOnce([makeListing(1), makeListing(2), makeListing(3), makeListing(4), makeListing(5)])
    render(<CataloguePresentation />)
    await screen.findByText('Vehicle 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    listProducts.mockResolvedValueOnce([makeListing(1), makeListing(2)])
    fireEvent.click(screen.getByRole('button', { name: 'Refresh listings' }))
    await waitFor(() => expect(screen.getByText('Vehicle 1')).toBeInTheDocument())
    expect(screen.queryByText('Page 2 of 2')).not.toBeInTheDocument()
  })

  it('shows a genuine empty result only after a successful empty response', async () => {
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockResolvedValue([])
    render(<CataloguePresentation />)
    expect(await screen.findByText('No listings found for this category.')).toBeInTheDocument()
  })

  it('shows a load error without presenting it as an empty result', async () => {
    const listProducts = window.adminProducts.listProducts as ReturnType<typeof vi.fn>
    listProducts.mockRejectedValue(new Error('The catalogue service is unavailable.'))
    render(<CataloguePresentation />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The catalogue service is unavailable.')
    expect(screen.queryByText('No listings found for this category.')).not.toBeInTheDocument()
  })
})

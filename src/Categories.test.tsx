import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCategory } from '../electron/category-contract.js'
import Categories from './Categories'

const category = (overrides: Partial<AdminCategory> = {}): AdminCategory => ({ id: 1, name: 'City', subtitle: 'Every street tells a story', description: 'Explore the city.', imageUrl: null, imagePublicId: null, ...overrides })

describe('Categories', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    window.adminCategories = {
      list: vi.fn().mockResolvedValue([category()]),
      update: vi.fn().mockResolvedValue(category({ name: 'Updated City', subtitle: 'Updated subtitle' })),
      uploadArtwork: vi.fn().mockResolvedValue(category({ imageUrl: 'https://cdn.example/city.jpg', imagePublicId: 'category-artwork/1-a' })),
      removeArtwork: vi.fn().mockResolvedValue(category()),
    }
  })

  it('renders API categories, edits a local draft, and cancel discards it', async () => {
    render(<Categories />)
    expect(await screen.findByRole('heading', { name: 'City' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Draft City' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'City' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Draft City' })).not.toBeInTheDocument()
  })

  it('saves the draft from the API response and prevents duplicate submissions', async () => {
    let resolveUpdate: (value: AdminCategory) => void = () => undefined
    const update = window.adminCategories.update as ReturnType<typeof vi.fn>
    update.mockImplementation(() => new Promise<AdminCategory>((resolve) => { resolveUpdate = resolve }))
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed City' } })
    const save = screen.getByRole('button', { name: 'Save changes' })
    fireEvent.click(save); fireEvent.click(save)
    expect(update).toHaveBeenCalledOnce()
    expect(save).toBeDisabled()
    resolveUpdate(category({ name: 'Authoritative City' }))
    expect(await screen.findByRole('heading', { name: 'Authoritative City' })).toBeInTheDocument()
  })

  it('keeps a failed draft editable', async () => {
    const update = window.adminCategories.update as ReturnType<typeof vi.fn>
    update.mockRejectedValueOnce(new Error('Save failed'))
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Useful draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByLabelText('Name')).toHaveValue('Useful draft')
  })

  it('uploads, previews, replaces, and removes artwork through the bridge', async () => {
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    const input = screen.getByLabelText('Upload artwork')
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], 'city.png', { type: 'image/png' })] } })
    await waitFor(() => expect(window.adminCategories.uploadArtwork).toHaveBeenCalledWith(1, expect.objectContaining({ filename: 'city.png', mimeType: 'image/png', bytes: expect.any(Uint8Array) })))
    expect(await screen.findByAltText('Artwork for City')).toHaveAttribute('src', 'https://cdn.example/city.jpg')
    expect(screen.getByLabelText('Replace artwork')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove artwork' }))
    await waitFor(() => expect(window.adminCategories.removeArtwork).toHaveBeenCalledWith(1))
    expect(screen.getByText('No artwork')).toBeInTheDocument()
  })

  it('does not show an empty result when loading fails', async () => {
    window.adminCategories.list = vi.fn().mockRejectedValue(new Error('Category service unavailable'))
    render(<Categories />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Category service unavailable')
    expect(screen.queryByText('No categories found')).not.toBeInTheDocument()
  })
})

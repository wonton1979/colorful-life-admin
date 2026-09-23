import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminCategory } from '../electron/category-contract.js'
import Categories from './Categories'

const category = (overrides: Partial<AdminCategory> = {}): AdminCategory => ({ id: 1, name: 'City', subtitle: 'Every street tells a story', description: 'Explore the city.', imageUrl: null, imagePublicId: null, ...overrides })

describe('Categories', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    window.adminCategories = {
      list: vi.fn().mockResolvedValue([category()]),
      create: vi.fn().mockResolvedValue(category({ id: 2, name: 'Technic', subtitle: null, description: null })),
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

  it('opens and cancels the Add Category form', async () => {
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    expect(screen.getByRole('form', { name: 'Add category form' })).toBeInTheDocument()
    expect(screen.getByLabelText('New category name')).toBeRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Add category form' })).not.toBeInTheDocument()
    expect(window.adminCategories.create).not.toHaveBeenCalled()
  })

  it('creates a category with optional text and immediately enables normal management actions', async () => {
    const created = category({ id: 2, name: 'Technic', subtitle: 'Built for motion', description: 'Mechanical builds.', imageUrl: null })
    window.adminCategories.list = vi.fn().mockResolvedValue([category({ id: 3, name: 'Existing artwork', imageUrl: 'https://cdn.example/existing.jpg' }), category()])
    vi.mocked(window.adminCategories.create).mockResolvedValueOnce(created)
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: '  Technic  ' } })
    fireEvent.change(screen.getByLabelText('New category subtitle'), { target: { value: '  Built for motion  ' } })
    fireEvent.change(screen.getByLabelText('New category description'), { target: { value: '  Mechanical builds.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByRole('heading', { name: 'Technic' })).toBeInTheDocument()
    expect(window.adminCategories.create).toHaveBeenCalledWith({ name: 'Technic', subtitle: 'Built for motion', description: 'Mechanical builds.' })
    expect(screen.getByText('Built for motion')).toBeInTheDocument()
    expect(screen.getByText('Mechanical builds.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Technic' }).closest('article')).toHaveTextContent('No artwork')
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['City', 'Technic', 'Existing artwork'])
  })

  it('shows categories without artwork first and preserves order within each group', async () => {
    window.adminCategories.list = vi.fn().mockResolvedValue([
      category({ id: 1, name: 'Art A', imageUrl: 'https://cdn.example/a.jpg' }),
      category({ id: 2, name: 'Plain A', imageUrl: null }),
      category({ id: 3, name: 'Art B', imageUrl: 'https://cdn.example/b.jpg' }),
      category({ id: 4, name: 'Plain B', imageUrl: null }),
    ])
    render(<Categories />)
    await screen.findByRole('heading', { name: 'Plain A' })
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Plain A', 'Plain B', 'Art A', 'Art B'])
  })

  it('reorders a category after artwork upload and removal while keeping each section stable', async () => {
    const noArtA = category({ id: 1, name: 'Plain A', imageUrl: null })
    window.adminCategories.list = vi.fn().mockResolvedValue([
      noArtA,
      category({ id: 2, name: 'Art A', imageUrl: 'https://cdn.example/a.jpg' }),
      category({ id: 3, name: 'Plain B', imageUrl: null }),
      category({ id: 4, name: 'Art B', imageUrl: 'https://cdn.example/b.jpg' }),
    ])
    window.adminCategories.uploadArtwork = vi.fn()
      .mockResolvedValueOnce({ ...noArtA, imageUrl: 'https://cdn.example/plain-a.jpg', imagePublicId: 'category-artwork/1-a' })
      .mockResolvedValueOnce({ ...noArtA, imageUrl: 'https://cdn.example/plain-a-replacement.jpg', imagePublicId: 'category-artwork/1-b' })
    window.adminCategories.removeArtwork = vi.fn().mockResolvedValue(noArtA)
    render(<Categories />)
    await screen.findByRole('heading', { name: 'Plain A' })
    const names = () => screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(names()).toEqual(['Plain A', 'Plain B', 'Art A', 'Art B'])
    const uploadInput = screen.getAllByLabelText('Upload artwork')[0]
    fireEvent.change(uploadInput, { target: { files: [new File([new Uint8Array([1])], 'plain-a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(names()).toEqual(['Plain B', 'Plain A', 'Art A', 'Art B']))
    const plainA = screen.getByRole('heading', { name: 'Plain A' }).closest('article')!
    fireEvent.change(within(plainA).getByLabelText('Replace artwork'), { target: { files: [new File([new Uint8Array([2])], 'plain-a-replacement.png', { type: 'image/png' })] } })
    await waitFor(() => expect(window.adminCategories.uploadArtwork).toHaveBeenCalledTimes(2))
    expect(names()).toEqual(['Plain B', 'Plain A', 'Art A', 'Art B'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove artwork' })[0])
    await waitFor(() => expect(names()).toEqual(['Plain A', 'Plain B', 'Art A', 'Art B']))
  })

  it('sends blank optional fields as null and blocks duplicate submission while creating', async () => {
    let finish: (value: AdminCategory) => void = () => undefined
    vi.mocked(window.adminCategories.create).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Technic' } })
    fireEvent.change(screen.getByLabelText('New category subtitle'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('New category description'), { target: { value: '' } })
    const submit = screen.getByRole('button', { name: 'Create category' })
    fireEvent.click(submit); fireEvent.click(submit)
    expect(window.adminCategories.create).toHaveBeenCalledOnce()
    expect(window.adminCategories.create).toHaveBeenCalledWith({ name: 'Technic', subtitle: null, description: null })
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
    finish(category({ id: 2, name: 'Technic', subtitle: null, description: null }))
    expect(await screen.findByRole('heading', { name: 'Technic' })).toBeInTheDocument()
  })

  it('shows duplicate and validation failures while keeping the form available', async () => {
    vi.mocked(window.adminCategories.create).mockRejectedValueOnce(new Error('A category with this name already exists.'))
    render(<Categories />)
    await screen.findByRole('heading', { name: 'City' })
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Technic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByRole('form', { name: 'Add category form' })).toBeInTheDocument()
    vi.mocked(window.adminCategories.create).mockRejectedValueOnce(new Error('Category name is invalid.'))
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('name is invalid')
  })
})

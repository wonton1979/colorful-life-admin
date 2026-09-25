import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const admin = { id: 1, email: 'admin@example.com', role: 'ADMIN' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' }

describe('App authentication flow', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    window.adminAuth = {
      restore: vi.fn().mockResolvedValue(null),
      login: vi.fn().mockResolvedValue(admin),
      logout: vi.fn().mockResolvedValue(undefined),
    }
    window.adminProducts = {
      createProduct: vi.fn(),
      listProducts: vi.fn().mockResolvedValue([]),
      listAdminProductListings: vi.fn().mockResolvedValue([]),
      listProductImages: vi.fn().mockResolvedValue([]),
      uploadProductImage: vi.fn(),
      reorderProductImages: vi.fn().mockResolvedValue([]),
      updateProductImageAltText: vi.fn(),
      deleteProductImage: vi.fn(),
      setFeatureProduct: vi.fn(),
      uploadCatalogueArtwork: vi.fn(),
      removeCatalogueArtwork: vi.fn(),
      searchLegoProducts: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
      createUsedOffer: vi.fn(),
    }
    window.adminCategories = { list: vi.fn().mockResolvedValue([{ id: 4, name: 'City', subtitle: null, description: null, imageUrl: null, imagePublicId: null }]), create: vi.fn(), update: vi.fn(), uploadArtwork: vi.fn(), removeArtwork: vi.fn() }
  })

  it('shows the unauthenticated login screen and submits credentials', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /sign in to continue/i })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Admin workspace' })).toBeInTheDocument())
    expect(screen.getByText(admin.email)).toBeInTheDocument()
    expect(window.adminAuth.login).toHaveBeenCalledWith({ email: admin.email, password: 'secret' })
  })

  it('falls through to login when the preload bridge is unavailable', async () => {
    Object.defineProperty(window, 'adminAuth', { configurable: true, writable: true, value: undefined })
    render(<App />)
    expect(await screen.findByRole('heading', { name: /sign in to continue/i })).toBeTruthy()
  })

  it('shows the loading submission state', async () => {
    let resolveLogin: (value: typeof admin) => void = () => undefined
    window.adminAuth.login = vi.fn().mockReturnValue(new Promise<typeof admin>((resolve) => { resolveLogin = resolve }))
    render(<App />)
    await screen.findByRole('heading', { name: /sign in to continue/i })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const pendingButton = await screen.findByRole('button', { name: /signing in/i })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    resolveLogin(admin)
  })

  it('toggles password visibility without submitting or changing its value', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /sign in to continue/i })
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.change(passwordInput, { target: { value: 'secret-value' } })
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(passwordInput).toHaveValue('secret-value')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
    expect(window.adminAuth.login).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(passwordInput).toHaveValue('secret-value')
    expect(window.adminAuth.login).not.toHaveBeenCalled()
  })

  it('shows authentication errors', async () => {
    window.adminAuth.login = vi.fn().mockRejectedValue(new Error('The email or password is incorrect.'))
    render(<App />)
    await screen.findByRole('heading', { name: /sign in to continue/i })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('email or password is incorrect')
  })

  it('renders the restored shell and logs out', async () => {
    window.adminAuth.restore = vi.fn().mockResolvedValue(admin)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Admin workspace' })).toBeInTheDocument()
    expect(screen.getByText(admin.email)).toBeInTheDocument()
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in to continue/i })).toBeTruthy())
    expect(window.adminAuth.logout).toHaveBeenCalled()
  })

  it('marks only an in-flight logout as busy', async () => {
    window.adminAuth.restore = vi.fn().mockResolvedValue(admin)
    let finishLogout: () => void = () => undefined
    window.adminAuth.logout = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finishLogout = resolve }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Admin workspace' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const pendingButton = screen.getByRole('button', { name: 'Signing out…' })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    finishLogout()
    expect(await screen.findByRole('heading', { name: /sign in to continue/i })).toBeInTheDocument()
  })

  it('syncs Presentation Management to the created product category using the backend category ID', async () => {
    const harryPotter = { id: 87, name: 'Harry Potter', subtitle: 'Magic in every build', description: null, imageUrl: null, imagePublicId: null }
    window.adminCategories.list = vi.fn().mockResolvedValue([{ id: 4, name: 'City', subtitle: null, description: null, imageUrl: null, imagePublicId: null }, harryPotter])
    const createdProduct = {
      id: 321, legoProductId: 654, colorfulLifeCategory: 'HARRY_POTTER' as const, category: harryPotter,
      condition: 'NEW' as const, originalPrice: '19.99', salePrice: null, currentStock: 1, availableStock: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01',
      legoProduct: { id: 654, setNumber: '75966', title: 'Harry Potter Set', description: null, theme: 'Harry Potter', ageRecommendation: '8+', pieceCount: 754, isRetired: false, isFeatureProduct: false, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, productImages: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    }
    window.adminAuth.restore = vi.fn().mockResolvedValue(admin)
    window.adminProducts.createProduct = vi.fn().mockResolvedValue(createdProduct)
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: 321, condition: 'NEW', active: true, usedLifecycle: null, currentStock: 1, availableStock: 1,
      legoProduct: { id: 654, setNumber: '75966', title: 'Harry Potter Set', category: { id: 87, name: 'Harry Potter' }, isFeatureProduct: false, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, productImages: [] },
    }])
    const { container } = render(<App />)
    expect(await screen.findByText('Presentation management')).toBeInTheDocument()
    expect(container.querySelector('.catalogue-workspace')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Set number'), { target: { value: '75966' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Harry Potter Set' } })
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'Harry Potter' } })
    fireEvent.change(screen.getByLabelText('Colorful Life Category'), { target: { value: '87' } })
    fireEvent.change(screen.getByLabelText('Age recommendation'), { target: { value: '8+' } })
    fireEvent.change(screen.getByLabelText('Piece count'), { target: { value: '754' } })
    fireEvent.change(screen.getByLabelText('Original price'), { target: { value: '19.99' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create product listing' }).closest('form') as HTMLFormElement)
    expect(await screen.findByText('Harry Potter Set')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Presentation category' })).toHaveValue('87')
    expect(window.adminProducts.listAdminProductListings).toHaveBeenCalledTimes(2)
  })

  it('syncs Presentation Management to the selected LegoProduct category after a Used offer is created', async () => {
    window.adminAuth.restore = vi.fn().mockResolvedValue(admin)
    const harryPotter = { id: 87, name: 'Harry Potter', subtitle: 'Magic in every build', description: null, imageUrl: null, imagePublicId: null }
    window.adminCategories.list = vi.fn().mockResolvedValue([{ id: 4, name: 'City', subtitle: null, description: null, imageUrl: null, imagePublicId: null }, harryPotter])
    window.adminProducts.searchLegoProducts = vi.fn().mockResolvedValue({ items: [{ id: 456, setNumber: '75966', title: 'Existing Harry Potter Set', description: null, theme: 'Harry Potter', ageRecommendation: '8+', pieceCount: 754, category: { id: 87, name: 'Harry Potter' }, isRetired: false, usedOfferStatus: 'NONE' as const }], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })
    window.adminProducts.createUsedOffer = vi.fn().mockResolvedValue({ id: 77, legoProductId: 456, condition: 'USED_LIKE_NEW' as const, originalPrice: '45.00', salePrice: null, currentStock: 1 as const, usedLifecycle: 'AVAILABLE' as const, damageDescription: 'Creased box' })
    window.adminProducts.listAdminProductListings = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: 778, condition: 'USED_LIKE_NEW', active: true, usedLifecycle: 'AVAILABLE', currentStock: 1, availableStock: 1,
      legoProduct: { id: 456, setNumber: '75966', title: 'Existing Harry Potter Set', category: { id: 87, name: 'Harry Potter' }, isFeatureProduct: false, catalogueArtworkUrl: null, catalogueArtworkPublicId: null, productImages: [] },
    }])
    render(<App />)
    expect(await screen.findByText('Presentation management')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'USED_LIKE_NEW' } })
    fireEvent.change(screen.getByLabelText('Search existing LEGO products'), { target: { value: '75966' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search products' }))
    fireEvent.click(await screen.findByRole('button', { name: /No New – Outer Box Damage offer/ }))
    fireEvent.change(screen.getByLabelText('Sale price (£)'), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Damage description'), { target: { value: 'Creased box' } })
    fireEvent.change(screen.getByLabelText(/Condition Photos/), { target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])], 'front.jpg', { type: 'image/jpeg' })] } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create New – Outer Box Damage offer' }).closest('form') as HTMLFormElement)
    expect(await screen.findByText('New – Outer Box Damage offer created: 77')).toBeInTheDocument()
    await waitFor(() => expect(window.adminProducts.listAdminProductListings).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('combobox', { name: 'Presentation category' })).toHaveValue('87')
    expect(screen.getByText('Listing #778 · Set 75966')).toBeInTheDocument()
  })
})

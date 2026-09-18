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
      uploadListingImage: vi.fn(),
    }
  })

  it('shows the unauthenticated login screen and submits credentials', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /sign in to continue/i })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: admin.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('ADMIN ACCESS CONFIRMED')).toBeTruthy())
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
    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
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
    expect(await screen.findByText('ADMIN ACCESS CONFIRMED')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in to continue/i })).toBeTruthy())
    expect(window.adminAuth.logout).toHaveBeenCalled()
  })
})

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import AddProduct from './AddProduct'
import CataloguePresentation from './CataloguePresentation'
import Categories from './Categories'
import Purchases from './Purchases'
import ProductEditor from './ProductEditor'
import type { ProductListing, UsedOfferCreated } from '../electron/product-contract'

type ViewState = 'restoring' | 'signed-out' | 'signed-in'

function App() {
  const [viewState, setViewState] = useState<ViewState>(() => window.adminAuth ? 'restoring' : 'signed-out')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [presentationRefreshToken, setPresentationRefreshToken] = useState(0)
  const [presentationRefreshCategory, setPresentationRefreshCategory] = useState<number | null>(null)
  const [section, setSection] = useState<'products' | 'edit-products' | 'categories' | 'purchases'>('products')

  useEffect(() => {
    if (!window.adminAuth) return

    void Promise.resolve().then(() => window.adminAuth.restore()).then(
      (restoredUser) => {
        setUser(restoredUser)
        setViewState(restoredUser ? 'signed-in' : 'signed-out')
      },
      () => {
        setError('Unable to restore your session. Please sign in again.')
        setViewState('signed-out')
      },
    )
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const authenticatedUser = await window.adminAuth.login({ email, password })
      setUser(authenticatedUser)
      setPassword('')
      setViewState('signed-in')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Sign-in failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await window.adminAuth.logout()
      setUser(null)
      setViewState('signed-out')
      setEmail('')
      setPassword('')
      setError('')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleProductCreated = (product: ProductListing) => {
    setPresentationRefreshCategory(product.category?.id ?? null)
    setPresentationRefreshToken((current) => current + 1)
  }

  const handleUsedOfferCreated = (_offer: UsedOfferCreated, categoryId: number | null) => {
    setPresentationRefreshCategory(categoryId)
    setPresentationRefreshToken((current) => current + 1)
  }

  if (viewState === 'restoring') {
    return <main className="auth-page"><p className="status-message">Restoring session…</p></main>
  }

  if (viewState === 'signed-in' && user) {
    return (
      <main className="shell">
        <header className="shell-header">
          <div><p className="eyebrow">COLORFUL LIFE</p><div className="workspace-title"><h1>Admin workspace</h1><span className="admin-status" aria-label="Administrator access confirmed">✓</span><span className="admin-email">{user.email}</span></div></div>
          <button className="button button-secondary" type="button" onClick={() => void handleLogout()} disabled={isLoggingOut} aria-busy={isLoggingOut}>{isLoggingOut ? 'Signing out…' : 'Sign out'}</button>
        </header>
        <nav className="workspace-nav" aria-label="Admin sections"><button className={`button ${section === 'products' ? 'button-primary' : 'button-secondary'}`} type="button" onClick={() => setSection('products')}>Products</button><button className={`button ${section === 'edit-products' ? 'button-primary' : 'button-secondary'}`} type="button" onClick={() => setSection('edit-products')}>Edit products</button><button className={`button ${section === 'categories' ? 'button-primary' : 'button-secondary'}`} type="button" onClick={() => setSection('categories')}>Categories</button><button className={`button ${section === 'purchases' ? 'button-primary' : 'button-secondary'}`} type="button" onClick={() => setSection('purchases')}>Purchases</button></nav>
        {section === 'edit-products' ? <ProductEditor /> : section === 'categories' ? <Categories /> : section === 'purchases' ? <Purchases /> : <div className="catalogue-workspace">
          <AddProduct onProductCreated={handleProductCreated} onUsedOfferCreated={handleUsedOfferCreated} />
          <CataloguePresentation refreshToken={presentationRefreshToken} refreshCategory={presentationRefreshCategory} />
        </div>}
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="identity-panel" aria-label="Colorful Life Admin">
          <div className="brand-mark" aria-hidden="true">CL</div>
          <p className="eyebrow">COLORFUL LIFE</p>
          <h1>Admin workspace</h1>
          <p>Product operations, catalogue management and fulfilment in one calm workspace.</p>
          <span className="identity-rule" aria-hidden="true" />
          <p className="identity-note">Built for the people who keep Colorful Life moving.</p>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <p className="eyebrow">ADMIN ACCESS</p>
          <h2 id="login-title">Sign in to continue</h2>
          <p className="intro">Use an administrator account to continue.</p>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input id="password" type={isPasswordVisible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button
                className="password-toggle"
                type="button"
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {isPasswordVisible ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11.3 11.3 0 0 1 12 5c5.2 0 8.6 4.3 9.8 7a16 16 0 0 1-3.1 4.2M6.2 6.2C4.4 7.6 3.2 9.4 2.2 12c1.2 2.7 4.6 7 9.8 7 1.5 0 2.8-.3 4-.8" /> : <><path d="M2.2 12C3.4 9.3 6.8 5 12 5s8.6 4.3 9.8 7c-1.2 2.7-4.6 7-9.8 7s-8.6-4.3-9.8-7Z" /><circle cx="12" cy="12" r="2.5" /></>}
                </svg>
              </button>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </section>
      </div>
    </main>
  )
}

export default App

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { stockApi, setStockAuth, getStockToken, getStockBrandRef } from '@/lib/api-admin'

export function StockLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const brandRef = searchParams.get('brand') || ''
  const [brandInfo, setBrandInfo] = useState<{ name?: string; logo_url?: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If already logged in, redirect
  useEffect(() => {
    if (getStockToken()) {
      const ref = getStockBrandRef() || brandRef
      navigate(`/app-estoque/painel${ref ? `?brand=${ref}` : ''}`, { replace: true })
    }
  }, [navigate, brandRef])

  // Bootstrap brand info
  useEffect(() => {
    if (!brandRef) return
    stockApi.validateBrand(brandRef)
      .then((data) => {
        setBrandInfo({ name: data.brand?.name, logo_url: data.brand?.logo_url })
        document.title = (data.brand?.name || 'Estoque') + ' — Login'
      })
      .catch(() => {})
  }, [brandRef])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim()
    const password = String(fd.get('password') || '').trim()

    if (!email || !password) {
      setError('Preencha e-mail e senha.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await stockApi.login(email, password, brandRef)
      setStockAuth(
        result.token,
        result.brand_id || result.brand?.id || '',
        brandRef || result.brand?.slug || '',
      )
      navigate(`/app-estoque/painel?brand=${brandRef || result.brand?.slug || ''}`)
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-6 page-enter">
        {/* Brand header */}
        <div className="text-center space-y-3">
          {brandInfo?.logo_url ? (
            <img
              src={brandInfo.logo_url}
              alt={brandInfo.name || 'Logo'}
              className="w-16 h-16 rounded-2xl object-cover mx-auto ring-1 ring-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center mx-auto text-2xl font-bold">
              E
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold">{brandInfo?.name || 'App Estoque'}</h1>
            <p className="text-xs text-muted">Credencial: estoque</p>
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-gray-600">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              required
              autoComplete="email"
              className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-gray-600">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Sua senha"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white font-semibold py-3 rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

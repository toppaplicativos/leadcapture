import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, LogIn, Eye, EyeOff, Package, Boxes } from 'lucide-react'
import { stockApi, setStockAuth, getStockToken, getStockBrandRef } from '@/lib/api-admin'

/**
 * Branded login page for stock managers.
 *
 * URL: /app-estoque/{brand-slug}
 *   - The slug is read from the URL params (preferred) or ?brand= query (legacy)
 *   - Brand info (name, logo, colors) is fetched from /api/auth/stock-brand
 *   - The whole page is themed with the brand's primary color
 *   - On success, navigates to /app-estoque/{slug}/painel
 *
 * This is a SEPARATE auth scope from the admin login (/login). Stock managers
 * never access /admin or /dashboard — only the inventory/clients app for their brand.
 */
type BrandInfo = {
  id?: string
  slug?: string
  name?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  slogan?: string
}

export function StockLoginPage() {
  const navigate = useNavigate()
  const params = useParams<{ slug?: string }>()
  const [searchParams] = useSearchParams()
  // Slug priority: URL param > ?brand= query > localStorage (last logged in)
  const brandRef = params.slug || searchParams.get('brand') || getStockBrandRef() || ''

  // Canonical URL: /app-estoque/{slug} (legacy ?brand= still accepted)
  useEffect(() => {
    const queryBrand = String(searchParams.get('brand') || '').trim()
    if (!params.slug && queryBrand) {
      navigate(`/app-estoque/${encodeURIComponent(queryBrand)}`, { replace: true })
    }
  }, [params.slug, searchParams, navigate])

  const [brand, setBrand] = useState<BrandInfo | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [bootstrapError, setBootstrapError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If already logged in, go straight to the panel
  useEffect(() => {
    if (getStockToken() && brandRef) {
      navigate(`/app-estoque/${brandRef}/painel`, { replace: true })
    }
  }, [navigate, brandRef])

  // Resolve brand info for theming
  useEffect(() => {
    if (!brandRef) {
      setBootstrapping(false)
      setBootstrapError('Acesso direto não permitido. Entre pelo link enviado pela sua loja.')
      return
    }
    setBootstrapping(true)
    stockApi.validateBrand(brandRef)
      .then((data) => {
        setBrand(data.brand || null)
        document.title = `${data.brand?.name || 'Estoque'} — Acesso`
      })
      .catch((err: any) => {
        setBootstrapError(err.message || 'Loja não encontrada.')
      })
      .finally(() => setBootstrapping(false))
  }, [brandRef])

  // Brand colors (with safe fallbacks)
  const primary = brand?.primary_color || '#0f82ff'
  const secondary = brand?.secondary_color || '#38bdf8'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Preencha e-mail e senha.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await stockApi.login(email.trim(), password, brandRef)
      setStockAuth(
        result.token,
        result.brand_id || result.brand?.id || brand?.id || '',
        brandRef || result.brand?.slug || brand?.slug || '',
      )
      navigate(`/app-estoque/${brandRef || result.brand?.slug || brand?.slug || ''}/painel`)
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <Loader2 size={28} className="text-white/40 animate-spin" />
      </div>
    )
  }

  if (bootstrapError && !brand) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
        <div className="max-w-sm w-full bg-gray-900/60 border border-white/10 rounded-3xl p-8 text-center backdrop-blur">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/20 grid place-items-center mb-3">
            <Package size={24} className="text-red-400" />
          </div>
          <h1 className="text-white text-base font-bold mb-1">Loja não encontrada</h1>
          <p className="text-white/50 text-xs leading-relaxed">{bootstrapError}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      style={{
        background: `radial-gradient(circle at 20% 10%, ${primary}22, transparent 50%), radial-gradient(circle at 80% 90%, ${secondary}22, transparent 50%), #0a0e1a`,
      }}
    >
      {/* Decorative blurs */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: primary }}
      />
      <div
        className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: secondary }}
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-7 sm:p-9">
          {/* Brand header */}
          <div className="text-center space-y-3 mb-7">
            {brand?.logo_url ? (
              <div className="relative inline-block">
                <div
                  className="absolute inset-0 rounded-2xl blur-xl opacity-50"
                  style={{ background: primary }}
                />
                <img
                  src={brand.logo_url}
                  alt={brand?.name || 'Logo'}
                  className="relative w-20 h-20 rounded-2xl object-cover ring-2 ring-white shadow-xl mx-auto"
                />
              </div>
            ) : (
              <div
                className="w-20 h-20 mx-auto rounded-2xl grid place-items-center text-white text-3xl font-extrabold shadow-xl"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
              >
                {(brand?.name || 'E')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
                {brand?.name || 'App Estoque'}
              </h1>
              <p className="text-[11px] uppercase tracking-[0.18em] font-bold mt-1.5"
                 style={{ color: primary }}>
                Painel de Estoque
              </p>
              {brand?.slogan && (
                <p className="text-xs text-gray-500 mt-2 italic">{brand.slogan}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-medium px-3.5 py-2.5 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                E-mail do gerente
              </label>
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-gray-300 focus:ring-2 transition"
                style={{
                  // @ts-expect-error CSS custom prop
                  '--tw-ring-color': `${primary}30`,
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-gray-300 focus:ring-2 transition"
                  style={{
                    // @ts-expect-error CSS custom prop
                    '--tw-ring-color': `${primary}30`,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                boxShadow: `0 10px 30px -8px ${primary}66`,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Acessar Estoque
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-2 text-[11px] text-gray-400">
            <Boxes size={12} />
            <span>Acesso restrito a gerentes da loja</span>
          </div>
        </div>

        {/* Footer signature */}
        <p className="text-center text-[10px] text-white/30 mt-5 font-medium tracking-wide">
          Powered by <span className="text-white/50 font-bold">leadcapture</span>
        </p>
      </div>
    </div>
  )
}

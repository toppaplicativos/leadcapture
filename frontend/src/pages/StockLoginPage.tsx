import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, LogIn, Eye, EyeOff, Package } from 'lucide-react'
import { stockApi, setStockAuth, getStockToken, getStockBrandRef } from '@/lib/api-admin'
import { Button, Input } from '@/components/ui'

/**
 * Branded login for stock managers — product register (ops tool), not landing theater.
 *
 * URL: /app-estoque/{brand-slug}
 * Auth scope is separate from admin (/login).
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
  const brandRef = params.slug || searchParams.get('brand') || getStockBrandRef() || ''

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

  useEffect(() => {
    if (getStockToken() && brandRef) {
      navigate(`/app-estoque/${brandRef}/painel`, { replace: true })
    }
  }, [navigate, brandRef])

  useEffect(() => {
    if (!brandRef) {
      setBootstrapping(false)
      setBootstrapError('Acesso direto não permitido. Entre pelo link enviado pela sua loja.')
      return
    }
    setBootstrapping(true)
    stockApi
      .validateBrand(brandRef)
      .then((data) => {
        setBrand(data.brand || null)
        document.title = `${data.brand?.name || 'Estoque'} — Acesso`
        const primary = data.brand?.primary_color
        if (primary) {
          document.documentElement.style.setProperty('--brand-primary', primary)
          document.documentElement.style.setProperty('--brand-secondary', data.brand?.secondary_color || primary)
        }
      })
      .catch((err: any) => {
        setBootstrapError(err.message || 'Loja não encontrada.')
      })
      .finally(() => setBootstrapping(false))
  }, [brandRef])

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
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Loader2 size={24} className="text-gray-400 animate-spin" />
      </div>
    )
  }

  if (bootstrapError && !brand) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
        <div className="max-w-sm w-full bg-white border border-border-light rounded-2xl p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 grid place-items-center mb-3">
            <Package size={22} className="text-red-600" />
          </div>
          <h1 className="text-gray-900 text-base font-bold mb-1">Loja não encontrada</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{bootstrapError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white border border-border-light rounded-2xl p-7 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="text-center space-y-3 mb-7">
            {brand?.logo_url ? (
              <img
                src={brand.logo_url}
                alt={brand?.name || 'Logo'}
                className="w-16 h-16 rounded-2xl object-cover mx-auto border border-border-light"
              />
            ) : (
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-900 text-white grid place-items-center text-xl font-bold">
                {(brand?.name || 'E')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">
                {brand?.name || 'App Estoque'}
              </h1>
              <p className="text-[13px] text-gray-500 mt-1">Acesso do gestor de estoque</p>
              {brand?.slogan && (
                <p className="text-xs text-gray-400 mt-2">{brand.slogan}</p>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-100 text-red-700 text-xs font-medium px-3.5 py-2.5 rounded-xl mb-4"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <Input
              id="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <div className="relative">
              <Input
                id="password"
                label="Senha"
                type={showPw ? 'text' : 'password'}
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-[34px] w-8 h-8 grid place-items-center text-gray-400 hover:text-gray-700 rounded-lg"
                aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button type="submit" fullWidth loading={loading} iconLeft={!loading ? <LogIn size={16} /> : undefined}>
              {loading ? 'Entrando…' : 'Entrar no estoque'}
            </Button>
          </form>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-5">
          Use o link da sua loja. Sessão separada do painel admin.
        </p>
      </div>
    </div>
  )
}

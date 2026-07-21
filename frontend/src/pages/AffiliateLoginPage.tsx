import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight, User, Loader2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { affiliateApi, getAffiliateToken, getAffiliateBrandRef, setAffiliateAuth } from '@/lib/api-affiliate'
import { applyAffiliatePwaTitle, cacheAffiliateBrandMeta } from '@/lib/affiliate-brand-meta'

type BrandInfo = {
  id?: string
  slug?: string
  name?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
}

export function AffiliateLoginPage() {
  const navigate = useNavigate()
  const params = useParams<{ slug?: string }>()
  const [searchParams] = useSearchParams()
  const brandRef = params.slug || searchParams.get('brand') || getAffiliateBrandRef() || ''
  const programRef = String(searchParams.get('program') || '').trim()

  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('modo') === 'cadastro' ? 'register' : 'login',
  )
  const [brand, setBrand] = useState<BrandInfo | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [bootstrapError, setBootstrapError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const queryBrand = String(searchParams.get('brand') || '').trim()
    if (!params.slug && queryBrand) {
      const qs = searchParams.toString()
      navigate(`/central-afiliado/${encodeURIComponent(queryBrand)}${qs ? `?${qs}` : ''}`, { replace: true })
    }
  }, [params.slug, searchParams, navigate])

  useEffect(() => {
    const token = getAffiliateToken()
    if (!token || !brandRef) return
    const slug = brandRef
    const base = `/central-afiliado/${slug}/painel`
    const dest = programRef ? `${base}/oportunidades?program=${encodeURIComponent(programRef)}` : base
    navigate(dest, { replace: true })
  }, [brandRef, programRef, navigate])

  useEffect(() => {
    if (!brandRef) {
      setBootstrapping(false)
      setBootstrapError('Acesse pelo link da marca para entrar na Central do Afiliado.')
      return
    }
    setBootstrapping(true)
    affiliateApi.validateBrand(brandRef)
      .then((data) => {
        setBrand(data.brand || null)
        const brandName = data.brand?.name || 'Afiliado'
        cacheAffiliateBrandMeta(brandName, data.brand?.logo_url)
        applyAffiliatePwaTitle(brandName)
        document.title = `${brandName} — Central do Afiliado`
        if (data.program?.is_enabled === false) {
          setBootstrapError('Programa de afiliados desativado para esta marca.')
        }
      })
      .catch((err: Error) => {
        setBootstrapError(err.message || 'Marca não encontrada.')
      })
      .finally(() => setBootstrapping(false))
  }, [brandRef])

  const primary = brand?.primary_color || '#16a34a'
  const canRegister = brand != null

  function painelPath() {
    const slug = brandRef || brand?.slug || ''
    const base = `/central-afiliado/${slug}/painel`
    if (programRef) {
      return `${base}/oportunidades?program=${encodeURIComponent(programRef)}`
    }
    return base
  }

  function goToPainel(result: { token?: string; brand_id?: string; user?: { brand_slug?: string } }) {
    if (!result.token) return
    setAffiliateAuth(
      result.token,
      result.brand_id || brand?.id || '',
      brandRef || result.user?.brand_slug || brand?.slug || '',
    )
    navigate(painelPath())
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setError('')
    setSuccess('')
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await affiliateApi.login(email.trim(), password, brandRef)
      goToPainel(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password) {
      setError('Preencha nome, e-mail e senha.')
      return
    }
    if (password.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (password !== confirmPw) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await affiliateApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        brand: brandRef,
      })
      if (result.pending_approval) {
        setSuccess(result.message || 'Cadastro enviado! Aguarde aprovação da marca.')
        setMode('login')
        return
      }
      if (result.token) {
        goToPainel(result)
        return
      }
      setSuccess(result.message || 'Cadastro realizado!')
      setMode('login')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar.')
    } finally {
      setLoading(false)
    }
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={28} className="text-gray-300 animate-spin" />
      </div>
    )
  }

  if (bootstrapError && !brand) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-900 font-semibold mb-1">Indisponível</p>
          <p className="text-gray-500 text-sm">{bootstrapError}</p>
        </div>
      </div>
    )
  }

  const isLogin = mode === 'login'

  return (
    <div className={`relative min-h-screen overflow-x-hidden bg-white flex flex-col text-slate-950 sm:bg-[#f6eff8] ${isLogin ? 'justify-start sm:justify-center sm:py-5' : 'justify-start sm:py-5'}`}>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-64 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[#7b2c91]/12 blur-3xl sm:h-[40rem] sm:w-[40rem]" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#351044] via-[#7b2c91] to-[#d6a94c]" />
      </div>
      <header className="relative z-10 flex w-full flex-col items-center bg-[#f2e4f5] px-5 pb-8 pt-8 text-center sm:bg-transparent sm:pb-4 sm:pt-0">
        {brand?.logo_url ? (
          <div className="mb-2.5 grid h-[4.25rem] w-[4.25rem] place-items-center overflow-hidden rounded-[1.35rem] border border-white/80 bg-white/90 shadow-[0_12px_32px_rgba(66,20,82,0.11)] backdrop-blur">
            <img src={brand.logo_url} alt={`Logomarca ${brand?.name || ''}`} className="h-[3.8rem] w-[3.8rem] scale-[1.35] object-contain" />
          </div>
        ) : (
          <div
            className="mb-2.5 grid h-[4.25rem] w-[4.25rem] place-items-center rounded-[1.35rem] text-lg font-bold text-white shadow-[0_12px_32px_rgba(66,20,82,0.14)]"
            style={{ background: `linear-gradient(135deg, ${primary}, ${brand?.secondary_color || '#22c55e'})` }}
          >
            {(brand?.name || 'A')[0].toUpperCase()}
          </div>
        )}
        <div className="text-center">
          <p className="text-[19px] font-extrabold leading-none tracking-[-0.035em] text-slate-950">{brand?.name}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: primary }}>Central do Afiliado</p>
        </div>
      </header>

      <main className="relative z-10 -mt-5 flex flex-1 items-start justify-center sm:mt-0 sm:flex-none sm:px-6">
        <div className="min-h-[calc(100svh-10.5rem)] w-full max-w-none rounded-t-[1.75rem] border border-white/90 bg-white p-5 shadow-none sm:min-h-0 sm:max-w-[400px] sm:rounded-[1.75rem] sm:bg-white/95 sm:p-6 sm:shadow-[0_22px_65px_rgba(64,18,78,0.14)] sm:backdrop-blur-xl">
          {canRegister && (
            <div className="mb-7 flex gap-1 rounded-2xl bg-[#f3edf5] p-1.5" role="tablist" aria-label="Acesso à Central do Afiliado">
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                onClick={() => switchMode('login')}
                className={`min-h-10 flex-1 rounded-xl text-[13px] font-bold transition ${
                  isLogin ? 'bg-white text-slate-950 shadow-[0_5px_18px_rgba(64,18,78,0.1)]' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                onClick={() => switchMode('register')}
                className={`min-h-10 flex-1 rounded-xl text-[13px] font-bold transition ${
                  !isLogin ? 'bg-white text-slate-950 shadow-[0_5px_18px_rgba(64,18,78,0.1)]' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Criar conta
              </button>
            </div>
          )}

          <div className="mb-5 text-center">
            <p className="hidden">
              Área exclusiva para parceiros
            </p>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950">
              {isLogin ? 'Entrar' : 'Criar conta'}
            </h1>
            <p className="hidden">
              {programRef
                ? 'Depois de entrar, você será direcionado ao programa indicado.'
                : isLogin
                  ? 'Entre para acompanhar links, vendas, comissões e oportunidades.'
                  : 'Cadastre-se para divulgar produtos desta marca.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-medium px-3.5 py-2.5 rounded-xl mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium px-3.5 py-2.5 rounded-xl mb-4">
              {success}
            </div>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                autoComplete="email"
                iconLeft={<Mail size={16} strokeWidth={1.75} />}
              />
              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
                iconRight={
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                  >
                    {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                }
              />
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loading}
                disabled={!email.trim() || !password}
                iconRight={!loading && <ArrowRight size={16} strokeWidth={2} />}
                className="mt-2 min-h-12 rounded-xl font-bold shadow-[0_12px_30px_rgba(84,28,103,0.18)]"
              >
                {loading ? 'Entrando' : 'Entrar'}
              </Button>
              {canRegister && (
                <p className="hidden">
                  Novo por aqui?{' '}
                  <button type="button" onClick={() => switchMode('register')} className="font-bold" style={{ color: primary }}>
                    Criar conta
                  </button>
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <Input
                label="Nome completo"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                required
                iconLeft={<User size={16} strokeWidth={1.75} />}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                iconLeft={<Mail size={16} strokeWidth={1.75} />}
              />
              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 6 caracteres"
                required
                minLength={6}
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
              />
              <Input
                label="Confirmar senha"
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
              />
              <Button type="submit" size="lg" fullWidth loading={loading} className="mt-2 min-h-12 rounded-xl font-bold shadow-[0_12px_30px_rgba(84,28,103,0.18)]">
                {loading ? 'Cadastrando' : 'Criar conta'}
              </Button>
            </form>
          )}
          <p className="hidden">
            Ambiente seguro e exclusivo para parceiros {brand?.name}.
          </p>
        </div>
      </main>
    </div>
  )
}

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
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [affiliateCode, setAffiliateCode] = useState('')
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
        phone: phone.trim() || undefined,
        region: region.trim() || undefined,
        code: affiliateCode.trim() || undefined,
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
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-5 flex items-center gap-3">
        {brand?.logo_url ? (
          <img src={brand.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
        ) : (
          <div
            className="w-9 h-9 rounded-xl grid place-items-center text-white text-sm font-bold"
            style={{ background: `linear-gradient(135deg, ${primary}, ${brand?.secondary_color || '#22c55e'})` }}
          >
            {(brand?.name || 'A')[0].toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-[15px] font-bold tracking-tight text-gray-900">{brand?.name}</p>
          <p className="text-[11px] text-gray-500">Central do Afiliado</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-10">
        <div className="w-full max-w-[360px]">
          {canRegister && (
            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-8">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition ${
                  isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition ${
                  !isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Criar conta
              </button>
            </div>
          )}

          <div className="mb-6">
            <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">
              {isLogin ? 'Entrar' : 'Criar conta'}
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {programRef
                ? 'Depois de entrar, você será direcionado ao programa indicado.'
                : isLogin
                  ? 'Acesse sua central de afiliado.'
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
            <form onSubmit={handleLogin} className="space-y-4">
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
                className="mt-2"
              >
                {loading ? 'Entrando' : 'Entrar'}
              </Button>
              {canRegister && (
                <p className="text-center text-xs text-gray-500">
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
                label="Código de afiliado (opcional)"
                type="text"
                value={affiliateCode}
                onChange={(e) => setAffiliateCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="joao10"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Telefone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="31999998888" />
                <Input label="Região" type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="BH" />
              </div>
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
              <Button type="submit" size="lg" fullWidth loading={loading} className="mt-1">
                {loading ? 'Cadastrando' : 'Criar conta'}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
import { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight, User, Loader2, Gift, Building2, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { BrandMark } from '@/components/BrandMark'
import {
  getPartnersToken,
  partnersApi,
  setPartnersAuth,
  setPendingInvite,
} from '@/lib/api-partners'

type InvitePreview = {
  program?: { name?: string; description?: string }
  organization?: { name?: string; logo_url?: string; primary_color?: string }
  email_restricted?: string | null
  label?: string | null
}

type Mode = 'login' | 'register'

export function PartnersLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteCode = String(searchParams.get('invite') || '').trim()

  const [mode, setMode] = useState<Mode>(
    searchParams.get('modo') === 'cadastro' ? 'register' : 'login',
  )
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteCode)
  const [inviteError, setInviteError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [brandQuery, setBrandQuery] = useState('')
  const [brandOptions, setBrandOptions] = useState<Array<{ id: string; name: string; slug: string; logo_url?: string | null }>>([])
  const [selectedBrand, setSelectedBrand] = useState<{ id: string; name: string; slug: string; logo_url?: string | null } | null>(null)
  const [brandSearching, setBrandSearching] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const emailLocked = !!invitePreview?.email_restricted
  const isLogin = mode === 'login'

  useEffect(() => {
    if (getPartnersToken()) {
      if (inviteCode) setPendingInvite(inviteCode)
      navigate(inviteCode ? `/parceiros/painel?invite=${encodeURIComponent(inviteCode)}` : '/parceiros/painel', { replace: true })
    }
    document.title = 'LeadCapture Afiliados'
  }, [navigate, inviteCode])

  useEffect(() => {
    if (!inviteCode) return
    setInviteLoading(true)
    setInviteError('')
    partnersApi.invitePreview(inviteCode)
      .then((data) => {
        setInvitePreview(data)
        if (data.email_restricted) setEmail(String(data.email_restricted))
        if (data.email_restricted) setMode('login')
      })
      .catch((err: Error) => setInviteError(err.message || 'Convite inválido'))
      .finally(() => setInviteLoading(false))
  }, [inviteCode])

  useEffect(() => {
    const query = brandQuery.trim()
    if (selectedBrand || query.length < 2) {
      setBrandOptions([])
      return
    }
    const timer = window.setTimeout(() => {
      setBrandSearching(true)
      partnersApi.searchBrands(query)
        .then((data) => setBrandOptions(data.brands || []))
        .catch(() => setBrandOptions([]))
        .finally(() => setBrandSearching(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [brandQuery, selectedBrand])

  function switchMode(m: Mode) {
    if (emailLocked && m === 'register') return
    setMode(m)
    setError('')
    setSuccess('')
  }

  async function afterAuth(result: { token?: string }) {
    if (!result.token) return
    setPartnersAuth(result.token)
    if (inviteCode) {
      setPendingInvite(inviteCode)
      navigate(`/parceiros/painel?invite=${encodeURIComponent(inviteCode)}`, { replace: true })
      return
    }
    navigate('/parceiros/painel', { replace: true })
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const result = await partnersApi.login(email.trim(), password)
      await afterAuth(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password) return
    if (password !== confirmPw) {
      setError('As senhas não coincidem')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await partnersApi.register({
        name: name.trim(),
        email: email.trim(),
        password,
        brand_id: selectedBrand?.id,
      })
      setSuccess(result.message || 'Conta criada!')
      await afterAuth(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro no cadastro')
    } finally {
      setLoading(false)
    }
  }

  const submitLabel = inviteCode
    ? (isLogin ? 'Entrar e aceitar convite' : 'Criar conta e aceitar convite')
    : (isLogin ? 'Entrar' : 'Criar conta')

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="relative px-6 py-5 flex items-center justify-end min-h-[52px]">
        {!inviteCode && (
          <Link
            to="/parceiros"
            className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 transition"
          >
            Voltar
          </Link>
        )}
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-10">
        <div className="w-full max-w-[360px]">
          <div className="flex flex-col items-center text-center mb-8">
            <BrandMark size={40} className="mb-3" />
            <p className="text-[18px] font-bold tracking-tight text-gray-900 leading-none">
              LeadCapture
            </p>
            <p className="mt-1 text-[12px] font-semibold tracking-wide text-gray-700">
              Afiliados
            </p>
          </div>

          {inviteLoading && (
            <div className="flex justify-center mb-6">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}

          {inviteError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-700 font-medium mb-6">
              {inviteError}
            </div>
          )}

          {invitePreview && !inviteError && (
            <div className="px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 mb-6 flex gap-3 items-start">
              {invitePreview.organization?.logo_url ? (
                <img
                  src={invitePreview.organization.logo_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gray-200 grid place-items-center shrink-0">
                  <Gift size={18} className="text-gray-500" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-500 tracking-tight">
                  Convite de afiliado
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">
                  {invitePreview.program?.name || 'Programa de afiliados'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {invitePreview.organization?.name || 'Uma organização'} convidou você para participar.
                </p>
                {invitePreview.program?.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{invitePreview.program.description}</p>
                )}
                {invitePreview.email_restricted && (
                  <p className="text-[11px] text-gray-400 mt-2">Convite restrito ao e-mail indicado</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-8">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition ${
                isLogin
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              disabled={emailLocked}
              className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition ${
                !isLogin
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              } ${emailLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Criar conta
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">
              {invitePreview ? 'Aceitar convite' : (isLogin ? 'Entrar' : 'Criar conta')}
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {invitePreview
                ? 'Entre ou crie sua conta global de parceiro para aceitar o convite.'
                : isLogin
                  ? 'Acesse sua conta global de parceiro.'
                  : 'Cadastre-se e comece a gerenciar programas e ganhos.'}
            </p>
          </div>

          {success && (
            <div className="px-3.5 py-2.5 rounded-xl bg-green-50 border border-green-100 text-[13px] text-green-700 font-medium mb-4">
              {success}
            </div>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                autoComplete="email"
                readOnly={emailLocked}
                iconLeft={<Mail size={16} strokeWidth={1.75} />}
              />

              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
                iconRight={
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                  >
                    {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                }
                error={error || undefined}
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loading}
                disabled={!email.trim() || !password || (!!inviteCode && !!inviteError)}
                iconRight={!loading && <ArrowRight size={16} strokeWidth={2} />}
                className="mt-2"
              >
                {loading ? 'Entrando' : submitLabel}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <Input
                label="Seu nome"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome completo"
                required
                autoFocus
                autoComplete="name"
                iconLeft={<User size={16} strokeWidth={1.75} />}
              />

              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                readOnly={emailLocked}
                iconLeft={<Mail size={16} strokeWidth={1.75} />}
              />

              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                autoComplete="new-password"
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
                iconRight={
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                  >
                    {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                }
              />

              <Input
                label="Confirmar senha"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
                iconLeft={<Lock size={16} strokeWidth={1.75} />}
              />

              <div className="w-full">
                <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">Marca de interesse <span className="font-normal text-gray-400">(opcional)</span></label>
                {selectedBrand ? (
                  <div className="flex h-12 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3">
                    <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-white text-emerald-700">
                      {selectedBrand.logo_url ? <img src={selectedBrand.logo_url} alt="" className="h-full w-full object-cover" /> : <Building2 size={16} />}
                    </span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-900">{selectedBrand.name}</strong><span className="text-[10px] text-gray-500">Será associada ao seu cadastro</span></span>
                    <button type="button" onClick={() => { setSelectedBrand(null); setBrandQuery('') }} aria-label="Remover marca" className="grid h-8 w-8 place-items-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700"><X size={15} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Building2 size={16} className="pointer-events-none absolute left-3.5 top-3.5 z-10 text-gray-400" />
                    <input value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} placeholder="Busque pelo nome da marca" className="ds-control ds-control--icon-left h-11" />
                    {brandSearching && <Loader2 size={15} className="absolute right-3.5 top-3.5 animate-spin text-gray-400" />}
                    {brandOptions.length > 0 && (
                      <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                        {brandOptions.map((brand) => <button key={brand.id} type="button" onClick={() => { setSelectedBrand(brand); setBrandQuery(brand.name); setBrandOptions([]) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-50"><Building2 size={14} className="text-gray-400" /><span className="truncate font-medium text-gray-800">{brand.name}</span></button>)}
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">Você também pode continuar sem escolher uma marca e explorar os programas depois.</p>
              </div>

              {error && (
                <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-700 font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loading}
                disabled={!name.trim() || !email.trim() || !password || (!!inviteCode && !!inviteError)}
                iconRight={!loading && <ArrowRight size={16} strokeWidth={2} />}
                className="mt-2"
              >
                {loading ? 'Criando conta' : submitLabel}
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-[11px] text-gray-400 tracking-wide">
          LeadCapture Afiliados · Conta global de afiliado
        </p>
      </footer>
    </div>
  )
}

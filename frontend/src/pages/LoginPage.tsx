import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight, User, Building2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { BrandMark } from '@/components/BrandMark'
import { isMasterHost, masterAdminBase } from '@/lib/master-host'

type Mode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || ''
  const errorParam = searchParams.get('error') || ''
  const initialMode = searchParams.get('modo') === 'cadastro' ? 'register' : 'login'

  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(
    errorParam === 'not_super_admin'
      ? 'Esta conta não tem acesso ao painel master.'
      : '',
  )
  const [loading, setLoading] = useState(false)

  function postLoginPath(): string {
    if (redirect && redirect.startsWith('/')) return redirect
    if (isMasterHost()) return masterAdminBase()
    return '/admin'
  }

  /* Master impersonation: /login?impersonate=1#token=JWT */
  useEffect(() => {
    if (searchParams.get('impersonate') !== '1') return
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : ''
    const m = hash.match(/token=([^&]+)/)
    if (!m?.[1]) return
    try {
      const tok = decodeURIComponent(m[1])
      localStorage.setItem('lead-system-token', tok)
      sessionStorage.setItem('lead-system:impersonation', '1')
      window.history.replaceState(null, '', window.location.pathname)
      navigate('/admin', { replace: true })
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const token = localStorage.getItem('lead-system-token')
  useEffect(() => {
    if (!token) return

    let mounted = true
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(r => {
        if (r.ok) {
          if (mounted) navigate(postLoginPath(), { replace: true })
          return
        }
        localStorage.removeItem('lead-system-token')
        localStorage.removeItem('lead-system:active-brand-id')
      })
      .catch(() => {
        if (mounted) navigate(postLoginPath(), { replace: true })
      })

    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const d = await r.json()
      if (!r.ok || !d.token) throw new Error(d.error || 'Credenciais inválidas')

      localStorage.setItem('lead-system-token', d.token)

      const dest = postLoginPath()
      if (dest === '/admin') {
        const br = await fetch('/api/brands', {
          headers: { 'Authorization': `Bearer ${d.token}`, 'Content-Type': 'application/json' },
        })
        const bd = await br.json()
        if (bd.active_brand_id) {
          localStorage.setItem('lead-system:active-brand-id', bd.active_brand_id)
        }
      }

      navigate(dest, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password) return
    if (password.length < 8) {
      setError('Senha deve ter ao menos 8 caracteres.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          brand_name: brandName.trim() || name.trim(),
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.token) throw new Error(d.error || 'Erro ao criar conta')

      localStorage.setItem('lead-system-token', d.token)

      const br = await fetch('/api/brands', {
        headers: { 'Authorization': `Bearer ${d.token}`, 'Content-Type': 'application/json' },
      })
      const bd = await br.json()
      if (bd.active_brand_id) {
        localStorage.setItem('lead-system:active-brand-id', bd.active_brand_id)
      }

      navigate('/admin', { replace: true })
    } catch (err: any) {
      if (err.message === 'Email already registered') {
        setError('Este e-mail já está cadastrado. Faça login.')
      } else {
        setError(err.message || 'Erro ao criar conta')
      }
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-[15px] font-bold tracking-tight text-gray-900">LeadCapture</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-10">
        <div className="w-full max-w-[360px]">
          {/* Tab switcher */}
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
              className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition ${
                !isLogin
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Criar conta
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">
              {isLogin ? 'Entrar' : 'Criar conta'}
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {isLogin
                ? 'Acesse o painel para gerenciar sua operação.'
                : 'Cadastre-se e comece a usar em minutos.'}
            </p>
          </div>

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
                disabled={!email.trim() || !password}
                iconRight={!loading && <ArrowRight size={16} strokeWidth={2} />}
                className="mt-2"
              >
                {loading ? 'Entrando' : 'Entrar'}
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
                iconLeft={<Mail size={16} strokeWidth={1.75} />}
              />

              <Input
                label="Senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimo 8 caracteres"
                required
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
                label="Nome do seu negocio"
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Ex: Distribuidora Master"
                autoComplete="organization"
                iconLeft={<Building2 size={16} strokeWidth={1.75} />}
              />

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
                disabled={!name.trim() || !email.trim() || !password}
                iconRight={!loading && <ArrowRight size={16} strokeWidth={2} />}
                className="mt-2"
              >
                {loading ? 'Criando conta' : 'Criar conta'}
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="px-6 py-5 text-center">
        <p className="text-[11px] text-gray-400 tracking-wide">
          Painel administrativo · LeadCapture
        </p>
      </footer>
    </div>
  )
}

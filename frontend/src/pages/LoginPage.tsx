import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { BrandMark } from '@/components/BrandMark'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || ''
  const errorParam = searchParams.get('error') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(
    errorParam === 'not_super_admin'
      ? 'Esta conta não tem acesso ao painel master.'
      : '',
  )
  const [loading, setLoading] = useState(false)

  /**
   * Resolve the post-login destination:
   *   - explicit ?redirect=/foo  → goes there
   *   - hostname is adm.*        → goes to /master
   *   - otherwise                → /admin
   */
  function postLoginPath(): string {
    if (redirect && redirect.startsWith('/')) return redirect
    if (typeof window !== 'undefined' && window.location.hostname.startsWith('adm.')) {
      return '/master'
    }
    return '/admin'
  }

  // Already logged in → go to destination
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

  async function handleSubmit(e: FormEvent) {
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

      // Only fetch brands if going to /admin (not needed for /master)
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar — only logo */}
      <header className="px-6 py-5 flex items-center gap-2.5">
        <BrandMark size={28} />
        <span className="text-[15px] font-bold tracking-tight text-gray-900">LeadCapture</span>
      </header>

      {/* Center form */}
      <main className="flex-1 flex items-center justify-center px-6 pb-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight leading-tight">
              Entrar
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">
              Acesse o painel para gerenciar sua operação.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 text-center">
        <p className="text-[11px] text-gray-400 tracking-wide">
          Painel administrativo · LeadCapture
        </p>
      </footer>
    </div>
  )
}

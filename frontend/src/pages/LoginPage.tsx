import { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Building2,
  Handshake,
  Boxes,
  Bike,
  PackageSearch,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { BrandMark } from '@/components/BrandMark'
import { isMasterHost, masterAdminBase } from '@/lib/master-host'

const LOGIN_MEDIA = {
  poster: '/login/panel.jpg',
  video: '/login/panel.mp4',
} as const

const ACCESS_PROFILES = [
  {
    label: 'Afiliado',
    detail: 'Programas, divulgação e vendas',
    to: '/parceiros/entrar',
    icon: Handshake,
  },
  {
    label: 'Estoque',
    detail: 'Operação vinculada à loja',
    to: '/app-estoque',
    icon: Boxes,
  },
  {
    label: 'Entregador',
    detail: 'Rotas e entregas no Mob',
    to: '/mob/entrar',
    icon: Bike,
  },
  {
    label: 'Cliente',
    detail: 'Acompanhar um pedido',
    to: '/rastreio',
    icon: PackageSearch,
  },
] as const

function LoginMediaPanel() {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  return (
    <aside className="org-login__media" aria-hidden>
      <img
        src={LOGIN_MEDIA.poster}
        alt=""
        className="org-login__media-img"
        decoding="async"
      />
      {!reduceMotion && (
        <video
          className="org-login__media-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={LOGIN_MEDIA.poster}
        >
          <source src={LOGIN_MEDIA.video} type="video/mp4" />
        </video>
      )}
      <div className="org-login__media-veil" />
      <div className="org-login__media-content">
        <p className="org-login__media-kicker">Organização</p>
        <p className="org-login__media-title">
          O painel da sua
          <br />
          operação comercial.
        </p>
        <ul className="org-login__media-points">
          <li>Leads, WhatsApp e campanhas</li>
          <li>Catálogo, pedidos e afiliados</li>
          <li>Uma conta, toda a estrutura</li>
        </ul>
      </div>
    </aside>
  )
}

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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    document.title = 'Entrar · Organização · LeadCapture'
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  /* Cadastro grátis removido: só via plano + pagamento */
  useEffect(() => {
    if (searchParams.get('modo') === 'cadastro') {
      navigate('/inicio#planos', { replace: true })
    }
  }, [searchParams, navigate])

  function postLoginPath(): string {
    if (redirect && redirect.startsWith('/')) return redirect
    if (isMasterHost()) return masterAdminBase()
    // PWA/mobile: chat com última conversa (ou nova); painel não é home
    return '/assistente'
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
      navigate('/assistente', { replace: true })
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const token = localStorage.getItem('lead-system-token')
  useEffect(() => {
    if (!token) return

    let alive = true
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (r.ok) {
          if (alive) navigate(postLoginPath(), { replace: true })
          return
        }
        // Só limpa sessão em 401/token inválido — nunca em 5xx (deploy/restart)
        let body: any = {}
        try { body = await r.json() } catch { /* ignore */ }
        const code = String(body?.code || '').toUpperCase()
        const hard =
          r.status === 401 ||
          code === 'TOKEN_EXPIRED' ||
          code === 'TOKEN_INVALID' ||
          code === 'UNAUTHORIZED'
        if (hard) {
          localStorage.removeItem('lead-system-token')
          localStorage.removeItem('lead-system:active-brand-id')
          return
        }
        // API instável: se há token, entra no app mesmo assim
        if (alive) navigate(postLoginPath(), { replace: true })
      })
      .catch(() => {
        // Rede instável com token salvo → mantém sessão e entra
        if (alive) navigate(postLoginPath(), { replace: true })
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

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
          headers: { Authorization: `Bearer ${d.token}`, 'Content-Type': 'application/json' },
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
    <div className={`org-login${mounted ? ' is-ready' : ''}`}>
      <LoginMediaPanel />

      <div className="org-login__panel">
        <header className="org-login__top">
          <Link to="/inicio" className="org-login__brand">
            <BrandMark size={28} />
            <span>LeadCapture</span>
          </Link>
          <Link to="/inicio#planos" className="org-login__plans-link">
            Ver planos
          </Link>
        </header>

        <main className="org-login__main">
          <div className="org-login__card">
            <div className="org-login__identity">
              <span className="org-login__identity-icon" aria-hidden>
                <Building2 size={19} strokeWidth={1.9} />
              </span>
              <div>
                <p className="org-login__eyebrow">Organização</p>
                <h1 className="org-login__title">Entrar no painel</h1>
              </div>
            </div>

            <form onSubmit={handleLogin} className="org-login__form" noValidate>
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@suaempresa.com"
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
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                    className="org-login__eye"
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
                iconRight={!loading ? <ArrowRight size={16} strokeWidth={2} /> : undefined}
                className="org-login__submit"
              >
                {loading ? 'Entrando…' : 'Entrar na organização'}
              </Button>
            </form>

            <div className="org-login__secure">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden />
              <span>Sessão segura · Dados da marca isolados por organização</span>
            </div>

            <p className="org-login__footer-note">
              Ainda não tem conta?{' '}
              <Link to="/inicio#planos">Conhecer os planos</Link>
            </p>

            <div className="org-login__access-divider">
              <span>Outros acessos</span>
            </div>

            <nav className="org-login__access-grid" aria-label="Escolha outro tipo de acesso">
              {ACCESS_PROFILES.map(({ label, detail, to, icon: Icon }) => (
                <Link key={label} to={to} className="org-login__access-item">
                  <span className="org-login__access-icon" aria-hidden>
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <span className="org-login__access-copy">
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                  <ArrowRight size={14} strokeWidth={2} className="org-login__access-arrow" aria-hidden />
                </Link>
              ))}
            </nav>
          </div>
        </main>

        <footer className="org-login__bottom">
          <p>Painel administrativo · LeadCapture</p>
        </footer>
      </div>
    </div>
  )
}

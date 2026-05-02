import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle2, Loader2, ArrowRight, AlertCircle } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'

type Status =
  | { kind: 'loading' }
  | { kind: 'pending'; message: string }
  | { kind: 'success'; user: { name: string; email: string }; token: string }
  | { kind: 'error'; message: string }

export function CadastroSucessoPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session') || ''
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    document.title = 'Cadastro confirmado · LeadCapture'
    if (!sessionId) {
      setStatus({ kind: 'error', message: 'Sessão de pagamento não encontrada na URL.' })
      return
    }

    let cancelled = false
    async function poll() {
      try {
        const r = await fetch(`/api/public/signup/session/${encodeURIComponent(sessionId)}`)
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) {
          setStatus({ kind: 'error', message: d?.message || 'Falha ao validar pagamento.' })
          return
        }
        if (!d.paid) {
          setStatus({ kind: 'pending', message: 'Aguardando confirmação do pagamento…' })
          // Retry every 2.5s
          setTimeout(poll, 2500)
          return
        }
        if (!d.ready || !d.token) {
          setStatus({
            kind: 'pending',
            message: d.message || 'Estamos preparando sua conta...',
          })
          setTimeout(poll, 2500)
          return
        }
        // Pago + conta criada → salva token + libera para entrar
        localStorage.setItem('lead-system-token', d.token)
        setStatus({ kind: 'success', user: d.user, token: d.token })
      } catch (err: any) {
        if (cancelled) return
        setStatus({ kind: 'error', message: err?.message || 'Erro de rede' })
      }
    }
    poll()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="px-6 py-5 max-w-6xl mx-auto w-full">
        <Link to="/inicio" className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="text-[15px] font-bold tracking-tight">LeadCapture</span>
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-10">
        <div className="max-w-md w-full text-center">
          {status.kind === 'loading' && <Loading title="Validando pagamento…" />}

          {status.kind === 'pending' && <Loading title={status.message} subtitle="Isso leva apenas alguns segundos." />}

          {status.kind === 'success' && (
            <>
              <span className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 mb-6">
                <CheckCircle2 size={28} strokeWidth={1.75} />
              </span>
              <h1 className="text-[28px] font-bold tracking-[-0.025em] leading-tight">
                Bem-vindo, {status.user.name.split(' ')[0]}!
              </h1>
              <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">
                Pagamento confirmado e conta criada. Enviamos os detalhes para <strong>{status.user.email}</strong>.
              </p>
              <a
                href="https://app.leadcapture.online/admin"
                className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-gray-900 text-white text-[14px] font-semibold tracking-tight hover:bg-gray-800 transition"
              >
                Entrar no painel
                <ArrowRight size={15} strokeWidth={2.25} />
              </a>
            </>
          )}

          {status.kind === 'error' && (
            <>
              <span className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-red-50 ring-1 ring-red-200 text-red-600 mb-6">
                <AlertCircle size={28} strokeWidth={1.75} />
              </span>
              <h1 className="text-[24px] font-bold tracking-[-0.025em]">Não conseguimos confirmar</h1>
              <p className="text-[14px] text-gray-600 mt-2 leading-relaxed">{status.message}</p>
              <Link
                to="/cadastro"
                className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-gray-100 text-gray-900 text-[13px] font-semibold hover:bg-gray-200 transition"
              >
                Voltar ao cadastro
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function Loading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <span className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gray-100 mb-6">
        <Loader2 size={28} strokeWidth={1.5} className="animate-spin text-gray-700" />
      </span>
      <h1 className="text-[24px] font-bold tracking-[-0.025em] leading-tight">{title}</h1>
      {subtitle && <p className="text-[14px] text-gray-600 mt-2">{subtitle}</p>}
    </>
  )
}

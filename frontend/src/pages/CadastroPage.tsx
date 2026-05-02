import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Mail,
  Lock,
  User,
  Building2,
  Loader2,
  CheckCircle2,
  Star,
  ShieldCheck,
  CreditCard,
} from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'

interface Plan {
  id: string
  slug: string
  name: string
  tagline: string | null
  price_cents: number
  interval: string
  billing_type: string
  features: string[] | string
  is_featured: boolean
  is_active: boolean
}

const moneyBR = (cents: number) =>
  cents > 0
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Sob consulta'

function asFeatures(v: Plan['features']): string[] {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(typeof v === 'string' ? v : '[]')
  } catch {
    return []
  }
}

export function CadastroPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const planSlug = params.get('plano') || 'pro'
  const canceled = params.get('canceled') === '1'

  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedSlug, setSelectedSlug] = useState(planSlug)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [brandName, setBrandName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Criar conta · LeadCapture'
    fetch('/api/public/plans')
      .then(async r => {
        if (!r.ok) {
          // Fallback: try without auth via the storefront catalog (no public plans route yet)
          // We'll just show the seeded fixed plans inline if endpoint doesn't exist.
          throw new Error('plans_endpoint_missing')
        }
        return r.json()
      })
      .then(d => {
        if (Array.isArray(d?.plans)) setPlans(d.plans)
      })
      .catch(() => {
        // Fallback to a static list (matches seed)
        setPlans(FALLBACK_PLANS)
      })
  }, [])

  const selectedPlan = plans.find(p => p.slug === selectedSlug)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    if (!name.trim()) return setError('Informe seu nome.')
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError('Informe um e-mail válido.')
    }
    if (password.length < 8) return setError('Senha deve ter ao menos 8 caracteres.')
    if (!selectedSlug) return setError('Selecione um plano.')

    setSubmitting(true)
    setError(null)

    try {
      const r = await fetch('/api/public/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          brand_name: brandName.trim() || name.trim(),
          plan_slug: selectedSlug,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        throw new Error(d?.message || d?.error || 'Erro ao iniciar checkout.')
      }
      // Redirect to Stripe Checkout
      window.location.href = d.checkout_url
    } catch (err: any) {
      setError(err?.message || 'Falha ao iniciar checkout. Tente novamente.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Top bar */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link to="/inicio" className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="text-[15px] font-bold tracking-tight">LeadCapture</span>
        </Link>
        <Link
          to="/login"
          className="text-[13px] font-medium text-gray-600 hover:text-gray-900 transition"
        >
          Já tem conta? Entrar
        </Link>
      </header>

      <main className="flex-1 grid lg:grid-cols-[1fr_440px] gap-12 lg:gap-20 max-w-6xl mx-auto w-full px-6 py-8 lg:py-16">
        {/* LEFT — form */}
        <section className="max-w-md">
          <h1 className="text-[32px] sm:text-[36px] font-bold tracking-[-0.025em] leading-tight">
            Crie sua conta
          </h1>
          <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">
            Cadastre-se para começar a capturar leads no WhatsApp em minutos.
          </p>

          {canceled && (
            <div className="mt-6 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
              Você cancelou o pagamento. Quando estiver pronto, é só preencher abaixo de novo.
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Field
              label="Seu nome"
              icon={<User size={15} strokeWidth={1.75} />}
              value={name}
              onChange={setName}
              placeholder="Nome completo"
              autoComplete="name"
            />
            <Field
              label="E-mail"
              icon={<Mail size={15} strokeWidth={1.75} />}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="seu@email.com"
              autoComplete="email"
            />
            <Field
              label="Senha"
              icon={<Lock size={15} strokeWidth={1.75} />}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <Field
              label="Nome do seu negócio (marca)"
              icon={<Building2 size={15} strokeWidth={1.75} />}
              value={brandName}
              onChange={setBrandName}
              placeholder="Ex: Distribuidora Master"
              autoComplete="organization"
            />

            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-700 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white font-semibold text-[14px] tracking-tight hover:bg-gray-800 disabled:opacity-40 active:scale-[0.99] transition"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Abrindo checkout...
                </>
              ) : (
                <>
                  <CreditCard size={16} strokeWidth={2} />
                  Continuar para pagamento
                  <ArrowRight size={15} strokeWidth={2.25} />
                </>
              )}
            </button>

            <div className="flex items-start gap-2 pt-1 text-[11px] text-gray-500">
              <ShieldCheck size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <p>
                Pagamento seguro processado pelo Stripe. Cancele quando quiser.
              </p>
            </div>
          </form>
        </section>

        {/* RIGHT — plan summary + selector */}
        <aside className="self-start lg:sticky lg:top-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 mb-3">
            Seu plano
          </p>
          <div className="space-y-2">
            {plans.length === 0 && (
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-5 text-[13px] text-gray-500">
                Carregando planos…
              </div>
            )}
            {plans.map(p => {
              const sel = selectedSlug === p.slug
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedSlug(p.slug)}
                  aria-pressed={sel}
                  className={`w-full text-left rounded-2xl p-5 transition ${
                    sel
                      ? 'bg-gray-900 text-white ring-2 ring-gray-900'
                      : 'bg-white border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-[16px] font-bold tracking-tight ${sel ? 'text-white' : 'text-gray-900'}`}>
                        {p.name}
                      </h3>
                      {p.is_featured && (
                        <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold ${
                          sel ? 'bg-emerald-400/30 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          <Star size={9} strokeWidth={2.5} /> Destaque
                        </span>
                      )}
                    </div>
                    {sel && <CheckCircle2 size={16} strokeWidth={2} className="text-white shrink-0" />}
                  </div>
                  <p className={`text-[12px] mb-3 ${sel ? 'text-white/60' : 'text-gray-500'}`}>{p.tagline}</p>
                  <p className={`text-[22px] font-bold tracking-tight tabular-nums ${sel ? 'text-white' : 'text-gray-900'}`}>
                    {moneyBR(p.price_cents)}
                    <span className={`text-[12px] font-medium ml-1 ${sel ? 'text-white/50' : 'text-gray-500'}`}>
                      {p.billing_type === 'subscription' ? '/mês' : ' único'}
                    </span>
                  </p>
                </button>
              )
            })}
          </div>

          {selectedPlan && (
            <div className="mt-5 p-5 rounded-2xl border border-gray-200">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 mb-2.5">
                Inclui
              </p>
              <ul className="space-y-1.5">
                {asFeatures(selectedPlan.features).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-gray-700">
                    <CheckCircle2 size={13} strokeWidth={2.5} className="text-emerald-600 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function Field({
  label,
  icon,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
}: {
  label: string
  icon?: React.ReactNode
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-gray-700 mb-1.5">{label}</span>
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full h-11 ${
            icon ? 'pl-10' : 'pl-3.5'
          } pr-3.5 rounded-xl border border-border bg-white text-[14px] font-medium text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition`}
        />
      </div>
    </label>
  )
}

/* Fallback plans if /api/public/plans isn't available — matches default seed */
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    slug: 'starter',
    name: 'Starter',
    tagline: 'Para começar',
    price_cents: 9700,
    interval: 'monthly',
    billing_type: 'subscription',
    features: ['1 número WhatsApp', 'Captação no mapa', 'CRM básico', '500 disparos/mês'],
    is_featured: false,
    is_active: true,
  },
  {
    id: 'pro',
    slug: 'pro',
    name: 'Pro',
    tagline: 'Para escalar',
    price_cents: 29700,
    interval: 'monthly',
    billing_type: 'subscription',
    features: [
      '3 números WhatsApp',
      'Automação completa',
      'Disparos ilimitados',
      'IA adaptativa',
      'Vendas & catálogo',
    ],
    is_featured: true,
    is_active: true,
  },
]

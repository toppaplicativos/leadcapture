import { useEffect, useState } from 'react'
import {
  Loader2,
  Star,
  Save,
  Link2,
  Copy,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

interface Plan {
  id: string
  slug: string
  name: string
  tagline: string | null
  price_cents: number
  interval: string
  billing_type: 'subscription' | 'one_time' | string
  features: string[] | string
  limits: any
  is_active: boolean
  is_featured: boolean
  sort_order: number
  stripe_product_id: string | null
  stripe_price_id: string | null
  payment_link: string | null
  payment_link_id: string | null
}

const moneyBR = (cents: number) =>
  cents > 0
    ? (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'Sob consulta'

function asFeatures(v: Plan['features']): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return []
    }
  }
  return []
}

export function MasterPlanos() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Plan>>({})
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await masterApi.listPlans()
      setPlans(r.plans as Plan[])
    } catch (err: any) {
      setError(err?.message || 'Erro')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(p: Plan) {
    setEditing(p.id)
    setDraft({
      name: p.name,
      tagline: p.tagline || '',
      price_cents: p.price_cents,
      interval: p.interval,
      billing_type: p.billing_type || 'subscription',
      features: asFeatures(p.features),
      is_active: p.is_active,
      is_featured: p.is_featured,
    })
  }

  async function save(id: string) {
    setSaving(true)
    setError(null)
    try {
      await masterApi.updatePlan(id, draft)
      setEditing(null)
      setDraft({})
      setFlash('Plano salvo. Para gerar o link de pagamento, clique em "Gerar link Stripe".')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Erro')
    } finally {
      setSaving(false)
      setTimeout(() => setFlash(null), 4500)
    }
  }

  async function syncStripe(id: string) {
    setSyncing(id)
    setError(null)
    try {
      await masterApi.syncPlanStripe(id)
      setFlash('Link de pagamento gerado com sucesso.')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Falha ao sincronizar com Stripe')
    } finally {
      setSyncing(null)
      setTimeout(() => setFlash(null), 4500)
    }
  }

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Planos" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Planos"
        subtitle="Os planos exibidos na landing são puxados desta tabela. Edite preço e features → clique em 'Gerar link' e o sistema cria o produto no Stripe automaticamente."
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}
      {flash && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-300">
          {flash}
        </div>
      )}

      <div className="space-y-3">
        {plans.map(p => {
          const isEditing = editing === p.id
          const billingType = (p.billing_type as string) || 'subscription'
          const isSyncing = syncing === p.id

          return (
            <MasterCard key={p.id} className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-[18px] font-bold tracking-tight">{p.name}</h3>
                  {p.is_featured && (
                    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 text-[10px] font-bold text-emerald-400">
                      <Star size={9} strokeWidth={2.5} />
                      Destaque
                    </span>
                  )}
                  {!p.is_active && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-red-400">
                      Inativo
                    </span>
                  )}
                  <span className="inline-flex items-center h-6 px-2 rounded-full bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-semibold text-white/70">
                    {billingType === 'subscription' ? 'Assinatura' : 'Pagamento único'}
                  </span>
                  <span className="text-[12px] font-mono text-white/40">{p.slug}</span>
                </div>
                <div className="text-right">
                  <p className="text-[22px] font-bold tracking-tight tabular-nums">
                    {moneyBR(p.price_cents)}
                  </p>
                  <p className="text-[11px] text-white/40">
                    {billingType === 'subscription'
                      ? `por ${p.interval === 'monthly' || p.interval === 'month' ? 'mês' : p.interval}`
                      : 'pagamento único'}
                  </p>
                </div>
              </div>

              {/* Body */}
              {isEditing ? (
                <div className="space-y-3">
                  <Field label="Nome">
                    <input
                      type="text"
                      value={draft.name || ''}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30"
                    />
                  </Field>
                  <Field label="Tagline">
                    <input
                      type="text"
                      value={draft.tagline || ''}
                      onChange={e => setDraft(d => ({ ...d, tagline: e.target.value }))}
                      className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30"
                    />
                  </Field>

                  {/* Billing type toggle */}
                  <Field label="Tipo de cobrança">
                    <div className="inline-flex bg-white/[0.04] p-0.5 rounded-xl ring-1 ring-white/10">
                      {[
                        { value: 'subscription', label: 'Assinatura recorrente' },
                        { value: 'one_time', label: 'Pagamento único' },
                      ].map(opt => {
                        const sel = (draft.billing_type || 'subscription') === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDraft(d => ({ ...d, billing_type: opt.value }))}
                            className={`px-3.5 h-9 rounded-lg text-[12px] font-semibold transition ${
                              sel ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Preço (em centavos)">
                      <input
                        type="number"
                        value={draft.price_cents ?? 0}
                        onChange={e =>
                          setDraft(d => ({ ...d, price_cents: parseInt(e.target.value, 10) || 0 }))
                        }
                        className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-mono text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30"
                      />
                      <p className="text-[10px] text-white/40 mt-1 tabular-nums">
                        = {moneyBR(draft.price_cents || 0)}
                      </p>
                    </Field>
                    {(draft.billing_type || 'subscription') === 'subscription' && (
                      <Field label="Intervalo">
                        <select
                          value={draft.interval || 'monthly'}
                          onChange={e => setDraft(d => ({ ...d, interval: e.target.value }))}
                          className="w-full h-10 px-3.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30"
                        >
                          <option value="monthly">Mensal</option>
                          <option value="yearly">Anual</option>
                          <option value="weekly">Semanal</option>
                        </select>
                      </Field>
                    )}
                  </div>

                  <Field label="Features (uma por linha)">
                    <textarea
                      rows={6}
                      value={(draft.features as string[] | undefined)?.join('\n') || ''}
                      onChange={e =>
                        setDraft(d => ({
                          ...d,
                          features: e.target.value
                            .split('\n')
                            .map(s => s.trim())
                            .filter(Boolean),
                        }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white focus:outline-none focus:ring-4 focus:ring-white/5 focus:border-white/30 resize-none font-mono"
                    />
                  </Field>

                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_active}
                        onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="text-[12px] text-white/70">Ativo</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_featured}
                        onChange={e => setDraft(d => ({ ...d, is_featured: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="text-[12px] text-white/70">Destacado na landing</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => save(p.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-200 disabled:opacity-30 active:scale-[0.98] transition"
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} strokeWidth={2} />
                      )}
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null)
                        setDraft({})
                      }}
                      className="h-10 px-4 rounded-xl bg-white/[0.06] text-white text-[13px] font-semibold ring-1 ring-white/10 hover:bg-white/10 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {p.tagline && (
                    <p className="text-[13px] text-white/60 mb-3">{p.tagline}</p>
                  )}
                  <ul className="space-y-1.5 mb-5">
                    {asFeatures(p.features).map((f, i) => (
                      <li key={i} className="text-[13px] text-white/70 flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">·</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* Stripe section — link or call-to-generate */}
                  <StripeSection plan={p} isSyncing={isSyncing} onSync={() => syncStripe(p.id)} />

                  <div className="flex items-center gap-2 mt-5">
                    <button
                      onClick={() => startEdit(p)}
                      className="h-9 px-4 rounded-xl bg-white/[0.06] text-white text-[12px] font-semibold ring-1 ring-white/10 hover:bg-white/10 active:scale-[0.98] transition"
                    >
                      Editar plano
                    </button>
                  </div>
                </>
              )}
            </MasterCard>
          )
        })}
      </div>
    </>
  )
}

/* ──────────────────────────── Stripe section ──────────────────────────── */

function StripeSection({
  plan,
  isSyncing,
  onSync,
}: {
  plan: Plan
  isSyncing: boolean
  onSync: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!plan.payment_link) return
    try {
      await navigator.clipboard.writeText(plan.payment_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* fallback could go here */
    }
  }

  if (plan.price_cents <= 0) {
    return (
      <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] text-[12px] text-white/50">
        Defina um preço maior que zero para gerar link de pagamento.
      </div>
    )
  }

  if (!plan.payment_link) {
    return (
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] flex-wrap">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white">Sem link de pagamento</p>
          <p className="text-[11px] text-white/50 mt-0.5">
            Clique em "Gerar link Stripe" para criar produto + preço + checkout automaticamente.
          </p>
        </div>
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-gray-900 text-[12px] font-semibold hover:bg-gray-200 disabled:opacity-40 active:scale-[0.98] transition shrink-0"
        >
          {isSyncing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Link2 size={13} strokeWidth={2} />
          )}
          {isSyncing ? 'Gerando…' : 'Gerar link Stripe'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/[0.08] ring-1 ring-emerald-500/20">
        <CheckCircle2 size={14} strokeWidth={2.25} className="text-emerald-400 shrink-0" />
        <span className="text-[12px] font-semibold text-emerald-300">Link de pagamento ativo</span>
      </div>

      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08]">
        <code className="flex-1 text-[11px] font-mono text-white/80 truncate px-2.5">
          {plan.payment_link}
        </code>
        <button
          onClick={copyLink}
          aria-label="Copiar"
          title="Copiar"
          className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          {copied ? (
            <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-400" />
          ) : (
            <Copy size={13} strokeWidth={1.75} />
          )}
        </button>
        <a
          href={plan.payment_link}
          target="_blank"
          rel="noreferrer"
          aria-label="Abrir"
          title="Abrir link"
          className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          <ExternalLink size={13} strokeWidth={1.75} />
        </a>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-white/40 pt-1">
        <span className="font-mono">
          product: {plan.stripe_product_id || '—'}
        </span>
        <span className="text-white/20">·</span>
        <span className="font-mono">price: {plan.stripe_price_id || '—'}</span>
      </div>

      <button
        onClick={onSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-white/[0.04] text-white/70 text-[11px] font-medium ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98] transition mt-1"
      >
        {isSyncing ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <RefreshCw size={11} strokeWidth={2} />
        )}
        Sincronizar (regenerar se preço mudou)
      </button>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-white/60 mb-1.5 tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * Banner do Clube de Assinantes no catálogo público.
 * Só renderiza quando a organização habilitou o clube.
 * CTA principal leva à página /clube; modal rápido permanece como atalho.
 */
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Crown, Loader2, Sparkles, X } from 'lucide-react'
import {
  getAffiliateId,
  getAffiliateRef,
} from '@/lib/affiliate-tracking'
import { getStoreSlug, storeUrl } from '@/lib/store-context'
import { cn } from '@/lib/cn'

export type PublicClub = {
  enabled: boolean
  name: string
  tagline: string
  description: string
  banner: {
    title: string
    subtitle: string
    cta_label: string
    highlight: string
  }
  benefits: Array<{ id: string; title: string; description?: string }>
  discount: {
    enabled: boolean
    type: 'percentage' | 'fixed'
    value: number
    max_cap: number | null
    min_subtotal: number | null
  }
  shipping: {
    free_shipping: boolean
    free_shipping_above: number | null
    note: string
  }
  frequency: {
    billing: string
    membership_fee: number | null
    label: string
  }
  guarantees: Array<{ id: string; title: string; description?: string }>
  special_conditions: Array<{ id: string; title: string; description?: string }>
  form_fields: {
    require_email: boolean
    require_cpf: boolean
    require_address: boolean
  }
}

const MEMBER_KEY = (slug: string) => `lc_club_member:${slug}`

export type LocalClubMember = {
  id: string
  name: string
  member_type?: string
  restaurant_name?: string
}

export function getLocalClubMember(slug?: string): LocalClubMember | null {
  try {
    const s = slug || getStoreSlug()
    const raw = localStorage.getItem(MEMBER_KEY(s))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.id) return null
    return {
      id: String(parsed.id),
      name: String(parsed.name || ''),
      member_type: parsed.member_type ? String(parsed.member_type) : undefined,
      restaurant_name: parsed.restaurant_name
        ? String(parsed.restaurant_name)
        : undefined,
    }
  } catch {
    /* ignore */
  }
  return null
}

function persistLocalMember(slug: string, member: LocalClubMember) {
  try {
    localStorage.setItem(MEMBER_KEY(slug), JSON.stringify(member))
  } catch {
    /* ignore */
  }
}

function formatDiscount(club: PublicClub): string | null {
  if (!club.discount?.enabled || !club.discount.value) return null
  if (club.discount.type === 'fixed') {
    return `R$ ${Number(club.discount.value).toFixed(0)} off`
  }
  return `${club.discount.value}% off`
}

type Props = {
  onJoined?: (member: { id: string; name: string }) => void
  className?: string
}

export function StoreClubBanner({ onJoined, className }: Props) {
  const navigate = useNavigate()
  const slug = getStoreSlug()
  const formId = useId()
  const [club, setClub] = useState<PublicClub | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isMember, setIsMember] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    let cancelled = false
    const local = getLocalClubMember(slug)
    if (local) setIsMember(true)

    fetch(`/api/storefront/public/stores/${encodeURIComponent(slug)}/club`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.club?.enabled) setClub(d.club as PublicClub)
        else setClub(null)
      })
      .catch(() => {
        if (!cancelled) setClub(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!slug || !club) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        cpf: cpf.trim() || undefined,
        address: address.trim() || undefined,
        affiliate_id: getAffiliateId() || undefined,
        affiliate_ref: getAffiliateRef() || undefined,
        source: 'catalog_banner',
        /* Banner rápido = fluxo cliente; restaurante vai pela página /clube */
        member_type: 'cliente',
        tipo: 'cliente',
      }
      const r = await fetch(
        `/api/storefront/public/stores/${encodeURIComponent(slug)}/club/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      const member = {
        id: String(d.member?.id || ''),
        name: String(d.member?.name || name.trim()),
      }
      if (member.id) persistLocalMember(slug, member)
      setIsMember(true)
      setSuccess(d.message || 'Bem-vindo ao clube!')
      onJoined?.(member)
      setTimeout(() => setOpen(false), 1400)
    } catch (err: any) {
      setError(err.message || 'Não foi possível concluir o cadastro')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !club?.enabled) return null

  const discountLabel = formatDiscount(club)
  const topBenefits = (club.benefits || []).filter((b) => b.title).slice(0, 4)

  if (isMember) {
    return (
      <div className={cn('max-w-[var(--store-max)] mx-auto px-4 mb-3', className)}>
        <div
          className="rounded-2xl border px-4 py-3 flex items-center gap-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-secondary, #111827) 22%, transparent)',
            background:
              'color-mix(in srgb, var(--brand-secondary, #111827) 6%, white)',
          }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'var(--brand-secondary, #111827)' }}
          >
            <Crown size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-900 tracking-tight">
              Você é membro do {club.name}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {discountLabel
                ? `Seus benefícios estão ativos · ${discountLabel} nas compras`
                : 'Seus benefícios estão ativos em todas as compras'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('max-w-[var(--store-max)] mx-auto px-4 mb-3', className)}>
        <div
          className="relative overflow-hidden rounded-2xl text-white shadow-[0_8px_28px_rgba(15,23,42,0.14)]"
          style={{
            background:
              'linear-gradient(135deg, var(--brand-secondary, #0f172a) 0%, color-mix(in srgb, var(--brand-secondary, #0f172a) 72%, #000) 55%, #0a0a0a 100%)',
          }}
        >
          {/* Decorative orbs — brand-tinted, not purple slop */}
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-25 blur-2xl"
            style={{ background: 'var(--brand-primary, #f8fafc)' }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full opacity-20"
            style={{ background: 'var(--brand-primary, #e2e8f0)' }}
            aria-hidden
          />

          <div className="relative px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(club.banner.highlight || discountLabel) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      <Sparkles size={11} strokeWidth={2.5} />
                      {club.banner.highlight || discountLabel}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                    {club.name}
                  </span>
                </div>
                <h2 className="text-[17px] sm:text-[19px] font-bold tracking-tight leading-snug text-balance">
                  {club.banner.title}
                </h2>
                <p className="text-[12px] sm:text-[13px] text-white/80 mt-1.5 leading-relaxed max-w-lg">
                  {club.banner.subtitle}
                </p>
                {topBenefits.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {topBenefits.map((b) => (
                      <li
                        key={b.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-medium text-white/95"
                      >
                        <Check size={11} strokeWidth={2.5} className="opacity-80" />
                        {b.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="shrink-0 sm:self-center flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(storeUrl('clube'))}
                  className={cn(
                    'inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2',
                    'rounded-xl bg-white px-5 text-[13px] font-bold text-gray-900',
                    'shadow-sm transition-[transform,box-shadow] duration-150',
                    'hover:shadow-md active:scale-[0.98]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
                  )}
                >
                  <Crown size={15} strokeWidth={2.25} />
                  {club.banner.cta_label || 'Quero fazer parte'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(true)
                    setError('')
                    setSuccess('')
                  }}
                  className="text-[11px] font-semibold text-white/80 hover:text-white underline-offset-2 hover:underline text-center sm:text-right"
                >
                  Cadastro rápido
                </button>
                {club.frequency?.label && (
                  <p className="text-[10px] text-white/55 text-center sm:text-right">
                    {club.frequency.label}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Join dialog */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-title`}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => !submitting && setOpen(false)}
          />
          <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-500">{club.name}</p>
                <h3
                  id={`${formId}-title`}
                  className="text-[16px] font-bold text-gray-900 tracking-tight mt-0.5"
                >
                  Cadastro no clube
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setOpen(false)}
                className="h-9 w-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3.5">
              {(club.description || club.tagline) && (
                <p className="text-[12px] text-gray-600 leading-relaxed">
                  {club.description || club.tagline}
                </p>
              )}

              {(club.guarantees?.length > 0 || club.special_conditions?.length > 0) && (
                <div className="rounded-xl bg-gray-50 border border-border px-3 py-2.5 space-y-1.5">
                  {[...(club.guarantees || []), ...(club.special_conditions || [])]
                    .filter((x) => x.title)
                    .slice(0, 4)
                    .map((x) => (
                      <div key={x.id} className="flex items-start gap-2 text-[11px] text-gray-700">
                        <Check size={12} className="mt-0.5 text-emerald-600 shrink-0" strokeWidth={2.5} />
                        <span>
                          <strong className="font-semibold">{x.title}</strong>
                          {x.description ? ` — ${x.description}` : ''}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              <div>
                <label htmlFor={`${formId}-name`} className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                  Nome completo
                </label>
                <input
                  id={`${formId}-name`}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-phone`} className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                  WhatsApp
                </label>
                <input
                  id={`${formId}-phone`}
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                />
              </div>

              {club.form_fields.require_email && (
                <div>
                  <label htmlFor={`${formId}-email`} className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    E-mail
                  </label>
                  <input
                    id={`${formId}-email`}
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
                    placeholder="voce@email.com"
                    autoComplete="email"
                  />
                </div>
              )}

              {club.form_fields.require_cpf && (
                <div>
                  <label htmlFor={`${formId}-cpf`} className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    CPF
                  </label>
                  <input
                    id={`${formId}-cpf`}
                    required
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
              )}

              {club.form_fields.require_address && (
                <div>
                  <label htmlFor={`${formId}-address`} className="block text-[12px] font-semibold text-gray-700 mb-1.5">
                    Endereço
                  </label>
                  <input
                    id={`${formId}-address`}
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
                    placeholder="Rua, número, bairro, cidade"
                    autoComplete="street-address"
                  />
                </div>
              )}

              {error && (
                <p className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Check size={14} strokeWidth={2.5} />
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'w-full h-11 rounded-xl bg-gray-900 text-white text-[13px] font-bold',
                  'inline-flex items-center justify-center gap-2',
                  'hover:bg-gray-800 active:scale-[0.98] transition-[background,transform] duration-150',
                  'disabled:opacity-50 disabled:active:scale-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Cadastrando…
                  </>
                ) : (
                  <>
                    <Crown size={15} />
                    Confirmar inscrição
                  </>
                )}
              </button>
              <p className="text-[10px] text-gray-500 text-center leading-relaxed pb-1">
                Ao entrar, você concorda em receber comunicações da loja sobre benefícios do clube.
                {getAffiliateRef() ? ' Sua indicação de parceiro será vinculada ao cadastro.' : ''}
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Página pública do Clube de Assinantes no catálogo.
 * Rota: /catalogo/:slug/clube · /loja/:slug/clube · /clube (domínio custom)
 *
 * Perfis de entrada (alinhados a client_types do catálogo):
 *  - comerciante · distribuidor · casa · supermercado
 */
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgePercent,
  Building2,
  Check,
  ChefHat,
  ChevronRight,
  Crown,
  Gift,
  Home,
  Loader2,
  MapPin,
  Package,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  User,
  Warehouse,
} from 'lucide-react'
import {
  getAffiliateId,
  getAffiliateRef,
} from '@/lib/affiliate-tracking'
import { getStoreSlug, storeUrl } from '@/lib/store-context'
import { useToast } from '@/components/Toast'
import {
  getLocalClubMember,
  type PublicClub,
} from '@/components/store/StoreClubBanner'
import {
  CLUB_MEMBER_TYPES,
  PRODUCT_INTEREST_OPTIONS,
  WEEKLY_KG_OPTIONS,
  clubMemberNeedsBusiness,
  getClubMemberTypeDef,
  normalizeClubMemberType,
  type ClubMemberTypeCode,
} from '@/lib/club-member-types'
import { cn } from '@/lib/cn'

const MEMBER_KEY = (slug: string) => `lc_club_member:${slug}`

type LocalMember = {
  id: string
  name: string
  member_type?: string
  business_name?: string
  client_type_label?: string
}

function persistLocalMember(slug: string, member: LocalMember) {
  try {
    localStorage.setItem(MEMBER_KEY(slug), JSON.stringify(member))
  } catch {
    /* ignore */
  }
}

function readLocalMember(slug: string): LocalMember | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.id) return null
    return {
      id: String(parsed.id),
      name: String(parsed.name || ''),
      member_type: parsed.member_type ? String(parsed.member_type) : undefined,
      business_name:
        parsed.business_name || parsed.restaurant_name
          ? String(parsed.business_name || parsed.restaurant_name)
          : undefined,
      client_type_label: parsed.client_type_label
        ? String(parsed.client_type_label)
        : undefined,
    }
  } catch {
    return null
  }
}

function formatDiscount(club: PublicClub): string | null {
  if (!club.discount?.enabled || !club.discount.value) return null
  if (club.discount.type === 'fixed') {
    return `R$ ${Number(club.discount.value).toFixed(0)} de desconto`
  }
  return `${club.discount.value}% de desconto`
}

function parseUrlTipo(raw: string | null): ClubMemberTypeCode | null {
  if (!raw || !String(raw).trim()) return null
  return normalizeClubMemberType(raw)
}

function TypeIcon({ code, size = 20 }: { code: ClubMemberTypeCode; size?: number }) {
  if (code === 'comerciante') return <ChefHat size={size} strokeWidth={2.25} />
  if (code === 'distribuidor') return <Warehouse size={size} strokeWidth={2.25} />
  if (code === 'supermercado') return <Store size={size} strokeWidth={2.25} />
  return <Home size={size} strokeWidth={2.25} />
}

const fieldClass =
  'ds-control w-full h-11 rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900'
const labelClass = 'block text-[12px] font-semibold text-gray-700 mb-1.5'

export function ClubPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const formId = useId()
  const slug = getStoreSlug()

  const urlTipo = parseUrlTipo(searchParams.get('tipo') || searchParams.get('type'))
  const origem =
    String(searchParams.get('origem') || searchParams.get('origin') || '').trim() ||
    'catalog'

  const [club, setClub] = useState<PublicClub | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [isMember, setIsMember] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberTypeStored, setMemberTypeStored] = useState<string | undefined>()
  const [businessNameStored, setBusinessNameStored] = useState<string | undefined>()

  const [memberType, setMemberType] = useState<ClubMemberTypeCode | null>(urlTipo)
  const [step, setStep] = useState(1)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')
  const [address, setAddress] = useState('')

  const [bizName, setBizName] = useState('')
  const [bizType, setBizType] = useState('')
  const [bizCep, setBizCep] = useState('')
  const [bizCity, setBizCity] = useState('')
  const [bizUnits, setBizUnits] = useState('1')
  const [bizWeekly, setBizWeekly] = useState('')
  const [bizProduct, setBizProduct] = useState('')
  const [bizNotes, setBizNotes] = useState('')

  useEffect(() => {
    if (urlTipo) setMemberType(urlTipo)
  }, [urlTipo])

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      setError('Loja não encontrada')
      return
    }
    const local = readLocalMember(slug) || getLocalClubMember(slug)
    if (local) {
      setIsMember(true)
      setMemberName(local.name)
      const mt =
        'member_type' in local ? (local as LocalMember).member_type : undefined
      setMemberTypeStored(mt)
      setBusinessNameStored(
        'business_name' in local
          ? (local as LocalMember).business_name
          : (local as LocalMember & { restaurant_name?: string }).restaurant_name,
      )
      if (mt) setMemberType(normalizeClubMemberType(mt))
    }

    let cancelled = false
    fetch(`/api/storefront/public/stores/${encodeURIComponent(slug)}/club`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.club?.enabled) {
          setClub(d.club as PublicClub)
          const primary =
            getComputedStyle(document.documentElement)
              .getPropertyValue('--brand-secondary')
              .trim() || '#111827'
          document.documentElement.style.setProperty('--brand-secondary', primary)
        } else {
          setClub(null)
          setError('O clube de assinantes não está disponível no momento.')
        }
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar o clube.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  const typeDef = memberType ? getClubMemberTypeDef(memberType) : null
  const needsBusiness = memberType ? clubMemberNeedsBusiness(memberType) : false
  const storedDef = memberTypeStored
    ? getClubMemberTypeDef(memberTypeStored)
    : null
  const memberIsB2B = Boolean(
    storedDef?.needsBusiness || (isMember && typeDef?.needsBusiness),
  )

  function selectType(t: ClubMemberTypeCode) {
    setMemberType(t)
    setStep(1)
    setFormError('')
    setBizType('')
    const next = new URLSearchParams(searchParams)
    next.set('tipo', t)
    if (origem && origem !== 'catalog') next.set('origem', origem)
    setSearchParams(next, { replace: true })
  }

  function goBackType() {
    setMemberType(null)
    setStep(1)
    setFormError('')
    const next = new URLSearchParams(searchParams)
    next.delete('tipo')
    next.delete('type')
    setSearchParams(next, { replace: true })
  }

  function validatePerson(): string | null {
    if (!name.trim()) return 'Informe seu nome'
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) return 'Informe um WhatsApp válido'
    if (club?.form_fields.require_email && !email.trim()) return 'E-mail é obrigatório'
    if (club?.form_fields.require_cpf && cpf.replace(/\D/g, '').length < 11) {
      return 'CPF é obrigatório'
    }
    if (club?.form_fields.require_address && !address.trim()) {
      return 'Endereço é obrigatório'
    }
    return null
  }

  function validateBusiness(): string | null {
    if (!typeDef) return 'Selecione o tipo de conta'
    if (!bizName.trim()) {
      return `${typeDef.businessNameLabel || 'Nome'} é obrigatório`
    }
    return null
  }

  function advanceFromPerson(e: FormEvent) {
    e.preventDefault()
    const err = validatePerson()
    if (err) {
      setFormError(err)
      return
    }
    setFormError('')
    if (needsBusiness) {
      setStep(2)
      return
    }
    void submitJoin()
  }

  async function submitJoin(e?: FormEvent) {
    e?.preventDefault()
    if (!slug || !club || !memberType || !typeDef) return

    if (needsBusiness) {
      const err = validateBusiness()
      if (err) {
        setFormError(err)
        return
      }
    }
    const personErr = validatePerson()
    if (personErr) {
      setFormError(personErr)
      setStep(1)
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      const businessPayload = needsBusiness
        ? {
            name: bizName.trim(),
            type: bizType || undefined,
            cep: bizCep.replace(/\D/g, '') || undefined,
            city: bizCity.trim() || undefined,
            units: Math.max(1, parseInt(bizUnits, 10) || 1),
            weekly_kg: bizWeekly || undefined,
            product_interest: bizProduct || undefined,
            notes: bizNotes.trim() || undefined,
          }
        : undefined

      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        cpf: cpf.trim() || undefined,
        address: address.trim() || undefined,
        affiliate_id: getAffiliateId() || undefined,
        affiliate_ref: getAffiliateRef() || undefined,
        source:
          origem === 'site-restaurantes' || origem === 'site-supermercados'
            ? origem.replace(/-/g, '_')
            : 'catalog_page',
        member_type: memberType,
        tipo: memberType,
        metadata: {
          entry: {
            origin: origem,
            path:
              origem === 'site-restaurantes'
                ? '/para-empresas/restaurantes/'
                : origem === 'site-supermercados'
                  ? '/para-empresas/supermercados/'
                  : '/clube',
          },
          client_type_label: typeDef.label,
        },
      }

      if (businessPayload) {
        body.business = businessPayload
        /* Compat foodservice / legado */
        if (memberType === 'comerciante' || memberType === 'supermercado') {
          body.restaurant = businessPayload
        }
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

      const joinedType = normalizeClubMemberType(
        d.member?.member_type || memberType,
      )
      const bName =
        bizName.trim() ||
        (d.member?.metadata as { business?: { name?: string }; restaurant?: { name?: string } })
          ?.business?.name ||
        (d.member?.metadata as { restaurant?: { name?: string } })?.restaurant?.name ||
        ''

      const member: LocalMember = {
        id: String(d.member?.id || ''),
        name: String(d.member?.name || name.trim()),
        member_type: joinedType,
        business_name: bName || undefined,
        client_type_label:
          d.member?.client_type_label || getClubMemberTypeDef(joinedType).label,
      }
      if (member.id) persistLocalMember(slug, member)
      setIsMember(true)
      setMemberName(member.name)
      setMemberTypeStored(joinedType)
      setBusinessNameStored(bName || undefined)
      showToast(d.message || 'Bem-vindo ao clube!')
    } catch (err: any) {
      setFormError(err.message || 'Não foi possível concluir o cadastro')
    } finally {
      setSubmitting(false)
    }
  }

  const discountLabel = club ? formatDiscount(club) : null
  const benefits = (club?.benefits || []).filter((b) => b.title)
  const guarantees = (club?.guarantees || []).filter((b) => b.title)
  const conditions = (club?.special_conditions || []).filter((b) => b.title)

  const headerSubtitle = useMemo(() => {
    if (isMember) {
      return memberIsB2B
        ? storedDef?.label || 'Seu hub no clube'
        : 'Seus benefícios'
    }
    if (!memberType) return 'Como você se identifica?'
    if (needsBusiness && step === 2) return typeDef?.businessNameLabel || 'Seu negócio'
    return typeDef ? `Cadastro · ${typeDef.label}` : 'Faça parte'
  }, [
    isMember,
    memberIsB2B,
    storedDef,
    memberType,
    needsBusiness,
    step,
    typeDef,
  ])

  const totalSteps = needsBusiness ? 2 : 1
  const heroAccent = typeDef?.accent || storedDef?.accent || undefined

  return (
    <div className="store-page min-h-screen bg-[var(--store-bg,#f5f5f5)] pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="max-w-[var(--store-max,720px)] mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!isMember && memberType && step === 2) {
                setStep(1)
                return
              }
              if (!isMember && memberType && !urlTipo) {
                goBackType()
                return
              }
              navigate(storeUrl())
            }}
            className="h-10 w-10 rounded-xl flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-gray-500 truncate">
              {club?.name || 'Clube de Assinantes'}
            </p>
            <p className="text-[13px] font-bold text-gray-900 truncate tracking-tight">
              {headerSubtitle}
            </p>
          </div>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shrink-0"
            style={{ background: heroAccent || 'var(--brand-secondary, #111827)' }}
          >
            {memberType || storedDef ? (
              <TypeIcon
                code={(memberType || normalizeClubMemberType(memberTypeStored)) as ClubMemberTypeCode}
                size={16}
              />
            ) : (
              <Crown size={16} strokeWidth={2.25} />
            )}
          </span>
        </div>
      </header>

      <main className="max-w-[var(--store-max,720px)] mx-auto px-4 py-5 space-y-5">
        {loading && (
          <div className="space-y-3" role="status" aria-label="Carregando">
            <div className="h-40 rounded-2xl skeleton" />
            <div className="h-24 rounded-2xl skeleton" />
            <div className="h-48 rounded-2xl skeleton" />
          </div>
        )}

        {!loading && error && !club && (
          <div className="rounded-2xl border border-border bg-white px-5 py-8 text-center">
            <p className="text-sm text-gray-600">{error}</p>
            <button
              type="button"
              onClick={() => navigate(storeUrl())}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-[13px] font-bold text-white"
            >
              Voltar à loja
            </button>
          </div>
        )}

        {!loading && club && (
          <>
            <section
              className="relative overflow-hidden rounded-2xl text-white shadow-[0_8px_28px_rgba(15,23,42,0.12)]"
              style={{
                background: heroAccent
                  ? `linear-gradient(145deg, ${heroAccent} 0%, color-mix(in srgb, ${heroAccent} 75%, #000) 100%)`
                  : 'linear-gradient(135deg, var(--brand-secondary, #0f172a) 0%, color-mix(in srgb, var(--brand-secondary, #0f172a) 70%, #000) 100%)',
              }}
            >
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-30 blur-2xl bg-white"
                aria-hidden
              />
              <div className="relative px-5 py-6 sm:px-6 sm:py-7">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide mb-3">
                  <Sparkles size={11} strokeWidth={2.5} />
                  {typeDef?.short ||
                    storedDef?.short ||
                    club.banner.highlight ||
                    discountLabel ||
                    'Clube'}
                </span>
                <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-snug text-balance">
                  {isMember && businessNameStored
                    ? businessNameStored
                    : isMember
                      ? storedDef
                        ? `Hub · ${storedDef.label}`
                        : 'Você é membro'
                      : typeDef
                        ? `${club.name} · ${typeDef.label}`
                        : club.banner.title || club.name}
                </h1>
                <p className="text-[13px] sm:text-[14px] text-white/80 mt-2 leading-relaxed max-w-lg">
                  {isMember
                    ? memberIsB2B
                      ? 'Pedidos, preferências e condições do seu perfil — no mesmo lugar.'
                      : club.banner.subtitle || club.tagline
                    : typeDef
                      ? typeDef.description
                      : club.banner.subtitle ||
                        'Escolha como você compra: comerciante, distribuidor, casa ou supermercado.'}
                </p>
              </div>
            </section>

            {isMember && memberIsB2B && (
              <BusinessHub
                memberName={memberName}
                businessName={businessNameStored}
                profileLabel={storedDef?.label || typeDef?.label || 'Negócio'}
                clubName={club.name}
                discountLabel={discountLabel}
                shippingNote={
                  club.shipping.note ||
                  (club.shipping.free_shipping ? 'Frete especial para membros' : '')
                }
                onCatalog={() => navigate(storeUrl())}
                onProduct1kg={() =>
                  navigate(storeUrl('produto/alho-descascado-tipo-a-1kg'))
                }
              />
            )}

            {isMember && !memberIsB2B && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <Check size={18} strokeWidth={2.5} />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-bold text-emerald-900 tracking-tight">
                      {memberName ? `${memberName}, você já é membro` : 'Você já é membro'}
                    </h2>
                    <p className="text-[12px] text-emerald-800 mt-1 leading-relaxed">
                      Perfil <strong>Casa / Consumo</strong>. Use o mesmo WhatsApp no
                      checkout para liberar benefícios do {club.name}.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(storeUrl())}
                      className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-[13px] font-bold text-white hover:bg-emerald-800"
                    >
                      Continuar comprando
                    </button>
                  </div>
                </div>
              </section>
            )}

            {!isMember && !memberType && (
              <section className="space-y-3" aria-labelledby={`${formId}-tipo-title`}>
                <div>
                  <h2
                    id={`${formId}-tipo-title`}
                    className="text-[15px] font-bold text-gray-900 tracking-tight"
                  >
                    Como você se identifica?
                  </h2>
                  <p className="text-[12px] text-gray-500 mt-1">
                    Isso define seu cadastro, condições e experiência de pedidos no catálogo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CLUB_MEMBER_TYPES.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => selectType(t.code)}
                      className={cn(
                        'group text-left rounded-2xl border-2 border-border bg-white p-4',
                        'hover:shadow-sm transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                      )}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${t.accent}66`
                        e.currentTarget.style.background = t.accentSoft
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = ''
                        e.currentTarget.style.background = ''
                      }}
                    >
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-white mb-3"
                        style={{ background: t.accent }}
                      >
                        <TypeIcon code={t.code} />
                      </span>
                      <p className="text-[14px] font-bold text-gray-900">{t.label}</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color: t.accent }}>
                        {t.short}
                      </p>
                      <p className="text-[12px] text-gray-500 mt-1.5 leading-snug">
                        {t.description}
                      </p>
                      <span
                        className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold"
                        style={{ color: t.accent }}
                      >
                        Entrar como {t.label.split(' / ')[0].toLowerCase()}
                        <ChevronRight
                          size={14}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {!isMember && memberType && typeDef && benefits.length > 0 && (
              <section>
                <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-2 mb-3">
                  <Gift size={15} className="text-gray-700" />
                  Vantagens para {typeDef.label}
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {benefits.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-xl border border-border bg-white px-3.5 py-3 flex gap-2.5"
                    >
                      <Check
                        size={14}
                        className="text-emerald-600 shrink-0 mt-0.5"
                        strokeWidth={2.5}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900">{b.title}</p>
                        {b.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                            {b.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!isMember && memberType && typeDef && (
              <section className="rounded-2xl border border-border bg-white px-4 py-5 sm:px-5">
                {totalSteps > 1 && (
                  <div
                    className="flex gap-2 mb-4"
                    role="progressbar"
                    aria-valuenow={step}
                    aria-valuemin={1}
                    aria-valuemax={totalSteps}
                    aria-label={`Etapa ${step} de ${totalSteps}`}
                  >
                    {Array.from({ length: totalSteps }, (_, i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{
                          background: i + 1 <= step ? typeDef.accent : '#e5e7eb',
                        }}
                      />
                    ))}
                  </div>
                )}

                {step === 1 && (
                  <form onSubmit={advanceFromPerson} className="space-y-3.5">
                    <div className="flex items-start gap-2.5 mb-1">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                        <User size={16} />
                      </span>
                      <div>
                        <h2 className="text-[15px] font-bold text-gray-900 tracking-tight">
                          Seus dados
                        </h2>
                        <p className="text-[12px] text-gray-500 mt-0.5">
                          {needsBusiness
                            ? 'Primeiro o perfil da pessoa. Depois, os dados do negócio.'
                            : 'Preencha para ativar os benefícios na hora.'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`${formId}-name`} className={labelClass}>
                        Nome completo
                      </label>
                      <input
                        id={`${formId}-name`}
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldClass}
                        placeholder="Seu nome"
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${formId}-phone`} className={labelClass}>
                        WhatsApp
                      </label>
                      <input
                        id={`${formId}-phone`}
                        required
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={fieldClass}
                        placeholder="(00) 00000-0000"
                        autoComplete="tel"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${formId}-email`} className={labelClass}>
                        E-mail
                        {club.form_fields.require_email
                          ? ''
                          : ' (opcional — para boas-vindas)'}
                      </label>
                      <input
                        id={`${formId}-email`}
                        required={club.form_fields.require_email}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={fieldClass}
                        placeholder="voce@email.com"
                        autoComplete="email"
                      />
                    </div>
                    {club.form_fields.require_cpf && (
                      <div>
                        <label htmlFor={`${formId}-cpf`} className={labelClass}>
                          CPF
                        </label>
                        <input
                          id={`${formId}-cpf`}
                          required
                          value={cpf}
                          onChange={(e) => setCpf(e.target.value)}
                          className={fieldClass}
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                        />
                      </div>
                    )}
                    {club.form_fields.require_address && (
                      <div>
                        <label htmlFor={`${formId}-address`} className={labelClass}>
                          Endereço
                        </label>
                        <input
                          id={`${formId}-address`}
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className={fieldClass}
                          placeholder="Rua, número, bairro, cidade"
                          autoComplete="street-address"
                        />
                      </div>
                    )}

                    {formError && step === 1 && (
                      <p className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        {formError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className={cn(
                        'w-full h-12 rounded-xl text-[13px] font-bold text-white',
                        'inline-flex items-center justify-center gap-2',
                        'active:scale-[0.98] transition-[opacity,transform] duration-150',
                        'disabled:opacity-50 disabled:active:scale-100',
                      )}
                      style={{ background: typeDef.accent }}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Cadastrando…
                        </>
                      ) : needsBusiness ? (
                        <>
                          Continuar
                          <ChevronRight size={16} />
                        </>
                      ) : (
                        <>
                          <Crown size={15} />
                          {club.banner.cta_label || 'Confirmar inscrição'}
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                      Perfil:{' '}
                      <strong className="text-gray-700">{typeDef.label}</strong>
                      {!urlTipo && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={goBackType}
                            className="underline underline-offset-2 hover:text-gray-800"
                          >
                            alterar
                          </button>
                        </>
                      )}
                      {getAffiliateRef()
                        ? ' · Indicação de parceiro será vinculada.'
                        : ''}
                    </p>
                  </form>
                )}

                {step === 2 && needsBusiness && typeDef && (
                  <form onSubmit={submitJoin} className="space-y-3.5">
                    <div className="flex items-start gap-2.5 mb-1">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ background: typeDef.accent }}
                      >
                        <Building2 size={16} />
                      </span>
                      <div>
                        <h2 className="text-[15px] font-bold text-gray-900 tracking-tight">
                          {typeDef.label}
                        </h2>
                        <p className="text-[12px] text-gray-500 mt-0.5">
                          Dados do negócio para condições e atendimento alinhados.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`${formId}-biz-name`} className={labelClass}>
                        {typeDef.businessNameLabel}
                      </label>
                      <input
                        id={`${formId}-biz-name`}
                        required
                        value={bizName}
                        onChange={(e) => setBizName(e.target.value)}
                        className={fieldClass}
                        placeholder={
                          memberType === 'distribuidor'
                            ? 'Ex.: Distribuidora Minas Alimentos'
                            : memberType === 'supermercado'
                              ? 'Ex.: Super Rede Centro'
                              : 'Ex.: Pizzaria do Centro'
                        }
                        autoComplete="organization"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor={`${formId}-biz-type`} className={labelClass}>
                          {typeDef.segmentLabel}
                        </label>
                        <select
                          id={`${formId}-biz-type`}
                          value={bizType}
                          onChange={(e) => setBizType(e.target.value)}
                          className={fieldClass}
                        >
                          <option value="">Selecione…</option>
                          {typeDef.segments.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${formId}-biz-units`} className={labelClass}>
                          Unidades / lojas
                        </label>
                        <input
                          id={`${formId}-biz-units`}
                          type="number"
                          min={1}
                          max={999}
                          value={bizUnits}
                          onChange={(e) => setBizUnits(e.target.value)}
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor={`${formId}-biz-cep`} className={labelClass}>
                          CEP
                        </label>
                        <input
                          id={`${formId}-biz-cep`}
                          value={bizCep}
                          onChange={(e) => setBizCep(e.target.value)}
                          className={fieldClass}
                          placeholder="00000-000"
                          inputMode="numeric"
                          autoComplete="postal-code"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${formId}-biz-city`} className={labelClass}>
                          Cidade / UF
                        </label>
                        <input
                          id={`${formId}-biz-city`}
                          value={bizCity}
                          onChange={(e) => setBizCity(e.target.value)}
                          className={fieldClass}
                          placeholder="Belo Horizonte / MG"
                          autoComplete="address-level2"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`${formId}-biz-weekly`} className={labelClass}>
                        {memberType === 'distribuidor'
                          ? 'Volume semanal aproximado'
                          : 'Consumo semanal aproximado'}
                      </label>
                      <select
                        id={`${formId}-biz-weekly`}
                        value={bizWeekly}
                        onChange={(e) => setBizWeekly(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Selecione a faixa…</option>
                        {WEEKLY_KG_OPTIONS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`${formId}-biz-product`} className={labelClass}>
                        Produto de interesse
                      </label>
                      <select
                        id={`${formId}-biz-product`}
                        value={bizProduct}
                        onChange={(e) => setBizProduct(e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Selecione…</option>
                        {PRODUCT_INTEREST_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`${formId}-biz-notes`} className={labelClass}>
                        Observações{' '}
                        <span className="font-normal text-gray-400">(opcional)</span>
                      </label>
                      <textarea
                        id={`${formId}-biz-notes`}
                        value={bizNotes}
                        onChange={(e) => setBizNotes(e.target.value)}
                        rows={3}
                        className={cn(fieldClass, 'h-auto py-2.5 resize-y min-h-[5rem]')}
                        placeholder="Horário de recebimento, multi-unidades, região de atuação…"
                      />
                    </div>

                    {formError && (
                      <p className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        {formError}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('')
                          setStep(1)
                        }}
                        className="h-12 px-4 rounded-xl text-[13px] font-bold text-gray-700 border border-border bg-white hover:bg-gray-50"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className={cn(
                          'flex-1 h-12 rounded-xl text-[13px] font-bold text-white',
                          'inline-flex items-center justify-center gap-2',
                          'active:scale-[0.98] transition-[opacity,transform] duration-150',
                          'disabled:opacity-50 disabled:active:scale-100',
                        )}
                        style={{ background: typeDef.accent }}
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Cadastrando…
                          </>
                        ) : (
                          <>
                            <TypeIcon code={memberType} size={15} />
                            Concluir cadastro · {typeDef.label}
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                      Ao entrar, você concorda em receber comunicações da loja sobre o clube.
                      {getAffiliateRef()
                        ? ' Sua indicação de parceiro será vinculada ao cadastro.'
                        : ''}
                    </p>
                  </form>
                )}
              </section>
            )}

            {!isMember && memberType && guarantees.length > 0 && (
              <section className="rounded-2xl border border-border bg-white px-4 py-4">
                <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-2 mb-3">
                  <ShieldCheck size={15} />
                  Garantias
                </h2>
                <ul className="space-y-2">
                  {guarantees.map((g) => (
                    <li key={g.id} className="flex gap-2 text-[12px] text-gray-700">
                      <Check
                        size={13}
                        className="text-emerald-600 shrink-0 mt-0.5"
                        strokeWidth={2.5}
                      />
                      <span>
                        <strong className="font-semibold text-gray-900">{g.title}</strong>
                        {g.description ? ` — ${g.description}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!isMember && memberType && conditions.length > 0 && (
              <section className="rounded-2xl border border-border bg-white px-4 py-4">
                <h2 className="text-[13px] font-bold text-gray-900 mb-3">
                  Condições especiais
                </h2>
                <ul className="space-y-2">
                  {conditions.map((c) => (
                    <li key={c.id} className="flex gap-2 text-[12px] text-gray-700">
                      <Sparkles size={13} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-gray-900">{c.title}</strong>
                        {c.description ? ` — ${c.description}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {isMember && memberIsB2B && benefits.length > 0 && (
              <section>
                <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-2 mb-3">
                  <Gift size={15} className="text-gray-700" />
                  Seus benefícios do clube
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {benefits.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-xl border border-border bg-white px-3.5 py-3 flex gap-2.5"
                    >
                      <Check
                        size={14}
                        className="text-emerald-600 shrink-0 mt-0.5"
                        strokeWidth={2.5}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900">{b.title}</p>
                        {b.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                            {b.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function BusinessHub({
  memberName,
  businessName,
  profileLabel,
  clubName,
  discountLabel,
  shippingNote,
  onCatalog,
  onProduct1kg,
}: {
  memberName: string
  businessName?: string
  profileLabel: string
  clubName: string
  discountLabel: string | null
  shippingNote: string
  onCatalog: () => void
  onProduct1kg: () => void
}) {
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Check size={18} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-emerald-900 tracking-tight">
              {memberName ? `${memberName}, cadastro concluído` : 'Cadastro concluído'}
            </h2>
            <p className="text-[12px] text-emerald-800 mt-1 leading-relaxed">
              Perfil <strong>{profileLabel}</strong>
              {businessName ? (
                <>
                  {' '}
                  · <strong>{businessName}</strong>
                </>
              ) : null}{' '}
              no {clubName}. Use o mesmo WhatsApp no checkout.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
        <h2 className="text-[13px] font-bold text-gray-900 mb-3">Ações rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onProduct1kg}
            className="flex items-center gap-3 rounded-xl border border-border bg-[#faf5fc] px-3.5 py-3 text-left hover:border-[#5c1d78]/35 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3a104d] text-white">
              <Package size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-gray-900">
                Pedir pacote 1 kg
              </span>
              <span className="block text-[11px] text-gray-500">
                Alho descascado · maior giro
              </span>
            </span>
            <ChevronRight size={16} className="text-gray-400 shrink-0 ml-auto" />
          </button>
          <button
            type="button"
            onClick={onCatalog}
            className="flex items-center gap-3 rounded-xl border border-border bg-white px-3.5 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
              <ShoppingBag size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-gray-900">
                Ver catálogo completo
              </span>
              <span className="block text-[11px] text-gray-500">
                Todos os formatos e pastas
              </span>
            </span>
            <ChevronRight size={16} className="text-gray-400 shrink-0 ml-auto" />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {discountLabel && (
          <div className="rounded-xl border border-border bg-white px-3.5 py-3">
            <BadgePercent size={15} className="text-gray-700 mb-1.5" />
            <p className="text-[12px] font-bold text-gray-900">{discountLabel}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Ativo no checkout</p>
          </div>
        )}
        <div className="rounded-xl border border-border bg-white px-3.5 py-3">
          <Truck size={15} className="text-gray-700 mb-1.5" />
          <p className="text-[12px] font-bold text-gray-900">Entrega / frete</p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {shippingNote || 'Condições conforme região e volume'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3.5 py-3 sm:col-span-2">
          <MapPin size={15} className="text-gray-700 mb-1.5" />
          <p className="text-[12px] font-bold text-gray-900">Próximos passos</p>
          <ol className="mt-1.5 space-y-1 text-[11px] text-gray-600 leading-relaxed list-decimal list-inside">
            <li>Faça o primeiro pedido com o WhatsApp cadastrado</li>
            <li>Benefícios do clube aplicam no checkout</li>
            <li>Comercial pode alinhar volume e reposição pelo seu perfil</li>
          </ol>
        </div>
      </section>
    </div>
  )
}

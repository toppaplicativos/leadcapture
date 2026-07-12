import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle,
  LogOut,
  MapPin,
  Package,
  Save,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import {
  clearCustomer,
  getCustomer,
  isCustomerIdentified,
  setCustomer,
  type CustomerProfile,
} from '@/lib/store'
import { useToast } from '@/components/Toast'
import { LeadCaptureByline } from '@/components/store/LeadCaptureByline'
import { ClientTypePicker } from '@/components/store/ClientTypePicker'
import { fetchPublicClientTypes, type PublicClientType } from '@/lib/api'
import { normalizePhone } from '@/lib/store-context'

export interface ProfileTabProps {
  storeName?: string
  logoUrl?: string
  onGoToOrders?: () => void
  onGoToCatalog?: () => void
}

type AuthMode = 'login' | 'register'

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fieldClass(error?: boolean) {
  return [
    'store-account__input w-full h-12 px-4 rounded-xl text-sm text-gray-900',
    'bg-white border transition placeholder:text-gray-400',
    'focus:outline-none focus:ring-4 focus:ring-black/[0.06]',
    error
      ? 'border-red-300 focus:border-red-400'
      : 'border-border focus:border-gray-900',
  ].join(' ')
}

export function ProfileTab({
  storeName = 'Loja',
  logoUrl,
  onGoToOrders,
  onGoToCatalog,
}: ProfileTabProps) {
  const { showToast } = useToast()
  const [profile, setProfileState] = useState<CustomerProfile>(() => getCustomer())
  const [mode, setMode] = useState<AuthMode>('login')
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [clientTypes, setClientTypes] = useState<PublicClientType[]>([])
  const [clientType, setClientType] = useState(String(getCustomer().client_type || ''))

  const identified = isCustomerIdentified(profile)
  const displayName = String(profile.name || profile.responsible_name || '').trim()
  const monogram = useMemo(() => initialsFrom(displayName || storeName), [displayName, storeName])

  useEffect(() => {
    fetchPublicClientTypes()
      .then((d) => setClientTypes(d.types || []))
      .catch(() => setClientTypes([]))
  }, [])

  function refreshProfile(next: CustomerProfile) {
    setCustomer(next)
    setProfileState(next)
    if (next.client_type) setClientType(next.client_type)
  }

  function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const phone = normalizePhone(String(fd.get('phone') || ''))
    const nextErrors: Record<string, string> = {}

    if (!email && phone.length < 10) {
      nextErrors.email = 'Informe e-mail ou telefone com DDD'
      nextErrors.phone = 'Informe e-mail ou telefone com DDD'
    }
    if (email && !email.includes('@')) nextErrors.email = 'E-mail inválido'
    if (phone && phone.length > 0 && phone.length < 10) nextErrors.phone = 'Telefone incompleto'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const prev = getCustomer()
    const next: CustomerProfile = {
      ...prev,
      email: email || prev.email || '',
      phone: phone || prev.phone || '',
      name: prev.name || prev.responsible_name || (email ? email.split('@')[0] : 'Cliente'),
      responsible_name:
        prev.responsible_name || prev.name || (email ? email.split('@')[0] : 'Cliente'),
    }
    refreshProfile(next)
    showToast('Bem-vindo de volta!')
  }

  function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '').trim()
    const phone = normalizePhone(String(fd.get('phone') || ''))
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const address = String(fd.get('address') || '').trim()
    const establishment = String(fd.get('establishment') || '').trim()
    const nextErrors: Record<string, string> = {}

    if (!name) nextErrors.name = 'Informe seu nome'
    if (phone.length < 10) nextErrors.phone = 'Informe um WhatsApp válido com DDD'
    if (email && !email.includes('@')) nextErrors.email = 'E-mail inválido'
    if (clientTypes.length > 0 && !clientType.trim()) {
      nextErrors.client_type = 'Selecione como você se identifica'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const matched = clientTypes.find((t) => t.name === clientType)
    refreshProfile({
      name,
      responsible_name: name,
      phone,
      email,
      address,
      establishment,
      establishment_name: establishment,
      client_type: clientType.trim() || undefined,
      client_type_id: matched?.id,
    })
    setSaved(true)
    showToast('Conta criada! Seus dados ficam salvos neste aparelho.')
    setTimeout(() => setSaved(false), 2800)
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '').trim()
    const phone = normalizePhone(String(fd.get('phone') || ''))
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const address = String(fd.get('address') || '').trim()
    const establishment = String(fd.get('establishment') || '').trim()
    const nextErrors: Record<string, string> = {}

    if (!name) nextErrors.name = 'Informe seu nome'
    if (phone.length < 10 && !email.includes('@')) {
      nextErrors.phone = 'Informe telefone ou e-mail'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const matched = clientTypes.find((t) => t.name === clientType)
    refreshProfile({
      ...getCustomer(),
      name,
      responsible_name: name,
      phone,
      email,
      address,
      establishment,
      establishment_name: establishment,
      client_type: clientType.trim() || undefined,
      client_type_id: matched?.id,
    })
    setSaved(true)
    showToast('Cadastro atualizado')
    setTimeout(() => setSaved(false), 2800)
  }

  function handleLogout() {
    clearCustomer()
    setProfileState({})
    setMode('login')
    setErrors({})
    showToast('Você saiu da conta neste aparelho')
  }

  /* ─── Identified profile ─── */
  if (identified) {
    return (
      <div className="store-account page-enter">
        <div className="store-account__inner max-w-[var(--store-max)] mx-auto px-4 pt-3 pb-28">
          <header className="store-account__hero store-account__hero--compact">
            <div className="store-account__avatar" aria-hidden>
              {logoUrl ? (
                <img src={logoUrl} alt="" className="store-account__avatar-img" />
              ) : (
                <span>{monogram}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-gray-500">Sua conta</p>
              <h2 className="text-[1.35rem] font-bold text-gray-900 tracking-tight truncate text-wrap-balance">
                {displayName}
              </h2>
              {(profile.email || profile.phone) && (
                <p className="text-[13px] text-gray-600 mt-0.5 truncate">
                  {[profile.email, profile.phone].filter(Boolean).join(' · ')}
                </p>
              )}
              {profile.client_type && (
                <span className="inline-flex mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {profile.client_type}
                </span>
              )}
            </div>
          </header>

          <div className="store-account__quick mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onGoToOrders}
              className="store-account__quick-card"
            >
              <Package size={18} strokeWidth={1.75} className="text-[var(--brand-secondary,#171717)]" />
              <span>Meus pedidos</span>
            </button>
            <button
              type="button"
              onClick={onGoToCatalog}
              className="store-account__quick-card"
            >
              <ShoppingBag size={18} strokeWidth={1.75} className="text-[var(--brand-secondary,#171717)]" />
              <span>Continuar comprando</span>
            </button>
          </div>

          <section className="store-account__panel mt-5">
            <div className="flex items-center gap-2 mb-4">
              <UserRound size={16} className="text-gray-500" strokeWidth={1.75} />
              <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">
                Dados de entrega
              </h3>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3.5" noValidate>
              {(
                [
                  {
                    name: 'name',
                    label: 'Nome completo',
                    type: 'text',
                    value: profile.name || profile.responsible_name || '',
                    required: true,
                    placeholder: 'Como devemos te chamar',
                    autoComplete: 'name',
                  },
                  {
                    name: 'phone',
                    label: 'WhatsApp',
                    type: 'tel',
                    value: profile.phone || '',
                    required: true,
                    placeholder: '(00) 00000-0000',
                    autoComplete: 'tel',
                  },
                  {
                    name: 'email',
                    label: 'E-mail',
                    type: 'email',
                    value: profile.email || '',
                    required: false,
                    placeholder: 'seu@email.com',
                    autoComplete: 'email',
                  },
                  {
                    name: 'address',
                    label: 'Endereço de entrega',
                    type: 'text',
                    value: profile.address || '',
                    required: false,
                    placeholder: 'Rua, número, bairro',
                    autoComplete: 'street-address',
                  },
                  {
                    name: 'establishment',
                    label: 'Estabelecimento (opcional)',
                    type: 'text',
                    value: profile.establishment || profile.establishment_name || '',
                    required: false,
                    placeholder: 'Nome do negócio ou local',
                    autoComplete: 'organization',
                  },
                ] as const
              ).map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <label htmlFor={`profile-${f.name}`} className="block text-[12px] font-semibold text-gray-700">
                    {f.label}
                    {f.required ? <span className="text-red-500 ml-0.5">*</span> : null}
                  </label>
                  <input
                    id={`profile-${f.name}`}
                    name={f.name}
                    type={f.type}
                    defaultValue={f.value}
                    required={f.required}
                    placeholder={f.placeholder}
                    autoComplete={f.autoComplete}
                    className={fieldClass(Boolean(errors[f.name]))}
                  />
                  {errors[f.name] && (
                    <p className="text-[12px] text-red-600">{errors[f.name]}</p>
                  )}
                </div>
              ))}

              {clientTypes.length > 0 && (
                <ClientTypePicker
                  types={clientTypes}
                  value={clientType}
                  onChange={setClientType}
                  label="Tipo de cliente"
                  hint="Usado pela loja para personalizar seu atendimento."
                />
              )}

              <button type="submit" className="store-account__btn-primary w-full mt-1">
                {saved ? (
                  <>
                    <CheckCircle size={16} strokeWidth={2.25} />
                    Salvo
                  </>
                ) : (
                  <>
                    <Save size={16} strokeWidth={2.25} />
                    Salvar alterações
                  </>
                )}
              </button>
            </form>
          </section>

          <button type="button" onClick={handleLogout} className="store-account__logout mt-4 w-full">
            <LogOut size={15} strokeWidth={1.75} />
            Sair desta conta
          </button>

          <LeadCaptureByline className="mt-10" />
        </div>
      </div>
    )
  }

  /* ─── Guest: login / register ─── */
  return (
    <div className="store-account page-enter">
      <div className="store-account__inner max-w-[var(--store-max)] mx-auto px-4 pt-2 pb-28">
        <header className="store-account__hero">
          <div className="store-account__hero-glow" aria-hidden />
          <div className="relative z-[1] flex flex-col items-center text-center px-2 pt-6 pb-5">
            <div className="store-account__brand-mark">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-white">
                  {(storeName || 'L').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <p className="mt-3.5 text-[12px] font-medium text-gray-500 tracking-tight">
              {storeName}
            </p>
            <h2 className="mt-1 text-[1.5rem] font-bold text-gray-900 tracking-[-0.03em] text-wrap-balance leading-tight">
              {mode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}
            </h2>
            <p className="mt-2 text-[13px] text-gray-600 max-w-[18rem] leading-relaxed text-pretty">
              {mode === 'login'
                ? 'Entre com e-mail ou WhatsApp para ver pedidos e agilizar o checkout.'
                : 'Cadastre-se uma vez e facilite entregas e acompanhamento de pedidos.'}
            </p>
          </div>
        </header>

        <div className="store-account__segment" role="tablist" aria-label="Entrar ou criar conta">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`store-account__segment-btn ${mode === 'login' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('login')
              setErrors({})
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`store-account__segment-btn ${mode === 'register' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('register')
              setErrors({})
            }}
          >
            Criar conta
          </button>
        </div>

        <section className="store-account__panel mt-4">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3.5" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-[12px] font-semibold text-gray-700">
                  E-mail
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className={fieldClass(Boolean(errors.email))}
                />
                {errors.email && <p className="text-[12px] text-red-600">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="login-phone" className="block text-[12px] font-semibold text-gray-700">
                  WhatsApp
                </label>
                <input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  className={fieldClass(Boolean(errors.phone))}
                />
                {errors.phone && <p className="text-[12px] text-red-600">{errors.phone}</p>}
                <p className="text-[11px] text-gray-500">Use e-mail ou telefone — um dos dois basta.</p>
              </div>
              <button type="submit" className="store-account__btn-primary w-full">
                Continuar
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5" noValidate>
              {(
                [
                  {
                    id: 'reg-name',
                    name: 'name',
                    label: 'Nome completo',
                    type: 'text',
                    required: true,
                    placeholder: 'Seu nome',
                    autoComplete: 'name',
                  },
                  {
                    id: 'reg-phone',
                    name: 'phone',
                    label: 'WhatsApp',
                    type: 'tel',
                    required: true,
                    placeholder: '(00) 00000-0000',
                    autoComplete: 'tel',
                  },
                  {
                    id: 'reg-email',
                    name: 'email',
                    label: 'E-mail',
                    type: 'email',
                    required: false,
                    placeholder: 'seu@email.com',
                    autoComplete: 'email',
                  },
                  {
                    id: 'reg-address',
                    name: 'address',
                    label: 'Endereço de entrega',
                    type: 'text',
                    required: false,
                    placeholder: 'Rua, número, bairro',
                    autoComplete: 'street-address',
                  },
                  {
                    id: 'reg-establishment',
                    name: 'establishment',
                    label: 'Estabelecimento (opcional)',
                    type: 'text',
                    required: false,
                    placeholder: 'Nome do negócio ou local',
                    autoComplete: 'organization',
                  },
                ] as const
              ).map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <label htmlFor={f.id} className="block text-[12px] font-semibold text-gray-700">
                    {f.label}
                    {f.required ? <span className="text-red-500 ml-0.5">*</span> : null}
                  </label>
                  <input
                    id={f.id}
                    name={f.name}
                    type={f.type}
                    required={f.required}
                    placeholder={f.placeholder}
                    autoComplete={f.autoComplete}
                    className={fieldClass(Boolean(errors[f.name]))}
                  />
                  {errors[f.name] && (
                    <p className="text-[12px] text-red-600">{errors[f.name]}</p>
                  )}
                </div>
              ))}

              {clientTypes.length > 0 && (
                <div>
                  <ClientTypePicker
                    types={clientTypes}
                    value={clientType}
                    onChange={(v) => {
                      setClientType(v)
                      setErrors((prev) => {
                        const next = { ...prev }
                        delete next.client_type
                        return next
                      })
                    }}
                    required
                  />
                  {errors.client_type && (
                    <p className="text-[12px] text-red-600 mt-1.5">{errors.client_type}</p>
                  )}
                </div>
              )}

              <button type="submit" className="store-account__btn-primary w-full">
                {saved ? (
                  <>
                    <CheckCircle size={16} />
                    Conta pronta
                  </>
                ) : (
                  'Criar conta e continuar'
                )}
              </button>
            </form>
          )}
        </section>

        <ul className="store-account__benefits mt-5" aria-label="Vantagens de ter conta">
          <li>
            <span className="store-account__benefit-icon" aria-hidden>
              <Package size={15} strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-semibold text-gray-900">Acompanhe pedidos</p>
              <p className="text-gray-600">Status e histórico em um só lugar</p>
            </div>
          </li>
          <li>
            <span className="store-account__benefit-icon" aria-hidden>
              <MapPin size={15} strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-semibold text-gray-900">Checkout mais rápido</p>
              <p className="text-gray-600">Nome, telefone e endereço preenchidos</p>
            </div>
          </li>
          <li>
            <span className="store-account__benefit-icon" aria-hidden>
              <ShoppingBag size={15} strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-semibold text-gray-900">Só neste aparelho</p>
              <p className="text-gray-600">Seus dados ficam salvos localmente na loja</p>
            </div>
          </li>
        </ul>

        <p className="mt-6 text-center text-[12px] text-gray-500">
          {mode === 'login' ? (
            <>
              Ainda não tem conta?{' '}
              <button
                type="button"
                className="font-semibold text-[var(--brand-secondary,#171717)] underline-offset-2 hover:underline"
                onClick={() => setMode('register')}
              >
                Criar agora
              </button>
            </>
          ) : (
            <>
              Já tem cadastro?{' '}
              <button
                type="button"
                className="font-semibold text-[var(--brand-secondary,#171717)] underline-offset-2 hover:underline"
                onClick={() => setMode('login')}
              >
                Entrar
              </button>
            </>
          )}
        </p>

        <LeadCaptureByline className="mt-10" />
      </div>
    </div>
  )
}

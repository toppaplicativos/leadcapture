import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronRight,
  Clock3,
  LogIn,
  Package,
  PackageOpen,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import { fetchOrderHistory, fetchPublicClientTypes, type Order, type PublicClientType } from '@/lib/api'
import { getCustomer, isCustomerIdentified } from '@/lib/store'
import { money, labelStatus, storeUrl, normalizePhone } from '@/lib/store-context'
import { LeadCaptureByline } from '@/components/store/LeadCaptureByline'
import { resolveCustomerExperience } from '@/lib/customer-experience'

export interface OrdersTabProps {
  storeName?: string
  onGoToProfile?: () => void
  onGoToCatalog?: () => void
}

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'info' {
  const s = String(status || '').toLowerCase()
  if (s === 'entregue') return 'success'
  if (s === 'cancelado') return 'danger'
  if (s === 'novo' || s === 'confirmando_pagamento') return 'info'
  return 'warning'
}

function formatOrderDate(value?: string) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function OrderCardSkeleton() {
  return (
    <div className="store-orders__card store-orders__card--skeleton" aria-hidden>
      <div className="flex justify-between gap-3">
        <div className="skeleton h-4 w-28 rounded" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-3 w-20 rounded mt-3" />
      <div className="skeleton h-3 w-full rounded mt-4" />
      <div className="skeleton h-3 w-2/3 rounded mt-2" />
    </div>
  )
}

export function OrdersTab({
  storeName = 'Loja',
  onGoToProfile,
  onGoToCatalog,
}: OrdersTabProps) {
  const profile = getCustomer()
  const identified = isCustomerIdentified(profile)

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [clientTypes, setClientTypes] = useState<PublicClientType[]>([])

  const loadOrders = useCallback(async (opts: { email?: string; phone?: string; name?: string }) => {
    const email = String(opts.email || '').trim().toLowerCase()
    const phone = normalizePhone(opts.phone || '')
    const name = String(opts.name || '').trim()

    if (!email && !phone) {
      setError('Complete e-mail ou telefone no perfil para ver seus pedidos.')
      setInfo('')
      setSearched(true)
      return
    }

    setLoading(true)
    setError('')
    setInfo('')
    setSearched(true)

    try {
      const data = await fetchOrderHistory({
        email: email || undefined,
        customer_name: name || undefined,
        phone: phone || undefined,
      })
      const list = data.orders || []
      setOrders(list)
      if (list.length === 0) {
        setInfo('Nenhum pedido encontrado com os dados da sua conta.')
      }
    } catch (err) {
      setOrders([])
      setError(err instanceof Error ? err.message : 'Erro ao buscar pedidos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPublicClientTypes()
      .then((d) => setClientTypes(d.types || []))
      .catch(() => setClientTypes([]))
  }, [])

  /* Só carrega pedidos quando o cliente está logado */
  useEffect(() => {
    if (!identified) {
      setOrders([])
      setSearched(false)
      setError('')
      setInfo('')
      setLoading(false)
      return
    }

    void loadOrders({
      email: profile.email,
      phone: profile.phone,
      name: profile.name || profile.responsible_name,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identified, profile.email, profile.phone, profile.name, profile.responsible_name])

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!identified) return

    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const phone = normalizePhone(String(fd.get('phone') || ''))

    await loadOrders({
      email: email || profile.email,
      phone: phone || profile.phone,
      name: profile.name || profile.responsible_name,
    })
  }

  const hasResults = orders.length > 0
  const showEmptyAfterSearch = identified && searched && !loading && !hasResults && !error
  const missingContact =
    identified &&
    !String(profile.email || '').trim() &&
    normalizePhone(profile.phone || '').length < 10

  const greeting = useMemo(() => {
    const name = String(profile.name || profile.responsible_name || '').trim()
    if (!name) return null
    return name.split(/\s+/)[0]
  }, [profile.name, profile.responsible_name])

  const experience = useMemo(
    () =>
      resolveCustomerExperience(orders, {
        declaredType: profile.client_type,
        registeredTypes: clientTypes,
      }),
    [orders, profile.client_type, clientTypes],
  )

  /* ─── Deslogado: sem busca ─── */
  if (!identified) {
    return (
      <div className="store-orders page-enter">
        <div className="store-orders__inner max-w-[var(--store-max)] mx-auto px-4 pt-3 pb-28">
          <header className="store-orders__header">
            <div>
              <p className="text-[12px] font-medium text-gray-500">{storeName}</p>
              <h2 className="text-[1.35rem] font-bold text-gray-900 tracking-tight">
                Meus pedidos
              </h2>
            </div>
          </header>

          <section className="store-orders__empty mt-2">
            <div className="store-orders__empty-visual" aria-hidden>
              <div className="store-orders__empty-orb" />
              <LogIn size={28} strokeWidth={1.5} className="relative z-[1]" />
            </div>
            <h3 className="store-orders__empty-title">Entre para ver seus pedidos</h3>
            <p className="store-orders__empty-text">
              Seus pedidos ficam vinculados à sua conta nesta loja. Entre ou crie uma conta para
              acompanhar status e histórico com segurança.
            </p>
            <ul className="store-orders__empty-tips">
              <li>
                <Receipt size={14} strokeWidth={1.75} aria-hidden />
                Histórico só da sua conta
              </li>
              <li>
                <Clock3 size={14} strokeWidth={1.75} aria-hidden />
                Status e acompanhamento de entrega
              </li>
              <li>
                <Package size={14} strokeWidth={1.75} aria-hidden />
                Detalhes de cada item pedido
              </li>
            </ul>
            <div className="store-orders__empty-actions">
              <button type="button" onClick={onGoToProfile} className="store-account__btn-primary">
                <UserRound size={16} />
                Entrar ou criar conta
              </button>
              <button type="button" onClick={onGoToCatalog} className="store-account__btn-ghost">
                <ShoppingBag size={16} />
                Continuar comprando
              </button>
            </div>
          </section>

          <LeadCaptureByline className="mt-10" />
        </div>
      </div>
    )
  }

  /* ─── Logado ─── */
  return (
    <div className="store-orders page-enter">
      <div className="store-orders__inner max-w-[var(--store-max)] mx-auto px-4 pt-3 pb-28">
        <header className="store-orders__header">
          <div>
            <p className="text-[12px] font-medium text-gray-500">
              {greeting ? `Olá, ${greeting}` : storeName}
            </p>
            <h2 className="text-[1.35rem] font-bold text-gray-900 tracking-tight">
              Meus pedidos
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hasResults && (
              <span className="store-orders__count tabular-nums">
                {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                void loadOrders({
                  email: profile.email,
                  phone: profile.phone,
                  name: profile.name || profile.responsible_name,
                })
              }
              disabled={loading}
              className="store-orders__icon-btn"
              aria-label="Atualizar pedidos"
              title="Atualizar"
            >
              <RefreshCw size={15} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Posicionamento por tipo + experiência de compra */}
        <section className="store-orders__position" aria-label="Seu perfil na loja">
          <div className="store-orders__position-main">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              Seu perfil
            </p>
            <p className="text-[15px] font-bold text-gray-900 tracking-tight mt-0.5">
              {experience.displayType || experience.journeyLabel}
            </p>
            <p className="text-[12px] text-gray-600 mt-1 leading-snug">
              {experience.declaredType
                ? `Tipo informado: ${experience.declaredType}`
                : experience.suggestedType
                  ? `Sugerido pela sua jornada: ${experience.suggestedType}`
                  : 'Continue comprando para desbloquear seu histórico.'}
              {experience.declaredType && experience.journeyLabel
                ? ` · ${experience.journeyLabel}`
                : ''}
            </p>
          </div>
          <div className="store-orders__position-stats">
            <div>
              <p className="text-[10px] text-gray-500">Pedidos</p>
              <p className="text-[14px] font-bold text-gray-900 tabular-nums">
                {experience.orderCount}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Total</p>
              <p className="text-[14px] font-bold text-gray-900 tabular-nums">
                {money(experience.totalSpent)}
              </p>
            </div>
          </div>
          {experience.level === 'vip' && (
            <span className="store-orders__position-badge store-orders__position-badge--vip">
              VIP
            </span>
          )}
          {experience.level === 'loyal' && (
            <span className="store-orders__position-badge">Frequente</span>
          )}
          {experience.level === 'first' && (
            <span className="store-orders__position-badge">Novo</span>
          )}
        </section>

        {/* Busca só para logados (opcional / refinar) */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 hover:text-gray-900 transition"
          >
            <Search size={14} strokeWidth={1.75} />
            {showSearch ? 'Ocultar busca' : 'Buscar com outros dados'}
          </button>
        </div>

        {showSearch && (
          <section className={`store-orders__search ${hasResults ? 'store-orders__search--compact' : ''}`}>
            <div className="flex items-start gap-2.5 mb-3">
              <span className="store-orders__search-icon" aria-hidden>
                <Search size={15} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">Buscar pedidos</p>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">
                  Usa os dados da sua conta por padrão. Altere se o pedido foi feito com outro e-mail.
                </p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="space-y-2.5">
              <input
                type="email"
                name="email"
                defaultValue={profile.email || ''}
                placeholder="E-mail do pedido"
                autoComplete="email"
                className="store-account__input w-full h-12 px-4 rounded-xl text-sm bg-white border border-border focus:outline-none focus:ring-4 focus:ring-black/[0.06] focus:border-gray-900 transition"
              />
              <input
                type="tel"
                name="phone"
                defaultValue={profile.phone || ''}
                placeholder="WhatsApp (opcional)"
                autoComplete="tel"
                className="store-account__input w-full h-12 px-4 rounded-xl text-sm bg-white border border-border focus:outline-none focus:ring-4 focus:ring-black/[0.06] focus:border-gray-900 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="store-account__btn-primary w-full disabled:opacity-55"
              >
                <Search size={16} strokeWidth={2.25} />
                {loading ? 'Buscando…' : 'Buscar pedidos'}
              </button>
            </form>
          </section>
        )}

        {error && (
          <div className="store-orders__alert store-orders__alert--error mt-4" role="alert">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-5 space-y-3" aria-busy="true" aria-label="Carregando pedidos">
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </div>
        )}

        {missingContact && !loading && (
          <section className="store-orders__empty mt-5">
            <div className="store-orders__empty-visual" aria-hidden>
              <Receipt size={28} strokeWidth={1.5} className="relative z-[1]" />
            </div>
            <h3 className="store-orders__empty-title">Complete seus dados</h3>
            <p className="store-orders__empty-text">
              Para listar o histórico, adicione e-mail ou WhatsApp no seu perfil.
            </p>
            <div className="store-orders__empty-actions">
              <button type="button" onClick={onGoToProfile} className="store-account__btn-primary">
                Completar perfil
              </button>
            </div>
          </section>
        )}

        {showEmptyAfterSearch && !missingContact && (
          <section className="store-orders__empty mt-5">
            <div className="store-orders__empty-visual store-orders__empty-visual--muted" aria-hidden>
              <PackageOpen size={28} strokeWidth={1.5} className="relative z-[1]" />
            </div>
            <h3 className="store-orders__empty-title">Nenhum pedido por aqui</h3>
            <p className="store-orders__empty-text">
              {info ||
                'Não encontramos pedidos com os dados da sua conta. Faça um pedido ou confira o e-mail do checkout.'}
            </p>
            <div className="store-orders__empty-actions">
              <button type="button" onClick={onGoToCatalog} className="store-account__btn-primary">
                <ShoppingBag size={16} />
                Fazer um pedido
              </button>
              <button type="button" onClick={onGoToProfile} className="store-account__btn-ghost">
                Atualizar meus dados
              </button>
            </div>
          </section>
        )}

        {!loading && hasResults && (
          <div className="mt-5 space-y-3">
            {orders.map((order) => {
              const tone = statusTone(order.status)
              const dateLabel = formatOrderDate(order.created_at)
              const itemCount =
                order.items?.reduce((n, it) => n + (Number(it.quantity) || 0), 0) || 0
              const trackPhone = normalizePhone(order.customer_phone || profile.phone || '')

              return (
                <article key={order.order_number} className="store-orders__card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-500 tabular-nums">
                        {dateLabel || 'Pedido'}
                      </p>
                      <h3 className="text-[15px] font-bold text-gray-900 tracking-tight truncate">
                        #{order.order_number}
                      </h3>
                    </div>
                    <span className={`store-orders__badge store-orders__badge--${tone}`}>
                      {labelStatus(order.status)}
                    </span>
                  </div>

                  {order.items && order.items.length > 0 && (
                    <ul className="store-orders__items mt-3">
                      {order.items.slice(0, 3).map((it, i) => (
                        <li key={i}>
                          <span className="truncate font-medium text-gray-800">{it.name}</span>
                          <span className="tabular-nums text-gray-500 shrink-0">
                            {it.quantity}× {money(it.unit_price)}
                          </span>
                        </li>
                      ))}
                      {order.items.length > 3 && (
                        <li className="text-gray-500 text-[12px]">
                          +{order.items.length - 3} item(ns)
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="store-orders__card-footer mt-3.5">
                    <div>
                      <p className="text-[11px] text-gray-500">Total</p>
                      <p className="text-[15px] font-bold text-gray-900 tabular-nums">
                        {money(order.total)}
                      </p>
                      {itemCount > 0 && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                          {order.payment_method ? ` · ${order.payment_method}` : ''}
                        </p>
                      )}
                    </div>
                    <Link
                      to={`${storeUrl('pedido')}?order_number=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(trackPhone)}`}
                      className="store-orders__track"
                    >
                      Acompanhar
                      <ChevronRight size={15} strokeWidth={2.25} />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <LeadCaptureByline className="mt-10" />
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Store, FolderOpen, LogOut, Loader2, Search,
  TrendingUp, Wallet, MousePointerClick, Users, ChevronRight, Clock, CheckCircle2,
  Bell, User, Building2, Percent, Sparkles,
} from 'lucide-react'
import { clearPartnersAuth, clearPendingInvite, getPartnersToken, getPendingInvite, partnersApi } from '@/lib/api-partners'
import { setAffiliateAuth } from '@/lib/api-affiliate'
import { PartnersProgramDetail } from '@/pages/partners/PartnersProgramDetail'
import { PartnersProgramOnboarding } from '@/pages/partners/PartnersProgramOnboarding'
import { PartnersAlertsPanel } from '@/pages/partners/PartnersAlertsPanel'
import { PartnersProfilePanel } from '@/pages/partners/PartnersProfilePanel'
import {
  AffiliateFirstRunOnboarding,
  hasCompletedFirstRun,
  markFirstRunComplete,
} from '@/pages/affiliate/AffiliateFirstRunOnboarding'

const money = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type TabId = 'resumo' | 'mercado' | 'alertas' | 'programas' | 'perfil'

const GLOBAL_ACCENT = '#1c1c1e'
const GLOBAL_HEADER = 'linear-gradient(160deg, #1c1c1e, #3a3a3c)'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  not_applied: { label: 'Disponível', color: '#007aff' },
  pending: { label: 'Em análise', color: '#f59e0b' },
  pending_application: { label: 'Em análise', color: '#f59e0b' },
  onboarding: { label: 'Onboarding', color: '#0ea5e9' },
  pre_approved: { label: 'Pré-aprovado', color: '#0ea5e9' },
  approved: { label: 'Ativo', color: '#16a34a' },
  active: { label: 'Ativo', color: '#16a34a' },
  rejected: { label: 'Recusado', color: '#ef4444' },
}

const ENTERABLE_STATUSES = new Set(['approved', 'pre_approved', 'active'])

type PartnersView =
  | { kind: 'tab'; tab: TabId }
  | { kind: 'program'; programRef: string }
  | { kind: 'onboarding'; enrollmentId: string }

function parsePartnersView(pathname: string): PartnersView {
  const rest = pathname.replace(/^\/parceiros\/painel\/?/, '').replace(/\/$/, '')
  if (rest.startsWith('onboarding/')) {
    return { kind: 'onboarding', enrollmentId: decodeURIComponent(rest.slice('onboarding/'.length)) }
  }
  if (rest.startsWith('mercado/')) {
    return { kind: 'program', programRef: decodeURIComponent(rest.slice('mercado/'.length)) }
  }
  if (rest === 'mercado') return { kind: 'tab', tab: 'mercado' }
  if (rest === 'alertas') return { kind: 'tab', tab: 'alertas' }
  if (rest === 'programas') return { kind: 'tab', tab: 'programas' }
  if (rest === 'perfil') return { kind: 'tab', tab: 'perfil' }
  return { kind: 'tab', tab: 'resumo' }
}

function navTabFromView(view: PartnersView): TabId {
  if (view.kind === 'program') return 'mercado'
  if (view.kind === 'onboarding') return 'programas'
  return view.tab
}

function headerTitle(view: PartnersView): string {
  if (view.kind === 'program') return 'Detalhe do programa'
  if (view.kind === 'onboarding') return 'Onboarding'
  if (view.kind === 'tab') {
    const titles: Record<TabId, string> = {
      resumo: 'Página inicial',
      mercado: 'Mercado',
      alertas: 'Alertas',
      programas: 'Programas',
      perfil: 'Perfil',
    }
    return titles[view.tab]
  }
  return 'LeadCapture Parceiros'
}

export function PartnersAppPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteHandled = useRef(false)
  const view = parsePartnersView(location.pathname)
  const activeTab = navTabFromView(view)
  const base = '/parceiros/painel'

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [marketplace, setMarketplace] = useState<any[]>([])
  const [memberships, setMemberships] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [entering, setEntering] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [showFirstRun, setShowFirstRun] = useState(false)

  const showToast = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    if (location.pathname.includes('/oportunidades')) {
      navigate(
        location.pathname.replace('/oportunidades', '/mercado') + location.search,
        { replace: true },
      )
    }
  }, [location.pathname, location.search, navigate])

  const loadMarketplace = useCallback(async (q?: string) => {
    const market = await partnersApi.marketplace(q?.trim() || undefined)
    setMarketplace(market.opportunities || [])
  }, [])

  const refresh = useCallback(async () => {
    const [me, dash, members] = await Promise.all([
      partnersApi.me(),
      partnersApi.dashboard(),
      partnersApi.memberships(),
    ])
    setProfile(me.profile)
    setUser(me.user)
    setDashboard(dash)
    setMemberships(members.memberships || [])
    await loadMarketplace()
  }, [loadMarketplace])

  useEffect(() => {
    if (!getPartnersToken()) {
      navigate('/parceiros', { replace: true })
      return
    }
    setLoading(true)
    refresh()
      .catch((e: Error) => showToast(e.message, 'err'))
      .finally(() => setLoading(false))
  }, [navigate, refresh, showToast])

  useEffect(() => {
    const uid = String(user?.id || profile?.user_id || '').trim()
    if (!uid || loading) return
    setShowFirstRun(!hasCompletedFirstRun(uid, 'partners'))
  }, [user?.id, profile?.user_id, loading])

  function completeFirstRun() {
    const uid = String(user?.id || profile?.user_id || '').trim()
    if (uid) markFirstRunComplete(uid, 'partners')
    setShowFirstRun(false)
    if (location.pathname === base || location.pathname === `${base}/`) {
      navigate(`${base}/mercado`, { replace: true })
    }
  }

  useEffect(() => {
    if (inviteHandled.current || !getPartnersToken()) return
    const inviteCode = String(searchParams.get('invite') || getPendingInvite() || '').trim()
    if (!inviteCode) return
    inviteHandled.current = true

    void partnersApi.acceptInvite(inviteCode)
      .then(async (res) => {
        clearPendingInvite()
        if (searchParams.get('invite')) {
          const next = new URLSearchParams(searchParams)
          next.delete('invite')
          setSearchParams(next, { replace: true })
        }
        if (res.already_member) {
          showToast('Você já participa deste programa')
        } else {
          showToast(`Convite aceito! Bem-vindo ao programa ${res.program?.name || ''}`)
        }
        await refresh()
        if (res.enrollment?.id) {
          navigate(`${base}/onboarding/${encodeURIComponent(res.enrollment.id)}`, { replace: true })
        }
      })
      .catch((e: Error) => showToast(e.message, 'err'))
  }, [searchParams, setSearchParams, refresh, showToast, navigate])

  useEffect(() => {
    if (view.kind !== 'tab' || view.tab !== 'mercado') return
    const timer = window.setTimeout(() => {
      void loadMarketplace(search).catch((e: Error) => showToast(e.message, 'err'))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search, view, loadMarketplace, showToast])

  function goTab(tab: TabId) {
    const dest = tab === 'resumo' ? base : `${base}/${tab}`
    if (location.pathname !== dest) navigate(dest, { replace: true })
  }

  function logout() {
    clearPartnersAuth()
    navigate('/parceiros', { replace: true })
  }

  function openProgram(programRef: string) {
    navigate(`${base}/mercado/${encodeURIComponent(programRef)}`)
  }

  function openOnboarding(enrollmentId: string) {
    navigate(`${base}/onboarding/${encodeURIComponent(enrollmentId)}`)
  }

  async function enterProgram(brandId: string, brandSlug?: string | null) {
    setEntering(brandId)
    try {
      const res = await partnersApi.enterBrand(brandId)
      const slug = String(res.brand_slug || brandSlug || '').trim()
      if (!slug) throw new Error('Slug da organização não encontrado')
      setAffiliateAuth(res.token, res.brand_id, slug)
      navigate(`/parceiros/painel/programa/${encodeURIComponent(slug)}/painel`, { replace: true })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro ao abrir programa', 'err')
    } finally {
      setEntering(null)
    }
  }

  if (loading && !dashboard) {
    return (
      <div className="affiliate-app grid place-items-center">
        <Loader2 size={28} className="animate-spin text-[#c7c7cc]" />
      </div>
    )
  }

  const totals = dashboard?.totals || {}

  if (showFirstRun) {
    return (
      <AffiliateFirstRunOnboarding
        userName={profile?.display_name || user?.name}
        brandName="LeadCapture Parceiros"
        onComplete={completeFirstRun}
        onSkip={completeFirstRun}
      />
    )
  }

  return (
    <div className="affiliate-app" style={{ '--affiliate-accent': GLOBAL_ACCENT } as React.CSSProperties}>
      <header
        className="affiliate-app__header"
        style={{ background: GLOBAL_HEADER }}
      >
        <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">LeadCapture Parceiros</p>
            <p className="text-base font-extrabold truncate tracking-tight">{headerTitle(view)}</p>
            {profile?.display_name && view.kind === 'tab' && view.tab === 'resumo' && (
              <p className="text-[11px] text-white/75 truncate">{profile.display_name}</p>
            )}
          </div>
          {view.kind === 'tab' && view.tab !== 'perfil' && (
            <button
              type="button"
              onClick={logout}
              className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center hover:bg-white/25 active:scale-95 transition shrink-0"
              aria-label="Sair"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </header>

      <main className="affiliate-app__main">
        {view.kind === 'onboarding' && (
          <PartnersProgramOnboarding
            enrollmentId={view.enrollmentId}
            onClose={() => navigate(`${base}/programas`, { replace: true })}
            showToast={showToast}
          />
        )}

        {view.kind === 'program' && (
          <PartnersProgramDetail
            programRef={view.programRef}
            onBack={() => navigate(`${base}/mercado`, { replace: true })}
            onOnboarding={openOnboarding}
            showToast={showToast}
            onApplied={() => void refresh()}
          />
        )}

        {view.kind === 'tab' && view.tab === 'resumo' && (
          <div className="space-y-3 pb-2">
            <div
              className="affiliate-card p-4 text-white"
              style={{ background: GLOBAL_HEADER }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Faturamento geral</p>
              <p className="text-2xl font-extrabold tracking-tight mt-1">{money(totals.total_commission)}</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
                <div><span className="text-white/65">Pendente</span><p className="font-bold">{money(totals.pending_commission)}</p></div>
                <div><span className="text-white/65">Aprovado</span><p className="font-bold">{money(totals.approved_commission)}</p></div>
                <div><span className="text-white/65">Pago</span><p className="font-bold">{money(totals.paid_commission)}</p></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="affiliate-card p-3">
                <div className="flex items-center gap-2 text-[#8e8e93] mb-1"><MousePointerClick size={14} /><span className="text-[10px] font-bold uppercase">Cliques</span></div>
                <p className="text-lg font-extrabold text-[#1c1c1e]">{Number(totals.total_clicks || 0)}</p>
              </div>
              <div className="affiliate-card p-3">
                <div className="flex items-center gap-2 text-[#8e8e93] mb-1"><TrendingUp size={14} /><span className="text-[10px] font-bold uppercase">Conversões</span></div>
                <p className="text-lg font-extrabold text-[#1c1c1e]">{Number(totals.conversions || 0)}</p>
              </div>
              <div className="affiliate-card p-3">
                <div className="flex items-center gap-2 text-[#8e8e93] mb-1"><Users size={14} /><span className="text-[10px] font-bold uppercase">Leads</span></div>
                <p className="text-lg font-extrabold text-[#1c1c1e]">{Number(totals.leads || 0)}</p>
              </div>
              <div className="affiliate-card p-3">
                <div className="flex items-center gap-2 text-[#8e8e93] mb-1"><Wallet size={14} /><span className="text-[10px] font-bold uppercase">Programas</span></div>
                <p className="text-lg font-extrabold text-[#1c1c1e]">{Number(dashboard?.programs?.active || 0)}</p>
              </div>
            </div>

            {(dashboard?.by_program || []).length > 0 && (
              <div className="affiliate-card p-4">
                <p className="text-xs font-extrabold text-[#1c1c1e] mb-3">Por programa</p>
                <div className="space-y-2">
                  {dashboard.by_program.map((row: any) => (
                    <div key={`${row.organization_id}-${row.program_id}`} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{row.program_name || row.organization_name}</p>
                        <p className="text-[10px] text-[#8e8e93] truncate">{row.organization_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-[#1c1c1e]">{money(row.total_commission)}</p>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-[#007aff]"
                          disabled={entering === row.organization_id}
                          onClick={() => enterProgram(row.organization_id, row.organization_slug)}
                        >
                          {entering === row.organization_id ? 'Abrindo…' : 'Abrir programa'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!(dashboard?.by_program || []).length && (
              <div className="affiliate-card p-6 text-center">
                <p className="text-sm font-semibold text-[#1c1c1e]">Nenhum programa ativo ainda</p>
                <p className="text-xs text-[#8e8e93] mt-1">Explore o mercado e candidate-se a programas de afiliados.</p>
                <button type="button" className="mt-3 text-xs font-bold text-[#007aff]" onClick={() => goTab('mercado')}>
                  Ir ao mercado <ChevronRight size={12} className="inline" />
                </button>
              </div>
            )}
          </div>
        )}

        {view.kind === 'tab' && view.tab === 'mercado' && (
          <div className="affiliate-market pb-2">
            <header className="affiliate-market__intro">
              <div className="affiliate-market__intro-icon" style={{ backgroundColor: 'rgba(28,28,30,0.08)', color: GLOBAL_ACCENT }}>
                <Store size={20} strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <h2 className="affiliate-market__intro-title">Mercado de programas</h2>
                <p className="affiliate-market__intro-sub">
                  Compare comissão, base de prospects e condições. Abra o detalhe para se candidatar.
                </p>
              </div>
            </header>

            <div className="affiliate-market__search affiliate-card">
              <Search size={16} className="text-[#8e8e93] shrink-0" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void loadMarketplace(search) }}
                placeholder="Buscar programas, organizações…"
                className="affiliate-market__search-input"
                aria-label="Buscar no mercado"
              />
            </div>

            {marketplace.length > 0 && (
              <p className="text-[11px] font-semibold text-[#8e8e93] px-0.5">
                {marketplace.length} programa{marketplace.length === 1 ? '' : 's'}
                {search.trim() ? ' encontrado(s)' : ' disponíveis'}
              </p>
            )}

            {marketplace.length === 0 ? (
              <div className="affiliate-market__empty affiliate-card">
                <div className="affiliate-market__empty-icon">
                  <Sparkles size={26} className="opacity-40" />
                </div>
                <p className="affiliate-market__empty-title">Nenhum programa no mercado</p>
                <p className="affiliate-market__empty-sub">
                  {search.trim()
                    ? 'Tente outro termo de busca ou limpe o filtro.'
                    : 'Novos programas aparecem aqui quando as organizações publicarem.'}
                </p>
                {search.trim() && (
                  <button type="button" className="affiliate-market__empty-reset" onClick={() => setSearch('')}>
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              <div className="affiliate-market__list">
                {marketplace.map((op) => {
                  const st = STATUS_LABEL[op.participation_status] || STATUS_LABEL.not_applied
                  const brandColor = String(op.organization?.primary_color || GLOBAL_ACCENT)
                  const brandSecondary = String(op.organization?.secondary_color || brandColor)
                  const prospects = Number(
                    op.prospects_captured
                    ?? op.leads_captured
                    ?? op.organization?.prospects_captured
                    ?? 0,
                  )
                  const offersN = Array.isArray(op.offers) ? op.offers.length : 0
                  return (
                    <article
                      key={op.id}
                      className="affiliate-market__card affiliate-market__card--rich affiliate-card cursor-pointer"
                      onClick={() => openProgram(op.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openProgram(op.id) }}
                      role="button"
                      tabIndex={0}
                    >
                      <div
                        className="affiliate-market__card-cover"
                        style={{
                          background: `linear-gradient(135deg, ${brandColor}, ${brandSecondary})`,
                        }}
                      >
                        <div className="affiliate-market__card-cover-main">
                          <div className="affiliate-market__card-avatar affiliate-market__card-avatar--lg">
                            {op.organization?.logo_url ? (
                              <img src={op.organization.logo_url} alt="" />
                            ) : (
                              <Building2 size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="affiliate-market__card-name affiliate-market__card-name--on-cover">{op.name}</p>
                            <p className="affiliate-market__card-offer affiliate-market__card-offer--on-cover">
                              {op.organization?.name || 'Organização'}
                            </p>
                          </div>
                        </div>
                        <span className="affiliate-market__badge affiliate-market__badge--on-cover">
                          {st.label}
                        </span>
                      </div>

                      <div className="affiliate-market__card-body">
                        {op.description && (
                          <p className="affiliate-market__card-desc">{op.description}</p>
                        )}
                        <div className="affiliate-market__card-stats affiliate-market__card-stats--3">
                          <div className="affiliate-market__stat affiliate-market__stat--compact">
                            <p className="affiliate-market__stat-label">Comissão</p>
                            <p className="affiliate-market__stat-value">{op.commission_label || '—'}</p>
                          </div>
                          <div className="affiliate-market__stat affiliate-market__stat--compact">
                            <p className="affiliate-market__stat-label">Prospects</p>
                            <p className="affiliate-market__stat-value tabular-nums">
                              {prospects.toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <div className="affiliate-market__stat affiliate-market__stat--compact">
                            <p className="affiliate-market__stat-label">Ofertas</p>
                            <p className="affiliate-market__stat-value tabular-nums">{offersN}</p>
                          </div>
                        </div>
                        <div className="affiliate-market__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="affiliate-market__btn affiliate-market__btn--block"
                            style={{ backgroundColor: brandColor }}
                            onClick={() => openProgram(op.id)}
                          >
                            Ver programa <ChevronRight size={14} />
                          </button>
                          {op.can_continue && op.enrollment?.id && (
                            <button
                              type="button"
                              className="affiliate-market__btn affiliate-market__btn--outline affiliate-market__btn--block"
                              style={{ color: brandColor, borderColor: `${brandColor}40` }}
                              onClick={() => openOnboarding(op.enrollment.id)}
                            >
                              Continuar onboarding
                            </button>
                          )}
                          {op.participation_status === 'pending' && (
                            <span className="affiliate-market__status-note affiliate-market__status-note--warn">
                              <Clock size={12} /> Aguardando aprovação
                            </span>
                          )}
                          {op.participation_status === 'active' && (
                            <span className="affiliate-market__status-note affiliate-market__status-note--ok">
                              <CheckCircle2 size={12} /> Ativo
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {view.kind === 'tab' && view.tab === 'alertas' && (
          <PartnersAlertsPanel showToast={showToast} />
        )}

        {view.kind === 'tab' && view.tab === 'programas' && (
          <div className="space-y-2 pb-2">
            {memberships.length === 0 ? (
              <div className="affiliate-card p-6 text-center">
                <p className="text-sm font-semibold text-[#1c1c1e]">Você ainda não participa de nenhum programa</p>
                <button type="button" className="mt-3 text-xs font-bold text-[#007aff]" onClick={() => goTab('mercado')}>
                  Explorar mercado
                </button>
              </div>
            ) : (
              memberships.map((m) => {
                const st = STATUS_LABEL[m.status] || { label: m.status, color: '#8e8e93' }
                const canEnter = ENTERABLE_STATUSES.has(String(m.status || '').toLowerCase()) && m.organization_id && m.organization_slug
                return (
                  <article
                    key={m.id}
                    className={`affiliate-card p-4${canEnter ? ' cursor-pointer active:opacity-90' : ''}`}
                    onClick={() => {
                      if (canEnter) void enterProgram(m.organization_id, m.organization_slug)
                    }}
                    onKeyDown={(e) => {
                      if (canEnter && e.key === 'Enter') void enterProgram(m.organization_id, m.organization_slug)
                    }}
                    role={canEnter ? 'button' : undefined}
                    tabIndex={canEnter ? 0 : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {m.organization_logo_url ? (
                          <img src={m.organization_logo_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gray-100 grid place-items-center text-sm font-bold text-gray-500 shrink-0">
                            {(m.program_name || m.organization_name || 'P')[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm truncate">{m.program_name}</p>
                          <p className="text-[10px] text-[#8e8e93] truncate">{m.organization_name}</p>
                          <p className="text-[10px] text-[#c7c7cc] mt-0.5">
                            {m.source === 'direct_invite' ? 'Convite direto' : 'Mercado'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ color: st.color, backgroundColor: `${st.color}14` }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3" onClick={(e) => e.stopPropagation()}>
                      {(m.status === 'pre_approved' || m.status === 'onboarding') && m.enrollment_id && (
                        <button
                          type="button"
                          className="text-xs font-bold text-sky-600 flex items-center gap-1"
                          onClick={() => openOnboarding(m.enrollment_id)}
                        >
                          Continuar onboarding <ChevronRight size={12} />
                        </button>
                      )}
                      {canEnter && (
                        <button
                          type="button"
                          className="text-xs font-bold text-[#007aff] flex items-center gap-1"
                          disabled={entering === m.organization_id}
                          onClick={() => void enterProgram(m.organization_id, m.organization_slug)}
                        >
                          {entering === m.organization_id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <CheckCircle2 size={12} />}
                          Entrar no programa
                        </button>
                      )}
                    </div>
                  </article>
                )
              })
            )}
          </div>
        )}

        {view.kind === 'tab' && view.tab === 'perfil' && (
          <PartnersProfilePanel
            profile={profile}
            user={user}
            onLogout={logout}
            onOpenAlerts={() => goTab('alertas')}
            showToast={showToast}
            onProfileUpdated={(p) => setProfile(p)}
          />
        )}
      </main>

      {view.kind === 'tab' && (
        <nav className="affiliate-bottom-nav" aria-label="Menu parceiros">
          <div className="affiliate-bottom-nav__inner">
            {([
              { key: 'resumo' as TabId, icon: LayoutDashboard, label: 'Início' },
              { key: 'mercado' as TabId, icon: Store, label: 'Mercado' },
              { key: 'alertas' as TabId, icon: Bell, label: 'Alertas' },
              { key: 'programas' as TabId, icon: FolderOpen, label: 'Programas' },
              { key: 'perfil' as TabId, icon: User, label: 'Perfil' },
            ]).map((item) => {
              const isActive = activeTab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goTab(item.key)}
                  className={`affiliate-nav-item${isActive ? ' affiliate-nav-item--active' : ''}`}
                >
                  <span className="affiliate-nav-item__icon">
                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    {isActive && <span className="affiliate-nav-item__dot" />}
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {toast && (
        <div className={`affiliate-toast ${toast.type === 'err' ? 'bg-red-600 text-white' : 'bg-[#1c1c1e] text-white'}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
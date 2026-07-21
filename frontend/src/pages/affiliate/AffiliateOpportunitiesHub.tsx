import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban, CalendarCheck, CheckCircle2, ChevronRight, Clock3, Filter, Hand, History,
  Loader2, Mail, MapPin, Radio, RefreshCw, Search, Target, Users, X, Zap,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import { nicheMatches } from '@/pages/affiliate/AffiliateOpportunitiesPanel'
import { AffiliateLiveDispatchPanel } from '@/pages/affiliate/AffiliateLiveDispatchPanel'
import {
  AffiliateAttendanceWorkspace,
  type AttendanceOpportunity,
} from '@/pages/affiliate/AffiliateAttendanceWorkspace'
import {
  AffiliateTaskWorkspace,
  type AttendanceTaskItem,
} from '@/pages/affiliate/AffiliateTaskWorkspace'
import {
  AffiliateActivityDetailModal,
  type ActivityFeedItem,
} from '@/pages/affiliate/AffiliateActivityDetailModal'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import {
  flushProgressQueue,
  pendingProgressCount,
  type ProgressPatch,
} from '@/lib/affiliate-crm-local'

export type OppHubTab = 'novas' | 'tarefas' | 'historico' | 'automatico'

type PoolItem = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  instagram?: string | null
  city?: string | null
  region?: string | null
  address?: string | null
  niche?: string | null
  /** Busca da campanha de captação (ex.: Restaurantes) */
  search_query?: string | null
  /** Tipo Places humanizado (ex.: Churrascaria) */
  place_type?: string | null
  /** Família: Restaurante / Supermercado */
  vertical?: string | null
  source?: string
  source_label?: string
  claim_window_minutes_left?: number
  claim_window_active?: boolean
  has_whatsapp?: boolean
  preview_action?: string
  channels?: {
    whatsapp?: string | null
    email?: string | null
    instagram?: string | null
    address?: string | null
  }
}

type AttendanceDigest = {
  inbox: number
  followup_due: number
  contacted: number
  engaged: number
  total_open: number
  claimed_today: number
  claimed_week: number
  sent_today: number
  closed_today: number
  replied_today: number
  response_rate_today: number | null
  needs_attention: number
}

type Props = {
  ctx: AppContext
  initialTab?: OppHubTab
  /** Deep-link: abrir tarefa específica (?task=id) */
  initialTaskId?: string | null
  onNavigate?: (path: string) => void
}

function formatMinutes(mins?: number) {
  const m = Math.max(0, Number(mins) || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}min` : `${h}h`
}

function ChannelIconRow({ item }: { item: PoolItem }) {
  const phone = item.channels?.whatsapp || item.phone
  const email = item.channels?.email || item.email
  const ig = item.channels?.instagram || item.instagram
  const address = item.channels?.address || item.address
  const hasWa = item.has_whatsapp ?? String(phone || '').replace(/\D/g, '').length >= 8

  return (
    <div className="flex items-center gap-1.5" aria-label="Canais disponíveis">
      <span
        title={hasWa ? 'WhatsApp disponível' : 'Sem WhatsApp'}
        className={[
          'w-8 h-8 rounded-xl grid place-items-center border',
          hasWa
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-neutral-50 border-transparent text-neutral-300',
        ].join(' ')}
      >
        <WhatsAppIcon size={15} />
      </span>
      <span
        title={email ? 'E-mail' : 'Sem e-mail'}
        className={[
          'w-8 h-8 rounded-xl grid place-items-center border',
          email ? 'bg-white border-border text-neutral-700' : 'bg-neutral-50 border-transparent text-neutral-300',
        ].join(' ')}
      >
        <Mail size={14} />
      </span>
      <span
        title={ig ? 'Instagram' : 'Sem Instagram'}
        className={[
          'w-8 h-8 rounded-xl grid place-items-center border',
          ig ? 'bg-white border-border text-neutral-700' : 'bg-neutral-50 border-transparent text-neutral-300',
        ].join(' ')}
      >
        <InstagramIcon size={14} />
      </span>
      <span
        title={address ? 'Endereço / visita' : 'Sem endereço'}
        className={[
          'w-8 h-8 rounded-xl grid place-items-center border',
          address ? 'bg-white border-border text-neutral-700' : 'bg-neutral-50 border-transparent text-neutral-300',
        ].join(' ')}
      >
        <MapPin size={14} />
      </span>
    </div>
  )
}

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const POOL_FILTER_KEY = 'affiliate.pool.filters.v1'

function loadPoolFilters() {
  try {
    const raw = localStorage.getItem(POOL_FILTER_KEY)
    if (!raw) return { channel: 'all' as const, niche: '', region: '' }
    const p = JSON.parse(raw)
    return {
      channel: (['all', 'whatsapp', 'email', 'instagram'].includes(p.channel) ? p.channel : 'all') as
        | 'all'
        | 'whatsapp'
        | 'email'
        | 'instagram',
      niche: String(p.niche || ''),
      region: String(p.region || ''),
    }
  } catch {
    return { channel: 'all' as const, niche: '', region: '' }
  }
}

function PoolPanel({
  ctx,
  onClaimed,
  searchQuery = '',
}: {
  ctx: AppContext
  onClaimed: (opportunity?: AttendanceOpportunity | null) => void
  searchQuery?: string
}) {
  const initialFilters = useMemo(() => loadPoolFilters(), [])
  const [items, setItems] = useState<PoolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [skippingId, setSkippingId] = useState<string | null>(null)
  const [canClaim, setCanClaim] = useState(true)
  const [claimBlockers, setClaimBlockers] = useState<string[]>([])
  const [ttl, setTtl] = useState(90)
  const [openPool, setOpenPool] = useState(true)
  const [detail, setDetail] = useState<PoolItem | null>(null)
  /** Confirmação de claim (evita toque acidental) */
  const [claimConfirm, setClaimConfirm] = useState(false)
  const [lastClaimMsg, setLastClaimMsg] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [channel, setChannel] = useState<'all' | 'whatsapp' | 'email' | 'instagram'>(initialFilters.channel)
  const [niche, setNiche] = useState(initialFilters.niche)
  const [region, setRegion] = useState(initialFilters.region)
  const [facets, setFacets] = useState<{
    niches?: string[]
    searches?: string[]
    verticals?: string[]
    place_types?: string[]
    regions?: string[]
    channels?: { whatsapp?: number; total?: number }
  } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(POOL_FILTER_KEY, JSON.stringify({ channel, niche, region }))
    } catch {
      /* ignore */
    }
  }, [channel, niche, region])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await affiliateApi.opportunitiesPool(120)
        setItems(r.items || [])
        setCanClaim(r.can_claim !== false)
        setClaimBlockers(Array.isArray(r.claim_blockers) ? r.claim_blockers : [])
        setTtl(Number(r.claim_ttl_minutes) || 90)
        setOpenPool(r.open_pool_enabled !== false)
        setFacets(r.facets || null)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
      }
    }
    if (lastErr && !opts?.silent) {
      ctx.showToast(
        lastErr instanceof Error ? lastErr.message : 'Erro ao carregar oportunidades disponíveis',
        'err',
      )
    }
    setLoading(false)
  }, [ctx])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  /** Chips = buscas da captação + verticais (não Google type cru). */
  const niches = useMemo(() => {
    if (facets?.niches?.length) return facets.niches
    if (facets?.searches?.length || facets?.verticals?.length) {
      return Array.from(new Set([
        ...(facets.searches || []),
        ...(facets.verticals || []),
      ])).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    const s = new Set<string>()
    for (const i of items) {
      if (i.search_query) s.add(String(i.search_query))
      if (i.vertical) s.add(String(i.vertical))
      else if (i.niche) s.add(String(i.niche))
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items, facets])

  const placeTypes = useMemo(() => {
    if (facets?.place_types?.length) return facets.place_types
    const s = new Set<string>()
    for (const i of items) if (i.place_type) s.add(String(i.place_type))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items, facets])

  const regions = useMemo(() => {
    if (facets?.regions?.length) return facets.regions
    const s = new Set<string>()
    for (const i of items) {
      if (i.city) s.add(String(i.city))
      if (i.region) s.add(String(i.region))
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [items, facets])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      const phone = item.channels?.whatsapp || item.phone
      const hasWa = item.has_whatsapp ?? String(phone || '').replace(/\D/g, '').length >= 8
      const hasEmail = !!(item.channels?.email || item.email)
      const hasIg = !!(item.channels?.instagram || item.instagram)
      if (channel === 'whatsapp' && !hasWa) return false
      if (channel === 'email' && !hasEmail) return false
      if (channel === 'instagram' && !hasIg) return false
      if (niche && !nicheMatches({
        niche: item.niche,
        search_query: item.search_query,
        place_type: item.place_type,
        vertical: item.vertical,
      }, niche)) return false
      if (region) {
        const place = `${item.city || ''} ${item.region || ''}`.toLowerCase()
        if (!place.includes(region.toLowerCase())) return false
      }
      if (q) {
        const hay = [
          item.name, item.phone, item.niche, item.search_query, item.place_type,
          item.vertical, item.city, item.region, item.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, channel, niche, region, searchQuery])

  async function claim(id: string) {
    if (!claimConfirm) {
      setClaimConfirm(true)
      return
    }
    setClaimingId(id)
    try {
      const r = await affiliateApi.claimOpportunity(id)
      const ttlMin = Number(r.claim_ttl_minutes || r.exclusive_minutes || ttl) || ttl
      const msg =
        r.message
        || `Exclusivo com você por ~${ttlMin} min — está na sua Fila`
      ctx.showToast(msg)
      setLastClaimMsg(msg)
      setItems((prev) => prev.filter((i) => i.id !== id))
      setDetail(null)
      setClaimConfirm(false)
      onClaimed(r.opportunity || null)
      window.setTimeout(() => setLastClaimMsg(null), 8000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível assumir'
      ctx.showToast(msg, 'err')
      setClaimConfirm(false)
      /* Se já foi assumida, remove da lista local */
      if (/já foi assumida|já está em atendimento|outro afiliado/i.test(msg)) {
        setItems((prev) => prev.filter((i) => i.id !== id))
        setDetail(null)
      } else {
        void load({ silent: true })
      }
    } finally {
      setClaimingId(null)
    }
  }

  async function skip(id: string, reason = 'not_interested') {
    setSkippingId(id)
    const labels: Record<string, string> = {
      not_interested: 'Recusado — some só da sua lista',
      not_matching: 'Marcado como não correspondente',
      channel_unavailable: 'Canal indisponível — removido',
    }
    try {
      await affiliateApi.skipPoolOpportunity(id, { reason })
      setItems((prev) => prev.filter((i) => i.id !== id))
      setDetail(null)
      setClaimConfirm(false)
      ctx.showToast(labels[reason] || 'Removido da sua lista de disponíveis')
    } catch (e: unknown) {
      ctx.showToast(e instanceof Error ? e.message : 'Não foi possível recusar', 'err')
    } finally {
      setSkippingId(null)
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => ctx.showToast(`${label} copiado`),
      () => ctx.showToast('Falha ao copiar', 'err'),
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="space-y-3 pb-2">
        <div className="affiliate-skel h-16 w-full" />
        <div className="affiliate-skel h-20 w-full" />
        <div className="affiliate-skel h-20 w-full" />
      </div>
    )
  }

  if (!openPool) {
    return (
      <div className="affiliate-card p-5 text-center space-y-2">
        <Target size={22} className="mx-auto text-gray-400" />
        <p className="text-sm font-semibold text-gray-900">Pool aberto desativado</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          A organização usa só distribuição automática. Acompanhe em <strong>Automático</strong>.
        </p>
      </div>
    )
  }

  const filterCount = (channel !== 'all' ? 1 : 0) + (niche ? 1 : 0) + (region ? 1 : 0)

  return (
    <div className="space-y-3">
      {lastClaimMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-950 font-medium">
          ✓ {lastClaimMsg}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
            <Hand size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Disponíveis</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Filtre, <strong>Assuma</strong> (exclusivo ~{ttl} min) ou <strong>Recuse</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={[
              'relative min-h-10 min-w-10 grid place-items-center rounded-xl border shrink-0',
              showFilters || filterCount
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-border bg-white text-gray-700',
            ].join(' ')}
            aria-label="Filtros do pool"
          >
            <Filter size={16} />
            {filterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-[9px] font-bold text-white grid place-items-center">
                {filterCount}
              </span>
            )}
          </button>
        </div>
        {!canClaim && claimBlockers.length > 0 && (
          <div className="mt-3 rounded-xl bg-gray-50 border border-border px-3 py-2.5 text-xs text-gray-700">
            Para assumir: {claimBlockers.join(' · ')}
          </div>
        )}

        {/* Filtros de canal com ícones oficiais — sempre visíveis */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {(
            [
              { key: 'all' as const, label: 'Todos', icon: null },
              { key: 'whatsapp' as const, label: 'WhatsApp', icon: 'wa' as const },
              { key: 'instagram' as const, label: 'Instagram', icon: 'ig' as const },
              { key: 'email' as const, label: 'E-mail', icon: 'mail' as const },
            ]
          ).map((opt) => {
            const on = channel === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setChannel(opt.key)}
                className={[
                  'shrink-0 min-h-10 px-3 rounded-xl text-[11px] font-bold border inline-flex items-center gap-1.5 transition',
                  on
                    ? opt.key === 'whatsapp'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-border',
                ].join(' ')}
              >
                {opt.icon === 'wa' && <WhatsAppIcon size={14} />}
                {opt.icon === 'ig' && <InstagramIcon size={14} />}
                {opt.icon === 'mail' && <Mail size={14} />}
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          {filtered.length} de {items.length}
          {channel === 'whatsapp' ? ' · só WhatsApp' : ''}
          {facets?.channels?.whatsapp != null ? ` · ${facets.channels.whatsapp} com WA` : ''}
          {niche ? ` · ${niche}` : ''}
          {' · '}janela {ttl} min
        </p>
      </div>

      {(niches.length > 0 || placeTypes.length > 1) && (
        <div className="space-y-1.5">
          <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            Busca / vertical da captação
          </p>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-0.5">
          <button
            type="button"
            onClick={() => setNiche('')}
            className={[
              'shrink-0 min-h-8 px-2.5 rounded-full text-[10px] font-bold border',
              !niche ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200',
            ].join(' ')}
          >
            Todos
          </button>
          {niches.slice(0, 24).map((n) => {
            const on = Boolean(niche) && niche.toLowerCase() === n.toLowerCase()
            const count = items.filter((i) => nicheMatches({
              niche: i.niche,
              search_query: i.search_query,
              place_type: i.place_type,
              vertical: i.vertical,
            }, n)).length
            if (count === 0) return null
            return (
              <button
                key={n}
                type="button"
                onClick={() => setNiche(on ? '' : n)}
                className={[
                  'shrink-0 min-h-8 px-2.5 rounded-full text-[10px] font-bold border max-w-[160px] truncate',
                  on
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-neutral-700 border-neutral-200',
                ].join(' ')}
                title={`${n} (${count})`}
              >
                {n}{count ? ` · ${count}` : ''}
              </button>
            )
          })}
        </div>
        </div>
      )}

      {showFilters && (
        <div className="rounded-2xl border border-border bg-white p-3.5 space-y-3">
          {niches.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Nicho ({niches.length})</p>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-white px-3 text-sm"
              >
                <option value="">Todos os nichos</option>
                {niches.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          {regions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Região ({regions.length})</p>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-white px-3 text-sm"
              >
                <option value="">Todas as regiões</option>
                {regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          {(niche || region) && (
            <button
              type="button"
              onClick={() => { setNiche(''); setRegion('') }}
              className="min-h-10 w-full rounded-xl bg-neutral-100 text-xs font-bold text-neutral-700"
            >
              Limpar nicho/região
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="affiliate-card p-8 text-center space-y-2">
          <CheckCircle2 size={22} className="mx-auto text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">
            {items.length === 0 ? 'Nenhuma oportunidade aberta' : 'Nada com estes filtros'}
          </p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
            {items.length === 0
              ? 'Quando a marca capturar contatos, eles aparecem aqui.'
              : 'Limpe os filtros ou recuse menos itens para ver mais.'}
          </p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-white overflow-hidden divide-y divide-neutral-100">
          {filtered.map((item) => {
            const place = [item.city, item.region].filter(Boolean).join(' · ')
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setClaimConfirm(false)
                    setDetail(item)
                  }}
                  className="w-full text-left px-3.5 py-3 active:bg-neutral-50 transition flex items-center gap-3 min-h-[72px]"
                >
                  <div className="w-11 h-11 rounded-2xl bg-neutral-100 grid place-items-center text-[13px] font-bold text-neutral-700 shrink-0">
                    {initials(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-neutral-900 tracking-tight truncate">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                      {[item.niche, place].filter(Boolean).join(' · ') || item.source_label || 'Organização'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ChannelIconRow item={item} />
                      {item.claim_window_active ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-800">
                          <Clock3 size={11} />
                          {formatMinutes(item.claim_window_minutes_left)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
                          <Zap size={11} />
                          Auto
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-neutral-300" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Detail sheet + confirm claim */}
      {detail && (
        <div
          className="fixed inset-0 z-[480] flex flex-col justify-end"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Fechar"
            onClick={() => setDetail(null)}
          />
          <div
            className="relative w-full max-w-lg mx-auto bg-white rounded-t-[1.35rem] shadow-2xl max-h-[min(88dvh,720px)] flex flex-col pb-[env(safe-area-inset-bottom,0px)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pool-detail-title"
          >
            <div className="flex justify-center pt-2.5" aria-hidden>
              <span className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="px-4 pt-2 pb-3 border-b border-border flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Detalhe · pool aberto
                </p>
                <h2 id="pool-detail-title" className="text-[17px] font-semibold text-gray-900 tracking-tight">
                  {detail.name}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[detail.niche, detail.city, detail.region].filter(Boolean).join(' · ')
                    || detail.source_label
                    || 'Oportunidade da organização'}
                </p>
              </div>
              <button
                type="button"
                className="w-10 h-10 grid place-items-center rounded-xl text-gray-500 hover:bg-gray-100"
                onClick={() => {
                  setDetail(null)
                  setClaimConfirm(false)
                }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className={[
                  'rounded-2xl border p-3 min-h-[72px]',
                  (detail.channels?.whatsapp || detail.phone)
                    ? 'border-emerald-100 bg-emerald-50'
                    : 'border-transparent bg-neutral-100 opacity-60',
                ].join(' ')}>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <WhatsAppIcon size={15} />
                    <span className="text-[10px] font-bold uppercase">WhatsApp</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-neutral-900 truncate">
                    {detail.channels?.whatsapp || detail.phone || '—'}
                  </p>
                  {(detail.channels?.whatsapp || detail.phone) && (
                    <button
                      type="button"
                      className="mt-1 text-[10px] font-bold text-emerald-800"
                      onClick={() =>
                        copy(String(detail.channels?.whatsapp || detail.phone).replace(/\D/g, ''), 'WhatsApp')
                      }
                    >
                      Copiar
                    </button>
                  )}
                </div>
                <div className={[
                  'rounded-2xl border p-3 min-h-[72px]',
                  (detail.channels?.email || detail.email)
                    ? 'border-neutral-200 bg-neutral-50'
                    : 'border-transparent bg-neutral-100 opacity-60',
                ].join(' ')}>
                  <div className="flex items-center gap-1.5 text-neutral-700">
                    <Mail size={15} />
                    <span className="text-[10px] font-bold uppercase">E-mail</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-neutral-900 truncate">
                    {detail.channels?.email || detail.email || '—'}
                  </p>
                </div>
                <div className={[
                  'rounded-2xl border p-3 min-h-[72px]',
                  (detail.channels?.instagram || detail.instagram)
                    ? 'border-neutral-200 bg-neutral-50'
                    : 'border-transparent bg-neutral-100 opacity-60',
                ].join(' ')}>
                  <div className="flex items-center gap-1.5 text-neutral-700">
                    <InstagramIcon size={15} />
                    <span className="text-[10px] font-bold uppercase">Instagram</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-neutral-900 truncate">
                    {(detail.channels?.instagram || detail.instagram)
                      ? `@${String(detail.channels?.instagram || detail.instagram).replace(/^@/, '')}`
                      : '—'}
                  </p>
                </div>
                <div className={[
                  'rounded-2xl border p-3 min-h-[72px]',
                  (detail.channels?.address || detail.address)
                    ? 'border-neutral-200 bg-neutral-50'
                    : 'border-transparent bg-neutral-100 opacity-60',
                ].join(' ')}>
                  <div className="flex items-center gap-1.5 text-neutral-700">
                    <MapPin size={15} />
                    <span className="text-[10px] font-bold uppercase">Endereço</span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-neutral-900 truncate">
                    {detail.channels?.address || detail.address || '—'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-50 border border-border px-3 py-2.5 text-xs text-neutral-700 leading-relaxed space-y-1">
                <p><strong>Nicho:</strong> {detail.niche || 'não informado'}</p>
                <p><strong>Região:</strong> {[detail.city, detail.region].filter(Boolean).join(' · ') || 'não informada'}</p>
                <p><strong>Fonte:</strong> {detail.source_label || 'Organização'}</p>
              </div>

              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5 text-[11px] text-sky-950 leading-relaxed">
                <strong>Exclusividade:</strong> ao confirmar, o contato some do pool e fica só com você
                por ~{ttl} min de janela. Depois avance na <strong>Fila</strong>.
              </div>
              {claimConfirm && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[11px] text-amber-950 leading-relaxed">
                  Confirme: você assume <strong>{detail.name}</strong> e ele sai dos Disponíveis dos outros.
                </div>
              )}
            </div>

            <div className="border-t border-border px-4 py-3 space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={skippingId === detail.id || !!claimingId}
                  onClick={() => {
                    if (claimConfirm) {
                      setClaimConfirm(false)
                      return
                    }
                    void skip(detail.id, 'not_interested')
                  }}
                  className="h-11 px-3 rounded-xl border border-border text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5"
                >
                  {skippingId === detail.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Ban size={15} />
                  )}
                  {claimConfirm ? 'Cancelar' : 'Recusar'}
                </button>
                <button
                  type="button"
                  disabled={!canClaim || claimingId === detail.id}
                  onClick={() => void claim(detail.id)}
                  className={[
                    'flex-1 h-11 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40',
                    claimConfirm ? 'bg-emerald-700' : 'bg-gray-900',
                  ].join(' ')}
                >
                  {claimingId === detail.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Hand size={16} />
                  )}
                  {claimConfirm ? 'Confirmar exclusividade' : 'Assumir e atender'}
                </button>
              </div>
              {!claimConfirm && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={skippingId === detail.id}
                    onClick={() => void skip(detail.id, 'not_matching')}
                    className="h-10 rounded-xl text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-100"
                  >
                    Não correspondente
                  </button>
                  <button
                    type="button"
                    disabled={skippingId === detail.id}
                    onClick={() => void skip(detail.id, 'channel_unavailable')}
                    className="h-10 rounded-xl text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-100"
                  >
                    Canal indisponível
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && items.length > 0 && (
        <p className="text-center text-[11px] text-neutral-400 py-1 flex items-center justify-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Atualizando…
        </p>
      )}
    </div>
  )
}

const TASK_TYPE_LABEL: Record<string, string> = {
  first_contact: 'Primeiro contato',
  followup_1: 'Follow-up',
  followup_2: '2º follow-up',
  qualify: 'Qualificar',
  proposal: 'Proposta',
  close: 'Fechar',
  post_sale: 'Pós-venda',
}

type TaskFilterChip = 'due' | 'overdue' | 'done_today' | 'future' | 'done'
type TaskRow = AttendanceTaskItem & { completed_at?: string | null; status?: string }

function isOverdueDue(dueAt: string): boolean {
  const ts = new Date(dueAt).getTime()
  if (Number.isNaN(ts)) return false
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return ts < todayStart.getTime()
}

function isCompletedToday(t: TaskRow): boolean {
  const at = t.completed_at || t.due_at
  const ts = new Date(at).getTime()
  if (Number.isNaN(ts)) return false
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return ts >= start.getTime() && ts <= end.getTime()
}

function TasksPanel({
  onOpenTask,
  refreshKey = 0,
  onSummary,
}: {
  onOpenTask: (task: AttendanceTaskItem) => void
  refreshKey?: number
  /** Badge = só devidas (executáveis agora), nunca futuras */
  onSummary?: (summary: { due_now: number; overdue: number }) => void
}) {
  const [due, setDue] = useState<TaskRow[]>([])
  const [upcoming, setUpcoming] = useState<TaskRow[]>([])
  const [done, setDone] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chip, setChip] = useState<TaskFilterChip>('due')
  const hasLoadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (hasLoadedOnce.current) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await affiliateApi.attendanceTasks({ mode: 'bundle', horizonDays: 30 })
      const dueList = (Array.isArray(result.due) ? result.due : result.tasks || []) as TaskRow[]
      const upList = (Array.isArray(result.upcoming) ? result.upcoming : []) as TaskRow[]
      const doneList = (Array.isArray(result.done) ? result.done : []) as TaskRow[]
      dueList.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
      upList.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
      setDue(dueList)
      setUpcoming(upList)
      setDone(doneList)
      const overdue = dueList.filter((t) => isOverdueDue(t.due_at)).length
      onSummary?.({ due_now: dueList.length, overdue })
      hasLoadedOnce.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar tarefas')
      /* não zera listas no refresh falho — evita flash vazio */
      if (!hasLoadedOnce.current) {
        setDue([])
        setUpcoming([])
        setDone([])
        onSummary?.({ due_now: 0, overdue: 0 })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [onSummary])

  useEffect(() => { void load() }, [load, refreshKey])

  const doneToday = useMemo(() => done.filter(isCompletedToday), [done])
  const overdueList = useMemo(() => due.filter((t) => isOverdueDue(t.due_at)), [due])

  const filtered = useMemo(() => {
    if (chip === 'due') return due
    if (chip === 'overdue') return overdueList
    if (chip === 'future') return upcoming
    if (chip === 'done_today') return doneToday
    return done
  }, [chip, due, overdueList, upcoming, doneToday, done])

  const chips: { key: TaskFilterChip; label: string; count: number; tone?: 'danger' | 'muted' }[] = [
    { key: 'due', label: 'Devidas', count: due.length },
    { key: 'overdue', label: 'Atrasadas', count: overdueList.length, tone: 'danger' },
    { key: 'done_today', label: 'Hoje', count: doneToday.length },
    { key: 'future', label: 'Futuras', count: upcoming.length, tone: 'muted' },
    { key: 'done', label: 'Feitas', count: done.length, tone: 'muted' },
  ]

  const emptyCopy: Record<TaskFilterChip, { title: string; body: string }> = {
    due: {
      title: 'Nada a fazer agora',
      body: 'Sem tarefas com vencimento liberado. Veja Futuras para o que está bloqueado até a data.',
    },
    overdue: {
      title: 'Nenhuma atrasada',
      body: 'Ótimo — nada passou do prazo sem execução.',
    },
    done_today: {
      title: 'Nenhuma feita hoje',
      body: 'Quando concluir tarefas, elas aparecem aqui no mesmo dia.',
    },
    future: {
      title: 'Nenhuma futura',
      body: 'Tarefas agendadas (ainda bloqueadas) aparecem aqui até liberar.',
    },
    done: {
      title: 'Nenhuma concluída ainda',
      body: 'Histórico de tarefas feitas fica nesta aba.',
    },
  }

  const canOpen = chip === 'due' || chip === 'overdue'
  const isFuture = chip === 'future'
  const isDoneView = chip === 'done' || chip === 'done_today'

  if (loading && !hasLoadedOnce.current) {
    return <div className="affiliate-skel h-40 w-full rounded-2xl" aria-label="Carregando tarefas" />
  }

  return (
    <section className="space-y-3" aria-label="Tarefas">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-neutral-950">Tarefas</h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {due.length > 0
              ? `${due.length} liberada${due.length > 1 ? 's' : ''} agora`
              : upcoming.length > 0
                ? `${upcoming.length} futura${upcoming.length > 1 ? 's' : ''} bloqueada${upcoming.length > 1 ? 's' : ''}`
                : 'Fila limpa · confira Feitas ou Futuras'}
            {refreshing ? ' · atualizando…' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="grid h-11 w-11 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600"
          aria-label="Atualizar tarefas"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filtrar tarefas">
        {chips.map((c) => {
          const on = chip === c.key
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setChip(c.key)}
              className={[
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition',
                on
                  ? c.tone === 'danger'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : c.tone === 'muted'
                      ? 'border-neutral-700 bg-neutral-800 text-white'
                      : 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700',
              ].join(' ')}
            >
              {c.label}
              <span className="tabular-nums opacity-80">{c.count}</span>
            </button>
          )
        })}
      </div>

      {error && !hasLoadedOnce.current ? (
        <div className="rounded-[20px] border border-red-100 bg-red-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-red-900">Não foi possível carregar as tarefas</p>
          <p className="mt-1 text-xs text-red-800/80">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 h-10 rounded-xl bg-neutral-950 px-4 text-xs font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[20px] border border-neutral-200 bg-white px-5 py-9 text-center">
          <CalendarCheck size={26} className="mx-auto text-neutral-300" />
          <p className="mt-3 text-sm font-semibold text-neutral-900">{emptyCopy[chip].title}</p>
          <p className="mt-1 text-xs text-neutral-500">{emptyCopy[chip].body}</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[20px] border border-neutral-200 bg-white divide-y divide-neutral-100">
          {filtered.map((item) => {
            const overdue = !isDoneView && isOverdueDue(item.due_at)
            const label = TASK_TYPE_LABEL[item.task_type] || item.task_type
            const locked = isFuture
            const secondary = isDoneView
              ? `Feita · ${new Date(item.completed_at || item.due_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : locked
                ? `Bloqueada até ${new Date(item.due_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : overdue
                  ? 'Atrasada · priorizar agora'
                  : new Date(item.due_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })

            return (
              <li key={`${item.id}-${chip}`}>
                <button
                  type="button"
                  disabled={locked || isDoneView}
                  onClick={() => {
                    if (canOpen) onOpenTask(item)
                  }}
                  className={[
                    'flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left',
                    locked || isDoneView ? 'cursor-default opacity-90' : 'active:bg-neutral-50',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                      isDoneView
                        ? 'bg-emerald-50 text-emerald-700'
                        : locked
                          ? 'bg-neutral-100 text-neutral-500'
                          : overdue
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700',
                    ].join(' ')}
                  >
                    {isDoneView ? <CheckCircle2 size={17} /> : locked ? <Clock3 size={17} /> : <Clock3 size={17} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13px] text-neutral-950">
                      {item.contact_name || 'Contato'}
                    </strong>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-neutral-800">
                      {label}
                      {item.instruction ? ` · ${item.instruction}` : ''}
                    </span>
                    <span
                      className={[
                        'mt-1 block text-[10px] font-semibold',
                        isDoneView
                          ? 'text-emerald-700'
                          : locked
                            ? 'text-neutral-500'
                            : overdue
                              ? 'text-red-700'
                              : 'text-amber-700',
                      ].join(' ')}
                    >
                      {secondary}
                    </span>
                  </span>
                  {canOpen ? (
                    <ChevronRight size={18} className="shrink-0 text-neutral-300" />
                  ) : locked ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase text-neutral-500">
                      Bloq.
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function activityTone(action: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (['sent', 'replied', 'negotiating', 'claim', 'convert', 'followup'].includes(action)) return 'ok'
  if (['auto_reply', 'no_answer', 'waiting', 'pool_skip'].includes(action)) return 'warn'
  if (['lost', 'dismiss', 'channel_unavailable', 'not_matching'].includes(action)) return 'danger'
  return 'neutral'
}

function ActivityPanel({
  onOpenActivity,
}: {
  onOpenActivity: (item: ActivityFeedItem) => void
}) {
  const [items, setItems] = useState<ActivityFeedItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await affiliateApi.opportunityActivity(60)
      setItems(Array.isArray(result.activities) ? (result.activities as ActivityFeedItem[]) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <div className="affiliate-skel h-40 w-full rounded-2xl" aria-label="Carregando histórico" />

  return (
    <section className="space-y-3" aria-label="Histórico operacional">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-neutral-950">Atividade recente</h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Toque no registro para ver o que foi feito e conferir a conversa.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="grid h-11 w-11 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600" aria-label="Atualizar histórico"><RefreshCw size={16} /></button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[20px] border border-neutral-200 bg-white px-5 py-9 text-center">
          <History size={26} className="mx-auto text-neutral-300" />
          <p className="mt-3 text-sm font-semibold text-neutral-900">Nenhuma ação recente</p>
          <p className="mt-1 text-xs text-neutral-500">Mensagens, follow-ups e atualizações aparecerão aqui.</p>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-[20px] border border-neutral-200 bg-white divide-y divide-neutral-100">
          {items.map((item) => {
            const tone = activityTone(item.action)
            const iconCls =
              tone === 'ok'
                ? 'bg-emerald-50 text-emerald-700'
                : tone === 'warn'
                  ? 'bg-amber-50 text-amber-800'
                  : tone === 'danger'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-neutral-100 text-neutral-600'
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenActivity(item)}
                  className="flex min-h-[76px] w-full gap-3 px-4 py-3 text-left active:bg-neutral-50"
                >
                  <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconCls}`}>
                    <History size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[13px] text-neutral-950">{item.label}</strong>
                    <span className="mt-0.5 block truncate text-[12px] text-neutral-600">
                      {item.contact_name}
                      {item.contact_removed ? ' · excluído' : item.contact_archived ? ' · excluído' : ''}
                    </span>
                    <span className="mt-1 block text-[10px] text-neutral-400">
                      {item.at
                        ? new Date(item.at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Agora'}
                      {' · '}toque para detalhes
                    </span>
                  </span>
                  <ChevronRight size={18} className="mt-3 shrink-0 text-neutral-300" />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export function AffiliateOpportunitiesHub({
  ctx,
  initialTab = 'novas',
  initialTaskId = null,
  onNavigate,
}: Props) {
  const [tab, setTab] = useState<OppHubTab>(initialTab)
  /** Reload silencioso de Meus contatos — sem remount (evita Failed to fetch em rajada). */
  const [meusRefresh, setMeusRefresh] = useState(0)
  const [progressPatch, setProgressPatch] = useState<ProgressPatch | null>(null)
  const [workspaceItem, setWorkspaceItem] = useState<AttendanceOpportunity | null>(null)
  /** Modal de execução de tarefa (diretor) — separado da ficha de contato */
  const [taskItem, setTaskItem] = useState<AttendanceTaskItem | null>(null)
  const [activityItem, setActivityItem] = useState<ActivityFeedItem | null>(null)
  const [tasksRefresh, setTasksRefresh] = useState(0)
  const [taskBadge, setTaskBadge] = useState(0)
  const [pendingSync, setPendingSync] = useState(0)
  const [globalQ, setGlobalQ] = useState('')
  const [digest, setDigest] = useState<AttendanceDigest | null>(null)
  const [deepLinkTaskConsumed, setDeepLinkTaskConsumed] = useState(false)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const loadDigest = useCallback(async () => {
    try {
      const d = await affiliateApi.attendanceDigest()
      setDigest(d as AttendanceDigest)
      /* Badge da tab Tarefas NÃO usa followup_due do CRM (infla / mente).
         Contagem real vem do TasksPanel (mode=bundle → due_now). */
    } catch {
      /* silencioso */
    }
  }, [])

  useEffect(() => {
    void loadDigest()
  }, [loadDigest, ctx.cacheVersion, meusRefresh])

  /* Offline queue badge + flush ao focar hub */
  useEffect(() => {
    const tick = () => setPendingSync(pendingProgressCount())
    tick()
    const onVis = () => {
      tick()
      void flushProgressQueue().then(tick)
    }
    window.addEventListener('online', onVis)
    window.addEventListener('focus', onVis)
    const id = window.setInterval(tick, 30_000)
    return () => {
      window.removeEventListener('online', onVis)
      window.removeEventListener('focus', onVis)
      window.clearInterval(id)
    }
  }, [tasksRefresh, meusRefresh])

  /* Deep-link ?task=uuid — abre modal de execução (só se due) */
  useEffect(() => {
    if (!initialTaskId || deepLinkTaskConsumed) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await affiliateApi.attendanceTasks({ mode: 'due' })
        if (cancelled) return
        const hit = (result.tasks || []).find((t) => String(t.id) === String(initialTaskId))
        if (hit) {
          setTab('tarefas')
          setTaskItem(hit)
          setDeepLinkTaskConsumed(true)
        } else {
          setDeepLinkTaskConsumed(true)
          ctx.showToast('Tarefa ainda não está liberada ou já foi concluída', 'err')
        }
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [initialTaskId, deepLinkTaskConsumed, ctx])

  /** Só abre executor se houver task real due — sem sintético. */
  const openTaskForContact = useCallback(async (item: AttendanceOpportunity) => {
    try {
      const result = await affiliateApi.attendanceTasks({ mode: 'due' })
      const hit = (result.tasks || []).find(
        (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
      )
      if (hit) {
        setWorkspaceItem(null)
        setTaskItem(hit)
        setTab('tarefas')
        return
      }
      /* Agenda: próxima futura (só informativo na ficha) */
      const upcoming = await affiliateApi.attendanceTasks({ mode: 'upcoming', horizonDays: 30 })
      const future = (upcoming.tasks || []).find(
        (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
      )
      if (future) {
        ctx.showToast(
          `Próxima tarefa libera em ${new Date(future.due_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
        )
        return
      }
      ctx.showToast('Nenhuma tarefa devida para este contato')
    } catch {
      ctx.showToast('Não foi possível carregar a tarefa', 'err')
    }
  }, [ctx])

  const tabs = useMemo(
    () =>
      [
        {
          key: 'novas' as const,
          label: 'Novas',
          icon: Target,
          hint: 'Oportunidades disponíveis para começar um atendimento.',
        },
        {
          key: 'tarefas' as const,
          label: 'Tarefas',
          icon: CalendarCheck,
          hint: 'Follow-ups e ações que precisam acontecer agora ou depois.',
          badge: taskBadge > 0 ? taskBadge : undefined,
        },
        {
          key: 'historico' as const,
          label: 'Histórico',
          icon: History,
          hint: 'Ações recentes para retomar rapidamente o contexto.',
        },
        {
          key: 'automatico' as const,
          label: 'Automático',
          icon: Radio,
          hint: 'Automação assistida da operação, em preparação.',
          soon: true,
        },
      ] as const,
    [taskBadge],
  )

  const active = tabs.find((t) => t.key === tab) || tabs[0]

  return (
    <div className="space-y-4 pb-2">
      <div className="space-y-2">
        <div>
          <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Oportunidades</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Sua área de trabalho para começar, executar e retomar ações.
          </p>
        </div>

        {/* KPIs de atendimento */}
        {digest && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Fila', value: digest.inbox, tone: digest.inbox > 0 ? 'warn' : 'ok' },
              { label: 'Follow-up', value: digest.followup_due, tone: digest.followup_due > 0 ? 'danger' : 'ok' },
              { label: 'Hoje', value: digest.claimed_today, tone: 'ok' },
              {
                label: 'Envios',
                value: digest.sent_today,
                tone: 'ok',
              },
            ].map((k) => (
              <button
                key={k.label}
                type="button"
                onClick={() => {
                  if (k.label === 'Fila') setTab('novas')
                  else setTab(k.label === 'Envios' ? 'historico' : 'tarefas')
                }}
                className={[
                  'rounded-xl border px-1.5 py-2 text-center',
                  k.tone === 'danger'
                    ? 'border-red-100 bg-red-50'
                    : k.tone === 'warn'
                      ? 'border-orange-100 bg-orange-50'
                      : 'border-neutral-200 bg-white',
                ].join(' ')}
              >
                <p className="text-[15px] font-bold tabular-nums text-neutral-900 leading-none">{k.value}</p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{k.label}</p>
              </button>
            ))}
          </div>
        )}

        {digest && (digest.followup_due > 0 || digest.inbox > 0) && (
          <button
            type="button"
            onClick={() => setTab('tarefas')}
            className="w-full rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-left text-[11px] text-amber-950"
          >
            <strong>
              {digest.followup_due > 0
                ? `${digest.followup_due} follow-up pendente${digest.followup_due > 1 ? 's' : ''}`
                : `${digest.inbox} na Fila`}
            </strong>
            {' · '}toque para abrir Tarefas
            {digest.response_rate_today != null
              ? ` · taxa resposta hoje ${digest.response_rate_today}%`
              : ''}
          </button>
        )}

        {pendingSync > 0 && (
          <button
            type="button"
            onClick={() => {
              void flushProgressQueue().then((r) => {
                setPendingSync(pendingProgressCount())
                if (r.flushed > 0) {
                  ctx.showToast(`${r.flushed} ação(ões) sincronizada(s)`)
                  setTasksRefresh((k) => k + 1)
                  void loadDigest()
                } else {
                  ctx.showToast('Ainda offline ou fila vazia após tentativa')
                }
              })
            }}
            className="w-full rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-left text-[11px] text-sky-950"
          >
            <strong>{pendingSync} pendente{pendingSync > 1 ? 's' : ''} no aparelho</strong>
            {' · '}toque para sincronizar agora
          </button>
        )}

        {/* Busca global (pool + meus via prop) */}
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={globalQ}
            onChange={(e) => setGlobalQ(e.target.value)}
            placeholder={tab === 'novas' ? 'Buscar oportunidades…' : 'Buscar nesta área…'}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-9 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/5"
          />
          {globalQ ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-neutral-400"
              onClick={() => setGlobalQ('')}
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div
          className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-gray-100/90 border border-border"
          role="tablist"
          aria-label="Área de trabalho de oportunidades"
        >
          {tabs.map((t) => {
            const Icon = t.icon
            const on = tab === t.key
            const badge = 'badge' in t ? t.badge : undefined
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={[
                  'relative h-12 rounded-xl text-[10px] font-semibold inline-flex flex-col items-center justify-center gap-0.5 transition',
                  on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
                ].join(' ')}
              >
                <Icon size={14} strokeWidth={2.25} />
                {t.label}
                {'soon' in t && t.soon ? (
                  <span className="absolute -top-1 -right-0.5 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white">
                    Em breve
                  </span>
                ) : null}
                {badge != null && badge > 0 ? (
                  <span className="absolute -top-1 -right-0.5 min-w-[16px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[8px] font-bold tabular-nums text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-500 px-0.5">{active.hint}</p>
      </div>

      {tab === 'novas' && (
        <PoolPanel
          ctx={ctx}
          searchQuery={globalQ}
          onClaimed={(opportunity) => {
            setMeusRefresh((k) => k + 1)
            void loadDigest()
            if (opportunity) {
              setWorkspaceItem(opportunity)
            }
          }}
        />
      )}
      {tab === 'tarefas' && (
        <TasksPanel
          refreshKey={tasksRefresh}
          onSummary={(s) => setTaskBadge(Math.max(0, Number(s.due_now) || 0))}
          onOpenTask={(t) => {
            setWorkspaceItem(null)
            setTaskItem(t)
          }}
        />
      )}
      {tab === 'historico' && (
        <ActivityPanel
          onOpenActivity={(item) => {
            setTaskItem(null)
            setWorkspaceItem(null)
            setActivityItem(item)
          }}
        />
      )}
      {tab === 'automatico' && (
        <AffiliateLiveDispatchPanel
          ctx={ctx}
          onConnectWhatsApp={() => onNavigate?.('/conexoes')}
          onNavigate={onNavigate}
        />
      )}

      {/* Ficha do contato: detalhes, histórico — execução de tarefa é no modal de tarefas */}
      {workspaceItem && !taskItem && (
        <AffiliateAttendanceWorkspace
          item={workspaceItem}
          ctx={ctx}
          onConnectWhatsApp={() => onNavigate?.('/conexoes')}
          onExecutePendingTask={() => { void openTaskForContact(workspaceItem) }}
          onClose={() => {
            setWorkspaceItem(null)
            void loadDigest()
          }}
          onChanged={(patch) => {
            if (patch) {
              setProgressPatch(patch)
              const midFlow = new Set(['sent', 'followup', 'note'])
              if (!midFlow.has(String(patch.action || ''))) {
                setWorkspaceItem(null)
                setTab('novas')
              }
            } else {
              setMeusRefresh((k) => k + 1)
            }
            setTasksRefresh((k) => k + 1)
            setPendingSync(pendingProgressCount())
            void loadDigest()
          }}
        />
      )}

      {/* Modal de TAREFA — diretor de execução (follow-up, proposta, pós-venda…) */}
      {taskItem && (
        <AffiliateTaskWorkspace
          task={taskItem}
          ctx={ctx}
          onConnectWhatsApp={() => onNavigate?.('/conexoes')}
          onClose={() => {
            setTaskItem(null)
            setTasksRefresh((k) => k + 1)
            void loadDigest()
          }}
          onOpenContact={(item) => {
            setTaskItem(null)
            setWorkspaceItem(item)
          }}
          onChanged={(patch) => {
            if (patch) {
              setProgressPatch(patch)
              const midFlow = new Set(['sent', 'followup', 'note'])
              if (!midFlow.has(String(patch.action || ''))) {
                setTaskItem(null)
                setTab('novas')
              }
            }
            setTasksRefresh((k) => k + 1)
            setMeusRefresh((k) => k + 1)
            setPendingSync(pendingProgressCount())
            void loadDigest()
          }}
        />
      )}

      {/* Modal de HISTÓRICO — registro da ação + conferir conversa */}
      {activityItem && (
        <AffiliateActivityDetailModal
          activity={activityItem}
          ctx={ctx}
          onClose={() => setActivityItem(null)}
          onOpenContact={(item) => {
            setActivityItem(null)
            setWorkspaceItem(item)
          }}
          onExecuteTask={(item) => {
            setActivityItem(null)
            void openTaskForContact(item)
          }}
        />
      )}
    </div>
  )
}

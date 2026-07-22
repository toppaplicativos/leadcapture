/**
 * Meus contatos — CRM mobile-first.
 * Fase é navegação primária; canal/nicho/região são filtros secundários.
 * Contagens de fase NUNCA somem com filtro (só a lista é filtrada).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, Clock3, Filter, Inbox, Loader2, Mail, MapPin,
  RefreshCw, Search, Sparkles, Users, X,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'
import type { AttendanceOpportunity } from '@/pages/affiliate/AffiliateAttendanceWorkspace'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import {
  applyProgressPatchToLists,
  pendingProgressCount,
  readOpportunitiesCache,
  writeOpportunitiesCache,
  type ProgressPatch,
} from '@/lib/affiliate-crm-local'

type Phase = 'inbox' | 'contacted' | 'engaged' | 'closed' | 'all'
type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'instagram' | 'address'

type Opportunity = AttendanceOpportunity & {
  pipeline_type?: 'contact' | 'prospect' | 'lead'
  temperature?: 'cold' | 'warm' | 'hot'
  source?: string
  last_interaction_at?: string | null
  received_at?: string
  next_followup_at?: string | null
  niche?: string | null
}

type Stats = {
  total_open?: number
  phase_new?: number
  phase_to_contact?: number
  phase_inbox?: number
  phase_contacted?: number
  phase_engaged?: number
  phase_closed?: number
  followup_due?: number
}

type Facets = {
  niches?: string[]
  regions?: string[]
  channels?: { whatsapp?: number; email?: number; instagram?: number; address?: number; total?: number }
}

const STORAGE_KEY = 'affiliate.meus_contatos.filters.v4'

const PHASES: { key: Phase; label: string; short: string }[] = [
  { key: 'inbox', label: 'Fila', short: 'Fila' },
  { key: 'contacted', label: 'Enviado', short: 'Env.' },
  { key: 'engaged', label: 'Conversa', short: 'Conv.' },
  { key: 'closed', label: 'Excluídos', short: 'Exc.' },
  { key: 'all', label: 'Todos', short: 'Todos' },
]

const PHASE_META: Record<string, { bg: string; color: string; label: string }> = {
  new: { bg: 'bg-orange-50', color: 'text-orange-800', label: 'Fila' },
  to_contact: { bg: 'bg-orange-50', color: 'text-orange-800', label: 'Fila' },
  contacted: { bg: 'bg-emerald-50', color: 'text-emerald-800', label: 'Enviado' },
  engaged: { bg: 'bg-violet-50', color: 'text-violet-800', label: 'Conversa' },
  closed: { bg: 'bg-neutral-100', color: 'text-neutral-600', label: 'Excluído' },
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Match de nicho resiliente.
 * Aceita objeto com search_query / place_type / vertical OU string legada.
 * "Restaurantes" casa com Churrascaria / Barbecue / Pizzaria.
 */
export function nicheMatches(
  itemNiche:
    | string
    | null
    | undefined
    | {
        niche?: string | null
        search_query?: string | null
        place_type?: string | null
        vertical?: string | null
      },
  filterNiche: string,
): boolean {
  const filter = stripAccents(filterNiche)
  if (!filter) return true

  const fields: string[] = []
  if (itemNiche && typeof itemNiche === 'object') {
    for (const k of [itemNiche.vertical, itemNiche.search_query, itemNiche.place_type, itemNiche.niche]) {
      const v = String(k || '').trim()
      if (v) fields.push(stripAccents(v))
    }
  } else {
    const raw = String(itemNiche || '').trim()
    if (raw) fields.push(stripAccents(raw))
  }
  if (!fields.length) return false

  for (const item of fields) {
    if (item === filter) return true
    if (item.includes(filter) || filter.includes(item)) return true
  }

  const families: Record<string, string[]> = {
    restaurante: [
      'restaurante', 'restaurantes', 'restaurant', 'restaurants',
      'pizzaria', 'hamburgueria', 'lanchonete', 'japonesa',
      'fast food', 'buffet', 'bar', 'gastropub', 'frutos do mar', 'hot dog', 'acai', 'açaí',
      'churrascaria', 'churrasco', 'barbecue', 'steak house', 'steakhouse', 'bbq',
      'padaria', 'cafe', 'café', 'cafeteria', 'delivery', 'comida',
    ],
    supermercado: [
      'supermercado', 'supermercados', 'supermarket', 'mercearia', 'mercado', 'atacado',
      'conveniencia', 'conveniência', 'alimentacao', 'alimentação', 'grocery',
    ],
  }
  for (const [family, members] of Object.entries(families)) {
    const filterIn =
      filter === stripAccents(family)
      || members.some((m) => filter === stripAccents(m) || filter.includes(stripAccents(m)))
    if (!filterIn) continue
    const itemIn = fields.some(
      (item) =>
        item === stripAccents(family)
        || members.some((m) => item === stripAccents(m) || item.includes(stripAccents(m))),
    )
    if (itemIn) return true
  }
  return false
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { phase: 'inbox' as Phase, channel: 'all' as ChannelFilter, niche: '', region: '', q: '' }
    }
    const p = JSON.parse(raw)
    const phase = PHASES.some((x) => x.key === p.phase) ? p.phase : 'inbox'
    const channel = ['all', 'whatsapp', 'email', 'instagram', 'address'].includes(p.channel)
      ? p.channel
      : 'all'
    return {
      phase: phase as Phase,
      channel: channel as ChannelFilter,
      niche: String(p.niche || ''),
      region: String(p.region || ''),
      q: String(p.q || ''),
    }
  } catch {
    return { phase: 'inbox' as Phase, channel: 'all' as ChannelFilter, niche: '', region: '', q: '' }
  }
}

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function followupLabel(item: Opportunity): string | null {
  if (item.followup_due) return 'Follow-up atrasado'
  if (!item.next_followup_at) return null
  try {
    const d = new Date(item.next_followup_at)
    if (Number.isNaN(d.getTime())) return null
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    if (days <= 0) return 'Follow-up atrasado'
    if (days === 1) return 'Lembrar amanhã'
    return `Lembrar em ${days} dias`
  } catch {
    return null
  }
}

function phaseOf(item: Opportunity): string {
  return String(item.operational_phase || 'to_contact')
}

function inPhase(item: Opportunity, phase: Phase): boolean {
  const op = phaseOf(item)
  if (phase === 'all') return true
  if (phase === 'inbox') return op === 'new' || op === 'to_contact'
  if (phase === 'closed') return op === 'closed' || item.status_code === 'lost'
  return op === phase
}

/** Busca livre: tokens AND, telefone por dígitos, sem depender de fase/filtro. */
function contactMatchesQuery(item: Opportunity, query: string): boolean {
  const raw = String(query || '').trim()
  if (!raw) return true
  const q = stripAccents(raw)
  const phoneDigits = String(item.channels?.whatsapp || item.phone || '').replace(/\D/g, '')
  const qDigits = raw.replace(/\D/g, '')
  if (qDigits.length >= 4 && phoneDigits.includes(qDigits)) return true

  const hay = stripAccents(
    [
      item.name,
      item.phone,
      item.email,
      item.instagram,
      item.niche,
      item.city,
      item.region,
      item.next_action,
      item.product_name,
      item.brand_name,
      item.source_label,
      item.notes,
      item.message,
      (item as any).search_query,
      (item as any).place_type,
      (item as any).vertical,
      item.channels?.whatsapp,
      item.channels?.email,
      item.channels?.instagram,
      item.channels?.address,
    ]
      .filter(Boolean)
      .join(' '),
  )

  const tokens = q.split(/\s+/).filter((t) => t.length > 0)
  if (!tokens.length) return true
  return tokens.every((token) => {
    if (hay.includes(token)) return true
    const td = token.replace(/\D/g, '')
    if (td.length >= 3 && phoneDigits.includes(td)) return true
    return false
  })
}

function hasChannel(item: Opportunity, channel: ChannelFilter): boolean {
  if (channel === 'all') return true
  const phone = item.channels?.whatsapp || item.phone
  const hasWa = item.has_whatsapp ?? String(phone || '').replace(/\D/g, '').length >= 8
  if (channel === 'whatsapp') return hasWa
  if (channel === 'email') return !!(item.channels?.email || item.email)
  if (channel === 'instagram') return !!(item.channels?.instagram || item.instagram)
  if (channel === 'address') return !!(item.channels?.address || item.address)
  return true
}

type Props = {
  ctx: AppContext
  focusRefId?: string | null
  onOpenWorkspace?: (item: AttendanceOpportunity) => void
  /** Incrementa para pedir reload silencioso (sem remount). */
  refreshToken?: number
  /** Patch otimista vindo do workspace (progresso / offline). */
  progressPatch?: ProgressPatch | null
  onProgressPatchConsumed?: () => void
  /** Busca do Hub (global) — sobrescreve/combina com a busca local */
  externalSearch?: string
}

export function AffiliateOpportunitiesPanel({
  ctx,
  focusRefId,
  onOpenWorkspace,
  refreshToken = 0,
  progressPatch = null,
  onProgressPatchConsumed,
  externalSearch = '',
}: Props) {
  const initial = useMemo(() => loadStored(), [])
  const brandId = (ctx as any)?.brand?.id || (ctx as any)?.brandId || null
  const [phase, setPhase] = useState<Phase>(initial.phase)
  const [channel, setChannel] = useState<ChannelFilter>(initial.channel)
  const [niche, setNiche] = useState(initial.niche)
  const [region, setRegion] = useState(initial.region)
  const [q, setQ] = useState(initial.q)
  const [showFilters, setShowFilters] = useState(false)
  const [openItems, setOpenItems] = useState<Opportunity[]>([])
  const [closedItems, setClosedItems] = useState<Opportunity[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [pendingSync, setPendingSync] = useState(0)
  const loadGen = useRef(0)
  const closedLoaded = useRef(false)
  const openRef = useRef<Opportunity[]>([])
  const closedRef = useRef<Opportunity[]>([])
  openRef.current = openItems
  closedRef.current = closedItems

  /* Hidrata cache local imediatamente (evita tela vazia em rede ruim) */
  useEffect(() => {
    const cached = readOpportunitiesCache(brandId)
    if (cached?.all_open?.length || cached?.all_closed?.length) {
      setOpenItems((cached.all_open || []) as Opportunity[])
      setClosedItems((cached.all_closed || []) as Opportunity[])
      if (cached.stats) setStats(cached.stats as Stats)
      if (cached.facets) setFacets(cached.facets as Facets)
      if ((cached.all_closed || []).length) closedLoaded.current = true
      setFromCache(true)
      setLoading(false)
    }
    setPendingSync(pendingProgressCount())
  }, [brandId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ phase, channel, niche, region, q }))
    } catch { /* ignore */ }
  }, [phase, channel, niche, region, q])

  const showToast = ctx.showToast

  const applyPayload = useCallback((r: any, opts?: { keepClosed?: boolean }) => {
    const open = (r.all_open || r.opportunities || []) as Opportunity[]
    const closed = (r.all_closed || []) as Opportunity[]
    const nextOpen = Array.isArray(open) ? open : []
    openRef.current = nextOpen
    setOpenItems(nextOpen)
    if (Array.isArray(closed) && closed.length) {
      closedRef.current = closed
      setClosedItems(closed)
      closedLoaded.current = true
    } else if (opts?.keepClosed || r.include_closed === false) {
      /* mantém closed anterior se payload não trouxe arquivo */
    } else {
      const nextClosed = Array.isArray(closed) ? closed : []
      closedRef.current = nextClosed
      setClosedItems(nextClosed)
      if (Array.isArray(closed)) closedLoaded.current = true
    }
    setStats(r.stats || null)
    setFromCache(false)

    const apiFacets = r.facets || null
    if (apiFacets?.niches?.length || apiFacets?.regions?.length) {
      setFacets(apiFacets)
    } else {
      const pool = [...(Array.isArray(open) ? open : []), ...(Array.isArray(closed) ? closed : [])]
      const nSet = new Set<string>()
      const rSet = new Set<string>()
      for (const i of pool) {
        if (i.niche) nSet.add(String(i.niche).trim())
        if (i.city) rSet.add(String(i.city).trim())
        if (i.region) rSet.add(String(i.region).trim())
      }
      setFacets({
        niches: Array.from(nSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        regions: Array.from(rSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        channels: { total: pool.length },
      })
    }

    writeOpportunitiesCache({
      all_open: Array.isArray(open) ? open : [],
      all_closed: Array.isArray(closed) && closed.length
        ? closed
        : undefined,
      stats: r.stats || null,
      facets: r.facets || null,
      brand_id: brandId,
    })
  }, [brandId])

  const applyLocalPatch = useCallback((patch: ProgressPatch) => {
    const { open, closed } = applyProgressPatchToLists(openRef.current, closedRef.current, patch)
    openRef.current = open as Opportunity[]
    closedRef.current = closed as Opportunity[]
    setOpenItems(open as Opportunity[])
    setClosedItems(closed as Opportunity[])
    writeOpportunitiesCache({
      all_open: open,
      all_closed: closed,
      brand_id: brandId,
    })
    setPendingSync(pendingProgressCount())
  }, [brandId])

  /* Recebe patch otimista do Hub/workspace */
  useEffect(() => {
    if (!progressPatch) return
    applyLocalPatch(progressPatch)
    onProgressPatchConsumed?.()
  }, [progressPatch, applyLocalPatch, onProgressPatchConsumed])

  const load = useCallback(async (opts?: { silent?: boolean; withClosed?: boolean }) => {
    const gen = ++loadGen.current
    const silent = !!opts?.silent
    const withClosed = opts?.withClosed ?? (phase === 'closed' || phase === 'all' || !closedLoaded.current)

    if (silent) setRefreshing(true)
    else if (!openItems.length && !closedItems.length) setLoading(true)
    setLoadError(null)
    setPendingSync(pendingProgressCount())

    try {
      /* 1) Abertos primeiro (rápido) — desbloqueia Fila/Enviado/Conversa */
      const openRes = await affiliateApi.opportunities('all', 1, 300, {
        includeClosed: false,
        timeoutMs: 22_000,
      })
      if (gen !== loadGen.current) return
      applyPayload(openRes, { keepClosed: true })
      setLoading(false)

      /* 2) Arquivo sob demanda / em background */
      if (withClosed) {
        try {
          const closedRes = await affiliateApi.opportunities('closed', 1, 200, {
            includeClosed: true,
            timeoutMs: 18_000,
          })
          if (gen !== loadGen.current) return
          const closed = (closedRes.all_closed || closedRes.opportunities || []) as Opportunity[]
          setClosedItems(Array.isArray(closed) ? closed : [])
          closedRef.current = Array.isArray(closed) ? closed : []
          closedLoaded.current = true
          writeOpportunitiesCache({
            all_open: openRef.current,
            all_closed: Array.isArray(closed) ? closed : [],
            stats: openRes.stats,
            facets: openRes.facets,
            brand_id: brandId,
          })
          if (closedRes.stats?.phase_closed != null) {
            setStats((s) => ({ ...(s || {}), phase_closed: closedRes.stats.phase_closed }))
          }
          /* merge facets */
          if (closedRes.facets?.niches?.length) {
            setFacets((prev) => {
              const n = new Set([...(prev?.niches || []), ...(closedRes.facets.niches || [])])
              const r = new Set([...(prev?.regions || []), ...(closedRes.facets.regions || [])])
              return {
                niches: Array.from(n).sort((a, b) => a.localeCompare(b, 'pt-BR')),
                regions: Array.from(r).sort((a, b) => a.localeCompare(b, 'pt-BR')),
                channels: prev?.channels || closedRes.facets.channels,
              }
            })
          }
        } catch {
          /* arquivo é opcional — não zera a lista principal */
        }
      }
    } catch (e) {
      if (gen !== loadGen.current) return
      const msg = e instanceof Error ? e.message : 'Erro ao carregar contatos'
      /* Mantém cache se houver dados */
      if (openRef.current.length || closedRef.current.length) {
        setFromCache(true)
        setLoadError(null)
        if (!silent) {
          showToast('Usando lista salva no aparelho (sem conexão)', 'err')
        }
      } else {
        setLoadError(msg)
        if (!silent) showToast(msg, 'err')
      }
    } finally {
      if (gen === loadGen.current) {
        setLoading(false)
        setRefreshing(false)
        setPendingSync(pendingProgressCount())
      }
    }
  }, [applyPayload, phase, showToast, brandId, openItems.length, closedItems.length])

  useEffect(() => {
    void load({ withClosed: false })
  }, [ctx.cacheVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (refreshToken > 0) void load({ silent: true, withClosed: phase === 'closed' || phase === 'all' })
  }, [refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Ao abrir Arquivo/Todos, garante closed carregado */
  useEffect(() => {
    if ((phase === 'closed' || phase === 'all') && !closedLoaded.current && !loading) {
      void load({ silent: true, withClosed: true })
    }
  }, [phase, loading, load])

  const activeQuery = (externalSearch || q).trim()
  const isSearching = activeQuery.length > 0

  /* Busca precisa varrer abertos + excluídos — carrega arquivo se ainda não veio */
  useEffect(() => {
    if (!isSearching) return
    if (closedLoaded.current) return
    void load({ silent: true, withClosed: true })
  }, [isSearching, load])

  const niches = useMemo(() => {
    if (facets?.niches?.length) return facets.niches
    return Array.from(
      new Set(
        [...openItems, ...closedItems]
          .map((i) => String(i.niche || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [facets, openItems, closedItems])

  const regions = useMemo(() => {
    if (facets?.regions?.length) return facets.regions
    return Array.from(
      new Set(
        [...openItems, ...closedItems]
          .flatMap((i) => [i.city, i.region].map((x) => String(x || '').trim()).filter(Boolean)),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [facets, openItems, closedItems])

  /* Remove filtros órfãos só se nenhum item do universo bate */
  useEffect(() => {
    if (loading) return
    if (niche) {
      const any = [...openItems, ...closedItems].some((i) =>
        nicheMatches({ niche: i.niche, search_query: (i as any).search_query, place_type: (i as any).place_type, vertical: (i as any).vertical }, niche),
      )
      if (!any && openItems.length + closedItems.length > 0) setNiche('')
    }
    if (region) {
      const any = [...openItems, ...closedItems].some((i) => {
        const place = stripAccents(`${i.city || ''} ${i.region || ''}`)
        return place.includes(stripAccents(region))
      })
      if (!any && openItems.length + closedItems.length > 0) setRegion('')
    }
  }, [loading, openItems, closedItems]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Itens na fase atual (sem canal/nicho/busca) — base da contagem de fase. */
  const phasePool = useMemo(() => {
    if (phase === 'closed') return closedItems
    if (phase === 'all') return [...openItems, ...closedItems]
    return openItems.filter((i) => inPhase(i, phase))
  }, [phase, openItems, closedItems])

  /** Universe da lista: na busca, TODOS os contatos (filtros de fase/canal/nicho anulados). */
  const listUniverse = useMemo(() => {
    if (isSearching) {
      const map = new Map<string, Opportunity>()
      for (const i of [...openItems, ...closedItems]) {
        map.set(`${i.ref_type}:${i.ref_id}`, i)
      }
      return Array.from(map.values())
    }
    return phasePool
  }, [isSearching, openItems, closedItems, phasePool])

  const filtered = useMemo(() => {
    const query = activeQuery
    const list = listUniverse.filter((item) => {
      /* Com busca ativa: ignora fase, canal, nicho e região — só texto/telefone */
      if (query) return contactMatchesQuery(item, query)

      if (!hasChannel(item, channel)) return false
      if (niche && !nicheMatches({
        niche: item.niche,
        search_query: (item as any).search_query,
        place_type: (item as any).place_type,
        vertical: (item as any).vertical,
      }, niche)) return false
      if (region) {
        const place = stripAccents(`${item.city || ''} ${item.region || ''}`)
        if (!place.includes(stripAccents(region))) return false
      }
      return true
    })

    const hasWaItem = (item: Opportunity) => {
      const phone = item.channels?.whatsapp || item.phone
      return item.has_whatsapp ?? String(phone || '').replace(/\D/g, '').length >= 8
    }
    const ts = (item: Opportunity) => {
      const raw = item.last_interaction_at || item.received_at || item.next_followup_at || 0
      const t = new Date(raw).getTime()
      return Number.isFinite(t) ? t : 0
    }

    /* Busca: relevância (nome começa com → contém → resto) + recente */
    if (query) {
      const qn = stripAccents(query)
      const score = (item: Opportunity) => {
        const name = stripAccents(item.name || '')
        if (name.startsWith(qn)) return 0
        if (name.includes(qn)) return 1
        const phoneDigits = String(item.channels?.whatsapp || item.phone || '').replace(/\D/g, '')
        const qd = query.replace(/\D/g, '')
        if (qd.length >= 4 && phoneDigits.includes(qd)) return 2
        return 3
      }
      return list.slice().sort((a, b) => {
        const s = score(a) - score(b)
        if (s !== 0) return s
        return ts(b) - ts(a)
      })
    }

    /* Fila inteligente: follow-up atrasado → sem contato → com WA → mais recente */
    const phaseRank = (item: Opportunity) => {
      const op = phaseOf(item)
      if (op === 'new' || op === 'to_contact') return 0
      if (op === 'contacted') return 1
      if (op === 'engaged') return 2
      return 3
    }

    return list.slice().sort((a, b) => {
      if (!!a.followup_due !== !!b.followup_due) return a.followup_due ? -1 : 1
      const pr = phaseRank(a) - phaseRank(b)
      if (pr !== 0) return pr
      const wa = (hasWaItem(b) ? 1 : 0) - (hasWaItem(a) ? 1 : 0)
      if (wa !== 0) return wa
      return ts(b) - ts(a)
    })
  }, [listUniverse, channel, niche, region, activeQuery])

  const phaseCount = useCallback(
    (key: Phase) => {
      if (key === 'closed') return closedItems.length || Number(stats?.phase_closed || 0)
      if (key === 'all') return openItems.length + closedItems.length
      if (key === 'inbox') {
        return openItems.filter((i) => inPhase(i, 'inbox')).length
      }
      return openItems.filter((i) => phaseOf(i) === key).length
    },
    [openItems, closedItems, stats],
  )

  useEffect(() => {
    if (!focusRefId || !onOpenWorkspace) return
    const hit =
      filtered.find((i) => i.ref_id === focusRefId)
      || openItems.find((i) => i.ref_id === focusRefId)
      || closedItems.find((i) => i.ref_id === focusRefId)
    if (hit) onOpenWorkspace(hit)
  }, [focusRefId, filtered, openItems, closedItems, onOpenWorkspace])

  const activeFilterCount =
    (channel !== 'all' ? 1 : 0)
    + (niche ? 1 : 0)
    + (region ? 1 : 0)

  const hiddenByFilter = isSearching
    ? Math.max(0, listUniverse.length - filtered.length)
    : Math.max(0, phasePool.length - filtered.length)

  function clearFilters() {
    setChannel('all')
    setNiche('')
    setRegion('')
    setQ('')
  }

  function selectPhase(next: Phase) {
    setPhase(next)
    /* Se o filtro zera a nova fase, não limpa sozinho — empty state orienta.
       Mas se canal whatsapp e zero na fila, usuário vê CTA limpar. */
  }

  if (loading && openItems.length === 0 && closedItems.length === 0) {
    return (
      <div className="space-y-3 pb-2" aria-busy="true" aria-label="Carregando contatos">
        <div className="affiliate-skel h-14 w-full rounded-2xl" />
        <div className="affiliate-skel h-11 w-full rounded-2xl" />
        <div className="affiliate-skel h-[72px] w-full rounded-2xl" />
        <div className="affiliate-skel h-[72px] w-full rounded-2xl" />
        <div className="affiliate-skel h-[72px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-4 min-w-0">
      {/* Header compacto */}
      <header className="rounded-2xl border border-neutral-200/90 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-neutral-900 shrink-0" strokeWidth={2.25} />
              <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900">
                Meus contatos
              </h2>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
              {isSearching
                ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} em todos os contatos`
                : `${phasePool.length} na fase${
                    activeFilterCount > 0
                      ? ` · ${filtered.length} com filtros`
                      : ` · ${filtered.length} listados`
                  }`}
              {!isSearching && stats?.followup_due ? ` · ${stats.followup_due} follow-up` : ''}
              {!isSearching && (phase === 'inbox' || phase === 'all') ? ' · prioritários no topo' : ''}
              {isSearching && activeFilterCount > 0 ? ' · filtros de fase/canal pausados' : ''}
              {fromCache ? ' · offline' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load({ silent: true, withClosed: true })}
            disabled={refreshing}
            className="min-h-10 min-w-10 grid place-items-center rounded-xl border border-neutral-200 text-neutral-600 active:bg-neutral-50 disabled:opacity-50"
            aria-label="Atualizar lista"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={[
              'relative min-h-10 min-w-10 grid place-items-center rounded-xl border',
              showFilters || activeFilterCount
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-700',
            ].join(' ')}
            aria-expanded={showFilters}
            aria-label="Filtros"
          >
            <Filter size={15} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Busca local só se Hub não trouxe busca global */}
        {!externalSearch && (
          <div className="relative mt-2.5">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar em todos: nome, telefone, cidade…"
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-none focus:ring-4 focus:ring-neutral-900/5"
            />
            {q ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-neutral-400"
                onClick={() => setQ('')}
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        )}
        {isSearching && (
          <p className="mt-2 rounded-xl border border-sky-100 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold leading-snug text-sky-950">
            Busca em todos os contatos (Fila, Enviado, Conversa e Excluídos).
            {activeFilterCount > 0 ? ' Filtros de canal/nicho/região pausados enquanto busca.' : ''}
          </p>
        )}
      </header>

      {/* Fases — navegação primária (dimmed na busca, contagens independentes) */}
      <nav
        className={[
          'grid grid-cols-5 gap-1 rounded-2xl border border-neutral-200/90 bg-neutral-100/80 p-1',
          isSearching ? 'opacity-55' : '',
        ].join(' ')}
        aria-label="Fase do atendimento"
        aria-disabled={isSearching}
      >
        {PHASES.map((opt) => {
          const n = phaseCount(opt.key)
          const on = phase === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => selectPhase(opt.key)}
              className={[
                'min-h-11 rounded-xl px-0.5 py-1.5 text-center transition',
                on
                  ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/5'
                  : 'text-neutral-600 active:bg-white/60',
              ].join(' ')}
            >
              <span className="block text-[10px] font-bold leading-tight sm:text-[11px]">
                {opt.short}
              </span>
              <span
                className={[
                  'mt-0.5 block text-[11px] font-semibold tabular-nums',
                  on ? 'text-neutral-900' : 'text-neutral-400',
                ].join(' ')}
              >
                {n}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Filtros secundários (sheet inline) */}
      {showFilters && (
        <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-3.5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">Canal</p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: 'all' as const, label: 'Todos' },
                  { key: 'whatsapp' as const, label: 'WhatsApp', icon: 'wa' as const },
                  { key: 'instagram' as const, label: 'Instagram', icon: 'ig' as const },
                  { key: 'email' as const, label: 'E-mail', icon: 'mail' as const },
                  { key: 'address' as const, label: 'Endereço', icon: 'map' as const },
                ]
              ).map((opt) => {
                const on = channel === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setChannel(opt.key)}
                    className={[
                      'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition',
                      on
                        ? opt.key === 'whatsapp'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700',
                    ].join(' ')}
                  >
                    {opt.icon === 'wa' && <WhatsAppIcon size={13} />}
                    {opt.icon === 'ig' && <InstagramIcon size={13} />}
                    {opt.icon === 'mail' && <Mail size={13} />}
                    {opt.icon === 'map' && <MapPin size={13} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {niches.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                Nicho ({niches.length})
              </p>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
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
              <p className="mb-1.5 text-[11px] font-semibold text-neutral-500">
                Região ({regions.length})
              </p>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
              >
                <option value="">Todas as regiões</option>
                {regions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-neutral-100 text-xs font-bold text-neutral-800"
            >
              <X size={14} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Chips de nicho rápidos (quando há 2+) — fora do sheet */}
      {!showFilters && niches.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-0.5">
          <button
            type="button"
            onClick={() => setNiche('')}
            className={[
              'shrink-0 min-h-8 rounded-full border px-2.5 text-[10px] font-bold',
              !niche
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-600',
            ].join(' ')}
          >
            Todos
          </button>
          {niches.slice(0, 20).map((n) => {
            const on = Boolean(niche) && stripAccents(niche) === stripAccents(n)
            const count = phasePool.filter((i) => nicheMatches({
              niche: i.niche,
              search_query: (i as any).search_query,
              place_type: (i as any).place_type,
              vertical: (i as any).vertical,
            }, n)).length
            if (count === 0) return null
            return (
              <button
                key={n}
                type="button"
                onClick={() => setNiche(on ? '' : n)}
                className={[
                  'max-w-[150px] shrink-0 truncate min-h-8 rounded-full border px-2.5 text-[10px] font-bold',
                  on
                    ? 'border-orange-600 bg-orange-600 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700',
                ].join(' ')}
                title={`${n} (${count} nesta fase)`}
              >
                {n}
                {count > 0 ? ` · ${count}` : ''}
              </button>
            )
          })}
        </div>
      )}

      {(fromCache || pendingSync > 0) && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] text-sky-950">
          <span>
            {pendingSync > 0
              ? `${pendingSync} atualização${pendingSync > 1 ? 'ões' : ''} aguardando sincronizar`
              : 'Mostrando lista salva no aparelho'}
          </span>
          <button
            type="button"
            onClick={() => void load({ silent: true, withClosed: true })}
            className="font-bold underline-offset-2 hover:underline shrink-0"
          >
            Atualizar
          </button>
        </div>
      )}

      {/* Banner: filtros escondem contatos da fase */}
      {hiddenByFilter > 0 && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <span>
            <strong>{hiddenByFilter}</strong> oculto{hiddenByFilter > 1 ? 's' : ''} por filtro nesta fase
          </span>
          <button type="button" onClick={clearFilters} className="font-bold underline-offset-2 hover:underline">
            Limpar
          </button>
        </div>
      )}

      {loadError && openItems.length === 0 && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
          <p className="text-sm font-semibold text-red-900">Não foi possível carregar</p>
          <p className="mt-1 text-xs text-red-800/80 leading-relaxed">{loadError}</p>
          <button
            type="button"
            onClick={() => void load({ withClosed: true })}
            className="mt-3 min-h-10 rounded-xl bg-neutral-900 px-4 text-xs font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {filtered.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-8 text-center">
          {isSearching ? (
            <>
              <Search size={24} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-900">
                Nenhum contato para “{activeQuery}”
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 max-w-[16rem] mx-auto">
                Buscamos em Fila, Enviado, Conversa e Excluídos. Tente outro nome, telefone ou cidade.
              </p>
              <button
                type="button"
                onClick={() => setQ('')}
                className="mt-4 min-h-11 rounded-xl bg-neutral-900 px-5 text-xs font-bold text-white"
              >
                Limpar busca
              </button>
            </>
          ) : phasePool.length > 0 && activeFilterCount > 0 ? (
            <>
              <Filter size={24} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-900">
                {phasePool.length} na {PHASES.find((p) => p.key === phase)?.label || 'fase'}, nenhum com estes filtros
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 max-w-[16rem] mx-auto">
                Os filtros de canal, nicho ou região estão escondendo a lista. Limpe para ver a fase completa.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 min-h-11 rounded-xl bg-neutral-900 px-5 text-xs font-bold text-white"
              >
                Limpar filtros e mostrar {phasePool.length}
              </button>
            </>
          ) : phase === 'inbox' ? (
            <>
              <Inbox size={24} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-900">Fila vazia</p>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 max-w-[16rem] mx-auto">
                Assuma contatos em <strong>Disponíveis</strong> ou confira as outras fases.
              </p>
            </>
          ) : (
            <>
              <Sparkles size={24} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-900">Nada nesta fase</p>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 max-w-[16rem] mx-auto">
                {phase === 'closed'
                  ? 'Nenhum excluído — recusas e saídas da fila aparecem aqui.'
                  : 'Avance contatos da Fila para preencher esta etapa.'}
              </p>
            </>
          )}
        </div>
      ) : filtered.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-white divide-y divide-neutral-100">
          {filtered.map((item) => {
            const op = phaseOf(item)
            const meta = PHASE_META[op] || PHASE_META.to_contact
            const phone = item.channels?.whatsapp || item.phone
            const hasWa = item.has_whatsapp ?? String(phone || '').replace(/\D/g, '').length >= 8
            const hasEmail = !!(item.channels?.email || item.email)
            const hasIg = !!(item.channels?.instagram || item.instagram)
            const fu = followupLabel(item)
            const place = [item.city, item.region].filter(Boolean).join(' · ')

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace?.(item)}
                  className="flex min-h-[72px] w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-neutral-50"
                >
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-[13px] font-bold text-neutral-700"
                    aria-hidden
                  >
                    {initials(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold tracking-tight text-neutral-900">
                        {item.name}
                      </p>
                      {fu && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                          <Clock3 size={10} />
                          {fu.includes('atras') ? 'Atrasado' : 'Lembrete'}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {[item.niche, place].filter(Boolean).join(' · ')
                        || item.next_action
                        || 'Continuar atendimento'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                          meta.bg,
                          meta.color,
                        ].join(' ')}
                      >
                        {meta.label}
                      </span>
                      <span className="flex items-center gap-1 text-neutral-400">
                        {hasWa && <WhatsAppIcon size={12} className="text-emerald-600" />}
                        {hasIg && <InstagramIcon size={12} />}
                        {hasEmail && <Mail size={12} />}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-neutral-300" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {refreshing && (
        <p className="flex items-center justify-center gap-1.5 py-1 text-center text-[11px] text-neutral-400">
          <Loader2 size={12} className="animate-spin" /> Atualizando…
        </p>
      )}
    </div>
  )
}

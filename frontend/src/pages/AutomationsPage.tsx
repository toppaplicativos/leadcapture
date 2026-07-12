/**
 * AutomationsPage — Catálogo + ativação de 14 automações pré-definidas por brand.
 *
 * Layout (inspirado no AutomationsDashboard do Topp App, adaptado pro tema do leadcapture):
 *
 *   [Header com título + botão Atualizar]
 *   [4 stats cards: Total / Configuradas / Ativas / Pausadas]
 *   [Lista de cards verticais — 1 por template do catálogo]
 *     Cada card mostra:
 *       - Ícone da categoria
 *       - Nome + descrição curta
 *       - Badge de status (Ativa/Pausada/Não configurada)
 *       - Frequência (cron amigável)
 *       - Última execução + counters
 *       - Toggle (ativa/pausa) + Play (manual run) + Settings
 *       - Banner amber "Em breve" se task ainda é stub
 *
 *   [Modal de config quando user clica Settings]
 *   [Modal de histórico quando user clica em Activity]
 *
 * Tudo POR BRAND ATIVO (header x-brand-id).
 */
import { useState, useEffect, useCallback } from 'react'
import { AutomationDefinitionsHub } from '@/components/automations/AutomationDefinitionsHub'
import {
  Zap, Play, Pause, RefreshCw, Plus, Clock, CheckCircle2, XCircle, Loader2,
  ChevronRight, History, Settings2, Share2, FileText, Activity, Shield,
  Target, Bell, MessageCircle, Sunrise, BookOpen, Hash, Smartphone, ShieldCheck,
  Heart, TrendingUp, AlertCircle, X, Sparkles, Calendar,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ────────────────────────────────────────────────────────────
   Tipos espelhando o backend
   ──────────────────────────────────────────────────────────── */

type Frequency =
  | 'every_5min' | 'every_15min' | 'every_30min'
  | 'hourly' | 'every_2h' | 'every_6h' | 'every_12h'
  | 'daily' | 'weekly' | 'monthly'

interface CatalogItem {
  slug: string
  name: string
  description: string
  category: string
  task_type: string
  default_frequency: Frequency
  default_cron?: string
  default_config: Record<string, any>
  is_squad?: boolean
  execution_steps?: string[]
  icon?: string
  is_implemented?: boolean
  state: null | {
    id: string
    status: 'active' | 'paused' | 'error' | 'disabled'
    frequency: Frequency
    cron_expression: string | null
    config: Record<string, any>
    next_run_at: string | null
    last_run_at: string | null
    last_run_status: string | null
    last_run_duration_ms: number | null
    last_error: string | null
    run_count: number
    success_count: number
    error_count: number
  }
}

interface RunRecord {
  id: string
  status: 'running' | 'success' | 'error'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  result: Record<string, any> | null
  error_message: string | null
}

/* ────────────────────────────────────────────────────────────
   Mapeamentos visuais (icon by slug, color by category)
   ──────────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  Share2, FileText, Activity, Shield, Target, Bell, MessageCircle,
  Sunrise, BookOpen, Hash, Smartphone, ShieldCheck, Heart, TrendingUp,
  BarChart3: TrendingUp, Zap,
}

const CATEGORY_COLOR: Record<string, { bg: string; text: string; ring: string; chip: string }> = {
  social:   { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200',    chip: 'bg-rose-100 text-rose-700' },
  outreach: { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   chip: 'bg-amber-100 text-amber-700' },
  blog:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-200',     chip: 'bg-sky-100 text-sky-700' },
  system:   { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', chip: 'bg-emerald-100 text-emerald-700' },
  leads:    { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-200',  chip: 'bg-violet-100 text-violet-700' },
  analytics:{ bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-200',  chip: 'bg-indigo-100 text-indigo-700' },
  geral:    { bg: 'bg-gray-100',   text: 'text-gray-700',    ring: 'ring-gray-200',    chip: 'bg-gray-100 text-gray-700' },
}

const FREQ_LABEL: Record<Frequency, string> = {
  every_5min: 'A cada 5 min',
  every_15min: 'A cada 15 min',
  every_30min: 'A cada 30 min',
  hourly: 'A cada hora',
  every_2h: 'A cada 2 horas',
  every_6h: 'A cada 6 horas',
  every_12h: 'A cada 12 horas',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  monthly: 'Mensalmente',
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (diff < 0) {
    /* futuro */
    const future = -diff
    if (future < 60_000) return `em ${Math.round(future / 1000)}s`
    if (future < 3600_000) return `em ${Math.round(future / 60_000)} min`
    if (future < 86400_000) return `em ${Math.round(future / 3600_000)}h`
    return `em ${Math.round(future / 86400_000)}d`
  }
  if (diff < 60_000) return `há ${Math.round(diff / 1000)}s`
  if (diff < 3600_000) return `há ${Math.round(diff / 60_000)} min`
  if (diff < 86400_000) return `há ${Math.round(diff / 3600_000)}h`
  return `há ${Math.round(diff / 86400_000)}d`
}

function humanizeCron(cron: string | null | undefined, fallback: string): string {
  if (!cron) return fallback
  /* Mapeamentos comuns pra leitura humana — para os 14 templates do catalogo */
  const map: Record<string, string> = {
    '0 8 * * 1':      'Seg às 8h',
    '0 19 * * 5':     'Sex às 19h',
    '0 18 * * 1,3,5': 'Seg/Qua/Sex às 18h',
    '0 */3 * * *':    'A cada 3 horas',
    '0 */4 * * *':    'A cada 4 horas',
    '0 9 * * 1-5':    'Seg–Sex às 9h',
    '0 12 * * 2,4':   'Ter/Qui às 12h',
    '0 8 * * 3':      'Qua às 8h',
    '0 11 * * *':     'Diariamente às 11h',
    '0 23 * * *':     'Diariamente às 23h',
  }
  return map[cron] || cron
}

/* ────────────────────────────────────────────────────────────
   Página
   ──────────────────────────────────────────────────────────── */

/** Catalog webhook reply slugs — managed as definitions seeds, not as "tarefas". */
const HIDDEN_CATALOG_SLUGS = new Set([
  'ig-webhook-dm-reply',
  'ig-webhook-comment-keyword',
  'ig-webhook-mention-thanks',
])

export function AutomationsPage({ embedded = false, channel }: { embedded?: boolean; channel?: 'whatsapp' } = {}) {
  const [mainTab, setMainTab] = useState<'defs' | 'catalog'>('defs')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [selectedRunsFor, setSelectedRunsFor] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [promotingSlug, setPromotingSlug] = useState<string | null>(null)

  /* Toast simples — não tem react-hot-toast no projeto, usa state local */
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/automations', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      const all = Array.isArray(d?.automations) ? d.automations as CatalogItem[] : []
      // Webhook replies are definitions, not catalog "tarefas"
      setItems(all.filter((i) => {
        if (HIDDEN_CATALOG_SLUGS.has(i.slug)) return false
        if (!channel) return true
        const searchable = `${i.slug} ${i.task_type} ${i.name} ${i.description} ${JSON.stringify(i.default_config || {})}`.toLowerCase()
        return searchable.includes('whatsapp') || searchable.includes('enviar_dm_wa')
      }))
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [channel])

  useEffect(() => { load() }, [load])

  /* Recarrega quando o brand ativo muda — outro tab ou switch */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lead-system:active-brand-id') load()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [load])

  const handleToggle = useCallback(async (slug: string) => {
    setTogglingSlug(slug)
    try {
      const r = await fetch(`/api/automations/${encodeURIComponent(slug)}/toggle`, {
        method: 'POST', headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      showToast(`Status atualizado: ${d?.automation?.status === 'active' ? 'ativa' : 'pausada'}`)
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Falha ao alterar', 'err')
    } finally {
      setTogglingSlug(null)
    }
  }, [load, showToast])

  const handleRunNow = useCallback(async (item: CatalogItem) => {
    if (!item.state) {
      showToast('Ative essa automação antes de executar', 'err')
      return
    }
    setRunningId(item.state.id)
    try {
      const r = await fetch(`/api/automations/${item.state.id}/run`, {
        method: 'POST', headers: getHeaders(),
      })
      const d = await r.json()
      const status = d?.run?.status
      const dur = formatDuration(d?.run?.durationMs)
      if (status === 'success') {
        showToast(`Executada com sucesso (${dur})`)
      } else {
        showToast(d?.run?.errorMessage || 'Falha na execução', 'err')
      }
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Falha ao executar', 'err')
    } finally {
      setRunningId(null)
    }
  }, [load, showToast])

  /** Converte um modelo de catálogo em automação (definition) editável no hub. */
  const handlePromoteToAutomation = useCallback(async (item: CatalogItem) => {
    setPromotingSlug(item.slug)
    try {
      const cron = item.state?.cron_expression || item.default_cron || '0 9 * * *'
      const freq = item.state?.frequency || item.default_frequency || 'daily'
      const r = await fetch('/api/automation-defs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          nome: item.name,
          descricao: item.description || `Modelo: ${item.slug}`,
          ativa: false,
          trigger: {
            tipo: 'agendamento',
            frequencia: freq === 'weekly' ? 'semanal' : freq === 'monthly' ? 'mensal' : 'diario',
            horarios: [{ hora: 9, minuto: 0 }],
            diasSemana: [],
            diasMes: [],
            cron,
            timezone: 'America/Sao_Paulo',
          },
          pipeline: [
            {
              ordem: 1,
              tipo: String(item.task_type || '').includes('instagram')
                ? 'publicar_conteudo'
                : String(item.task_type || '').includes('whatsapp') || String(item.task_type || '').includes('outreach')
                  ? 'enviar_dm_wa'
                  : 'notificar_equipe',
              config: {
                ...(item.default_config || {}),
                catalogSlug: item.slug,
                task_type: item.task_type,
                mensagem: item.description || item.name,
                iaGenerated: true,
              },
            },
          ],
          limites: {
            maxPorUsuario: 1,
            cooldownSegundos: 3600,
            maxPorHora: 0,
            maxPorDia: 0,
            janelaMaxUsuarioSegundos: 86400,
          },
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      showToast('Modelo adicionado como automação (inativa). Edite e ative em “Todas as automações”.')
      setMainTab('defs')
    } catch (e: any) {
      showToast(e?.message || 'Falha ao converter em automação', 'err')
    } finally {
      setPromotingSlug(null)
    }
  }, [showToast])

  const handleOpenRuns = useCallback(async (item: CatalogItem) => {
    if (!item.state) return
    setSelectedRunsFor(item.slug)
    setRunsLoading(true)
    setRuns([])
    try {
      const r = await fetch(`/api/automations/${item.state.id}/runs?limit=30`, { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setRuns(Array.isArray(d?.runs) ? d.runs : [])
    } catch (e: any) {
      showToast(e?.message || 'Falha ao buscar histórico', 'err')
    } finally {
      setRunsLoading(false)
    }
  }, [showToast])

  /* Stats agregados */
  const stats = {
    total: items.length,
    configured: items.filter(i => i.state).length,
    active: items.filter(i => i.state?.status === 'active').length,
    paused: items.filter(i => i.state?.status === 'paused').length,
    error: items.filter(i => i.state?.status === 'error').length,
  }

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 space-y-6 ${embedded ? 'py-2' : 'py-6'}`}>
      {/* The host hub owns the page title when this manager is embedded. */}
      {!embedded && <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Zap size={18} strokeWidth={2.25} className="text-gray-900" />
            Automações
          </h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            Página principal de gestão — crie, edite e ative automações de qualquer canal.
            Instagram só espelha as que usam a conta conectada.
          </p>
        </div>
        {mainTab === 'catalog' && (
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-[12.5px] font-semibold text-gray-700 transition"
          >
            <RefreshCw size={13} strokeWidth={2.25} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        )}
      </div>}

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setMainTab('defs')}
          className={`px-4 py-2 rounded-lg text-[12px] font-semibold transition ${mainTab === 'defs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          {channel === 'whatsapp' ? 'Fluxos WhatsApp' : 'Todas as automações'}
        </button>
        <button
          type="button"
          onClick={() => setMainTab('catalog')}
          className={`px-4 py-2 rounded-lg text-[12px] font-semibold transition ${mainTab === 'catalog' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          {channel === 'whatsapp' ? 'Modelos WhatsApp' : 'Modelos prontos'}
        </button>
      </div>

      {mainTab === 'defs' ? (
        <AutomationDefinitionsHub channel={channel} />
      ) : (
        <>
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Configuradas', value: stats.configured, color: 'text-gray-900' },
          { label: 'Ativas', value: stats.active, color: 'text-emerald-600' },
          { label: 'Pausadas', value: stats.paused, color: 'text-amber-600' },
          { label: 'Com erro', value: stats.error, color: 'text-rose-600' },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-white border border-gray-200">
            <div className={`text-[22px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-gray-500 mt-1 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-20 grid place-items-center text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Zap size={28} className="mx-auto mb-3 opacity-30" strokeWidth={1.5} />
          <p className="text-[13px]">Nenhum modelo disponível.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-gray-500">
            Modelos prontos viram <strong>automações</strong> na aba “Todas as automações”
            (inativas até você editar e ativar). Não são “tarefas” separadas.
          </p>
          {items.map((item) => (
            <AutomationCard
              key={item.slug}
              item={item}
              isToggling={togglingSlug === item.slug}
              isRunning={runningId === item.state?.id}
              isPromoting={promotingSlug === item.slug}
              onToggle={() => handleToggle(item.slug)}
              onRunNow={() => handleRunNow(item)}
              onOpenRuns={() => handleOpenRuns(item)}
              onPromote={() => handlePromoteToAutomation(item)}
            />
          ))}
        </div>
      )}
        </>
      )}

      {/* Modal de histórico (catálogo) */}
      {mainTab === 'catalog' && selectedRunsFor && (
        <RunsModal
          slug={selectedRunsFor}
          itemName={items.find((i) => i.slug === selectedRunsFor)?.name || ''}
          runs={runs}
          loading={runsLoading}
          onClose={() => { setSelectedRunsFor(null); setRuns([]) }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[12.5px] font-semibold ${
            toast.kind === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toast.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Card de automação individual
   ──────────────────────────────────────────────────────────── */

function AutomationCard({
  item, isToggling, isRunning, isPromoting, onToggle, onRunNow, onOpenRuns, onPromote,
}: {
  item: CatalogItem
  isToggling: boolean
  isRunning: boolean
  isPromoting?: boolean
  onToggle: () => void
  onRunNow: () => void
  onOpenRuns: () => void
  onPromote?: () => void
}) {
  const Icon = ICON_MAP[item.icon || 'Zap'] || Zap
  const palette = CATEGORY_COLOR[item.category] || CATEGORY_COLOR.geral
  const isActive = item.state?.status === 'active'
  const isConfigured = !!item.state
  const isStub = item.is_implemented === false
  const freq = item.state?.frequency || item.default_frequency
  const cron = item.state?.cron_expression || item.default_cron || null
  const freqLabel = humanizeCron(cron, FREQ_LABEL[freq])

  return (
    <article className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-all">
      <div className="flex items-start gap-3">
        {/* Icone */}
        <div className={`shrink-0 w-10 h-10 rounded-lg grid place-items-center ${palette.bg} ring-1 ${palette.ring}`}>
          <Icon size={18} strokeWidth={1.75} className={palette.text} />
        </div>

        {/* Conteudo principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-gray-900 truncate">{item.name}</h3>
            {/* Status pill */}
            {isConfigured ? (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider ${
                isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : item.state?.status === 'error'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {isActive ? <CheckCircle2 size={9} strokeWidth={2.5} /> :
                 item.state?.status === 'error' ? <XCircle size={9} strokeWidth={2.5} /> :
                 <Pause size={9} strokeWidth={2.5} />}
                {isActive ? 'Ativa' : item.state?.status === 'error' ? 'Erro' : 'Pausada'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500">
                Não configurada
              </span>
            )}
            {/* Categoria chip */}
            <span className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${palette.chip}`}>
              {item.category}
            </span>
            {/* Squad badge */}
            {item.is_squad && (
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-900 text-white flex items-center gap-1">
                <Sparkles size={8} strokeWidth={2.5} />
                Squad
              </span>
            )}
            {/* Stub warning */}
            {isStub && (
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                Em breve
              </span>
            )}
          </div>

          <p className="text-[12px] text-gray-600 mt-1 leading-snug line-clamp-2">{item.description}</p>

          {/* Steps do squad — chips minúsculos */}
          {item.is_squad && item.execution_steps && item.execution_steps.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {item.execution_steps.map((step, i) => (
                <span key={i} className="inline-flex items-center text-[9.5px] font-semibold text-gray-500">
                  <span className="px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-100">{step}</span>
                  {i < item.execution_steps!.length - 1 && (
                    <ChevronRight size={9} className="text-gray-300 mx-0.5" strokeWidth={2.5} />
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Stats inline: frequencia, ultima exec, contagens */}
          <div className="mt-3 flex items-center gap-4 flex-wrap text-[10.5px] text-gray-500 font-medium">
            <span className="flex items-center gap-1">
              <Clock size={11} strokeWidth={2} />
              {freqLabel}
            </span>
            {isConfigured && (
              <>
                {item.state?.last_run_at && (
                  <span className="flex items-center gap-1">
                    <History size={11} strokeWidth={2} />
                    Última: {formatRelativeTime(item.state.last_run_at)}
                    {item.state.last_run_duration_ms && (
                      <span className="text-gray-400">({formatDuration(item.state.last_run_duration_ms)})</span>
                    )}
                  </span>
                )}
                {isActive && item.state?.next_run_at && (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <Calendar size={11} strokeWidth={2} />
                    Próxima: {formatRelativeTime(item.state.next_run_at)}
                  </span>
                )}
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-emerald-600">✓ {item.state?.success_count || 0}</span>
                  <span className="text-rose-600">✗ {item.state?.error_count || 0}</span>
                </span>
              </>
            )}
          </div>

          {/* Erro recente */}
          {item.state?.last_error && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-100 text-[11px] text-rose-700 line-clamp-2">
              <span className="font-bold">Último erro:</span> {item.state.last_error}
            </div>
          )}
        </div>

        {/* Acoes */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {onPromote && (
            <button
              type="button"
              onClick={onPromote}
              disabled={!!isPromoting}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-gray-900 text-white text-[11px] font-semibold disabled:opacity-50"
              title="Criar automação a partir deste modelo"
            >
              {isPromoting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Como automação
            </button>
          )}
          <div className="flex items-center gap-1.5">
          {isConfigured && (
            <>
              <button
                onClick={onRunNow}
                disabled={isRunning}
                title="Executar agora"
                className="w-8 h-8 grid place-items-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 transition"
              >
                {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} strokeWidth={2.25} />}
              </button>
              <button
                onClick={onOpenRuns}
                title="Histórico de execuções"
                className="w-8 h-8 grid place-items-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                <History size={13} strokeWidth={2.25} />
              </button>
            </>
          )}
          <button
            onClick={onToggle}
            disabled={isToggling}
            title={isActive ? 'Pausar' : isConfigured ? 'Ativar' : 'Configurar e ativar'}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11.5px] font-bold transition disabled:opacity-40 ${
              isActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-gray-900 text-white hover:bg-black'
            }`}
          >
            {isToggling ? <Loader2 size={12} className="animate-spin" /> :
             isActive ? <Pause size={11} strokeWidth={2.5} /> :
             <Play size={11} strokeWidth={2.5} />}
            {isActive ? 'Ativa' : isConfigured ? 'Ativar' : 'Ativar'}
          </button>
          </div>
        </div>
      </div>
    </article>
  )
}

/* ────────────────────────────────────────────────────────────
   Modal de histórico de execuções
   ──────────────────────────────────────────────────────────── */

function RunsModal({
  slug, itemName, runs, loading, onClose,
}: {
  slug: string
  itemName: string
  runs: RunRecord[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-gray-900 truncate">{itemName}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Histórico de execuções · {slug}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="py-12 grid place-items-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
          ) : runs.length === 0 ? (
            <p className="py-12 text-center text-[12px] text-gray-400">Nenhuma execução registrada ainda.</p>
          ) : runs.map((r) => (
            <div key={r.id} className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider ${
                    r.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                    r.status === 'error' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status === 'success' ? <CheckCircle2 size={9} /> :
                     r.status === 'error' ? <XCircle size={9} /> :
                     <Loader2 size={9} className="animate-spin" />}
                    {r.status}
                  </span>
                  <span className="text-[11px] text-gray-600 font-mono tabular-nums">
                    {new Date(r.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-[10.5px] text-gray-500 tabular-nums">
                  {formatDuration(r.duration_ms)}
                </span>
              </div>
              {r.error_message && (
                <p className="mt-1.5 text-[11px] text-rose-700 line-clamp-2">{r.error_message}</p>
              )}
              {r.result && Object.keys(r.result).length > 0 && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[10.5px] font-semibold text-gray-500 hover:text-gray-700">
                    Ver resultado
                  </summary>
                  <pre className="mt-1.5 text-[10px] bg-white border border-gray-200 rounded-md p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all max-h-40">
                    {JSON.stringify(r.result, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

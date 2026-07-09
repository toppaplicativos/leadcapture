import { useCallback, useEffect, useState } from 'react'
import {
  Zap, Play, Pause, RefreshCw, Loader2, ChevronDown, ChevronUp,
  ExternalLink, History, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react'
import {
  type InstagramAutomationItem,
  IG_TYPE_COLORS,
  IG_TYPE_LABELS,
  formatRelativeTime,
  humanizeCron,
  isInstagramAutomation,
  successRate,
} from '@/lib/instagram/automations'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function InstagramAutomationsTab() {
  const [items, setItems] = useState<InstagramAutomationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/automations', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      const all = Array.isArray(d?.automations) ? d.automations : []
      setItems(all.filter(isInstagramAutomation))
    } catch (e: any) {
      showToast(e?.message || 'Falha ao carregar automacoes', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  const handleToggle = async (slug: string) => {
    setTogglingSlug(slug)
    try {
      const r = await fetch(`/api/automations/${encodeURIComponent(slug)}/toggle`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      showToast(d?.automation?.status === 'active' ? 'Automacao ativada' : 'Automacao pausada')
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Falha ao alterar status', 'err')
    } finally {
      setTogglingSlug(null)
    }
  }

  const handleRun = async (item: InstagramAutomationItem) => {
    if (!item.state?.id) {
      showToast('Ative a automacao antes de executar', 'err')
      return
    }
    setRunningId(item.state.id)
    try {
      const r = await fetch(`/api/automations/${item.state.id}/run`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (d?.run?.status === 'success') showToast('Executada com sucesso')
      else showToast(d?.run?.errorMessage || 'Falha na execucao', 'err')
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Falha ao executar', 'err')
    } finally {
      setRunningId(null)
    }
  }

  const activeCount = items.filter((a) => a.state?.status === 'active').length
  const totalRuns = items.reduce((s, a) => s + Number(a.state?.run_count || 0), 0)
  const totalSuccesses = items.reduce((s, a) => s + Number(a.state?.success_count || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Zap size={18} className="text-purple-500" />
            Automacoes Instagram
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {items.length} automacoes estrategicas — conteudo, engajamento, monitoramento e analise
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{activeCount}</p>
              <p className="text-gray-400">Ativas</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{totalRuns}</p>
              <p className="text-gray-400">Execucoes</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-purple-600">{totalSuccesses}</p>
              <p className="text-gray-400">Sucessos</p>
            </div>
          </div>
          <button onClick={() => void load()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <Zap size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">Nenhuma automacao Instagram no catalogo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isActive = item.state?.status === 'active'
            const rate = successRate(item)
            const schedule = humanizeCron(
              item.state?.cron_expression || item.default_cron || null,
              item.default_frequency,
            )
            const expanded = expandedSlug === item.slug
            return (
              <div key={item.slug} className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4 hover:border-gray-200 transition">
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${IG_TYPE_COLORS[item.task_type] || 'bg-gray-100 text-gray-600'}`}>
                        {IG_TYPE_LABELS[item.task_type] || item.task_type}
                      </span>
                      {!item.is_implemented && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Em breve</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{item.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                      <span className="inline-flex items-center gap-1"><Clock size={10} /> {schedule}</span>
                      {item.state?.last_run_at && <span>Ultima: {formatRelativeTime(item.state.last_run_at)}</span>}
                      {item.state?.next_run_at && isActive && <span className="text-purple-500">Proxima: {formatRelativeTime(item.state.next_run_at)}</span>}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-4 text-xs text-gray-500 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Taxa</p>
                      <p className={rate >= 80 ? 'text-emerald-600 font-bold' : rate >= 50 ? 'text-amber-600 font-bold' : 'text-gray-700 font-bold'}>{rate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Runs</p>
                      <p className="font-bold text-gray-800">{item.state?.run_count || 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <a href="/admin/automacoes" className="p-1.5 rounded-lg hover:bg-gray-100" title="Ver automacoes completas">
                      <ExternalLink size={14} className="text-gray-400" />
                    </a>
                    <button
                      onClick={() => void handleRun(item)}
                      disabled={runningId === item.state?.id}
                      className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                      title="Executar agora"
                    >
                      {runningId === item.state?.id
                        ? <Loader2 size={14} className="animate-spin text-gray-400" />
                        : <Play size={14} className="text-gray-500" />}
                    </button>
                    <button
                      onClick={() => void handleToggle(item.slug)}
                      disabled={togglingSlug === item.slug}
                      className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                      title={isActive ? 'Pausar' : 'Ativar'}
                    >
                      {togglingSlug === item.slug
                        ? <Loader2 size={14} className="animate-spin text-gray-400" />
                        : <Pause size={14} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />}
                    </button>
                    <button
                      onClick={() => setExpandedSlug(expanded ? null : item.slug)}
                      className="p-1.5 rounded-lg hover:bg-gray-100"
                    >
                      {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-2">
                    {item.is_squad && item.execution_steps?.length ? (
                      <p><span className="font-semibold text-gray-700">Pipeline:</span> {item.execution_steps.join(' → ')}</p>
                    ) : null}
                    <p><span className="font-semibold text-gray-700">Status:</span> {item.state?.status || 'nao configurada'}</p>
                    {item.state?.last_error && (
                      <p className="text-red-600"><span className="font-semibold">Ultimo erro:</span> {item.state.last_error}</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => void handleToggle(item.slug)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isActive ? 'bg-gray-100 text-gray-700' : 'bg-purple-500 text-white'}`}
                      >
                        {isActive ? 'Pausar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => void handleRun(item)}
                        disabled={!item.state}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Executar agora
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        Automações avançadas (DM por evento, webhook, publicação automática) em{' '}
        <a href="/admin/automacoes" className="text-purple-500 hover:underline">Automacoes gerais</a>
      </p>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold ${
          toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
import { useEffect, useState, useCallback } from 'react'
import {
  X, Play, Pause, Save, Loader2, Zap, Target, Clock, Settings2, History,
  AlertTriangle, CheckCircle2, RefreshCw,
} from 'lucide-react'
import type { Automacao, AutomacaoInput } from '@/lib/automations/schema'
import { describeTriggerSchedule } from '@/lib/automations/cron-builder'
import { getEventoLabel } from '@/lib/automations/schema'
import { AutomationTriggerEditor } from './AutomationTriggerEditor'
import { ActionPipelineEditor } from './ActionPipelineEditor'
import { fetchAutomationRuns } from '@/lib/automations/definitions-api'

type TabKey = 'geral' | 'gatilho' | 'acoes' | 'limites' | 'historico'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'geral', label: 'Geral' },
  { key: 'gatilho', label: 'Gatilho' },
  { key: 'acoes', label: 'Ações' },
  { key: 'limites', label: 'Limites' },
  { key: 'historico', label: 'Histórico' },
]

type Props = {
  open: boolean
  automacao: Automacao | null
  onClose: () => void
  onSave: (input: AutomacaoInput) => Promise<void>
  onToggle: (id: string, ativa: boolean) => Promise<void>
  onExecute: (id: string) => Promise<void>
  saving?: boolean
  executing?: boolean
}

const labelCls = 'text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1 block'
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10'

export function AutomationDetailModal({
  open,
  automacao,
  onClose,
  onSave,
  onToggle,
  onExecute,
  saving,
  executing,
}: Props) {
  const [tab, setTab] = useState<TabKey>('geral')
  const [draft, setDraft] = useState<AutomacaoInput | null>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!open || !automacao) return
    setDraft({
      nome: automacao.nome,
      descricao: automacao.descricao,
      ativa: automacao.ativa,
      trigger: automacao.trigger,
      pipeline: automacao.pipeline,
      limites: automacao.limites,
    })
    setTab('geral')
    setDirty(false)
  }, [open, automacao])

  const loadRuns = useCallback(async () => {
    if (!automacao) return
    setRunsLoading(true)
    try {
      setRuns(await fetchAutomationRuns(automacao.id))
    } catch {
      setRuns([])
    } finally {
      setRunsLoading(false)
    }
  }, [automacao])

  useEffect(() => {
    if (open && tab === 'historico' && automacao) void loadRuns()
  }, [open, tab, automacao, loadRuns])

  const patch = (partial: Partial<AutomacaoInput>) => {
    setDraft((d) => (d ? { ...d, ...partial } : d))
    setDirty(true)
  }

  if (!open || !automacao || !draft) return null

  const triggerSummary = draft.trigger.tipo === 'agendamento'
    ? describeTriggerSchedule(draft.trigger)
    : draft.trigger.tipo === 'evento'
      ? `${draft.trigger.plataforma} · ${getEventoLabel(draft.trigger.plataforma, draft.trigger.evento)}`
      : '—'

  const statusColors: Record<string, string> = {
    live: 'bg-emerald-100 text-emerald-700',
    pausado: 'bg-amber-100 text-amber-700',
    rascunho: 'bg-gray-100 text-gray-600',
    erro: 'bg-red-100 text-red-700',
  }

  async function handleSave() {
    if (!draft) return
    await onSave(draft)
    setDirty(false)
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[17px] font-bold text-gray-900 truncate">{automacao.nome}</h2>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColors[automacao.status] || statusColors.rascunho}`}>
                  {automacao.status}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{triggerSummary}</p>
            </div>
            <button type="button" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>

          {/* Status bar */}
          <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={executing}
              onClick={() => onExecute(automacao.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold disabled:opacity-50"
            >
              {executing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Executar agora
            </button>
            <button
              type="button"
              onClick={() => onToggle(automacao.id, !automacao.ativa)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-700 hover:bg-gray-50"
            >
              {automacao.ativa ? <Pause size={12} /> : <Play size={12} />}
              {automacao.ativa ? 'Pausar' : 'Ativar'}
            </button>
            <span className="text-[10px] text-gray-400 tabular-nums ml-auto">
              {automacao.metrics.runs} runs · {automacao.metrics.sucessos} ok
            </span>
          </div>

          {automacao.status === 'erro' && automacao.metrics.ultimoErro && (
            <div className="mx-5 mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 text-[11px] text-red-700">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {automacao.metrics.ultimoErro.mensagem}
            </div>
          )}

          {/* Tabs */}
          <div className="px-5 flex gap-1 overflow-x-auto border-t border-gray-50 pt-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition ${
                  tab === t.key ? 'bg-gray-100 text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'geral' && (
            <div className="space-y-4 max-w-xl">
              <label className="block">
                <span className={labelCls}>Nome *</span>
                <input
                  type="text"
                  value={draft.nome}
                  onChange={(e) => patch({ nome: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>Descrição</span>
                <textarea
                  value={draft.descricao || ''}
                  onChange={(e) => patch({ descricao: e.target.value })}
                  rows={3}
                  className={inputCls + ' resize-none'}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={draft.ativa ?? false}
                  onChange={(e) => patch({ ativa: e.target.checked })}
                />
                Automação ativa
              </label>
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl text-xs text-gray-600">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Próxima execução</span>
                  {automacao.metrics.proximaExecucao
                    ? new Date(automacao.metrics.proximaExecucao).toLocaleString('pt-BR')
                    : '—'}
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Última execução</span>
                  {automacao.metrics.ultimaExecucao
                    ? new Date(automacao.metrics.ultimaExecucao).toLocaleString('pt-BR')
                    : '—'}
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Ações</span>
                  {draft.pipeline.length}
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Taxa de sucesso</span>
                  {automacao.metrics.runs > 0
                    ? `${Math.round((automacao.metrics.sucessos / automacao.metrics.runs) * 100)}%`
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {tab === 'gatilho' && (
            <AutomationTriggerEditor
              trigger={draft.trigger}
              onChange={(trigger) => patch({ trigger })}
            />
          )}

          {tab === 'acoes' && (
            <ActionPipelineEditor
              pipeline={draft.pipeline}
              trigger={draft.trigger}
              onChange={(pipeline) => patch({ pipeline })}
            />
          )}

          {tab === 'limites' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              {([
                ['maxPorUsuario', 'Máx. por usuário (0 = ilimitado)'],
                ['cooldownSegundos', 'Cooldown entre disparos (segundos)'],
                ['maxPorHora', 'Máx. por hora (0 = ilimitado)'],
                ['maxPorDia', 'Máx. por dia (0 = ilimitado)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className={labelCls}>{label}</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.limites[key]}
                    onChange={(e) => patch({
                      limites: { ...draft.limites, [key]: parseInt(e.target.value, 10) || 0 },
                    })}
                    className={inputCls}
                  />
                </label>
              ))}
              <div className="sm:col-span-2 p-4 bg-gray-50 rounded-xl space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.limites.janelaFuncionamento?.ativo ?? false}
                    onChange={(e) => patch({
                      limites: {
                        ...draft.limites,
                        janelaFuncionamento: {
                          ativo: e.target.checked,
                          inicioHora: draft.limites.janelaFuncionamento?.inicioHora ?? 8,
                          fimHora: draft.limites.janelaFuncionamento?.fimHora ?? 22,
                          timezone: 'America/Sao_Paulo',
                        },
                      },
                    })}
                  />
                  Janela de funcionamento
                </label>
                {draft.limites.janelaFuncionamento?.ativo && (
                  <div className="flex gap-3">
                    <label className="text-xs text-gray-600">
                      Início (h)
                      <input
                        type="number" min={0} max={23}
                        value={draft.limites.janelaFuncionamento.inicioHora}
                        onChange={(e) => patch({
                          limites: {
                            ...draft.limites,
                            janelaFuncionamento: {
                              ...draft.limites.janelaFuncionamento!,
                              inicioHora: parseInt(e.target.value, 10) || 0,
                            },
                          },
                        })}
                        className="mt-1 w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Fim (h)
                      <input
                        type="number" min={0} max={23}
                        value={draft.limites.janelaFuncionamento.fimHora}
                        onChange={(e) => patch({
                          limites: {
                            ...draft.limites,
                            janelaFuncionamento: {
                              ...draft.limites.janelaFuncionamento!,
                              fimHora: parseInt(e.target.value, 10) || 0,
                            },
                          },
                        })}
                        className="mt-1 w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button type="button" onClick={() => void loadRuns()} className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                  <RefreshCw size={12} className={runsLoading ? 'animate-spin' : ''} /> Atualizar
                </button>
              </div>
              {runsLoading ? (
                <div className="py-12 grid place-items-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Nenhuma execução registrada</p>
              ) : runs.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${
                      r.status === 'success' ? 'text-emerald-600' : r.status === 'error' ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {r.status === 'success' ? <CheckCircle2 size={10} /> : r.status === 'error' ? <AlertTriangle size={10} /> : null}
                      {r.status}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(r.started_at).toLocaleString('pt-BR')}</span>
                  </div>
                  {r.error_message && <p className="text-[11px] text-red-600 mt-1">{r.error_message}</p>}
                  {r.result?.steps && (
                    <p className="text-[10px] text-gray-500 mt-1">{r.result.steps.length} passo(s) no pipeline</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            {tab === 'geral' && <Settings2 size={12} />}
            {tab === 'gatilho' && <Zap size={12} />}
            {tab === 'acoes' && <Target size={12} />}
            {tab === 'limites' && <Clock size={12} />}
            {tab === 'historico' && <History size={12} />}
            {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200">
              Fechar
            </button>
            {tab !== 'historico' && (
              <button
                type="button"
                disabled={saving || !draft.nome.trim()}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
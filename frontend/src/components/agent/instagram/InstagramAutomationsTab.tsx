/**
 * Espelho contextual: automações que usam Instagram.
 * Gestão e criação ficam em /automacoes — esta aba só organiza por canal.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Zap, Play, Pause, RefreshCw, Loader2, ExternalLink,
} from 'lucide-react'
import type { Automacao, AutomacaoInput } from '@/lib/automations/schema'
import {
  fetchAutomationDefinitions,
  toggleAutomationDefinition,
  executeAutomationDefinition,
  updateAutomationDefinition,
} from '@/lib/automations/definitions-api'
import { AutomationDetailModal } from '@/components/automations/AutomationDetailModal'
import { getEventoLabel } from '@/lib/automations/schema'

function getStatusPill(a: Automacao) {
  if (a.ativa && a.status === 'live') return { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' }
  if (a.status === 'erro') return { label: 'Erro', cls: 'bg-red-100 text-red-700' }
  if (a.status === 'pausado' || !a.ativa) return { label: 'Inativa', cls: 'bg-gray-100 text-gray-600' }
  return { label: a.status, cls: 'bg-amber-100 text-amber-800' }
}

export function InstagramAutomationsTab() {
  const [items, setItems] = useState<Automacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<Automacao | null>(null)
  const [detailSaving, setDetailSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchAutomationDefinitions({ platform: 'instagram' })
      setItems(list)
    } catch (e: any) {
      showToast(e?.message || 'Falha ao carregar', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const openId = params.get('open')
    if (!openId || !items.length) return
    const found = items.find((x) => x.id === openId)
    if (found) setDetailFor(found)
  }, [items])

  const activeCount = items.filter((a) => a.ativa).length

  async function handleDetailSave(input: AutomacaoInput) {
    if (!detailFor) return
    setDetailSaving(true)
    try {
      const updated = await updateAutomationDefinition(detailFor.id, input)
      showToast('Salva (mesmo registro da página Automações)')
      setDetailFor(updated)
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar', 'err')
      throw e
    } finally {
      setDetailSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[90] px-4 py-2 rounded-xl text-sm font-medium shadow-lg ${toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.text}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Zap size={18} className="text-purple-500" />
            Automações que usam Instagram
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Espelho organizacional — os mesmos registros da página <strong>Automações</strong>.
            Crie e gerencie o portfólio completo lá.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center px-2">
            <p className="text-lg font-bold text-emerald-600">{activeCount}</p>
            <p className="text-[10px] text-gray-400">Ativas</p>
          </div>
          <a
            href="/automacoes"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black"
          >
            <ExternalLink size={12} /> Gerenciar em Automações
          </a>
          <button type="button" onClick={() => void load()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950">
        Esta aba <strong>não</strong> é o hub de criação. Novas automações, modelos Instagram e conversão de modelos
        prontos ficam em <a href="/automacoes" className="underline font-semibold">Automações</a>.
      </div>

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <Zap size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600">Nenhuma automação Instagram ainda</p>
          <p className="text-xs text-gray-400 mt-1 mb-3">Instale modelos ou crie na página Automações.</p>
          <a
            href="/automacoes"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            Ir para Automações
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => {
            const pill = getStatusPill(a)
            const triggerLabel =
              a.trigger?.tipo === 'evento'
                ? `Instagram · ${getEventoLabel(a.trigger.plataforma, a.trigger.evento)}`
                : a.trigger?.tipo === 'agendamento'
                  ? 'Agendada'
                  : '—'
            return (
              <div
                key={a.id}
                className="bg-white border border-gray-100 rounded-xl p-3 sm:p-4 hover:border-purple-200 transition cursor-pointer"
                onClick={() => setDetailFor(a)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.nome}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
                      {a.seed_key && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">seed</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{triggerLabel}</p>
                    {a.descricao && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={async () => {
                        setBusyId(a.id)
                        try {
                          await toggleAutomationDefinition(a.id, !a.ativa)
                          await load()
                          showToast(!a.ativa ? 'Ativada' : 'Pausada')
                        } catch (e: any) {
                          showToast(e?.message || 'Erro', 'err')
                        } finally {
                          setBusyId(null)
                        }
                      }}
                      className={`p-2 rounded-lg border text-xs ${a.ativa ? 'border-amber-200 text-amber-700' : 'border-emerald-200 text-emerald-700'}`}
                      title={a.ativa ? 'Pausar' : 'Ativar'}
                    >
                      {a.ativa ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={async () => {
                        setBusyId(a.id)
                        try {
                          const r = await executeAutomationDefinition(a.id)
                          showToast(r?.ok ? (r.outcome === 'stub' ? 'Simulado' : 'Executada') : r?.message || 'Falha', r?.ok ? 'ok' : 'err')
                          await load()
                        } catch (e: any) {
                          showToast(e?.message || 'Erro', 'err')
                        } finally {
                          setBusyId(null)
                        }
                      }}
                      className="p-2 rounded-lg border border-gray-200 text-gray-600"
                      title="Executar"
                    >
                      <Zap size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AutomationDetailModal
        open={!!detailFor}
        automacao={detailFor}
        onClose={() => setDetailFor(null)}
        onSave={handleDetailSave}
        saving={detailSaving}
        executing={busyId === detailFor?.id}
        onToggle={async (id, ativa) => {
          await toggleAutomationDefinition(id, ativa)
          await load()
          const fresh = (await fetchAutomationDefinitions({ platform: 'instagram' })).find((x) => x.id === id)
          if (fresh) setDetailFor(fresh)
        }}
        onExecute={async (id) => {
          setBusyId(id)
          try {
            const r = await executeAutomationDefinition(id)
            showToast(r?.ok ? 'Executada' : r?.message || 'Falha', r?.ok ? 'ok' : 'err')
            await load()
            const fresh = (await fetchAutomationDefinitions({ platform: 'instagram' })).find((x) => x.id === id)
            if (fresh) setDetailFor(fresh)
          } catch (e: any) {
            showToast(e?.message || 'Erro', 'err')
          } finally {
            setBusyId(null)
          }
        }}
      />
    </div>
  )
}

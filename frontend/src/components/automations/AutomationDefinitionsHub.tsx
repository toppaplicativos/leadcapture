import { useCallback, useEffect, useState } from 'react'
import {
  Plus, RefreshCw, Zap, Calendar, Activity, Loader2,
} from 'lucide-react'
import type { Automacao, AutomacaoInput, AutomationKpis } from '@/lib/automations/schema'
import {
  fetchAutomationDefinitions,
  fetchAutomationKpis,
  createAutomationDefinition,
  updateAutomationDefinition,
  deleteAutomationDefinition,
  toggleAutomationDefinition,
  duplicateAutomationDefinition,
  executeAutomationDefinition,
} from '@/lib/automations/definitions-api'
import { AutomationCard } from './AutomationCard'
import { AutomationWizard } from './AutomationWizard'
import { AutomationDetailModal } from './AutomationDetailModal'

export function AutomationDefinitionsHub() {
  const [items, setItems] = useState<Automacao[]>([])
  const [kpis, setKpis] = useState<AutomationKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Automacao | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [detailFor, setDetailFor] = useState<Automacao | null>(null)
  const [detailSaving, setDetailSaving] = useState(false)

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, k] = await Promise.all([fetchAutomationDefinitions(), fetchAutomationKpis()])
      setItems(list)
      setKpis(k)
    } catch (e: any) {
      showToast(e?.message || 'Falha ao carregar', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void load() }, [load])

  async function handleSave(input: AutomacaoInput) {
    setSaving(true)
    try {
      if (editTarget) {
        await updateAutomationDefinition(editTarget.id, input)
        showToast('Automação atualizada')
      } else {
        await createAutomationDefinition(input)
        showToast('Automação criada')
      }
      setWizardOpen(false)
      setEditTarget(null)
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function handleDetailSave(input: AutomacaoInput) {
    if (!detailFor) return
    setDetailSaving(true)
    try {
      const updated = await updateAutomationDefinition(detailFor.id, input)
      showToast('Automação salva')
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Minhas automações</h2>
          <p className="text-[12px] text-gray-500">Cada automação tem gatilho, pipeline e limites próprios</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => { setEditTarget(null); setWizardOpen(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            <Plus size={16} /> Nova automação
          </button>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={Zap} label="Total" value={kpis.total} />
          <Kpi icon={Activity} label="Ativas" value={kpis.live} accent="emerald" />
          <Kpi icon={Calendar} label="Agendadas" value={kpis.agendadas} accent="sky" />
          <Kpi icon={Zap} label="Por evento" value={kpis.eventos} accent="violet" />
        </div>
      )}

      {loading && !items.length ? (
        <div className="py-16 grid place-items-center text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-200 rounded-2xl">
          <Zap size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">Nenhuma automação ainda</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Crie automações com gatilhos agendados, periódicos ou por evento — como no Tattoo AI.
          </p>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="mt-4 inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold"
          >
            <Plus size={14} /> Criar primeira automação
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((a) => (
            <AutomationCard
              key={a.id}
              automacao={a}
              onOpen={setDetailFor}
              busy={busyId === a.id}
              onToggle={async (id, ativa) => {
                try {
                  await toggleAutomationDefinition(id, ativa)
                  await load()
                } catch (e: any) {
                  showToast(e?.message || 'Erro', 'err')
                }
              }}
              onEdit={(item) => setDetailFor(item)}
              onDuplicate={async (id) => {
                try {
                  await duplicateAutomationDefinition(id)
                  showToast('Cópia criada')
                  await load()
                } catch (e: any) {
                  showToast(e?.message || 'Erro', 'err')
                }
              }}
              onDelete={async (id) => {
                if (!confirm('Excluir esta automação?')) return
                try {
                  await deleteAutomationDefinition(id)
                  showToast('Excluída')
                  await load()
                } catch (e: any) {
                  showToast(e?.message || 'Erro', 'err')
                }
              }}
              onExecute={async (id) => {
                setBusyId(id)
                try {
                  const r = await executeAutomationDefinition(id)
                  showToast(r?.ok ? 'Executada' : r?.message || 'Falha', r?.ok ? 'ok' : 'err')
                  await load()
                } catch (e: any) {
                  showToast(e?.message || 'Erro', 'err')
                } finally {
                  setBusyId(null)
                }
              }}
              onHistory={(item) => { setDetailFor(item) }}
            />
          ))}
        </div>
      )}

      <AutomationWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditTarget(null) }}
        onSave={handleSave}
        edit={editTarget}
        saving={saving}
      />

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
          const fresh = (await fetchAutomationDefinitions()).find((x) => x.id === id)
          if (fresh) setDetailFor(fresh)
        }}
        onExecute={async (id) => {
          setBusyId(id)
          try {
            const r = await executeAutomationDefinition(id)
            showToast(r?.ok ? 'Executada' : r?.message || 'Falha', r?.ok ? 'ok' : 'err')
            await load()
            const fresh = (await fetchAutomationDefinitions()).find((x) => x.id === id)
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

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Zap; label: string; value: number; accent?: string }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50',
    sky: 'text-sky-600 bg-sky-50',
    violet: 'text-violet-600 bg-violet-50',
  }
  const cls = accent ? colors[accent] : 'text-gray-600 bg-gray-100'
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${cls}`}>
        <Icon size={14} />
      </div>
      <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{label}</p>
    </div>
  )
}
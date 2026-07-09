import { useEffect, useState } from 'react'
import {
  X, Zap, Target, Clock, Save, ChevronRight, ChevronLeft,
} from 'lucide-react'
import type { Automacao, AutomacaoInput } from '@/lib/automations/schema'
import { defaultAutomacaoInput } from '@/lib/automations/schema'
import { AutomationTriggerEditor } from './AutomationTriggerEditor'
import { ActionPipelineEditor } from './ActionPipelineEditor'

const STEPS = [
  { id: 1, label: 'Gatilho', Icon: Zap },
  { id: 2, label: 'Ações', Icon: Target },
  { id: 3, label: 'Limites', Icon: Clock },
  { id: 4, label: 'Revisão', Icon: Save },
]

type Props = {
  open: boolean
  onClose: () => void
  onSave: (input: AutomacaoInput) => Promise<void>
  edit?: Automacao | null
  saving?: boolean
}

export function AutomationWizard({ open, onClose, onSave, edit, saving }: Props) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<AutomacaoInput>(defaultAutomacaoInput())

  useEffect(() => {
    if (!open) return
    if (edit) {
      setData({
        nome: edit.nome,
        descricao: edit.descricao,
        ativa: edit.ativa,
        trigger: edit.trigger,
        pipeline: edit.pipeline,
        limites: edit.limites,
      })
      setStep(1)
    } else {
      setData(defaultAutomacaoInput())
      setStep(1)
    }
  }, [open, edit])

  if (!open) return null

  const canAdvance =
    step === 2 ? data.pipeline.length > 0
    : step === 4 ? data.nome.trim().length > 0
    : true

  async function handleSave() {
    await onSave(data)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">
              {edit ? 'Editar automação' : 'Nova automação'}
            </h2>
            <p className="text-[12px] text-gray-500">Configure gatilho, ações e limites</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-gray-100">
            <X size={16} />
          </button>
        </header>

        <nav className="flex gap-1 px-5 py-3 border-b border-gray-50 overflow-x-auto">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                step === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <s.Icon size={12} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <AutomationTriggerEditor
              trigger={data.trigger}
              onChange={(trigger) => setData((d) => ({ ...d, trigger }))}
            />
          )}

          {step === 2 && (
            <ActionPipelineEditor
              pipeline={data.pipeline}
              trigger={data.trigger}
              onChange={(pipeline) => setData((d) => ({ ...d, pipeline }))}
            />
          )}

          {step === 3 && (
            <div className="grid grid-cols-2 gap-4">
              {([
                ['maxPorUsuario', 'Máx. por usuário (0 = ilimitado)'],
                ['cooldownSegundos', 'Cooldown (segundos)'],
                ['maxPorHora', 'Máx. por hora'],
                ['maxPorDia', 'Máx. por dia'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-xs text-gray-600">
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={data.limites[key]}
                    onChange={(e) => setData((d) => ({
                      ...d,
                      limites: { ...d.limites, [key]: parseInt(e.target.value, 10) || 0 },
                    }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Nome da automação *
                <input
                  type="text"
                  value={data.nome}
                  onChange={(e) => setData((d) => ({ ...d, nome: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                  placeholder="Ex: Boas-vindas novos seguidores"
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Descrição
                <textarea
                  value={data.descricao || ''}
                  onChange={(e) => setData((d) => ({ ...d, descricao: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.ativa ?? true}
                  onChange={(e) => setData((d) => ({ ...d, ativa: e.target.checked }))}
                />
                Ativar ao salvar
              </label>
              <div className="p-4 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1">
                <p><strong>Gatilho:</strong> {data.trigger.tipo === 'agendamento' ? `Agendamento (${data.trigger.frequencia})` : `Evento ${data.trigger.plataforma}`}</p>
                <p><strong>Ações:</strong> {data.pipeline.length}</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            disabled={step <= 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
          {step < 4 ? (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 px-5 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white disabled:opacity-40"
            >
              Próximo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canAdvance || saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-5 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white disabled:opacity-40"
            >
              {saving ? 'Salvando...' : edit ? 'Salvar alterações' : 'Criar automação'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
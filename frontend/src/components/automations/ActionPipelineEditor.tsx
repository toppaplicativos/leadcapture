import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import type {
  AcaoPipeline, AcaoConfig, TipoAcao, AutomationTrigger, Plataforma,
} from '@/lib/automations/schema'
import {
  ACOES_POR_PLATAFORMA, getAcaoLabel, actionUsesMessageBlocks,
  allowedStepTypesForAction, ensureAcaoSteps, normalizeAcaoConfig, newMensagemStepId,
} from '@/lib/automations/schema'
import { MessagePipelineComposer } from './MessagePipelineComposer'

type Props = {
  pipeline: AcaoPipeline[]
  trigger: AutomationTrigger
  onChange: (pipeline: AcaoPipeline[]) => void
}

function defaultActionForTrigger(trigger: AutomationTrigger): TipoAcao {
  if (trigger.tipo === 'evento') {
    return ACOES_POR_PLATAFORMA[trigger.plataforma][0]?.id || 'notificar_equipe'
  }
  return 'publicar_conteudo'
}

function actionsForTrigger(trigger: AutomationTrigger) {
  if (trigger.tipo === 'evento') return ACOES_POR_PLATAFORMA[trigger.plataforma]
  const all = Object.values(ACOES_POR_PLATAFORMA).flat()
  return all.filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
}

export function ActionPipelineEditor({ pipeline, trigger, onChange }: Props) {
  const [openActions, setOpenActions] = useState<Record<number, boolean>>({})

  const addAction = () => {
    const tipo = defaultActionForTrigger(trigger)
    const config: AcaoConfig = actionUsesMessageBlocks(tipo)
      ? { mensagemSteps: [{ id: newMensagemStepId(), tipo: 'texto', caption: '', delaySegundos: 0 }] }
      : tipo === 'publicar_conteudo'
        ? { contentPublishing: { format: 'single_image', approvalMode: 'manual_review' } }
        : tipo === 'enviar_email'
          ? { emailSubject: '', emailBody: '' }
          : {}
    onChange([...pipeline, { ordem: pipeline.length, tipo, config }])
    setOpenActions((p) => ({ ...p, [pipeline.length]: true }))
  }

  const updateAction = (index: number, patch: Partial<AcaoPipeline>) => {
    onChange(pipeline.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  const updateConfig = (index: number, config: AcaoConfig) => {
    updateAction(index, { config: normalizeAcaoConfig(config) })
  }

  const removeAction = (index: number) => {
    onChange(pipeline.filter((_, i) => i !== index).map((a, i) => ({ ...a, ordem: i })))
  }

  const moveAction = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= pipeline.length) return
    const next = [...pipeline]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next.map((a, i) => ({ ...a, ordem: i })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Ações em sequência</p>
          <p className="text-[11px] text-gray-400">Cada ação pode ter mensagem composta em blocos</p>
        </div>
        <button
          type="button"
          onClick={addAction}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold"
        >
          <Plus size={12} /> Ação
        </button>
      </div>

      {pipeline.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">
          Adicione pelo menos uma ação ao pipeline
        </p>
      )}

      {pipeline.map((acao, index) => {
        const isOpen = openActions[index] !== false
        const config = normalizeAcaoConfig(acao.config || {})
        const usesBlocks = actionUsesMessageBlocks(acao.tipo)

        return (
          <div key={index} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/80">
              <GripVertical size={14} className="text-gray-300" />
              <span className="text-[10px] font-bold text-gray-400">#{index + 1}</span>
              <select
                value={acao.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as TipoAcao
                  const nextConfig: AcaoConfig = actionUsesMessageBlocks(tipo)
                    ? { mensagemSteps: [{ id: newMensagemStepId(), tipo: 'texto', caption: '', delaySegundos: 0 }] }
                    : {}
                  updateAction(index, { tipo, config: nextConfig })
                }}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                {actionsForTrigger(trigger).map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => moveAction(index, -1)} disabled={index === 0} className="p-1 text-gray-400 disabled:opacity-30">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => moveAction(index, 1)} disabled={index === pipeline.length - 1} className="p-1 text-gray-400 disabled:opacity-30">
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => setOpenActions((p) => ({ ...p, [index]: !isOpen }))} className="p-1 text-gray-500">
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button type="button" onClick={() => removeAction(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} />
              </button>
            </div>

            {isOpen && (
              <div className="p-3 space-y-3 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500">{getAcaoLabel(acao.tipo)}</p>

                <label className="block text-[10px] text-gray-500">
                  Atraso antes desta ação (segundos)
                  <input
                    type="number"
                    min={0}
                    max={86400}
                    value={config.delaySegundos ?? 0}
                    onChange={(e) => updateConfig(index, { ...config, delaySegundos: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </label>

                {usesBlocks && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!config.iaGenerated}
                        onChange={(e) => updateConfig(index, { ...config, iaGenerated: e.target.checked })}
                      />
                      Gerar mensagem com IA (ação inteira)
                    </label>
                    {config.iaGenerated && (
                      <textarea
                        value={config.iaPrompt || ''}
                        onChange={(e) => updateConfig(index, { ...config, iaPrompt: e.target.value })}
                        rows={2}
                        placeholder="Prompt global da ação…"
                        className="w-full border border-violet-100 bg-violet-50/40 rounded-lg px-3 py-2 text-xs resize-none"
                      />
                    )}
                    <MessagePipelineComposer
                      steps={ensureAcaoSteps(config)}
                      onChange={(mensagemSteps) => updateConfig(index, { ...config, mensagemSteps })}
                      allowedTipos={allowedStepTypesForAction(acao.tipo)}
                      variableHints="{nome}, {username}, {telefone}"
                    />
                  </>
                )}

                {acao.tipo === 'publicar_conteudo' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[10px] text-gray-500">
                      Formato
                      <select
                        value={config.contentPublishing?.format || 'single_image'}
                        onChange={(e) => updateConfig(index, {
                          ...config,
                          contentPublishing: {
                            ...config.contentPublishing,
                            format: e.target.value as 'single_image' | 'carousel' | 'story' | 'reel',
                          },
                        })}
                        className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                      >
                        <option value="single_image">Post imagem</option>
                        <option value="carousel">Carrossel</option>
                        <option value="story">Story</option>
                        <option value="reel">Reels</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-gray-500">
                      Aprovação
                      <select
                        value={config.contentPublishing?.approvalMode || 'manual_review'}
                        onChange={(e) => updateConfig(index, {
                          ...config,
                          contentPublishing: {
                            ...config.contentPublishing,
                            approvalMode: e.target.value as 'auto_publish' | 'manual_review',
                          },
                        })}
                        className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                      >
                        <option value="manual_review">Revisar antes</option>
                        <option value="auto_publish">Publicar automaticamente</option>
                      </select>
                    </label>
                    <label className="col-span-2 text-[10px] text-gray-500">
                      Legenda (opcional)
                      <textarea
                        value={config.contentPublishing?.captionOverride || ''}
                        onChange={(e) => updateConfig(index, {
                          ...config,
                          contentPublishing: { ...config.contentPublishing, captionOverride: e.target.value },
                        })}
                        rows={2}
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                      />
                    </label>
                  </div>
                )}

                {acao.tipo === 'enviar_email' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={config.emailSubject || ''}
                      onChange={(e) => updateConfig(index, { ...config, emailSubject: e.target.value })}
                      placeholder="Assunto do e-mail"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <textarea
                      value={config.emailBody || ''}
                      onChange={(e) => updateConfig(index, { ...config, emailBody: e.target.value })}
                      rows={4}
                      placeholder="Corpo do e-mail…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
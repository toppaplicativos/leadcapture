import { useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  MessageCircle, Camera, Mail, Megaphone, Bell,
} from 'lucide-react'
import type {
  AcaoPipeline, AcaoConfig, TipoAcao, AutomationTrigger,
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

const ACTION_ICONS: Partial<Record<TipoAcao, typeof MessageCircle>> = {
  enviar_dm_wa: MessageCircle,
  enviar_dm_ig: Camera,
  comentar_ig: Camera,
  publicar_conteudo: Megaphone,
  enviar_email: Mail,
  notificar_equipe: Bell,
}

const ACTION_DESC: Partial<Record<TipoAcao, string>> = {
  enviar_dm_wa: 'WhatsApp — blocos ricos (botões, enquete, lista)',
  enviar_dm_ig: 'Instagram DM — texto, mídia e link',
  comentar_ig: 'Resposta pública em comentário',
  publicar_conteudo: 'Publicar post / story / reel',
  enviar_email: 'E-mail com assunto e corpo',
  notificar_equipe: 'Aviso interno para a equipe',
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

function defaultConfig(tipo: TipoAcao): AcaoConfig {
  if (actionUsesMessageBlocks(tipo)) {
    return { mensagemSteps: [{ id: newMensagemStepId(), tipo: 'texto', caption: '', delaySegundos: 0 }] }
  }
  if (tipo === 'publicar_conteudo') {
    return { contentPublishing: { format: 'single_image', approvalMode: 'manual_review' } }
  }
  if (tipo === 'enviar_email') return { emailSubject: '', emailBody: '' }
  return {}
}

export function ActionPipelineEditor({ pipeline, trigger, onChange }: Props) {
  const [openActions, setOpenActions] = useState<Record<number, boolean>>({})
  const [pickingFor, setPickingFor] = useState<number | 'new' | null>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const actionRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (focusIndex == null) return
    requestAnimationFrame(() => {
      actionRefs.current[focusIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [focusIndex, pipeline.length])

  const available = actionsForTrigger(trigger)

  const addAction = (tipo?: TipoAcao) => {
    const t = tipo || defaultActionForTrigger(trigger)
    const nextIndex = pipeline.length
    onChange([...pipeline, { ordem: nextIndex, tipo: t, config: defaultConfig(t) }])
    setOpenActions((p) => ({ ...p, [nextIndex]: true }))
    setFocusIndex(nextIndex)
    setPickingFor(null)
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

  const setTipo = (index: number, tipo: TipoAcao) => {
    updateAction(index, { tipo, config: defaultConfig(tipo) })
    setPickingFor(null)
    setFocusIndex(index)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Pipeline de ações</p>
          <p className="text-[11px] text-gray-400">
            Sequência executada na ordem. Cada ação tem blocos de mensagem configuráveis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickingFor(pickingFor === 'new' ? null : 'new')}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shrink-0"
        >
          <Plus size={12} /> Ação
        </button>
      </div>

      {pickingFor === 'new' && (
        <ActionTypeCards
          options={available}
          selected={null}
          onPick={(tipo) => addAction(tipo)}
        />
      )}

      {pipeline.length === 0 && pickingFor !== 'new' && (
        <button
          type="button"
          onClick={() => setPickingFor('new')}
          className="w-full py-10 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600"
        >
          Adicione a primeira ação do pipeline
        </button>
      )}

      {pipeline.map((acao, index) => {
        const isOpen = openActions[index] !== false
        const config = normalizeAcaoConfig(acao.config || {})
        const usesBlocks = actionUsesMessageBlocks(acao.tipo)
        const Icon = ACTION_ICONS[acao.tipo] || Megaphone

        return (
          <div
            key={index}
            ref={(el) => { actionRefs.current[index] = el }}
            className={`border rounded-xl bg-white overflow-hidden transition ${
              focusIndex === index ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/80">
              <GripVertical size={14} className="text-gray-300" />
              <span className="text-[10px] font-bold text-gray-400">#{index + 1}</span>
              <Icon size={14} className="text-violet-500 shrink-0" />
              <button
                type="button"
                onClick={() => setPickingFor(pickingFor === index ? null : index)}
                className="flex-1 text-left min-w-0"
              >
                <span className="text-sm font-semibold text-gray-900 block truncate">
                  {getAcaoLabel(acao.tipo)}
                </span>
                <span className="text-[10px] text-gray-400 truncate block">
                  {ACTION_DESC[acao.tipo] || 'Toque para trocar o tipo'}
                </span>
              </button>
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

            {pickingFor === index && (
              <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                <ActionTypeCards
                  options={available}
                  selected={acao.tipo}
                  onPick={(tipo) => setTipo(index, tipo)}
                />
              </div>
            )}

            {isOpen && (
              <div className="p-3 space-y-3 border-t border-gray-100">
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
                    <div>
                      <p className="text-[11px] font-semibold text-gray-600 mb-2">Blocos da mensagem</p>
                      <MessagePipelineComposer
                        steps={ensureAcaoSteps(config)}
                        onChange={(mensagemSteps) => updateConfig(index, { ...config, mensagemSteps })}
                        allowedTipos={allowedStepTypesForAction(acao.tipo)}
                        variableHints="{nome}, {username}, {telefone}"
                      />
                    </div>
                  </>
                )}

                {acao.tipo === 'publicar_conteudo' && (
                  <PublishCards config={config} onChange={(c) => updateConfig(index, c)} />
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

      <div ref={bottomRef} className="h-2" aria-hidden />
    </div>
  )
}

function ActionTypeCards({
  options,
  selected,
  onPick,
}: {
  options: Array<{ id: TipoAcao; label: string }>
  selected: TipoAcao | null
  onPick: (tipo: TipoAcao) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((a) => {
        const Icon = ACTION_ICONS[a.id] || Megaphone
        const active = selected === a.id
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onPick(a.id)}
            className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition ${
              active ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300 bg-white'
            }`}
          >
            <Icon size={18} className="text-violet-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-gray-900">{a.label}</div>
              <div className="text-[10px] text-gray-400 leading-snug mt-0.5">
                {ACTION_DESC[a.id] || a.id}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PublishCards({
  config,
  onChange,
}: {
  config: AcaoConfig
  onChange: (c: AcaoConfig) => void
}) {
  const formats = [
    { id: 'single_image' as const, label: 'Post imagem' },
    { id: 'carousel' as const, label: 'Carrossel' },
    { id: 'story' as const, label: 'Story' },
    { id: 'reel' as const, label: 'Reels' },
  ]
  const approvals = [
    { id: 'manual_review' as const, label: 'Revisar antes' },
    { id: 'auto_publish' as const, label: 'Publicar auto' },
  ]
  const fmt = config.contentPublishing?.format || 'single_image'
  const appr = config.contentPublishing?.approvalMode || 'manual_review'

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Formato</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({
                ...config,
                contentPublishing: { ...config.contentPublishing, format: f.id },
              })}
              className={`px-2 py-2.5 rounded-xl border-2 text-[11px] font-semibold ${
                fmt === f.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Aprovação</p>
        <div className="grid grid-cols-2 gap-2">
          {approvals.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange({
                ...config,
                contentPublishing: { ...config.contentPublishing, approvalMode: a.id },
              })}
              className={`px-2 py-2.5 rounded-xl border-2 text-[11px] font-semibold ${
                appr === a.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-[10px] text-gray-500">
        Legenda (opcional)
        <textarea
          value={config.contentPublishing?.captionOverride || ''}
          onChange={(e) => onChange({
            ...config,
            contentPublishing: { ...config.contentPublishing, captionOverride: e.target.value },
          })}
          rows={2}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
        />
      </label>
    </div>
  )
}

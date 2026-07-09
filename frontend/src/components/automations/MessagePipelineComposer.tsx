import { useState } from 'react'
import {
  Plus, Trash2, GripVertical, Type, Image as ImageIcon, Film, Mic, FileText,
  Link2, MousePointerClick, LayoutList, ChevronDown, ChevronUp, Sparkles, Images,
} from 'lucide-react'
import type { MensagemStep, MensagemStepTipo } from '@/lib/automations/schema'
import { MENSAGEM_STEP_LABELS, newMensagemStepId } from '@/lib/automations/schema'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'

const STEP_META: Record<MensagemStepTipo, { icon: typeof Type; desc: string }> = {
  texto: { icon: Type, desc: 'Mensagem de texto' },
  imagem: { icon: ImageIcon, desc: 'Foto ou sticker' },
  video: { icon: Film, desc: 'MP4 ou MOV' },
  audio: { icon: Mic, desc: 'Áudio ou nota de voz' },
  documento: { icon: FileText, desc: 'PDF, DOC…' },
  link: { icon: Link2, desc: 'URL clicável' },
  cta: { icon: MousePointerClick, desc: 'Botão com link' },
  botoes: { icon: LayoutList, desc: 'Até 3 botões de resposta' },
  lista: { icon: LayoutList, desc: 'Menu com opções' },
}

type Props = {
  steps: MensagemStep[]
  onChange: (steps: MensagemStep[]) => void
  allowedTipos: MensagemStepTipo[]
  variableHints?: string
  compact?: boolean
}

function defaultFields(tipo: MensagemStepTipo): Partial<MensagemStep> {
  if (tipo === 'cta') return { ctaLabel: 'Saiba mais', url: '' }
  if (tipo === 'botoes') return { buttons: [{ id: 'btn_1', label: 'Opção 1' }], caption: 'Escolha:' }
  if (tipo === 'lista') {
    return {
      listButtonText: 'Ver opções',
      listSections: [{ title: 'Opções', rows: [{ id: 'row_1', title: 'Item 1' }] }],
      caption: 'Selecione:',
    }
  }
  return {}
}

export function MessagePipelineComposer({ steps, onChange, allowedTipos, variableHints, compact }: Props) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [galleryFor, setGalleryFor] = useState<string | null>(null)

  const toggleOpen = (id: string) => setOpenIds((p) => ({ ...p, [id]: !p[id] }))

  const updateStep = (id: string, patch: Partial<MensagemStep>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStep = (id: string) => onChange(steps.filter((s) => s.id !== id))

  const addStep = (tipo: MensagemStepTipo) => {
    const step: MensagemStep = {
      id: newMensagemStepId(),
      tipo,
      source: 'url',
      delaySegundos: 0,
      ...defaultFields(tipo),
    }
    onChange([...steps, step])
    setOpenIds((p) => ({ ...p, [step.id]: true }))
    setAddOpen(false)
  }

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  const onGalleryPick = (item: GalleryItem) => {
    if (!galleryFor) return
    updateStep(galleryFor, {
      url: item.url,
      assetId: item.id,
      source: 'gallery',
      fileName: item.name,
    })
    setGalleryFor(null)
  }

  return (
    <div className={`space-y-2 ${compact ? '' : 'p-3 bg-gray-50 rounded-xl border border-gray-100'}`}>
      {variableHints && (
        <p className="text-[10px] text-gray-400">
          Variáveis: {variableHints}
        </p>
      )}

      {steps.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">Monte a mensagem em blocos — texto, mídia, botões…</p>
      )}

      {steps.map((step, index) => {
        const meta = STEP_META[step.tipo]
        const Icon = meta.icon
        const isOpen = openIds[step.id] !== false
        const preview = step.caption?.slice(0, 60) || step.url?.slice(0, 40) || meta.desc

        return (
          <div key={step.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <span className="text-[10px] font-bold text-gray-400 tabular-nums w-5">{index + 1}</span>
              <Icon size={14} className="text-violet-500 shrink-0" />
              <button
                type="button"
                onClick={() => toggleOpen(step.id)}
                className="flex-1 text-left min-w-0"
              >
                <span className="text-xs font-semibold text-gray-800">{MENSAGEM_STEP_LABELS[step.tipo]}</span>
                {!isOpen && <span className="block text-[10px] text-gray-400 truncate">{preview}</span>}
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="p-1 text-gray-400 disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="p-1 text-gray-400 disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
                <button type="button" onClick={() => removeStep(step.id)} className="p-1 text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                {(step.tipo === 'texto' || step.tipo === 'botoes' || step.tipo === 'lista') && (
                  <textarea
                    value={step.caption || ''}
                    onChange={(e) => updateStep(step.id, { caption: e.target.value })}
                    rows={3}
                    placeholder="Texto da mensagem… Use {nome}, {username}"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                )}

                {(step.tipo === 'imagem' || step.tipo === 'video' || step.tipo === 'audio' || step.tipo === 'documento') && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={step.url || ''}
                        onChange={(e) => updateStep(step.id, { url: e.target.value, source: 'url' })}
                        placeholder="URL da mídia"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setGalleryFor(step.id)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-gray-200 text-[10px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        <Images size={12} /> Galeria
                      </button>
                    </div>
                    {step.url && (step.tipo === 'imagem' || step.tipo === 'video') && (
                      <div className="rounded-lg overflow-hidden border border-gray-100 max-h-32">
                        {step.tipo === 'video' ? (
                          <video src={step.url} className="w-full max-h-32 object-cover" muted playsInline />
                        ) : (
                          <img src={step.url} alt="" className="w-full max-h-32 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(step.tipo === 'link' || step.tipo === 'cta') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="url"
                      value={step.url || ''}
                      onChange={(e) => updateStep(step.id, { url: e.target.value })}
                      placeholder="https://…"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs"
                    />
                    {step.tipo === 'cta' && (
                      <input
                        type="text"
                        value={step.ctaLabel || ''}
                        onChange={(e) => updateStep(step.id, { ctaLabel: e.target.value })}
                        placeholder="Rótulo do botão"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-xs"
                      />
                    )}
                  </div>
                )}

                {step.tipo === 'botoes' && (
                  <div className="space-y-1.5">
                    {(step.buttons || []).map((btn, bi) => (
                      <div key={btn.id} className="flex gap-2">
                        <input
                          type="text"
                          value={btn.label}
                          onChange={(e) => {
                            const buttons = [...(step.buttons || [])]
                            buttons[bi] = { ...btn, label: e.target.value }
                            updateStep(step.id, { buttons })
                          }}
                          placeholder={`Botão ${bi + 1}`}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => updateStep(step.id, { buttons: (step.buttons || []).filter((_, i) => i !== bi) })}
                          className="p-1.5 text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {(step.buttons?.length || 0) < 3 && (
                      <button
                        type="button"
                        onClick={() => updateStep(step.id, {
                          buttons: [...(step.buttons || []), { id: `btn_${Date.now()}`, label: 'Nova opção' }],
                        })}
                        className="text-[10px] font-semibold text-violet-600"
                      >
                        + Botão
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={!!step.iaEnabled}
                      onChange={(e) => updateStep(step.id, { iaEnabled: e.target.checked })}
                      className="rounded"
                    />
                    <Sparkles size={10} /> IA neste bloco
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    Delay
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={step.delaySegundos ?? 0}
                      onChange={(e) => updateStep(step.id, { delaySegundos: parseInt(e.target.value, 10) || 0 })}
                      className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                    />
                    s
                  </label>
                </div>

                {step.iaEnabled && (
                  <textarea
                    value={step.iaPrompt || ''}
                    onChange={(e) => updateStep(step.id, { iaPrompt: e.target.value })}
                    rows={2}
                    placeholder="Instrução para a IA gerar este bloco…"
                    className="w-full border border-violet-100 bg-violet-50/50 rounded-lg px-3 py-2 text-xs resize-none"
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-300 hover:bg-white transition"
        >
          <Plus size={14} /> Adicionar bloco
        </button>
        {addOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {allowedTipos.map((tipo) => {
              const Meta = STEP_META[tipo]
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => addStep(tipo)}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left"
                >
                  <Meta.icon size={14} className="text-gray-500 shrink-0" />
                  <span className="text-[11px] font-medium text-gray-700">{MENSAGEM_STEP_LABELS[tipo]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <MediaPickerModal
        open={!!galleryFor}
        onClose={() => setGalleryFor(null)}
        onSelect={onGalleryPick}
        title="Escolher mídia para o bloco"
        accept={['image', 'video']}
      />
    </div>
  )
}
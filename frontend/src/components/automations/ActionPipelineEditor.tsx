import { useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  MessageCircle, Camera, Mail, Megaphone, Bell,
  MapPin, Loader2, X, UserPlus, Accessibility, Users, BrainCircuit, CheckCircle2,
} from 'lucide-react'
import type {
  AcaoPipeline, AcaoConfig, TipoAcao, AutomationTrigger,
} from '@/lib/automations/schema'
import {
  ACOES_POR_PLATAFORMA, getAcaoLabel, actionUsesMessageBlocks,
  allowedStepTypesForAction, ensureAcaoSteps, normalizeAcaoConfig, newMensagemStepId,
} from '@/lib/automations/schema'
import { MessagePipelineComposer } from './MessagePipelineComposer'
import { instagramApi } from '@/lib/instagram/pageApi'
import { getCachedActiveBrand } from '@/lib/brand-splash'

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
  const activeBrand = getCachedActiveBrand()

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
      <div className="rounded-[18px] border border-gray-200 bg-gray-50 p-4">
        <p className="text-[11px] font-semibold text-gray-500">Destino desta automação</p>
        <p className="mt-1 text-sm font-semibold text-gray-900">
          {trigger.tipo === 'evento' ? 'A pessoa que disparou o evento' : 'Definido em cada ação abaixo'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {trigger.tipo === 'evento'
            ? 'As ações usam automaticamente o contato associado ao gatilho.'
            : 'Como não existe um evento com contato, escolha o público ou destinatário em cada ação de envio.'}
        </p>
      </div>
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
                {trigger.tipo === 'agendamento' && ['enviar_dm_wa', 'enviar_dm_ig', 'enviar_email'].includes(acao.tipo) && (
                  <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <label className="text-[10px] font-semibold text-gray-600">
                      Enviar para
                      <select value={config.destinoTipo || 'todos_leads'} onChange={(e) => updateConfig(index, { ...config, destinoTipo: e.target.value as AcaoConfig['destinoTipo'], destinoValor: '' })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm">
                        <option value="todos_leads">Todos os leads elegíveis</option>
                        <option value="segmento">Segmento ou tag</option>
                        <option value="contato">Contato específico</option>
                        <option value="equipe">Equipe interna</option>
                      </select>
                    </label>
                    {config.destinoTipo && !['todos_leads', 'equipe'].includes(config.destinoTipo) && (
                      <label className="text-[10px] font-semibold text-gray-600">
                        {config.destinoTipo === 'segmento' ? 'Nome da tag ou segmento' : 'Telefone, @usuário ou e-mail'}
                        <input value={config.destinoValor || ''} onChange={(e) => updateConfig(index, { ...config, destinoValor: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" placeholder={config.destinoTipo === 'segmento' ? 'Ex.: clientes ativos' : 'Identificação do contato'} />
                      </label>
                    )}
                  </div>
                )}
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
                    <div className="rounded-xl border border-gray-200 bg-gray-50/70 overflow-hidden">
                      <label className="min-h-12 px-3 flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
                        <input type="checkbox" checked={!!config.iaGenerated} onChange={(e) => updateConfig(index, { ...config, iaGenerated: e.target.checked, iaContextSources: e.target.checked ? (config.iaContextSources?.length ? config.iaContextSources : ['marca', 'lead', 'produto']) : config.iaContextSources })} />
                        <BrainCircuit size={15} className="text-brand" /> Adaptar esta ação com IA
                        {config.iaGenerated && <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 size={11} /> Contexto ativo</span>}
                      </label>
                      {config.iaGenerated && <div className="border-t border-gray-200 p-3 space-y-3">
                        <div><p className="text-[11px] font-semibold text-gray-800">Fontes de contexto</p><p className="text-[10px] text-gray-500">A IA combina somente as fontes selecionadas antes de montar cada mensagem.</p></div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                          {([['marca', activeBrand.name || 'Marca ativa'], ['lead', 'Lead'], ['afiliado', 'Afiliado'], ['produto', 'Produto'], ['historico', 'Histórico']] as const).map(([source, label]) => {
                            const selected = (config.iaContextSources || []).includes(source)
                            return <button key={source} type="button" aria-pressed={selected} onClick={() => { const cur = config.iaContextSources || []; updateConfig(index, { ...config, iaContextSources: selected ? cur.filter(v => v !== source) : [...cur, source] }) }} className={`min-h-10 rounded-xl border px-2 text-[10px] font-semibold ${selected ? 'border-brand bg-brand-light text-brand' : 'border-gray-200 bg-white text-gray-600'}`}>{label}</button>
                          })}
                        </div>
                      </div>}
                    </div>
                    {config.iaGenerated && (
                      <textarea
                        value={config.iaPrompt || ''}
                        onChange={(e) => updateConfig(index, { ...config, iaPrompt: e.target.value })}
                        rows={2}
                        placeholder="Instrução complementar — ex.: priorize a objeção do lead e a proposta de valor da marca…"
                        className="w-full border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-xs resize-none"
                      />
                    )}
                    <div>
                      <p className="text-[11px] font-semibold text-gray-600 mb-2">Blocos da mensagem</p>
                      <MessagePipelineComposer
                        steps={ensureAcaoSteps(config)}
                        onChange={(mensagemSteps) => updateConfig(index, { ...config, mensagemSteps })}
                        allowedTipos={allowedStepTypesForAction(acao.tipo)}
                        variableHints="Clique em uma tag dentro de cada bloco para inserir."
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
  const cp = config.contentPublishing || {}
  const fmt = cp.format || 'single_image'
  const appr = cp.approvalMode || 'manual_review'
  const isFeedPost = fmt === 'single_image' || fmt === 'carousel'
  const isStory = fmt === 'story'
  const isReel = fmt === 'reel'

  const [locQuery, setLocQuery] = useState(cp.locationName || '')
  const [locHits, setLocHits] = useState<Array<{ id: string; name: string; address?: string }>>([])
  const [locLoading, setLocLoading] = useState(false)
  const [userDraft, setUserDraft] = useState('')
  const [collabDraft, setCollabDraft] = useState('')
  const locTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocQuery(cp.locationName || '')
  }, [cp.locationName, cp.locationId])

  useEffect(() => {
    if (!(isFeedPost || isReel)) return
    const q = locQuery.trim()
    if (q.length < 2 || (cp.locationId && q === (cp.locationName || ''))) {
      setLocHits([])
      return
    }
    if (locTimer.current) clearTimeout(locTimer.current)
    locTimer.current = setTimeout(async () => {
      setLocLoading(true)
      try {
        const res = await instagramApi(`/location-search?q=${encodeURIComponent(q)}`)
        setLocHits(Array.isArray(res?.locations) ? res.locations : [])
      } catch {
        setLocHits([])
      } finally {
        setLocLoading(false)
      }
    }, 350)
    return () => {
      if (locTimer.current) clearTimeout(locTimer.current)
    }
  }, [locQuery, cp.locationId, cp.locationName, isFeedPost, isReel])

  const patchCp = (patch: Partial<NonNullable<AcaoConfig['contentPublishing']>>) =>
    onChange({
      ...config,
      contentPublishing: { ...cp, ...patch },
    })

  const userTagList = String(cp.userTags || '')
    .split(/[,;\s]+/)
    .map((u) => u.replace(/^@/, '').trim())
    .filter(Boolean)

  const collabList = String(cp.collaborators || '')
    .split(/[,;\s]+/)
    .map((u) => u.replace(/^@/, '').trim())
    .filter(Boolean)

  const addUserTag = () => {
    const u = userDraft.replace(/^@/, '').trim()
    if (!u) return
    if (userTagList.some((x) => x.toLowerCase() === u.toLowerCase())) {
      setUserDraft('')
      return
    }
    patchCp({ userTags: [...userTagList, u].map((x) => `@${x}`).join(', ') })
    setUserDraft('')
  }

  const addCollab = () => {
    const u = collabDraft.replace(/^@/, '').trim()
    if (!u || collabList.length >= 3) return
    if (collabList.some((x) => x.toLowerCase() === u.toLowerCase())) {
      setCollabDraft('')
      return
    }
    patchCp({ collaborators: [...collabList, u].map((x) => `@${x}`).join(', ') })
    setCollabDraft('')
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Formato</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => patchCp({ format: f.id })}
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
              onClick={() => patchCp({ approvalMode: a.id })}
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
          value={cp.captionOverride || ''}
          onChange={(e) => patchCp({ captionOverride: e.target.value })}
          rows={2}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
        />
      </label>
      <label className="block text-[10px] text-gray-500">
        URL da mídia (opcional — enfileira rascunho no Instagram)
        <input
          type="url"
          value={cp.mediaUrl || ''}
          onChange={(e) => patchCp({ mediaUrl: e.target.value })}
          placeholder="https://…/imagem.jpg"
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </label>

      {/* Marcação — igual Criar Post, direto nas configs da automação */}
      <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-3">
        <div>
          <p className="text-[10px] font-bold text-violet-800 uppercase tracking-wide">
            Marcação do post (Instagram)
          </p>
          <p className="text-[9px] text-violet-700/80 leading-snug mt-0.5">
            Local, pessoas, alt text e collab — salvos na automação e enviados na publicação.
          </p>
        </div>

        {(isFeedPost || isReel) && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-gray-600 flex items-center gap-1">
              <MapPin size={12} className="text-rose-500" /> Localização
            </label>
            {cp.locationId ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-2.5 py-2">
                <MapPin size={14} className="text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 truncate">{cp.locationName || cp.locationId}</p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">id: {cp.locationId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    patchCp({ locationId: '', locationName: '' })
                    setLocQuery('')
                    setLocHits([])
                  }}
                  className="p-1 rounded-md text-gray-400 hover:bg-gray-50 hover:text-red-500"
                  aria-label="Remover local"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="search"
                  value={locQuery}
                  onChange={(e) => setLocQuery(e.target.value)}
                  placeholder="Buscar cidade ou local no Instagram…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-gray-900"
                />
                {locLoading && (
                  <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                )}
                {locHits.length > 0 && (
                  <ul className="absolute z-30 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {locHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => {
                            patchCp({ locationId: hit.id, locationName: hit.name })
                            setLocQuery(hit.name)
                            setLocHits([])
                          }}
                          className="w-full text-left px-2.5 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="text-xs font-semibold text-gray-900">{hit.name}</p>
                          {hit.address && (
                            <p className="text-[10px] text-gray-400 truncate">{hit.address}</p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {(isFeedPost || isStory) && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-gray-600 flex items-center gap-1">
              <UserPlus size={12} className="text-violet-500" /> Marcar usuários
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addUserTag()
                  }
                }}
                placeholder="@usuario"
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-gray-900"
              />
              <button
                type="button"
                onClick={addUserTag}
                className="px-2.5 rounded-lg bg-gray-900 text-white text-[11px] font-semibold"
              >
                Add
              </button>
            </div>
            {userTagList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {userTagList.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-semibold text-gray-700"
                  >
                    @{u}
                    <button
                      type="button"
                      onClick={() =>
                        patchCp({
                          userTags: userTagList
                            .filter((x) => x !== u)
                            .map((x) => `@${x}`)
                            .join(', '),
                        })
                      }
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {isFeedPost && fmt === 'single_image' && (
          <label className="block text-[10px] text-gray-600">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Accessibility size={12} /> Texto alternativo
            </span>
            <input
              type="text"
              value={cp.altText || ''}
              onChange={(e) => patchCp({ altText: e.target.value })}
              placeholder="Descreva a imagem…"
              maxLength={1000}
              className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white"
            />
          </label>
        )}

        {(isFeedPost || isReel) && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-gray-600 flex items-center gap-1">
              <Users size={12} className="text-sky-500" /> Collab (até 3)
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={collabDraft}
                onChange={(e) => setCollabDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCollab()
                  }
                }}
                placeholder="@marca"
                disabled={collabList.length >= 3}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-gray-900 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addCollab}
                disabled={collabList.length >= 3}
                className="px-2.5 rounded-lg bg-gray-900 text-white text-[11px] font-semibold disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {collabList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {collabList.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-semibold text-gray-700"
                  >
                    @{u}
                    <button
                      type="button"
                      onClick={() =>
                        patchCp({
                          collaborators: collabList
                            .filter((x) => x !== u)
                            .map((x) => `@${x}`)
                            .join(', '),
                        })
                      }
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {isReel && (
          <>
            <label className="flex items-center justify-between gap-2 text-[11px] text-gray-700 bg-white rounded-lg border border-gray-200 px-2.5 py-2">
              <span>Reels: também no feed</span>
              <input
                type="checkbox"
                checked={cp.shareToFeed !== false}
                onChange={(e) => patchCp({ shareToFeed: e.target.checked })}
                className="w-4 h-4 accent-gray-900"
              />
            </label>
            <label className="block text-[10px] text-gray-600">
              Cover URL do Reels (opcional)
              <input
                type="url"
                value={cp.coverUrl || ''}
                onChange={(e) => patchCp({ coverUrl: e.target.value })}
                placeholder="https://…/cover.jpg"
                className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white"
              />
            </label>
          </>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, GripVertical, Type, Image as ImageIcon, Film, Mic, FileText,
  Link2, MousePointerClick, LayoutList, ChevronDown, ChevronUp, Sparkles, Images,
  BarChart2, Package, Tags, Building2,
} from 'lucide-react'
import type { MensagemStep, MensagemStepTipo } from '@/lib/automations/schema'
import {
  MENSAGEM_STEP_LABELS, MENSAGEM_STEP_META, newMensagemStepId, stepChannelHint,
} from '@/lib/automations/schema'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'
import {
  mensagemStepsToWhatsAppBlocks,
  WhatsAppCompositionTest,
} from '@/components/whatsapp/WhatsAppCompositionTest'

type CatalogProduct = { id: string; name: string; price?: number; promoPrice?: number; description?: string }

const TEMPLATE_TAG_GROUPS = [
  { label: 'Lead', tags: [['{{nome}}', 'Nome'], ['{{telefone}}', 'Telefone'], ['{{cidade}}', 'Cidade'], ['{{estado}}', 'Estado'], ['{{segmento}}', 'Nicho'], ['{{empresa}}', 'Empresa']] },
  { label: 'Afiliado', tags: [['{{afiliado_nome}}', 'Nome'], ['{{afiliado_cidade}}', 'Cidade'], ['{{afiliado_regiao}}', 'Região'], ['{{afiliado_nicho}}', 'Nicho'], ['{{afiliado_telefone}}', 'Telefone'], ['{{afiliado_cupom}}', 'Cupom']] },
  { label: 'Marca', tags: [['{{marca}}', 'Nome da marca'], ['{{brand}}', 'Brand']] },
  { label: 'Produto', tags: [['{{produto_nome}}', 'Nome'], ['{{produto_preco}}', 'Preço'], ['{{produto_link}}', 'Link'], ['{{produto_descricao}}', 'Descrição'], ['{{produtos_lista}}', 'Lista']] },
] as const

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

const STEP_ICONS: Record<MensagemStepTipo, typeof Type> = {
  texto: Type,
  imagem: ImageIcon,
  video: Film,
  audio: Mic,
  documento: FileText,
  link: Link2,
  cta: MousePointerClick,
  botoes: LayoutList,
  lista: LayoutList,
  enquete: BarChart2,
}

type Props = {
  steps: MensagemStep[]
  onChange: (steps: MensagemStep[]) => void
  allowedTipos: MensagemStepTipo[]
  variableHints?: string
  compact?: boolean
  enableWhatsappTest?: boolean
  testSourceLabel?: string
}

function defaultFields(tipo: MensagemStepTipo): Partial<MensagemStep> {
  if (tipo === 'cta') return { ctaLabel: 'Saiba mais', url: '', caption: '' }
  if (tipo === 'botoes') return { buttons: [{ id: 'btn_1', label: 'Opção 1' }], caption: 'Escolha:' }
  if (tipo === 'lista') {
    return {
      listButtonText: 'Ver opções',
      listSections: [{ title: 'Opções', rows: [{ id: 'row_1', title: 'Item 1' }] }],
      caption: 'Selecione:',
    }
  }
  if (tipo === 'enquete') {
    return {
      caption: 'Qual sua preferência?',
      pollOptions: ['Opção A', 'Opção B'],
      pollMultiple: false,
      pollSelectableCount: 1,
    }
  }
  if (tipo === 'link') return { url: '', caption: '' }
  return {}
}

export function MessagePipelineComposer({
  steps,
  onChange,
  allowedTipos,
  variableHints,
  compact,
  enableWhatsappTest,
  testSourceLabel = 'Automação',
}: Props) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({})
  const [pickerOpen, setPickerOpen] = useState(true)
  const [galleryFor, setGalleryFor] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const loadProducts = useCallback(async () => {
    try {
      const r = await fetch('/api/products', { headers: getAuthHeaders() })
      const d = await r.json()
      const list = (d.products || []).map((p: any) => ({
        id: String(p.id),
        name: String(p.name || 'Produto'),
        price: p.price != null ? Number(p.price) : undefined,
        promoPrice: p.promoPrice != null ? Number(p.promoPrice) : undefined,
        description: p.description || '',
      }))
      setProducts(list)
    } catch {
      setProducts([])
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    if (!focusId) return
    const el = stepRefs.current[focusId]
    // scrollIntoView inside modal — block:end so config fields stay visible
    requestAnimationFrame(() => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [focusId, steps.length])

  const updateStep = (id: string, patch: Partial<MensagemStep>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const insertTag = (step: MensagemStep, token: string) => {
    const current = step.caption || ''
    updateStep(step.id, { caption: `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token}` })
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
    setFocusId(step.id)
    setPickerOpen(false)
    // re-open picker after a beat so user can keep adding, but scrolled to new block
    setTimeout(() => setPickerOpen(true), 400)
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
    <div className={`space-y-3 ${compact ? '' : 'p-3 bg-gray-50 rounded-xl border border-gray-100'}`}>
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex items-start gap-2">
        <Building2 size={14} className="mt-0.5 text-brand shrink-0" />
        <div><p className="text-[11px] font-semibold text-gray-800">Personalização vinculada à marca ativa</p><p className="text-[10px] text-gray-500">As tags são resolvidas no envio com dados da marca, contato, afiliado e produto. {variableHints || ''}</p></div>
      </div>

      {steps.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          Monte a mensagem em blocos — texto, mídia, link, botões…
        </p>
      )}

      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step.tipo] || Type
        const isOpen = openIds[step.id] !== false
        const channel = stepChannelHint(step.tipo)
        const meta = MENSAGEM_STEP_META[step.tipo]
        const preview = step.caption?.slice(0, 60) || step.url?.slice(0, 40) || meta?.desc

        return (
          <div
            key={step.id}
            ref={(el) => { stepRefs.current[step.id] = el }}
            className={`bg-white border rounded-xl overflow-hidden transition ${
              focusId === step.id ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <span className="text-[10px] font-bold text-gray-400 tabular-nums w-5">{index + 1}</span>
              <Icon size={14} className="text-violet-500 shrink-0" />
              <button
                type="button"
                onClick={() => setOpenIds((p) => ({ ...p, [step.id]: !isOpen }))}
                className="flex-1 text-left min-w-0"
              >
                <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                  {MENSAGEM_STEP_LABELS[step.tipo]}
                  {channel && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      {channel}
                    </span>
                  )}
                </span>
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
              <div className="px-3 pb-3 space-y-2.5 border-t border-gray-50 pt-2.5">
                {(step.tipo === 'texto' || step.tipo === 'botoes' || step.tipo === 'lista' || step.tipo === 'enquete') && (
                  <><textarea
                    value={step.caption || ''}
                    onChange={(e) => updateStep(step.id, { caption: e.target.value })}
                    rows={step.tipo === 'enquete' ? 2 : 3}
                    placeholder={
                      step.tipo === 'enquete'
                        ? 'Pergunta da enquete…'
                        : 'Texto da mensagem… Use {nome}, {username}'
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <details className="group rounded-xl border border-gray-200 bg-gray-50/70">
                    <summary className="min-h-11 px-3 flex items-center gap-2 cursor-pointer list-none text-[11px] font-semibold text-gray-700">
                      <Tags size={13} className="text-brand" /> Inserir tag dinâmica
                      <span className="ml-auto hidden sm:inline text-[10px] text-gray-400 font-normal">Lead · afiliado · marca · produto</span>
                      <ChevronDown size={13} className="transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-gray-200 p-3 space-y-3">
                      {TEMPLATE_TAG_GROUPS.map((group) => <div key={group.label}>
                        <p className="mb-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">{group.tags.map(([token, label]) => <button key={token} type="button" onClick={() => insertTag(step, token)} title={token} className="min-h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[10px] font-semibold text-gray-700 hover:border-brand hover:text-brand">{label} <code className="ml-1 text-[9px] text-gray-400">{token}</code></button>)}</div>
                      </div>)}
                    </div>
                  </details></>
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
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                        title="Buscar em Publicidade / Galeria"
                      >
                        <Images size={12} /> Publicidade
                      </button>
                    </div>
                    <input
                      type="text"
                      value={step.caption || ''}
                      onChange={(e) => updateStep(step.id, { caption: e.target.value })}
                      placeholder="Legenda (opcional)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                    />
                    {step.url && (step.tipo === 'imagem' || step.tipo === 'video') && (
                      <div className="rounded-lg overflow-hidden border border-gray-100 max-h-36">
                        {step.tipo === 'video' ? (
                          <video src={step.url} className="w-full max-h-36 object-cover" muted playsInline />
                        ) : (
                          <img src={step.url} alt="" className="w-full max-h-36 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(step.tipo === 'link' || step.tipo === 'cta') && (
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={step.url || ''}
                      onChange={(e) => updateStep(step.id, { url: e.target.value })}
                      placeholder="https://…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                    />
                    {step.tipo === 'cta' && (
                      <input
                        type="text"
                        value={step.ctaLabel || ''}
                        onChange={(e) => updateStep(step.id, { ctaLabel: e.target.value })}
                        placeholder="Rótulo do botão"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                      />
                    )}
                    <input
                      type="text"
                      value={step.caption || ''}
                      onChange={(e) => updateStep(step.id, { caption: e.target.value })}
                      placeholder="Texto acima do link (opcional)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                )}

                {step.tipo === 'botoes' && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-violet-700 font-medium leading-snug">
                      Instagram: Quick Replies ou Button Template (com URL). WhatsApp: botões nativos.
                      Vincule um produto para preencher rótulo + link automaticamente.
                    </p>
                    {(step.buttons || []).map((btn, bi) => (
                      <div key={btn.id} className="space-y-1 p-2 rounded-lg border border-gray-100 bg-gray-50/80">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={btn.label}
                            onChange={(e) => {
                              const buttons = [...(step.buttons || [])]
                              buttons[bi] = { ...btn, label: e.target.value }
                              updateStep(step.id, { buttons })
                            }}
                            placeholder={`Rótulo (máx. 20 no IG)`}
                            maxLength={40}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => updateStep(step.id, { buttons: (step.buttons || []).filter((_, i) => i !== bi) })}
                            className="p-1.5 text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-600">
                          <Package size={11} className="text-violet-500" />
                          Produto
                          <select
                            value={btn.productId || ''}
                            onChange={(e) => {
                              const pid = e.target.value
                              const prod = products.find((p) => p.id === pid)
                              const buttons = [...(step.buttons || [])]
                              buttons[bi] = {
                                ...btn,
                                productId: pid || undefined,
                                productName: prod?.name,
                                label: prod ? prod.name.slice(0, 20) : btn.label,
                                payload: prod ? `PRODUCT_${prod.id}` : btn.payload,
                              }
                              updateStep(step.id, { buttons })
                            }}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-white"
                          >
                            <option value="">— sem produto —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </label>
                        <input
                          type="text"
                          value={btn.payload || ''}
                          onChange={(e) => {
                            const buttons = [...(step.buttons || [])]
                            buttons[bi] = { ...btn, payload: e.target.value }
                            updateStep(step.id, { buttons })
                          }}
                          placeholder="Payload (ex: PRODUCT_id ou NAV_CATALOGO)"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-white font-mono"
                        />
                        <input
                          type="url"
                          value={btn.url || ''}
                          onChange={(e) => {
                            const buttons = [...(step.buttons || [])]
                            buttons[bi] = { ...btn, url: e.target.value }
                            updateStep(step.id, { buttons })
                          }}
                          placeholder="URL (link do produto ou página) — vira web_url no IG"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] bg-white"
                        />
                      </div>
                    ))}
                    {(step.buttons?.length || 0) < 13 && (
                      <button
                        type="button"
                        onClick={() => updateStep(step.id, {
                          buttons: [...(step.buttons || []), {
                            id: `btn_${Date.now()}`,
                            label: 'Nova opção',
                            payload: `OPT_${(step.buttons?.length || 0) + 1}`,
                          }],
                        })}
                        className="text-[10px] font-semibold text-violet-600"
                      >
                        + Botão
                      </button>
                    )}
                  </div>
                )}

                {step.tipo === 'lista' && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-emerald-700 font-medium">
                      Lista interativa (WhatsApp) — marque produtos do catálogo para listar com preço e link.
                    </p>
                    <input
                      type="text"
                      value={step.listButtonText || ''}
                      onChange={(e) => updateStep(step.id, { listButtonText: e.target.value })}
                      placeholder="Texto do botão da lista"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                    />
                    {products.length > 0 && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2 space-y-1.5 max-h-40 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                          <Package size={11} /> Produtos do catálogo
                        </p>
                        {products.slice(0, 40).map((p) => {
                          const rows = step.listSections?.[0]?.rows || []
                          const checked = rows.some((r) => r.productId === p.id)
                          return (
                            <label key={p.id} className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const sections = [...(step.listSections || [{ title: 'Produtos', rows: [] }])]
                                  let nextRows = [...(sections[0].rows || [])]
                                  if (e.target.checked) {
                                    if (!nextRows.some((r) => r.productId === p.id)) {
                                      nextRows.push({
                                        id: `product_${p.id}`,
                                        title: p.name.slice(0, 24),
                                        description: p.promoPrice
                                          ? `R$ ${Number(p.promoPrice).toFixed(2)}`
                                          : p.price != null
                                            ? `R$ ${Number(p.price).toFixed(2)}`
                                            : undefined,
                                        productId: p.id,
                                        productName: p.name,
                                      })
                                    }
                                  } else {
                                    nextRows = nextRows.filter((r) => r.productId !== p.id)
                                  }
                                  sections[0] = { title: sections[0].title || 'Produtos', rows: nextRows }
                                  updateStep(step.id, {
                                    listSections: sections,
                                    productIds: nextRows.map((r) => r.productId).filter(Boolean) as string[],
                                  })
                                }}
                              />
                              <span className="truncate">{p.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {(step.listSections?.[0]?.rows || []).map((row, ri) => (
                      <div key={row.id} className="space-y-1 p-2 rounded-lg border border-gray-100 bg-white">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) => {
                              const sections = [...(step.listSections || [{ title: 'Opções', rows: [] }])]
                              const rows = [...(sections[0].rows || [])]
                              rows[ri] = { ...row, title: e.target.value }
                              sections[0] = { ...sections[0], rows }
                              updateStep(step.id, { listSections: sections })
                            }}
                            placeholder={`Item ${ri + 1}`}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const sections = [...(step.listSections || [{ title: 'Opções', rows: [] }])]
                              const rows = (sections[0].rows || []).filter((_, i) => i !== ri)
                              sections[0] = { ...sections[0], rows }
                              updateStep(step.id, {
                                listSections: sections,
                                productIds: rows.map((r) => r.productId).filter(Boolean) as string[],
                              })
                            }}
                            className="p-1.5 text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={row.description || ''}
                          onChange={(e) => {
                            const sections = [...(step.listSections || [{ title: 'Opções', rows: [] }])]
                            const rows = [...(sections[0].rows || [])]
                            rows[ri] = { ...row, description: e.target.value }
                            sections[0] = { ...sections[0], rows }
                            updateStep(step.id, { listSections: sections })
                          }}
                          placeholder="Descrição / preço (opcional)"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11px]"
                        />
                        {row.productName && (
                          <p className="text-[10px] text-emerald-700">Produto: {row.productName}</p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const sections = [...(step.listSections || [{ title: 'Opções', rows: [] }])]
                        const rows = [...(sections[0].rows || []), { id: `row_${Date.now()}`, title: 'Novo item' }]
                        sections[0] = { ...sections[0], rows }
                        updateStep(step.id, { listSections: sections })
                      }}
                      className="text-[10px] font-semibold text-violet-600"
                    >
                      + Item manual
                    </button>
                  </div>
                )}

                {(step.tipo === 'link' || step.tipo === 'cta' || step.tipo === 'texto') && products.length > 0 && (
                  <label className="flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
                    <Package size={11} className="text-violet-500" />
                    Produto p/ tags / link
                    <select
                      value={step.productId || ''}
                      onChange={(e) => {
                        const pid = e.target.value
                        const prod = products.find((p) => p.id === pid)
                        const patch: Partial<MensagemStep> = {
                          productId: pid || undefined,
                          productName: prod?.name,
                        }
                        if (prod && (step.tipo === 'link' || step.tipo === 'cta')) {
                          /* URL preenchida no runtime; caption pode citar o nome */
                          if (!step.caption) patch.caption = prod.name
                          if (step.tipo === 'cta' && !step.ctaLabel) patch.ctaLabel = 'Ver produto'
                        }
                        updateStep(step.id, patch)
                      }}
                      className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-[11px] bg-white"
                    >
                      <option value="">— nenhum —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                {step.tipo === 'enquete' && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-emerald-700 font-medium">Enquete (WhatsApp poll)</p>
                    {(step.pollOptions || []).map((opt, oi) => (
                      <div key={oi} className="flex gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const pollOptions = [...(step.pollOptions || [])]
                            pollOptions[oi] = e.target.value
                            updateStep(step.id, { pollOptions })
                          }}
                          placeholder={`Opção ${oi + 1}`}
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => updateStep(step.id, {
                            pollOptions: (step.pollOptions || []).filter((_, i) => i !== oi),
                          })}
                          className="p-1.5 text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {(step.pollOptions?.length || 0) < 12 && (
                      <button
                        type="button"
                        onClick={() => updateStep(step.id, {
                          pollOptions: [...(step.pollOptions || []), `Opção ${(step.pollOptions?.length || 0) + 1}`],
                        })}
                        className="text-[10px] font-semibold text-violet-600"
                      >
                        + Opção
                      </button>
                    )}
                    <label className="flex items-center gap-2 text-[10px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!step.pollMultiple}
                        onChange={(e) => updateStep(step.id, { pollMultiple: e.target.checked })}
                      />
                      Permitir múltipla escolha
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-50">
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

      {/* Card picker inline — NÃO absolute (evita clip/sem scroll no modal) */}
      <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-3 space-y-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-700"
        >
          <Plus size={14} />
          {pickerOpen ? 'Escolha o tipo de bloco' : 'Adicionar bloco'}
        </button>
        {pickerOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allowedTipos.map((tipo) => {
              const Icon = STEP_ICONS[tipo] || Type
              const meta = MENSAGEM_STEP_META[tipo]
              const ch = stepChannelHint(tipo)
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => addStep(tipo)}
                  className="flex flex-col items-start gap-1 p-3 rounded-xl border-2 border-gray-100 hover:border-gray-900 hover:bg-gray-50 text-left transition"
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <Icon size={16} className="text-violet-500 shrink-0" />
                    <span className="text-[12px] font-bold text-gray-800">{meta?.label || tipo}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 leading-snug">{meta?.desc}</span>
                  {ch && (
                    <span className="text-[9px] font-bold uppercase text-emerald-600 mt-0.5">{ch}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div ref={bottomRef} className="h-1" aria-hidden />

      {enableWhatsappTest && (
        <WhatsAppCompositionTest
          blocks={mensagemStepsToWhatsAppBlocks(steps)}
          sourceLabel={testSourceLabel}
        />
      )}

      <MediaPickerModal
        open={!!galleryFor}
        onClose={() => setGalleryFor(null)}
        onSelect={onGalleryPick}
        preferSection="publicidade"
        title="Mídia da Publicidade · automação"
        accept={
          galleryFor
            ? (() => {
                const step = steps.find((s) => s.id === galleryFor)
                if (step?.tipo === 'imagem') return ['image']
                if (step?.tipo === 'video') return ['video']
                return ['image', 'video']
              })()
            : ['image', 'video']
        }
      />
    </div>
  )
}

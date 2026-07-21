import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, GitBranch, Megaphone, Package, Search, Trash2 } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { fieldLabelClass } from '@/components/ui'
import { MessagePipelineComposer } from '@/components/automations/MessagePipelineComposer'
import type { MensagemStep } from '@/lib/automations/schema'
import { newMensagemStepId } from '@/lib/automations/schema'
import type { FlowNode } from '@/lib/flows/types'
import { TRIGGER_CATALOG, toneForNode, NODE_ICON } from '@/lib/flows/catalog'
import { cn } from '@/lib/cn'

type Props = {
  node: FlowNode
  onChange: (nodeId: string, patch: Partial<FlowNode>) => void
  onData: (nodeId: string, key: string, value: unknown) => void
  onRemove: (nodeId: string) => void
  /** Parent supplies the chrome (sheet/drawer header) — hide the built-in title row. */
  hideHeader?: boolean
}

type CampaignTriggerOption = {
  key: string
  campaignId: string
  campaignName: string
  blockId: string
  blockLabel: string
  optionId: string
  optionLabel: string
}

type FlowProduct = {
  id: string
  name: string
  price: number
  stock?: number | null
  active?: boolean
  category?: string
  tags: string[]
}

function Label({ children }: { children: ReactNode }) {
  return <label className={cn(fieldLabelClass, 'mb-1.5 block')}>{children}</label>
}

export function FlowNodeConfigPanel({ node, onChange, onData, onRemove, hideHeader = false }: Props) {
  const tone = toneForNode(node.type, node.subtype)
  const Icon = NODE_ICON[node.type] || NODE_ICON.action
  const canRemove = node.type !== 'trigger' && node.type !== 'end'
  const [campaignCatalog, setCampaignCatalog] = useState<CampaignTriggerOption[]>([])
  const [campaignNames, setCampaignNames] = useState<Array<{ id: string; name: string }>>([])
  const [products, setProducts] = useState<FlowProduct[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productsLoading, setProductsLoading] = useState(false)

  useEffect(() => {
    if (node.subtype !== 'product_offer') return
    let cancelled = false
    setProductsLoading(true)
    const headers: Record<string, string> = { Accept: 'application/json' }
    const token = localStorage.getItem('lead-system-token')
    const brandId = localStorage.getItem('lead-system:active-brand-id')
    if (token) headers.Authorization = `Bearer ${token}`
    if (brandId) headers['x-brand-id'] = brandId
    fetch('/api/products', { headers })
      .then((response) => response.json())
      .then((payload) => {
        const list = Array.isArray(payload?.products) ? payload.products : []
        if (cancelled) return
        setProducts(list.map((product: any) => ({
          id: String(product.id),
          name: String(product.name || product.nome || 'Produto'),
          price: Number(product.price ?? product.preco ?? product.sale_price ?? 0),
          stock: product.stock_quantity ?? product.stock ?? product.estoque ?? null,
          active: product.active ?? product.ativo ?? true,
          category: String(product.category_name || product.category || product.categoria || '').trim(),
          tags: Array.isArray(product.tags)
            ? product.tags.map(String)
            : String(product.tags || product.metadata?.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        })))
      })
      .catch(() => { if (!cancelled) setProducts([]) })
      .finally(() => { if (!cancelled) setProductsLoading(false) })
    return () => { cancelled = true }
  }, [node.subtype])

  useEffect(() => {
    if (node.type !== 'trigger' || node.subtype !== 'message_received') return
    let cancelled = false
    ;(async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' }
        const token = localStorage.getItem('lead-system-token')
        const brandId = localStorage.getItem('lead-system:active-brand-id')
        if (token) headers.Authorization = `Bearer ${token}`
        if (brandId) headers['x-brand-id'] = brandId
        const response = await fetch('/api/campaigns', { headers })
        const data = await response.json()
        const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []
        const names = campaigns.map((campaign: any) => ({ id: String(campaign.id), name: String(campaign.name || 'Campanha') }))
        const options: CampaignTriggerOption[] = []
        for (const campaign of campaigns) {
          const settings = typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : (campaign.settings || {})
          const blocks = Array.isArray(settings?.composer?.actionBlocks) ? settings.composer.actionBlocks : []
          for (const block of blocks) {
            const items = Array.isArray(block?.config?.optionItems) ? block.config.optionItems : []
            items.forEach((item: any, index: number) => {
              const optionId = String(item?.id || `${block.id}_option_${index + 1}`)
              const optionLabel = String(item?.label || '').trim()
              if (!optionLabel) return
              options.push({
                key: `${campaign.id}:${block.id}:${optionId}`,
                campaignId: String(campaign.id),
                campaignName: String(campaign.name || 'Campanha'),
                blockId: String(block.id || ''),
                blockLabel: String(block.actionType || 'interação'),
                optionId,
                optionLabel,
              })
            })
          }
        }
        if (!cancelled) {
          setCampaignNames(names)
          setCampaignCatalog(options)
        }
      } catch {
        if (!cancelled) {
          setCampaignNames([])
          setCampaignCatalog([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [node.type, node.subtype])

  const selectedCampaignIds = useMemo(
    () => Array.isArray(node.data?.campaignIds) ? node.data.campaignIds.map(String) : [],
    [node.data?.campaignIds],
  )
  const selectedCampaignChoices = useMemo(
    () => Array.isArray(node.data?.campaignChoices) ? node.data.campaignChoices.map(String) : [],
    [node.data?.campaignChoices],
  )
  const selectedProductIds = useMemo(
    () => Array.isArray(node.data?.product_ids) ? node.data.product_ids.map(String) : [],
    [node.data?.product_ids],
  )
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    return products.filter((product) => !query || product.name.toLowerCase().includes(query))
  }, [products, productSearch])
  const productCategories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean) as string[])).sort(),
    [products],
  )
  const productTags = useMemo(
    () => Array.from(new Set(products.flatMap((product) => product.tags))).sort(),
    [products],
  )
  const categoryFilters = Array.isArray(node.data?.category_filters) ? node.data.category_filters.map(String) : []
  const tagFilters = Array.isArray(node.data?.tag_filters) ? node.data.tag_filters.map(String) : []

  const steps: MensagemStep[] = Array.isArray(node.data?.mensagemSteps)
    ? node.data.mensagemSteps
    : node.data?.message || node.data?.prompt
      ? [{ id: newMensagemStepId(), tipo: 'texto', caption: String(node.data.message || node.data.prompt) }]
      : []

  function setSteps(next: MensagemStep[]) {
    onData(node.id, 'mensagemSteps', next)
    const firstText = next.find((s) => s.tipo === 'texto' || s.caption)
    const plain =
      firstText?.caption ||
      next
        .map((s) => s.caption || s.url || '')
        .filter(Boolean)
        .join('\n')
    onData(node.id, node.type === 'wait' || node.type === 'collect' ? 'prompt' : 'message', plain)
  }

  return (
    <div className="space-y-5">
      {!hideHeader && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('w-10 h-10 rounded-xl grid place-items-center shrink-0', tone.icon)}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 tracking-tight capitalize">
                {node.type === 'action' && node.subtype === 'send_message' ? 'Mensagem' : node.type}
              </p>
              <p className="text-xs text-gray-500 truncate">{node.subtype}</p>
            </div>
          </div>
          {canRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="!px-2 text-red-600 hover:bg-red-50 shrink-0"
              aria-label="Remover bloco"
              onClick={() => onRemove(node.id)}
              iconLeft={<Trash2 size={14} />}
            />
          )}
        </div>
      )}

      <div>
        <Label>Nome do bloco</Label>
        <Input
          value={node.label}
          onChange={(e) => onChange(node.id, { label: e.target.value })}
          placeholder="Ex.: Pedir endereço"
        />
      </div>

      <div>
        <Label>Fase (opcional)</Label>
        <Input
          value={String(node.phaseId || node.data?.phaseId || '')}
          onChange={(e) => {
            const phaseId = e.target.value.trim()
            onChange(node.id, { phaseId: phaseId || undefined })
            onData(node.id, 'phaseId', phaseId || undefined)
          }}
          placeholder="Ex.: boas-vindas, qualificacao, pagamento"
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Usado em métricas e organização. Conexões podem cruzar fases.
        </p>
      </div>

      {node.type === 'trigger' && (
        <div className="space-y-3">
          <div>
            <Label>Tipo de gatilho</Label>
            <Select
              value={node.subtype}
              onChange={(e) => onChange(node.id, { subtype: e.target.value })}
            >
              {TRIGGER_CATALOG.map((t) => (
                <option key={t.subtype} value={t.subtype}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {node.subtype === 'message_received' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Megaphone size={16} className="mt-0.5 text-gray-700" />
                  <div>
                    <p className="text-xs font-semibold text-gray-900">Origem da mensagem</p>
                    <p className="text-[11px] leading-relaxed text-gray-500">Aceite qualquer conversa ou restrinja a campanhas e escolhas específicas.</p>
                  </div>
                </div>
                <Select
                  value={String(node.data?.campaignSourceMode || 'any')}
                  onChange={(e) => {
                    onData(node.id, 'campaignSourceMode', e.target.value)
                    if (e.target.value === 'any') {
                      onData(node.id, 'campaignIds', [])
                      onData(node.id, 'campaignChoices', [])
                    }
                  }}
                >
                  <option value="any">Qualquer mensagem recebida</option>
                  <option value="campaign">Resposta de campanha</option>
                </Select>

                {node.data?.campaignSourceMode === 'campaign' && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-gray-700">Campanhas aceitas</p>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
                      {campaignNames.length === 0 ? <p className="p-2 text-[11px] text-gray-500">Nenhuma campanha disponível nesta marca.</p> : campaignNames.map((campaign) => (
                        <label key={campaign.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={selectedCampaignIds.includes(campaign.id)} onChange={(e) => onData(node.id, 'campaignIds', e.target.checked ? [...selectedCampaignIds, campaign.id] : selectedCampaignIds.filter((id) => id !== campaign.id))} className="rounded border-gray-300" />
                          <span className="truncate">{campaign.name}</span>
                        </label>
                      ))}
                    </div>
                    <details className="group rounded-lg border border-gray-200 bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-gray-800">
                        <span className="flex items-center gap-2"><GitBranch size={14} /> Botões, listas e enquetes</span>
                        <ChevronDown size={14} className="transition group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-gray-100 p-2 space-y-1 max-h-48 overflow-y-auto">
                        <p className="px-2 pb-1 text-[10px] text-gray-500">Sem escolha marcada, qualquer resposta das campanhas selecionadas dispara.</p>
                        {campaignCatalog.filter((option) => selectedCampaignIds.length === 0 || selectedCampaignIds.includes(option.campaignId)).map((option) => (
                          <label key={option.key} className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedCampaignChoices.includes(option.key)} onChange={(e) => onData(node.id, 'campaignChoices', e.target.checked ? [...selectedCampaignChoices, option.key] : selectedCampaignChoices.filter((key) => key !== option.key))} className="mt-0.5 rounded border-gray-300" />
                            <span className="min-w-0"><span className="block truncate text-xs font-medium text-gray-800">{option.optionLabel}</span><span className="block truncate text-[10px] text-gray-500">{option.campaignName} · {option.blockLabel}</span></span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Como disparar (match)</Label>
                <Select
                  value={String(node.data?.matchMode || (String(node.data?.keywords || node.data?.keyword || '').trim() ? 'keywords' : 'any'))}
                  onChange={(e) => onData(node.id, 'matchMode', e.target.value)}
                >
                  <option value="any">Qualquer texto / escolha (sem filtro extra)</option>
                  <option value="keywords">Palavras-chave</option>
                  <option value="ai_intent">Contexto / intenção (IA)</option>
                </Select>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  <strong>IA:</strong> entende se a pessoa quer preço, tem interesse, pediu para parar, etc. — sem exigir a palavra exata.
                  Ideal quando a mensagem inicial foi texto (sem botão nativo).
                </p>
              </div>
              {String(node.data?.matchMode || '') === 'ai_intent' ? (
                <div>
                  <Label>Intenções que disparam este fluxo</Label>
                  <Input
                    value={
                      Array.isArray(node.data.intents)
                        ? node.data.intents.join(', ')
                        : String(node.data.intents || 'interested, price')
                    }
                    onChange={(e) => {
                      const list = e.target.value
                        .split(/[,;\n]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      onData(node.id, 'intents', list)
                    }}
                    placeholder="interested, price, support"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    Padrão: <code className="text-[10px] bg-gray-100 px-1 rounded">interested</code>,{' '}
                    <code className="text-[10px] bg-gray-100 px-1 rounded">price</code>. Use{' '}
                    <code className="text-[10px] bg-gray-100 px-1 rounded">opt_out</code> /{' '}
                    <code className="text-[10px] bg-gray-100 px-1 rounded">negative</code> com cuidado.
                  </p>
                </div>
              ) : (
                <div>
                  <Label>Palavras-chave (opcional)</Label>
                  <Input value={String(node.data.keywords || node.data.keyword || '')} onChange={(e) => onData(node.id, 'keywords', e.target.value)} placeholder="pedido, quero comprar, orçamento" />
                  <p className="mt-1.5 text-xs text-gray-500">Aplicadas depois do filtro de campanha. Vazio aceita qualquer texto ou escolha mapeada.</p>
                </div>
              )}
              {node.data?.campaignSourceMode === 'campaign' && <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[10px] leading-relaxed text-emerald-900">Payload: <code>{'{{system.raw.campaign.name}}'}</code>, <code>{'{{system.raw.reply.optionLabel}}'}</code> e <code>{'{{system.raw.reply.kind}}'}</code>.</div>}
            </div>
          )}
        </div>
      )}

      {node.subtype === 'send_message' && (
        <div className="space-y-2">
          <Label>Conteúdo da mensagem</Label>
          <p className="text-xs text-gray-500 -mt-1 mb-2">
            Mesmo compositor das Automações. Variáveis:{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{context.name}}'}</code>,{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">{'{{customer.phone}}'}</code>
          </p>
          <div className="rounded-xl border border-border bg-gray-50/50 p-2">
            <MessagePipelineComposer
              steps={steps}
              onChange={setSteps}
              allowedTipos={['texto', 'imagem', 'video', 'audio', 'documento', 'link', 'cta', 'botoes', 'lista', 'enquete']}
              variableHints="{{context.name}} {{customer.phone}} {{customer.name}}"
              compact
              enableWhatsappTest
              testSourceLabel="Fluxo"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={node.data.wait_for_reply !== false}
              onChange={(e) => onData(node.id, 'wait_for_reply', e.target.checked)}
              className="rounded border-gray-300"
            />
            Aguardar resposta do cliente (obrigatório se houver botões/lista)
          </label>
        </div>
      )}

      {node.subtype === 'product_offer' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm"><Package size={18} /></span>
              <div>
                <p className="text-sm font-semibold text-gray-950">Oferta conectada ao catálogo</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">Envia opções reais e registra os produtos apresentados para a escolha e a criação do pedido.</p>
              </div>
            </div>
          </div>

          <div>
            <Label>Introdução da oferta</Label>
            <Textarea value={String(node.data.intro_message || '')} onChange={(e) => onData(node.id, 'intro_message', e.target.value)} rows={2} placeholder="Separei estas opções para você:" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Como escolher</Label>
              <Select value={String(node.data.catalog_mode || 'smart')} onChange={(e) => onData(node.id, 'catalog_mode', e.target.value)}>
                <option value="smart">Intenção + marcações</option>
                <option value="filters">Categorias e tags</option>
                <option value="selected">Seleção manual</option>
              </Select>
            </div>
            <div>
              <Label>Máximo de itens</Label>
              <Input type="number" min={1} max={6} value={Number(node.data.max_items || 3)} onChange={(e) => onData(node.id, 'max_items', Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
            </div>
          </div>

          {String(node.data.catalog_mode || 'smart') === 'smart' && (
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div><p className="text-xs font-semibold text-gray-900">Correspondência inteligente</p><p className="mt-1 text-[11px] leading-relaxed text-gray-500">Cruza o que o cliente informou com nome, descrição, categoria e tags dos produtos.</p></div>
              <div>
                <Label>Intenção registrada em</Label>
                <Input value={String(node.data.context_variable || 'product_interest')} onChange={(e) => onData(node.id, 'context_variable', e.target.value)} placeholder="product_interest" />
                <p className="mt-1 text-[11px] text-gray-500">Use a variável preenchida pelo bloco anterior, por exemplo <code>{'{{context.product_interest}}'}</code>.</p>
              </div>
            </div>
          )}

          {['smart', 'filters'].includes(String(node.data.catalog_mode || 'smart')) && (
            <div className="space-y-3">
              <div>
                <Label>Categorias permitidas</Label>
                <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 p-3">
                  {productCategories.length === 0 ? <span className="text-xs text-gray-500">Nenhuma categoria cadastrada.</span> : productCategories.map((category) => (
                    <label key={category} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-700"><input type="checkbox" checked={categoryFilters.includes(category)} onChange={(e) => onData(node.id, 'category_filters', e.target.checked ? [...categoryFilters, category] : categoryFilters.filter((item) => item !== category))} className="rounded border-gray-300" />{category}</label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Tags que qualificam a oferta</Label>
                <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 p-3">
                  {productTags.length === 0 ? <span className="text-xs text-gray-500">Nenhuma tag cadastrada nos produtos.</span> : productTags.map((tag) => (
                    <label key={tag} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 text-xs font-medium text-gray-700"><input type="checkbox" checked={tagFilters.includes(tag)} onChange={(e) => onData(node.id, 'tag_filters', e.target.checked ? [...tagFilters, tag] : tagFilters.filter((item) => item !== tag))} className="rounded border-gray-300" />{tag}</label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {String(node.data.catalog_mode || 'selected') === 'selected' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3"><Label>Produtos da oferta</Label><span className="text-[11px] text-gray-500">{selectedProductIds.length} selecionado{selectedProductIds.length === 1 ? '' : 's'}</span></div>
              <div className="relative mb-2"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar no catálogo" className="pl-9" /></div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-2">
                {productsLoading ? <p className="p-3 text-center text-xs text-gray-500">Carregando catálogo…</p> : visibleProducts.length === 0 ? <p className="p-3 text-center text-xs text-gray-500">Nenhum produto encontrado.</p> : visibleProducts.map((product) => (
                  <label key={product.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 hover:bg-gray-100">
                    <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={(e) => onData(node.id, 'product_ids', e.target.checked ? [...selectedProductIds, product.id] : selectedProductIds.filter((id) => id !== product.id))} className="rounded border-gray-300" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-gray-900">{product.name}</span><span className="text-[11px] text-gray-500">{product.price > 0 ? product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Preço sob consulta'}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {String(node.data.catalog_mode || 'smart') !== 'selected' && (
            <div>
              <Label>Se não houver correspondência</Label>
              <Select value={String(node.data.fallback_mode || 'selected')} onChange={(e) => onData(node.id, 'fallback_mode', e.target.value)}>
                <option value="selected">Usar produtos de segurança marcados abaixo</option>
                <option value="none">Não enviar e encaminhar para revisão</option>
              </Select>
              {String(node.data.fallback_mode || 'selected') === 'selected' && (
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-2">
                  {visibleProducts.map((product) => <label key={product.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2"><input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={(e) => onData(node.id, 'product_ids', e.target.checked ? [...selectedProductIds, product.id] : selectedProductIds.filter((id) => id !== product.id))} className="rounded border-gray-300" /><span className="truncate text-xs font-medium text-gray-800">{product.name}</span></label>)}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700"><input type="checkbox" checked={node.data.show_price !== false} onChange={(e) => onData(node.id, 'show_price', e.target.checked)} className="rounded border-gray-300" /> Mostrar preço</label>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700"><input type="checkbox" checked={node.data.show_stock === true} onChange={(e) => onData(node.id, 'show_stock', e.target.checked)} className="rounded border-gray-300" /> Mostrar estoque</label>
          </div>

          <div>
            <Label>Variável da escolha</Label>
            <Input value={String(node.data.selection_variable || 'product')} onChange={(e) => onData(node.id, 'selection_variable', e.target.value)} />
            <p className="mt-1.5 text-xs text-gray-500">No próximo bloco, colete a resposta nesta variável. Aceita número, nome ou ID do produto.</p>
          </div>
        </div>
      )}

      {(node.subtype === 'wait_button' || node.subtype === 'wait_choice') && (
        <div className="space-y-3">
          <div>
            <Label>Pergunta</Label>
            <Textarea
              value={String(node.data.prompt || '')}
              onChange={(e) => onData(node.id, 'prompt', e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Opções (uma por linha: id|rótulo ou só rótulo)</Label>
            <Textarea
              value={
                Array.isArray(node.data.options)
                  ? node.data.options
                      .map((o: any) =>
                        typeof o === 'string' ? o : `${o.id || ''}|${o.label || o.text || ''}`,
                      )
                      .join('\n')
                  : ''
              }
              onChange={(e) => {
                const options = e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, i) => {
                    const [a, b] = line.split('|').map((s) => s.trim())
                    if (b) return { id: a || `opt_${i + 1}`, label: b }
                    return {
                      id: a.toLowerCase().replace(/\s+/g, '_').slice(0, 24) || `opt_${i + 1}`,
                      label: a,
                    }
                  })
                onData(node.id, 'options', options)
              }}
              rows={4}
              placeholder={'sim|Sim, quero\nnao|Não, obrigado'}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              No canvas, conecte cada handle (id da opção) a um caminho diferente.
            </p>
          </div>
          <div>
            <Label>Variável</Label>
            <Input
              value={String(node.data.variable_name || 'choice')}
              onChange={(e) => onData(node.id, 'variable_name', e.target.value)}
            />
          </div>
        </div>
      )}

      {node.subtype === 'ai_message' && (
        <div>
          <Label>Instrução para a IA</Label>
          <Textarea
            value={String(node.data.ai_instruction || node.data.ai_instrucao || '')}
            onChange={(e) => {
              onData(node.id, 'ai_instruction', e.target.value)
              onData(node.id, 'ai_instrucao', e.target.value)
            }}
            rows={4}
            placeholder="Cumprimente o cliente e peça o produto desejado..."
          />
          <p className="mt-1.5 text-xs text-gray-500">
            A IA atua dentro deste bloco; não altera o grafo por conta própria.
          </p>
        </div>
      )}

      {node.subtype === 'send_image' && (
        <div className="space-y-3">
          <div>
            <Label>URL da imagem</Label>
            <Input
              value={String(node.data.imageUrl || node.data.image_url || '')}
              onChange={(e) => onData(node.id, 'imageUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Legenda</Label>
            <Input
              value={String(node.data.caption || '')}
              onChange={(e) => onData(node.id, 'caption', e.target.value)}
            />
          </div>
        </div>
      )}

      {(node.type === 'wait' || node.type === 'collect') && (
        <div className="space-y-3">
          <div>
            <Label>Mensagem para coletar a resposta</Label>
            <p className="mb-2 text-[11px] leading-relaxed text-gray-500">Componha o conteúdo que será enviado antes de aguardar a resposta. A validação permanece configurada abaixo.</p>
            <div className="rounded-xl border border-border bg-white p-2">
              <MessagePipelineComposer
                steps={steps}
                onChange={setSteps}
                allowedTipos={['texto', 'imagem', 'video', 'audio', 'documento', 'link', 'cta', 'botoes', 'lista', 'enquete']}
                variableHints="{{context.name}} {{context.last_tag}} {{context.tags}} {{customer.phone}}"
              />
            </div>
          </div>
          <div>
            <Label>Variável de destino</Label>
            <Input
              value={String(node.data.variable_name || '')}
              onChange={(e) => onData(node.id, 'variable_name', e.target.value)}
              placeholder="name, email, phone..."
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Disponível depois como{' '}
              <code className="text-[11px] bg-gray-100 px-1 rounded">
                {`{{context.${node.data.variable_name || 'campo'}}}`}
              </code>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tentativas</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={Number(node.data.max_attempts ?? 3)}
                onChange={(e) => onData(node.id, 'max_attempts', Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Timeout (min)</Label>
              <Input
                type="number"
                min={5}
                value={Number(node.data.timeout_minutes ?? 1440)}
                onChange={(e) => onData(node.id, 'timeout_minutes', Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label>Mensagem de erro</Label>
            <Input
              value={String(node.data.error_message || '')}
              onChange={(e) => onData(node.id, 'error_message', e.target.value)}
              placeholder="Resposta inválida. Tente novamente."
            />
          </div>
        </div>
      )}

      {node.type === 'collect' && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div>
            <p className="text-xs font-semibold text-gray-900">Marcação e contexto</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">A resposta pode marcar o contato e orientar mensagens e decisões dos próximos blocos.</p>
          </div>
          <div>
            <Label>Ao receber uma resposta válida</Label>
            <Select value={String(node.data.tag_mode || 'none')} onChange={(e) => onData(node.id, 'tag_mode', e.target.value)}>
              <option value="none">Não aplicar tag</option>
              <option value="fixed">Aplicar uma tag definida</option>
              <option value="answer">Criar tag a partir da resposta</option>
            </Select>
          </div>
          {String(node.data.tag_mode || 'none') === 'fixed' && (
            <div>
              <Label>Tag aplicada</Label>
              <Input value={String(node.data.tag_value || '')} onChange={(e) => onData(node.id, 'tag_value', e.target.value)} placeholder="interesse-restaurante" />
            </div>
          )}
          {String(node.data.tag_mode || 'none') === 'answer' && (
            <div>
              <Label>Prefixo da tag (opcional)</Label>
              <Input value={String(node.data.tag_prefix || '')} onChange={(e) => onData(node.id, 'tag_prefix', e.target.value)} placeholder="interesse: " />
            </div>
          )}
          {String(node.data.tag_mode || 'none') !== 'none' && (
            <p className="text-[11px] text-gray-500">Use depois <code>{'{{context.last_tag}}'}</code> para a última marcação ou <code>{'{{context.tags}}'}</code> para todas.</p>
          )}
        </div>
      )}

      {node.subtype === 'phase_manager' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
            <p className="text-sm font-semibold text-gray-950">Decisão de progressão</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">Este bloco escolhe uma das três conexões do canvas: avançar, manter nesta fase ou voltar.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label>Fase atual</Label><Input value={String(node.data.current_phase || node.phaseId || '')} onChange={(e) => onData(node.id, 'current_phase', e.target.value)} placeholder="oferta" /></div>
            <div><Label>Ao avançar</Label><Input value={String(node.data.next_phase || '')} onChange={(e) => onData(node.id, 'next_phase', e.target.value)} placeholder="pedido" /></div>
            <div><Label>Ao voltar</Label><Input value={String(node.data.back_phase || '')} onChange={(e) => onData(node.id, 'back_phase', e.target.value)} placeholder="triagem" /></div>
          </div>
          <div>
            <Label>Como decidir</Label>
            <Select value={String(node.data.decision_source || 'required_fields')} onChange={(e) => onData(node.id, 'decision_source', e.target.value)}>
              <option value="required_fields">Campos obrigatórios preenchidos</option>
              <option value="variable">Valor de uma variável</option>
              <option value="attempts">Número de tentativas</option>
              <option value="signal">Sinal definido por outro bloco ou IA</option>
            </Select>
          </div>
          {String(node.data.decision_source || 'required_fields') === 'required_fields' && (
            <div><Label>Campos obrigatórios</Label><Input value={Array.isArray(node.data.required_fields) ? node.data.required_fields.join(', ') : String(node.data.required_fields || '')} onChange={(e) => onData(node.id, 'required_fields', e.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="product, quantity, delivery_address" /><p className="mt-1.5 text-xs text-gray-500">Avança apenas quando todos estiverem preenchidos; caso contrário, mantém.</p></div>
          )}
          {['variable', 'signal'].includes(String(node.data.decision_source || '')) && (
            <div className="space-y-3">
              <div><Label>Variável de decisão</Label><Input value={String(node.data.variable_name || '')} onChange={(e) => onData(node.id, 'variable_name', e.target.value)} placeholder={node.data.decision_source === 'signal' ? 'phase_signal' : 'confirmed'} /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Valor para avançar</Label><Input value={String(node.data.advance_value || 'sim')} onChange={(e) => onData(node.id, 'advance_value', e.target.value)} /></div><div><Label>Valor para voltar</Label><Input value={String(node.data.back_value || 'voltar')} onChange={(e) => onData(node.id, 'back_value', e.target.value)} /></div></div>
            </div>
          )}
          {String(node.data.decision_source || '') === 'attempts' && (
            <div><Label>Tentativas antes de avançar</Label><Input type="number" min={1} max={20} value={Number(node.data.advance_after_attempts || 1)} onChange={(e) => onData(node.id, 'advance_after_attempts', Math.max(1, Number(e.target.value) || 1))} /></div>
          )}
          <div><Label>Máximo de permanências</Label><Input type="number" min={1} max={20} value={Number(node.data.max_stays || 3)} onChange={(e) => onData(node.id, 'max_stays', Math.max(1, Number(e.target.value) || 1))} /><p className="mt-1.5 text-xs text-gray-500">Ao atingir o limite, retorna pela saída “voltar” para evitar loops silenciosos.</p></div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold"><span className="rounded-xl bg-amber-50 px-2 py-2 text-amber-700">voltar</span><span className="rounded-xl bg-sky-50 px-2 py-2 text-sky-700">manter</span><span className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-700">avançar</span></div>
        </div>
      )}

      {node.type === 'condition' && node.subtype !== 'phase_manager' && (
        <div>
          <Label>Valor de comparação</Label>
          <Input
            value={String(node.data.threshold || node.data.tag || node.data.status || node.data.value || '')}
            onChange={(e) => {
              const key =
                node.subtype === 'tag_check'
                  ? 'tag'
                  : node.subtype === 'status_check'
                    ? 'status'
                    : node.subtype === 'value_check'
                      ? 'value'
                      : 'threshold'
              onData(node.id, key, e.target.value)
            }}
            placeholder="Ex.: 50, interessado, converted..."
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Saídas: <strong className="font-semibold text-gray-700">sim</strong> e{' '}
            <strong className="font-semibold text-gray-700">não</strong> (handles yes/no).
          </p>
        </div>
      )}

      {node.type === 'delay' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              min={1}
              value={Number(node.data.value || node.data.minutes || 1)}
              onChange={(e) => {
                const v = Number(e.target.value)
                onData(node.id, 'value', v)
                onData(node.id, 'minutes', v)
              }}
            />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select
              value={node.subtype}
              onChange={(e) => onChange(node.id, { subtype: e.target.value })}
            >
              <option value="wait_minutes">Minutos</option>
              <option value="wait_hours">Horas</option>
              <option value="wait_days">Dias</option>
            </Select>
          </div>
        </div>
      )}

      {node.subtype === 'change_status' && (
        <div>
          <Label>Novo status</Label>
          <Select
            value={String(node.data.new_status || node.data.status || '')}
            onChange={(e) => {
              onData(node.id, 'new_status', e.target.value)
              onData(node.id, 'status', e.target.value)
            }}
          >
            <option value="">Selecione…</option>
            {['new', 'contacted', 'replied', 'negotiating', 'converted', 'lost'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}

      {node.subtype === 'add_tag' && (
        <div>
          <Label>Tag</Label>
          <Input
            value={String(node.data.tag || '')}
            onChange={(e) => onData(node.id, 'tag', e.target.value)}
            placeholder="interessado"
          />
        </div>
      )}

      {node.subtype === 'update_score' && (
        <div>
          <Label>Delta de score</Label>
          <Input
            type="number"
            value={Number(node.data.delta ?? 10)}
            onChange={(e) => onData(node.id, 'delta', Number(e.target.value))}
          />
        </div>
      )}

      {node.subtype === 'webhook' && (
        <div className="space-y-3">
          <div>
            <Label>URL</Label>
            <Input
              type="url"
              value={String(node.data.url || '')}
              onChange={(e) => onData(node.id, 'url', e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Método</Label>
            <Select
              value={String(node.data.method || 'POST')}
              onChange={(e) => onData(node.id, 'method', e.target.value)}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </Select>
          </div>
        </div>
      )}

      {node.subtype === 'send_notification' && (
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input
              value={String(node.data.title || '')}
              onChange={(e) => onData(node.id, 'title', e.target.value)}
            />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              value={String(node.data.message || '')}
              onChange={(e) => onData(node.id, 'message', e.target.value)}
              rows={2}
            />
          </div>
        </div>
      )}

      {node.subtype === 'handoff_agent' && (
        <div className="space-y-3">
          <div>
            <Label>Mensagem ao cliente</Label>
            <Textarea
              value={String(node.data.user_message || '')}
              onChange={(e) => onData(node.id, 'user_message', e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label>Resumo para o atendente</Label>
            <Input
              value={String(node.data.summary || '')}
              onChange={(e) => onData(node.id, 'summary', e.target.value)}
            />
          </div>
        </div>
      )}

      {node.type === 'end' && (
        <p className="text-sm text-gray-600 leading-relaxed">
          Encerra a jornada nesta execução. Motivos personalizados entram em fases futuras.
        </p>
      )}
    </div>
  )
}

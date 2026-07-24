export type PricingMeasure = 'unit' | 'kg' | 'liter' | 'box' | 'package' | 'pair' | 'meter'
export type ProductVolumePricingTier = { id: string; up_to: number | null; price_per_measure: number }
export type ProductVolumePricing = { enabled?: boolean; measure?: PricingMeasure; measure_per_item?: number; unit_weight_kg?: number; tiers?: Array<ProductVolumePricingTier & { up_to_kg?: number | null; price_per_kg?: number }> }

export const PRICING_MEASURE_LABELS: Record<PricingMeasure, { singular: string; plural: string; short: string }> = {
  unit: { singular: 'unidade', plural: 'unidades', short: 'un' },
  kg: { singular: 'quilo', plural: 'quilos', short: 'kg' },
  liter: { singular: 'litro', plural: 'litros', short: 'L' },
  box: { singular: 'caixa', plural: 'caixas', short: 'cx' },
  package: { singular: 'pacote', plural: 'pacotes', short: 'pct' },
  pair: { singular: 'par', plural: 'pares', short: 'par' },
  meter: { singular: 'metro', plural: 'metros', short: 'm' },
}

const aliases: Record<string, PricingMeasure> = { un:'unit', unidade:'unit', unidades:'unit', unit:'unit', kg:'kg', g:'kg', grama:'kg', gramas:'kg', l:'liter', lt:'liter', litro:'liter', litros:'liter', ml:'liter', cx:'box', caixa:'box', caixas:'box', box:'box', pct:'package', pacote:'package', pacotes:'package', package:'package', par:'pair', pares:'pair', pair:'pair', m:'meter', metro:'meter', metros:'meter', meter:'meter' }
function parseUnit(unit: unknown) { const value=String(unit||'un').trim().toLowerCase().replace(',','.'); const match=value.match(/^(\d+(?:\.\d+)?)\s*([a-zç]+)$/i); return match ? {amount:Number(match[1])||1,token:match[2]} : {amount:1,token:value} }
export function normalizePricingMeasure(unit: unknown, configured?: unknown): PricingMeasure { const requested=String(configured||'').trim().toLowerCase(); if(requested&&aliases[requested]) return aliases[requested]; return aliases[parseUnit(unit).token]||'unit' }
export function measurePerSaleItem(unit: unknown, measure: PricingMeasure, configured?: unknown) { const explicit=Number(configured); if(Number.isFinite(explicit)&&explicit>0)return explicit; const parsed=parseUnit(unit); if(measure==='kg'&&parsed.token==='g')return parsed.amount/1000; if(measure==='liter'&&parsed.token==='ml')return parsed.amount/1000; return parsed.amount>0?parsed.amount:1 }

function normalizedTiers(config?: ProductVolumePricing) {
  return (Array.isArray(config?.tiers) ? config!.tiers! : []).map((tier:any,index)=>({ id:String(tier?.id||`price_${index+1}`), up_to:tier?.up_to==null&&tier?.up_to_kg==null?null:Number(tier?.up_to??tier?.up_to_kg), price_per_measure:Number(tier?.price_per_measure??tier?.price_per_kg) })).filter(t=>Number.isFinite(t.price_per_measure)&&t.price_per_measure>=0&&(t.up_to==null||(Number.isFinite(t.up_to)&&t.up_to>0))).sort((a,b)=>a.up_to==null?1:b.up_to==null?-1:a.up_to-b.up_to)
}

export function isProductVolumePricingEnabled(product: { metadata?: Record<string, any> } | null | undefined): boolean {
  const config = product?.metadata?.volume_pricing as ProductVolumePricing | undefined
  return Boolean(config?.enabled && normalizedTiers(config).length > 0)
}

export type ProductVolumeTierDisplay = {
  id: string
  up_to: number | null
  price_per_measure: number
  itemUnitPrice: number
  /** Início inclusivo da faixa na medida (kg, un…). */
  rangeFrom: number
  /** Fim da faixa na medida; null = sem limite. */
  rangeTo: number | null
  /** Quantidade mínima de itens de venda para entrar nesta faixa. */
  minQuantity: number
  /** Rótulo legível da faixa (ex.: “Até 10 kg”). */
  rangeLabel: string
  /** Economia % vs 1ª faixa (0 na primeira). */
  discountVsFirst: number
}

function formatMeasureAmount(value: number, short: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return `0 ${short}`
  const formatted = n.toLocaleString('pt-BR', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
  return `${formatted} ${short}`
}

/**
 * Lista faixas para UI do catálogo (escada “quanto mais, mais barato”).
 * Retorna null se o produto não tem precificação progressiva ativa.
 */
export function listProductVolumePricingTiers(
  product: { unit?: unknown; metadata?: Record<string, any> } | null | undefined,
): { measure: PricingMeasure; measurePerItem: number; tiers: ProductVolumeTierDisplay[] } | null {
  if (!product) return null
  const config = product.metadata?.volume_pricing as ProductVolumePricing | undefined
  if (!config?.enabled) return null
  const tiers = normalizedTiers(config)
  if (tiers.length < 1) return null
  const measure = normalizePricingMeasure(product.unit, config.measure)
  const measurePerItem = measurePerSaleItem(
    product.unit,
    measure,
    config.measure_per_item ?? (measure === 'kg' ? config.unit_weight_kg : undefined),
  )
  const short = PRICING_MEASURE_LABELS[measure].short
  const firstPrice = tiers[0]?.price_per_measure ?? 0
  const rows: ProductVolumeTierDisplay[] = tiers.map((tier, index) => {
    const prevUpTo = index === 0 ? 0 : Number(tiers[index - 1]?.up_to ?? 0)
    const rangeFrom = index === 0 ? 0 : prevUpTo
    const rangeTo = tier.up_to
    // Qtd mínima de itens para atingir esta faixa: logo após o teto da anterior
    const minMeasure = index === 0 ? measurePerItem : prevUpTo + measurePerItem
    const minQuantity = Math.max(1, Math.ceil(minMeasure / Math.max(measurePerItem, 1e-9)))
    const itemUnitPrice = Number((tier.price_per_measure * measurePerItem).toFixed(4))
    const discountVsFirst =
      firstPrice > 0 && tier.price_per_measure < firstPrice
        ? Math.round((1 - tier.price_per_measure / firstPrice) * 100)
        : 0
    let rangeLabel: string
    if (index === 0 && rangeTo != null) {
      rangeLabel = `Até ${formatMeasureAmount(rangeTo, short)}`
    } else if (rangeTo == null) {
      rangeLabel = index === 0 ? `A partir de ${formatMeasureAmount(measurePerItem, short)}` : `Acima de ${formatMeasureAmount(rangeFrom, short)}`
    } else {
      rangeLabel = `${formatMeasureAmount(rangeFrom, short)} – ${formatMeasureAmount(rangeTo, short)}`
    }
    return {
      id: tier.id,
      up_to: tier.up_to,
      price_per_measure: tier.price_per_measure,
      itemUnitPrice,
      rangeFrom,
      rangeTo,
      minQuantity,
      rangeLabel,
      discountVsFirst,
    }
  })
  return { measure, measurePerItem, tiers: rows }
}

/** Menor preço unitário entre as faixas (para “a partir de” no card). */
export function getProductVolumePricingFromPrice(
  product: { unit?: unknown; metadata?: Record<string, any>; price?: unknown } | null | undefined,
): number | null {
  const listed = listProductVolumePricingTiers(product)
  if (!listed?.tiers.length) return null
  const min = Math.min(...listed.tiers.map((t) => t.itemUnitPrice))
  return Number.isFinite(min) ? min : null
}

export function validateProductVolumePricing(tiers: ProductVolumePricingTier[]): string | null {
  if (!tiers.length) return 'Adicione ao menos uma faixa.'
  if (tiers.filter(t => t.up_to == null).length !== 1 || tiers[tiers.length - 1]?.up_to != null) return 'A última faixa deve ser sem limite.'
  for (let index=0;index<tiers.length;index+=1) { const current=tiers[index]; const previous=tiers[index-1]; if(!Number.isFinite(current.price_per_measure)||current.price_per_measure<0)return `Informe o preço da faixa ${index+1}.`; if(current.up_to!=null&&(!Number.isFinite(current.up_to)||current.up_to<=0))return `Informe um limite válido na faixa ${index+1}.`; if(current.up_to!=null&&previous?.up_to!=null&&current.up_to<=previous.up_to)return 'Os limites precisam crescer sem sobreposição.'; if(previous&&current.price_per_measure>previous.price_per_measure)return 'O preço não pode aumentar nas faixas maiores.' }
  return null
}

export function resolveProductVolumePrice(product:{unit?:unknown;metadata?:Record<string,any>},quantity:number) {
  const config=product.metadata?.volume_pricing as ProductVolumePricing|undefined
  if(!config?.enabled)return null
  const measure=normalizePricingMeasure(product.unit,config.measure)
  const perItem=measurePerSaleItem(product.unit,measure,config.measure_per_item??(measure==='kg'?config.unit_weight_kg:undefined))
  const measureQuantity=Math.max(0,Number(quantity)||0)*perItem
  if(measureQuantity<=0)return null
  const tier=normalizedTiers(config).find(t=>t.up_to==null||measureQuantity<=t.up_to)
  if(!tier)return null
  return { measure, measureQuantity, measurePerItem:perItem, pricePerMeasure:tier.price_per_measure, itemUnitPrice:Number((tier.price_per_measure*perItem).toFixed(4)), tier }
}

export function getProductVolumePricingOpportunity(product:{unit?:unknown;metadata?:Record<string,any>},quantity:number) {
  const current=resolveProductVolumePrice(product,quantity); const config=product.metadata?.volume_pricing as ProductVolumePricing|undefined
  if(!current||!config)return null
  const tiers=normalizedTiers(config); const index=tiers.findIndex(t=>t.id===current.tier.id); const next=index>=0?tiers[index+1]:undefined
  if(!next||current.tier.up_to==null||next.price_per_measure>=current.pricePerMeasure)return null
  const targetMeasure=current.tier.up_to+current.measurePerItem; const targetQuantity=Math.max(quantity+1,Math.ceil(targetMeasure/current.measurePerItem)); const remainingItems=targetQuantity-quantity
  return { current,next,targetQuantity,remainingItems,remainingMeasure:remainingItems*current.measurePerItem,remainingKg:current.measure==='kg'?remainingItems*current.measurePerItem:0,savingsAtTarget:targetMeasure*(current.pricePerMeasure-next.price_per_measure),measure:current.measure }
}

export function productCartWeightKg(product:{name?:unknown;unit?:unknown;weight?:unknown;weight_unit?:unknown;metadata?:Record<string,any>},quantity:number):number { const parsed=parseUnit(product.unit); if(parsed.token==='kg'||parsed.token==='g')return (parsed.token==='g'?parsed.amount/1000:parsed.amount)*Math.max(0,Number(quantity)||0); const configured=Number(product.metadata?.shipping_weight_kg??product.metadata?.volume_pricing?.unit_weight_kg); if(Number.isFinite(configured)&&configured>0)return configured*Math.max(0,Number(quantity)||0); const raw=Number(String(product.weight||'').replace(',','.')); if(!Number.isFinite(raw)||raw<=0){const match=String(product.name||'').match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);if(!match)return 0;return Number(match[1].replace(',','.'))*(match[2].toLowerCase()==='g'?0.001:1)*Math.max(0,Number(quantity)||0)} const weightUnit=String(product.weight_unit||'kg').toLowerCase();return(weightUnit.includes('g')&&!weightUnit.includes('kg')?raw/1000:raw)*Math.max(0,Number(quantity)||0)}

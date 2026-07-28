import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, Boxes, Check, Factory, Gauge, Package,
  Plus, RefreshCw, Scale, Trash2, TriangleAlert, X,
} from 'lucide-react'
import { stockApi } from '@/lib/api-admin'
import type { InventoryProduct, ShowToast } from '../types'

type Lot = {
  id: string
  material_id: string
  material_name: string
  lot_code: string
  available_quantity: number
  unit: string
  supplier?: string
}
type Material = { id: string; name: string; unit: string; available_quantity: number; open_lots: number }
type InputLine = { lot_id: string; quantity: string }
type OutputLine = { product_id: string; quantity: string; unit_weight_kg: string }
type RecipeIngredient = { material_id: string; quantity: string; unit: string }

const num = (value: unknown, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits })
const kg = (value: unknown) => `${num(value, 3)} kg`
const productId = (p: InventoryProduct) => String(p.product_id || p.id || '')
const productName = (p: InventoryProduct) => String(p.product_name || p.name || 'Produto')
const unitToKg: Record<string, number> = { kg: 1, g: .001, t: 1000, ton: 1000, tonelada: 1000, toneladas: 1000 }
const fieldClass = 'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5'

export function ProductionView({ showToast }: { showToast: ShowToast }) {
  const [section, setSection] = useState<'overview' | 'receipt' | 'recipe' | 'batch'>('overview')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<any>({})
  const [materials, setMaterials] = useState<Material[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [recipes, setRecipes] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const [materialId, setMaterialId] = useState('')
  const [materialName, setMaterialName] = useState('')
  const [receiptQuantity, setReceiptQuantity] = useState('')
  const [receiptUnit, setReceiptUnit] = useState('kg')
  const [supplier, setSupplier] = useState('')
  const [lotCode, setLotCode] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [receiptNotes, setReceiptNotes] = useState('')

  const [batchCode, setBatchCode] = useState('')
  const [batchNotes, setBatchNotes] = useState('')
  const [inputs, setInputs] = useState<InputLine[]>([{ lot_id: '', quantity: '' }])
  const [outputs, setOutputs] = useState<OutputLine[]>([{ product_id: '', quantity: '', unit_weight_kg: '' }])
  const [recipeProductId, setRecipeProductId] = useState('')
  const [recipeOutputQuantity, setRecipeOutputQuantity] = useState('1')
  const [recipeUnitWeight, setRecipeUnitWeight] = useState('')
  const [recipeLoss, setRecipeLoss] = useState('')
  const [recipeNotes, setRecipeNotes] = useState('')
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([{ material_id: '', quantity: '', unit: 'kg' }])

  async function load() {
    setLoading(true)
    try {
      const [d, m, l, p, r] = await Promise.all([
        stockApi.manufacturingDashboard(),
        stockApi.manufacturingMaterials(),
        stockApi.manufacturingLots(true),
        stockApi.products(500),
        stockApi.manufacturingRecipes(),
      ])
      setDashboard(d || {})
      setMaterials(m.materials || [])
      setLots(l.lots || [])
      setProducts(p.products || p.items || [])
      setRecipes(r.recipes || [])
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível carregar a produção', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const review = useMemo(() => {
    let inputKg = 0
    let inputComparable = true
    for (const line of inputs) {
      const lot = lots.find((item) => item.id === line.lot_id)
      const factor = unitToKg[String(lot?.unit || '').toLowerCase()]
      if (!factor) inputComparable = false
      else inputKg += Number(line.quantity || 0) * factor
    }
    let outputKg = 0
    let outputComparable = true
    for (const line of outputs) {
      const weight = Number(line.unit_weight_kg || 0)
      if (!weight) outputComparable = false
      else outputKg += Number(line.quantity || 0) * weight
    }
    const comparable = inputComparable && outputComparable && inputKg > 0
    return {
      inputKg,
      outputKg,
      wasteKg: comparable ? Math.max(0, inputKg - outputKg) : null,
      yieldPercent: comparable ? outputKg / inputKg * 100 : null,
    }
  }, [inputs, outputs, lots])

  async function receive() {
    if (!materialId && !materialName.trim()) return showToast('Informe a matéria-prima', 'error')
    if (Number(receiptQuantity) <= 0) return showToast('Informe uma quantidade válida', 'error')
    setSaving(true)
    try {
      await stockApi.receiveManufacturingMaterial({
        material_id: materialId || undefined,
        material_name: materialId ? undefined : materialName.trim(),
        quantity: Number(receiptQuantity),
        unit: receiptUnit,
        supplier: supplier.trim() || undefined,
        lot_code: lotCode.trim() || undefined,
        unit_cost: Number(String(unitCost).replace(',', '.')) || 0,
        notes: receiptNotes.trim() || undefined,
      })
      showToast('Entrada de matéria-prima registrada')
      setMaterialId(''); setMaterialName(''); setReceiptQuantity(''); setSupplier('')
      setLotCode(''); setUnitCost(''); setReceiptNotes('')
      await load()
      setSection('overview')
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível registrar a entrada', 'error')
    } finally {
      setSaving(false)
    }
  }

  function requestReview() {
    if (inputs.some((line) => !line.lot_id || Number(line.quantity) <= 0)) return showToast('Revise os lotes consumidos', 'error')
    if (outputs.some((line) => !line.product_id || Number(line.quantity) <= 0)) return showToast('Revise os produtos gerados', 'error')
    for (const line of inputs) {
      const lot = lots.find((item) => item.id === line.lot_id)
      if (lot && Number(line.quantity) > Number(lot.available_quantity)) return showToast(`Saldo insuficiente no lote ${lot.lot_code}`, 'error')
    }
    if (review.outputKg > review.inputKg && review.inputKg > 0) return showToast('O peso produzido não pode superar o volume consumido', 'error')
    setReviewing(true)
  }

  async function finishBatch() {
    setSaving(true)
    try {
      const result = await stockApi.createManufacturingBatch({
        batch_code: batchCode.trim() || undefined,
        notes: batchNotes.trim() || undefined,
        inputs: inputs.map((line) => ({ lot_id: line.lot_id, quantity: Number(line.quantity) })),
        outputs: outputs.map((line) => ({
          product_id: line.product_id,
          quantity: Number(line.quantity),
          unit_weight_kg: Number(String(line.unit_weight_kg).replace(',', '.')) || undefined,
        })),
      })
      showToast(`Produção ${result.batch?.batch_code || ''} concluída`)
      setInputs([{ lot_id: '', quantity: '' }])
      setOutputs([{ product_id: '', quantity: '', unit_weight_kg: '' }])
      setBatchCode(''); setBatchNotes(''); setReviewing(false)
      await load()
      setSection('overview')
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível concluir a produção', 'error')
    } finally {
      setSaving(false)
    }
  }

  function selectRecipeProduct(id: string) {
    setRecipeProductId(id)
    const recipe = recipes.find((item) => String(item.product_id) === id)
    if (!recipe) {
      setRecipeOutputQuantity('1'); setRecipeUnitWeight(''); setRecipeLoss(''); setRecipeNotes('')
      setRecipeIngredients([{ material_id: '', quantity: '', unit: 'kg' }])
      return
    }
    setRecipeOutputQuantity(String(recipe.output_quantity || 1))
    setRecipeUnitWeight(recipe.unit_weight_kg == null ? '' : String(recipe.unit_weight_kg))
    setRecipeLoss(String(recipe.expected_loss_percent || ''))
    setRecipeNotes(String(recipe.notes || ''))
    setRecipeIngredients((recipe.ingredients || []).map((item: any) => ({
      material_id: String(item.material_id),
      quantity: String(item.quantity),
      unit: String(item.unit || 'kg'),
    })))
  }

  async function saveRecipe() {
    if (!recipeProductId) return showToast('Selecione o produto final', 'error')
    if (recipeIngredients.some((item) => !item.material_id || Number(item.quantity) <= 0)) return showToast('Revise as matérias-primas da ficha', 'error')
    setSaving(true)
    try {
      await stockApi.saveManufacturingRecipe(recipeProductId, {
        output_quantity: Number(recipeOutputQuantity) || 1,
        unit_weight_kg: Number(String(recipeUnitWeight).replace(',', '.')) || undefined,
        expected_loss_percent: Number(String(recipeLoss).replace(',', '.')) || 0,
        notes: recipeNotes.trim() || undefined,
        ingredients: recipeIngredients.map((item) => ({
          material_id: item.material_id,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
      })
      showToast('Ficha técnica salva')
      await load()
      setSection('overview')
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível salvar a ficha', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function calculateFromRecipes() {
    if (outputs.some((item) => !item.product_id || Number(item.quantity) <= 0)) return showToast('Informe os produtos e quantidades planejadas', 'error')
    setSaving(true)
    try {
      const plan = await stockApi.planManufacturingBatch({
        outputs: outputs.map((item) => ({ product_id: item.product_id, quantity: Number(item.quantity) })),
      })
      setInputs((plan.inputs || []).map((item: any) => ({ lot_id: String(item.lot_id), quantity: String(item.quantity) })))
      setOutputs((plan.outputs || []).map((item: any) => ({
        product_id: String(item.product_id),
        quantity: String(item.quantity),
        unit_weight_kg: item.unit_weight_kg == null ? '' : String(item.unit_weight_kg),
      })))
      showToast('Consumo calculado por ficha técnica e lotes mais antigos')
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível calcular o consumo', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="space-y-3 animate-pulse"><div className="h-24 rounded-[22px] bg-gray-100" /><div className="grid grid-cols-2 gap-3"><div className="h-28 rounded-[20px] bg-gray-100" /><div className="h-28 rounded-[20px] bg-gray-100" /></div><div className="h-72 rounded-[22px] bg-gray-100" /></div>

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Transformação e rastreabilidade</p><h2 className="mt-1 text-[26px] font-bold tracking-tight text-gray-950">Produção</h2><p className="mt-1 text-xs text-gray-500">Da matéria-prima ao produto final, com lote, perda e rendimento.</p></div>
        <button type="button" onClick={() => void load()} aria-label="Atualizar produção" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600"><RefreshCw size={16} /></button>
      </header>

      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-gray-100 p-1">
        <Tab active={section === 'overview'} onClick={() => setSection('overview')}>Visão geral</Tab>
        <Tab active={section === 'receipt'} onClick={() => setSection('receipt')}>Dar entrada</Tab>
        <Tab active={section === 'recipe'} onClick={() => setSection('recipe')}>Ficha técnica</Tab>
        <Tab active={section === 'batch'} onClick={() => setSection('batch')}>Produzir</Tab>
      </div>

      {section === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Metric icon={<Scale size={17} />} label="Matéria-prima disponível" value={kg(dashboard.available_weight_kg)} />
            <Metric icon={<Boxes size={17} />} label="Lotes abertos" value={num(dashboard.open_lots, 0)} />
            <Metric icon={<Factory size={17} />} label="Produções em 30 dias" value={num(dashboard.last_30_days?.batches, 0)} />
            <Metric icon={<Gauge size={17} />} label="Rendimento em 30 dias" value={dashboard.last_30_days?.yield_percent == null ? 'Sem base' : `${num(dashboard.last_30_days.yield_percent, 1)}%`} />
          </div>

          <section className="rounded-[22px] border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-gray-950">Balanço dos últimos 30 dias</h3><p className="mt-0.5 text-[11px] text-gray-500">O que entrou na transformação, virou produto e foi perdido.</p></div><Factory size={19} className="text-gray-400" /></div>
            <div className="mt-4 flex items-center gap-2">
              <FlowValue label="Processado" value={kg(dashboard.last_30_days?.input_weight_kg)} />
              <ArrowRight size={16} className="shrink-0 text-gray-300" />
              <FlowValue label="Aproveitado" value={kg(dashboard.last_30_days?.output_weight_kg)} tone="success" />
              <span className="text-gray-300">+</span>
              <FlowValue label="Quebra" value={kg(dashboard.last_30_days?.waste_weight_kg)} tone="warning" />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-gray-950">Matérias-primas</h3>
            {materials.length === 0 ? <Empty icon={<Scale size={23} />} title="Nenhuma matéria-prima ainda" text="Registre a primeira entrada bruta para começar a rastrear lotes." action="Dar primeira entrada" onClick={() => setSection('receipt')} /> : (
              <div className="space-y-2">{materials.map((material) => <div key={material.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-gray-700"><Scale size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-900">{material.name}</strong><small className="text-[11px] text-gray-500">{material.open_lots} lote(s) com saldo</small></span><b className="text-sm tabular-nums text-gray-950">{num(material.available_quantity, 3)} {material.unit}</b></div>)}</div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-gray-950">Produções recentes</h3>
            {!dashboard.recent?.length ? <Empty icon={<Factory size={23} />} title="Nenhuma produção concluída" text="Ao transformar um lote, o rendimento aparecerá aqui." action="Registrar produção" onClick={() => setSection('batch')} /> : (
              <div className="space-y-2">{dashboard.recent.map((batch: any) => <div key={batch.id} className="rounded-2xl border border-gray-200 bg-white p-3.5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Factory size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{batch.batch_code}</strong><small className="text-[11px] text-gray-500">{new Date(batch.produced_at).toLocaleDateString('pt-BR')} · {batch.outputs_count} produto(s)</small></span><b className="text-sm tabular-nums">{batch.yield_percent == null ? '—' : `${num(batch.yield_percent, 1)}%`}</b></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><SmallValue label="Entrada" value={kg(batch.input_weight_kg)} /><SmallValue label="Saída" value={kg(batch.output_weight_kg)} /><SmallValue label="Quebra" value={kg(batch.waste_weight_kg)} /></div></div>)}</div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-gray-950">Fichas técnicas</h3><p className="mt-0.5 text-[11px] text-gray-500">Base da dedução inteligente de matéria-prima.</p></div><button type="button" onClick={() => setSection('recipe')} className="min-h-11 rounded-xl bg-gray-100 px-3 text-xs font-bold">{recipes.length ? 'Gerenciar' : 'Criar ficha'}</button></div>
            {recipes.length === 0 ? <Empty icon={<Package size={23} />} title="Nenhuma ficha técnica cadastrada" text="Defina quanto de matéria-prima cada produto consome para automatizar o planejamento." action="Criar primeira ficha" onClick={() => setSection('recipe')} /> : <div className="space-y-2">{recipes.slice(0, 5).map((recipe) => <button type="button" key={recipe.id} onClick={() => { selectRecipeProduct(String(recipe.product_id)); setSection('recipe') }} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100"><Package size={17} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{recipe.product_name}</strong><small className="text-[11px] text-gray-500">{recipe.ingredients?.length || 0} matéria(s)-prima(s) · rende {num(recipe.output_quantity, 3)} {recipe.product_unit || 'un'}</small></span><span className="text-[11px] font-bold text-gray-500">{num(recipe.expected_loss_percent, 1)}% perda</span></button>)}</div>}
          </section>
        </>
      )}

      {section === 'receipt' && (
        <section className="rounded-[22px] border border-gray-200 bg-white p-4 lg:p-5">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><ArrowDownToLine size={19} /></span><div><h3 className="text-base font-bold">Entrada de matéria-prima</h3><p className="mt-0.5 text-xs text-gray-500">Registra um lote independente, com saldo e origem próprios.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><FieldLabel>Matéria-prima existente</FieldLabel><select value={materialId} onChange={(e) => { setMaterialId(e.target.value); const m = materials.find((x) => x.id === e.target.value); if (m) setReceiptUnit(m.unit) }} className={fieldClass}><option value="">Cadastrar uma nova</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            {!materialId && <label className="sm:col-span-2"><FieldLabel>Nome da matéria-prima</FieldLabel><input value={materialName} onChange={(e) => setMaterialName(e.target.value)} placeholder="Ex.: Alho bruto in natura" className={fieldClass} /></label>}
            <label><FieldLabel>Quantidade recebida</FieldLabel><input value={receiptQuantity} onChange={(e) => setReceiptQuantity(e.target.value)} inputMode="decimal" placeholder="5" className={fieldClass} /></label>
            <label><FieldLabel>Unidade</FieldLabel><select value={receiptUnit} onChange={(e) => setReceiptUnit(e.target.value)} className={fieldClass}><option value="kg">Quilograma (kg)</option><option value="t">Tonelada (t)</option><option value="g">Grama (g)</option><option value="l">Litro (l)</option><option value="un">Unidade</option></select></label>
            <label><FieldLabel>Fornecedor ou produtor</FieldLabel><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nome do produtor" className={fieldClass} /></label>
            <label><FieldLabel>Código do lote</FieldLabel><input value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="Automático se vazio" className={fieldClass} /></label>
            <label><FieldLabel>Custo por {receiptUnit}</FieldLabel><input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="0,00" className={fieldClass} /></label>
            <label><FieldLabel>Observação</FieldLabel><input value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="Qualidade, safra, origem…" className={fieldClass} /></label>
          </div>
          <div className="mt-5 rounded-2xl bg-gray-50 p-3 text-xs text-gray-600"><b className="text-gray-900">Exemplo:</b> 5 toneladas serão armazenadas como 5 t e equivalem a 5.000 kg nos cálculos de rendimento.</div>
          <button type="button" disabled={saving} onClick={receive} className="mt-5 min-h-12 w-full rounded-[18px] bg-gray-950 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar entrada e criar lote'}</button>
        </section>
      )}

      {section === 'recipe' && (
        <section className="rounded-[22px] border border-gray-200 bg-white p-4 lg:p-5">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><Package size={19} /></span><div><h3 className="text-base font-bold">Ficha técnica do produto</h3><p className="mt-0.5 text-xs text-gray-500">Define o consumo previsto e orienta a seleção automática dos lotes.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><FieldLabel>Produto final</FieldLabel><select value={recipeProductId} onChange={(e) => selectRecipeProduct(e.target.value)} className={fieldClass}><option value="">Selecione o produto</option>{products.map((p) => <option key={productId(p)} value={productId(p)}>{productName(p)}</option>)}</select></label>
            <label><FieldLabel>Rendimento da ficha</FieldLabel><input value={recipeOutputQuantity} onChange={(e) => setRecipeOutputQuantity(e.target.value)} inputMode="decimal" placeholder="Ex.: 100 unidades" className={fieldClass} /></label>
            <label><FieldLabel>Peso por unidade final (kg)</FieldLabel><input value={recipeUnitWeight} onChange={(e) => setRecipeUnitWeight(e.target.value)} inputMode="decimal" placeholder="Ex.: 0,2" className={fieldClass} /></label>
            <label><FieldLabel>Perda prevista (%)</FieldLabel><input value={recipeLoss} onChange={(e) => setRecipeLoss(e.target.value)} inputMode="decimal" placeholder="Ex.: 12" className={fieldClass} /></label>
            <label><FieldLabel>Observação</FieldLabel><input value={recipeNotes} onChange={(e) => setRecipeNotes(e.target.value)} placeholder="Processo, embalagem, padrão…" className={fieldClass} /></label>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold">Matérias-primas necessárias</h4><p className="mt-0.5 text-[11px] text-gray-500">Quantidades para o rendimento informado acima.</p></div><button type="button" onClick={() => setRecipeIngredients((items) => [...items, { material_id: '', quantity: '', unit: 'kg' }])} className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100"><Plus size={16} /></button></div>
          <div className="mt-3 space-y-2">
            {recipeIngredients.map((item, index) => (
              <div key={index} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                  <select value={item.material_id} onChange={(e) => { const material = materials.find((m) => m.id === e.target.value); setRecipeIngredients((items) => items.map((x, i) => i === index ? { ...x, material_id: e.target.value, unit: material?.unit || x.unit } : x)) }} className={fieldClass}>
                    <option value="">Matéria-prima</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button type="button" aria-label="Remover matéria-prima" onClick={() => setRecipeIngredients((items) => items.length === 1 ? items : items.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-xl text-gray-400 hover:bg-white hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input value={item.quantity} onChange={(e) => setRecipeIngredients((items) => items.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x))} inputMode="decimal" placeholder="Quantidade" className={fieldClass} />
                  <select value={item.unit} onChange={(e) => setRecipeIngredients((items) => items.map((x, i) => i === index ? { ...x, unit: e.target.value } : x))} className={fieldClass}>
                    <option value="kg">kg</option><option value="g">g</option><option value="t">t</option><option value="l">l</option><option value="un">un</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">A venda deduz apenas o produto acabado. A matéria-prima é consumida uma única vez, ao concluir a produção. A ficha mantém a relação para custo, rendimento e rastreabilidade.</div>
          <button type="button" disabled={saving} onClick={saveRecipe} className="mt-5 min-h-12 w-full rounded-[18px] bg-gray-950 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar ficha técnica'}</button>
        </section>
      )}

      {section === 'batch' && (
        <div className="space-y-4">
          <section className="rounded-[22px] border border-gray-200 bg-white p-4 lg:p-5">
            <div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Factory size={19} /></span><div><h3 className="text-base font-bold">Nova produção</h3><p className="mt-0.5 text-xs text-gray-500">Consuma lotes e gere produtos finais em uma única operação.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><label><FieldLabel>Código da produção</FieldLabel><input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="Automático se vazio" className={fieldClass} /></label><label><FieldLabel>Observação</FieldLabel><input value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} placeholder="Turno, responsável, equipamento…" className={fieldClass} /></label></div>
          </section>

          <section className="rounded-[22px] border border-gray-200 bg-white p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Matéria-prima consumida</h3><p className="mt-0.5 text-[11px] text-gray-500">Escolha o lote exato para manter a rastreabilidade.</p></div><button type="button" onClick={() => setInputs((v) => [...v, { lot_id: '', quantity: '' }])} className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100"><Plus size={16} /></button></div>
            <div className="mt-3 space-y-2">{inputs.map((line, index) => { const selected = lots.find((lot) => lot.id === line.lot_id); return <div key={index} className="grid grid-cols-[minmax(0,1fr)_100px_44px] gap-2"><select value={line.lot_id} onChange={(e) => setInputs((v) => v.map((x, i) => i === index ? { ...x, lot_id: e.target.value } : x))} className={fieldClass}><option value="">Selecione o lote</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.material_name} · {lot.lot_code} · {num(lot.available_quantity, 3)} {lot.unit}</option>)}</select><label className="relative"><input value={line.quantity} onChange={(e) => setInputs((v) => v.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x))} inputMode="decimal" placeholder="Qtd." className={`${fieldClass} pr-8`} /><span className="absolute right-2 top-3.5 text-[10px] text-gray-400">{selected?.unit || ''}</span></label><button type="button" onClick={() => setInputs((v) => v.length === 1 ? v : v.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-xl text-gray-400"><Trash2 size={15} /></button></div> })}</div>
          </section>

          <section className="rounded-[22px] border border-gray-200 bg-white p-4 lg:p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Produtos gerados</h3><p className="mt-0.5 text-[11px] text-gray-500">As quantidades entrarão automaticamente no estoque final.</p></div><button type="button" onClick={() => setOutputs((v) => [...v, { product_id: '', quantity: '', unit_weight_kg: '' }])} className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100"><Plus size={16} /></button></div>
            <div className="mt-3 space-y-2">{outputs.map((line, index) => <div key={index} className="rounded-2xl border border-gray-100 p-2.5"><div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2"><select value={line.product_id} onChange={(e) => setOutputs((v) => v.map((x, i) => i === index ? { ...x, product_id: e.target.value } : x))} className={fieldClass}><option value="">Selecione o produto final</option>{products.map((p) => <option key={productId(p)} value={productId(p)}>{productName(p)}</option>)}</select><button type="button" onClick={() => setOutputs((v) => v.length === 1 ? v : v.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-xl text-gray-400"><Trash2 size={15} /></button></div><div className="mt-2 grid grid-cols-2 gap-2"><label><FieldLabel>Quantidade produzida</FieldLabel><input value={line.quantity} onChange={(e) => setOutputs((v) => v.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x))} inputMode="decimal" placeholder="Ex.: 500" className={fieldClass} /></label><label><FieldLabel>Peso de cada unidade (kg)</FieldLabel><input value={line.unit_weight_kg} onChange={(e) => setOutputs((v) => v.map((x, i) => i === index ? { ...x, unit_weight_kg: e.target.value } : x))} inputMode="decimal" placeholder="Ex.: 0,2" className={fieldClass} /></label></div></div>)}</div>
            <button type="button" disabled={saving || recipes.length === 0} onClick={calculateFromRecipes} className="mt-3 min-h-11 w-full rounded-xl border border-gray-950 bg-white text-xs font-bold text-gray-950 disabled:border-gray-200 disabled:text-gray-400">{saving ? 'Calculando…' : recipes.length ? 'Calcular consumo e escolher lotes automaticamente' : 'Cadastre uma ficha técnica para automatizar'}</button>
          </section>

          <section className="rounded-[22px] bg-gray-950 p-4 text-white">
            <div className="grid grid-cols-3 gap-2"><SmallValue label="Consumido" value={kg(review.inputKg)} dark /><SmallValue label="Produzido" value={kg(review.outputKg)} dark /><SmallValue label="Quebra estimada" value={review.wasteKg == null ? 'Informe os pesos' : kg(review.wasteKg)} dark /></div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-xs text-white/60">Rendimento estimado</span><b className="text-xl tabular-nums">{review.yieldPercent == null ? '—' : `${num(review.yieldPercent, 1)}%`}</b></div>
          </section>

          <button type="button" onClick={requestReview} className="min-h-12 w-full rounded-[18px] bg-gray-950 text-sm font-bold text-white">Revisar fechamento da produção</button>
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 lg:items-center lg:p-6">
          <section className="w-full rounded-t-[26px] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] lg:max-w-lg lg:rounded-[26px]">
            <div className="flex items-start justify-between gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><TriangleAlert size={21} /></span><button type="button" onClick={() => setReviewing(false)} className="grid h-11 w-11 place-items-center rounded-xl bg-gray-100"><X size={16} /></button></div>
            <h3 className="mt-4 text-lg font-bold">Confirmar transformação?</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">Esta ação consumirá o saldo dos lotes selecionados e adicionará os produtos gerados ao estoque.</p>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4"><div className="flex justify-between text-sm"><span>Matéria-prima</span><b>{kg(review.inputKg)}</b></div><div className="mt-2 flex justify-between text-sm"><span>Produtos gerados</span><b>{kg(review.outputKg)}</b></div><div className="mt-2 flex justify-between text-sm"><span>Quebra calculada</span><b>{review.wasteKg == null ? 'Sem peso suficiente' : kg(review.wasteKg)}</b></div><div className="mt-3 flex justify-between border-t border-gray-200 pt-3"><span className="text-sm font-semibold">Rendimento</span><b>{review.yieldPercent == null ? '—' : `${num(review.yieldPercent, 1)}%`}</b></div></div>
            <button type="button" disabled={saving} onClick={finishBatch} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-gray-950 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Concluindo…' : <><Check size={17} /> Confirmar e atualizar estoques</>}</button>
            <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="mt-2 min-h-11 w-full rounded-xl text-sm font-semibold text-gray-600">Voltar e editar</button>
          </section>
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-xl px-2 text-[11px] font-bold transition ${active ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>{children}</button>
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-[20px] border border-gray-200 bg-white p-3.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 text-gray-700">{icon}</span><b className="mt-3 block truncate text-lg tabular-nums text-gray-950">{value}</b><p className="mt-0.5 text-[10px] font-semibold leading-4 text-gray-500">{label}</p></div>
}
function FlowValue({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'warning' }) {
  const styles = tone === 'success' ? 'bg-emerald-50 text-emerald-800' : tone === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-800'
  return <div className={`min-w-0 flex-1 rounded-xl p-2.5 ${styles}`}><small className="block truncate text-[9px] font-bold uppercase opacity-60">{label}</small><b className="mt-1 block truncate text-xs tabular-nums">{value}</b></div>
}
function SmallValue({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return <div className={`min-w-0 rounded-xl p-2.5 ${dark ? 'bg-white/[0.07]' : 'bg-gray-50'}`}><small className={`block truncate text-[9px] font-bold uppercase ${dark ? 'text-white/45' : 'text-gray-400'}`}>{label}</small><b className={`mt-1 block truncate text-xs tabular-nums ${dark ? 'text-white' : 'text-gray-900'}`}>{value}</b></div>
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">{children}</span>
}
function Empty({ icon, title, text, action, onClick }: { icon: React.ReactNode; title: string; text: string; action: string; onClick: () => void }) {
  return <div className="rounded-[22px] border border-dashed border-gray-300 bg-white px-5 py-9 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-500">{icon}</span><h4 className="mt-3 text-sm font-bold">{title}</h4><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500">{text}</p><button type="button" onClick={onClick} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-950 px-4 text-xs font-bold text-white"><Plus size={15} />{action}</button></div>
}

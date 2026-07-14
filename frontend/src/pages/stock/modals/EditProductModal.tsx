import { useState, useEffect, useRef } from 'react'
import {
  Package, Search, ArrowDown, ArrowUp, Scale, History, Settings, Pencil, Upload, Loader2,
} from 'lucide-react'
import { inventoryApi } from '@/lib/api-admin'
import { Button, Input, Badge } from '@/components/ui'
import type { InventoryProduct, Movement, Category, ShowToast } from '../types'
import {
  money, num, dt, unitShort, isDigital, fmtQty, movBadge, typeLabel,
} from '../helpers'
import { getSessionHeaders } from '../auth'
import {
  Sheet, FieldText, FieldNumber, FieldSelect,
} from '../ui'

export function EditProductModal({ product, categories, onClose, onDone, showToast }: {
  product?: InventoryProduct; categories: Category[]; onClose: () => void; onDone: () => void
  showToast: (t: string, tp?: 'success' | 'error') => void
}) {
  const isNew = !product
  const pid = product?.product_id || product?.id || ''
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(!!pid)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('unidade')
  const [price, setPrice] = useState('')
  const [promoPrice, setPromoPrice] = useState('')
  const [category, setCategory] = useState('')
  const [active, setActive] = useState(true)
  const [features, setFeatures] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pid) return
    fetch(`/api/products/${pid}`, {
      headers: getSessionHeaders(),
    }).then(r => r.json()).then(d => {
      const p = d.product || d
      setName(p.name || '')
      setDescription(p.description || '')
      setUnit(p.unit || 'unidade')
      setPrice(String(p.price || ''))
      setPromoPrice(String(p.promoPrice || p.promo_price || ''))
      setCategory(String(p.category || ''))
      setActive(p.active !== undefined ? p.active : p.is_active !== false)
      setFeatures(Array.isArray(p.features) ? p.features.join(', ') : (p.features || ''))
      setImagePreview(p.image_url || p.imageUrl || p.image || '')
      setDetail(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [pid])

  function pickImage() { fileRef.current?.click() }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  async function submit(saveAsDraft = false) {
    if (saveAsDraft) {
      if (!name.trim() && !description.trim()) {
        showToast('Informe ao menos o nome ou a descrição para salvar o rascunho', 'error')
        return
      }
    } else if (!name.trim()) {
      showToast('Nome obrigatório', 'error')
      return
    }

    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        unit,
        price: price === '' ? 0 : Number(price) || 0,
        promoPrice: Number(promoPrice) > 0 ? Number(promoPrice) : null,
        category: category || null,
        active: saveAsDraft ? false : active,
        save_as_draft: saveAsDraft,
        features: features.split(',').map(f => f.trim()).filter(Boolean),
      }
      const headers = getSessionHeaders()

      let savedId = pid
      const url = isNew ? '/api/products' : `/api/products/${pid}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erro ${res.status} ao salvar produto`)
      savedId = data.product?.id || data.id || pid

      if (imageFile && savedId) {
        const fd = new FormData()
        fd.append('image', imageFile)
        const imgHeaders: Record<string, string> = {}
        if (headers.Authorization) imgHeaders.Authorization = headers.Authorization
        if (headers['x-brand-id']) imgHeaders['x-brand-id'] = headers['x-brand-id']
        const imgRes = await fetch(`/api/products/${savedId}/image`, { method: 'POST', headers: imgHeaders, body: fd })
        if (!imgRes.ok) {
          const imgData = await imgRes.json().catch(() => ({}))
          throw new Error(imgData.error || 'Produto salvo, mas falhou ao enviar a imagem')
        }
      }

      if (data.draft || saveAsDraft) {
        const missing = Array.isArray(data.missing_fields) ? data.missing_fields : []
        const hint = missing.length
          ? ` Falta: ${missing.map((f: string) => ({ name: 'nome', category: 'categoria', price: 'preço' }[f] || f)).join(', ')}.`
          : ''
        showToast(`Salvo como rascunho.${hint}`)
      } else {
        showToast(isNew ? 'Produto criado' : 'Produto salvo')
      }
      onDone()
    } catch (e: any) { showToast(e.message || 'Erro ao salvar produto', 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <Sheet onClose={onClose}><div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={20} /></div></Sheet>

  const unitOptions: [string, string][] = [
    ['unidade', 'Unidade'], ['kg', 'Kilograma'], ['g', 'Grama'], ['litro', 'Litro'], ['ml', 'Mililitro'],
    ['metro', 'Metro'], ['cm', 'Centímetro'], ['caixa', 'Caixa'], ['pacote', 'Pacote'], ['par', 'Par'], ['digital', 'Digital'],
  ]

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[20px] font-bold tracking-tight text-gray-900 mb-4">
        {isNew ? 'Novo produto' : 'Editar produto'}
      </h2>

      {/* Image */}
      <div className="mb-4">
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={onFileChange} />
        <button
          onClick={pickImage}
          className="w-full h-32 bg-gray-50 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:bg-gray-100 hover:border-gray-300 transition overflow-hidden"
        >
          {imagePreview ? (
            <img src={imagePreview} alt="" className="w-full h-full object-contain" />
          ) : (
            <>
              <Upload size={20} strokeWidth={1.5} className="text-gray-400" />
              <span className="text-[12px] text-gray-500">Clique para enviar imagem</span>
            </>
          )}
        </button>
      </div>

      <FieldText label="Nome" value={name} onChange={setName} placeholder="Nome do produto" />
      <div className="mt-3">
        <label className="block text-[11px] font-semibold text-gray-600 mb-1.5 tracking-wide">Descrição</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-white text-sm text-gray-900 placeholder:text-gray-400 resize-y focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition-[border,box-shadow] duration-150"
        />
      </div>
      <FieldSelect label="Unidade" value={unit} onChange={setUnit} options={unitOptions} />
      <FieldNumber label="Preço (R$)" value={price} onChange={setPrice} min={0} step="0.01" />
      <FieldNumber label="Preço promo (R$)" value={promoPrice} onChange={setPromoPrice} min={0} step="0.01" />
      <FieldSelect label="Categoria" value={category} onChange={setCategory}
        options={[['', 'Nenhuma'], ...categories.map(c => [c.id, c.name] as [string, string])]} />
      <FieldSelect label="Status" value={active ? 'true' : 'false'} onChange={v => setActive(v === 'true')}
        options={[['true', 'Ativo'], ['false', 'Inativo']]} />
      <FieldText label="Destaques (separados por vírgula)" value={features} onChange={setFeatures} placeholder="Ex: sem glúten, orgânico" />

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" onClick={onClose} fullWidth>Cancelar</Button>
        <Button variant="secondary" onClick={() => submit(true)} loading={saving} fullWidth>
          {saving ? 'Salvando' : 'Rascunho'}
        </Button>
        <Button onClick={() => submit(false)} loading={saving} fullWidth>
          {saving ? 'Salvando' : isNew ? 'Criar produto' : 'Salvar'}
        </Button>
      </div>
    </Sheet>
  )
}

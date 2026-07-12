import { useEffect, useRef, useState } from 'react'
import { Copy, Image, Trash2, Eye, EyeOff, Upload, Loader2 } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'
import type { AffiliateMaterial } from '@/lib/affiliates/types'

const CATEGORIES = [
  { value: 'promo', label: 'Promoção' },
  { value: 'story', label: 'Stories' },
  { value: 'reels', label: 'Reels' },
  { value: 'banner', label: 'Banner' },
] as const

const CHANNELS = [
  { value: 'geral', label: 'Geral' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
] as const

type MaterialForm = {
  title: string
  type: string
  media_url: string
  region: string
  category: string
  channel: string
  gallery_item_id: string
  program_id: string
}

const emptyForm = (): MaterialForm => ({
  title: '',
  type: 'image',
  media_url: '',
  region: '',
  category: 'promo',
  channel: 'geral',
  gallery_item_id: '',
  program_id: '',
})

type Props = {
  materials: AffiliateMaterial[]
  onRefresh: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
  /** Quando definido, materiais ficam vinculados a este programa */
  programId?: string
  /** Oculta seletor de programa e força programId */
  lockProgram?: boolean
}

export function AffiliateMaterialsSection({
  materials,
  onRefresh,
  showToast,
  saving,
  setSaving,
  programId,
  lockProgram = false,
}: Props) {
  const [form, setForm] = useState<MaterialForm>(() => ({
    ...emptyForm(),
    program_id: programId || '',
  }))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filterChannel, setFilterChannel] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (programId) {
      setForm((f) => ({ ...f, program_id: programId }))
    }
  }, [programId])

  useEffect(() => {
    if (!brandId || lockProgram) return
    fetch(`/api/affiliate-programs?brand_id=${encodeURIComponent(brandId)}&include_draft=1`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => setPrograms((d.programs || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {})
  }, [brandId, lockProgram])

  function onGalleryPick(item: GalleryItem) {
    setForm((f) => ({
      ...f,
      title: f.title || item.name,
      type: item.type,
      media_url: item.url,
      gallery_item_id: item.id,
    }))
    setPickerOpen(false)
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const headers = { ...getHeaders() }
      delete headers['Content-Type']
      const r = await fetch('/api/media/upload', { method: 'POST', headers, body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha no upload')
      const url = String(d.file?.url || '').trim()
      if (!url) throw new Error('URL do arquivo não retornada')
      const isVideo = String(d.file?.mimeType || file.type || '').startsWith('video/')
      setForm((f) => ({
        ...f,
        title: f.title || file.name.replace(/\.[^.]+$/, ''),
        type: isVideo ? 'video' : 'image',
        media_url: url,
        gallery_item_id: '',
      }))
      showToast('Arquivo enviado!')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro no upload', 'err')
    } finally {
      setUploading(false)
    }
  }

  async function addMaterial() {
    if (!form.title.trim()) return showToast('Título obrigatório', 'err')
    if (!form.media_url.trim()) return showToast('Envie um arquivo, escolha da galeria ou cole uma URL', 'err')
    setSaving(true)
    try {
      const r = await fetch('/api/affiliates/materials', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...form,
          brand_id: brandId,
          program_id: lockProgram && programId ? programId : (form.program_id || null),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Material publicado para afiliados!')
      setForm({ ...emptyForm(), program_id: programId || '' })
      onRefresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function togglePublish(m: AffiliateMaterial) {
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/materials/${m.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ is_published: !m.is_published }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      onRefresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  async function removeMaterial(id: string) {
    if (!confirm('Remover este material?')) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/materials/${id}`, { method: 'DELETE', headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Material removido')
      onRefresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  const scoped = lockProgram && programId
    ? materials.filter((m) => !m.program_id || m.program_id === programId)
    : materials
  const filtered = filterChannel
    ? scoped.filter((m) => m.channel === filterChannel || m.channel === 'geral')
    : scoped

  return (
    <div className="affiliates-page__section">
      <div className="affiliates-page__form-card">
        <h3 className="affiliates-page__form-title">
          {lockProgram ? 'Novo material deste programa' : 'Novo material de divulgação'}
        </h3>
        <p className="affiliates-page__field-hint mb-3">
          Envie imagem ou vídeo, escolha da galeria ou cole URL. A legenda é gerada pelo afiliado no app — aqui você só publica a mídia.
        </p>
        <div className="affiliates-page__form-grid">
          <label className="affiliates-page__field">
            <span>Título *</span>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="affiliates-page__field">
            <span>Categoria</span>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="affiliates-page__field">
            <span>Canal</span>
            <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
              {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          {!lockProgram && (
            <label className="affiliates-page__field">
              <span>Programa (opcional)</span>
              <select value={form.program_id} onChange={(e) => setForm((f) => ({ ...f, program_id: e.target.value }))}>
                <option value="">Todos os programas</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="affiliates-page__field">
            <span>Região (opcional)</span>
            <input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="BH, Contagem…" />
          </label>
          <div className="affiliates-page__field affiliates-page__field--wide">
            <span>Mídia *</span>
            <div className="affiliates-mat__media-row">
              {form.media_url ? (
                <div className="affiliates-mat__preview">
                  {form.type === 'video' ? (
                    <video src={form.media_url} className="affiliates-mat__thumb" muted />
                  ) : (
                    <img src={form.media_url} alt="" className="affiliates-mat__thumb" />
                  )}
                </div>
              ) : (
                <div className="affiliates-mat__preview affiliates-mat__preview--empty">
                  <Image size={20} className="opacity-40" />
                </div>
              )}
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="affiliates-page__btn affiliates-page__btn--ghost"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Enviar arquivo
                  </button>
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => setPickerOpen(true)}>
                    Galeria
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadFile(file)
                    e.target.value = ''
                  }}
                />
                <input
                  value={form.media_url}
                  onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value, gallery_item_id: '' }))}
                  placeholder="ou cole URL https://…"
                />
              </div>
            </div>
          </div>
        </div>
        <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" disabled={saving || uploading} onClick={addMaterial}>
          Publicar para afiliados
        </button>
      </div>

      <div className="affiliates-mat__toolbar">
        <span className="text-xs font-bold text-gray-500">{filtered.length} materiais</span>
        <select className="affiliates-mat__filter" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
          <option value="">Todos os canais</option>
          {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="affiliates-mat__empty">
          <Image size={28} className="opacity-30" />
          <p>Nenhum material cadastrado</p>
          <p className="text-xs text-gray-400">Faça upload ou use a galeria para disponibilizar artes aos afiliados</p>
        </div>
      ) : (
        <div className="affiliates-mat__grid">
          {filtered.map((m) => (
            <article key={m.id} className={`affiliates-mat__card${m.is_published === false ? ' affiliates-mat__card--draft' : ''}`}>
              <div className="affiliates-mat__card-media">
                {m.media_url ? (
                  m.type === 'video' ? (
                    <video src={m.media_url} className="affiliates-mat__card-img" muted />
                  ) : (
                    <img src={m.media_url} alt={m.title} className="affiliates-mat__card-img" />
                  )
                ) : (
                  <div className="affiliates-mat__card-img affiliates-mat__card-img--text">
                    <Copy size={22} className="opacity-35" />
                  </div>
                )}
                <span className="affiliates-mat__badge">{m.category || m.type}</span>
              </div>
              <div className="affiliates-mat__card-body">
                <p className="affiliates-mat__card-title">{m.title}</p>
                <p className="affiliates-mat__card-meta">
                  {m.channel || 'geral'}{m.region ? ` · ${m.region}` : ''}
                </p>
                <div className="affiliates-mat__card-actions">
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--sm affiliates-page__btn--ghost" disabled={saving} onClick={() => togglePublish(m)} title={m.is_published === false ? 'Publicar' : 'Ocultar'}>
                    {m.is_published === false ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--sm affiliates-page__btn--ghost" disabled={saving} onClick={() => removeMaterial(m.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onGalleryPick}
        preferSection="publicidade"
        title="Mídia da Publicidade · afiliados"
        useContext="campaign"
        accept={['image', 'video']}
      />
    </div>
  )
}
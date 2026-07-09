import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, Image, Loader2 } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import type { GalleryItem } from '@/lib/gallery/types'
import type { AffiliateLearningModule } from '@/lib/affiliates/types'

const MODULE_TYPES = [
  { value: 'programa', label: 'O que é o programa' },
  { value: 'como_funciona', label: 'Como funciona' },
  { value: 'produtos', label: 'Produtos' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'comissao', label: 'Comissão' },
  { value: 'faq', label: 'FAQ' },
] as const

type Props = {
  modules: AffiliateLearningModule[]
  onRefresh: () => void
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
}

export function AffiliateLearningSection({ modules, onRefresh, showToast, saving, setSaving }: Props) {
  const [editingId, setEditingId] = useState<string | null>(modules[0]?.id || null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''

  const editing = modules.find((m) => m.id === editingId) || modules[0]
  const [draft, setDraft] = useState<Partial<AffiliateLearningModule>>(editing || {})

  useEffect(() => {
    if (!modules.length) return
    setEditingId((prev) => {
      const id = prev && modules.some((m) => m.id === prev) ? prev : modules[0].id
      const mod = modules.find((m) => m.id === id)
      if (mod) setDraft({ ...mod })
      return id
    })
  }, [modules])

  function selectModule(mod: AffiliateLearningModule) {
    setEditingId(mod.id)
    setDraft({ ...mod })
  }

  function onGalleryPick(item: GalleryItem) {
    setDraft((d) => ({ ...d, media_url: item.url, gallery_item_id: item.id }))
    setPickerOpen(false)
  }

  async function saveModule() {
    if (!draft.title?.trim()) return showToast('Título obrigatório', 'err')
    setSaving(true)
    try {
      const r = await fetch('/api/affiliates/learning-modules', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ id: editing?.id, ...draft, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro')
      showToast('Módulo salvo!')
      onRefresh()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    }
    setSaving(false)
  }

  if (!modules.length) {
    return (
      <div className="affiliates-learn__empty">
        <Loader2 size={24} className="animate-spin opacity-40" />
        <p>Carregando módulos de aprendizado…</p>
      </div>
    )
  }

  const publishedCount = modules.filter((m) => m.is_published).length

  return (
    <div className="affiliates-page__section affiliates-learn">
      <div className="affiliates-learn__header">
        <div>
          <h3 className="affiliates-page__form-title">Área de aprendizado do afiliado</h3>
          <p className="affiliates-page__field-hint">
            {publishedCount} de {modules.length} módulos publicados — aparecem na aba <strong>Aprender</strong> do app
          </p>
        </div>
      </div>

      <div className="affiliates-learn__layout">
        <aside className="affiliates-learn__nav">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`affiliates-learn__nav-item${editingId === m.id ? ' is-active' : ''}`}
              onClick={() => selectModule(m)}
            >
              <BookOpen size={14} />
              <span className="min-w-0 truncate">{m.title}</span>
              {m.is_published && <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />}
            </button>
          ))}
        </aside>

        {editing && (
          <div className="affiliates-learn__editor">
            <div className="affiliates-page__form-grid">
              <label className="affiliates-page__field">
                <span>Título</span>
                <input value={draft.title || ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </label>
              <label className="affiliates-page__field">
                <span>Tipo</span>
                <select value={draft.module_type || 'programa'} onChange={(e) => setDraft((d) => ({ ...d, module_type: e.target.value }))}>
                  {MODULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="affiliates-page__field affiliates-page__field--wide">
                <span>Conteúdo (HTML simples)</span>
                <textarea
                  value={draft.content_html || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, content_html: e.target.value }))}
                  rows={10}
                  placeholder="<p>Explique como funciona o programa…</p>"
                />
              </label>
              <div className="affiliates-page__field affiliates-page__field--wide">
                <span>Imagem de apoio (opcional)</span>
                <div className="affiliates-mat__media-row">
                  {draft.media_url ? (
                    <img src={draft.media_url} alt="" className="affiliates-mat__thumb" />
                  ) : (
                    <div className="affiliates-mat__preview affiliates-mat__preview--empty"><Image size={20} className="opacity-40" /></div>
                  )}
                  <button type="button" className="affiliates-page__btn affiliates-page__btn--ghost" onClick={() => setPickerOpen(true)}>
                    Da galeria
                  </button>
                </div>
              </div>
              <label className="affiliates-page__check">
                <input type="checkbox" checked={!!draft.is_published} onChange={(e) => setDraft((d) => ({ ...d, is_published: e.target.checked }))} />
                Publicado no app
              </label>
              <label className="affiliates-page__check">
                <input type="checkbox" checked={!!draft.is_required} onChange={(e) => setDraft((d) => ({ ...d, is_required: e.target.checked }))} />
                Obrigatório no onboarding
              </label>
            </div>
            <button type="button" className="affiliates-page__btn affiliates-page__btn--primary" disabled={saving} onClick={saveModule}>
              {saving ? 'Salvando…' : 'Salvar módulo'}
            </button>

            {draft.content_html && (
              <div className="affiliates-learn__preview">
                <p className="affiliates-learn__preview-label">Prévia no app</p>
                <div className="affiliate-card p-4">
                  <p className="font-bold text-sm mb-2">{draft.title}</p>
                  {draft.media_url && <img src={draft.media_url} alt="" className="w-full rounded-xl mb-3 max-h-40 object-cover" />}
                  <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: draft.content_html }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <MediaPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onGalleryPick} title="Imagem do módulo" />
    </div>
  )
}
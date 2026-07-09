import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookmarkPlus, FileText, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  allCaptionTemplates,
  deleteServerCaptionTemplate,
  fetchServerCaptionTemplates,
  saveServerCaptionTemplate,
  type CaptionTemplate,
} from '@/lib/instagram/captionTemplates'

type Props = {
  open: boolean
  brandId?: string
  brandName?: string
  currentCaption: string
  onClose: () => void
  onApply: (text: string, mode: 'replace' | 'append') => void
}

const CATEGORY_LABELS: Record<string, string> = {
  promo: 'Promoção',
  lancamento: 'Lançamento',
  social: 'Social',
  cta: 'CTA',
  custom: 'Meus templates',
}

export function InstagramCaptionTemplatesModal({
  open,
  brandName,
  currentCaption,
  onClose,
  onApply,
}: Props) {
  const [custom, setCustom] = useState<CaptionTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void fetchServerCaptionTemplates()
      .then(setCustom)
      .finally(() => setLoading(false))
  }, [open])

  const templates = useMemo(() => allCaptionTemplates(custom), [custom])

  if (!open) return null

  const grouped = templates.reduce<Record<string, CaptionTemplate[]>>((acc, t) => {
    const k = t.category
    acc[k] = acc[k] || []
    acc[k].push(t)
    return acc
  }, {})

  const handleSaveCurrent = async () => {
    if (!currentCaption.trim()) return
    setSaving(true)
    const tpl = await saveServerCaptionTemplate(
      draftLabel.trim() || `Template ${custom.length + 1}`,
      currentCaption.trim(),
    )
    if (tpl) setCustom((prev) => [tpl, ...prev.filter((t) => t.id !== tpl.id)].slice(0, 12))
    setDraftLabel('')
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const ok = await deleteServerCaptionTemplate(id)
    if (ok) setCustom((prev) => prev.filter((t) => t.id !== id))
  }

  const preview = (body: string) =>
    body.replace(/\{marca\}/gi, brandName || 'sua marca')

  return createPortal(
    <div className="ig-caption-tpl" role="dialog" aria-modal="true" aria-labelledby="ig-caption-tpl-title">
      <button type="button" className="ig-caption-tpl__backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="ig-caption-tpl__panel">
        <header className="ig-caption-tpl__head">
          <div>
            <p className="ig-caption-tpl__eyebrow">
              <FileText size={12} /> Biblioteca
            </p>
            <h2 id="ig-caption-tpl-title" className="ig-caption-tpl__title">
              Templates de legenda
            </h2>
          </div>
          <button type="button" className="ig-caption-tpl__close" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>

        <div className="ig-caption-tpl__body">
          {loading ? (
            <div className="py-8 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : (
            <>
              {currentCaption.trim() && (
                <div className="ig-caption-tpl__save-row">
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="Nome do template (opcional)"
                    className="ig-caption-tpl__input"
                  />
                  <button type="button" className="ig-caption-tpl__save-btn" onClick={() => void handleSaveCurrent()} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />}
                    Salvar legenda atual
                  </button>
                </div>
              )}

              {Object.entries(grouped).map(([cat, items]) => (
                <section key={cat} className="ig-caption-tpl__section">
                  <h3>{CATEGORY_LABELS[cat] || cat}</h3>
                  <div className="ig-caption-tpl__grid">
                    {items.map((tpl) => (
                      <article key={tpl.id} className="ig-caption-tpl__card">
                        <div className="ig-caption-tpl__card-head">
                          <span className="ig-caption-tpl__card-label">{tpl.label}</span>
                          {tpl.custom && (
                            <button type="button" className="ig-caption-tpl__card-del" onClick={() => void handleDelete(tpl.id)} aria-label="Excluir template">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <p className="ig-caption-tpl__card-preview">{preview(tpl.body)}</p>
                        <div className="ig-caption-tpl__card-actions">
                          <button type="button" onClick={() => { onApply(preview(tpl.body), 'replace'); onClose() }}>
                            Usar
                          </button>
                          <button type="button" onClick={() => { onApply(preview(tpl.body), 'append'); onClose() }}>
                            Anexar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <footer className="ig-caption-tpl__footer">
          <p>
            <Sparkles size={12} /> Templates salvos na nuvem por marca. Use {'{marca}'} para inserir o nome automaticamente.
          </p>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Fechar
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}

export function CatalogManagerSheet({ open, onClose, title, subtitle, children }: Props) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="catalog-manager-sheet" role="dialog" aria-modal="true" aria-labelledby="catalog-manager-title">
      <header className="catalog-manager-sheet__head">
        <div className="catalog-manager-sheet__headline">
          <h2 id="catalog-manager-title" className="catalog-manager-sheet__title">{title}</h2>
          {subtitle && <p className="catalog-manager-sheet__sub">{subtitle}</p>}
        </div>
        <button type="button" className="catalog-manager-sheet__close" onClick={onClose} aria-label="Fechar">
          <X size={18} strokeWidth={2} />
        </button>
      </header>
      <div className="catalog-manager-sheet__body">
        {children}
      </div>
    </div>,
    document.body,
  )
}
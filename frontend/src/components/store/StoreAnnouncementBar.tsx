import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const DISMISS_KEY = 'lc_store_announce_dismiss'

export function StoreAnnouncementBar({
  text,
  linkUrl,
  dismissible = true,
  storageKey,
}: {
  text: string
  linkUrl?: string | null
  dismissible?: boolean
  storageKey?: string
}) {
  const key = storageKey || `${DISMISS_KEY}_${text.slice(0, 24)}`
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(key) === '1')
    } catch {
      setHidden(false)
    }
  }, [key])

  if (!text.trim() || hidden) return null

  const inner = (
    <span className="store-announce__text">{text}</span>
  )

  return (
    <div className="store-announce" role="region" aria-label="Promoção da loja">
      <div className="store-announce__inner">
        {linkUrl ? (
          <a href={linkUrl} className="store-announce__link">
            {inner}
          </a>
        ) : (
          inner
        )}
        {dismissible && (
          <button
            type="button"
            className="store-announce__close"
            aria-label="Fechar aviso"
            onClick={() => {
              try {
                sessionStorage.setItem(key, '1')
              } catch {
                /* ignore */
              }
              setHidden(true)
            }}
          >
            <X size={15} strokeWidth={2.25} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

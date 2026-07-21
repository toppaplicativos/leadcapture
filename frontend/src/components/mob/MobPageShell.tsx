import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

const ICON = 2.25

export function MobPageShell({
  title,
  subtitle,
  onBack,
  action,
  children,
  toast,
}: {
  title: string
  subtitle?: string
  onBack: () => void
  action?: ReactNode
  children: ReactNode
  toast?: string
}) {
  return (
    <div className="mob-stack">
      <div className="mob-page-head">
        <button
          type="button"
          className="mob-page-head__back"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={20} strokeWidth={ICON} />
        </button>
        <div className="mob-page-head__text min-w-0 flex-1">
          <h2 className="mob-page-head__title">{title}</h2>
          {subtitle ? <p className="mob-page-head__sub">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {toast ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-900">
          {toast}
        </div>
      ) : null}

      {children}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Sparkles, X, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * ConfirmModal — substituto global para window.confirm() nativo.
 *
 * Padrão idêntico ao Toast.tsx: módulo singleton com função `_showConfirm`
 * que retorna uma Promise<boolean>. Use via `useConfirm()` hook.
 *
 * Exemplo:
 *   const { confirm } = useConfirm()
 *   const ok = await confirm({
 *     title: 'Gerar regua de follow-up?',
 *     message: 'Vamos criar 8 campanhas em rascunho.',
 *     confirmLabel: 'Gerar',
 *     variant: 'info',
 *   })
 *   if (!ok) return
 */

export type ConfirmVariant = 'default' | 'danger' | 'info'

export interface ConfirmOptions {
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  icon?: LucideIcon
}

interface InternalState {
  open: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}

const INITIAL_OPTIONS: ConfirmOptions = { title: '', message: '' }

let _showConfirm: (opts: ConfirmOptions) => Promise<boolean> = () => Promise.resolve(false)

export function useConfirm() {
  return { confirm: _showConfirm }
}

function variantStyles(variant: ConfirmVariant): {
  iconWrap: string
  icon: string
  confirmBtn: string
  defaultIcon: LucideIcon
} {
  switch (variant) {
    case 'danger':
      return {
        iconWrap: 'bg-red-50 ring-1 ring-red-100',
        icon: 'text-red-600',
        confirmBtn: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white',
        defaultIcon: AlertTriangle,
      }
    case 'info':
      return {
        iconWrap: 'bg-violet-50 ring-1 ring-violet-100',
        icon: 'text-violet-600',
        confirmBtn: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white',
        defaultIcon: Sparkles,
      }
    default:
      return {
        iconWrap: 'bg-gray-50 ring-1 ring-gray-100',
        icon: 'text-gray-600',
        confirmBtn: 'bg-gray-900 hover:bg-gray-800 text-white',
        defaultIcon: Info,
      }
  }
}

export function ConfirmModal() {
  const [state, setState] = useState<InternalState>({
    open: false,
    options: INITIAL_OPTIONS,
    resolve: null,
  })
  const [busy, setBusy] = useState(false)

  const show = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setBusy(false)
      setState({ open: true, options, resolve })
    })
  }, [])

  useEffect(() => {
    _showConfirm = show
  }, [show])

  /* ESC closes (cancel) — match native confirm behaviour */
  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        state.resolve?.(false)
        setState((s) => ({ ...s, open: false }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.open, state.resolve])

  if (!state.open) return null

  const v = variantStyles(state.options.variant || 'default')
  const Icon = state.options.icon || v.defaultIcon
  const confirmLabel = state.options.confirmLabel || 'Confirmar'
  const cancelLabel = state.options.cancelLabel || 'Cancelar'

  const handleCancel = () => {
    if (busy) return
    state.resolve?.(false)
    setState((s) => ({ ...s, open: false }))
  }

  const handleConfirm = () => {
    if (busy) return
    setBusy(true)
    state.resolve?.(true)
    /* Close immediately — the caller handles its own loading state */
    setState((s) => ({ ...s, open: false }))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className={`w-10 h-10 rounded-xl ${v.iconWrap} grid place-items-center shrink-0`}>
            <Icon size={20} className={v.icon} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-modal-title" className="text-[15px] font-bold text-gray-900 tracking-tight leading-tight">
              {state.options.title}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleCancel}
            className="w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4">
          <div className="text-[13px] text-gray-600 leading-relaxed">
            {state.options.message}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-700 hover:bg-gray-100 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition shadow-sm flex items-center gap-1.5 ${v.confirmBtn} disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

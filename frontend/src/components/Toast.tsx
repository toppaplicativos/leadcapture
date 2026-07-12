import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastVariant = 'default' | 'success' | 'error'

interface ToastState {
  message: string
  visible: boolean
  variant: ToastVariant
}

let _showToast: (msg: string, variant?: ToastVariant) => void = () => {}

export function useToast() {
  return { showToast: _showToast }
}

export function Toast() {
  const [state, setState] = useState<ToastState>({ message: '', visible: false, variant: 'default' })

  const show = useCallback((message: string, variant: ToastVariant = 'default') => {
    setState({ message, visible: true, variant })
    setTimeout(() => setState((s) => ({ ...s, visible: false })), 3200)
  }, [])

  useEffect(() => {
    _showToast = show
  }, [show])

  const Icon = state.variant === 'success'
    ? CheckCircle2
    : state.variant === 'error'
      ? AlertCircle
      : Info

  return (
    <div
      className={`app-toast app-toast--${state.variant} ${
        state.visible
          ? 'is-visible'
          : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <Icon size={18} className="app-toast__icon" aria-hidden />
      <span className="app-toast__message">{state.message}</span>
      <button
        type="button"
        className="app-toast__close"
        onClick={() => setState((current) => ({ ...current, visible: false }))}
        aria-label="Fechar notificação"
      >
        <X size={14} />
      </button>
    </div>
  )
}

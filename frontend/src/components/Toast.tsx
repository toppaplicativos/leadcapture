import { useEffect, useState, useCallback } from 'react'

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

const VARIANT_CLASS: Record<ToastVariant, string> = {
  default: 'bg-gray-900 text-white',
  success: 'bg-emerald-700 text-white',
  error: 'bg-red-700 text-white',
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

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] text-sm font-medium px-5 py-2.5 rounded-full shadow-lg transition-all duration-300 max-w-[min(92vw,24rem)] text-center text-pretty ${
        VARIANT_CLASS[state.variant]
      } ${
        state.visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      {state.message}
    </div>
  )
}

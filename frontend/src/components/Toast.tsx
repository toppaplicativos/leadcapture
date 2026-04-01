import { useEffect, useState, useCallback } from 'react'

interface ToastState {
  message: string
  visible: boolean
}

let _showToast: (msg: string) => void = () => {}

export function useToast() {
  return { showToast: _showToast }
}

export function Toast() {
  const [state, setState] = useState<ToastState>({ message: '', visible: false })

  const show = useCallback((message: string) => {
    setState({ message, visible: true })
    setTimeout(() => setState((s) => ({ ...s, visible: false })), 2400)
  }, [])

  useEffect(() => {
    _showToast = show
  }, [show])

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg transition-all duration-300 ${
        state.visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      {state.message}
    </div>
  )
}

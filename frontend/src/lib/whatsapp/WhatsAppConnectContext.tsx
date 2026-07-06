import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type WhatsAppConnectValue = {
  isOpen: boolean
  instanceId: string | null
  openConnect: (instanceId?: string | null) => void
  closeConnect: () => void
}

const WhatsAppConnectContext = createContext<WhatsAppConnectValue | null>(null)

export function WhatsAppConnectProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [instanceId, setInstanceId] = useState<string | null>(null)

  const openConnect = useCallback((id?: string | null) => {
    setInstanceId(id ?? null)
    setIsOpen(true)
  }, [])

  const closeConnect = useCallback(() => {
    setIsOpen(false)
    setInstanceId(null)
  }, [])

  return (
    <WhatsAppConnectContext.Provider value={{ isOpen, instanceId, openConnect, closeConnect }}>
      {children}
    </WhatsAppConnectContext.Provider>
  )
}

export function useWhatsAppConnect() {
  const ctx = useContext(WhatsAppConnectContext)
  if (!ctx) throw new Error('useWhatsAppConnect must be used within WhatsAppConnectProvider')
  return ctx
}

export function useWhatsAppConnectOptional() {
  return useContext(WhatsAppConnectContext)
}
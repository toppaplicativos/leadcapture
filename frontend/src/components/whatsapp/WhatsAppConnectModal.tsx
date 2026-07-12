import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useWhatsAppConnect } from '@/lib/whatsapp/WhatsAppConnectContext'
import { WhatsAppPairingFlow } from './WhatsAppPairingFlow'
import { isAffiliateWhatsAppContext } from '@/lib/api-affiliate'
import { fetchWhatsAppInstances, pickWhatsAppInstance } from '@/lib/whatsapp/resolveInstance'
import { Select } from '@/components/ui'

type InstanceRow = {
  id: string
  name: string
  phone?: string | null
  status?: string
}

export function WhatsAppConnectModal({
  onConnected,
  onToast,
}: {
  onConnected?: () => void
  onToast?: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { isOpen, instanceId, closeConnect } = useWhatsAppConnect()
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetchWhatsAppInstances()
      .then((list) => {
        setInstances(list)
        const pick = pickWhatsAppInstance(list, instanceId)
        setSelectedId(pick?.id ?? null)
      })
      .catch(() => setInstances([]))
      .finally(() => setLoading(false))
  }, [isOpen, instanceId])

  if (!isOpen) return null

  const selected = instances.find((i) => i.id === selectedId)
  const disconnected = instances.filter(
    (i) => i.status !== 'connected' && i.status !== 'authenticated',
  )

  function handleConnected() {
    onToast?.('WhatsApp conectado!', 'ok')
    onConnected?.()
    // Mantém o modal aberto para o usuário ver/copiar o código; fecha manualmente.
  }

  return (
    <div
      className="wa-connect-modal__backdrop"
      onClick={closeConnect}
      role="presentation"
    >
      <div
        className="wa-connect-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wa-connect-title"
      >
        <div className="wa-connect-modal__head">
          <div>
            <p id="wa-connect-title" className="wa-connect-modal__title">Conectar WhatsApp</p>
            <p className="wa-connect-modal__sub">
              {selected
                ? `Sessão: ${selected.name}${selected.phone ? ` · ${selected.phone}` : ''} — código de 8 caracteres no app`
                : 'Vincule pelo número — código de 8 caracteres no app'}
            </p>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); closeConnect() }}
            className="wa-connect-modal__close"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="wa-connect-modal__loading">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : !selectedId ? (
          <p className="wa-connect-modal__empty">
            {isAffiliateWhatsAppContext()
              ? 'Nenhuma sessão WhatsApp. Crie uma na aba Conexões.'
              : 'Nenhuma sessão WhatsApp. Crie uma em Configurações → WhatsApp.'}
          </p>
        ) : (
          <>
            {disconnected.length > 1 && (
              <Select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mb-3 h-10 text-xs"
                aria-label="Sessão WhatsApp"
              >
                {disconnected.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}{i.phone ? ` · ${i.phone}` : ''}
                  </option>
                ))}
              </Select>
            )}
            <WhatsAppPairingFlow
              key={selectedId}
              instanceId={selectedId}
              instanceName={selected?.name}
              defaultPhone={selected?.phone}
              onConnected={handleConnected}
              onError={(msg) => onToast?.(msg, 'err')}
            />
          </>
        )}
      </div>
    </div>
  )
}
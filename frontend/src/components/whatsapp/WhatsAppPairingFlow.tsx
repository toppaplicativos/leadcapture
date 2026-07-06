import { useState, useEffect, useRef } from 'react'
import { Loader2, Phone, Hash } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { PAIRING_COUNTRY_CODES, splitPhoneE164, formatPairingCode } from '@/lib/whatsapp/countryCodes'

type Props = {
  instanceId: string
  instanceName?: string
  defaultPhone?: string | null
  compact?: boolean
  onConnected?: () => void
  onError?: (msg: string) => void
}

export function WhatsAppPairingFlow({
  instanceId,
  instanceName,
  defaultPhone,
  compact,
  onConnected,
  onError,
}: Props) {
  const parsed = splitPhoneE164(defaultPhone)
  const [country, setCountry] = useState(parsed.country)
  const [phone, setPhone] = useState(parsed.local)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!pairingCode) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => {
      fetch(`/api/instances/${instanceId}`, { headers: getHeaders() })
        .then((r) => r.json())
        .then((d) => {
          const st = d.status || ''
          if (st === 'connected' || st === 'authenticated') {
            setPairingCode(null)
            onConnected?.()
          }
        })
        .catch(() => {})
    }, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pairingCode, instanceId, onConnected])

  async function generateCode() {
    if (!phone || phone.length < 8) {
      onError?.('Informe o número completo com DDD')
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`/api/instances/${instanceId}/pairing-code`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ phoneNumber: country + phone }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao gerar código')
      setPairingCode(d.code)
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : 'Erro ao gerar código')
    } finally {
      setLoading(false)
    }
  }

  if (pairingCode) {
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        <div className="wa-pairing__code-box">
          <p className="wa-pairing__code-label">Código de pareamento</p>
          <p className="wa-pairing__code-value">{formatPairingCode(pairingCode)}</p>
          {instanceName && (
            <p className="wa-pairing__code-meta">Sessão: {instanceName}</p>
          )}
        </div>
        <ol className="wa-pairing__steps">
          <li>Abra o WhatsApp no celular</li>
          <li>Configurações → Aparelhos conectados</li>
          <li>Conectar aparelho → Conectar com número</li>
          <li>Digite o código acima</li>
        </ol>
        <div className="wa-pairing__waiting">
          <span className="wa-pairing__pulse" />
          Aguardando vinculação…
        </div>
        <button
          type="button"
          className="wa-pairing__retry"
          onClick={() => setPairingCode(null)}
        >
          Usar outro número
        </button>
      </div>
    )
  }

  return (
    <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
      <p className="wa-pairing__intro">
        Informe o número do WhatsApp. Geramos um código de 8 dígitos para vincular no app.
      </p>
      <div className="wa-pairing__phone-row">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="wa-pairing__country"
          aria-label="País"
        >
          {PAIRING_COUNTRY_CODES.map(([code, name]) => (
            <option key={code} value={code}>+{code} {name}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="DDD + número"
          className="wa-pairing__phone"
          onKeyDown={(e) => e.key === 'Enter' && generateCode()}
        />
      </div>
      <button
        type="button"
        onClick={generateCode}
        disabled={loading || phone.length < 8}
        className="wa-pairing__submit"
      >
        {loading ? (
          <><Loader2 size={14} className="animate-spin" /> Gerando código…</>
        ) : (
          <><Hash size={14} /> Gerar código de conexão</>
        )}
      </button>
      {instanceName && (
        <p className="wa-pairing__hint">
          <Phone size={12} /> Conectando sessão <b>{instanceName}</b>
        </p>
      )}
    </div>
  )
}
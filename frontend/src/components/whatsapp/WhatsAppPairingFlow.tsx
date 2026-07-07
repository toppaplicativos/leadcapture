import { useState, useEffect, useRef } from 'react'
import { Loader2, Phone, Hash } from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { PAIRING_COUNTRY_CODES, splitPhoneE164, formatPairingCode } from '@/lib/whatsapp/countryCodes'
import { resolveWhatsAppInstance } from '@/lib/whatsapp/resolveInstance'

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resolving, setResolving] = useState(true)
  const [activeInstanceId, setActiveInstanceId] = useState(instanceId)
  const [activeInstanceName, setActiveInstanceName] = useState(instanceName)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    setResolving(true)
    resolveWhatsAppInstance(instanceId)
      .then((picked) => {
        if (cancelled) return
        if (picked) {
          setActiveInstanceId(picked.id)
          setActiveInstanceName(picked.name)
          const nextParsed = splitPhoneE164(picked.phone ?? defaultPhone)
          setCountry(nextParsed.country)
          setPhone(nextParsed.local)
        } else {
          setActiveInstanceId(instanceId)
          setActiveInstanceName(instanceName)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveInstanceId(instanceId)
          setActiveInstanceName(instanceName)
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => { cancelled = true }
  }, [instanceId, instanceName, defaultPhone])

  useEffect(() => {
    if (!pairingCode) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(() => {
      fetch(`/api/instances/${activeInstanceId}`, { headers: getHeaders() })
        .then((r) => r.json())
        .then((d) => {
          const st = d.instance?.status || d.status || ''
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
  }, [pairingCode, activeInstanceId, onConnected])

  async function generateCode() {
    if (!phone || phone.length < 8) {
      onError?.('Informe o número completo com DDD')
      return
    }
    if (!activeInstanceId) {
      onError?.('Nenhuma sessão WhatsApp disponível')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      const r = await fetch(`/api/instances/${activeInstanceId}/pairing-code`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ phoneNumber: country + phone }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (r.status === 404) {
          const retry = await resolveWhatsAppInstance(activeInstanceId)
          if (retry && retry.id !== activeInstanceId) {
            setActiveInstanceId(retry.id)
            setActiveInstanceName(retry.name)
            const retryRes = await fetch(`/api/instances/${retry.id}/pairing-code`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ phoneNumber: country + phone }),
            })
            const retryData = await retryRes.json().catch(() => ({}))
            if (!retryRes.ok) throw new Error(retryData.error || 'Sessão WhatsApp não encontrada')
            setPairingCode(retryData.code)
            return
          }
        }
        throw new Error(d.error || 'Erro ao gerar código')
      }
      setPairingCode(d.code)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar código'
      setErrorMsg(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
    }
  }

  if (resolving) {
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        <div className="wa-pairing__loading">
          <Loader2 size={16} className="animate-spin text-gray-400" />
          <span>Carregando sessão…</span>
        </div>
      </div>
    )
  }

  if (pairingCode) {
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        <div className="wa-pairing__code-box">
          <p className="wa-pairing__code-label">Código de pareamento</p>
          <p className="wa-pairing__code-value">{formatPairingCode(pairingCode)}</p>
          {activeInstanceName && (
            <p className="wa-pairing__code-meta">Sessão: {activeInstanceName}</p>
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
          onKeyDown={(e) => e.key === 'Enter' && !loading && generateCode()}
        />
      </div>
      <button
        type="button"
        onClick={generateCode}
        disabled={loading || phone.length < 8 || !activeInstanceId}
        className="wa-pairing__submit"
      >
        {loading ? (
          <><Loader2 size={14} className="animate-spin" /> Gerando código…</>
        ) : (
          <><Hash size={14} /> Gerar código de conexão</>
        )}
      </button>
      {errorMsg && (
        <p className="wa-pairing__error" role="alert">{errorMsg}</p>
      )}
      {activeInstanceName && (
        <p className="wa-pairing__hint">
          <Phone size={12} /> Conectando sessão <b>{activeInstanceName}</b>
        </p>
      )}
    </div>
  )
}
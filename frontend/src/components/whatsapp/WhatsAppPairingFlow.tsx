import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Phone, Hash, Copy, CheckCircle2, RefreshCw, ArrowLeft } from 'lucide-react'
import { getWhatsAppHeaders } from '@/lib/whatsapp/headers'
import {
  PAIRING_COUNTRY_CODES,
  splitPhoneE164,
  formatPairingCode,
  pairingCodeRaw,
  buildPairingPhoneE164,
  isBrazilLocalComplete,
  isBrazilLocalReadyToSubmit,
  formatBrazilPhoneDisplay,
  formatPairingE164Display,
  type BrazilPhoneNormalization,
} from '@/lib/whatsapp/countryCodes'
import { resolveWhatsAppInstance } from '@/lib/whatsapp/resolveInstance'
import { copyToClipboard } from '@/lib/whatsapp/copyToClipboard'

type Props = {
  instanceId: string
  instanceName?: string
  defaultPhone?: string | null
  compact?: boolean
  /** Com número salvo completo, abre confirmação (não gera sozinho ao digitar). */
  autoGenerate?: boolean
  onConnected?: () => void
  onError?: (msg: string) => void
}

export function WhatsAppPairingFlow({
  instanceId,
  instanceName,
  defaultPhone,
  compact,
  autoGenerate = true,
  onConnected,
  onError,
}: Props) {
  const parsed = splitPhoneE164(defaultPhone)
  const [country, setCountry] = useState(parsed.country)
  const [phone, setPhone] = useState(parsed.local)
  const [confirmPhone, setConfirmPhone] = useState<BrazilPhoneNormalization | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingPhone, setPairingPhone] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [linked, setLinked] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resolving, setResolving] = useState(true)
  const [activeInstanceId, setActiveInstanceId] = useState(instanceId)
  const [activeInstanceName, setActiveInstanceName] = useState(instanceName)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefillConfirmRef = useRef(false)
  const userEditedPhoneRef = useRef(false)
  const connectedNotifiedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setResolving(true)
    prefillConfirmRef.current = false
    userEditedPhoneRef.current = false
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

  const copyCodeValue = useCallback(async (code: string, showFeedback = true) => {
    const raw = pairingCodeRaw(code)
    const ok = await copyToClipboard(raw)
    if (showFeedback) {
      setCopyFailed(!ok)
      if (ok) {
        setCopied(true)
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
        copyTimerRef.current = setTimeout(() => setCopied(false), 2500)
      }
    }
    return ok
  }, [])

  useEffect(() => {
    if (!pairingCode) return
    void copyCodeValue(pairingCode, true)
  }, [pairingCode, copyCodeValue])

  useEffect(() => {
    if (!pairingCode || linked) {
      if (pollRef.current) clearInterval(pollRef.current)
      if (pollDelayRef.current) clearTimeout(pollDelayRef.current)
      return
    }

    pollDelayRef.current = setTimeout(() => {
      pollRef.current = setInterval(() => {
        fetch(`/api/instances/${activeInstanceId}`, { headers: getWhatsAppHeaders() })
          .then((r) => r.json())
          .then((d) => {
            const pairingActive = Boolean(d.instance?.pairing_active ?? d.pairing_active)
            const st = String(d.instance?.status || d.status || '')
            if (st === 'connected' || st === 'authenticated') {
              setLinked(true)
              if (!connectedNotifiedRef.current) {
                connectedNotifiedRef.current = true
                onConnected?.()
              }
              return
            }
            if (pairingActive) return
            const pairingErr = String(d.instance?.pairing_error || d.pairing_error || '').trim()
            if (pairingErr) {
              setErrorMsg(pairingErr)
              onError?.(pairingErr)
              setPairingCode(null)
              return
            }
            /* Sessão encerrou sem conectar (socket 428 etc.) — pede novo código. */
            setErrorMsg(
              'A sessão de pareamento encerrou antes de vincular. Gere um novo código e digite no WhatsApp em até 2 minutos.',
            )
            setPairingCode(null)
          })
          .catch(() => {})
      }, 3000)
    }, 8000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (pollDelayRef.current) clearTimeout(pollDelayRef.current)
    }
  }, [pairingCode, linked, activeInstanceId, onConnected])

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    if (pollDelayRef.current) clearTimeout(pollDelayRef.current)
  }, [])

  const resolveNormalizedPhone = useCallback((): BrazilPhoneNormalization | null => {
    if (country === '55') {
      if (!isBrazilLocalReadyToSubmit(phone)) return null
      return buildPairingPhoneE164(country, phone)
    }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 8) return null
    return { local: digits, e164: `${country}${digits}`, adjusted: false }
  }, [country, phone])

  /* Só pré-preenchimento salvo: abre confirmação sem disparar enquanto o usuário digita. */
  useEffect(() => {
    if (!autoGenerate || resolving || userEditedPhoneRef.current || prefillConfirmRef.current || pairingCode || confirmPhone) return
    if (!defaultPhone) return
    const norm = buildPairingPhoneE164(country, phone)
    if (!isBrazilLocalComplete(phone) || !norm.e164) return
    prefillConfirmRef.current = true
    setConfirmPhone(norm)
    if (norm.adjusted && norm.local !== phone) setPhone(norm.local)
  }, [autoGenerate, resolving, defaultPhone, pairingCode, confirmPhone, country, phone])

  function handlePhoneChange(raw: string) {
    userEditedPhoneRef.current = true
    const digits = raw.replace(/\D/g, '')
    const maxLen = country === '55' ? 11 : 15
    setPhone(digits.slice(0, maxLen))
    setConfirmPhone(null)
    setErrorMsg(null)
    prefillConfirmRef.current = false
  }

  function handleContinue() {
    const norm = resolveNormalizedPhone()
    if (!norm) {
      const msg = country === '55'
        ? 'Informe o celular completo com DDD (11 dígitos, ex: 85996437477)'
        : 'Informe o número completo'
      setErrorMsg(msg)
      onError?.(msg)
      return
    }
    setConfirmPhone(norm)
    if (norm.adjusted && norm.local !== phone) setPhone(norm.local)
    setErrorMsg(null)
  }

  async function resetPairingSession(targetId: string) {
    await fetch(`/api/instances/${targetId}/reset-pairing`, {
      method: 'POST',
      headers: getWhatsAppHeaders(),
    }).catch(() => {})
  }

  async function requestPairingCode(targetId: string, fullPhone: string) {
    const r = await fetch(`/api/instances/${targetId}/pairing-code`, {
      method: 'POST',
      headers: getWhatsAppHeaders(),
      body: JSON.stringify({ phoneNumber: fullPhone }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Erro ao gerar código')
    const code = pairingCodeRaw(String(d.code || d.pairingCode || ''))
    if (code.length !== 8) {
      throw new Error(`Código inválido (${code.length}/8 caracteres). Tente gerar de novo.`)
    }
    return {
      code,
      phone: String(d.phone || fullPhone),
    }
  }

  const generateCode = useCallback(async (e164: string) => {
    if (!activeInstanceId) {
      onError?.('Nenhuma sessão WhatsApp disponível')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    setCopied(false)
    setCopyFailed(false)
    setLinked(false)
    connectedNotifiedRef.current = false
    try {
      try {
        const result = await requestPairingCode(activeInstanceId, e164)
        setPairingCode(result.code)
        setPairingPhone(result.phone)
        setConfirmPhone(null)
        return
      } catch (firstErr) {
        const retry = await resolveWhatsAppInstance(activeInstanceId)
        if (retry && retry.id !== activeInstanceId) {
          setActiveInstanceId(retry.id)
          setActiveInstanceName(retry.name)
          const result = await requestPairingCode(retry.id, e164)
          setPairingCode(result.code)
          setPairingPhone(result.phone)
          setConfirmPhone(null)
          return
        }
        throw firstErr
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar código'
      setErrorMsg(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
    }
  }, [activeInstanceId, onError])

  async function handleConfirmGenerate() {
    if (!confirmPhone) return
    await generateCode(confirmPhone.e164)
  }

  async function handleRegenerate() {
    if (!activeInstanceId || loading || resetting) return
    const e164 = pairingPhone || confirmPhone?.e164 || resolveNormalizedPhone()?.e164
    if (!e164) return
    setResetting(true)
    setErrorMsg(null)
    setCopied(false)
    setCopyFailed(false)
    setLinked(false)
    connectedNotifiedRef.current = false
    try {
      await resetPairingSession(activeInstanceId)
      setPairingCode(null)
      setLoading(true)
      const result = await requestPairingCode(activeInstanceId, e164)
      setPairingCode(result.code)
      setPairingPhone(result.phone)
      setConfirmPhone(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar novo código'
      setErrorMsg(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
      setResetting(false)
    }
  }

  async function copyCode() {
    if (!pairingCode) return
    await copyCodeValue(pairingCode, true)
  }

  const phoneComplete = country === '55' ? isBrazilLocalReadyToSubmit(phone) : phone.replace(/\D/g, '').length >= 8

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

  if (loading && !pairingCode) {
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        <div className="wa-pairing__loading">
          <Loader2 size={16} className="animate-spin text-gray-400" />
          <span>Preparando sessão e gerando código…</span>
        </div>
        {confirmPhone && (
          <p className="wa-pairing__hint">Número +{confirmPhone.e164}</p>
        )}
      </div>
    )
  }

  if (pairingCode) {
    const rawCode = pairingCodeRaw(pairingCode)
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        {linked && (
          <div className="wa-pairing__success" role="status">
            <CheckCircle2 size={16} />
            WhatsApp vinculado com sucesso!
          </div>
        )}
        <div className="wa-pairing__code-box">
          <p className="wa-pairing__code-label">Código de pareamento</p>
          <p className="wa-pairing__code-value">{formatPairingCode(pairingCode)}</p>
          <p className="wa-pairing__code-hint">
            {copied
              ? 'Código copiado — cole no WhatsApp (8 caracteres, sem hífen)'
              : copyFailed
                ? 'Toque em Copiar e cole no WhatsApp'
                : 'Copiando para a área de transferência…'}
          </p>
          {pairingPhone && (
            <p className="wa-pairing__code-meta">
              No WhatsApp, informe exatamente: <b>{formatPairingE164Display(pairingPhone)}</b>
            </p>
          )}
          {activeInstanceName && (
            <p className="wa-pairing__code-meta">Sessão: {activeInstanceName}</p>
          )}
          <button
            type="button"
            className={`wa-pairing__copy ${copied ? 'is-copied' : ''}`}
            onClick={copyCode}
          >
            {copied ? (
              <><CheckCircle2 size={14} /> Copiado!</>
            ) : (
              <><Copy size={14} /> Copiar código ({rawCode})</>
            )}
          </button>
        </div>
        <ol className="wa-pairing__steps">
          <li>Abra o WhatsApp no celular <b>agora</b> (não espere)</li>
          <li>Configurações → Aparelhos conectados</li>
          <li>Conectar aparelho → <b>Conectar com número de telefone</b></li>
          <li>Informe exatamente: <b>{pairingPhone ? formatPairingE164Display(pairingPhone) : 'o número acima'}</b></li>
          <li>Cole o código <b>sem hífen</b> ({rawCode}) — válido ~2 min</li>
        </ol>
        {errorMsg && <p className="wa-pairing__error" role="alert">{errorMsg}</p>}
        {!linked && (
          <div className="wa-pairing__waiting">
            <span className="wa-pairing__pulse" />
            Aguardando vinculação…
          </div>
        )}
        <div className="wa-pairing__actions">
          <button
            type="button"
            className="wa-pairing__retry"
            onClick={handleRegenerate}
            disabled={loading || resetting}
          >
            {resetting ? (
              <><Loader2 size={13} className="animate-spin" /> Gerando…</>
            ) : (
              <><RefreshCw size={13} /> Gerar novo código</>
            )}
          </button>
          <button
            type="button"
            className="wa-pairing__retry wa-pairing__retry--ghost"
            onClick={() => {
              setPairingCode(null)
              setPairingPhone(null)
              setConfirmPhone(null)
              setCopied(false)
              setLinked(false)
              prefillConfirmRef.current = false
              connectedNotifiedRef.current = false
            }}
          >
            Usar outro número
          </button>
        </div>
      </div>
    )
  }

  if (confirmPhone) {
    const display = country === '55'
      ? formatBrazilPhoneDisplay(confirmPhone.local)
      : confirmPhone.local
    return (
      <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
        <div className="wa-pairing__confirm">
          <p className="wa-pairing__confirm-title">Confirme o número</p>
          <p className="wa-pairing__confirm-number">+{country} {display}</p>
          <p className="wa-pairing__confirm-e164">
            WhatsApp usará: {formatPairingE164Display(confirmPhone.e164)}
          </p>
          {confirmPhone.hint && (
            <p className="wa-pairing__confirm-hint">{confirmPhone.hint}</p>
          )}
          <p className="wa-pairing__confirm-ask">Este número está correto?</p>
        </div>
        <div className="wa-pairing__actions">
          <button
            type="button"
            className="wa-pairing__submit"
            onClick={handleConfirmGenerate}
            disabled={loading}
          >
            <CheckCircle2 size={14} />
            Sim, gerar código
          </button>
          <button
            type="button"
            className="wa-pairing__retry wa-pairing__retry--ghost"
            onClick={() => {
              setConfirmPhone(null)
              setErrorMsg(null)
            }}
          >
            <ArrowLeft size={13} />
            Corrigir número
          </button>
        </div>
        {errorMsg && <p className="wa-pairing__error" role="alert">{errorMsg}</p>}
      </div>
    )
  }

  return (
    <div className={`wa-pairing ${compact ? 'wa-pairing--compact' : ''}`}>
      <p className="wa-pairing__intro">
        Informe o número do WhatsApp com DDD. Normalizamos o 9 do celular antes de gerar o código.
      </p>
      <div className="wa-pairing__phone-row">
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value)
            setConfirmPhone(null)
            prefillConfirmRef.current = false
          }}
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
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder={country === '55' ? 'DDD + celular (11 dígitos)' : 'Número completo'}
          className="wa-pairing__phone"
          maxLength={country === '55' ? 11 : 15}
          onKeyDown={(e) => e.key === 'Enter' && phoneComplete && handleContinue()}
        />
      </div>
      <button
        type="button"
        onClick={handleContinue}
        disabled={!phoneComplete || !activeInstanceId}
        className="wa-pairing__submit"
      >
        <Phone size={14} />
        Continuar
      </button>
      {errorMsg && (
        <p className="wa-pairing__error" role="alert">{errorMsg}</p>
      )}
      {activeInstanceName && (
        <p className="wa-pairing__hint">
          <Phone size={12} /> Sessão <b>{activeInstanceName}</b>
        </p>
      )}
    </div>
  )
}
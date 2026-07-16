import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, Ban, CheckCircle2, Loader2, Pause, Play, Shield,
} from 'lucide-react'

type HealthRow = {
  id: string
  name: string
  phone?: string | null
  status?: string
  paused?: boolean
  pause_reason?: string | null
  fail_rate_24h?: number | null
  sends_24h?: number | null
  fails_24h?: number | null
  optouts_24h?: number | null
}

type Dashboard = {
  instances: HealthRow[]
  totals24h: { sent: number; denied: number; failed: number; optouts: number }
  limits: {
    minIntervalSeconds: number
    maxPerRecipientDay: number
    maxPerInstanceHour: number
    maxPerBrandDay: number
    requireConsentForMarketing: boolean
    identifyFirstMessage: boolean
  }
}

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'
  const token = localStorage.getItem('lead-system-token')
  const brandId = localStorage.getItem('lead-system:active-brand-id')
  if (token) headers.Authorization = `Bearer ${token}`
  if (brandId) headers['x-brand-id'] = brandId
  return headers
}

export function WhatsAppEligibilityPanel() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/whatsapp/eligibility/health', { headers: authHeaders() })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Falha ao carregar saúde')
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  async function pauseInstance(id: string, paused: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/whatsapp/eligibility/instances/${id}/pause`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          paused,
          reason: paused ? 'Pausa manual pelo painel de saúde' : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Falha')
      await load()
    } catch (e: any) {
      setFeedback(e?.message || 'Erro')
    } finally {
      setBusy(false)
    }
  }

  async function optOutPhone() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      setFeedback('Informe um telefone válido')
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/whatsapp/eligibility/opt-out', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ phone: digits, reason: 'admin_panel' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Falha no opt-out')
      setFeedback(`Opt-out registrado. Filas limpas: ${JSON.stringify(json.purged || {})}`)
      setPhone('')
      await load()
    } catch (e: any) {
      setFeedback(e?.message || 'Erro')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" /> Carregando saúde WhatsApp…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    )
  }

  const totals = data?.totals24h || { sent: 0, denied: 0, failed: 0, optouts: 0 }
  const limits = data?.limits

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white">
            <Shield size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Saúde e elegibilidade de envio</p>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
              Camada obrigatória antes de campanhas, automações, fluxos e afiliados: bloqueio, opt-out,
              intervalo mínimo, limites por contato/seção/marca, deduplicação e pausa por qualidade.
              Controle principal = consentimento e qualidade — não só atraso entre mensagens.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Enviados 24h', value: totals.sent, tone: 'text-emerald-700' },
          { label: 'Negados 24h', value: totals.denied, tone: 'text-amber-700' },
          { label: 'Falhas 24h', value: totals.failed, tone: 'text-red-700' },
          { label: 'Opt-outs 24h', value: totals.optouts, tone: 'text-gray-800' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {limits && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-gray-900">Limites ativos</p>
          <div className="grid gap-2 text-[12px] text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
            <span>Intervalo mín. contato: <strong>{limits.minIntervalSeconds}s</strong></span>
            <span>Máx. / contato / dia: <strong>{limits.maxPerRecipientDay}</strong></span>
            <span>Máx. / seção / hora: <strong>{limits.maxPerInstanceHour}</strong></span>
            <span>Máx. / marca / dia: <strong>{limits.maxPerBrandDay}</strong></span>
            <span>Consentimento obrigatório: <strong>{limits.requireConsentForMarketing ? 'sim' : 'não (soft)'}</strong></span>
            <span>Rodapé 1ª mensagem: <strong>{limits.identifyFirstMessage ? 'sim' : 'não'}</strong></span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold text-gray-900">Seções</p>
        <div className="space-y-2">
          {(data?.instances || []).length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma seção encontrada.</p>
          )}
          {(data?.instances || []).map((inst) => {
            const failPct = inst.fail_rate_24h != null ? Math.round(Number(inst.fail_rate_24h) * 100) : null
            return (
              <div
                key={inst.id}
                className={`flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  inst.paused ? 'border-amber-200 bg-amber-50/60' : 'border-gray-100 bg-gray-50/50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{inst.name}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
                      {inst.status || '—'}
                    </span>
                    {inst.paused && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        <AlertTriangle size={11} /> Pausada
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {inst.phone || 'sem telefone'} · envios {inst.sends_24h ?? 0} · falhas {inst.fails_24h ?? 0}
                    {failPct != null ? ` · taxa ${failPct}%` : ''} · opt-outs {inst.optouts_24h ?? 0}
                  </p>
                  {inst.pause_reason && (
                    <p className="mt-1 text-[11px] text-amber-800">{inst.pause_reason}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pauseInstance(inst.id, !inst.paused)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {inst.paused ? <Play size={13} /> : <Pause size={13} />}
                  {inst.paused ? 'Retomar' : 'Pausar'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-gray-900">Bloquear / opt-out por telefone</p>
        <p className="mb-3 text-[11px] text-gray-500">
          Remove o contato das filas de campanha, automações e distribuição. Bloqueio global imediato.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="55 + DDD + número"
            className="h-10 flex-1 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void optOutPhone()}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-4 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Ban size={14} /> Registrar opt-out
          </button>
        </div>
        {feedback && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-700">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
            {feedback}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <Activity size={13} />
        Atualiza a cada 60s. Responda PARAR no WhatsApp também registra opt-out automático.
      </div>
    </div>
  )
}

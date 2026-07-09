import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, Play, Users, Inbox, CheckCircle2, Clock, AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

const QUEUE_STATUS: Record<string, string> = {
  pending: 'Aguardando',
  processing: 'Processando',
  assigned: 'Atribuído',
}

const TEMPLATE_HINT =
  'Placeholders: {{prospect_name}}, {{prospect_city}}, {{affiliate_name}}, {{brand_name}}, {{program_name}}'

type Props = {
  showToast: (t: string, tp?: 'ok' | 'err') => void
  saving: boolean
  setSaving: (v: boolean) => void
}

function dt(v?: string | null) {
  try {
    return new Date(v!).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function AffiliateDistributionSection({ showToast, saving, setSaving }: Props) {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [queue, setQueue] = useState<any[]>([])
  const [rulesForm, setRulesForm] = useState({
    is_enabled: true,
    auto_enqueue_capture: true,
    auto_send_initial_message: true,
    max_daily_per_affiliate: 20,
    initial_message_template: '',
    followup_enabled: true,
    followup_delays_hours_json: '[24,48,72]',
    followup_message_template: '',
  })

  const load = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    try {
      const headers = getHeaders()
      if (!headers['x-brand-id']) headers['x-brand-id'] = brandId
      const [ovRes, qRes] = await Promise.all([
        fetch(`/api/affiliates/distribution/overview?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        fetch(`/api/affiliates/distribution/queue?brand_id=${encodeURIComponent(brandId)}`, { headers }),
      ])
      const ovData = await ovRes.json()
      const qData = await qRes.json()
      if (!ovRes.ok) throw new Error(ovData.error || 'Erro ao carregar')
      if (!qRes.ok) throw new Error(qData.error || 'Erro na fila')
      setOverview(ovData)
      setQueue(qData.queue || [])
      const r = ovData.rules || qData.rules || {}
      setRulesForm({
        is_enabled: r.is_enabled !== false && r.is_enabled !== 0,
        auto_enqueue_capture: r.auto_enqueue_capture !== false && r.auto_enqueue_capture !== 0,
        auto_send_initial_message: r.auto_send_initial_message !== false && r.auto_send_initial_message !== 0,
        max_daily_per_affiliate: Number(r.max_daily_per_affiliate || 20),
        initial_message_template: String(r.initial_message_template || ''),
        followup_enabled: r.followup_enabled !== false && r.followup_enabled !== 0,
        followup_delays_hours_json: String(r.followup_delays_hours_json || '[24,48,72]'),
        followup_message_template: String(r.followup_message_template || ''),
      })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setLoading(false)
    }
  }, [brandId, showToast])

  useEffect(() => { void load() }, [load])

  async function saveRules() {
    setSaving(true)
    try {
      const headers = getHeaders()
      if (!headers['x-brand-id']) headers['x-brand-id'] = brandId
      const r = await fetch('/api/affiliates/distribution/rules', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rulesForm, brand_id: brandId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao salvar')
      showToast('Regras de distribuição salvas!')
      void load()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function processQueue() {
    setSaving(true)
    try {
      const headers = getHeaders()
      if (!headers['x-brand-id']) headers['x-brand-id'] = brandId
      const r = await fetch('/api/affiliates/distribution/process', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, max_items: 20 }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao processar')
      const assigned = (d.processed || []).filter((x: any) => x.assigned).length
      showToast(assigned ? `${assigned} prospect(s) atribuído(s)` : 'Fila processada — nenhuma atribuição nova')
      void load()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="affiliates-page__panel flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const q = overview?.queue || {}

  return (
    <div className="affiliates-page__panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Distribuição inteligente</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Prospects captados pela organização são enfileirados e atribuídos a afiliados elegíveis (WhatsApp conectado).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="affiliates-page__btn affiliates-page__btn--ghost"
            disabled={saving}
            onClick={() => void load()}
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
          <button
            type="button"
            className="affiliates-page__btn affiliates-page__btn--primary"
            disabled={saving || !rulesForm.is_enabled}
            onClick={() => void processQueue()}
          >
            <Play size={14} />
            Processar fila
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="affiliates-page__kpi">
          <span className="affiliates-page__kpi-label flex items-center gap-1"><Inbox size={12} /> Na fila</span>
          <p className="affiliates-page__kpi-value tabular-nums">{q.pending ?? 0}</p>
        </div>
        <div className="affiliates-page__kpi">
          <span className="affiliates-page__kpi-label flex items-center gap-1"><Users size={12} /> Elegíveis</span>
          <p className="affiliates-page__kpi-value tabular-nums">{overview?.eligible_affiliates ?? 0}</p>
        </div>
        <div className="affiliates-page__kpi">
          <span className="affiliates-page__kpi-label flex items-center gap-1"><CheckCircle2 size={12} /> Atribuídos</span>
          <p className="affiliates-page__kpi-value tabular-nums">{overview?.open_assignments ?? 0}</p>
        </div>
        <div className="affiliates-page__kpi">
          <span className="affiliates-page__kpi-label flex items-center gap-1"><Clock size={12} /> Processando</span>
          <p className="affiliates-page__kpi-value tabular-nums">{q.processing ?? 0}</p>
        </div>
      </div>

      {!overview?.eligible_affiliates && rulesForm.is_enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Nenhum afiliado elegível no momento. Verifique WhatsApp conectado, termos e treinamento.</span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Regras</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            onClick={() => setRulesForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
          >
            <span>Distribuição ativa</span>
            {rulesForm.is_enabled
              ? <ToggleRight size={22} className="text-emerald-600" />
              : <ToggleLeft size={22} className="text-gray-400" />}
          </button>
          <button
            type="button"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            onClick={() => setRulesForm((f) => ({ ...f, auto_enqueue_capture: !f.auto_enqueue_capture }))}
          >
            <span>Auto-enfileirar capturas Panfleteiro</span>
            {rulesForm.auto_enqueue_capture
              ? <ToggleRight size={22} className="text-emerald-600" />
              : <ToggleLeft size={22} className="text-gray-400" />}
          </button>
          <button
            type="button"
            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            onClick={() => setRulesForm((f) => ({ ...f, auto_send_initial_message: !f.auto_send_initial_message }))}
          >
            <span>Enviar 1ª mensagem pelo WhatsApp do afiliado</span>
            {rulesForm.auto_send_initial_message
              ? <ToggleRight size={22} className="text-emerald-600" />
              : <ToggleLeft size={22} className="text-gray-400" />}
          </button>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">Limite diário por afiliado</span>
            <input
              type="number"
              min={1}
              max={500}
              value={rulesForm.max_daily_per_affiliate}
              onChange={(e) => setRulesForm((f) => ({ ...f, max_daily_per_affiliate: Number(e.target.value) }))}
              className="rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Template da primeira mensagem</span>
          <textarea
            rows={4}
            value={rulesForm.initial_message_template}
            onChange={(e) => setRulesForm((f) => ({ ...f, initial_message_template: e.target.value }))}
            placeholder="Deixe vazio para usar o tom do programa ou o padrão do sistema"
            className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
          />
          <span className="text-xs text-gray-400">{TEMPLATE_HINT}</span>
        </label>
        <button
          type="button"
          className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
          onClick={() => setRulesForm((f) => ({ ...f, followup_enabled: !f.followup_enabled }))}
        >
          <span>Régua de follow-up automático</span>
          {rulesForm.followup_enabled
            ? <ToggleRight size={22} className="text-emerald-600" />
            : <ToggleLeft size={22} className="text-gray-400" />}
        </button>
        {rulesForm.followup_enabled && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Intervalos de follow-up (horas, JSON)</span>
              <input
                value={rulesForm.followup_delays_hours_json}
                onChange={(e) => setRulesForm((f) => ({ ...f, followup_delays_hours_json: e.target.value }))}
                className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                placeholder="[24,48,72]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">Template de follow-up</span>
              <textarea
                rows={3}
                value={rulesForm.followup_message_template}
                onChange={(e) => setRulesForm((f) => ({ ...f, followup_message_template: e.target.value }))}
                className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                placeholder="Vazio = padrão do sistema"
              />
            </label>
          </>
        )}
        <button
          type="button"
          className="affiliates-page__btn affiliates-page__btn--primary"
          disabled={saving}
          onClick={() => void saveRules()}
        >
          {saving ? 'Salvando…' : 'Salvar regras'}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Fila recente</h3>
        </div>
        {queue.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-500 text-center">Nenhum item na fila ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2 font-medium">Prospect</th>
                  <th className="px-4 py-2 font-medium">Origem</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Enfileirado</th>
                  <th className="px-4 py-2 font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 30).map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{item.prospect_name || '—'}</div>
                      <div className="text-xs text-gray-400">{item.prospect_phone || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{item.source || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.queue_status === 'assigned'
                          ? 'bg-emerald-50 text-emerald-700'
                          : item.queue_status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {QUEUE_STATUS[item.queue_status] || item.queue_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{dt(item.queued_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600 max-w-[180px] truncate">
                      {item.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
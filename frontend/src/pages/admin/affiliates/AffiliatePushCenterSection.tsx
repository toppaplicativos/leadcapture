/**
 * Central de Push do Programa de Afiliados (admin org).
 * Eventos comportamentais + campanhas manuais/agendadas com texto, imagem e deeplink.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Bell, Loader2, Plus, Send, Calendar, Zap, Image as ImageIcon, Link2,
  Save, Trash2, RefreshCw, X, Megaphone, Settings2,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'

type Props = { showToast: (t: string, tp?: 'ok' | 'err') => void }

type CatalogItem = {
  event_key: string
  label: string
  category: string
  default_title: string
  default_body: string
  default_deep_link: string | null
  effective: {
    title: string
    body: string
    deep_link: string
    image_url: string | null
    is_enabled: boolean
    priority: string
  }
  override: null | {
    title_template?: string
    body_template?: string
    image_url?: string
    deep_link?: string
    is_enabled?: boolean
  }
}

type Campaign = {
  id: string
  title: string
  body: string
  image_url: string | null
  deep_link: string | null
  cta_label: string | null
  trigger_type: 'manual' | 'schedule' | 'behavior'
  trigger_config: Record<string, unknown>
  status: string
  scheduled_at: string | null
  sent_at: string | null
  sent_count: number
  failed_count: number
}

type DeepPreset = { path: string; label: string }

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Agendado',
  behavior: 'Comportamento',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-amber-50 text-amber-800',
  sending: 'bg-blue-50 text-blue-700',
  sent: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
  failed: 'bg-red-50 text-red-700',
}

export function AffiliatePushCenterSection({ showToast }: Props) {
  const [sub, setSub] = useState<'events' | 'campaigns'>('campaigns')
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [presets, setPresets] = useState<DeepPreset[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState({
    title_template: '',
    body_template: '',
    deep_link: 'ranking',
    image_url: '',
    is_enabled: true,
  })
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    body: '',
    deep_link: 'ranking',
    image_url: '',
    cta_label: 'Abrir',
    trigger_type: 'manual' as 'manual' | 'schedule' | 'behavior',
    scheduled_at: '',
    behavior_event: 'affiliate.challenge.available',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const h = getHeaders()
      const b = localStorage.getItem('lead-system:active-brand-id') || ''
      const q = b ? `?brand_id=${encodeURIComponent(b)}` : ''
      const [cRes, campRes, pRes] = await Promise.all([
        fetch(`/api/affiliates/push/catalog${q}`, { headers: h }),
        fetch(`/api/affiliates/push/campaigns${q}`, { headers: h }),
        fetch(`/api/affiliates/push/presets${q}`, { headers: h }),
      ])
      const cData = await cRes.json().catch(() => ({}))
      const campData = await campRes.json().catch(() => ({}))
      const pData = await pRes.json().catch(() => ({}))
      if (!cRes.ok) throw new Error(cData.error || 'Falha no catálogo')
      if (!campRes.ok) throw new Error(campData.error || 'Falha nas campanhas')
      setCatalog(cData.catalog || [])
      setCampaigns(campData.campaigns || [])
      setPresets(pData.deep_links || [])
    } catch (e: any) {
      showToast(e?.message || 'Erro ao carregar central de push', 'err')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  function openEventEdit(item: CatalogItem) {
    setEditingKey(item.event_key)
    setEventForm({
      title_template: item.override?.title_template || item.default_title || '',
      body_template: item.override?.body_template || item.default_body || '',
      deep_link: item.override?.deep_link || item.effective.deep_link || 'ranking',
      image_url: item.override?.image_url || item.effective.image_url || '',
      is_enabled: item.effective.is_enabled !== false,
    })
  }

  async function saveEventOverride() {
    if (!editingKey) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/push/overrides/${encodeURIComponent(editingKey)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          title_template: eventForm.title_template,
          body_template: eventForm.body_template,
          deep_link: eventForm.deep_link,
          image_url: eventForm.image_url || null,
          is_enabled: eventForm.is_enabled,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha ao salvar')
      showToast('Evento atualizado')
      setEditingKey(null)
      void load()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File, onUrl: (url: string) => void) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const headers: Record<string, string> = {}
      const t = localStorage.getItem('lead-system-token')
      if (t) headers.Authorization = `Bearer ${t}`
      const b = localStorage.getItem('lead-system:active-brand-id')
      if (b) headers['x-brand-id'] = b
      const r = await fetch('/api/media/upload', { method: 'POST', headers, body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.file?.url) throw new Error(d.error || 'Upload falhou')
      onUrl(d.file.url)
      showToast('Imagem enviada')
    } catch (e: any) {
      showToast(e?.message || 'Erro no upload', 'err')
    }
  }

  async function createCampaign() {
    if (!campaignForm.title.trim() || !campaignForm.body.trim()) {
      return showToast('Título e mensagem são obrigatórios', 'err')
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: campaignForm.title.trim(),
        body: campaignForm.body.trim(),
        deep_link: campaignForm.deep_link || 'ranking',
        image_url: campaignForm.image_url || null,
        cta_label: campaignForm.cta_label || null,
        trigger_type: campaignForm.trigger_type,
      }
      if (campaignForm.trigger_type === 'schedule' && campaignForm.scheduled_at) {
        body.scheduled_at = new Date(campaignForm.scheduled_at).toISOString()
        body.status = 'scheduled'
      }
      if (campaignForm.trigger_type === 'behavior') {
        body.trigger_config = { event_key: campaignForm.behavior_event }
      }
      const r = await fetch('/api/affiliates/push/campaigns', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha ao criar')
      showToast(
        campaignForm.trigger_type === 'schedule'
          ? 'Campanha agendada'
          : campaignForm.trigger_type === 'behavior'
            ? 'Gatilho de comportamento salvo'
            : 'Campanha criada',
      )
      setFormOpen(false)
      setCampaignForm({
        title: '',
        body: '',
        deep_link: 'ranking',
        image_url: '',
        cta_label: 'Abrir',
        trigger_type: 'manual',
        scheduled_at: '',
        behavior_event: 'affiliate.challenge.available',
      })
      void load()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function sendNow(id: string) {
    if (!confirm('Enviar este push para todos os afiliados ativos agora?')) return
    setSaving(true)
    try {
      const r = await fetch(`/api/affiliates/push/campaigns/${id}/send`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha no envio')
      showToast(`Enviado: ${d.sent ?? 0} · falhas: ${d.failed ?? 0}`)
      void load()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function removeCampaign(id: string) {
    if (!confirm('Excluir campanha?')) return
    try {
      const r = await fetch(`/api/affiliates/push/campaigns/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Falha')
      showToast('Campanha excluída')
      void load()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    }
  }

  const DeepLinkSelect = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <label className="block">
      <span className="text-[12px] font-semibold text-neutral-700 inline-flex items-center gap-1">
        <Link2 size={12} /> Deeplink (destino no app)
      </span>
      <select
        className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
        value={
          presets.some((p) => value.endsWith(`/${p.path}`) || value === p.path || (p.path === '' && /\/painel\/?$/.test(value)))
            ? (presets.find((p) => value.endsWith(`/${p.path}`) || (p.path === '' && /\/painel\/?$/.test(value)) || value === p.path)?.path ?? value)
            : value
        }
        onChange={(e) => onChange(e.target.value)}
      >
        {presets.map((p) => (
          <option key={p.path || 'home'} value={p.path}>
            {p.label} {p.path ? `(…/${p.path})` : '(início)'}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-neutral-400">
        Ex.: ranking abre Ranking & Premiações no app do afiliado
      </p>
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900 tracking-tight flex items-center gap-2">
            <Bell size={18} className="text-neutral-700" />
            Central de Push
          </h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Textos, imagem, deeplink e disparo (manual, agenda ou comportamento) para a rede de afiliados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setSub('campaigns')}
              className={`px-3 h-9 rounded-[10px] text-xs font-semibold transition ${
                sub === 'campaigns' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> Campanhas</span>
            </button>
            <button
              type="button"
              onClick={() => setSub('events')}
              className={`px-3 h-9 rounded-[10px] text-xs font-semibold transition ${
                sub === 'events' ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Settings2 size={14} /> Eventos</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            aria-label="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
          {sub === 'campaigns' && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-neutral-900 text-white text-xs font-semibold"
            >
              <Plus size={14} /> Nova campanha
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-16 grid place-items-center text-neutral-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : sub === 'campaigns' ? (
        <div className="space-y-3">
          {!campaigns.length ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-12 text-center">
              <Megaphone size={28} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-sm font-semibold text-neutral-800">Nenhuma campanha ainda</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                Crie um push com título, texto, imagem e destino (ex. Ranking). Envie agora, agende ou amarre a um comportamento.
              </p>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-neutral-900 text-white text-xs font-semibold"
              >
                <Plus size={14} /> Criar campanha
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {campaigns.map((c) => (
                <article key={c.id} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="h-16 w-full bg-neutral-50 grid place-items-center text-neutral-300">
                      <Bell size={22} />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900 leading-snug">{c.title}</h3>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[c.status] || STATUS_STYLES.draft}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 line-clamp-2">{c.body}</p>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold text-neutral-500">
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 inline-flex items-center gap-1">
                        {c.trigger_type === 'schedule' ? <Calendar size={10} /> : c.trigger_type === 'behavior' ? <Zap size={10} /> : <Send size={10} />}
                        {TRIGGER_LABELS[c.trigger_type] || c.trigger_type}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-100 truncate max-w-[12rem]" title={c.deep_link || ''}>
                        → {c.deep_link?.split('/').filter(Boolean).slice(-1)[0] || 'início'}
                      </span>
                      {c.sent_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                          {c.sent_count} envios
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
                      {c.status !== 'sent' && c.status !== 'sending' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void sendNow(c.id)}
                          className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
                        >
                          <Send size={12} /> Enviar agora
                        </button>
                      )}
                      <button
                        type="button"
                        className="h-8 px-2.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 ml-auto"
                        onClick={() => void removeCampaign(c.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">
            Personalize o texto, imagem e destino de cada evento automático (nova premiação, comissão, lead…).
          </p>
          <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100 overflow-hidden">
            {catalog.map((item) => (
              <div key={item.event_key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                    <p className="text-[10px] text-neutral-400 font-mono truncate">{item.event_key}</p>
                    <p className="text-xs text-neutral-600 mt-1 line-clamp-1">{item.effective.title}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                      → {item.effective.deep_link}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.effective.is_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.effective.is_enabled ? 'Ativo' : 'Off'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEventEdit(item)}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event edit modal */}
      {editingKey && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={() => setEditingKey(null)} />
          <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-neutral-200">
            <header className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-neutral-900">Configurar evento</h3>
              <button type="button" className="w-9 h-9 grid place-items-center rounded-xl hover:bg-neutral-100" onClick={() => setEditingKey(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="p-4 space-y-3">
              <p className="text-[11px] font-mono text-neutral-400">{editingKey}</p>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Título</span>
                <input
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={eventForm.title_template}
                  onChange={(e) => setEventForm((f) => ({ ...f, title_template: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Mensagem</span>
                <textarea
                  className="mt-1.5 w-full min-h-[88px] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={eventForm.body_template}
                  onChange={(e) => setEventForm((f) => ({ ...f, body_template: e.target.value }))}
                />
                <p className="mt-1 text-[10px] text-neutral-400">
                  Variáveis: {'{{challenge_title}}'}, {'{{prize_label}}'}, {'{{rank}}'}…
                </p>
              </label>
              <DeepLinkSelect
                value={eventForm.deep_link}
                onChange={(v) => setEventForm((f) => ({ ...f, deep_link: v }))}
              />
              <div>
                <span className="text-[12px] font-semibold text-neutral-700">Imagem</span>
                <div className="mt-1.5 flex items-center gap-3">
                  {eventForm.image_url ? (
                    <img src={eventForm.image_url} alt="" className="w-20 h-14 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-neutral-100 grid place-items-center text-neutral-300 border">
                      <ImageIcon size={18} />
                    </div>
                  )}
                  <label className="h-9 px-3 rounded-lg border border-neutral-200 text-xs font-semibold cursor-pointer grid place-items-center hover:bg-neutral-50">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadImage(f, (url) => setEventForm((prev) => ({ ...prev, image_url: url })))
                      }}
                    />
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={eventForm.is_enabled}
                  onChange={(e) => setEventForm((f) => ({ ...f, is_enabled: e.target.checked }))}
                />
                Evento ativo (envia push)
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEventOverride()}
                className="w-full h-11 rounded-xl bg-neutral-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign create modal */}
      {formOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar" onClick={() => setFormOpen(false)} />
          <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl border border-neutral-200">
            <header className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-neutral-900">Nova campanha de push</h3>
              <button type="button" className="w-9 h-9 grid place-items-center rounded-xl hover:bg-neutral-100" onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Título</span>
                <input
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ex.: Nova premiação da semana"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Mensagem</span>
                <textarea
                  className="mt-1.5 w-full min-h-[88px] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={campaignForm.body}
                  onChange={(e) => setCampaignForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Texto do push que o afiliado vê no celular"
                />
              </label>
              <DeepLinkSelect
                value={campaignForm.deep_link}
                onChange={(v) => setCampaignForm((f) => ({ ...f, deep_link: v }))}
              />
              <div>
                <span className="text-[12px] font-semibold text-neutral-700">Imagem (opcional)</span>
                <div className="mt-1.5 flex items-center gap-3">
                  {campaignForm.image_url ? (
                    <img src={campaignForm.image_url} alt="" className="w-20 h-14 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-neutral-100 grid place-items-center text-neutral-300 border">
                      <ImageIcon size={18} />
                    </div>
                  )}
                  <label className="h-9 px-3 rounded-lg border border-neutral-200 text-xs font-semibold cursor-pointer grid place-items-center hover:bg-neutral-50">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadImage(f, (url) => setCampaignForm((prev) => ({ ...prev, image_url: url })))
                      }}
                    />
                  </label>
                </div>
              </div>
              <label className="block">
                <span className="text-[12px] font-semibold text-neutral-700">Disparo</span>
                <select
                  className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                  value={campaignForm.trigger_type}
                  onChange={(e) =>
                    setCampaignForm((f) => ({
                      ...f,
                      trigger_type: e.target.value as 'manual' | 'schedule' | 'behavior',
                    }))
                  }
                >
                  <option value="manual">Manual (enviar quando quiser)</option>
                  <option value="schedule">Agendado</option>
                  <option value="behavior">Por comportamento (evento)</option>
                </select>
              </label>
              {campaignForm.trigger_type === 'schedule' && (
                <label className="block">
                  <span className="text-[12px] font-semibold text-neutral-700">Data e hora</span>
                  <input
                    type="datetime-local"
                    className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                    value={campaignForm.scheduled_at}
                    onChange={(e) => setCampaignForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                  />
                </label>
              )}
              {campaignForm.trigger_type === 'behavior' && (
                <label className="block">
                  <span className="text-[12px] font-semibold text-neutral-700">Quando</span>
                  <select
                    className="mt-1.5 w-full h-11 rounded-xl border border-neutral-200 px-3 text-sm"
                    value={campaignForm.behavior_event}
                    onChange={(e) => setCampaignForm((f) => ({ ...f, behavior_event: e.target.value }))}
                  >
                    {catalog.map((c) => (
                      <option key={c.event_key} value={c.event_key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void createCampaign()}
                className="w-full h-11 rounded-xl bg-neutral-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Criar campanha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  Bell, Loader2, Zap, FileText, Volume2, Clock, Smartphone, ScrollText, Shield,
} from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

type Tab = 'events' | 'templates' | 'escalation' | 'push' | 'logs' | 'devices' | 'audit'

const TABS: { key: Tab; label: string; icon: typeof Bell }[] = [
  { key: 'events', label: 'Eventos', icon: Bell },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'escalation', label: 'Escalonamento', icon: Clock },
  { key: 'push', label: 'Push / Sons', icon: Volume2 },
  { key: 'logs', label: 'Logs', icon: ScrollText },
  { key: 'devices', label: 'Dispositivos', icon: Smartphone },
  { key: 'audit', label: 'Auditoria', icon: Shield },
]

const PRIORITIES = ['critical', 'high', 'normal', 'low']

export function MasterNotificationCenter() {
  const [tab, setTab] = useState<Tab>('events')
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<any[]>([])
  const [pushEvents, setPushEvents] = useState<any[]>([])
  const [escalation, setEscalation] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [pushDeliveries, setPushDeliveries] = useState<any[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [ev, push, esc, logRes, devRes, del] = await Promise.all([
        masterApi.notificationEvents(),
        masterApi.pushEvents(),
        masterApi.notificationEscalation(),
        masterApi.notificationLogs(120),
        masterApi.notificationDevices(),
        masterApi.pushDeliveries(60),
      ])
      setEvents(ev.events || [])
      setPushEvents(push.events || [])
      setEscalation(esc.rules || [])
      setLogs(logRes.logs || [])
      setDevices(devRes.devices || [])
      setPushDeliveries(del.entries || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || events[0] || null,
    [events, selectedEventId],
  )

  async function saveEvent(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      await masterApi.updateNotificationEvent(id, patch)
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    } finally {
      setBusyId(null)
    }
  }

  async function saveTemplate(eventTypeId: string, patch: Record<string, unknown>) {
    setBusyId(eventTypeId)
    try {
      await masterApi.updateNotificationTemplate(eventTypeId, patch)
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventTypeId ? { ...e, template: { ...e.template, ...patch } } : e,
        ),
      )
    } finally {
      setBusyId(null)
    }
  }

  async function saveEscalation(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      await masterApi.updateNotificationEscalation(id, patch)
      setEscalation((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    } finally {
      setBusyId(null)
    }
  }

  async function savePushEvent(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      await masterApi.updatePushEvent(id, patch)
      setPushEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    } finally {
      setBusyId(null)
    }
  }

  const byContext = events.reduce<Record<string, any[]>>((acc, ev) => {
    const k = ev.app_target || 'admin'
    if (!acc[k]) acc[k] = []
    acc[k].push(ev)
    return acc
  }, {})

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Notificações" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Configurações › Notificações"
        subtitle="Governança central — eventos, templates, ações, escalonamento, push e auditoria."
      />

      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] overflow-x-auto mb-5">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                tab === t.key ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'events' && (
        <div className="space-y-4">
          {Object.entries(byContext).map(([ctx, items]) => (
            <MasterCard key={ctx} className="overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <Bell size={14} className="text-white/50" />
                <h3 className="text-[13px] font-bold text-white capitalize">{ctx}</h3>
                <span className="text-[10px] text-white/40">{items.length} eventos</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-white/40 border-b border-white/[0.06]">
                      <th className="px-4 py-2">Evento</th>
                      <th className="px-4 py-2">Prioridade</th>
                      <th className="px-4 py-2">Push</th>
                      <th className="px-4 py-2">Som</th>
                      <th className="px-4 py-2">Ação</th>
                      <th className="px-4 py-2">Crítico</th>
                      <th className="px-4 py-2">Desativável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ev: any) => (
                      <tr key={ev.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-3">
                          <p className="text-[12px] font-medium text-white">{ev.name}</p>
                          <p className="text-[10px] text-white/40">{ev.event_key}</p>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={ev.default_priority || 'normal'}
                            disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { default_priority: e.target.value })}
                            className="h-7 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[10px] text-white"
                          >
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={!!ev.can_push} disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { can_push: e.target.checked })} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={!!ev.can_sound} disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { can_sound: e.target.checked })} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={!!ev.creates_action} disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { creates_action: e.target.checked })} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={!!ev.is_critical} disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { is_critical: e.target.checked })} />
                        </td>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={!!ev.can_be_disabled_by_user} disabled={busyId === ev.id}
                            onChange={(e) => saveEvent(ev.id, { can_be_disabled_by_user: e.target.checked })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MasterCard>
          ))}
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <MasterCard className="p-4 max-h-[70vh] overflow-y-auto">
            <p className="text-[11px] font-bold uppercase text-white/40 mb-3">Selecionar evento</p>
            <div className="space-y-1">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedEventId(ev.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition ${
                    (selectedEventId || events[0]?.id) === ev.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="font-medium">{ev.event_key}</span>
                  <span className="block text-[10px] text-white/40">{ev.app_target}</span>
                </button>
              ))}
            </div>
          </MasterCard>
          {selectedEvent && (
            <MasterCard className="p-5 space-y-4">
              <h3 className="text-[14px] font-bold text-white">{selectedEvent.event_key}</h3>
              {(['title_template', 'body_template', 'cta_label', 'deep_link_template'] as const).map((field) => (
                <label key={field} className="block">
                  <span className="text-[10px] uppercase text-white/40">{field.replace(/_/g, ' ')}</span>
                  {field === 'body_template' ? (
                    <textarea
                      defaultValue={selectedEvent.template?.[field] || ''}
                      rows={3}
                      onBlur={(e) => saveTemplate(selectedEvent.id, { [field]: e.target.value })}
                      className="mt-1 w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white"
                    />
                  ) : (
                    <input
                      defaultValue={selectedEvent.template?.[field] || ''}
                      onBlur={(e) => saveTemplate(selectedEvent.id, { [field]: e.target.value })}
                      className="mt-1 w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white"
                    />
                  )}
                </label>
              ))}
              <p className="text-[10px] text-white/35">
                Variáveis: {'{{customer_name}}'}, {'{{amount}}'}, {'{{order_number}}'}, etc.
              </p>
            </MasterCard>
          )}
        </div>
      )}

      {tab === 'escalation' && (
        <MasterCard className="overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            <h3 className="text-[13px] font-bold text-white">Regras de escalonamento</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase text-white/40 border-b border-white/[0.06]">
                  <th className="px-4 py-2">Evento</th>
                  <th className="px-4 py-2">SLA (min)</th>
                  <th className="px-4 py-2">1º lembrete</th>
                  <th className="px-4 py-2">Escalar</th>
                  <th className="px-4 py-2">Redistribuir</th>
                  <th className="px-4 py-2">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {escalation.map((r: any) => (
                  <tr key={r.id} className="border-b border-white/[0.04] text-[11px]">
                    <td className="px-4 py-3 text-white/80">
                      <p>{r.event_key}</p>
                      <p className="text-white/40">{r.action_type}</p>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={r.sla_minutes} className="w-16 h-7 px-2 rounded bg-white/[0.04] border border-white/10 text-white"
                        onBlur={(e) => saveEscalation(r.id, { sla_minutes: Number(e.target.value) })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={r.first_reminder_minutes || ''} className="w-16 h-7 px-2 rounded bg-white/[0.04] border border-white/10 text-white"
                        onBlur={(e) => saveEscalation(r.id, { first_reminder_minutes: Number(e.target.value) || null })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={r.second_reminder_minutes || ''} className="w-16 h-7 px-2 rounded bg-white/[0.04] border border-white/10 text-white"
                        onBlur={(e) => saveEscalation(r.id, { second_reminder_minutes: Number(e.target.value) || null })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={!!r.auto_reassign} onChange={(e) => saveEscalation(r.id, { auto_reassign: e.target.checked })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={!!r.is_active} onChange={(e) => saveEscalation(r.id, { is_active: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MasterCard>
      )}

      {tab === 'push' && (
        <div className="space-y-4">
          {Object.entries(
            pushEvents.reduce<Record<string, any[]>>((acc, ev) => {
              const k = ev.app_context || 'admin'
              if (!acc[k]) acc[k] = []
              acc[k].push(ev)
              return acc
            }, {}),
          ).map(([ctx, items]) => (
            <MasterCard key={ctx} className="overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-[13px] font-bold text-white capitalize">Push — {ctx}</h3>
              </div>
              <table className="w-full">
                <tbody>
                  {items.map((ev: any) => (
                    <tr key={ev.id} className="border-b border-white/[0.04] text-[11px]">
                      <td className="px-4 py-2 text-white/70">{ev.label}</td>
                      <td className="px-4 py-2">
                        <select value={ev.sound_key || ''} onChange={(e) => savePushEvent(ev.id, { sound_key: e.target.value || null })}
                          className="h-7 px-2 rounded bg-white/[0.04] border border-white/10 text-white">
                          <option value="">—</option>
                          <option value="alert_critical">Crítico</option>
                          <option value="new_lead">Lead</option>
                          <option value="sale">Venda</option>
                          <option value="stock">Estoque</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={ev.mandatory} onChange={(e) => savePushEvent(ev.id, { mandatory: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MasterCard>
          ))}
        </div>
      )}

      {tab === 'logs' && (
        <MasterCard className="overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0f0f12]">
                <tr className="text-white/40 uppercase text-[10px] border-b border-white/[0.06]">
                  <th className="px-4 py-2 text-left">Evento</th>
                  <th className="px-4 py-2 text-left">Canal</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Quando</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l: any) => (
                  <tr key={l.id} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-white/70">{l.event_key}</td>
                    <td className="px-4 py-2 text-white/50">{l.channel}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        l.status === 'delivered' || l.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300'
                          : l.status === 'failed' ? 'bg-red-500/15 text-red-300'
                            : 'bg-white/10 text-white/50'
                      }`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-2 text-white/40">
                      {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MasterCard>
      )}

      {tab === 'devices' && (
        <MasterCard className="overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            {devices.length === 0 ? (
              <p className="px-5 py-10 text-center text-white/40 text-[13px]">Nenhum dispositivo registrado.</p>
            ) : (
              <table className="w-full text-[11px]">
                <tbody>
                  {devices.map((d: any) => (
                    <tr key={d.id} className="border-b border-white/[0.04]">
                      <td className="px-4 py-3 text-white/70">{d.user_id?.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-white/50">{d.app_context}</td>
                      <td className="px-4 py-3 text-white/50">{d.browser} · {d.operating_system}</td>
                      <td className="px-4 py-3 text-white/40">
                        {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </MasterCard>
      )}

      {tab === 'audit' && (
        <MasterCard className="overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <h3 className="text-[13px] font-bold text-white">Auditoria push (legado)</h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {pushDeliveries.map((d: any) => (
              <div key={d.id} className="px-4 py-2 border-b border-white/[0.04] text-[11px] flex justify-between">
                <span className="text-white/70">{d.event_key}</span>
                <span className="text-white/40">{d.status}</span>
              </div>
            ))}
          </div>
        </MasterCard>
      )}
    </>
  )
}
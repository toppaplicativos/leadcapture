import { useEffect, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const PRIORITY_OPTIONS = ['critical', 'high', 'normal', 'low']

export function MasterPushCenter() {
  const [events, setEvents] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [ev, del] = await Promise.all([
        masterApi.pushEvents(),
        masterApi.pushDeliveries(80),
      ])
      setEvents(ev.events || [])
      setDeliveries(del.entries || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function saveEvent(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      await masterApi.updatePushEvent(id, patch)
      setEvents(prev =>
        prev.map(e => (e.id === id ? { ...e, ...patch } : e)),
      )
    } finally {
      setBusyId(null)
    }
  }

  const byContext = events.reduce<Record<string, any[]>>((acc, ev) => {
    const k = ev.app_context || 'admin'
    if (!acc[k]) acc[k] = []
    acc[k].push(ev)
    return acc
  }, {})

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Push Notifications" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Push Notifications"
        subtitle="Governança central — eventos, prioridades, sons e auditoria de entregas nativas."
      />

      <div className="space-y-4">
        {Object.entries(byContext).map(([ctx, items]) => (
          <MasterCard key={ctx} className="overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
              <Bell size={16} className="text-white/50" />
              <h3 className="text-[14px] font-bold text-white capitalize">{ctx}</h3>
              <span className="text-[11px] text-white/40">{items.length} eventos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wide text-white/40">
                    <th className="px-4 py-2">Evento</th>
                    <th className="px-4 py-2">Prioridade</th>
                    <th className="px-4 py-2">Padrão</th>
                    <th className="px-4 py-2">Obrig.</th>
                    <th className="px-4 py-2">Som</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ev: any) => (
                    <tr key={ev.id || ev.event_key} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium text-white">{ev.label}</p>
                        <p className="text-[10px] text-white/40">{ev.event_key}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={ev.default_priority || 'normal'}
                          disabled={busyId === ev.id}
                          onChange={e => saveEvent(ev.id, { default_priority: e.target.value })}
                          className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-white"
                        >
                          {PRIORITY_OPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={ev.default_enabled !== false}
                          disabled={busyId === ev.id}
                          onChange={e => saveEvent(ev.id, { default_enabled: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!ev.mandatory}
                          disabled={busyId === ev.id}
                          onChange={e => saveEvent(ev.id, { mandatory: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-white/60">{ev.sound_key || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterCard>
        ))}
      </div>

      <MasterCard className="mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-[14px] font-bold text-white">Auditoria de entregas</h3>
          <p className="text-[11px] text-white/40 mt-0.5">Últimas entregas push (sent / skipped / failed)</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {deliveries.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-white/40">Nenhuma entrega registrada ainda.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="border-b border-white/[0.04] text-[11px]">
                    <td className="px-4 py-2 text-white/70">{d.event_key}</td>
                    <td className="px-4 py-2 text-white/50">{d.app_context}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                          d.status === 'sent'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : d.status === 'failed'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-white/10 text-white/50'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-white/40 tabular-nums">
                      {new Date(d.created_at).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </MasterCard>
    </>
  )
}
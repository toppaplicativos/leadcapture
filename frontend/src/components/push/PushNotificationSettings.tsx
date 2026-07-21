import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell, BellOff, Loader2, Smartphone, Volume2, Moon, TestTube, CheckCircle2,
} from 'lucide-react'
import { pushApi } from '@/lib/push/api'
import {
  pushPermission, pushSupported, subscribeToPush, unsubscribeFromPush,
} from '@/lib/push/client'
import { pushContextLabel, resolvePushAppContext } from '@/lib/push/context'
import { PushActivationCard } from './PushActivationCard'

const CATEGORY_LABELS: Record<string, string> = {
  account_security: 'Conta e segurança',
  whatsapp: 'WhatsApp e conexões',
  leads: 'Leads e prospects',
  clients: 'Clientes',
  sales: 'Vendas e conversões',
  commissions: 'Comissões e pagamentos',
  tasks: 'Tarefas e follow-ups',
  campaigns: 'Campanhas',
  support: 'Suporte',
  inventory: 'Estoque',
  orders: 'Pedidos e entregas',
  system: 'Sistema',
  onboarding: 'Onboarding e programas',
  reports: 'Relatórios',
}

export function PushNotificationSettings({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const ctx = resolvePushAppContext()
  const [perm, setPerm] = useState(pushPermission())
  const [events, setEvents] = useState<any[]>([])
  const [device, setDevice] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const card = dark
    ? 'rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-5'
    : 'rounded-2xl bg-white border border-gray-100 shadow-sm p-5'
  const titleCls = dark ? 'text-white' : 'text-gray-900'
  const subCls = dark ? 'text-white/50' : 'text-gray-500'
  const labelCls = dark ? 'text-white/80' : 'text-gray-700'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, devRes] = await Promise.all([
        pushApi.listEvents(ctx),
        pushApi.listDevices(ctx),
      ])
      setEvents(evRes.events || [])
      setDevice(devRes.devices?.[0] || null)
      setPerm(pushPermission())
    } catch (err: any) {
      setEvents([])
      setDevice(null)
      setToast('Não foi possível carregar este dispositivo agora')
      setTimeout(() => setToast(null), 4000)
    } finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const ev of events) {
      const cat = ev.category || 'system'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(ev)
    }
    return [...map.entries()]
  }, [events])

  const prefs = device?.preferences_json || {}

  async function patchPrefs(patch: Record<string, unknown>) {
    if (!device?.id) return
    setSaving(true)
    try {
      const r = await pushApi.updatePreferences(device.id, patch)
      setDevice(r.device)
      setToast('Preferências salvas')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function toggleEvent(eventKey: string, enabled: boolean) {
    const eventsMap = { ...(prefs.events || {}), [eventKey]: enabled }
    await patchPrefs({ events: eventsMap })
  }

  async function runTest() {
    setTesting(true)
    try {
      const r = await pushApi.sendTest({
        app_context: ctx,
        title: 'Teste LeadCapture Push',
        body: 'Push nativo funcionando neste dispositivo.',
        url: window.location.pathname,
      })
      setToast(`Enviado: ${r.result.sent} · ignorados: ${r.result.skipped}`)
    } catch (err: any) {
      setToast(err?.message || 'Falha no teste')
    } finally {
      setTesting(false)
      setTimeout(() => setToast(null), 3500)
    }
  }

  if (!pushSupported()) {
    return (
      <div className={card}>
        <p className={`text-[13px] ${subCls}`}>Push nativo não é suportado neste navegador.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 size={20} className={`animate-spin ${dark ? 'text-white/40' : 'text-gray-400'}`} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PushActivationCard
        compact={compact}
        className={dark ? '!border-white/10 !bg-white/[0.02]' : ''}
        onActivated={load}
      />

      {toast && (
        <div className={`text-[12px] px-3 py-2 rounded-xl ${
          /^não|^falha|^erro/i.test(toast)
            ? dark ? 'bg-red-500/15 text-red-300' : 'bg-amber-50 text-amber-800'
            : dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {toast}
        </div>
      )}

      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`text-[15px] font-bold ${titleCls}`}>Este dispositivo</h3>
            <p className={`text-[12px] ${subCls} mt-0.5`}>
              {pushContextLabel(ctx)} · permissão: <strong>{perm}</strong>
            </p>
          </div>
          {perm === 'granted' && (
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !device}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium ${
                dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube size={13} />}
              Testar push
            </button>
          )}
        </div>

        {device && (
          <div className={`mt-4 flex items-center gap-3 text-[12px] ${subCls}`}>
            <Smartphone size={14} />
            {device.browser || 'Browser'} · {device.operating_system || 'OS'}
            {device.last_seen_at && (
              <span>· visto {new Date(device.last_seen_at).toLocaleString('pt-BR')}</span>
            )}
          </div>
        )}
      </div>

      {perm === 'granted' && device && (
        <>
          <div className={card}>
            <h3 className={`text-[15px] font-bold ${titleCls} mb-3 flex items-center gap-2`}>
              <Volume2 size={16} /> Sons e alertas
            </h3>
            <Toggle
              dark={dark}
              label="Receber notificações neste dispositivo"
              checked={device.is_active !== false && prefs.device_enabled !== false}
              onChange={v => patchPrefs({ device_enabled: v, is_active: v })}
              disabled={saving}
            />
            <Toggle
              dark={dark}
              label="Tocar som nos alertas (quando suportado pelo SO)"
              checked={device.sound_enabled !== false}
              onChange={v => patchPrefs({ sound_enabled: v })}
              disabled={saving}
            />
            <Toggle
              dark={dark}
              label="Vibrar quando disponível"
              checked={prefs.vibrate_enabled !== false}
              onChange={v => patchPrefs({ vibrate_enabled: v })}
              disabled={saving}
            />
            <Toggle
              dark={dark}
              label="Alertas críticos ignoram horário silencioso"
              checked={prefs.critical_override_quiet !== false}
              onChange={v => patchPrefs({ critical_override_quiet: v })}
              disabled={saving}
            />
            <Toggle
              dark={dark}
              label="Mostrar prévia nas notificações"
              checked={prefs.show_preview !== false}
              onChange={v => patchPrefs({ show_preview: v })}
              disabled={saving}
            />
            <Toggle
              dark={dark}
              label="Ocultar dados sensíveis na prévia"
              checked={prefs.show_sensitive === false}
              onChange={v => patchPrefs({ show_sensitive: !v })}
              disabled={saving}
            />
          </div>

          <div className={card}>
            <h3 className={`text-[15px] font-bold ${titleCls} mb-3 flex items-center gap-2`}>
              <Moon size={16} /> Horário silencioso
            </h3>
            <Toggle
              dark={dark}
              label="Ativar modo silencioso"
              checked={!!prefs.quiet_hours?.enabled}
              onChange={v =>
                patchPrefs({
                  quiet_hours: { ...prefs.quiet_hours, enabled: v },
                })
              }
              disabled={saving}
            />
            {prefs.quiet_hours?.enabled && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className={`text-[12px] ${labelCls}`}>
                  Início
                  <input
                    type="time"
                    defaultValue={prefs.quiet_hours?.start || '22:00'}
                    onBlur={e =>
                      patchPrefs({
                        quiet_hours: { ...prefs.quiet_hours, start: e.target.value },
                      })
                    }
                    className={`mt-1 w-full h-9 px-2 rounded-lg border text-[13px] ${
                      dark ? 'bg-white/5 border-white/10 text-white' : 'border-gray-200'
                    }`}
                  />
                </label>
                <label className={`text-[12px] ${labelCls}`}>
                  Fim
                  <input
                    type="time"
                    defaultValue={prefs.quiet_hours?.end || '07:00'}
                    onBlur={e =>
                      patchPrefs({
                        quiet_hours: { ...prefs.quiet_hours, end: e.target.value },
                      })
                    }
                    className={`mt-1 w-full h-9 px-2 rounded-lg border text-[13px] ${
                      dark ? 'bg-white/5 border-white/10 text-white' : 'border-gray-200'
                    }`}
                  />
                </label>
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className={`text-[15px] font-bold ${titleCls} mb-1`}>Preferências por categoria</h3>
            <p className={`text-[12px] ${subCls} mb-4`}>
              Eventos obrigatórios não podem ser desativados pelo usuário.
            </p>
            <div className="space-y-5">
              {grouped.map(([cat, items]) => (
                <div key={cat}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${subCls}`}>
                    {CATEGORY_LABELS[cat] || cat}
                  </p>
                  <div className="space-y-1">
                    {items.map((ev: any) => {
                      const on =
                        prefs.events?.[ev.event_key] !== undefined
                          ? !!prefs.events[ev.event_key]
                          : ev.default_enabled !== false
                      const soundOn =
                        prefs.sound_events?.[ev.event_key] !== undefined
                          ? !!prefs.sound_events[ev.event_key]
                          : device.sound_enabled !== false
                      return (
                        <div
                          key={ev.event_key}
                          className={`py-2 border-b last:border-0 ${
                            dark ? 'border-white/[0.05]' : 'border-gray-100'
                          }`}
                        >
                          <label className="flex items-center justify-between gap-3">
                            <span className={`text-[13px] ${labelCls}`}>
                              {ev.label}
                              {ev.mandatory && (
                                <span className="ml-1.5 text-[10px] text-amber-500 font-bold">obrigatório</span>
                              )}
                            </span>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={saving || ev.mandatory}
                              onChange={e => toggleEvent(ev.event_key, e.target.checked)}
                              className="w-4 h-4 rounded"
                              title="Receber push"
                            />
                          </label>
                          {on && !ev.mandatory && (
                            <label className={`flex items-center justify-between gap-3 mt-1 pl-3 ${subCls}`}>
                              <span className="text-[11px]">Com som</span>
                              <input
                                type="checkbox"
                                checked={soundOn}
                                disabled={saving || !device.sound_enabled}
                                onChange={e => {
                                  const sound_events = { ...(prefs.sound_events || {}), [ev.event_key]: e.target.checked }
                                  patchPrefs({ sound_events })
                                }}
                                className="w-3.5 h-3.5 rounded"
                              />
                            </label>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {perm === 'granted' && !device && (
        <div className={`${card} flex items-center gap-2 text-[13px] ${subCls}`}>
          <CheckCircle2 size={16} className="text-emerald-500" />
          Permissão concedida — sincronizando dispositivo…
          <button type="button" onClick={() => subscribeToPush().then(load)} className="underline ml-1">
            Registrar agora
          </button>
        </div>
      )}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  dark,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  dark?: boolean
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-2.5 border-b last:border-0 ${dark ? 'border-white/[0.05]' : 'border-gray-100'}`}>
      <span className={`text-[13px] ${dark ? 'text-white/80' : 'text-gray-700'}`}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
          checked ? 'bg-emerald-500' : dark ? 'bg-white/15' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

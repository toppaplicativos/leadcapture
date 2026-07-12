/**
 * Shared structure for Instagram + WhatsApp attendance config.
 * Global training lives on AgentConfigPage; this is channel-specific.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Save, CheckCircle2, AlertCircle, MessageCircle,
  FlaskConical, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'

type Channel = 'instagram' | 'whatsapp'

type Attendance = {
  enabled: boolean
  training_channel: string
  persona_override: string
  tone_override: string
  max_chars: number
  split_long_replies: boolean
  max_bubbles: number
  first_contact_override: string
  channel_rules: string
  sales_mode: 'off' | 'assist' | 'full'
  include_catalog: boolean
  include_kb: boolean
  include_skills: boolean
  faq_json: Array<{ q: string; a: string }>
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

const empty: Attendance = {
  enabled: true,
  training_channel: '',
  persona_override: '',
  tone_override: '',
  max_chars: 900,
  split_long_replies: true,
  max_bubbles: 3,
  first_contact_override: '',
  channel_rules: '',
  sales_mode: 'assist',
  include_catalog: true,
  include_kb: true,
  include_skills: true,
  faq_json: [],
}

export function ChannelAttendancePanel({ channel }: { channel: Channel }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Attendance>(empty)
  const [hardCap, setHardCap] = useState(channel === 'instagram' ? 1000 : 4096)
  const [testText, setTestText] = useState('ola, quanto custa o produto?')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    bubbles: string[]
    source?: string
    used?: Record<string, boolean>
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/attendance/${channel}`, { headers: headers() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setForm({ ...empty, ...(j.attendance || {}) })
      if (j.platform_hard_cap) setHardCap(Number(j.platform_hard_cap))
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar atendimento do canal')
    } finally {
      setLoading(false)
    }
  }, [channel])

  useEffect(() => {
    load()
  }, [load])

  const patch = <K extends keyof Attendance>(key: K, value: Attendance[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetch(`/api/attendance/${channel}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          ...form,
          max_chars: Math.max(50, Math.min(hardCap, Number(form.max_chars) || 900)),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setForm({ ...empty, ...(j.attendance || {}) })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const r = await fetch(`/api/attendance/${channel}/test`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ text: testText }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setTestResult({ bubbles: j.bubbles || [], source: j.source, used: j.used })
    } catch (e: any) {
      setError(e?.message || 'Falha no teste')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-gray-400" size={22} />
      </div>
    )
  }

  const Icon = channel === 'instagram' ? InstagramIcon : MessageCircle
  const title = channel === 'instagram' ? 'Atendimento Instagram' : 'Atendimento WhatsApp'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Icon size={18} className="text-gray-700" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Complementa o <strong>Treinamento Global</strong>. Hard cap do canal: {hardCap} caracteres.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar canal'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Enable */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <button
          type="button"
          onClick={() => patch('enabled', !form.enabled)}
          className="flex items-center gap-2 text-sm font-medium text-gray-800"
        >
          {form.enabled ? (
            <ToggleRight size={22} className="text-emerald-600" />
          ) : (
            <ToggleLeft size={22} className="text-gray-400" />
          )}
          Atendimento IA neste canal {form.enabled ? 'ligado' : 'desligado'}
        </button>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Treinamento específico do canal
          </span>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[88px]"
            placeholder={
              channel === 'instagram'
                ? 'Ex.: No Direct seja visual e curto; ofereça menu; mencione stories e catálogo…'
                : 'Ex.: No WhatsApp confirme pedido e frete; use listas; handoff humano se pedir vendedor…'
            }
            value={form.training_channel}
            onChange={(e) => patch('training_channel', e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Persona (override)</span>
            <input
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.persona_override}
              onChange={(e) => patch('persona_override', e.target.value)}
              placeholder="Vazio = herda treino global"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Tom (override)</span>
            <input
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.tone_override}
              onChange={(e) => patch('tone_override', e.target.value)}
              placeholder="ex.: caloroso e direto"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Regras do canal</span>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[72px]"
            value={form.channel_rules}
            onChange={(e) => patch('channel_rules', e.target.value)}
            placeholder="Regras só deste canal (além do global)"
          />
        </label>
      </section>

      {/* Limits + sales */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Limites e vendas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-gray-500">Max chars/bolha</span>
            <input
              type="number"
              min={50}
              max={hardCap}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.max_chars}
              onChange={(e) => patch('max_chars', Number(e.target.value) || 900)}
            />
            <span className="text-[10px] text-gray-400">cap {hardCap}</span>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-gray-500">Max bolhas</span>
            <input
              type="number"
              min={1}
              max={5}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={form.max_bubbles}
              onChange={(e) => patch('max_bubbles', Number(e.target.value) || 3)}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-gray-500">Modo vendas</span>
            <select
              className="ds-select mt-1 w-full h-10 rounded-xl border border-border px-3 text-sm text-gray-900 bg-white"
              value={form.sales_mode}
              onChange={(e) => patch('sales_mode', e.target.value as Attendance['sales_mode'])}
            >
              <option value="off">Off</option>
              <option value="assist">Assist</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="flex items-center gap-2 mt-5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.split_long_replies}
              onChange={(e) => patch('split_long_replies', e.target.checked)}
            />
            Split multi-bolha
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.include_catalog} onChange={(e) => patch('include_catalog', e.target.checked)} />
            Catálogo/preços
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.include_kb} onChange={(e) => patch('include_kb', e.target.checked)} />
            Base de conhecimento
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.include_skills} onChange={(e) => patch('include_skills', e.target.checked)} />
            Skills da marca
          </label>
        </div>
      </section>

      {/* Test */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <FlaskConical size={15} /> Testar resposta
        </p>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[64px]"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
        />
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        >
          {testing ? 'Gerando…' : 'Simular mensagem do cliente'}
        </button>
        {testResult && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Fonte: {testResult.source || '—'} · bolhas: {testResult.bubbles.length}
              {testResult.used && (
                <> · contexto: {[
                  testResult.used.catalog && 'catálogo',
                  testResult.used.knowledge && 'KB',
                  testResult.used.skills && 'skills',
                  testResult.used.training_global && 'treino global',
                  testResult.used.training_channel && 'treino canal',
                ].filter(Boolean).join(', ') || 'mínimo'}</>
              )}
            </p>
            {testResult.bubbles.map((b, i) => (
              <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-800">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Bolha {i + 1} · {b.length} chars</span>
                <p className="mt-1 whitespace-pre-wrap">{b}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

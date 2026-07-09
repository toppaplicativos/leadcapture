import { Calendar, Zap, Camera, MessageCircle, Users, Mail } from 'lucide-react'
import type {
  AutomationTrigger, TriggerAgendamento, TriggerEvento, Frequencia, Plataforma,
} from '@/lib/automations/schema'
import {
  EVENTOS_INSTAGRAM, EVENTOS_WHATSAPP, EVENTOS_LEADS,
} from '@/lib/automations/schema'
import { buildCron } from '@/lib/automations/cron-builder'

const FREQUENCIAS: Array<{ id: Frequencia; label: string }> = [
  { id: 'diario', label: 'Diário' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'uma_vez', label: 'Uma vez' },
  { id: 'intervalo', label: 'Intervalo' },
]

const PLATAFORMAS: Array<{ id: Plataforma; label: string; Icon: typeof Camera }> = [
  { id: 'instagram', label: 'Instagram', Icon: Camera },
  { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { id: 'leads', label: 'Leads', Icon: Users },
  { id: 'email', label: 'E-mail', Icon: Mail },
]

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type Props = {
  trigger: AutomationTrigger
  onChange: (trigger: AutomationTrigger) => void
}

function eventosForPlatform(p: Plataforma) {
  if (p === 'instagram') return EVENTOS_INSTAGRAM
  if (p === 'whatsapp') return EVENTOS_WHATSAPP
  if (p === 'leads') return EVENTOS_LEADS
  return [{ id: 'formulario_contato', label: 'Formulário de contato' }]
}

export function AutomationTriggerEditor({ trigger, onChange }: Props) {
  const setTrigger = (next: AutomationTrigger) => {
    onChange(next.tipo === 'agendamento' ? { ...next, cron: buildCron(next) } : next)
  }

  const agendamento = trigger.tipo === 'agendamento' ? trigger : null
  const evento = trigger.tipo === 'evento' ? trigger : null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setTrigger({
            tipo: 'agendamento',
            frequencia: 'diario',
            horarios: [{ hora: 9, minuto: 0 }],
            cron: '0 9 * * *',
            timezone: 'America/Sao_Paulo',
          })}
          className={`p-4 rounded-xl border-2 text-left ${trigger.tipo === 'agendamento' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}
        >
          <Calendar size={20} className="mb-2 text-sky-600" />
          <div className="font-semibold text-sm">Agendamento</div>
          <div className="text-xs text-gray-500">Periódico ou data única</div>
        </button>
        <button
          type="button"
          onClick={() => setTrigger({
            tipo: 'evento',
            plataforma: 'instagram',
            evento: 'novo_seguidor',
            palavrasChave: [],
          })}
          className={`p-4 rounded-xl border-2 text-left ${trigger.tipo === 'evento' ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}
        >
          <Zap size={20} className="mb-2 text-violet-600" />
          <div className="font-semibold text-sm">Evento / Gatilho</div>
          <div className="text-xs text-gray-500">Reage quando algo acontece</div>
        </button>
      </div>

      {agendamento && (
        <AgendamentoFields trigger={agendamento} onChange={(t) => setTrigger(t)} />
      )}
      {evento && (
        <EventoFields trigger={evento} onChange={(t) => setTrigger(t)} />
      )}
    </div>
  )
}

function AgendamentoFields({ trigger, onChange }: { trigger: TriggerAgendamento; onChange: (t: TriggerAgendamento) => void }) {
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div className="flex flex-wrap gap-2">
        {FREQUENCIAS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange({ ...trigger, frequencia: f.id })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${trigger.frequencia === f.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {trigger.frequencia === 'intervalo' && (
        <label className="block text-xs text-gray-600">
          Intervalo (minutos)
          <input
            type="number"
            min={1}
            max={43200}
            value={trigger.intervaloMinutos || 30}
            onChange={(e) => onChange({ ...trigger, intervaloMinutos: parseInt(e.target.value, 10) || 30 })}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>
      )}

      {trigger.frequencia === 'uma_vez' && (
        <label className="block text-xs text-gray-600">
          Data e hora
          <input
            type="datetime-local"
            value={trigger.dataHoraUnica?.slice(0, 16) || ''}
            onChange={(e) => onChange({ ...trigger, dataHoraUnica: new Date(e.target.value).toISOString() })}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </label>
      )}

      {trigger.frequencia !== 'intervalo' && trigger.frequencia !== 'uma_vez' && (
        <div className="flex gap-3">
          <label className="text-xs text-gray-600">
            Hora
            <input
              type="number" min={0} max={23}
              value={trigger.horarios?.[0]?.hora ?? 9}
              onChange={(e) => {
                const hora = parseInt(e.target.value, 10) || 0
                const minuto = trigger.horarios?.[0]?.minuto ?? 0
                onChange({ ...trigger, horarios: [{ hora, minuto }] })
              }}
              className="mt-1 w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            Minuto
            <input
              type="number" min={0} max={59}
              value={trigger.horarios?.[0]?.minuto ?? 0}
              onChange={(e) => {
                const minuto = parseInt(e.target.value, 10) || 0
                const hora = trigger.horarios?.[0]?.hora ?? 9
                onChange({ ...trigger, horarios: [{ hora, minuto }] })
              }}
              className="mt-1 w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm"
            />
          </label>
        </div>
      )}

      {trigger.frequencia === 'semanal' && (
        <div className="flex flex-wrap gap-1">
          {DIAS.map((d, i) => {
            const selected = trigger.diasSemana?.includes(i)
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const cur = trigger.diasSemana || []
                  const diasSemana = selected ? cur.filter((x) => x !== i) : [...cur, i]
                  onChange({ ...trigger, diasSemana })
                }}
                className={`w-9 h-9 rounded-lg text-[10px] font-bold ${selected ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200'}`}
              >
                {d}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-400 font-mono">cron: {buildCron(trigger)}</p>
    </div>
  )
}

function EventoFields({ trigger, onChange }: { trigger: TriggerEvento; onChange: (t: TriggerEvento) => void }) {
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
      <div className="flex flex-wrap gap-2">
        {PLATAFORMAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              const ev = eventosForPlatform(p.id)[0]?.id || ''
              onChange({ ...trigger, plataforma: p.id, evento: ev })
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${trigger.plataforma === p.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200'}`}
          >
            <p.Icon size={12} /> {p.label}
          </button>
        ))}
      </div>
      <label className="block text-xs text-gray-600">
        Evento
        <select
          value={trigger.evento}
          onChange={(e) => onChange({ ...trigger, evento: e.target.value })}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {eventosForPlatform(trigger.plataforma).map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-gray-600">
        Palavras-chave (opcional)
        <input
          type="text"
          value={(trigger.palavrasChave || []).join(', ')}
          onChange={(e) => onChange({
            ...trigger,
            palavrasChave: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
          })}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          placeholder="promoção, orçamento"
        />
      </label>
    </div>
  )
}
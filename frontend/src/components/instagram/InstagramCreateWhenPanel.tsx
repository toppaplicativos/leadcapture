import { useEffect, useState } from 'react'
import { CalendarClock, Clock, FileText, Send, Sparkles } from 'lucide-react'
import type { WhenMode } from '@/lib/instagram/createForm'
import {
  defaultScheduleLocalValue,
  formatScheduleLabel,
  toDatetimeLocalValue,
  validateSchedule,
} from '@/lib/instagram/createForm'
import { instagramApi } from '@/lib/instagram/pageApi'

type Props = {
  when: WhenMode
  scheduledAt: string
  onWhenChange: (when: WhenMode) => void
  onScheduledAtChange: (value: string) => void
  scheduleError?: string
}

const MODES: Array<{
  key: WhenMode
  label: string
  desc: string
  icon: typeof Send
}> = [
  { key: 'now', label: 'Agora', desc: 'Publica na hora', icon: Send },
  { key: 'schedule', label: 'Agendar', desc: 'Escolha data e hora', icon: CalendarClock },
  { key: 'draft', label: 'Rascunho', desc: 'Salva para depois', icon: FileText },
]

function quickSchedule(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000)
  d.setSeconds(0, 0)
  return toDatetimeLocalValue(d)
}

function tomorrowAt(hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  return toDatetimeLocalValue(d)
}

function slotFromSuggestion(bestHour: number, bestMinute = 0): string {
  const d = new Date()
  d.setHours(bestHour, bestMinute, 0, 0)
  if (d < new Date(Date.now() + 15 * 60_000)) {
    d.setDate(d.getDate() + 1)
  }
  return toDatetimeLocalValue(d)
}

export function InstagramCreateWhenPanel({
  when,
  scheduledAt,
  onWhenChange,
  onScheduledAtChange,
  scheduleError,
}: Props) {
  const [suggestLabel, setSuggestLabel] = useState<string | null>(null)
  const [suggestSlot, setSuggestSlot] = useState<string | null>(null)

  useEffect(() => {
    instagramApi('/scheduling/suggestions').then((res) => {
      if (!res.success || !res.suggestions) return
      const s = res.suggestions
      setSuggestLabel(s.best_label || null)
      setSuggestSlot(slotFromSuggestion(s.best_hour ?? 18, s.best_minute ?? 0))
    }).catch(() => {})
  }, [])

  const localError = when === 'schedule' ? validateSchedule(scheduledAt) : null
  const error = scheduleError || localError

  return (
    <div className="ig-create-when">
      <div className="ig-create-when__header">
        <h3 className="ig-create-when__title">
          <Clock size={14} />
          Quando publicar
        </h3>
        <p className="ig-create-when__hint">Escolha o momento ideal para seu conteudo</p>
      </div>

      <div className="ig-create-when__modes" role="radiogroup" aria-label="Quando publicar">
        {MODES.map((mode) => {
          const active = when === mode.key
          const Icon = mode.icon
          return (
            <button
              key={mode.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                onWhenChange(mode.key)
                if (mode.key === 'schedule' && !scheduledAt) {
                  onScheduledAtChange(suggestSlot || defaultScheduleLocalValue())
                }
              }}
              className={`ig-create-when__mode${active ? ' is-active' : ''}`}
            >
              <span className="ig-create-when__mode-icon" aria-hidden>
                <Icon size={16} />
              </span>
              <span className="ig-create-when__mode-label">{mode.label}</span>
              <span className="ig-create-when__mode-desc">{mode.desc}</span>
            </button>
          )
        })}
      </div>

      {when === 'schedule' && (
        <div className="ig-create-when__schedule">
          {suggestLabel && suggestSlot && (
            <button
              type="button"
              className="ig-create-when__suggest"
              onClick={() => onScheduledAtChange(suggestSlot)}
            >
              <Sparkles size={12} />
              Melhor horario sugerido: <strong>{suggestLabel}</strong>
            </button>
          )}

          <div className="ig-create-when__schedule-grid">
            <label className="ig-create-when__field">
              <span>Data</span>
              <input
                type="date"
                value={scheduledAt.slice(0, 10)}
                min={toDatetimeLocalValue(new Date()).slice(0, 10)}
                onChange={(e) => {
                  const time = scheduledAt.slice(11, 16) || '09:00'
                  onScheduledAtChange(`${e.target.value}T${time}`)
                }}
              />
            </label>
            <label className="ig-create-when__field">
              <span>Horario</span>
              <input
                type="time"
                step={900}
                value={scheduledAt.slice(11, 16)}
                onChange={(e) => {
                  const date = scheduledAt.slice(0, 10) || toDatetimeLocalValue(new Date()).slice(0, 10)
                  onScheduledAtChange(`${date}T${e.target.value}`)
                }}
              />
            </label>
          </div>

          <div className="ig-create-when__quick">
            {[
              { label: 'Em 1h', value: quickSchedule(60) },
              { label: 'Amanha 9h', value: tomorrowAt(9) },
              { label: 'Amanha 18h', value: tomorrowAt(18) },
              ...(suggestSlot && suggestLabel
                ? [{ label: `Sugerido ${suggestLabel}`, value: suggestSlot }]
                : []),
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="ig-create-when__chip"
                onClick={() => onScheduledAtChange(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <p className={`ig-create-when__preview${error ? ' has-error' : ''}`}>
            <Sparkles size={12} />
            {error || `Publicacao prevista: ${formatScheduleLabel(scheduledAt)}`}
          </p>
        </div>
      )}

      {when === 'draft' && (
        <div className="ig-create-when__draft">
          <FileText size={16} />
          <div>
            <p className="ig-create-when__draft-title">Salvar como rascunho</p>
            <p className="ig-create-when__draft-desc">
              Midia e legenda ficam na fila local. Edite e publique quando quiser na aba Posts.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
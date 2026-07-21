/**
 * Faixa de estado do contato: fase · último resultado · próximo passo / cron.
 * Multi-canal: mostra badge do canal da última tentativa.
 */
import { CalendarClock, ChevronRight, Clock3, Phone } from 'lucide-react'
import {
  channelLabel,
  formatCountdown,
  formatDueAt,
  type ContactOpsState,
} from '@/lib/affiliate-contact-ops'

type Props = {
  ops: ContactOpsState
  compact?: boolean
  onExecuteTask?: () => void
  onUpdateResult?: () => void
}

export function ContactOpsStrip({ ops, compact, onExecuteTask, onUpdateResult }: Props) {
  const next = ops.next_task
  const due = next?.is_due

  return (
    <div
      className={[
        'rounded-2xl border px-3 py-2.5',
        ops.phase === 'closed'
          ? 'border-neutral-200 bg-neutral-50'
          : due
            ? 'border-amber-200 bg-amber-50'
            : 'border-neutral-200 bg-white',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="inline-flex items-center rounded-full bg-neutral-900 px-2 py-0.5 font-bold text-white">
          {ops.phase_label}
        </span>
        {ops.last_channel && ops.last_channel !== 'system' && ops.last_channel !== 'note' && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 font-semibold text-neutral-700">
            {ops.last_channel === 'phone' ? <Phone size={10} /> : null}
            {channelLabel(ops.last_channel)}
          </span>
        )}
        {ops.last_action_label && (
          <span className="text-neutral-700">
            Último: <strong className="font-semibold">{ops.last_action_label}</strong>
            {ops.last_action_at
              ? ` · ${formatDueAt(ops.last_action_at)}`
              : ''}
          </span>
        )}
      </div>

      <p className={`mt-1.5 leading-snug text-neutral-800 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        <Clock3 size={12} className="mr-1 inline opacity-70" />
        <strong className="font-semibold">Próximo: </strong>
        {ops.next_step_label}
      </p>

      {next && !due && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-neutral-500">
          <CalendarClock size={12} />
          Libera {formatDueAt(next.due_at)} · {formatCountdown(next.due_at)}
        </p>
      )}

      {!compact && (ops.can_execute_task || ops.can_update_result) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ops.can_execute_task && onExecuteTask && (
            <button
              type="button"
              onClick={onExecuteTask}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-neutral-950 px-3 text-[11px] font-bold text-white"
            >
              Executar tarefa
              <ChevronRight size={14} />
            </button>
          )}
          {ops.can_update_result && onUpdateResult && (
            <button
              type="button"
              onClick={onUpdateResult}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-700"
            >
              Atualizar resultado
            </button>
          )}
        </div>
      )}
    </div>
  )
}

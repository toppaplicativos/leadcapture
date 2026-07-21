/**
 * Resumo de tentativas por canal (WhatsApp / Telefone) em um contato.
 */
import { MessageCircle, Phone } from 'lucide-react'
import {
  channelLabel,
  formatDueAt,
  type ChannelAttemptSummary,
  type ContactChannel,
} from '@/lib/affiliate-contact-ops'
import { WhatsAppIcon } from '@/components/icons'

type Props = {
  summary: ChannelAttemptSummary[]
  compact?: boolean
  activeChannel?: ContactChannel | null
  onSelectChannel?: (channel: 'whatsapp' | 'phone') => void
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'phone') return <Phone size={14} className="text-sky-700" />
  if (channel === 'whatsapp') return <WhatsAppIcon size={14} />
  return <MessageCircle size={14} className="text-neutral-500" />
}

export function ContactChannelAttempts({
  summary,
  compact,
  activeChannel,
  onSelectChannel,
}: Props) {
  const rows =
    summary.length > 0
      ? summary
      : ([
          {
            channel: 'whatsapp' as const,
            label: 'WhatsApp',
            attempts: 0,
            last_action: null,
            last_action_label: null,
            last_at: null,
          },
          {
            channel: 'phone' as const,
            label: 'Telefone',
            attempts: 0,
            last_action: null,
            last_action_label: null,
            last_at: null,
          },
        ] satisfies ChannelAttemptSummary[])

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {!compact && (
        <p className="text-[11px] font-semibold text-neutral-500">Tentativas por canal</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {rows
          .filter((r) => r.channel === 'whatsapp' || r.channel === 'phone')
          .map((row) => {
            const active = activeChannel === row.channel
            const clickable = Boolean(onSelectChannel)
            const body = (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/90">
                    <ChannelIcon channel={row.channel} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[12px] font-bold text-neutral-950 leading-tight">
                      {row.label || channelLabel(row.channel)}
                    </strong>
                    <span className="block text-[10px] text-neutral-500 tabular-nums">
                      {row.attempts > 0
                        ? `${row.attempts} tentativa${row.attempts > 1 ? 's' : ''}`
                        : 'Sem tentativas'}
                    </span>
                  </span>
                </div>
                {row.last_action_label && (
                  <p className="mt-1.5 text-[10px] leading-snug text-neutral-600 line-clamp-2">
                    Última: <strong className="font-semibold text-neutral-800">{row.last_action_label}</strong>
                    {row.last_at ? ` · ${formatDueAt(row.last_at)}` : ''}
                  </p>
                )}
              </>
            )

            const cls = [
              'rounded-xl border px-2.5 py-2 text-left transition',
              active
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-neutral-50',
              clickable ? 'active:scale-[0.99]' : '',
            ].join(' ')

            if (clickable && (row.channel === 'whatsapp' || row.channel === 'phone')) {
              return (
                <button
                  key={row.channel}
                  type="button"
                  onClick={() => onSelectChannel?.(row.channel as 'whatsapp' | 'phone')}
                  className={[
                    cls,
                    active ? '' : 'hover:border-neutral-300',
                  ].join(' ')}
                >
                  <div className={active ? '[&_strong]:text-white [&_span]:text-white/80 [&_p]:text-white/85' : ''}>
                    {body}
                  </div>
                </button>
              )
            }

            return (
              <div key={row.channel} className={cls}>
                {body}
              </div>
            )
          })}
      </div>
    </div>
  )
}

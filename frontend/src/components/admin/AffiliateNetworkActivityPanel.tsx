/**
 * Rede de afiliados — atividade de hoje + chart 7 dias.
 * Product register: denso, neutro, tabular-nums, sem hero-metric clichê.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight, BadgeCheck, Clock, MessageSquareQuote, MousePointerClick, Send, Target, Users, UserPlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const num = (v: number | string | undefined) =>
  Number(v || 0).toLocaleString('pt-BR')

export type NetworkActivity = {
  today?: {
    new_contacts?: number
    contacts_sent?: number
    clicks?: number
    clickers?: number
    attempts?: number
    messages?: number
    messages_sent?: number
    replies?: number
    followups?: number
    active_affiliates?: number
    conversions?: number
    response_rate?: number | null
  }
  last_7_days?: {
    new_contacts?: number
    contacts_sent?: number
    clicks?: number
    attempts?: number
    messages?: number
    replies?: number
    followups?: number
    active_affiliates?: number
    conversions?: number
    response_rate?: number | null
  }
  series_7d?: Array<{
    day: string
    new_contacts: number
    attempts: number
    messages: number
    replies: number
    followups: number
    clicks: number
    active_affiliates: number
  }>
  legend?: Record<string, string>
}

type SeriesKey = 'new_contacts' | 'attempts' | 'messages' | 'replies' | 'followups' | 'clicks' | 'active_affiliates'

const SERIES_META: Array<{
  key: SeriesKey
  label: string
  short: string
  color: string
  Icon: LucideIcon
}> = [
  { key: 'clicks', label: 'Cliques', short: 'Cliques', color: '#4f46e5', Icon: MousePointerClick },
  { key: 'new_contacts', label: 'Novos contatos', short: 'Contatos', color: '#171717', Icon: UserPlus },
  { key: 'attempts', label: 'Tentativas', short: 'Tentativas', color: '#525252', Icon: Target },
  { key: 'messages', label: 'Mensagens', short: 'Msgs', color: '#2563eb', Icon: Send },
  { key: 'replies', label: 'Retornos', short: 'Retornos', color: '#059669', Icon: MessageSquareQuote },
  { key: 'followups', label: 'Follow-ups', short: 'Follow', color: '#d97706', Icon: Clock },
  { key: 'active_affiliates', label: 'Afiliados atuantes', short: 'Atuantes', color: '#0f766e', Icon: BadgeCheck },
]

function dayLabel(iso: string) {
  try {
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace('.', '')
  } catch {
    return iso.slice(5)
  }
}

type Props = {
  activity: NetworkActivity | null | undefined
  /** compact = dashboard home; full = aba Análises */
  variant?: 'compact' | 'full'
  onOpenDetails?: () => void
  footerExtra?: ReactNode
}

export function AffiliateNetworkActivityPanel({
  activity,
  variant = 'compact',
  onOpenDetails,
  footerExtra,
}: Props) {
  const today = activity?.today || {}
  const last7 = activity?.last_7_days || {}
  const series = activity?.series_7d || []
  const legend = activity?.legend || {}

  const metrics = useMemo(() => {
    const t = today
    return [
      {
        key: 'clicks' as SeriesKey,
        label: 'Cliques',
        value: t.clicks ?? 0,
        hint: t.clickers != null ? `${num(t.clickers)} afiliado(s) com link` : 'Acessos aos links',
        Icon: MousePointerClick,
        color: '#4f46e5',
      },
      {
        key: 'new_contacts' as SeriesKey,
        label: 'Novos contatos',
        value: t.new_contacts ?? t.contacts_sent ?? 0,
        hint: 'Entregues · sem exclusões',
        Icon: UserPlus,
        color: '#171717',
      },
      {
        key: 'attempts' as SeriesKey,
        label: 'Tentativas',
        value: t.attempts ?? 0,
        hint: 'Aceites + envios + ligações',
        Icon: Target,
        color: '#525252',
      },
      {
        key: 'messages' as SeriesKey,
        label: 'Mensagens',
        value: t.messages ?? t.messages_sent ?? 0,
        hint: 'Sistema + tarefas',
        Icon: Send,
        color: '#2563eb',
      },
      {
        key: 'replies' as SeriesKey,
        label: 'Retornos',
        value: t.replies ?? 0,
        hint: 'Afirmações de resposta',
        Icon: MessageSquareQuote,
        color: '#059669',
      },
      {
        key: 'followups' as SeriesKey,
        label: 'Follow-ups',
        value: t.followups ?? 0,
        hint: 'Ações + tarefas feitas',
        Icon: Clock,
        color: '#d97706',
      },
      {
        key: 'active_affiliates' as SeriesKey,
        label: 'Afiliados atuantes',
        value: t.active_affiliates ?? 0,
        hint: 'Com ação hoje',
        Icon: BadgeCheck,
        color: '#0f766e',
      },
    ]
  }, [today])

  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(() =>
    Object.fromEntries(SERIES_META.map((s) => [s.key, true])) as Record<SeriesKey, boolean>,
  )

  const toggle = (key: SeriesKey) => {
    setVisible((v) => {
      const next = { ...v, [key]: !v[key] }
      // Keep at least one series on
      if (!Object.values(next).some(Boolean)) return v
      return next
    })
  }

  const chart = useMemo(() => buildMultiLineChart(series, visible), [series, visible])

  if (!activity) return null

  return (
    <section className="rounded-2xl border border-border-light bg-white overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-border-light">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-neutral-500">Rede de afiliados</p>
          <h2 className="mt-0.5 text-[16px] font-semibold tracking-tight text-neutral-900">
            Atividade de hoje
          </h2>
          <p className="mt-1 text-[12px] text-neutral-500 leading-relaxed max-w-xl">
            Contatos entregues, tentativas, mensagens, retornos e follow-ups da equipe — em tempo real.
          </p>
        </div>
        {onOpenDetails && (
          <button
            type="button"
            onClick={onOpenDetails}
            className="h-10 px-3 rounded-xl bg-neutral-100 text-[12px] font-semibold text-neutral-700 inline-flex items-center gap-1.5 shrink-0 hover:bg-neutral-200/80 transition"
          >
            Ver detalhes <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Metric grid — 7 tiles (cliques + operação), product density */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 border-b border-border-light">
        {metrics.map((m, i) => (
          <button
            key={m.key}
            type="button"
            onClick={() => toggle(m.key)}
            title={legend[m.key] || m.hint}
            className={`text-left p-3.5 sm:p-4 transition hover:bg-neutral-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900/10 border-border-light ${
              i % 2 === 1 ? 'border-l' : ''
            } ${i >= 2 ? 'border-t sm:border-t-0' : ''} ${
              i % 3 !== 0 ? 'sm:border-l' : 'sm:border-l-0'
            } ${i > 0 ? 'xl:border-l' : 'xl:border-l-0'} ${
              i >= 3 ? 'sm:border-t xl:border-t-0' : ''
            } ${
              !visible[m.key] ? 'opacity-45' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-neutral-500 leading-tight">{m.label}</span>
              <span
                className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
                style={{ background: `${m.color}12`, color: m.color }}
              >
                <m.Icon size={14} strokeWidth={2} />
              </span>
            </div>
            <p className="text-[22px] sm:text-[24px] font-bold tabular-nums tracking-tight text-neutral-900 leading-none">
              {num(m.value)}
            </p>
            <p className="mt-1.5 text-[10px] text-neutral-400 leading-snug">{m.hint}</p>
            <span
              className="mt-2 inline-block h-0.5 w-6 rounded-full"
              style={{ background: visible[m.key] ? m.color : '#e5e5e5' }}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-neutral-900">Evolução · 7 dias</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Toque nas métricas para mostrar ou ocultar no gráfico
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SERIES_META.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                className={`h-7 px-2 rounded-full text-[10px] font-semibold border transition inline-flex items-center gap-1.5 ${
                  visible[s.key]
                    ? 'bg-white text-neutral-800 border-neutral-200'
                    : 'bg-neutral-50 text-neutral-400 border-neutral-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: visible[s.key] ? s.color : '#d4d4d4' }} />
                {s.short}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 px-2 pt-3 pb-1 sm:px-3">
          {chart.hasData ? (
            <svg
              viewBox={`0 0 ${chart.w} ${chart.h}`}
              className="w-full h-[200px] sm:h-[220px]"
              role="img"
              aria-label="Gráfico de atividade da rede de afiliados nos últimos 7 dias"
            >
              {/* Grid */}
              {chart.gridY.map((g) => (
                <g key={g.y}>
                  <line
                    x1={chart.padL}
                    x2={chart.w - chart.padR}
                    y1={g.y}
                    y2={g.y}
                    stroke="#e5e5e5"
                    strokeWidth={1}
                    strokeDasharray={g.i === 0 ? undefined : '3 4'}
                  />
                  <text
                    x={chart.padL - 8}
                    y={g.y + 3}
                    textAnchor="end"
                    fill="#a3a3a3"
                    fontSize={10}
                    fontFamily="Inter, system-ui, sans-serif"
                  >
                    {g.label}
                  </text>
                </g>
              ))}

              {/* Soft area under primary series (new_contacts) if visible */}
              {visible.new_contacts && chart.areas.new_contacts && (
                <path d={chart.areas.new_contacts} fill="rgba(23,23,23,0.06)" />
              )}

              {/* Lines */}
              {SERIES_META.map((s) =>
                visible[s.key] && chart.paths[s.key] ? (
                  <path
                    key={s.key}
                    d={chart.paths[s.key]}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.key === 'new_contacts' ? 2.25 : 1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={s.key === 'active_affiliates' ? 0.85 : 1}
                  />
                ) : null,
              )}

              {/* Points on last day for visible series */}
              {SERIES_META.map((s) => {
                const pt = chart.lastPoints[s.key]
                if (!visible[s.key] || !pt) return null
                return (
                  <circle
                    key={`pt-${s.key}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={3.5}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                )
              })}

              {/* X labels */}
              {chart.xLabels.map((x) => (
                <text
                  key={x.day}
                  x={x.x}
                  y={chart.h - 8}
                  textAnchor="middle"
                  fill="#a3a3a3"
                  fontSize={10}
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {x.label}
                </text>
              ))}
            </svg>
          ) : (
            <div className="h-[180px] grid place-items-center text-center px-4">
              <div>
                <Users size={22} className="mx-auto text-neutral-300 mb-2" />
                <p className="text-sm font-semibold text-neutral-700">Sem movimento nos últimos 7 dias</p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Quando a rede enviar mensagens e registrar retornos, o gráfico preenche sozinho.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 7d summary strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-600">
          <span>
            Taxa de retorno hoje{' '}
            <strong className="text-neutral-900 tabular-nums">
              {today.response_rate != null ? `${today.response_rate}%` : '—'}
            </strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            7 dias · cliques{' '}
            <strong className="text-neutral-900 tabular-nums">{num(last7.clicks)}</strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            contatos{' '}
            <strong className="text-neutral-900 tabular-nums">
              {num(last7.new_contacts ?? last7.contacts_sent)}
            </strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            mensagens{' '}
            <strong className="text-neutral-900 tabular-nums">{num(last7.messages)}</strong>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            conversões hoje{' '}
            <strong className="text-neutral-900 tabular-nums">{num(today.conversions)}</strong>
          </span>
          {footerExtra}
        </div>
      </div>

      {variant === 'full' && (
        <div className="px-4 sm:px-5 pb-4">
          <p className="text-[10px] text-neutral-400 leading-relaxed">
            Cliques contam acessos aos links de afiliado (catálogo, cupom, produto) via tracking.
            Novos contatos: entrega real (mensagem ou ligação), sem exclusões do pool.
            Tentativas incluem aceite/claim e outcomes. Mensagens somam envios, follow-ups e tarefas com texto.
          </p>
        </div>
      )}
    </section>
  )
}

function buildMultiLineChart(
  series: NonNullable<NetworkActivity['series_7d']>,
  visible: Record<SeriesKey, boolean>,
) {
  const w = 640
  const h = 220
  const padL = 36
  const padR = 12
  const padT = 12
  const padB = 28
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const n = Math.max(series.length, 1)

  const keys = SERIES_META.map((s) => s.key)
  let maxY = 1
  for (const row of series) {
    for (const k of keys) {
      if (!visible[k]) continue
      maxY = Math.max(maxY, Number(row[k] || 0))
    }
  }
  // Nice ceiling
  const step = maxY <= 5 ? 1 : maxY <= 20 ? 5 : maxY <= 50 ? 10 : maxY <= 100 ? 20 : Math.ceil(maxY / 4 / 10) * 10
  const niceMax = Math.max(step, Math.ceil(maxY / step) * step)

  const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => padT + innerH - (v / niceMax) * innerH

  const paths: Partial<Record<SeriesKey, string>> = {}
  const areas: Partial<Record<SeriesKey, string>> = {}
  const lastPoints: Partial<Record<SeriesKey, { x: number; y: number }>> = {}

  for (const k of keys) {
    if (!visible[k] || !series.length) continue
    const pts = series.map((row, i) => ({
      x: xAt(i),
      y: yAt(Number(row[k] || 0)),
    }))
    paths[k] = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    lastPoints[k] = pts[pts.length - 1]
    if (k === 'new_contacts' && pts.length) {
      const base = padT + innerH
      areas[k] =
        `M ${pts[0].x.toFixed(1)} ${base} ` +
        pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
        ` L ${pts[pts.length - 1].x.toFixed(1)} ${base} Z`
    }
  }

  const gridLines = 4
  const gridY = Array.from({ length: gridLines + 1 }, (_, i) => {
    const val = Math.round((niceMax / gridLines) * (gridLines - i))
    return { i, y: yAt(val), label: String(val) }
  })

  const xLabels = series.map((row, i) => ({
    day: row.day,
    x: xAt(i),
    label: dayLabel(row.day),
  }))

  const hasData = series.some((r) =>
    keys.some((k) => visible[k] && Number(r[k] || 0) > 0),
  )

  return { w, h, padL, padR, paths, areas, lastPoints, gridY, xLabels, hasData }
}

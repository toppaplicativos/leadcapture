import { useState } from 'react'
import {
  Users, Megaphone, Package, ShoppingCart, Zap, AlertTriangle, Boxes,
  ArrowRight, CheckCircle2, Circle, Brain, Sparkles, Phone, MapPin, User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import type { AgentCallbacks, ComponentSpec } from '@/lib/agent/types'
import { useProspectBridgeOptional } from '@/lib/agent/ProspectBridgeContext'
import { useLeadsBridgeOptional } from '@/lib/agent/LeadsBridgeContext'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'

const KPI_ICONS: Record<string, LucideIcon> = {
  users: Users,
  megaphone: Megaphone,
  package: Package,
  cart: ShoppingCart,
  zap: Zap,
  alert: AlertTriangle,
  boxes: Boxes,
}

function formatNum(v: unknown) {
  return Number(v || 0).toLocaleString('pt-BR')
}

function KpiRow({ props, compact }: { props?: Record<string, unknown>; compact?: boolean }) {
  const items = (props?.items as Array<{ label: string; value: number; icon?: string }>) || []
  const subtitle = props?.subtitle as string | undefined
  if (!items.length) return null

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {items.map((item) => {
          const Icon = KPI_ICONS[item.icon || ''] || Package
          return (
            <div
              key={item.label}
              className="rounded-xl border border-border-light bg-white px-3 py-2.5"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  {item.label}
                </span>
                <Icon size={13} className="text-gray-400" strokeWidth={1.75} />
              </div>
              <p className="text-lg font-bold tabular-nums text-gray-900 leading-none">
                {formatNum(item.value)}
              </p>
            </div>
          )
        })}
      </div>
      {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
    </div>
  )
}

function ReadinessCard({ props }: { props?: Record<string, unknown> }) {
  const score = Number(props?.score || 0)
  const agentName = String(props?.agentName || 'Agente')
  const filled = Number(props?.filledFields || 0)
  const total = Number(props?.totalFields || 7)
  const pct = Math.min(100, Math.max(0, score))

  return (
    <Card className="overflow-hidden">
      <CardBody className="!py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Prontidão</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{agentName}</p>
            <p className="text-[11px] text-gray-500 mt-1">
              {filled}/{total} campos do perfil preenchidos
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-gray-900">{pct}%</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardBody>
    </Card>
  )
}

function Checklist({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const items = (props?.items as Array<{
    id: string
    title: string
    description?: string
    done: boolean
    cta_label?: string
    action_tab?: string
  }>) || []

  if (!items.length) return null

  return (
    <div className="rounded-xl border border-border-light bg-white divide-y divide-border-light">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
          {item.done ? (
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <Circle size={15} className="text-gray-300 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-[12px] font-medium ${item.done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
              {item.title}
            </p>
            {!item.done && item.cta_label && (
              <button
                type="button"
                onClick={() => callbacks.onNavigate('/agente')}
                className="text-[11px] text-brand font-medium mt-0.5 hover:underline"
              >
                {item.cta_label}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function NavSuggestions({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const items = (props?.items as Array<{ path: string; label: string; navKey?: string }>) || []
  if (!items.length) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => {
            const key = item.navKey || item.path
            callbacks.onTriggerNav(key)
          }}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {item.label}
          <ArrowRight size={11} />
        </button>
      ))}
    </div>
  )
}

function SkillList({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const skills = (props?.skills as Array<{
    id: string
    name: string
    type: string
    active: boolean
    confidence: number
  }>) || []
  const total = Number(props?.total || skills.length)

  if (!skills.length) {
    return (
      <div className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center">
        <Brain size={18} className="mx-auto text-gray-300 mb-1.5" />
        <p className="text-[12px] text-gray-500">Nenhuma habilidade ainda.</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => callbacks.onOpenModal('skill-trainer')}
        >
          Ensinar primeira habilidade
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {total} habilidade{total !== 1 ? 's' : ''}
      </p>
      {skills.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2"
        >
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-gray-900 truncate">{s.name}</p>
            <p className="text-[10px] text-gray-400">{s.type} · {s.confidence}% confiança</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function DataTable({ spec, callbacks }: { spec: ComponentSpec; callbacks: AgentCallbacks }) {
  const props = spec.props
  const title = String(props?.title || '')
  const columns = (props?.columns as Array<{ key: string; label: string }>) || []
  const rows = (props?.rows as Array<Record<string, unknown>>) || []
  const rowType = String(props?.rowType || '')
  const emptyLabel = String(props?.emptyLabel || 'Nenhum registro.')

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center">
        <p className="text-[12px] text-gray-500">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-light bg-white overflow-hidden">
      {title && (
        <div className="px-3 py-2 border-b border-border-light bg-gray-50/80">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-light">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={String(row.id || i)}
                className={`border-b border-border-light last:border-0 ${
                  rowType === 'lead' ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''
                }`}
                onClick={() => {
                  if (rowType === 'lead' && row.id) {
                    callbacks.onComponentEvent?.({
                      componentId: spec.id,
                      action: 'select_row',
                      payload: { leadId: row.id },
                    }, { leadId: String(row.id), nextSkill: 'crm.lead.detail' })
                  } else if (rowType === 'conversation' && row.id) {
                    callbacks.onComponentEvent?.({
                      componentId: spec.id,
                      action: 'select_row',
                      payload: { conversationId: row.id, name: row.name },
                    }, { conversationId: String(row.id), nextSkill: 'messages.inbox' })
                  } else if (rowType === 'product') {
                    callbacks.onNavigate('/produtos')
                  }
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-[12px] text-gray-800 whitespace-nowrap max-w-[140px] truncate">
                    {String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InlineForm({ spec, callbacks }: { spec: ComponentSpec; callbacks: AgentCallbacks }) {
  const props = spec.props
  const title = String(props?.title || '')
  const fields = (props?.fields as Array<{
    name: string
    label: string
    type?: string
    placeholder?: string
  }>) || []
  const submitLabel = String(props?.submitLabel || 'Enviar')
  const [values, setValues] = useState<Record<string, string>>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    callbacks.onComponentEvent?.({
      componentId: spec.id,
      action: 'submit_form',
      payload: values,
    }, { nextSkill: String(props?.nextSkill || '') || undefined })
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border-light bg-white p-3 space-y-2.5">
      {title && <p className="text-[12px] font-semibold text-gray-900">{title}</p>}
      {fields.map((field) => (
        <label key={field.name} className="block space-y-1">
          <span className="text-[11px] font-medium text-gray-500">{field.label}</span>
          {field.type === 'textarea' ? (
            <textarea
              value={values[field.name] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border-light text-[13px] outline-none focus:border-gray-300 resize-y min-h-[4.5rem]"
            />
          ) : (
            <input
              type={field.type || 'text'}
              value={values[field.name] || ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full h-9 px-3 rounded-lg border border-border-light text-[13px] outline-none focus:border-gray-300"
            />
          )}
        </label>
      ))}
      <Button type="submit" size="sm" fullWidth disabled={!Object.values(values).some(Boolean)}>
        {submitLabel}
      </Button>
    </form>
  )
}

function LeadCard({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const leadsBridge = useLeadsBridgeOptional()
  const lead = props?.lead as {
    id?: string
    name?: string
    phone?: string
    email?: string
    city?: string
    state?: string
    status?: string
    source?: string
    category?: string
    tags?: string[]
  } | null

  if (!lead) return null

  return (
    <Card>
      <CardBody className="!py-3 space-y-2">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gray-100 grid place-items-center shrink-0">
            <User size={16} className="text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-gray-900 truncate">{lead.name}</p>
            {lead.status && (
              <span className="inline-block mt-1 px-2 h-5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-600">
                {lead.status}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-1 text-[12px] text-gray-600">
          {lead.phone && (
            <p className="flex items-center gap-1.5">
              <Phone size={12} className="text-gray-400" /> {lead.phone}
            </p>
          )}
          {(lead.city || lead.state) && (
            <p className="flex items-center gap-1.5">
              <MapPin size={12} className="text-gray-400" />
              {[lead.city, lead.state].filter(Boolean).join(', ')}
            </p>
          )}
          {lead.source && <p className="text-[11px] text-gray-400">Origem: {lead.source}</p>}
        </div>
        {lead.id && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (leadsBridge?.isReady) {
                leadsBridge.setModuleExpanded(true)
                leadsBridge.dispatch({
                  type: 'select_lead',
                  id: String(lead.id),
                  name: lead.name,
                })
                leadsBridge.dispatch({ type: 'open_full' })
              } else {
                callbacks.onNavigate('/leads')
              }
            }}
          >
            Abrir no CRM
          </Button>
        )}
      </CardBody>
    </Card>
  )
}

function ProspectStats({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const bridge = useProspectBridgeOptional()
  const live = !!props?.live
  const snap = live && bridge ? bridge.snapshot : null

  const query = String(snap?.query || props?.query || '')
  const location = String(snap?.location || props?.location || '')
  const found = snap?.found ?? Number(props?.found ?? 0)
  const newCount = snap?.newCount ?? Number(props?.newCount ?? 0)
  const capturedLive = snap?.capturedLive ?? Number(props?.capturedLive ?? 0)
  const today = snap?.todayCount ?? Number(props?.today ?? 0)
  const total = snap?.totalCount ?? Number(props?.total ?? 0)
  const searching = snap?.radarLoading || snap?.prospecting

  return (
    <div className="rounded-xl border border-border-light bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-border-light bg-gray-50/80 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Prospectando</p>
          <p className="text-[12px] font-semibold text-gray-900 truncate">
            {query && location ? `${query} · ${location}` : 'Mapa paleteiro'}
          </p>
        </div>
        {searching && (
          <span className="text-[10px] font-semibold text-amber-600 shrink-0">Radar…</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-px bg-border-light">
        {[
          { label: 'Encontrados', value: found, accent: 'text-gray-900' },
          { label: 'Novos', value: newCount, accent: 'text-rose-600' },
          { label: 'Captados', value: capturedLive, accent: 'text-emerald-600' },
        ].map((item) => (
          <div key={item.label} className="bg-white px-2 py-2 text-center">
            <p className={`text-base font-bold tabular-nums leading-none ${item.accent}`}>{item.value}</p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-px bg-border-light border-t border-border-light">
        <div className="bg-white px-2 py-1.5 text-center">
          <p className="text-sm font-bold tabular-nums text-gray-900">{today}</p>
          <p className="text-[9px] text-gray-400 uppercase">Hoje</p>
        </div>
        <div className="bg-white px-2 py-1.5 text-center">
          <p className="text-sm font-bold tabular-nums text-gray-900">{total}</p>
          <p className="text-[9px] text-gray-400 uppercase">Total</p>
        </div>
      </div>
      <div className="p-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => callbacks.onNavigate('/busca')}
          className="flex-1 h-7 rounded-lg text-[10px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          Ver mapa
        </button>
        {bridge && (
          <button
            type="button"
            onClick={() => bridge.dispatch({ type: 'capture_batch' })}
            className="flex-1 h-7 rounded-lg text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            disabled={!snap?.newCount}
          >
            Captar ({snap?.newCount ?? 0})
          </button>
        )}
      </div>
    </div>
  )
}

function OptionPicker({ spec, callbacks }: { spec: ComponentSpec; callbacks: AgentCallbacks }) {
  const props = spec.props
  const title = String(props?.title || '')
  const options = (props?.options as Array<{
    id: string
    label: string
    description?: string
    icon?: string
  }>) || []
  const nextSkill = String(props?.nextSkill || '')

  if (!options.length) return null

  return (
    <div className="space-y-2">
      {title && (
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      )}
      <div className="grid gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => callbacks.onComponentEvent?.({
              componentId: spec.id,
              action: 'select_option',
              payload: { optionId: opt.id, label: opt.label },
            }, { nextSkill: nextSkill || undefined, channel: opt.id })}
            className="flex flex-col items-start w-full rounded-xl border border-border-light bg-white px-3 py-2.5 text-left hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="text-[13px] font-semibold text-gray-900">{opt.label}</span>
            {opt.description && (
              <span className="text-[11px] text-gray-500 mt-0.5">{opt.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function Confirmation({ props, callbacks }: { props?: Record<string, unknown>; callbacks: AgentCallbacks }) {
  const productsBridge = useProductsBridgeOptional()
  const title = String(props?.title || '')
  const description = String(props?.description || '')
  const confirmLabel = String(props?.confirmLabel || 'Confirmar')
  const modal = props?.modal as 'ai-campaign' | 'skill-trainer' | undefined
  const action = String(props?.action || '')
  const draft = props?.draft as {
    name?: string
    description?: string
    category?: string
    price?: number
    features?: string[]
  } | undefined

  function handleProductCreate() {
    if (!draft || !productsBridge) return
    productsBridge.setModuleOpen(true)
    productsBridge.setModuleExpanded(true)
    productsBridge.dispatch({
      type: 'create_with_draft',
      draft: {
        name: String(draft.name || 'Novo produto'),
        description: String(draft.description || ''),
        category: String(draft.category || ''),
        price: Number(draft.price || 0),
        features: Array.isArray(draft.features) ? draft.features.map(String) : [],
      },
    })
    productsBridge.dispatch({ type: 'open_full' })
  }

  return (
    <Card>
      <CardBody className="!py-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-brand shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-gray-900">{title}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
        {action === 'create_product' && draft && (
          <Button size="sm" onClick={handleProductCreate}>
            {confirmLabel}
          </Button>
        )}
        {modal && (
          <Button size="sm" onClick={() => callbacks.onOpenModal(modal)}>
            {confirmLabel}
          </Button>
        )}
      </CardBody>
    </Card>
  )
}

function renderComponent(spec: ComponentSpec, callbacks: AgentCallbacks, compact?: boolean) {
  switch (spec.type) {
    case 'kpi_row':
      return <KpiRow key={spec.id} props={spec.props} compact={compact} />
    case 'readiness_card':
      return <ReadinessCard key={spec.id} props={spec.props} />
    case 'checklist':
      return <Checklist key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'nav_suggestions':
      return <NavSuggestions key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'skill_list':
      return <SkillList key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'confirmation':
      return <Confirmation key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'option_picker':
      return <OptionPicker key={spec.id} spec={spec} callbacks={callbacks} />
    case 'prospect_stats':
      return <ProspectStats key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'table':
      return <DataTable key={spec.id} spec={spec} callbacks={callbacks} />
    case 'form':
      return <InlineForm key={spec.id} spec={spec} callbacks={callbacks} />
    case 'lead_card':
      return <LeadCard key={spec.id} props={spec.props} callbacks={callbacks} />
    case 'text':
      return (
        <p key={spec.id} className="text-[12px] text-gray-600 leading-relaxed">
          {String(spec.props?.content || '')}
        </p>
      )
    case 'button':
      return (
        <Button
          key={spec.id}
          size="sm"
          variant={(spec.props?.variant as 'primary' | 'secondary') || 'secondary'}
          onClick={() => {
            const path = spec.props?.path as string | undefined
            if (path) callbacks.onNavigate(path)
          }}
        >
          {String(spec.props?.label || 'Ação')}
        </Button>
      )
    default:
      return null
  }
}

export function AgentUIRenderer({
  components,
  callbacks,
  compact,
}: {
  components?: ComponentSpec[]
  callbacks: AgentCallbacks
  compact?: boolean
}) {
  if (!components?.length) return null

  return (
    <div className={`space-y-2.5 ${compact ? 'mt-2' : 'mt-3'}`}>
      {components.map((spec) => renderComponent(spec, callbacks, compact))}
    </div>
  )
}
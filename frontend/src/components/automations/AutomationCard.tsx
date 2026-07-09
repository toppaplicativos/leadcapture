import {
  Calendar, MessageCircle, Play, Pause, Copy, Trash2, Zap,
  Pencil, History, Loader2, AlertTriangle,
} from 'lucide-react'
import type { Automacao } from '@/lib/automations/schema'
import { getAcaoLabel, getEventoLabel } from '@/lib/automations/schema'
import { describeTriggerSchedule } from '@/lib/automations/cron-builder'

const STATUS_STYLE: Record<string, { dot: string; label: string; cls: string }> = {
  live: { dot: 'bg-emerald-500', label: 'ATIVA', cls: 'text-emerald-700' },
  pausado: { dot: 'bg-amber-500', label: 'PAUSADA', cls: 'text-amber-700' },
  rascunho: { dot: 'bg-gray-400', label: 'RASCUNHO', cls: 'text-gray-500' },
  erro: { dot: 'bg-red-500', label: 'ERRO', cls: 'text-red-600' },
}

type Props = {
  automacao: Automacao
  onOpen?: (a: Automacao) => void
  onToggle: (id: string, ativa: boolean) => void
  onEdit: (a: Automacao) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onExecute: (id: string) => void
  onHistory?: (a: Automacao) => void
  busy?: boolean
}

export function AutomationCard({
  automacao,
  onOpen,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onExecute,
  onHistory,
  busy,
}: Props) {
  const isAgendamento = automacao.trigger.tipo === 'agendamento'
  const Icon = isAgendamento ? Calendar : MessageCircle
  const status = STATUS_STYLE[automacao.status] || STATUS_STYLE.rascunho
  const taxa = automacao.metrics.runs > 0
    ? Math.round((automacao.metrics.sucessos / automacao.metrics.runs) * 100)
    : 0

  const triggerLabel = isAgendamento
    ? describeTriggerSchedule(automacao.trigger)
    : automacao.trigger.tipo === 'evento'
      ? `${automacao.trigger.plataforma} · ${getEventoLabel(automacao.trigger.plataforma, automacao.trigger.evento)}`
      : 'Evento'

  const acoes = automacao.pipeline.map((a) => getAcaoLabel(a.tipo)).join(' → ')

  return (
    <article
      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onOpen?.(automacao)}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ')) onOpen(automacao) }}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isAgendamento ? 'bg-sky-50 text-sky-600' : 'bg-violet-50 text-violet-600'}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-[15px] truncate">{automacao.nome}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${status.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
          {automacao.descricao && (
            <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{automacao.descricao}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {isAgendamento ? 'Agendada' : 'Por evento'}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 truncate max-w-[200px]">
              {triggerLabel}
            </span>
          </div>
          {acoes && (
            <p className="text-[11px] text-gray-400 mt-2 truncate">
              <Zap size={10} className="inline mr-1" />
              {acoes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-[11px] text-gray-400 tabular-nums">
          <span>{automacao.metrics.runs} runs</span>
          <span>{taxa}% ok</span>
          {automacao.status === 'erro' && automacao.metrics.ultimoErro && (
            <span className="text-red-500 flex items-center gap-0.5" title={automacao.metrics.ultimoErro.mensagem}>
              <AlertTriangle size={11} /> erro
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onExecute(automacao.id)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-40"
            title="Executar agora"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={() => onToggle(automacao.id, !automacao.ativa)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title={automacao.ativa ? 'Pausar' : 'Ativar'}
          >
            {automacao.ativa ? <Pause size={14} /> : <Play size={14} />}
          </button>
          {onHistory && (
            <button type="button" onClick={() => onHistory(automacao)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Histórico">
              <History size={14} />
            </button>
          )}
          <button type="button" onClick={() => onEdit(automacao)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Editar">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={() => onDuplicate(automacao.id)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" title="Duplicar">
            <Copy size={14} />
          </button>
          <button type="button" onClick={() => onDelete(automacao.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}
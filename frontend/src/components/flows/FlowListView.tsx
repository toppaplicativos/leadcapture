import { Plus, GitBranch, Play, Pause, Copy, Trash2, ChevronRight, BookOpen } from 'lucide-react'
import { Button, Badge, Card, CardBody } from '@/components/ui'
import type { Flow, FlowStatusFilter } from '@/lib/flows/types'
import { statusBadgeVariant, statusLabel, toneForNode, TRIGGER_CATALOG } from '@/lib/flows/catalog'
import { cn } from '@/lib/cn'

type Props = {
  flows: Flow[]
  loading: boolean
  filter: FlowStatusFilter
  busyId: string | null
  onFilter: (f: FlowStatusFilter) => void
  onCreate: () => void
  onCreateOrder?: () => void
  onOpen: (f: Flow) => void
  onToggle: (f: Flow) => void
  onDuplicate: (f: Flow) => void
  onDelete: (id: string) => void
  error?: string
}

const FILTERS: { id: FlowStatusFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Ativos' },
  { id: 'draft', label: 'Rascunhos' },
  { id: 'paused', label: 'Pausados' },
]

export function FlowListView({
  flows,
  loading,
  filter,
  busyId,
  onFilter,
  onCreate,
  onCreateOrder,
  onOpen,
  onToggle,
  onDuplicate,
  onDelete,
  error,
}: Props) {
  const filtered = flows.filter((f) => (filter === 'all' ? true : f.status === filter))
  const activeCount = flows.filter((f) => f.status === 'active').length

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight" style={{ textWrap: 'balance' }}>
            Fluxos
          </h1>
          <p className="mt-1 text-sm text-gray-600 max-w-xl leading-relaxed">
            Organize atendimentos completos: receba o cliente, entenda a necessidade,
            resolva e confirme a conclusão ou encaminhe para a equipe.
          </p>
          {!loading && flows.length > 0 && (
            <p className="mt-2 text-xs text-gray-500 tabular-nums">
              {flows.length} fluxo{flows.length === 1 ? '' : 's'}
              {activeCount > 0 ? ` · ${activeCount} ativo${activeCount === 1 ? '' : 's'}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {onCreateOrder && <Button variant="secondary" size="md" onClick={onCreateOrder}>Fluxo de pedido</Button>}
          <Button variant="primary" size="md" iconLeft={<Plus size={16} strokeWidth={2} />} onClick={onCreate}>Novo fluxo</Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error} Tente novamente ou verifique a conexão do serviço.
        </div>
      )}

      {flows.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar fluxos">
          {FILTERS.map((f) => {
            const count =
              f.id === 'all' ? flows.length : flows.filter((x) => x.status === f.id).length
            const selected = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onFilter(f.id)}
                className={cn(
                  'h-9 px-3 rounded-xl text-xs font-semibold transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                  selected
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 border border-border hover:bg-gray-50',
                )}
              >
                {f.label}
                <span className={cn('ml-1.5 tabular-nums', selected ? 'text-white/70' : 'text-gray-400')}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando fluxos">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && flows.length === 0 && (
        <Card flat className="border-dashed">
          <CardBody className="py-12 px-6 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center">
              <GitBranch size={26} className="text-gray-700" strokeWidth={1.75} />
            </div>
            <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">
              Crie seu fluxo padrão de atendimento
            </h2>
            <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
              Comece com uma estrutura pronta para receber o cliente, entender sua necessidade,
              responder com contexto e confirmar se o atendimento foi resolvido.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button variant="primary" size="md" iconLeft={<Plus size={16} />} onClick={onCreate}>
                Criar fluxo de atendimento
              </Button>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 text-left max-w-2xl mx-auto">
              {[
                { t: 'Começo', d: 'Recepção e identificação do cliente' },
                { t: 'Meio', d: 'Entendimento e solução da necessidade' },
                { t: 'Conclusão', d: 'Resolvido ou transferência para a equipe' },
              ].map((item) => (
                <div key={item.t} className="rounded-xl border border-border bg-gray-50/80 px-3.5 py-3">
                  <p className="text-xs font-semibold text-gray-900">{item.t}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{item.d}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {!loading && flows.length > 0 && filtered.length === 0 && (
        <Card flat>
          <CardBody className="py-10 text-center">
            <p className="text-sm text-gray-600">Nenhum fluxo neste filtro.</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onFilter('all')}>
              Ver todos
            </Button>
          </CardBody>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="space-y-2.5">
          {filtered.map((f) => {
            const triggerNode = f.nodes?.find((n) => n.type === 'trigger')
            const triggerMeta = TRIGGER_CATALOG.find((t) => t.subtype === triggerNode?.subtype)
            const TriggerIcon = triggerMeta?.icon || GitBranch
            const waitCount = (f.nodes || []).filter((n) => n.type === 'wait' || n.type === 'collect').length
            const nodePreview = (f.nodes || []).slice(0, 6)

            return (
              <li key={f.id}>
                <Card
                  interactive
                  className="group"
                  onClick={() => onOpen(f)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpen(f)
                    }
                  }}
                >
                  <CardBody className="py-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-11 h-11 rounded-xl grid place-items-center shrink-0',
                          f.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        <TriggerIcon size={20} strokeWidth={1.75} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight truncate">
                            {f.name}
                          </h3>
                          <Badge variant={statusBadgeVariant(f.status)}>{statusLabel(f.status)}</Badge>
                          {f.published_version ? (
                            <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                              v{f.published_version}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-700">Não publicado</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-600">
                          {triggerMeta?.label || triggerNode?.subtype || 'Sem gatilho'}
                          {' · '}
                          {(f.nodes || []).length} blocos
                          {waitCount > 0 ? ` · ${waitCount} espera/coleta` : ''}
                        </p>

                        <div className="mt-3 flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
                          {nodePreview.map((n, i) => {
                            const tone = toneForNode(n.type, n.subtype)
                            return (
                              <div key={n.id} className="flex items-center shrink-0">
                                <span
                                  className={cn(
                                    'px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap max-w-[120px] truncate',
                                    tone.chip,
                                  )}
                                >
                                  {n.label || n.subtype}
                                </span>
                                {i < nodePreview.length - 1 && (
                                  <ChevronRight size={12} className="text-gray-300 mx-0.5 shrink-0" />
                                )}
                              </div>
                            )
                          })}
                          {(f.nodes || []).length > 6 && (
                            <span className="text-[10px] font-semibold text-gray-400 pl-1">
                              +{(f.nodes || []).length - 6}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!px-2"
                          aria-label={f.status === 'active' ? 'Pausar' : 'Ativar'}
                          disabled={busyId === f.id}
                          onClick={() => onToggle(f)}
                          iconLeft={f.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!px-2"
                          aria-label="Duplicar"
                          onClick={() => onDuplicate(f)}
                          iconLeft={<Copy size={14} />}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!px-2 text-red-600 hover:bg-red-50"
                          aria-label="Excluir"
                          onClick={() => onDelete(f.id)}
                          iconLeft={<Trash2 size={14} />}
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && flows.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
          <BookOpen size={14} className="mt-0.5 shrink-0 text-gray-400" />
          <span>
            <strong className="font-semibold text-gray-700">Publicar</strong> grava uma versão estável.
            Execuções em andamento continuam na versão em que começaram.
          </span>
        </p>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Plus, Save, CheckCircle2, Play, X, History,
  Users, ChevronRight, LayoutList, Network,
} from 'lucide-react'
import { Button, Badge, Card, CardBody, Input } from '@/components/ui'
import { FlowNodeConfigPanel } from './FlowNodeConfigPanel'
import { FlowCanvas } from './FlowCanvas'
import type { Flow, FlowConnection, FlowExecution, FlowNode, FlowSession } from '@/lib/flows/types'
import {
  ACTION_CATALOG,
  COLLECT_CATALOG,
  LOGIC_CATALOG,
  MESSAGE_CATALOG,
  NODE_ICON,
  statusBadgeVariant,
  statusLabel,
  toneForNode,
  type CatalogItem,
} from '@/lib/flows/catalog'
import * as api from '@/lib/flows/api'
import { cn } from '@/lib/cn'

type Props = {
  flow: Flow
  onClose: () => void
  onUpdated?: (flow: Flow) => void
}

type Toast = { kind: 'ok' | 'err'; text: string }

export function FlowEditor({ flow, onClose, onUpdated }: Props) {
  const [name, setName] = useState(flow.name)
  const [nodes, setNodes] = useState<FlowNode[]>(flow.nodes || [])
  const [connections, setConnections] = useState<FlowConnection[]>(flow.connections || [])
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (flow.nodes || []).find((n) => n.type === 'trigger')?.id || flow.nodes?.[0]?.id || null,
  )
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedVersion, setPublishedVersion] = useState(flow.published_version || 0)
  const [dirty, setDirty] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showObservability, setShowObservability] = useState(false)
  const [executions, setExecutions] = useState<FlowExecution[]>([])
  const [sessions, setSessions] = useState<FlowSession[]>([])
  const [simSteps, setSimSteps] = useState<Array<{ label: string; type: string; subtype: string }> | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas')
  const [metrics, setMetrics] = useState<{
    sample_size: number
    completed: number
    waiting: number
    failed: number
    phase_visits: Record<string, number>
  } | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [starting, setStarting] = useState(false)

  const selected = nodes.find((n) => n.id === selectedId) || null

  const flash = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    setToast({ text, kind })
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  const reloadObs = useCallback(async () => {
    try {
      const [ex, se, m] = await Promise.all([
        api.listExecutions(flow.id, 12),
        api.listSessions(flow.id, 12),
        api.fetchFlowMetrics(flow.id).catch(() => null),
      ])
      setExecutions(ex)
      setSessions(se)
      if (m) {
        setMetrics({
          sample_size: m.sample_size,
          completed: m.completed,
          waiting: m.waiting,
          failed: m.failed,
          phase_visits: m.phase_visits || {},
        })
      }
    } catch {
      /* ignore */
    }
  }, [flow.id])

  useEffect(() => {
    void reloadObs()
  }, [reloadObs])

  const markDirty = () => setDirty(true)

  function patchNode(nodeId: string, patch: Partial<FlowNode>) {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)))
    markDirty()
  }

  function patchData(nodeId: string, key: string, value: unknown) {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n)),
    )
    markDirty()
  }

  async function saveDraft() {
    setSaving(true)
    try {
      const updated = await api.updateFlow(flow.id, { name, nodes, connections })
      setDirty(false)
      onUpdated?.(updated)
      flash('Rascunho salvo')
    } catch (e: any) {
      flash(e?.message || 'Falha ao salvar', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      await api.updateFlow(flow.id, { name, nodes, connections })
      const { flow: updated, published_version } = await api.publishFlow(flow.id, true)
      setPublishedVersion(published_version)
      setDirty(false)
      onUpdated?.(updated)
      flash(`Publicado v${published_version} · fluxo ativo`)
    } catch (e: any) {
      flash(e?.message || 'Falha ao publicar', 'err')
    } finally {
      setPublishing(false)
    }
  }

  async function simulate() {
    try {
      if (dirty) await api.updateFlow(flow.id, { name, nodes, connections })
      const { steps } = await api.simulateFlow(flow.id)
      setSimSteps(steps)
    } catch (e: any) {
      flash(e?.message || 'Falha na simulação', 'err')
    }
  }

  async function startTest() {
    const phone = testPhone.replace(/\D/g, '')
    if (phone.length < 10) {
      flash('Informe um telefone com DDD para teste', 'err')
      return
    }
    setStarting(true)
    try {
      if (dirty) await api.updateFlow(flow.id, { name, nodes, connections })
      const { execution_id } = await api.startFlow(flow.id, {
        phone,
        message: 'teste manual',
      })
      flash(`Execução iniciada ${execution_id.slice(0, 14)}…`)
      void reloadObs()
    } catch (e: any) {
      flash(e?.message || 'Falha ao iniciar', 'err')
    } finally {
      setStarting(false)
    }
  }

  function addFromCatalog(item: CatalogItem) {
    const id = `${item.type}-${Date.now()}`
    const data: Record<string, any> = {}
    if (item.group === 'collect' || item.type === 'wait') {
      data.prompt =
        item.subtype === 'collect_email'
          ? 'Qual o seu e-mail?'
          : item.subtype === 'collect_phone'
            ? 'Qual o seu telefone com DDD?'
            : item.subtype === 'collect_name'
              ? 'Como posso te chamar?'
              : item.subtype === 'collect_confirm'
                ? 'Confirma? (sim/não)'
                : item.subtype === 'wait_reply'
                  ? 'Aguardando sua resposta...'
                  : 'Pode me informar?'
      data.variable_name =
        item.subtype === 'collect_name'
          ? 'name'
          : item.subtype === 'collect_email'
            ? 'email'
            : item.subtype === 'collect_phone'
              ? 'phone'
              : item.subtype === 'collect_confirm'
                ? 'confirmed'
                : 'user_reply'
      data.max_attempts = 3
      data.timeout_minutes = 1440
    }
    if (item.subtype === 'send_message') {
      data.message = ''
      data.mensagemSteps = []
      data.wait_for_reply = true
    }
    if (item.subtype === 'wait_button') {
      data.prompt = 'Escolha uma opção:'
      data.variable_name = 'choice'
      data.options = [
        { id: 'opt_1', label: 'Opção 1' },
        { id: 'opt_2', label: 'Opção 2' },
      ]
      data.max_attempts = 3
    }
    if (item.subtype === 'handoff_agent') {
      data.user_message = 'Em instantes um atendente vai continuar seu atendimento.'
      data.summary = 'Transferência solicitada pelo fluxo'
    }

    const newNode: FlowNode = {
      id,
      type: item.type,
      subtype: item.subtype,
      label: item.label,
      data,
    }

    const endIdx = nodes.findIndex((n) => n.type === 'end')
    if (endIdx >= 0) {
      const endNode = nodes[endIdx]
      const incoming = connections.find((c) => c.to === endNode.id)
      setNodes((prev) => {
        const next = [...prev]
        next.splice(endIdx, 0, newNode)
        return next
      })
      if (incoming) {
        setConnections((prev) => {
          const rest = prev.filter((c) => c.id !== incoming.id)
          const ts = Date.now()
          rest.push({
            id: `conn-${ts}-a`,
            from: incoming.from,
            fromHandle: incoming.fromHandle || 'main',
            to: id,
          })
          if (item.type === 'condition' || item.subtype === 'collect_confirm') {
            rest.push({
              id: `conn-${ts}-yes`,
              from: id,
              fromHandle: 'yes',
              to: endNode.id,
            })
            rest.push({
              id: `conn-${ts}-no`,
              from: id,
              fromHandle: 'no',
              to: endNode.id,
            })
          } else {
            rest.push({
              id: `conn-${ts}-b`,
              from: id,
              fromHandle: 'main',
              to: endNode.id,
            })
          }
          return rest
        })
      }
    } else {
      setNodes((prev) => [...prev, newNode])
    }
    setSelectedId(id)
    setShowAdd(false)
    markDirty()
  }

  function removeNode(nodeId: string) {
    const target = nodes.find((n) => n.id === nodeId)
    if (!target || target.type === 'trigger' || target.type === 'end') return
    const incoming = connections.filter((c) => c.to === nodeId)
    const outgoing = connections.filter((c) => c.from === nodeId)
    setConnections((prev) => {
      let next = prev.filter((c) => c.from !== nodeId && c.to !== nodeId)
      if (incoming[0] && outgoing[0]) {
        next = [
          ...next,
          {
            id: `conn-${Date.now()}`,
            from: incoming[0].from,
            fromHandle: incoming[0].fromHandle,
            to: outgoing[0].to,
          },
        ]
      }
      return next
    })
    setNodes((prev) => prev.filter((n) => n.id !== nodeId))
    setSelectedId(null)
    markDirty()
  }

  const waitingSessions = useMemo(
    () => sessions.filter((s) => s.status === 'waiting_user' || s.status === 'waiting_agent'),
    [sessions],
  )

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-6 right-6 z-[200] px-4 py-2.5 rounded-xl text-xs font-semibold shadow-[0_12px_40px_rgba(0,0,0,0.12)]',
            toast.kind === 'ok' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white',
          )}
        >
          {toast.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="!px-2 shrink-0"
            onClick={onClose}
            aria-label="Voltar"
            iconLeft={<ArrowLeft size={16} />}
          />
          <div className="min-w-0 flex-1">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                markDirty()
              }}
              className="!h-10 !text-[15px] !font-semibold !tracking-tight border-transparent hover:border-border focus:border-gray-900 bg-transparent px-2 -ml-2 max-w-md"
              aria-label="Nome do fluxo"
            />
            <p className="text-[11px] text-gray-500 pl-0.5">
              {dirty ? 'Alterações não salvas' : 'Rascunho sincronizado'}
              {publishedVersion > 0
                ? ` · runtime v${publishedVersion}`
                : ' · ainda não publicado'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowObservability((v) => !v)
              void reloadObs()
            }}
            iconLeft={<History size={14} />}
          >
            Histórico
            {waitingSessions.length > 0 && (
              <Badge variant="info" className="ml-1">
                {waitingSessions.length}
              </Badge>
            )}
          </Button>
          <div className="inline-flex rounded-xl border border-border bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={cn(
                'h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors',
                viewMode === 'canvas' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
              aria-pressed={viewMode === 'canvas'}
            >
              <Network size={13} /> Canvas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors',
                viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
              aria-pressed={viewMode === 'list'}
            >
              <LayoutList size={13} /> Lista
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void simulate()} iconLeft={<Play size={14} />}>
            Simular
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)} iconLeft={<Plus size={14} />}>
            Bloco
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={saving}
            onClick={() => void saveDraft()}
            iconLeft={!saving ? <Save size={14} /> : undefined}
          >
            Salvar
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={publishing}
            onClick={() => void publish()}
            iconLeft={!publishing ? <CheckCircle2 size={14} /> : undefined}
          >
            Publicar
          </Button>
        </div>
      </div>

      {simSteps && (
        <Card flat className="bg-gray-50">
          <CardBody className="py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-800">Caminho simulado (até wait/end)</p>
              <button
                type="button"
                className="p-1 rounded-lg hover:bg-gray-200 text-gray-500"
                onClick={() => setSimSteps(null)}
                aria-label="Fechar simulação"
              >
                <X size={14} />
              </button>
            </div>
            <ol className="flex flex-wrap gap-1.5">
              {simSteps.map((s, i) => (
                <li
                  key={`${s.label}-${i}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-white border border-border text-gray-700"
                >
                  <span className="text-gray-400 tabular-nums">{i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {showObservability && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card flat>
            <CardBody className="py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-800">Métricas (últimas execuções)</p>
              {metrics ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 border border-border px-2.5 py-2">
                    <p className="text-gray-500">Amostra</p>
                    <p className="font-semibold text-gray-900 tabular-nums">{metrics.sample_size}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-2">
                    <p className="text-emerald-800/80">Concluídas</p>
                    <p className="font-semibold text-emerald-900 tabular-nums">{metrics.completed}</p>
                  </div>
                  <div className="rounded-lg bg-sky-50 border border-sky-100 px-2.5 py-2">
                    <p className="text-sky-800/80">Aguardando</p>
                    <p className="font-semibold text-sky-900 tabular-nums">{metrics.waiting}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-100 px-2.5 py-2">
                    <p className="text-red-800/80">Falhas</p>
                    <p className="font-semibold text-red-900 tabular-nums">{metrics.failed}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Sem dados ainda.</p>
              )}
              {metrics && Object.keys(metrics.phase_visits).length > 0 && (
                <div className="pt-1">
                  <p className="text-[11px] font-semibold text-gray-600 mb-1">Visitas por fase</p>
                  <ul className="space-y-1">
                    {Object.entries(metrics.phase_visits).map(([phase, n]) => (
                      <li key={phase} className="flex justify-between text-[11px] text-gray-700">
                        <span className="truncate">{phase}</span>
                        <span className="tabular-nums font-semibold">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-2 border-t border-border-light space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-600">Teste manual</p>
                <div className="flex gap-1.5">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="5511999999999"
                    className="!h-9 text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={starting}
                    onClick={() => void startTest()}
                  >
                    Iniciar
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card flat>
            <CardBody className="py-3 max-h-44 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <History size={14} className="text-gray-500" />
                <p className="text-xs font-semibold text-gray-800">Execuções</p>
              </div>
              {executions.length === 0 && (
                <p className="text-xs text-gray-500">Nenhuma execução ainda. Publique e dispare um gatilho.</p>
              )}
              <ul className="space-y-1.5">
                {executions.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between gap-2 text-xs border-b border-border-light pb-1.5 last:border-0"
                  >
                    <span className="font-mono text-gray-500 truncate">{ex.id.slice(0, 16)}…</span>
                    <Badge variant={statusBadgeVariant(ex.status)}>{statusLabel(ex.status)}</Badge>
                    <span className="text-gray-500 truncate max-w-[30%]">{ex.trigger_subtype}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card flat>
            <CardBody className="py-3 max-h-44 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-gray-500" />
                <p className="text-xs font-semibold text-gray-800">Sessões</p>
              </div>
              {sessions.length === 0 && (
                <p className="text-xs text-gray-500">Sem sessões. Coletas e esperas aparecem aqui.</p>
              )}
              <ul className="space-y-1.5">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-xs border-b border-border-light pb-1.5 last:border-0"
                  >
                    <span className="font-mono text-gray-700 tabular-nums">{s.contact_key}</span>
                    <Badge variant={statusBadgeVariant(s.status)}>{statusLabel(s.status)}</Badge>
                    <span className="text-gray-400 truncate max-w-[28%]">{s.waiting_node_id || '—'}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Workspace: canvas/list + config */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] items-start">
        {viewMode === 'canvas' ? (
          <div className="min-h-[520px] h-[min(70vh,720px)]">
            <FlowCanvas
              flowNodes={nodes}
              connections={connections}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNodesChange={(next) => {
                setNodes(next)
                markDirty()
              }}
              onConnectionsChange={(next) => {
                setConnections(next)
                markDirty()
              }}
              className="h-full"
            />
          </div>
        ) : (
          <Card className="min-h-[420px]">
            <CardBody className="py-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Jornada</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ordem de execução · clique para configurar
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)} iconLeft={<Plus size={14} />}>
                  Adicionar
                </Button>
              </div>

              <ol className="relative space-y-0">
                {nodes.map((node, index) => {
                  const tone = toneForNode(node.type, node.subtype)
                  const Icon = NODE_ICON[node.type] || NODE_ICON.action
                  const active = selectedId === node.id
                  const isLast = index === nodes.length - 1

                  return (
                    <li key={node.id} className="relative flex gap-3">
                      <div className="flex flex-col items-center w-10 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedId(node.id)}
                          className={cn(
                            'w-10 h-10 rounded-xl grid place-items-center transition-shadow duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                            tone.icon,
                            active && `ring-2 ring-offset-2 ${tone.ring}`,
                          )}
                          aria-current={active ? 'true' : undefined}
                          aria-label={`Selecionar ${node.label}`}
                        >
                          <Icon size={18} strokeWidth={1.75} />
                        </button>
                        {!isLast && (
                          <div className="w-px flex-1 min-h-[20px] bg-border my-1" aria-hidden />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className={cn(
                          'flex-1 min-w-0 text-left mb-2 rounded-xl border px-3.5 py-3 transition-colors duration-150',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
                          active
                            ? 'border-gray-900 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                            : 'border-border bg-white hover:border-gray-300 hover:bg-gray-50/80',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate tracking-tight">
                              {node.label || node.subtype}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                              {node.type} · {node.subtype}
                            </p>
                          </div>
                          <ChevronRight
                            size={16}
                            className={cn('shrink-0 text-gray-300', active && 'text-gray-700')}
                          />
                        </div>
                        {(node.type === 'wait' || node.type === 'collect') && node.data?.prompt && (
                          <p className="mt-2 text-xs text-gray-600 line-clamp-2 leading-relaxed">
                            “{String(node.data.prompt)}”
                          </p>
                        )}
                        {node.subtype === 'send_message' &&
                          (node.data?.message || node.data?.mensagemSteps?.[0]?.caption) && (
                            <p className="mt-2 text-xs text-gray-600 line-clamp-2 leading-relaxed">
                              {String(node.data.message || node.data.mensagemSteps?.[0]?.caption || '')}
                            </p>
                          )}
                      </button>
                    </li>
                  )
                })}
              </ol>

              {nodes.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">Nenhum bloco. Adicione um gatilho.</p>
              )}
            </CardBody>
          </Card>
        )}

        <Card className="lg:sticky lg:top-3 min-h-[420px] max-h-[min(70vh,720px)] overflow-y-auto">
          <CardBody className="py-5">
            {selected ? (
              <FlowNodeConfigPanel
                node={selected}
                onChange={patchNode}
                onData={patchData}
                onRemove={removeNode}
              />
            ) : (
              <div className="h-full min-h-[320px] grid place-items-center text-center px-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Selecione um bloco</p>
                  <p className="mt-1 text-xs text-gray-500 max-w-[220px] mx-auto leading-relaxed">
                    No canvas, clique em um nó ou arraste conexões entre handles.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setShowAdd(true)}
                    iconLeft={<Plus size={14} />}
                  >
                    Adicionar bloco
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Add block drawer */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => setShowAdd(false)}
          role="presentation"
        >
          <div
            className="w-full sm:max-w-lg max-h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-block-title"
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 id="add-block-title" className="text-[15px] font-semibold text-gray-900 tracking-tight">
                Adicionar bloco
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="!px-2"
                onClick={() => setShowAdd(false)}
                aria-label="Fechar"
                iconLeft={<X size={16} />}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <CatalogSection title="Mensagens" items={MESSAGE_CATALOG} onPick={addFromCatalog} />
              <CatalogSection title="Espera e coleta" items={COLLECT_CATALOG} onPick={addFromCatalog} />
              <CatalogSection title="Lógica" items={LOGIC_CATALOG} onPick={addFromCatalog} />
              <CatalogSection title="Ações" items={ACTION_CATALOG} onPick={addFromCatalog} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogSection({
  title,
  items,
  onPick,
}: {
  title: string
  items: CatalogItem[]
  onPick: (item: CatalogItem) => void
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={`${item.type}-${item.subtype}`}
              type="button"
              onClick={() => onPick(item)}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-xl border border-border text-left',
                'hover:border-gray-300 hover:bg-gray-50 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2',
              )}
            >
              <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 grid place-items-center shrink-0">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-900">{item.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{item.desc}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

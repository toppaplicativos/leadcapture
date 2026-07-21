import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowConnection, FlowNode } from '@/lib/flows/types'
import { NODE_ICON, toneForNode } from '@/lib/flows/catalog'
import { cn } from '@/lib/cn'

export type FlowCanvasNodeData = {
  flowNode: FlowNode
}

const NODE_H = 72
const ROW_GAP = 28

function layoutPosition(index: number, existing?: { x?: number; y?: number }) {
  if (existing && typeof existing.x === 'number' && typeof existing.y === 'number') {
    return { x: existing.x, y: existing.y }
  }
  return { x: 80, y: 40 + index * (NODE_H + ROW_GAP) }
}

function FlowBlockNode({ data, selected }: NodeProps) {
  const flowNode = (data as unknown as FlowCanvasNodeData).flowNode
  const tone = toneForNode(flowNode.type, flowNode.subtype)
  const Icon = NODE_ICON[flowNode.type] || NODE_ICON.action
  const isCondition =
    flowNode.type === 'condition' || flowNode.subtype === 'collect_confirm'
  const isPhaseManager = flowNode.subtype === 'phase_manager'

  return (
    <div
      className={cn(
        'w-[200px] rounded-xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'transition-shadow duration-150',
        selected
          ? 'border-gray-900 shadow-[0_4px_16px_rgba(15,23,42,0.08)] ring-2 ring-gray-900/10'
          : 'border-border hover:border-gray-300',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target-main"
        className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white"
      />

      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0', tone.icon)}>
          <Icon size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 truncate tracking-tight leading-snug">
            {flowNode.label || flowNode.subtype}
          </p>
          <p className="text-[10px] text-gray-500 truncate mt-0.5">
            {flowNode.type} · {flowNode.subtype}
          </p>
        </div>
      </div>

      {isPhaseManager ? (
        <>
          <Handle type="source" position={Position.Bottom} id="source-back" className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-white" style={{ left: '20%' }} />
          <Handle type="source" position={Position.Bottom} id="source-stay" className="!w-2.5 !h-2.5 !bg-sky-500 !border-2 !border-white" style={{ left: '50%' }} />
          <Handle type="source" position={Position.Bottom} id="source-advance" className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white" style={{ left: '80%' }} />
          <div className="flex justify-between px-3 pb-1.5 text-[9px] font-semibold"><span className="text-amber-600">voltar</span><span className="text-sky-600">manter</span><span className="text-emerald-600">avançar</span></div>
        </>
      ) : isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="source-yes"
            className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-white"
            style={{ left: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="source-no"
            className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-white"
            style={{ left: '70%' }}
          />
          <div className="flex justify-between px-3 pb-1.5 text-[9px] font-semibold">
            <span className="text-emerald-600">sim</span>
            <span className="text-amber-600">não</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="source-main"
          className="!w-2.5 !h-2.5 !bg-gray-700 !border-2 !border-white"
        />
      )}
    </div>
  )
}

const nodeTypes = { flowBlock: FlowBlockNode }

function sourceHandleFromFromHandle(fromHandle: string, branched: boolean): string {
  const h = String(fromHandle || 'main').toLowerCase()
  if (branched) {
    if (h === 'advance') return 'source-advance'
    if (h === 'stay') return 'source-stay'
    if (h === 'back') return 'source-back'
    if (h === 'no' || h === 'false' || h === 'nao' || h === 'não') return 'source-no'
    if (h === 'yes' || h === 'true' || h === 'sim') return 'source-yes'
    // custom option ids still use main source; labels on edges show branch
    if (h === 'main' || h === 'default') return 'source-main'
    return 'source-yes'
  }
  return 'source-main'
}

function fromHandleFromSourceId(sourceHandle: string | null | undefined): string {
  const h = String(sourceHandle || 'source-main')
  if (h.includes('advance')) return 'advance'
  if (h.includes('stay')) return 'stay'
  if (h.includes('back')) return 'back'
  if (h.includes('no')) return 'no'
  if (h.includes('yes')) return 'yes'
  return 'main'
}

export function flowToRf(
  flowNodes: FlowNode[],
  connections: FlowConnection[],
  selectedId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = flowNodes.map((fn, i) => {
    const pos = layoutPosition(i, fn.data?.ui)
    return {
      id: fn.id,
      type: 'flowBlock',
      position: pos,
      selected: selectedId === fn.id,
      data: { flowNode: fn } satisfies FlowCanvasNodeData,
      draggable: true,
    }
  })

  const byId = new Map(flowNodes.map((n) => [n.id, n]))
  const edges: Edge[] = connections.map((c) => {
    const from = byId.get(c.from)
    const branched =
      from?.type === 'condition' || from?.subtype === 'collect_confirm'
    const handle = String(c.fromHandle || 'main').toLowerCase()
    return {
      id: c.id,
      source: c.from,
      target: c.to,
      sourceHandle: sourceHandleFromFromHandle(c.fromHandle, !!branched),
      targetHandle: 'target-main',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a3a3a3' },
      style: { stroke: '#a3a3a3', strokeWidth: 1.5 },
      label: branched
        ? handle === 'advance'
          ? 'avançar'
          : handle === 'stay'
            ? 'manter'
            : handle === 'back'
              ? 'voltar'
              : handle === 'no'
                ? 'não'
                : handle === 'yes'
                  ? 'sim'
                  : handle !== 'main'
                    ? handle
                    : undefined
        : handle !== 'main'
          ? handle
          : undefined,
      labelStyle: { fontSize: 10, fontWeight: 600, fill: '#737373' },
      labelBgStyle: { fill: '#fafafa', fillOpacity: 0.9 },
      labelBgPadding: [4, 6] as [number, number],
      labelBgBorderRadius: 6,
    }
  })

  return { nodes, edges }
}

function FitViewOnce({ token }: { token: string }) {
  const { fitView } = useReactFlow()
  const last = useRef('')
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    const t = window.setTimeout(() => {
      fitView({ padding: 0.22, duration: 180 })
    }, 40)
    return () => window.clearTimeout(t)
  }, [token, fitView])
  return null
}

type Props = {
  flowNodes: FlowNode[]
  connections: FlowConnection[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onNodesChange: (nodes: FlowNode[]) => void
  onConnectionsChange: (connections: FlowConnection[]) => void
  className?: string
}

function FlowCanvasInner({
  flowNodes,
  connections,
  selectedId,
  onSelect,
  onNodesChange,
  onConnectionsChange,
  className,
}: Props) {
  const { nodes: rfNodes, edges: rfEdges } = useMemo(
    () => flowToRf(flowNodes, connections, selectedId),
    [flowNodes, connections, selectedId],
  )

  const nodesRef = useRef(rfNodes)
  nodesRef.current = rfNodes

  const onNodesChangeRf: OnNodesChange = useCallback(
    (changes) => {
      for (const ch of changes) {
        if (ch.type === 'select' && 'selected' in ch && ch.selected) {
          onSelect(ch.id)
        }
      }

      const positionEnds = changes.filter(
        (c) => c.type === 'position' && 'dragging' in c && c.dragging === false,
      )
      if (positionEnds.length === 0) return

      const nextRf = applyNodeChanges(changes, nodesRef.current)
      const posById = new Map(nextRf.map((n) => [n.id, n.position]))
      onNodesChange(
        flowNodes.map((fn) => {
          const p = posById.get(fn.id)
          if (!p) return fn
          return {
            ...fn,
            data: {
              ...fn.data,
              ui: { x: p.x, y: p.y },
            },
          }
        }),
      )
    },
    [flowNodes, onNodesChange, onSelect],
  )

  const onEdgesChangeRf: OnEdgesChange = useCallback(
    (changes) => {
      const removeIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
      if (removeIds.size === 0) return
      onConnectionsChange(connections.filter((c) => !removeIds.has(c.id)))
    },
    [connections, onConnectionsChange],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      const fromHandle = fromHandleFromSourceId(conn.sourceHandle)
      const filtered = connections.filter(
        (c) => !(c.from === conn.source && c.fromHandle === fromHandle),
      )
      filtered.push({
        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: conn.source,
        fromHandle,
        to: conn.target,
      })
      onConnectionsChange(filtered)
    },
    [connections, onConnectionsChange],
  )

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      onSelect(node.id)
    },
    [onSelect],
  )

  const onPaneClick = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  const fitToken = useMemo(
    () => `${flowNodes.map((n) => n.id).join(',')}|${connections.length}`,
    [flowNodes, connections.length],
  )

  return (
    <div
      className={cn(
        'w-full h-full min-h-[420px] rounded-2xl overflow-hidden border border-border bg-[#fafafa]',
        className,
      )}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChangeRf}
        onEdgesChange={onEdgesChangeRf}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.35}
        maxZoom={1.6}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#a3a3a3' },
        }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Backspace', 'Delete']}
        className="flow-canvas-rf"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#e5e5e5" />
        <Controls
          showInteractive={false}
          className="!shadow-sm !border !border-border !rounded-xl !overflow-hidden !bg-white"
        />
        <MiniMap
          className="!bg-white !border !border-border !rounded-xl !shadow-sm"
          maskColor="rgba(23,23,23,0.06)"
          nodeColor={() => '#d4d4d4'}
          pannable
          zoomable
        />
        <Panel position="top-left" className="!m-3">
          <div className="px-2.5 py-1.5 rounded-lg bg-white/95 border border-border text-[11px] font-semibold text-gray-600 shadow-sm">
            Arraste · conecte · Del remove aresta · scroll zoom
          </div>
        </Panel>
        <FitViewOnce token={fitToken} />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

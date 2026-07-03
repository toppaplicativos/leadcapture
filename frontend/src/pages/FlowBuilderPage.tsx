import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Play, Pause, Trash2, X, Save, ChevronRight,
  Zap, MessageSquare, Clock, GitBranch, Target, Mail,
  Phone, Tag, Star, Globe, Bell, Bot, ArrowRight,
  Loader2, CheckCircle2, AlertTriangle, Copy,
  Diamond, Square,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const NODE_ICON: Record<string, LucideIcon> = {
  trigger: Zap,
  action: Play,
  condition: Diamond,
  delay: Clock,
  end: Square,
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

interface FNode {
  id: string; type: string; subtype: string; label: string; data: Record<string, any>
}
interface FConn {
  id: string; from: string; fromHandle: string; to: string
}
interface Flow {
  id: string; name: string; status: string; nodes: FNode[]; connections: FConn[]
  created_at?: string; updated_at?: string
}

const TRIGGER_TYPES = [
  { subtype: 'new_lead', label: 'Novo Lead', icon: Zap, desc: 'Quando um lead e criado' },
  { subtype: 'lead_status_change', label: 'Status Alterado', icon: GitBranch, desc: 'Quando o status do lead muda' },
  { subtype: 'message_received', label: 'Mensagem Recebida', icon: MessageSquare, desc: 'Quando chega mensagem WhatsApp' },
  { subtype: 'order_created', label: 'Pedido Criado', icon: Target, desc: 'Quando um pedido e realizado' },
]

const ACTION_TYPES = [
  { subtype: 'send_message', label: 'Enviar Mensagem', icon: MessageSquare, desc: 'WhatsApp texto' },
  { subtype: 'ai_message', label: 'Mensagem IA', icon: Bot, desc: 'Gerar com inteligencia artificial' },
  { subtype: 'change_status', label: 'Mudar Status', icon: GitBranch, desc: 'Atualizar status do lead' },
  { subtype: 'add_tag', label: 'Adicionar Tag', icon: Tag, desc: 'Marcar o lead com tag' },
  { subtype: 'update_score', label: 'Atualizar Score', icon: Star, desc: 'Incrementar pontuacao' },
  { subtype: 'send_notification', label: 'Notificacao', icon: Bell, desc: 'Notificar admin' },
  { subtype: 'webhook', label: 'Webhook', icon: Globe, desc: 'Chamar URL externa' },
  { subtype: 'send_image', label: 'Enviar Imagem', icon: Mail, desc: 'WhatsApp com imagem' },
]

const CONDITION_TYPES = [
  { subtype: 'score_check', label: 'Score >= X', icon: Star },
  { subtype: 'tag_check', label: 'Tem Tag?', icon: Tag },
  { subtype: 'status_check', label: 'Status = X', icon: GitBranch },
  { subtype: 'value_check', label: 'Valor >= X', icon: Target },
]

/* ══════════════════════════════════════════════
   FLOW BUILDER PAGE
   ══════════════════════════════════════════════ */
export function FlowBuilderPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [editFlow, setEditFlow] = useState<Flow | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/flows', { headers: getHeaders() }).then(r => r.json()).then(d => {
      setFlows(d.flows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createFlow() {
    try {
      const r = await fetch('/api/flows', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({
          name: 'Novo Fluxo',
          nodes: [
            { id: 'trigger-1', type: 'trigger', subtype: 'new_lead', label: 'Novo Lead', data: {} },
            { id: 'end-1', type: 'end', subtype: 'end', label: 'Fim', data: {} },
          ],
          connections: [{ id: 'conn-1', from: 'trigger-1', fromHandle: 'main', to: 'end-1' }],
        }),
      })
      const d = await r.json()
      if (d.flow) { setEditFlow(d.flow); load() }
    } catch {}
  }

  async function toggleStatus(flow: Flow) {
    setActionLoading(flow.id)
    const next = flow.status === 'active' ? 'paused' : 'active'
    try {
      await fetch(`/api/flows/${flow.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ status: next }) })
      load()
    } catch {}
    setActionLoading(null)
  }

  async function deleteFlow(id: string) {
    if (!confirm('Excluir este fluxo?')) return
    await fetch(`/api/flows/${id}`, { method: 'DELETE', headers: getHeaders() }).catch(() => {})
    load()
  }

  async function duplicateFlow(flow: Flow) {
    try {
      await fetch('/api/flows', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ name: `${flow.name} (copia)`, nodes: flow.nodes, connections: flow.connections }),
      })
      load()
    } catch {}
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl skeleton" />)}</div>

  // ── Flow Editor ──
  if (editFlow) return <FlowEditor flow={editFlow} onClose={() => { setEditFlow(null); load() }} />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Flow Builder</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{flows.length} fluxos de automacao</p>
        </div>
        <button onClick={createFlow}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-all shadow-sm">
          <Plus size={14} /> Novo Fluxo
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl grid place-items-center mx-auto mb-4 shadow-sm">
            <GitBranch size={28} className="text-gray-700" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-2">Crie seu primeiro fluxo</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed mb-4">
            Automatize processos: envie mensagens, mude status, notifique a equipe — tudo baseado em gatilhos como novos leads, pedidos ou mensagens.
          </p>
          <button onClick={createFlow}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition shadow-sm">
            <Plus size={14} className="inline mr-1" /> Criar Fluxo
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {flows.map(f => {
            const triggerNode = f.nodes?.find(n => n.type === 'trigger')
            const actionCount = f.nodes?.filter(n => n.type === 'action').length || 0
            const trigger = TRIGGER_TYPES.find(t => t.subtype === triggerNode?.subtype)
            const TriggerIcon = trigger?.icon || Zap
            return (
              <div key={f.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={() => setEditFlow(f)}>
                    <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${f.status === 'active' ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                      <TriggerIcon size={18} className={f.status === 'active' ? 'text-emerald-500' : 'text-gray-400'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{f.name}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          f.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                          f.status === 'paused' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                          'bg-gray-100 text-gray-500'
                        }`}>{f.status === 'active' ? 'Ativo' : f.status === 'paused' ? 'Pausado' : 'Rascunho'}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {trigger?.label || triggerNode?.subtype || '—'} → {actionCount} acao(es) → {f.nodes?.length || 0} nodes
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleStatus(f)} disabled={actionLoading === f.id}
                      className={`p-1.5 rounded-lg transition ${f.status === 'active' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {f.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button onClick={() => setEditFlow(f)} className="p-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition">
                      <GitBranch size={14} />
                    </button>
                    <button onClick={() => duplicateFlow(f)} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => deleteFlow(f.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* Mini pipeline */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 overflow-x-auto scrollbar-hide">
                  {(f.nodes || []).map((n, i) => {
                    const typeColor = n.type === 'trigger' ? 'bg-blue-500' : n.type === 'action' ? 'bg-emerald-500' : n.type === 'condition' ? 'bg-amber-500' : n.type === 'delay' ? 'bg-violet-500' : 'bg-gray-400'
                    return (
                      <div key={n.id} className="flex items-center shrink-0">
                        <div className={`px-2 py-1 rounded-lg text-[9px] font-bold text-white ${typeColor} whitespace-nowrap`}>
                          {n.label || n.subtype}
                        </div>
                        {i < (f.nodes || []).length - 1 && <ChevronRight size={10} className="text-gray-300 mx-0.5" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   FLOW EDITOR — Node-based visual editor
   ══════════════════════════════════════════════ */
function FlowEditor({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [name, setName] = useState(flow.name)
  const [nodes, setNodes] = useState<FNode[]>(flow.nodes || [])
  const [connections, setConnections] = useState<FConn[]>(flow.connections || [])
  const [saving, setSaving] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [addAfter, setAddAfter] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/flows/${flow.id}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ name, nodes, connections }),
      })
    } catch {}
    setSaving(false)
  }

  function addNode(type: string, subtype: string, label: string) {
    const id = `${type}-${Date.now()}`
    const newNode: FNode = { id, type, subtype, label, data: {} }
    // Insert before end node
    const endIdx = nodes.findIndex(n => n.type === 'end')
    if (endIdx >= 0) {
      const updated = [...nodes]
      updated.splice(endIdx, 0, newNode)
      setNodes(updated)
      // Rewire: previous → new → end
      const endNode = nodes[endIdx]
      const incomingConn = connections.find(c => c.to === endNode.id)
      if (incomingConn) {
        const newConns = connections.filter(c => c.id !== incomingConn.id)
        newConns.push({ id: `conn-${Date.now()}-a`, from: incomingConn.from, fromHandle: incomingConn.fromHandle, to: id })
        newConns.push({ id: `conn-${Date.now()}-b`, from: id, fromHandle: type === 'condition' ? 'yes' : 'main', to: endNode.id })
        setConnections(newConns)
      }
    } else {
      setNodes([...nodes, newNode])
    }
    setShowAddNode(false)
  }

  function removeNode(nodeId: string) {
    if (nodes.find(n => n.id === nodeId)?.type === 'trigger') return
    if (nodes.find(n => n.id === nodeId)?.type === 'end') return
    // Rewire connections around removed node
    const incoming = connections.filter(c => c.to === nodeId)
    const outgoing = connections.filter(c => c.from === nodeId)
    const newConns = connections.filter(c => c.from !== nodeId && c.to !== nodeId)
    if (incoming.length > 0 && outgoing.length > 0) {
      newConns.push({ id: `conn-${Date.now()}`, from: incoming[0].from, fromHandle: incoming[0].fromHandle, to: outgoing[0].to })
    }
    setNodes(nodes.filter(n => n.id !== nodeId))
    setConnections(newConns)
    setSelectedNode(null)
  }

  function updateNodeData(nodeId: string, key: string, value: any) {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n))
  }

  function updateNodeLabel(nodeId: string, label: string) {
    setNodes(nodes.map(n => n.id === nodeId ? { ...n, label } : n))
  }

  const selected = nodes.find(n => n.id === selectedNode)
  const typeColors: Record<string, string> = {
    trigger: 'bg-blue-600', action: 'bg-emerald-600',
    condition: 'bg-amber-600', delay: 'bg-gray-700',
    end: 'bg-gray-500',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-500" /></button>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="text-lg font-extrabold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddNode(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-bold hover:bg-violet-100 transition">
            <Plus size={13} /> Adicionar Node
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 transition">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
          </button>
        </div>
      </div>

      {/* Visual Pipeline */}
      <div className="bg-gray-950 rounded-2xl p-5 overflow-x-auto">
        <div className="flex items-start gap-0 min-w-fit">
          {nodes.map((node, i) => (
            <div key={node.id} className="flex items-center shrink-0">
              <button onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                className={`relative flex flex-col items-center p-3 rounded-xl min-w-[100px] transition-all ${
                  selectedNode === node.id ? 'ring-2 ring-white/40 scale-105' : 'hover:scale-105'
                }`}>
                <div className={`w-10 h-10 rounded-xl ${typeColors[node.type] || 'bg-gray-600'} grid place-items-center shadow-sm text-white`}>
                  {(() => { const Icon = NODE_ICON[node.type] || Square; return <Icon size={16} strokeWidth={1.75} /> })()}
                </div>
                <p className="text-[10px] font-bold text-white/80 mt-1.5 text-center max-w-[90px] truncate">{node.label}</p>
                <p className="text-[8px] text-white/30 mt-0.5">{node.subtype}</p>
              </button>
              {i < nodes.length - 1 && (
                <div className="flex items-center px-1">
                  <div className="w-8 h-0.5 bg-white/10" />
                  <ArrowRight size={10} className="text-white/20 -mx-0.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Node Detail Panel */}
      {selected && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${typeColors[selected.type]} grid place-items-center text-white`}>
                {(() => { const Icon = NODE_ICON[selected.type] || Square; return <Icon size={14} strokeWidth={1.75} /> })()}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{selected.type.charAt(0).toUpperCase() + selected.type.slice(1)}</p>
                <p className="text-[10px] text-gray-400">{selected.subtype}</p>
              </div>
            </div>
            {selected.type !== 'trigger' && selected.type !== 'end' && (
              <button onClick={() => removeNode(selected.id)} className="text-red-400 hover:text-red-600 transition p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Nome do node</label>
            <input type="text" value={selected.label} onChange={e => updateNodeLabel(selected.id, e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </div>

          {/* Type-specific config */}
          {selected.type === 'trigger' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Tipo de gatilho</label>
              <select value={selected.subtype} onChange={e => setNodes(nodes.map(n => n.id === selected.id ? { ...n, subtype: e.target.value } : n))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                {TRIGGER_TYPES.map(t => <option key={t.subtype} value={t.subtype}>{t.label} — {t.desc}</option>)}
              </select>
            </div>
          )}

          {selected.type === 'action' && selected.subtype === 'send_message' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Mensagem</label>
              <textarea value={selected.data.message || ''} onChange={e => updateNodeData(selected.id, 'message', e.target.value)} rows={3}
                placeholder="Ola {{system.customer.name}}, bem-vindo!"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none font-mono" />
              <p className="text-[9px] text-gray-400 mt-1">Use {'{{system.customer.name}}'} para variaveis</p>
            </div>
          )}

          {selected.type === 'action' && selected.subtype === 'ai_message' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Instrucao para IA</label>
              <textarea value={selected.data.ai_instruction || ''} onChange={e => updateNodeData(selected.id, 'ai_instruction', e.target.value)} rows={3}
                placeholder="Gere uma saudacao personalizada mencionando o segmento do lead..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
            </div>
          )}

          {selected.type === 'action' && selected.subtype === 'change_status' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Novo status</label>
              <select value={selected.data.new_status || ''} onChange={e => updateNodeData(selected.id, 'new_status', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                <option value="">Selecione...</option>
                {['new','contacted','replied','negotiating','converted','lost'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {selected.type === 'action' && selected.subtype === 'add_tag' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Tag</label>
              <input type="text" value={selected.data.tag || ''} onChange={e => updateNodeData(selected.id, 'tag', e.target.value)}
                placeholder="Ex: contatado, interessado" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
          )}

          {selected.type === 'action' && selected.subtype === 'webhook' && (
            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">URL</label>
                <input type="url" value={selected.data.url || ''} onChange={e => updateNodeData(selected.id, 'url', e.target.value)}
                  placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Metodo</label>
                <select value={selected.data.method || 'POST'} onChange={e => updateNodeData(selected.id, 'method', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                  <option value="POST">POST</option><option value="GET">GET</option>
                </select>
              </div>
            </div>
          )}

          {selected.type === 'delay' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Valor</label>
                <input type="number" min={1} value={selected.data.value || ''} onChange={e => updateNodeData(selected.id, 'value', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Unidade</label>
                <select value={selected.subtype} onChange={e => setNodes(nodes.map(n => n.id === selected.id ? { ...n, subtype: e.target.value } : n))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
                  <option value="wait_minutes">Minutos</option><option value="wait_hours">Horas</option><option value="wait_days">Dias</option>
                </select>
              </div>
            </div>
          )}

          {selected.type === 'condition' && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Valor de comparacao</label>
              <input type="text" value={selected.data.threshold || ''} onChange={e => updateNodeData(selected.id, 'threshold', e.target.value)}
                placeholder="Ex: 50 (score), tag_name, status..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            </div>
          )}
        </div>
      )}

      {/* Add Node Modal */}
      {showAddNode && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowAddNode(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-900">Adicionar Node</h3>
              <button onClick={() => setShowAddNode(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Acoes</p>
                <div className="grid grid-cols-2 gap-2">
                  {ACTION_TYPES.map(a => (
                    <button key={a.subtype} onClick={() => addNode('action', a.subtype, a.label)}
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition text-left">
                      <a.icon size={16} className="text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800">{a.label}</p>
                        <p className="text-[9px] text-gray-400">{a.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Condicoes</p>
                <div className="grid grid-cols-2 gap-2">
                  {CONDITION_TYPES.map(c => (
                    <button key={c.subtype} onClick={() => addNode('condition', c.subtype, c.label)}
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition text-left">
                      <c.icon size={16} className="text-amber-500 shrink-0" />
                      <p className="text-xs font-bold text-gray-800">{c.label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Temporizador</p>
                <button onClick={() => addNode('delay', 'wait_minutes', 'Aguardar')}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition w-full text-left">
                  <Clock size={16} className="text-violet-500" />
                  <div><p className="text-xs font-bold text-gray-800">Aguardar</p><p className="text-[9px] text-gray-400">Pausar execucao por X tempo</p></div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

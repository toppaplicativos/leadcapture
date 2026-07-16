import { useCallback, useEffect, useState } from 'react'
import { FlowListView } from '@/components/flows/FlowListView'
import { FlowEditor } from '@/components/flows/FlowEditor'
import type { Flow, FlowStatusFilter } from '@/lib/flows/types'
import { defaultJourneyNodes } from '@/lib/flows/catalog'
import * as api from '@/lib/flows/api'

export function FlowBuilderPage() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FlowStatusFilter>('all')
  const [editFlow, setEditFlow] = useState<Flow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.listFlows()
      setFlows(list)
    } catch {
      setFlows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createFlow() {
    if (creating) return
    setCreating(true)
    try {
      const { nodes, connections } = defaultJourneyNodes()
      const flow = await api.createFlow({
        name: 'Jornada de atendimento',
        status: 'draft',
        nodes,
        connections,
      })
      setEditFlow(flow)
      await load()
    } catch {
      /* silent — user can retry */
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(flow: Flow) {
    setBusyId(flow.id)
    const next = flow.status === 'active' ? 'paused' : 'active'
    try {
      await api.updateFlow(flow.id, { status: next })
      await load()
    } catch {
      /* ignore */
    } finally {
      setBusyId(null)
    }
  }

  async function deleteFlow(id: string) {
    if (!window.confirm('Excluir este fluxo? Execuções históricas permanecem no banco.')) return
    try {
      await api.deleteFlow(id)
      if (editFlow?.id === id) setEditFlow(null)
      await load()
    } catch {
      /* ignore */
    }
  }

  async function duplicateFlow(flow: Flow) {
    try {
      await api.createFlow({
        name: `${flow.name} (cópia)`,
        status: 'draft',
        nodes: flow.nodes,
        connections: flow.connections,
        description: flow.description,
      })
      await load()
    } catch {
      /* ignore */
    }
  }

  if (editFlow) {
    return (
      <FlowEditor
        flow={editFlow}
        onClose={() => {
          setEditFlow(null)
          void load()
        }}
        onUpdated={(f) => {
          setEditFlow(f)
          setFlows((prev) => prev.map((x) => (x.id === f.id ? f : x)))
        }}
      />
    )
  }

  return (
    <FlowListView
      flows={flows}
      loading={loading || creating}
      filter={filter}
      busyId={busyId}
      onFilter={setFilter}
      onCreate={() => void createFlow()}
      onOpen={setEditFlow}
      onToggle={(f) => void toggleStatus(f)}
      onDuplicate={(f) => void duplicateFlow(f)}
      onDelete={(id) => void deleteFlow(id)}
    />
  )
}

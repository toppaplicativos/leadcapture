export type FlowSummary = {
  id: string
  name: string
  status: string
  triggerSubtype?: string
  nodeCount?: number
  updatedAt?: string
}

export function getAutomationHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export async function fetchAutomationsSnapshot() {
  const headers = getAutomationHeaders()
  try {
    const defsRes = await fetch('/api/automation-defs/kpis', { headers })
    if (defsRes.ok) {
      const defsData = await defsRes.json()
      const k = defsData.kpis || {}
      const flowsRes = await fetch('/api/flows', { headers })
      const flowsData = flowsRes.ok ? await flowsRes.json() : { flows: [] }
      const flows = flowsData.flows || []
      return {
        total: (k.total || 0) + flows.length,
        reactive: flows.filter((f: any) => f.triggerSubtype === 'message_received').length,
        proactive: flows.filter((f: any) => f.triggerSubtype !== 'message_received').length,
        flows: flows.slice(0, 5).map((f: any) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          triggerSubtype: f.triggerSubtype,
        })),
        definitions: {
          total: k.total || 0,
          live: k.live || 0,
          agendadas: k.agendadas || 0,
          eventos: k.eventos || 0,
        },
      }
    }
  } catch {
    /* fallback to flows only */
  }

  const res = await fetch('/api/flows', { headers: getAutomationHeaders() })
  const data = await res.json().catch(() => ({ flows: [] }))
  const flows: FlowSummary[] = (data.flows || []).map((f: any) => {
    const nodes = f.nodes || []
    const trigger = nodes.find((n: any) => n.type === 'trigger')
    return {
      id: f.id,
      name: f.name,
      status: f.status,
      triggerSubtype: trigger?.subtype || '',
      nodeCount: nodes.length,
      updatedAt: f.updated_at,
    }
  })
  let reactive = 0
  let proactive = 0
  for (const f of flows) {
    if (f.triggerSubtype === 'message_received') reactive++
    else proactive++
  }
  return { flows, reactive, proactive, total: flows.length }
}
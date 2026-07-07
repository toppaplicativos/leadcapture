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
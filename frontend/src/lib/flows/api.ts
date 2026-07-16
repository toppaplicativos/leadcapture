import type { Flow, FlowExecution, FlowSession } from './types'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
  return data
}

export async function listFlows(): Promise<Flow[]> {
  const d = await parseJson(await fetch('/api/flows', { headers: getHeaders() }))
  return d.flows || []
}

export async function createFlow(body: Partial<Flow> & { name?: string; nodes?: unknown; connections?: unknown }): Promise<Flow> {
  const d = await parseJson(
    await fetch('/api/flows', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }),
  )
  return d.flow
}

export async function updateFlow(id: string, body: Record<string, unknown>): Promise<Flow> {
  const d = await parseJson(
    await fetch(`/api/flows/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }),
  )
  return d.flow
}

export async function deleteFlow(id: string): Promise<void> {
  await parseJson(await fetch(`/api/flows/${id}`, { method: 'DELETE', headers: getHeaders() }))
}

export async function publishFlow(id: string, activate = true): Promise<{ flow: Flow; published_version: number }> {
  const d = await parseJson(
    await fetch(`/api/flows/${id}/publish`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ activate }),
    }),
  )
  return { flow: d.flow, published_version: d.published_version }
}

export async function simulateFlow(id: string): Promise<{ steps: Array<{ node_id: string; label: string; type: string; subtype: string }> }> {
  const d = await parseJson(
    await fetch(`/api/flows/${id}/simulate`, {
      method: 'POST',
      headers: getHeaders(),
      body: '{}',
    }),
  )
  return { steps: d.steps || [] }
}

export async function listExecutions(flowId: string, limit = 20): Promise<FlowExecution[]> {
  const d = await parseJson(
    await fetch(`/api/flows/${flowId}/executions?limit=${limit}`, { headers: getHeaders() }),
  )
  return d.executions || []
}

export async function listSessions(flowId: string, limit = 20): Promise<FlowSession[]> {
  const d = await parseJson(
    await fetch(`/api/flows/${flowId}/sessions?limit=${limit}`, { headers: getHeaders() }),
  )
  return d.sessions || []
}

export async function startFlow(
  flowId: string,
  body: { phone?: string; message?: string; name?: string } = {},
): Promise<{ execution_id: string }> {
  const d = await parseJson(
    await fetch(`/api/flows/${flowId}/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }),
  )
  return { execution_id: d.execution_id }
}

export async function fetchFlowMetrics(flowId: string): Promise<{
  sample_size: number
  by_status: Record<string, number>
  completed: number
  waiting: number
  failed: number
  phase_visits: Record<string, number>
  phases: Array<{ id: string; name: string }>
}> {
  const d = await parseJson(
    await fetch(`/api/flows/${flowId}/metrics`, { headers: getHeaders() }),
  )
  return d.metrics
}

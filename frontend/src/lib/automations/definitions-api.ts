import type { Automacao, AutomacaoInput, AutomationKpis } from './schema'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export async function fetchAutomationDefinitions(): Promise<Automacao[]> {
  const r = await fetch('/api/automation-defs', { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.automacoes || []
}

export async function fetchAutomationKpis(): Promise<AutomationKpis> {
  const r = await fetch('/api/automation-defs/kpis', { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.kpis
}

export async function createAutomationDefinition(input: AutomacaoInput): Promise<Automacao> {
  const r = await fetch('/api/automation-defs', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(input),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.automacao
}

export async function updateAutomationDefinition(
  id: string,
  patch: Partial<AutomacaoInput> & { clearError?: boolean },
): Promise<Automacao> {
  const r = await fetch(`/api/automation-defs/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(patch),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.automacao
}

export async function deleteAutomationDefinition(id: string): Promise<void> {
  const r = await fetch(`/api/automation-defs/${id}`, { method: 'DELETE', headers: getHeaders() })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d?.error || `Erro ${r.status}`)
  }
}

export async function toggleAutomationDefinition(id: string, ativa: boolean): Promise<Automacao> {
  const r = await fetch(`/api/automation-defs/${id}/toggle`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ativa }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.automacao
}

export async function duplicateAutomationDefinition(id: string): Promise<Automacao> {
  const r = await fetch(`/api/automation-defs/${id}/duplicate`, {
    method: 'POST',
    headers: getHeaders(),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.automacao
}

export async function executeAutomationDefinition(id: string) {
  const r = await fetch(`/api/automation-defs/${id}/execute`, {
    method: 'POST',
    headers: getHeaders(),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.result
}

export async function fetchAutomationRuns(id: string) {
  const r = await fetch(`/api/automation-defs/${id}/runs`, { headers: getHeaders() })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
  return d.runs || []
}
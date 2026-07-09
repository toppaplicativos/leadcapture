const API = '/api/instagram'

export function getInstagramHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h.Authorization = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export async function instagramApi(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...getInstagramHeaders(), ...(opts?.headers || {}) },
  })
  return res.json()
}

export function fmtIgMetric(n: number | undefined | null) {
  const v = Number(n || 0)
  return v.toLocaleString('pt-BR')
}
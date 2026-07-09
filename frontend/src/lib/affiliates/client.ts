import { getHeaders } from '@/lib/admin/helpers'

export type AffiliateSnapshot = {
  enabled: boolean
  commissionPct: number
  affiliatesTotal: number
  affiliatesPending: number
  affiliatesActive: number
  totalClicks: number
  totalSales: number
  commissionPending: number
  commissionApproved: number
  payoutsRequested: number
  commissionsPendingCount: number
  materialsCount: number
  topAffiliates: Array<{
    id: string
    name: string
    code: string
    status: string
    clicks: number
    sales: number
    commission: number
  }>
}

export async function fetchAffiliatesSnapshot(): Promise<AffiliateSnapshot> {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const headers = getHeaders()
  if (brandId && !headers['x-brand-id']) headers['x-brand-id'] = brandId

  const res = await fetch(`/api/affiliates/stats?brand_id=${encodeURIComponent(brandId)}`, { headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Falha ao carregar afiliados')

  const s = data.stats || {}
  const program = s.program || {}
  return {
    enabled: !!program.is_enabled,
    commissionPct: Number(program.default_commission_pct || 10),
    affiliatesTotal: Number(s.affiliates_total || 0),
    affiliatesPending: Number(s.affiliates_pending || 0),
    affiliatesActive: Number(s.affiliates_active || 0),
    totalClicks: Number(s.total_clicks || 0),
    totalSales: Number(s.total_sales || 0),
    commissionPending: Number(s.commission_pending || 0),
    commissionApproved: Number(s.commission_approved || 0),
    payoutsRequested: Number(s.payouts_requested || 0),
    commissionsPendingCount: Number(s.commissions_pending_count || 0),
    materialsCount: Number(s.materials_count || 0),
    topAffiliates: (s.top_affiliates || []).map((a: any) => ({
      id: String(a.id),
      name: String(a.display_name || 'Afiliado'),
      code: String(a.code || ''),
      status: String(a.status || ''),
      clicks: Number(a.total_clicks || 0),
      sales: Number(a.total_sales || 0),
      commission: Number(a.total_commission || 0),
    })),
  }
}
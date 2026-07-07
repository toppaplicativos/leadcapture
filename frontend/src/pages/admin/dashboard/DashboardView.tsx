import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, RefreshCw, LogOut, Menu, X, Loader2,
  Plus, Phone, Mail, Clock, ArrowRight, BarChart3, Zap, Eye,
  ChevronLeft, ChevronRight, Send, Pause, Ban, Bot, Bell, Trash2,
  Wand2, Truck, Globe, Settings, Volume2, FileText, Link2, Receipt, Sparkles,
  CreditCard, QrCode, Banknote, User, BadgeCheck, Headphones, Brain,
  Boxes, Store, Laptop, CheckCircle2, Copy, Info, AlertTriangle, Star,
  Camera, Ticket, Percent, MessageSquareQuote, ThumbsUp, ThumbsDown, Film, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { adminApi, inventoryApi } from '@/lib/api-admin'
import { useConfirm } from '@/components/ConfirmModal'
import { AICampaignWizardModal } from '@/components/AICampaignWizardModal'
import { BrandSkillsPage } from '@/pages/BrandSkillsPage'
import { WhatsAppHealthBanner } from '@/components/WhatsAppHealthBanner'
import {
  getHeaders, clearAdminAuth, money, num, dt, dtFull,
  toBrandSlug, pickStockBrandSlug, buildStockAppUrl,
} from '@/lib/admin/helpers'
import type { ShowToast } from '@/lib/admin/types'
import { Skeleton, KpiCard, EmptyState } from '@/components/admin/primitives'
import { useDashboardBridgeOptional } from '@/lib/agent/DashboardBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

export function DashboardView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const dashboardBridge = useDashboardBridgeOptional()
  const isDesktop = useIsDesktop()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      inventoryApi.overview().catch(() => ({})),
      adminApi.clients(1, 1).catch(() => ({ total: 0 })),
      adminApi.campaigns().catch(() => ({ campaigns: [] })),
      adminApi.orders(1, 1).catch(() => ({ total: 0 })),
    ]).then(([inv, clients, campaigns, orders]) => {
      setData({
        products: inv?.total_products || 0,
        totalStock: inv?.total_units || 0,
        outOfStock: inv?.out_of_stock || 0,
        totalLeads: clients?.total || clients?.customers?.length || 0,
        activeCampaigns: (campaigns?.campaigns || []).filter((c: any) => c.status === 'active' || c.status === 'running').length,
        totalCampaigns: (campaigns?.campaigns || []).length,
        totalOrders: orders?.total || orders?.orders?.length || 0,
      })
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!dashboardBridge?.publishSnapshot || !isDesktop || loading) return
    dashboardBridge.publishSnapshot({
      leads: Number(data?.totalLeads || 0),
      campaigns: Number(data?.totalCampaigns || 0),
      orders: Number(data?.totalOrders || 0),
      products: Number(data?.products || 0),
      campaignsActive: Number(data?.activeCampaigns || 0),
      subtitle: data?.activeCampaigns > 0 ? `${data.activeCampaigns} campanha(s) ativa(s)` : '',
      items: [
        { label: 'Leads', value: Number(data?.totalLeads || 0), icon: 'users' },
        { label: 'Campanhas', value: Number(data?.totalCampaigns || 0), icon: 'megaphone' },
        { label: 'Pedidos', value: Number(data?.totalOrders || 0), icon: 'cart' },
        { label: 'Produtos', value: Number(data?.products || 0), icon: 'package' },
      ],
      loading: false,
    })
  }, [dashboardBridge, isDesktop, loading, data])

  if (loading) return <Skeleton rows={6} />

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-[26px] font-bold tracking-tight text-gray-900">Painel</h2>
        <p className="text-[13px] text-gray-500 mt-0.5">Visão geral do seu negócio</p>
      </header>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {([
          { label: 'Leads', value: num(data?.totalLeads), Icon: Users },
          { label: 'Campanhas', value: num(data?.totalCampaigns), Icon: Megaphone },
          { label: 'Pedidos', value: num(data?.totalOrders), Icon: ShoppingCart },
          { label: 'Produtos', value: num(data?.products), Icon: Package },
        ] as { label: string; value: string; Icon: LucideIcon }[]).map(k => (
          <div key={k.label} className="bg-white border border-border-light rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{k.label}</span>
              <span className="w-8 h-8 rounded-xl bg-gray-100 grid place-items-center text-gray-500">
                <k.Icon size={15} strokeWidth={1.75} />
              </span>
            </div>
            <p className="text-[26px] font-bold tracking-tight tabular-nums text-gray-900 leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {/* KPIs secundários */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-gray-900 text-white rounded-2xl p-4">
          <BarChart3 size={16} strokeWidth={1.75} className="text-white/50" />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.totalStock)}</p>
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wide mt-1.5">Unidades em estoque</p>
        </div>
        <div className="bg-emerald-600 text-white rounded-2xl p-4">
          <Send size={16} strokeWidth={1.75} className="text-white/60" />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.activeCampaigns)}</p>
          <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide mt-1.5">Campanhas ativas</p>
        </div>
        <div className={`rounded-2xl p-4 ${Number(data?.outOfStock) > 0 ? 'bg-red-600 text-white' : 'bg-white border border-border-light text-gray-900'}`}>
          <Zap size={16} strokeWidth={1.75} className={Number(data?.outOfStock) > 0 ? 'text-white/60' : 'text-gray-400'} />
          <p className="text-[24px] font-semibold tracking-tight tabular-nums mt-2 leading-none">{num(data?.outOfStock)}</p>
          <p className={`text-[10px] font-semibold uppercase tracking-wide mt-1.5 ${Number(data?.outOfStock) > 0 ? 'text-white/60' : 'text-gray-400'}`}>Sem estoque</p>
        </div>
      </div>

      {/* Quick actions */}
      <section>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Acesso rápido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {([
            { Icon: Search, label: 'Buscar leads', path: '/busca' },
            { Icon: Megaphone, label: 'Campanhas', path: '/campanhas' },
            { Icon: ShoppingCart, label: 'Pedidos', path: '/pedidos' },
            { Icon: Receipt, label: 'Tirar pedido', path: '/tirar-pedido' },
            { Icon: Package, label: 'Estoque', path: '/estoque' },
          ] as { Icon: LucideIcon; label: string; path: string }[]).map(a => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-border-light hover:border-gray-300 active:scale-[0.98] transition text-left"
            >
              <span className="w-9 h-9 rounded-xl bg-gray-100 grid place-items-center text-gray-700 shrink-0">
                <a.Icon size={15} strokeWidth={1.75} />
              </span>
              <span className="text-[13px] font-medium text-gray-900 truncate">{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LEADS VIEW
   ══════════════════════════════════════════════ */
function LeadsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    adminApi.clients(page, 30, search).then(d => {
      setClients(d.clients || d.items || (Array.isArray(d) ? d : []))
      setTotal(d.total || 0)
      setLoading(false)
    }).catch(e => { showToast(e.message, 'err'); setLoading(false) })
  }, [page, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[20px] font-bold tracking-tight text-gray-900">Leads / Clientes</h2>
        <span className="text-xs text-muted">{total} registros</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900" />
      </div>

      {loading ? <Skeleton rows={6} /> : clients.length === 0 ? (
        <EmptyState icon={Users} text="Nenhum lead encontrado" />
      ) : (
        <>
          {/* Table */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Nome</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase hidden sm:table-cell">Telefone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-muted uppercase">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any, i: number) => (
                    <tr key={c.id || i} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">{c.name || c.client_name || '—'}</p>
                        <p className="text-xs text-muted sm:hidden">{c.phone || c.whatsapp || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                        {c.phone || c.whatsapp || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell truncate max-w-[180px]">
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {dt(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {total > 30 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-muted px-3">Pagina {page}</span>
              <button disabled={clients.length < 30} onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-lg bg-white border border-border disabled:opacity-40 hover:bg-gray-50 transition">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   CLIENTES VIEW (real customers — orders + manual)
   ══════════════════════════════════════════════ */

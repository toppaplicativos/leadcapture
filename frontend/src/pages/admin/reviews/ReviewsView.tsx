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
import type { ReviewRow } from '@/pages/admin/row-types'

export function ReviewsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [productsById, setProductsById] = useState<Record<string, any>>({})
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [acting, setActing] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch(`/api/reviews?status=${filter}&limit=200`, { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        setReviews(d.reviews || [])
        setPendingCount(Number(d.pending_count || 0))
        setLoading(false)
      })
      .catch(() => { showToast('Erro ao carregar avaliações', 'err'); setLoading(false) })
  }
  useEffect(() => { load() }, [filter])

  /* Lookup product names so cards aren't opaque IDs */
  useEffect(() => {
    fetch('/api/products', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        const map: Record<string, any> = {}
        ;(d.products || []).forEach((p: any) => { map[String(p.id)] = p })
        setProductsById(map)
      }).catch(() => {})
  }, [])

  async function moderate(id: string, status: 'approved' | 'rejected') {
    setActing(id)
    try {
      const r = await fetch(`/api/reviews/${id}`, {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ status }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status}`)
      showToast(status === 'approved' ? 'Avaliação aprovada' : 'Avaliação rejeitada')
      load()
    } catch (e: any) {
      showToast(e.message || 'Erro ao moderar', 'err')
    } finally {
      setActing(null)
    }
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
          <Star key={n} size={12} strokeWidth={2}
            className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <MessageSquareQuote size={18} className="text-violet-600" strokeWidth={2.5} /> Avaliações
          </h2>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Modere as avaliações enviadas pelos clientes. Só aparecem no catálogo após aprovação.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={2.5} /> {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : f === 'rejected' ? 'Rejeitadas' : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 size={20} className="animate-spin inline mr-2" /> Carregando…
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-2xl">
          <MessageSquareQuote size={32} className="mx-auto text-gray-300 mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-semibold text-gray-700 mb-1">
            {filter === 'pending' ? 'Nenhuma avaliação pendente' : 'Nenhuma avaliação encontrada'}
          </p>
          <p className="text-[12px] text-gray-400">
            {filter === 'pending'
              ? 'Clientes podem deixar avaliações na página do produto. Você decide o que aparece no catálogo.'
              : 'Mude o filtro para ver outros status.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(rv => {
            const product = productsById[rv.product_id]
            return (
              <div key={rv.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {renderStars(rv.rating)}
                      <span className="text-[11px] text-gray-400">{dtFull(rv.created_at)}</span>
                      {rv.verified_purchase && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5">
                          <BadgeCheck size={10} strokeWidth={2.5} /> Verificada
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] font-semibold text-gray-900">{rv.customer_name}</p>
                    {product && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Sobre: <span className="font-medium text-gray-700">{product.name}</span>
                      </p>
                    )}
                  </div>
                  {rv.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => moderate(rv.id, 'approved')} disabled={acting === rv.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                        <ThumbsUp size={12} strokeWidth={2.5} /> Aprovar
                      </button>
                      <button onClick={() => moderate(rv.id, 'rejected')} disabled={acting === rv.id}
                        className="px-3 py-1.5 rounded-lg text-red-600 text-[11px] font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
                        <ThumbsDown size={12} strokeWidth={2.5} /> Rejeitar
                      </button>
                    </div>
                  )}
                  {rv.status === 'approved' && (
                    <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">Aprovada</span>
                  )}
                  {rv.status === 'rejected' && (
                    <button onClick={() => moderate(rv.id, 'approved')}
                      className="px-3 py-1.5 rounded-lg text-gray-500 text-[11px] font-bold hover:bg-gray-100">
                      Reabrir
                    </button>
                  )}
                </div>
                {rv.comment && (
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap pl-1 border-l-2 border-gray-100 pl-3">
                    "{rv.comment}"
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

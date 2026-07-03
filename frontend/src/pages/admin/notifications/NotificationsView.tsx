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

export function NotificationsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/notifications', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setNotifications(d.notifications || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={4} />

  const priorityIcon = (p: string) => {
    if (p === 'high' || p === 'urgent') return 'bg-red-50 text-red-500'
    if (p === 'medium') return 'bg-amber-50 text-amber-500'
    return 'bg-blue-50 text-blue-500'
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Notificacoes</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{notifications.length} notificacoes</p>
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} text="Nenhuma notificacao" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any, i: number) => (
            <div key={n.notification_id || i} className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-4 flex items-start gap-3 ${n.read ? 'border-gray-100' : 'border-blue-200 bg-blue-50/30'}`}>
              <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${priorityIcon(n.priority)}`}>
                <Bell size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{dtFull(n.created_at)}</p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DOMAIN VIEW (Custom Domains)
   ══════════════════════════════════════════════ */

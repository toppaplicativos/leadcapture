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

export function MessagesView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sessions', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setSessions(d.sessions || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton rows={5} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Mensagens</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{sessions.length} conversas</p>
      </div>
      {sessions.length === 0 ? (
        <EmptyState icon={MessageSquare} text="Nenhuma conversa ativa no momento" />
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any, i: number) => (
            <div key={s.id || i} className="bg-white rounded-2xl border border-border-light p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-900 grid place-items-center text-white font-bold text-sm shrink-0">
                {(s.contact_name || s.phone || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{s.contact_name || s.phone || 'Contato'}</p>
                <p className="text-xs text-gray-400 truncate">{s.last_message || 'Sem mensagens'}</p>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">{dtFull(s.updated_at || s.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

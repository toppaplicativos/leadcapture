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
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export function NotificationsView({ showToast: _showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [tab, setTab] = useState<'inbox' | 'push'>('inbox')

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`h-8 px-4 rounded-lg text-[12px] font-semibold transition ${
            tab === 'inbox' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
          }`}
        >
          Central in-app
        </button>
        <button
          type="button"
          onClick={() => setTab('push')}
          className={`h-8 px-4 rounded-lg text-[12px] font-semibold transition ${
            tab === 'push' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
          }`}
        >
          Push nativo
        </button>
      </div>

      {tab === 'push' && <PushNotificationSettings />}

      {tab === 'inbox' && (
        <NotificationCenter getHeaders={getHeaders} appContext="admin" />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   DOMAIN VIEW (Custom Domains)
   ══════════════════════════════════════════════ */

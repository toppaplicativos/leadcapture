/**
 * Splits AdminDashboard.tsx into domain modules under frontend/src/pages/admin/
 * Run: node scripts/split-admin-dashboard.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const srcPath = path.join(root, 'frontend/src/pages/AdminDashboard.tsx')
const outDir = path.join(root, 'frontend/src/pages/admin')

const src = fs.readFileSync(srcPath, 'utf8')
const lines = src.split('\n')

const HEADER = `import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
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

`

const chunks = [
  { file: 'dashboard/DashboardView.tsx', start: 609, end: 807 },
  { file: 'campaigns/CampaignsView.tsx', start: 972, end: 2657 },
  { file: 'orders/OrdersView.tsx', start: 2658, end: 3193 },
  { file: 'automations/AutomationsView.tsx', start: 3194, end: 3320 },
  { file: 'products/ProductsView.tsx', start: 3321, end: 5268 },
  { file: 'messages/MessagesView.tsx', start: 5269, end: 5367 },
  { file: 'agent/AgentView.tsx', start: 5368, end: 5924 },
  { file: 'notifications/NotificationsView.tsx', start: 5925, end: 5977 },
  { file: 'domain/DomainView.tsx', start: 5978, end: 6413 },
  { file: 'estoque/EstoqueAccessView.tsx', start: 6414, end: 6677 },
  { file: 'coupons/CouponsView.tsx', start: 6678, end: 7030 },
  { file: 'reviews/ReviewsView.tsx', start: 7031, end: 7433 },
  { file: 'whatsapp/WhatsAppManagerView.tsx', start: 7434, end: 7778 },
  { file: 'payments/PaymentConfigView.tsx', start: 7779, end: 7925 },
  { file: 'frete/FreteView.tsx', start: 7926, end: 8112 },
  { file: 'settings/SettingsView.tsx', start: 8113, end: 8622 },
]

fs.mkdirSync(outDir, { recursive: true })

for (const { file, start, end } of chunks) {
  const body = lines.slice(start - 1, end).join('\n')
  const dir = path.dirname(path.join(outDir, file))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(outDir, file), HEADER + body + '\n', 'utf8')
  console.log(`Wrote ${file} (${end - start + 1} lines)`)
}

console.log('Done.')
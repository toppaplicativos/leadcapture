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

export function AutomationsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [rules, setRules] = useState<any[]>([])
  const [funnelStatuses, setFunnelStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function loadData() {
    setLoading(true)
    fetch('/api/automations', { headers: getHeaders() })
      .then(r => r.json()).then(d => {
        setRules(d.rules || [])
        setFunnelStatuses(d.funnel_statuses || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }
  useEffect(() => { loadData() }, [])

  async function toggleRule(ruleId: string, currentActive: boolean) {
    setToggling(ruleId)
    try {
      await adminApi.updateAutomationRule(ruleId, { is_active: !currentActive })
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: !currentActive } : r))
      showToast(!currentActive ? 'Automacao ativada!' : 'Automacao desativada')
    } catch (e: any) { showToast(e.message, 'err') }
    setToggling(null)
  }

  if (loading) return <Skeleton rows={4} />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Automacoes</h2>
        <p className="text-[13px] text-gray-400 mt-0.5">{rules.length} regras configuradas</p>
      </div>

      {/* Funnel */}
      {funnelStatuses.length > 0 && (
        <div className="bg-white rounded-2xl border border-border-light p-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Funil de Conversao</h3>
          <div className="flex flex-wrap gap-1">
            {funnelStatuses.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-2.5 py-1.5 bg-gray-100 text-gray-700 text-[11px] font-semibold rounded-lg border border-gray-200">{s}</span>
                {i < funnelStatuses.length - 1 && <span className="text-gray-300 text-sm">›</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length === 0 ? (
        <EmptyState icon={Zap} text="Nenhuma automacao configurada" />
      ) : (
        <div className="space-y-2.5">
          {rules.map((r: any) => {
            const isExpanded = expanded === r.id
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-border-light overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <h4 className="font-bold text-sm text-gray-900">{r.name || r.code}</h4>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-1">{r.trigger || ''}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleRule(r.id, r.is_active) }}
                    disabled={toggling === r.id}
                    className={`relative w-11 h-6 rounded-full transition shrink-0 ${r.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${r.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-100">
                    {r.trigger && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Gatilho</p>
                        <p className="text-xs text-gray-600">{r.trigger}</p>
                      </div>
                    )}
                    {r.status_from && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Fluxo:</span>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{r.status_from}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{r.status_to}</span>
                      </div>
                    )}
                    {r.timing_steps && r.timing_steps.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Etapas</p>
                        <div className="space-y-1">
                          {r.timing_steps.map((s: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="w-5 h-5 rounded-full bg-gray-100 grid place-items-center text-[9px] font-bold text-gray-500 shrink-0">{i + 1}</span>
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.tags.slice(0, 10).map((t: string, i: number) => (
                          <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t}</span>
                        ))}
                        {r.tags.length > 10 && <span className="text-[9px] text-gray-400">+{r.tags.length - 10} mais</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   PRODUCTS VIEW
   ══════════════════════════════════════════════ */

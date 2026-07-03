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

export function CampaignsView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'active' | 'draft' | 'done'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCampaign, setEditCampaign] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [creatingRuler, setCreatingRuler] = useState(false)
  /* Wizard de IA - 7 skills SSE que montam campanha do zero a partir de prompt */
  const [aiWizardOpen, setAiWizardOpen] = useState(false)
  const { confirm } = useConfirm()

  function loadCampaigns(silent = false) {
    if (!silent) setLoading(true)
    adminApi.campaigns().then(d => {
      setCampaigns(d.campaigns || d.items || (Array.isArray(d) ? d : []))
      if (!silent) setLoading(false)
    }).catch(e => { if (!silent) { showToast(e.message, 'err'); setLoading(false) } })
  }
  useEffect(() => { loadCampaigns() }, [])

  useEffect(() => {
    const hasRunning = campaigns.some(c => ['active', 'running', 'sending'].includes(c.status))
    if (!hasRunning) return
    const iv = setInterval(() => loadCampaigns(true), 5000)
    return () => clearInterval(iv)
  }, [campaigns])

  useEffect(() => {
    if (!editCampaign || !modalOpen) return
    const fresh = campaigns.find(c => c.id === editCampaign.id)
    if (fresh && (
      fresh.sent_count !== editCampaign.sent_count ||
      fresh.replied_count !== editCampaign.replied_count ||
      fresh.delivered_count !== editCampaign.delivered_count ||
      fresh.read_count !== editCampaign.read_count ||
      fresh.failed_count !== editCampaign.failed_count ||
      fresh.status !== editCampaign.status
    )) {
      setEditCampaign(fresh)
    }
  }, [campaigns, editCampaign?.id, modalOpen])

  function openCreate() { setEditCampaign(null); setModalOpen(true) }
  function openEdit(c: any) { setEditCampaign(c); setModalOpen(true) }

  async function createFollowupRuler() {
    const ok = await confirm({
      title: 'Gerar regua completa de Follow-up?',
      message: (
        <div className="space-y-2.5">
          <p>A IA vai criar <b>8 campanhas</b> em sequencia (FU0 a FU7) ja adaptadas ao tom do agente, produto e prova social do brand ativo:</p>
          <ul className="text-[12px] text-gray-500 leading-relaxed pl-3 space-y-0.5">
            <li>· FU0 - Abertura (D+0)</li>
            <li>· FU1 - Check-in (D+2)</li>
            <li>· FU2 - Consciencia (D+5)</li>
            <li>· FU3 - Prova Social (D+8)</li>
            <li>· FU4 - Educacao (D+12)</li>
            <li>· FU5 - Caso Real (D+16)</li>
            <li>· FU6 - Valor Puro (D+20)</li>
            <li>· FU7 - Break-up (D+25)</li>
          </ul>
          <p className="text-[12px] text-gray-500">As campanhas sao criadas em <b>rascunho</b> para voce revisar e ativar manualmente. Pode levar alguns segundos.</p>
        </div>
      ),
      confirmLabel: 'Gerar regua',
      cancelLabel: 'Cancelar',
      variant: 'info',
    })
    if (!ok) return
    setCreatingRuler(true)
    try {
      // Fetch direto para capturar a `hint` do backend caso erre
      const token = localStorage.getItem('lead-system-token')
      const brandId = localStorage.getItem('lead-system:active-brand-id')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (brandId) headers['x-brand-id'] = brandId
      const res = await fetch('/api/campaigns-v2/followup-ruler', { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = [data?.error, data?.hint].filter(Boolean).join(' — ') || `Erro ${res.status}`
        showToast(msg, 'err')
      } else if ((data?.created?.length || 0) > 0) {
        showToast(`Regua criada — ${data.created.length} campanhas em rascunho.`)
      } else if ((data?.skipped?.length || 0) > 0) {
        showToast('Regua ja existe para este brand.', 'err')
      } else {
        showToast(data?.message || 'Operacao concluida.')
      }
      loadCampaigns()
    } catch (e: any) {
      showToast(e.message || 'Falha ao gerar regua de follow-up', 'err')
    }
    setCreatingRuler(false)
  }

  async function doAction(id: string, action: 'start' | 'pause' | 'cancel' | 'delete') {
    setActionLoading(id)
    try {
      if (action === 'start') await adminApi.startCampaign(id)
      else if (action === 'pause') await adminApi.pauseCampaign(id)
      else if (action === 'cancel') await adminApi.cancelCampaign(id)
      else if (action === 'delete') await adminApi.deleteCampaign(id)
      showToast(action === 'delete' ? 'Campanha removida' : `Campanha ${action === 'start' ? 'iniciada' : action === 'pause' ? 'pausada' : 'cancelada'}!`)
      loadCampaigns()
    } catch (e: any) { showToast(e.message, 'err') }
    setActionLoading(null)
  }

  const filtered = tab === 'all' ? campaigns
    : tab === 'active' ? campaigns.filter(c => ['active', 'running', 'sending'].includes(c.status))
    : tab === 'draft' ? campaigns.filter(c => ['draft', 'paused'].includes(c.status))
    : campaigns.filter(c => ['completed', 'cancelled', 'finished'].includes(c.status))

  const statusBadge = (s?: string) => {
    const m: Record<string, { label: string; cls: string }> = {
      active: { label: 'Ativa', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
      running: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      sending: { label: 'Enviando', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
      draft: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
      paused: { label: 'Pausada', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
      completed: { label: 'Concluida', cls: 'bg-emerald-50 text-emerald-700' },
      finished: { label: 'Finalizada', cls: 'bg-gray-100 text-gray-500' },
      cancelled: { label: 'Cancelada', cls: 'bg-red-50 text-red-600' },
    }
    const cfg = m[(s || '').toLowerCase()] || { label: s || '?', cls: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Campanhas</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">{campaigns.length} campanhas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* NOVO: Wizard de IA - 7 skills SSE montam campanha do zero a partir de prompt */}
          <button onClick={() => setAiWizardOpen(true)}
            title="Descreva o objetivo em linguagem natural - a IA monta a campanha completa em rascunho"
            className="ai-shimmer relative overflow-hidden flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all">
            <Sparkles size={14} className="relative z-10" />
            <span className="relative z-10">Criar com IA</span>
          </button>
          <button onClick={createFollowupRuler} disabled={creatingRuler}
            title="Cria 8 follow-ups (FU0..FU7) adaptados ao tom do agente, produto e prova social do brand"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
            {creatingRuler ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {creatingRuler ? 'Gerando regua...' : 'Criar regua de Follow-up'}
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all">
            <Plus size={14} /> Nova Campanha
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl w-fit">
        {([['all', 'Todas'], ['active', 'Ativas'], ['draft', 'Rascunhos'], ['done', 'Finalizadas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
              tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{l}</button>
        ))}
      </div>

      {/* List */}
      {loading ? <Skeleton rows={4} /> : filtered.length === 0 ? (
        <EmptyState icon={Megaphone} text="Nenhuma campanha encontrada" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c: any) => {
            const pct = c.target_count > 0 ? Math.round(((c.sent_count || 0) / c.target_count) * 100) : 0
            const isRunning = ['active', 'running', 'sending'].includes(c.status)
            const canStart = ['draft', 'paused', 'scheduled'].includes(c.status)
            const isDone = ['completed', 'cancelled'].includes(c.status)
            const accentColor = isRunning ? 'bg-blue-500' : canStart ? 'bg-emerald-500' : isDone ? 'bg-gray-300' : 'bg-amber-400'
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all overflow-hidden flex flex-col">
                {/* Accent bar */}
                <div className={`h-1 w-full ${accentColor} ${isRunning ? 'animate-pulse' : ''}`} />

                <div className="p-3 flex-1 flex flex-col">
                  {/* Header row — title + badges + primary action */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-[13px] text-gray-900 truncate leading-tight">{c.name || 'Sem titulo'}</h4>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {statusBadge(c.status)}
                        {c.use_ai && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">IA</span>}
                        <span className="text-[9px] text-gray-400">· {dt(c.created_at)}</span>
                      </div>
                    </div>
                    {/* Primary action (compact) */}
                    <div className="shrink-0">
                      {canStart && (
                        <button onClick={() => doAction(c.id, 'start')} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Iniciar
                        </button>
                      )}
                      {isRunning && (
                        <button onClick={() => doAction(c.id, 'pause')} disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold hover:bg-amber-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <Pause size={10} />} Pausar
                        </button>
                      )}
                      {isDone && (
                        <button onClick={async () => { setActionLoading(c.id); try { await adminApi.reexecuteCampaign(c.id); showToast('Campanha reaberta!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                          disabled={actionLoading === c.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold hover:bg-blue-100 transition disabled:opacity-60">
                          {actionLoading === c.id ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Reabrir
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact stats: 3 KPIs inline — numbers animate via tabular-nums + transition */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-[12px] font-extrabold text-gray-900 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.target_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Leads</p>
                    </div>
                    <div className={`rounded-lg px-2 py-1.5 text-center transition-colors duration-700 ${isRunning ? 'bg-violet-50' : 'bg-gray-50'}`}>
                      <p className="text-[12px] font-extrabold text-violet-700 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.sent_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Enviados</p>
                    </div>
                    <div className={`rounded-lg px-2 py-1.5 text-center transition-colors duration-700 ${(c.replied_count || 0) > 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      <p className="text-[12px] font-extrabold text-emerald-600 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.replied_count || 0)}</p>
                      <p className="text-[8px] text-gray-400 uppercase tracking-wide font-bold mt-0.5">Resp.</p>
                    </div>
                  </div>

                  {/* Progress bar with percentage label — smooth animation */}
                  {c.target_count > 0 && (
                    <div className="mb-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-semibold text-gray-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}% concluido</span>
                        {isRunning && <span className="text-[8px] text-blue-500 font-bold animate-pulse">ao vivo</span>}
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ease-out ${isRunning ? 'bg-blue-600' : 'bg-gray-900'}`}
                          style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Secondary actions (compact, footer-aligned) */}
                  <div className="flex items-center gap-1 pt-2 mt-auto border-t border-gray-100">
                    <button onClick={() => openEdit(c)} title="Configurar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 text-violet-700 text-[10px] font-bold hover:bg-violet-100 transition">
                      <Settings size={10} /> Config
                    </button>
                    <button onClick={async () => { setActionLoading(c.id); try { await adminApi.duplicateCampaign(c.id); showToast('Campanha duplicada!'); loadCampaigns() } catch (e: any) { showToast(e.message, 'err') } setActionLoading(null) }}
                      disabled={actionLoading === c.id} title="Duplicar"
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-600 text-[10px] font-semibold hover:bg-gray-100 transition">
                      Duplicar
                    </button>
                    {!isDone && (
                      <button onClick={() => doAction(c.id, 'cancel')} disabled={actionLoading === c.id} title="Cancelar"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition">
                        <Ban size={10} />
                      </button>
                    )}
                    <button onClick={async () => {
                      const ok = await confirm({
                        title: 'Excluir campanha?',
                        message: <span>A campanha <b>{c.name || 'sem titulo'}</b> sera excluida permanentemente.</span>,
                        confirmLabel: 'Excluir',
                        cancelLabel: 'Cancelar',
                        variant: 'danger',
                      })
                      if (ok) doAction(c.id, 'delete')
                    }}
                      disabled={actionLoading === c.id} title="Excluir"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-red-400 text-[10px] font-semibold hover:bg-red-50 hover:text-red-600 transition ml-auto">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Campaign Editor Modal ── */}
      {modalOpen && (
        <CampaignEditorModal
          campaign={editCampaign}
          onClose={() => { setModalOpen(false); setEditCampaign(null) }}
          onSaved={() => { setModalOpen(false); setEditCampaign(null); loadCampaigns() }}
          showToast={showToast}
        />
      )}

      {/* ── Wizard de IA - 7 skills SSE montam campanha do zero ── */}
      <AICampaignWizardModal
        open={aiWizardOpen}
        onClose={() => setAiWizardOpen(false)}
        onCampaignCreated={(campaignId) => {
          /* Squad terminou - recarrega lista e abre o editor pra revisar a draft.
             Busca a campanha recem-criada no array recarregado. */
          loadCampaigns()
          /* Pequeno delay pra aguardar loadCampaigns popular o array */
          setTimeout(() => {
            adminApi.campaigns().then((d: any) => {
              const list = d.campaigns || d.items || (Array.isArray(d) ? d : [])
              const created = list.find((c: any) => String(c.id) === String(campaignId))
              if (created) {
                openEdit(created)
                showToast('Campanha em rascunho aberta para revisao')
              } else {
                showToast('Campanha criada - role a lista para encontrar')
              }
            }).catch(() => undefined)
          }, 400)
        }}
      />
    </div>
  )
}

/* ── Campaign Editor Modal (7 tabs — COMPLETE config) ── */
function CampaignEditorModal({ campaign, onClose, onSaved, showToast }: {
  campaign: any; onClose: () => void; onSaved: () => void; showToast: (t: string, tp?: 'ok' | 'err') => void
}) {
  const isEdit = !!campaign?.id
  const [activeTab, setActiveTab] = useState('geral')
  const [saving, setSaving] = useState(false)
  const [instances, setInstances] = useState<any[]>([])
  /* Local mirror of campaign status — refreshed from server after each action.
   * NO optimistic update: avoids "ghost states" when backend rejects (e.g., instance offline). */
  const [liveStatus, setLiveStatus] = useState<string>(campaign?.status || 'draft')
  const campaignIsRunning = ['active', 'running', 'sending'].includes(liveStatus)
  const [statusActing, setStatusActing] = useState<string | null>(null)
  const [lastStatusError, setLastStatusError] = useState<string | null>(null)
  const { confirm } = useConfirm()
  useEffect(() => { setLiveStatus(campaign?.status || 'draft'); setLastStatusError(null) }, [campaign?.id, campaign?.status])

  const s = campaign?.settings || {}
  const core = s.campaignCore || {}
  const dest = s.destination || {}
  const sched = s.scheduler || {}
  const aw = s.actionWindow || {}
  const fa = s.finalActions || {}
  const trig = s.triggers || {}
  const comp = s.composer || {}
  const ab = s.antiBlock || {}
  const filter = campaign?.filter_json || {}
  const speed = campaign?.speed_json || {}

  // Tab 1: Geral
  const [name, setName] = useState(campaign?.name || '')
  const [mode, setMode] = useState(campaign?.campaign_mode || 'relationship')
  const [slug, setSlug] = useState(core.slug || '')
  const [instanceId, setInstanceId] = useState(campaign?.instance_id || '')
  const [instanceMode, setInstanceMode] = useState(core.instanceMode || 'specific')
  const [poolIds, setPoolIds] = useState<string[]>(core.poolInstanceIds || [])
  const [rotationMode, setRotationMode] = useState(core.rotationMode || campaign?.rotation_mode || 'balanced')

  // Tab 2: Mensagem & IA
  const [useAi, setUseAi] = useState(campaign?.use_ai !== false)
  const [aiPrompt, setAiPrompt] = useState(campaign?.ai_prompt || '')
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '')
  const [intentText, setIntentText] = useState(comp.intentText || '')
  const [personalizedPerLead, setPersonalizedPerLead] = useState(comp.personalizedPerLead !== false)
  const [useAutoVariations, setUseAutoVariations] = useState(comp.useAutoVariations !== false)
  const ne = s.nameEnrichment || {}
  const [nameEnrichmentEnabled, setNameEnrichmentEnabled] = useState(ne.enabled || false)

  // Tab 2b: Media (imagem/video/audio/documento) + link
  const media = s.media || {}
  const [imageUrl, setImageUrl] = useState(media.imageFileName || '')
  const [imageCaption, setImageCaption] = useState(media.imageCaption || '')
  const [imageUseTextAsCaption, setImageUseTextAsCaption] = useState(media.imageUseTextAsCaption !== false)
  const [videoUrls, setVideoUrls] = useState<string[]>(() => {
    if (Array.isArray(media.videoFiles)) return media.videoFiles.filter(Boolean)
    if (media.videoFileName) return [media.videoFileName]
    return []
  })
  const [videoCaption, setVideoCaption] = useState(media.videoCaption || '')
  const [videoUseTextAsCaption, setVideoUseTextAsCaption] = useState(Boolean(media.videoUseTextAsCaption))
  const [audioUrl, setAudioUrl] = useState(media.audioFileName || '')
  const [audioVoiceNote, setAudioVoiceNote] = useState(media.audioVoiceNote !== false)
  const [documentUrl, setDocumentUrl] = useState(media.documentFileName || '')
  const [documentName, setDocumentName] = useState(media.documentName || '')
  const [linkUrl, setLinkUrl] = useState(media.linkUrl || '')
  const [attachedProduct, setAttachedProduct] = useState<any>(media.product || null)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [pickerProducts, setPickerProducts] = useState<any[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const prodImg = (p: any) => {
    const url = p?.imageUrl || p?.image || ''
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
  }
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingDocument, setUploadingDocument] = useState(false)

  async function uploadMedia(file: File, type: 'image' | 'video' | 'audio' | 'document') {
    const setterMap: Record<string, (v: string) => void> = { image: setImageUrl, audio: setAudioUrl, document: setDocumentUrl }
    const loadingMap = { image: setUploadingImage, video: setUploadingVideo, audio: setUploadingAudio, document: setUploadingDocument }
    const loadingSetter = loadingMap[type]
    loadingSetter(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Authorization': getHeaders()['Authorization'] },
        body: fd,
      })
      const d = await r.json()
      if (d.file?.url) {
        if (type === 'video') {
          setVideoUrls(prev => prev.length < 5 ? [...prev, d.file.url] : prev)
        } else {
          setterMap[type]?.(d.file.url)
        }
        if (type === 'document' && !documentName) setDocumentName(file.name)
      }
    } catch {}
    loadingSetter(false)
  }

  async function uploadMultipleVideos(files: FileList) {
    const remaining = 5 - videoUrls.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (!toUpload.length) return
    setUploadingVideo(true)
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetch('/api/media/upload', {
          method: 'POST',
          headers: { 'Authorization': getHeaders()['Authorization'] },
          body: fd,
        })
        const d = await r.json()
        if (d.file?.url) setVideoUrls(prev => prev.length < 5 ? [...prev, d.file.url] : prev)
      } catch {}
    }
    setUploadingVideo(false)
  }

  // Tab 3: Segmentacao
  const [filterStatuses, setFilterStatuses] = useState<string[]>(filter.statuses || ['new'])
  const [filterHasWhatsapp, setFilterHasWhatsapp] = useState(filter.hasWhatsapp === true)
  const [filterTagsInclude, setFilterTagsInclude] = useState((filter.tagsInclude || []).join(', '))
  const [filterTagsExclude, setFilterTagsExclude] = useState((filter.tagsExclude || []).join(', '))
  const [filterCategories, setFilterCategories] = useState<string[]>(filter.segments || filter.categories || [])
  const [filterCities, setFilterCities] = useState<string[]>(filter.cities || [])
  const [filterSources, setFilterSources] = useState<string[]>(filter.sources || [])
  const [filterMinRating, setFilterMinRating] = useState<number | undefined>(filter.scoreMin)
  const [filterOptions, setFilterOptions] = useState<any>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  // Tab 4: Velocidade & Anti-block
  const [maxPerMinute, setMaxPerMinute] = useState(String(speed.maxPerMinute || 3))
  const [minInterval, setMinInterval] = useState(String(speed.minIntervalSeconds || 10))
  const [maxInterval, setMaxInterval] = useState(String(speed.maxIntervalSeconds || 30))
  const [dailyLimit, setDailyLimit] = useState(String(speed.dailyLimit || 200))
  const [autoPauseRate, setAutoPauseRate] = useState(String(speed.autoPauseOnBlockRate || 15))
  const [autoPauseBlocks, setAutoPauseBlocks] = useState(String(ab.autoPauseByBlocks || 5))
  const [autoPauseErrorRate, setAutoPauseErrorRate] = useState(String(ab.autoPauseByErrorRate || 20))
  const [autoPauseOffline, setAutoPauseOffline] = useState(ab.autoPauseOnOffline !== false)
  const [avoidNight, setAvoidNight] = useState(ab.avoidNight !== false)
  const [avoidSunday, setAvoidSunday] = useState(ab.avoidSunday !== false)

  // Tab 5: Agenda
  const [scheduleMode, setScheduleMode] = useState(sched.scheduleMode || 'immediate')
  const [timeZone, setTimeZone] = useState(sched.timeZone || 'America/Sao_Paulo')
  const [smartWindowStart, setSmartWindowStart] = useState(sched.smartWindowStart || aw.start || '08:00')
  const [smartWindowEnd, setSmartWindowEnd] = useState(sched.smartWindowEnd || aw.end || '18:00')
  const [windowEnabled, setWindowEnabled] = useState(aw.enabled || false)

  // Tab 6: Acoes Finais & Triggers
  const [nextStatus, setNextStatus] = useState(fa.nextStatus || '')
  const [addTags, setAddTags] = useState((fa.addTags || []).join(', '))
  const [trigOnNewLead, setTrigOnNewLead] = useState(trig.onNewLead || false)
  const [trigOnStatusChange, setTrigOnStatusChange] = useState(trig.onStatusChange || false)
  const [trigOnTagMatch, setTrigOnTagMatch] = useState(trig.onTagMatch || false)
  const [trigOnOrderCreated, setTrigOnOrderCreated] = useState(trig.onOrderCreated || false)

  // Load instances
  useEffect(() => {
    fetch('/api/instances', { headers: getHeaders() }).then(r => r.json()).then(d => setInstances(d.instances || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/customers/filter-options', { headers: getHeaders() })
      .then(r => r.json()).then(d => setFilterOptions(d)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const f: any = { statuses: filterStatuses }
      if (filterCategories.length) f.segments = filterCategories
      if (filterCities.length) f.cities = filterCities
      if (filterSources.length) f.sources = filterSources
      if (filterMinRating) f.scoreMin = filterMinRating
      if (filterHasWhatsapp) f.hasWhatsapp = true
      if (filterTagsInclude.trim()) f.tagsInclude = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
      if (filterTagsExclude.trim()) f.tagsExclude = filterTagsExclude.split(',').map((t: string) => t.trim()).filter(Boolean)

      fetch('/api/campaigns-v2/preview', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ filter: f })
      }).then(r => r.json()).then(d => setPreviewCount(d.count ?? d.total ?? null)).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [filterStatuses, filterCategories, filterCities, filterSources, filterMinRating, filterHasWhatsapp, filterTagsInclude, filterTagsExclude])

  const splitTags = (v: string) => v.split(',').map((t: string) => t.trim()).filter(Boolean)

  async function save() {
    if (!name.trim()) return showToast('Nome obrigatorio', 'err')
    setSaving(true)
    try {
      const body: any = {
        name: name.trim(),
        campaignMode: mode,
        instanceId: instanceId || undefined,
        useAI: useAi,
        aiPrompt: aiPrompt || null,
        messageTemplate: messageTemplate || null,
        useInstanceRotation: instanceMode === 'smart-rotation',
        rotationMode,
        filter: {
          statuses: filterStatuses,
          hasWhatsapp: filterHasWhatsapp,
          ...(filterCategories.length ? { segments: filterCategories } : {}),
          ...(filterCities.length ? { cities: filterCities } : {}),
          ...(filterSources.length ? { sources: filterSources } : {}),
          ...(filterMinRating ? { scoreMin: filterMinRating } : {}),
          ...(filterTagsInclude.trim() ? { tagsInclude: splitTags(filterTagsInclude) } : {}),
          ...(filterTagsExclude.trim() ? { tagsExclude: splitTags(filterTagsExclude) } : {}),
        },
        speedControl: {
          maxPerMinute: parseInt(maxPerMinute) || 3,
          minIntervalSeconds: parseInt(minInterval) || 10,
          maxIntervalSeconds: parseInt(maxInterval) || 30,
          dailyLimit: parseInt(dailyLimit) || 200,
          autoPauseOnBlockRate: parseInt(autoPauseRate) || 15,
        },
        settings: {
          ...s,
          campaignMode: mode,
          campaignCore: { slug: slug || undefined, instanceMode, poolInstanceIds: poolIds, rotationMode },
          scheduler: { scheduleMode, timeZone, smartWindowStart, smartWindowEnd },
          actionWindow: { enabled: windowEnabled, start: smartWindowStart, end: smartWindowEnd },
          finalActions: { nextStatus: nextStatus || undefined, addTags: addTags.trim() ? splitTags(addTags) : [] },
          triggers: { onNewLead: trigOnNewLead, onStatusChange: trigOnStatusChange, onTagMatch: trigOnTagMatch, onOrderCreated: trigOnOrderCreated },
          composer: { intentText, personalizedPerLead, useAutoVariations },
          nameEnrichment: { enabled: nameEnrichmentEnabled },
          antiBlock: { autoPauseByBlocks: parseInt(autoPauseBlocks) || 5, autoPauseByErrorRate: parseInt(autoPauseErrorRate) || 20, autoPauseOnOffline: autoPauseOffline, avoidNight, avoidSunday },
          media: {
            imageFileName: imageUrl || null,
            imageCaption: imageCaption || null,
            imageUseTextAsCaption,
            videoFiles: videoUrls.filter(Boolean),
            videoFileName: videoUrls[0] || null,
            videoCaption: videoCaption || null,
            videoUseTextAsCaption,
            audioFileName: audioUrl || null,
            audioVoiceNote,
            documentFileName: documentUrl || null,
            documentName: documentName || null,
            linkUrl: linkUrl.trim() || null,
            product: attachedProduct ? { id: attachedProduct.id, name: attachedProduct.name, price: attachedProduct.price, imageUrl: prodImg(attachedProduct), description: attachedProduct.description || '' } : null,
          },
        },
      }
      if (isEdit) await adminApi.updateCampaign(campaign.id, body)
      else await adminApi.createCampaign(body)
      showToast(isEdit ? 'Campanha atualizada!' : 'Campanha criada!')
      onSaved()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  const tabs = [
    { key: 'geral', label: 'Geral' },
    { key: 'mensagem', label: 'Mensagem & IA' },
    { key: 'segmentacao', label: 'Segmentacao' },
    { key: 'velocidade', label: 'Velocidade' },
    { key: 'agenda', label: 'Agenda' },
    { key: 'acoes', label: 'Acoes' },
    { key: 'metricas', label: 'Metricas' },
  ]

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200'
  const labelCls = 'text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block'

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition shrink-0 ${value ? 'bg-violet-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  const LEAD_STATUSES = ['new', 'contacted', 'replied', 'negotiating', 'converted', 'lost', 'inactive']

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base text-gray-900">{isEdit ? 'Configurar Campanha' : 'Nova Campanha'}</h3>
            {isEdit && <p className="text-[11px] text-gray-400 mt-0.5">{campaign.name}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition"><X size={18} className="text-gray-400" /></button>
        </div>

        {/* ── Status bar (Bug-11) — controles de status sempre visíveis,
             entre header e tabs. Só aparece em edição (não em "Nova Campanha"). */}
        {isEdit && (() => {
          const statusCfg: Record<string, { label: string; bg: string; text: string; dot: string }> = {
            draft:     { label: 'Rascunho',  bg: 'bg-gray-100',     text: 'text-gray-700',    dot: 'bg-gray-400' },
            scheduled: { label: 'Agendada',  bg: 'bg-violet-50',    text: 'text-violet-700',  dot: 'bg-violet-500' },
            active:    { label: 'Ativa',     bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500 animate-pulse' },
            running:   { label: 'Enviando',  bg: 'bg-blue-50',      text: 'text-blue-700',    dot: 'bg-blue-500 animate-pulse' },
            sending:   { label: 'Enviando',  bg: 'bg-blue-50',      text: 'text-blue-700',    dot: 'bg-blue-500 animate-pulse' },
            paused:    { label: 'Pausada',   bg: 'bg-amber-50',     text: 'text-amber-700',   dot: 'bg-amber-500' },
            completed: { label: 'Concluída', bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500' },
            finished:  { label: 'Finalizada', bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
            cancelled: { label: 'Cancelada', bg: 'bg-red-50',       text: 'text-red-700',     dot: 'bg-red-500' },
          }
          const cfg = statusCfg[liveStatus.toLowerCase()] || statusCfg.draft
          const isRunning = ['active', 'running', 'sending'].includes(liveStatus)
          const canStart = ['draft', 'paused', 'scheduled'].includes(liveStatus)
          const canPause = isRunning
          const isDone = ['completed', 'cancelled', 'finished'].includes(liveStatus)
          const canCancel = !isDone

          /* Single executor — keeps modal open and refreshes the live status optimistically.
           * Errors revert and toast. The parent (CampaignsView) is informed via onSaved on
           * close so the list refreshes. */
          async function runStatusAction(action: 'start' | 'pause' | 'cancel' | 'reopen') {
            setStatusActing(action)
            setLastStatusError(null)
            try {
              if (action === 'start') await adminApi.startCampaign(campaign.id)
              else if (action === 'pause') await adminApi.pauseCampaign(campaign.id)
              else if (action === 'cancel') await adminApi.cancelCampaign(campaign.id)
              else if (action === 'reopen') await adminApi.reexecuteCampaign(campaign.id)
              showToast(
                action === 'start' ? 'Campanha iniciada!'
                : action === 'pause' ? 'Campanha pausada.'
                : action === 'cancel' ? 'Campanha cancelada.'
                : 'Campanha reaberta!'
              )
              /* Always refresh status from server — single source of truth.
               * No optimism: avoids stale UI when backend takes a different path
               * (e.g., start succeeds but queue was empty → completed immediately). */
              try {
                const fresh = await adminApi.campaigns()
                const arr = fresh?.campaigns || fresh?.items || (Array.isArray(fresh) ? fresh : [])
                const updated = arr.find((c: any) => c.id === campaign.id)
                if (updated?.status) setLiveStatus(updated.status)
              } catch { /* fall through — keep current */ }
            } catch (e: any) {
              const msg = e?.message || `Falha ao ${action === 'start' ? 'iniciar' : action === 'pause' ? 'pausar' : action === 'cancel' ? 'cancelar' : 'reabrir'} campanha`
              setLastStatusError(msg)
              showToast(msg, 'err')
            } finally {
              setStatusActing(null)
            }
          }

          async function confirmAndCancel() {
            const ok = await confirm({
              title: 'Cancelar campanha?',
              message: <span>A campanha <b>{campaign.name || 'sem título'}</b> será marcada como cancelada. Você pode reabrir depois.</span>,
              confirmLabel: 'Cancelar campanha',
              cancelLabel: 'Voltar',
              variant: 'danger',
            })
            if (ok) runStatusAction('cancel')
          }

          /* Progress for visual context — total sent vs target */
          const totalTarget = Number(campaign.target_count || 0)
          const totalSent = Number(campaign.sent_count || 0)
          const pct = totalTarget > 0 ? Math.min(100, Math.round((totalSent / totalTarget) * 100)) : 0

          return (
            <div className={`px-5 py-3 border-b border-gray-100 ${cfg.bg} shrink-0`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Left: status badge + progress */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white ${cfg.text} text-[11px] font-bold tracking-tight shadow-sm`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </div>
                  {totalTarget > 0 && (
                    <div className="text-[11px] text-gray-600">
                      <span className="font-bold">{totalSent.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-400">/{totalTarget.toLocaleString('pt-BR')}</span>
                      <span className="text-gray-400 ml-1">({pct}%)</span>
                    </div>
                  )}
                </div>

                {/* Right: contextual action buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canStart && (
                    <button onClick={() => runStatusAction('start')} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition shadow-sm disabled:opacity-60">
                      {statusActing === 'start' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {liveStatus === 'paused' ? 'Retomar' : 'Iniciar campanha'}
                    </button>
                  )}
                  {canPause && (
                    <button onClick={() => runStatusAction('pause')} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-[11px] font-bold hover:bg-amber-50 transition disabled:opacity-60">
                      {statusActing === 'pause' ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                      Pausar
                    </button>
                  )}
                  {isDone && (
                    <button onClick={() => runStatusAction('reopen')} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 text-[11px] font-bold hover:bg-blue-50 transition disabled:opacity-60">
                      {statusActing === 'reopen' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Reabrir
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={confirmAndCancel} disabled={!!statusActing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition disabled:opacity-60">
                      {statusActing === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
              {/* Persistent error banner — survives until next successful action.
                  Mostly hits when instance is offline, queue is empty, etc. */}
              {lastStatusError && (
                <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" strokeWidth={2.5} />
                  <div className="flex-1 leading-snug">
                    <p className="font-semibold mb-0.5">Não foi possível executar a ação:</p>
                    <p>{lastStatusError}</p>
                  </div>
                  <button onClick={() => setLastStatusError(null)} aria-label="Fechar"
                    className="text-red-500 hover:text-red-800 shrink-0">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Helpful one-liner about what each transition means */}
              {!lastStatusError && (
                <p className="text-[10px] text-gray-500 mt-2 leading-snug">
                  {liveStatus === 'draft' && 'Rascunho — configure abaixo e clique Iniciar campanha quando estiver pronto.'}
                  {liveStatus === 'paused' && 'Campanha pausada — envios suspensos. Retome para continuar de onde parou.'}
                  {liveStatus === 'scheduled' && 'Campanha agendada — começará automaticamente na data marcada.'}
                  {isRunning && 'Campanha ativa — disparando mensagens em fila. Você pode pausar a qualquer momento.'}
                  {liveStatus === 'completed' && 'Campanha concluída — todos os leads foram processados.'}
                  {liveStatus === 'cancelled' && 'Campanha cancelada — clique Reabrir para colocar como rascunho novamente.'}
                  {liveStatus === 'finished' && 'Campanha finalizada — clique Reabrir para reexecutar.'}
                </p>
              )}
            </div>
          )
        })()}

        {/* Tabs */}
        <div className="px-5 pt-3 border-b border-gray-100 flex gap-1 shrink-0 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3.5 py-2 rounded-t-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === t.key ? 'bg-gray-100 text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Tab: Geral */}
          {activeTab === 'geral' && (<>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome da campanha *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Boas Vindas" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Slug / Codigo</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder="Ex: boas_vindas" className={inputCls + ' font-mono text-xs'} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Modo</label>
              <div className="grid grid-cols-3 gap-2">
                {[['relationship', 'Relacionamento', 'Conversa 1-a-1'], ['broadcast', 'Broadcast', 'Mensagem em massa'], ['drip', 'Sequencia', 'Etapas programadas']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${mode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className={`text-xs font-bold ${mode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Instancia WhatsApp {instanceMode === 'smart-rotation' ? '(principal / fallback)' : ''}</label>
              <select value={instanceId} onChange={e => setInstanceId(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {instances.map((inst: any) => (
                  <option key={inst.id} value={inst.id}>{inst.name} ({inst.phone}) — {inst.status}</option>
                ))}
              </select>
              {instanceMode === 'smart-rotation' && (
                <p className="text-[9px] text-gray-400 mt-1">No rodizio, esta instancia e usada como fallback caso nenhuma do pool esteja disponivel.</p>
              )}
            </div>
          </>)}

          {/* Tab: Mensagem & IA — Full composer */}
          {activeTab === 'mensagem' && (<>

            {/* ─── 1. MIDIA + LINK (topo) ─── */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Midia & Link (opcional)</p>

              {/* Imagem + Video */}
              <div className="grid grid-cols-2 gap-2">
                {/* Imagem */}
                <div className={`rounded-xl border-2 border-dashed overflow-hidden transition-all ${imageUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {imageUrl ? (
                    <div className="relative group" style={{ aspectRatio: '16/10' }}>
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <label className="px-2 py-1 bg-white/90 rounded-lg text-[10px] font-bold text-gray-700 cursor-pointer">
                          Trocar <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                        </label>
                        <button onClick={() => setImageUrl('')} className="px-2 py-1 bg-red-500/90 rounded-lg text-[10px] font-bold text-white">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingImage ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Eye size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingImage ? 'Enviando...' : 'Imagem'}</p>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'image') }} />
                    </label>
                  )}
                </div>
                {/* Video — aceita multiplos (ate 5) */}
                {videoUrls.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed overflow-hidden transition-all border-gray-200 bg-white">
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingVideo ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Film size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingVideo ? 'Enviando...' : 'Videos (ate 5)'}</p>
                      <input type="file" accept="video/mp4,video/webm" multiple className="hidden" onChange={e => { if (e.target.files?.length) uploadMultipleVideos(e.target.files) }} />
                    </label>
                  </div>
                )}
              </div>

              {/* Multi-video grid */}
              {videoUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Videos ({videoUrls.length}/5)</p>
                    {videoUrls.length < 5 && (
                      <label className="text-[10px] font-bold text-violet-500 cursor-pointer hover:text-violet-700 flex items-center gap-1">
                        {uploadingVideo ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        {uploadingVideo ? 'Enviando...' : 'Adicionar'}
                        <input type="file" accept="video/mp4,video/webm" multiple className="hidden" onChange={e => { if (e.target.files?.length) uploadMultipleVideos(e.target.files) }} />
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {videoUrls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-violet-200 bg-violet-50/30" style={{ aspectRatio: '9/12' }}>
                        <video src={url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => setVideoUrls(prev => prev.filter((_, j) => j !== i))} className="p-1 bg-red-500/90 rounded-full">
                            <X size={12} className="text-white" />
                          </button>
                        </div>
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[8px] font-bold px-1 rounded">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Imagem caption */}
              {imageUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={imageUseTextAsCaption} onChange={setImageUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda da imagem</span>
                  </div>
                  {!imageUseTextAsCaption && (
                    <input type="text" value={imageCaption} onChange={e => setImageCaption(e.target.value)}
                      placeholder="Legenda da imagem..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Video caption */}
              {videoUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Toggle value={videoUseTextAsCaption} onChange={setVideoUseTextAsCaption} />
                    <span className="text-[10px] text-gray-500 font-medium">Usar texto da mensagem como legenda do video</span>
                  </div>
                  {!videoUseTextAsCaption && (
                    <input type="text" value={videoCaption} onChange={e => setVideoCaption(e.target.value)}
                      placeholder="Legenda do video..." className={inputCls + ' !text-xs !py-2'} />
                  )}
                </div>
              )}

              {/* Audio + Documento */}
              <div className="grid grid-cols-2 gap-2">
                {/* Audio */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${audioUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {audioUrl ? (
                    <div className="p-2.5 space-y-2">
                      <audio src={audioUrl} controls className="w-full h-8" />
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 font-medium">
                          <input type="checkbox" checked={audioVoiceNote} onChange={e => setAudioVoiceNote(e.target.checked)} className="w-3 h-3" />
                          Voice note
                        </label>
                        <button onClick={() => setAudioUrl('')} className="text-[10px] text-red-500 font-bold">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingAudio ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <Volume2 size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingAudio ? 'Enviando...' : 'Audio'}</p>
                      <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'audio') }} />
                    </label>
                  )}
                </div>
                {/* Documento */}
                <div className={`rounded-xl border-2 border-dashed transition-all ${documentUrl ? 'border-violet-300 bg-violet-50/30' : 'border-gray-200 bg-white'}`}>
                  {documentUrl ? (
                    <div className="p-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <FileText size={14} className="text-violet-500 shrink-0" />
                        <span className="text-[11px] font-bold text-gray-700 truncate">{documentName || 'documento'}</span>
                      </div>
                      <input type="text" value={documentName} onChange={e => setDocumentName(e.target.value)}
                        placeholder="Nome do arquivo..." className="w-full px-2 py-1 border border-gray-200 rounded-md text-[10px]" />
                      <button onClick={() => { setDocumentUrl(''); setDocumentName('') }} className="text-[10px] text-red-500 font-bold">Remover</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-violet-50/50 transition">
                      {uploadingDocument ? <Loader2 size={18} className="text-violet-400 animate-spin" /> : <FileText size={18} className="text-gray-300" />}
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{uploadingDocument ? 'Enviando...' : 'Documento'}</p>
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'document') }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Link */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1 block flex items-center gap-1.5">
                  <Link2 size={11} /> Link (gera preview no WhatsApp)
                </label>
                <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://exemplo.com/sua-pagina"
                  className={inputCls + ' !text-xs !py-2'} />
                <p className="text-[9px] text-gray-400 mt-1">O link sera adicionado ao final da mensagem. Se ja estiver no texto, nao sera duplicado.</p>
              </div>
            </div>

            {/* ─── PRODUTO VINCULADO ─── */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] flex items-center gap-1.5">
                  <ShoppingBag size={11} /> Produto vinculado
                </p>
                {attachedProduct && (
                  <button onClick={() => setAttachedProduct(null)} className="text-[10px] font-semibold text-red-500 hover:text-red-600 transition">Remover</button>
                )}
              </div>

              {attachedProduct ? (
                <div className="flex gap-3 bg-white rounded-xl border border-violet-200 p-2.5">
                  {prodImg(attachedProduct) ? (
                    <img src={prodImg(attachedProduct)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-gray-100"
                      onError={e => { e.currentTarget.style.display = 'none'; const fb = e.currentTarget.nextElementSibling as HTMLElement; if (fb) fb.style.display = 'grid' }} />
                  ) : null}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 grid place-items-center shrink-0" style={{ display: prodImg(attachedProduct) ? 'none' : 'grid' }}><ShoppingBag size={20} className="text-gray-300" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{attachedProduct.name}</p>
                    {attachedProduct.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{attachedProduct.description}</p>}
                    <p className="text-sm font-extrabold text-emerald-600 mt-1">
                      {typeof attachedProduct.price === 'number' ? `R$ ${attachedProduct.price.toFixed(2).replace('.', ',')}` : ''}
                      {attachedProduct.promoPrice != null && (
                        <span className="text-[10px] text-gray-400 line-through ml-1.5 font-normal">
                          R$ {Number(attachedProduct.promoPrice).toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => {
                  setShowProductPicker(true)
                  setPickerSearch('')
                  if (pickerProducts.length === 0) {
                    setPickerLoading(true)
                    fetch('/api/products', { headers: getHeaders() })
                      .then(r => r.json())
                      .then(d => { setPickerProducts(d.products || []); setPickerLoading(false) })
                      .catch(() => setPickerLoading(false))
                  }
                }} className="w-full py-4 rounded-xl border-2 border-dashed border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/30 transition text-center cursor-pointer">
                  <ShoppingBag size={18} className="text-gray-300 mx-auto" />
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">Selecionar produto do catalogo</p>
                  <p className="text-[9px] text-gray-300 mt-0.5">A imagem e dados do produto serao enviados na campanha</p>
                </button>
              )}
            </div>

            {/* Product Picker Modal */}
            {showProductPicker && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowProductPicker(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <p className="text-sm font-bold text-gray-900">Selecionar produto</p>
                    <button onClick={() => setShowProductPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition"><X size={16} className="text-gray-400" /></button>
                  </div>
                  <div className="px-5 py-3 border-b border-gray-100 shrink-0">
                    <input type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Buscar produto..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 placeholder:text-gray-300" />
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {pickerLoading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-violet-400" /></div>
                    ) : (() => {
                      const q = pickerSearch.toLowerCase().trim()
                      const filtered = q ? pickerProducts.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)) : pickerProducts
                      if (filtered.length === 0) return <p className="text-xs text-gray-400 text-center py-8">Nenhum produto encontrado</p>
                      return filtered.map((p: any) => (
                        <button key={p.id} type="button" onClick={() => { setAttachedProduct(p); setShowProductPicker(false) }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 hover:border-violet-400 hover:bg-violet-50/30 transition text-left">
                          {prodImg(p) ? (
                            <img src={prodImg(p)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-100"
                              onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; el.nextElementSibling?.classList.remove('hidden') }} />
                          ) : null}
                          <div className={`w-12 h-12 rounded-lg bg-gray-100 place-items-center shrink-0 ${prodImg(p) ? 'hidden' : 'grid'}`}><ShoppingBag size={16} className="text-gray-300" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{p.category || ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-emerald-600">
                              {typeof p.price === 'number' ? `R$ ${p.price.toFixed(2).replace('.', ',')}` : ''}
                            </p>
                          </div>
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* ─── 2. CONTEUDO DA MENSAGEM ─── */}
            <div>
              <label className={labelCls}>Mensagem / Template</label>
              <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={4}
                placeholder="Ola {{nome}}, tudo bem? Sou da {{empresa}}. Gostaria de conversar sobre..."
                className={inputCls + ' resize-none font-mono text-xs leading-relaxed'} />
              <p className="text-[10px] text-gray-400 mt-1">Variaveis: <code className="bg-gray-100 px-1 rounded">{'{{nome}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{cidade}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{segmento}}'}</code> <code className="bg-gray-100 px-1 rounded">{'{{empresa}}'}</code></p>
            </div>

            {/* ─── 3. INTELIGENCIA ARTIFICIAL ─── */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 ring-1 ring-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-900 grid place-items-center"><Zap size={14} className="text-white" /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Inteligencia Artificial</p>
                    <p className="text-[10px] text-gray-500">A IA personaliza cada mensagem para o lead</p>
                  </div>
                </div>
                <Toggle value={useAi} onChange={setUseAi} />
              </div>

              {useAi && (<>
                <div>
                  <label className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1 block">Instrucoes para a IA (prompt)</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                    placeholder="Ex: Fale sobre nossos produtos, mencione o nome do cliente, pergunte sobre interesse..."
                    className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1 block">Texto de intencao (objetivo detalhado)</label>
                  <textarea value={intentText} onChange={e => setIntentText(e.target.value)} rows={3}
                    placeholder="Descreva o objetivo da abordagem, tom desejado, proposta de valor, CTA esperado..."
                    className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
                  <p className="text-[9px] text-violet-400 mt-1">Este texto guia o compositor para gerar conteudo contextualizado por lead.</p>
                </div>
              </>)}
            </div>

            {/* ─── 4. CONFIG AVANCADA (colapsavel) ─── */}
            <details className="group">
              <summary className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 cursor-pointer hover:text-gray-600 transition select-none">
                <ChevronRight size={12} className="transition-transform group-open:rotate-90" /> Configuracoes avancadas
              </summary>
              <div className="mt-3 space-y-3 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Personalizar por lead</span>
                    <Toggle value={personalizedPerLead} onChange={setPersonalizedPerLead} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-[11px] font-medium text-gray-600">Variacoes automaticas</span>
                    <Toggle value={useAutoVariations} onChange={setUseAutoVariations} />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-violet-50 rounded-xl p-3 border border-violet-100">
                  <div>
                    <span className="text-[11px] font-medium text-gray-700">Buscar nome do contato</span>
                    <p className="text-[9px] text-gray-400 mt-0.5">Quando o prospect nao tem nome, busca automaticamente do WhatsApp e normaliza antes do envio</p>
                  </div>
                  <Toggle value={nameEnrichmentEnabled} onChange={setNameEnrichmentEnabled} />
                </div>
              </div>
            </details>

            {/* ─── 5. PIPELINE DE EXECUCAO ─── */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Pipeline de execucao</p>
                <span className="text-[8px] font-bold text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">BETA</span>
              </div>
              <div className="px-3 py-3 flex items-start gap-0 overflow-x-auto scrollbar-hide">
                {[
                  { label: 'Filtrar', desc: filterStatuses.join(', ') || 'todos', color: 'bg-blue-500' },
                  { label: imageUrl ? 'Midia + Msg' : 'Compor Msg', desc: useAi ? 'IA personalizada' : 'Template fixo', color: 'bg-violet-500' },
                  { label: 'Validar', desc: filterHasWhatsapp ? 'WhatsApp only' : 'Todos', color: 'bg-emerald-500' },
                  { label: 'Enviar', desc: `${maxPerMinute}/min · ${dailyLimit}/dia`, color: 'bg-orange-500' },
                  { label: 'Classificar', desc: 'IA analisa replies', color: 'bg-indigo-500' },
                  { label: nextStatus ? `→ ${nextStatus}` : 'Fim', desc: addTags ? `+${addTags}` : '', color: 'bg-gray-500' },
                ].map((s, i, arr) => (
                  <div key={i} className="flex items-center shrink-0">
                    <div className="text-center min-w-[72px]">
                      <div className={`w-7 h-7 rounded-lg ${s.color} mx-auto grid place-items-center text-white text-[10px] font-bold shadow-sm`}>{i + 1}</div>
                      <p className="text-[10px] font-bold text-gray-700 mt-1.5">{s.label}</p>
                      <p className="text-[8px] text-gray-400 leading-tight max-w-[70px] mx-auto">{s.desc}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center px-0.5 pt-0 mt-[-8px]">
                        <div className="w-4 h-px bg-gray-200" />
                        <ChevronRight size={10} className="text-gray-300 -mx-0.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </>)}


          {/* Tab: Segmentacao */}
          {activeTab === 'segmentacao' && (() => {
            const CAT_LABEL: Record<string, string> = {
              restaurant: 'Restaurante', buffet_restaurant: 'Buffet', pizza_restaurant: 'Pizzaria',
              brazilian_restaurant: 'Brasileiro', barbecue_restaurant: 'Churrascaria', bar: 'Bar',
              manufacturer: 'Fabricante', italian_restaurant: 'Italiano', seafood_restaurant: 'Frutos do Mar',
              family_restaurant: 'Familiar', food: 'Alimentacao', snack_bar: 'Lanchonete',
              health_food_store: 'Emporio', meal_delivery: 'Delivery', hamburger_restaurant: 'Hamburgueria',
              japanese_restaurant: 'Japones', wholesaler: 'Atacadista',
            }
            const chipActive = 'border border-violet-400 bg-violet-50 text-violet-800'
            const chipInactive = 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            const sectionLabel = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 block'
            const availCats: { value: string; count: number }[] = (filterOptions?.categories || []).slice(0, 12)
            const availCities: { value: string; count: number }[] = (filterOptions?.cities || []).slice(0, 10)
            const availTags: string[] = filterOptions?.tags || []
            const statusCounts: Record<string, number> = filterOptions?.statusCounts || {}
            const toggleArr = (arr: string[], set: (v: string[]) => void, val: string) =>
              set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
            return (<>
              {/* Preview banner */}
              <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${
                previewCount === null ? 'bg-gray-50 text-gray-400' :
                previewCount === 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <span className="grid place-items-center w-4 h-4 shrink-0">
                  {previewCount === null
                    ? <Loader2 size={12} className="animate-spin" />
                    : previewCount === 0
                      ? <AlertTriangle size={13} strokeWidth={2} />
                      : <CheckCircle2 size={13} strokeWidth={2} />}
                </span>
                {previewCount === null
                  ? 'Calculando alcance...'
                  : previewCount === 0
                  ? 'Nenhum lead corresponde aos filtros atuais'
                  : `Esta campanha alcancara ~${previewCount.toLocaleString('pt-BR')} leads`}
              </div>

              {/* Status */}
              <div>
                <span className={sectionLabel}>Status</span>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map(s => {
                    const cnt = statusCounts[s]
                    const active = filterStatuses.includes(s)
                    return (
                      <button key={s} type="button"
                        onClick={() => toggleArr(filterStatuses, setFilterStatuses, s)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                        {s}{cnt != null && <span className="text-[9px] opacity-60">({cnt})</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Categoria */}
              {availCats.length > 0 && (
                <div>
                  <span className={sectionLabel}>Categoria</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCats.map(({ value, count }) => {
                      const active = filterCategories.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCategories, setFilterCategories, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {CAT_LABEL[value] || value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cidade */}
              {availCities.length > 0 && (
                <div>
                  <span className={sectionLabel}>Cidade</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availCities.map(({ value, count }) => {
                      const active = filterCities.includes(value)
                      return (
                        <button key={value} type="button"
                          onClick={() => toggleArr(filterCities, setFilterCities, value)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${active ? chipActive : chipInactive}`}>
                          {value}
                          {count != null && <span className="text-[9px] opacity-60">({count})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Rating minimo */}
              <div>
                <span className={sectionLabel}>Rating minimo</span>
                <div className="flex flex-wrap gap-1.5">
                  {([undefined, 3, 4, 4.5] as (number | undefined)[]).map(v => {
                    const active = filterMinRating === v
                    return (
                      <button key={String(v)} type="button"
                        onClick={() => setFilterMinRating(v)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${active ? chipActive : chipInactive}`}>
                        {v == null ? (
                          'Qualquer'
                        ) : (
                          <>
                            <Star size={10} strokeWidth={2} className="fill-current" />
                            {v}+
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tags */}
              <div>
                <span className={sectionLabel}>Tags</span>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Incluir (virgula)</label>
                    <input type="text" value={filterTagsInclude} onChange={e => setFilterTagsInclude(e.target.value)} placeholder="tag1, tag2" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">Excluir (virgula)</label>
                    <input type="text" value={filterTagsExclude} onChange={e => setFilterTagsExclude(e.target.value)} placeholder="tag_excluir" className={inputCls} />
                  </div>
                </div>
                {availTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {availTags.slice(0, 20).map(tag => {
                      const included = filterTagsInclude.split(',').map((t: string) => t.trim()).includes(tag)
                      return (
                        <button key={tag} type="button"
                          onClick={() => {
                            const parts = filterTagsInclude.split(',').map((t: string) => t.trim()).filter(Boolean)
                            if (included) setFilterTagsInclude(parts.filter((t: string) => t !== tag).join(', '))
                            else setFilterTagsInclude([...parts, tag].join(', '))
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition ${included ? chipActive : chipInactive}`}>
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* WhatsApp toggle */}
              <div className="flex items-center justify-between py-1 border-t border-gray-100 pt-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Somente com WhatsApp</p>
                  <p className="text-[11px] text-gray-400">Filtrar apenas leads com WhatsApp validado</p>
                </div>
                <Toggle value={filterHasWhatsapp} onChange={setFilterHasWhatsapp} />
              </div>
            </>)
          })()}

          {/* Tab: Velocidade & Anti-block */}
          {activeTab === 'velocidade' && (() => {
            const isRotation = instanceMode === 'smart-rotation'
            const connectedPool = isRotation ? instances.filter(i => poolIds.includes(i.id) && i.status === 'connected').length : 1
            const perMin = Number(maxPerMinute) || 3
            const daily = Number(dailyLimit) || 200
            const effectivePerMin = perMin * connectedPool
            const effectiveDaily = daily * connectedPool
            const presets: Record<string, { perMin: string; daily: string; minInt: string; maxInt: string }> = {
              conservative: { perMin: '1', daily: '50',  minInt: '30', maxInt: '90'  },
              balanced:     { perMin: '3', daily: '200', minInt: '10', maxInt: '30'  },
              aggressive:   { perMin: '6', daily: '500', minInt: '5',  maxInt: '15'  },
            }
            function applyPreset(mode: string) {
              setRotationMode(mode)
              const p = presets[mode]
              if (p) { setMaxPerMinute(p.perMin); setDailyLimit(p.daily); setMinInterval(p.minInt); setMaxInterval(p.maxInt) }
            }
            return <>

            {/* Modo de instancia */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Modo de disparo</p>
              <div className="grid grid-cols-2 gap-2">
                {[['specific', 'Instancia unica', 'Envia por uma unica instancia selecionada na aba Geral'], ['smart-rotation', 'Rodizio inteligente', 'Alterna entre multiplas instancias com distribuicao configuravel']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setInstanceMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${instanceMode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <p className={`text-[11px] font-bold ${instanceMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{d}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Rotation: pool + distribution mode */}
            {isRotation && (<>
              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Instancias do pool</p>
                <p className="text-[10px] text-gray-400 mb-2">Selecione as instancias que participarao do rodizio. Os limites abaixo se aplicam a cada instancia individualmente.</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {instances.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 bg-gray-50 rounded-xl">Nenhuma instancia cadastrada.</p>
                  ) : instances.map((inst: any) => {
                    const checked = poolIds.includes(inst.id)
                    const isConnected = inst.status === 'connected'
                    return (
                      <label key={inst.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          checked ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        } ${!isConnected ? 'opacity-60' : ''}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setPoolIds(checked ? poolIds.filter(id => id !== inst.id) : [...poolIds, inst.id])}
                          className="w-4 h-4 accent-violet-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            <span className="text-xs font-bold text-gray-900 truncate">{inst.name || inst.id.slice(0, 8)}</span>
                            <span className="text-[10px] text-gray-400">{inst.phone || ''}</span>
                          </div>
                          <span className={`text-[9px] font-semibold ${isConnected ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {isConnected ? 'Conectada' : 'Desconectada'}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
                {poolIds.length > 0 && (
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[10px] font-bold text-violet-600">{poolIds.length} instancia{poolIds.length > 1 ? 's' : ''} selecionada{poolIds.length > 1 ? 's' : ''}</span>
                    <button type="button" onClick={() => setPoolIds([])} className="text-[10px] font-semibold text-gray-400 hover:text-red-500 transition">Limpar</button>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 mt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Padrao de rodizio</p>
                <p className="text-[10px] text-gray-400 mb-2">Define como o sistema alterna entre as instancias durante o disparo.</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['conservative', 'Sequencial', '1 msg por instancia, depois passa pra proxima em fila'],
                    ['balanced', 'Distribuido', 'Alterna uniformemente entre todas as instancias'],
                    ['aggressive', 'Concentrado', 'Usa o maximo de uma instancia antes de passar pra proxima'],
                  ].map(([k, l, d]) => (
                    <button key={k} type="button" onClick={() => applyPreset(k)}
                      className={`p-2.5 rounded-xl border text-left transition ${rotationMode === k ? 'border-violet-400 bg-violet-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className={`text-[11px] font-bold ${rotationMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{d}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>)}

            {/* Speed controls — always visible, per-instance when rotation is on */}
            <div className={isRotation ? 'border-t border-gray-100 pt-3 mt-1' : ''}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Limites {isRotation ? 'por instancia' : 'de velocidade'}
                </p>
              </div>
              {isRotation && (
                <p className="text-[10px] text-gray-400 mb-2">Cada valor se aplica individualmente a cada instancia selecionada. Voce pode ajustar livremente.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Msgs por minuto {isRotation ? '(cada)' : ''}</label>
                <input type="number" min={1} max={30} value={maxPerMinute} onChange={e => setMaxPerMinute(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Limite diario {isRotation ? '(cada)' : ''}</label>
                <input type="number" min={1} max={2000} value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo min (seg)</label>
                <input type="number" min={1} max={600} value={minInterval} onChange={e => setMinInterval(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Intervalo max (seg)</label>
                <input type="number" min={1} max={600} value={maxInterval} onChange={e => setMaxInterval(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Effective throughput summary — only when rotation with multiple instances */}
            {isRotation && connectedPool > 1 && (
              <div className="rounded-xl p-3 bg-violet-50 border border-violet-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Capacidade combinada</p>
                    <p className="text-base font-extrabold text-gray-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ~{effectivePerMin} msgs/min
                      <span className="text-[11px] font-semibold text-gray-400 ml-2">ate {effectiveDaily}/dia</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-violet-600 font-bold">{connectedPool} ativas</p>
                    <p className="text-[9px] text-gray-400">{perMin}/min x {connectedPool}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Anti-bloqueio</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Pausar apos X bloqueios</label>
                <input type="number" min={1} max={50} value={autoPauseBlocks} onChange={e => setAutoPauseBlocks(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de bloqueio (%)</label>
                <input type="number" min={1} max={100} value={autoPauseRate} onChange={e => setAutoPauseRate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pausar se taxa de erro (%)</label>
                <input type="number" min={1} max={100} value={autoPauseErrorRate} onChange={e => setAutoPauseErrorRate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
              <span className="text-xs font-medium text-gray-600">Pausar se instancia ficar offline</span>
              <Toggle value={autoPauseOffline} onChange={setAutoPauseOffline} />
            </div>
          </>})()}

          {/* Tab: Agenda */}
          {activeTab === 'agenda' && (<>
            <div>
              <label className={labelCls}>Modo de agendamento</label>
              <div className="grid grid-cols-2 gap-2">
                {[['immediate', 'Imediato', 'Inicia ao clicar Iniciar'], ['scheduled', 'Agendado', 'Inicia em data/hora definida']].map(([k, l, d]) => (
                  <button key={k} type="button" onClick={() => setScheduleMode(k)}
                    className={`p-3 rounded-xl border text-left transition ${scheduleMode === k ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}>
                    <p className={`text-xs font-bold ${scheduleMode === k ? 'text-violet-700' : 'text-gray-700'}`}>{l}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{d}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Janela de envio */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-semibold text-gray-800">Janela de envio</p>
                <p className="text-[11px] text-gray-400">Restringir envios a um horario especifico</p>
              </div>
              <Toggle value={windowEnabled} onChange={setWindowEnabled} />
            </div>
            {windowEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Horario inicio</label>
                  <input type="time" value={smartWindowStart} onChange={e => setSmartWindowStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Horario fim</label>
                  <input type="time" value={smartWindowEnd} onChange={e => setSmartWindowEnd(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Fuso horario</label>
              <select value={timeZone} onChange={e => setTimeZone(e.target.value)} className={inputCls}>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="America/Manaus">America/Manaus (AMT)</option>
                <option value="America/Fortaleza">America/Fortaleza (BRT)</option>
              </select>
            </div>

            {/* Restricoes de envio */}
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Restricoes de envio</p>
              <div className="space-y-2">
                {[
                  { label: 'Evitar envios a noite (22h-7h)', value: avoidNight, onChange: setAvoidNight },
                  { label: 'Evitar envios no domingo', value: avoidSunday, onChange: setAvoidSunday },
                ].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                    <Toggle value={opt.value} onChange={opt.onChange} />
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* Tab: Acoes Finais & Triggers */}
          {activeTab === 'acoes' && (<>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Apos a campanha</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mover lead para status</label>
                <select value={nextStatus} onChange={e => setNextStatus(e.target.value)} className={inputCls}>
                  <option value="">Nao alterar</option>
                  <option value="contacted">Contatado</option>
                  <option value="replied">Respondeu</option>
                  <option value="negotiating">Negociando</option>
                  <option value="converted">Convertido</option>
                  <option value="lost">Perdido</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Adicionar tags (virgula)</label>
                <input type="text" value={addTags} onChange={e => setAddTags(e.target.value)} placeholder="contatado, follow_1" className={inputCls} />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Gatilhos automaticos</p>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Disparar ao capturar novo lead', value: trigOnNewLead, onChange: setTrigOnNewLead },
                { label: 'Disparar ao mudar status do lead', value: trigOnStatusChange, onChange: setTrigOnStatusChange },
                { label: 'Disparar quando tag combinar', value: trigOnTagMatch, onChange: setTrigOnTagMatch },
                { label: 'Disparar ao criar pedido', value: trigOnOrderCreated, onChange: setTrigOnOrderCreated },
              ].map(opt => (
                <div key={opt.label} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-xs font-medium text-gray-600">{opt.label}</span>
                  <Toggle value={opt.value} onChange={opt.onChange} />
                </div>
              ))}
            </div>
          </>)}

          {/* Tab: Metricas (read-only) */}
          {activeTab === 'metricas' && (<>
            {!isEdit ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">Metricas disponiveis apos salvar a campanha</p>
              </div>
            ) : (<>
              {campaignIsRunning && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-blue-600">Atualizando em tempo real</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: 'Alvo', value: campaign.target_count, color: 'text-gray-900' },
                  { label: 'Enviados', value: campaign.sent_count, color: 'text-blue-600' },
                  { label: 'Entregues', value: campaign.delivered_count, color: 'text-emerald-600' },
                  { label: 'Lidos', value: campaign.read_count, color: 'text-indigo-600' },
                  { label: 'Responderam', value: campaign.replied_count, color: 'text-violet-600' },
                  { label: 'Falhas', value: campaign.failed_count, color: 'text-red-500' },
                  { label: 'Interessados', value: campaign.interested_count, color: 'text-emerald-600' },
                  { label: 'Neutros', value: campaign.neutral_count, color: 'text-gray-500' },
                  { label: 'Negativos', value: campaign.negative_count, color: 'text-red-500' },
                ].map(m => (
                  <div key={m.label} className={`rounded-xl p-3 text-center transition-colors duration-500 ${campaignIsRunning && (m.value || 0) > 0 ? 'bg-gray-100' : 'bg-gray-50'}`}>
                    <p className={`text-xl font-extrabold ${m.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value || 0}</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{m.label}</p>
                  </div>
                ))}
              </div>
            </>)}
          </>)}
        </div>

        {/* Footer — Save is disabled when campaign is in a state the backend
            no longer accepts edits ('running', 'sending', 'completed', etc).
            Backend rule (campaignEngine.updateCampaign): só rascunho/agendada/pausada. */}
        {(() => {
          const editableStatuses = new Set(['draft', 'scheduled', 'paused'])
          const canEdit = !isEdit /* new campaign always editable */ || editableStatuses.has(liveStatus)
          const blockReason = !canEdit ? (
            liveStatus === 'running' || liveStatus === 'sending' || liveStatus === 'active'
              ? 'Pause a campanha para editar a configuração.'
              : liveStatus === 'completed' || liveStatus === 'finished'
              ? 'Campanha finalizada — reabra para editar.'
              : liveStatus === 'cancelled'
              ? 'Campanha cancelada — reabra para editar.'
              : 'Esta campanha não pode ser editada agora.'
          ) : ''
          return (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition">
                Fechar
              </button>
              <div className="flex items-center gap-3">
                {!canEdit && (
                  <span className="text-[10px] text-amber-700 font-medium hidden sm:inline">{blockReason}</span>
                )}
                <button onClick={save} disabled={saving || !canEdit}
                  title={!canEdit ? blockReason : undefined}
                  className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm">
                  {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Campanha'}
                </button>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   ORDERS VIEW
   ══════════════════════════════════════════════ */

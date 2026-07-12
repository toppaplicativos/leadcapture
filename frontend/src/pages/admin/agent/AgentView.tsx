import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Select, fieldControlClass, fieldLabelLegacyClass, fieldTextareaClass } from '@/components/ui'
import { SquadRules } from '@/pages/admin/messages/SquadRules'

export function AgentView({ showToast }: { showToast: (t: string, tp?: 'ok' | 'err') => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  /* Tab principal — 'knowledge' substitui 'training' + 'skills' antigos (sub-abas dentro) */
  const [tab, setTab] = useState<'overview' | 'config' | 'squad' | 'knowledge'>('overview')
  /* Sub-aba dentro de Conhecimento: textos livres (knowledge_base) ou habilidades (brand_skills) */
  const [knowledgeTab, setKnowledgeTab] = useState<'texts' | 'skills'>('skills')
  const [saving, setSaving] = useState(false)

  // Config state
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [objective, setObjective] = useState('')
  const [businessContext, setBusinessContext] = useState('')
  const [communicationRules, setCommunicationRules] = useState('')
  const [trainingNotes, setTrainingNotes] = useState('')
  const [preferredTerms, setPreferredTerms] = useState('')
  const [forbiddenTerms, setForbiddenTerms] = useState('')
  const [includeEmojis, setIncludeEmojis] = useState(true)
  const [maxLength, setMaxLength] = useState('500')
  const [globalAiEnabled, setGlobalAiEnabled] = useState(false)
  const [globalAiReason, setGlobalAiReason] = useState('')

  // Training
  const [trainingText, setTrainingText] = useState('')
  const [trainingCategory, setTrainingCategory] = useState('faq')
  const [kbEntries, setKbEntries] = useState<any[]>([])

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/ai/workspace-overview', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/ai/agent-profile', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/inbox/ai-global-state', { headers: getHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch('/api/knowledge-base?limit=50', { headers: getHeaders() }).then(r => r.json()).catch(() => ({ entries: [] })),
    ]).then(([ws, profile, aiState, kb]) => {
      setData(ws.overview || ws)
      const p = profile.profile || {}
      setAgentName(p.agent_name || '')
      setTone(p.tone || 'friendly')
      setObjective(p.objective || '')
      setBusinessContext(p.business_context || '')
      setCommunicationRules(p.communication_rules || '')
      setTrainingNotes(p.training_notes || '')
      setPreferredTerms(Array.isArray(p.preferred_terms) ? p.preferred_terms.join(', ') : (p.preferred_terms || ''))
      setForbiddenTerms(Array.isArray(p.forbidden_terms) ? p.forbidden_terms.join(', ') : (p.forbidden_terms || ''))
      setIncludeEmojis(p.include_emojis !== false)
      setMaxLength(String(p.max_length || 500))
      const g = aiState.global_ai || {}
      // Respeita enabled real do backend (default desligado)
      setGlobalAiEnabled(g.enabled === true || g.enabled === 1 || g.enabled === 'true')
      setGlobalAiReason(g.reason || '')
      setKbEntries(kb.entries || [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  async function saveProfile() {
    setSaving(true)
    try {
      const splitCsv = (s: string) => s.split(/[,\n]/).map(t => t.trim()).filter(Boolean)
      await fetch('/api/ai/agent-profile', {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({
          agent_name: agentName,
          tone,
          objective,
          business_context: businessContext,
          communication_rules: communicationRules,
          training_notes: trainingNotes,
          preferred_terms: splitCsv(preferredTerms),
          forbidden_terms: splitCsv(forbiddenTerms),
          include_emojis: includeEmojis,
          max_length: Number(maxLength),
        }),
      })
      showToast('Perfil salvo!')
      load()
    } catch (e: any) { showToast(e.message, 'err') }
    setSaving(false)
  }

  async function toggleGlobalAi() {
    const newState = !globalAiEnabled
    try {
      await fetch('/api/inbox/ai-global-state', {
        method: 'PATCH', headers: getHeaders(),
        body: JSON.stringify({ enabled: newState, reason: newState ? 'Ativado pelo admin' : 'Pausado pelo admin' }),
      })
      setGlobalAiEnabled(newState)
      showToast(newState ? 'IA ativada globalmente!' : 'IA pausada globalmente')
    } catch (e: any) { showToast(e.message, 'err') }
  }

  async function addTraining() {
    const txt = trainingText.trim()
    if (!txt) return showToast('Texto obrigatorio', 'err')
    try {
      /* Backend exige { title, content }. Usamos o primeiro pedaço do texto como title (resumo)
       * e o texto inteiro como content. Categoria vai em campo separado. */
      const title = txt.split(/[\n\.\?]/)[0].slice(0, 120).trim() || txt.slice(0, 120)
      const r = await fetch('/api/knowledge-base', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ title, content: txt, category: trainingCategory, active: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Erro ${r.status} ao salvar conhecimento`)
      setTrainingText('')
      showToast('Conhecimento adicionado!')
      load()
    } catch (e: any) { showToast(e.message || 'Erro ao adicionar conhecimento', 'err') }
  }

  async function deleteKb(id: string) {
    try {
      await fetch(`/api/knowledge-base/${id}`, { method: 'DELETE', headers: getHeaders() })
      setKbEntries(prev => prev.filter(e => e.id !== id))
      showToast('Removido')
    } catch {}
  }

  if (loading) return <Skeleton rows={8} />

  const profile = data?.profile || {}
  const training = data?.training || {}
  const whatsapp = data?.whatsapp || {}
  const score = data?.readiness_score || 0

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button type="button" onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  )

  const tabs = [
    { key: 'overview', label: 'Visao Geral' },
    { key: 'config', label: 'Configuracao' },
    { key: 'squad', label: 'Squad & Atendimento' },
    { key: 'knowledge', label: 'Conhecimento' },
  ]

  return (
    <div className="space-y-5">
      {/* Atalho para o treino multi-canal (Global + Instagram + WhatsApp) */}
      <button
        type="button"
        onClick={() => navigate('/atendente')}
        className="w-full text-left rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 hover:bg-emerald-100/80 transition"
      >
        <p className="text-sm font-bold text-emerald-900">Treinamento Global + Atendimento por canal</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">
          Abra <strong>/atendente</strong> para proposta de valor, objeções, treino do Instagram e do WhatsApp, limites e split multi-bolha.
        </p>
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[26px] font-bold text-gray-900 tracking-tight">Agente IA</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">Gemini 2.5 Flash · {agentName || 'Assistente'}</p>
        </div>
        {/* Global AI toggle */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${globalAiEnabled ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-red-50 ring-1 ring-red-200'}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${globalAiEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-xs font-bold ${globalAiEnabled ? 'text-emerald-700' : 'text-red-700'}`}>{globalAiEnabled ? 'IA Ativa' : 'IA Pausada'}</span>
            <Toggle value={globalAiEnabled} onChange={toggleGlobalAi} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl overflow-x-auto scrollbar-hide">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === 'overview' && (<>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 bg-gray-900 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Prontidao</p>
                <p className="text-4xl font-extrabold mt-1">{score}<span className="text-lg text-white/50">%</span></p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{profile.agent_name || 'Agente'}</p>
                <p className="text-[10px] text-white/50">{profile.tone === 'friendly' ? 'Tom amigavel' : profile.tone} · {profile.language}</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/80 rounded-full transition-all" style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-border-light p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ${whatsapp.autonomous ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-xs font-bold text-gray-700">WhatsApp</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-extrabold text-gray-900">{training.total_entries || 0}</p>
                <p className="text-[8px] text-gray-400">Treinamentos</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-1.5 text-center">
                <p className="text-sm font-extrabold text-gray-900">{kbEntries.length}</p>
                <p className="text-[8px] text-gray-400">Base Conhec.</p>
              </div>
            </div>
          </div>
        </div>
        {/* ── Checklist de prontidão: o que falta para 100% ── */}
        {Array.isArray(data?.readiness_checklist) && (() => {
          const checklist = data.readiness_checklist as Array<{
            id: string
            group: 'profile' | 'training' | 'automation' | 'performance'
            title: string
            description: string
            why: string
            points_earned: number
            points_max: number
            done: boolean
            action_tab: 'config' | 'squad' | 'training' | 'overview'
            action_field?: string
            cta_label: string
          }>
          const pending = checklist.filter(c => !c.done)
          const completed = checklist.filter(c => c.done)

          if (pending.length === 0) {
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Agente 100% configurado</p>
                  <p className="text-[11px] text-emerald-600">Todos os {completed.length} itens completos.</p>
                </div>
              </div>
            )
          }

          const groupOrder: Array<'profile' | 'training' | 'automation' | 'performance'> = ['profile', 'training', 'automation', 'performance']
          const groupLabels: Record<string, string> = {
            profile: 'Identidade e regras do agente',
            training: 'Base de conhecimento',
            automation: 'Automação',
            performance: 'Performance da operação',
          }
          const groupIcons: Record<string, typeof Brain> = {
            profile: Brain,
            training: FileText,
            automation: Bot,
            performance: BarChart3,
          }

          function goToItem(item: typeof pending[0]) {
            setTab(item.action_tab as any)
            if (item.action_field) {
              setTimeout(() => {
                const el = document.querySelector(`[data-field="${item.action_field}"]`)
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  const input = (el as HTMLElement).parentElement?.querySelector('input, textarea, select') as HTMLElement | null
                  input?.focus()
                }
              }, 200)
            }
          }

          return (
            <div className="bg-white rounded-2xl border border-border-light p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Tarefas para atingir 100%</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{pending.length} item(ns) pendente(s) · {completed.length} completo(s)</p>
                </div>
              </div>

              <div className="space-y-4">
                {groupOrder.filter(g => pending.some(p => p.group === g)).map(group => {
                  const items = pending.filter(p => p.group === group)
                  const GroupIcon = groupIcons[group]
                  return (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-2">
                        <GroupIcon size={13} strokeWidth={1.75} className="text-gray-400" />
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{groupLabels[group]}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {items.map(item => (
                          <div key={item.id} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2 hover:border-gray-300 hover:bg-gray-50 transition">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-gray-900 leading-snug">{item.title}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>
                              </div>
                              <span className="text-[10px] font-bold text-gray-400 tabular-nums whitespace-nowrap shrink-0">
                                +{item.points_max}pt
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 italic leading-relaxed">{item.why}</p>
                            <button
                              onClick={() => goToItem(item)}
                              className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 transition mt-0.5"
                            >
                              {item.cta_label}
                              <ArrowRight size={11} strokeWidth={2.25} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {completed.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-gray-400 hover:text-gray-600 list-none flex items-center gap-1.5 select-none">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      {completed.length} item(ns) já completo(s)
                      <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 pl-5">
                      {completed.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                          <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                          <span className="truncate">{item.title}</span>
                          <span className="text-[10px] text-gray-300 tabular-nums">+{item.points_earned}pt</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )
        })()}

        {profile.objective && (
          <div className="bg-white rounded-2xl border border-border-light p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1.5">Diretriz</p>
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{profile.objective}</p>
          </div>
        )}
      </>)}

      {/* ── Tab: Config ── */}
      {tab === 'config' && (<>
        <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabelLegacyClass}>Nome do Agente</label>
              <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Ex: Consultor Alho Pronto"
                className={fieldControlClass} />
            </div>
            <div>
              <Select
                label="Tom de voz"
                value={tone}
                onChange={e => setTone(e.target.value)}
              >
                <option value="friendly">Amigavel</option>
                <option value="professional">Profissional</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </Select>
            </div>
          </div>
          <div>
            <label className={fieldLabelLegacyClass}>Objetivo do Agente</label>
            <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} placeholder="O que o agente deve fazer..."
              className={fieldTextareaClass} />
          </div>
          <div>
            <label data-field="business_context" className={fieldLabelLegacyClass}>Contexto do Negocio</label>
            <textarea value={businessContext} onChange={e => setBusinessContext(e.target.value)} rows={3} placeholder="Descreva seu negocio, produtos, diferenciais..."
              className={fieldTextareaClass} />
          </div>
          <div>
            <label data-field="communication_rules" className={fieldLabelLegacyClass}>Regras de Comunicacao</label>
            <textarea value={communicationRules} onChange={e => setCommunicationRules(e.target.value)} rows={3}
              placeholder="Como o agente deve escrever: tom, formalidade, limites, padroes de fechamento..."
              className={fieldTextareaClass} />
          </div>
          <div>
            <label data-field="training_notes" className={fieldLabelLegacyClass}>Notas de Treinamento</label>
            <textarea value={trainingNotes} onChange={e => setTrainingNotes(e.target.value)} rows={3}
              placeholder="Aprendizados internos, padroes de objecao, scripts da equipe..."
              className={fieldTextareaClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label data-field="preferred_terms" className={fieldLabelLegacyClass}>Termos Preferidos</label>
              <input type="text" value={preferredTerms} onChange={e => setPreferredTerms(e.target.value)}
                placeholder="parceiro, sob medida, premium (separe por virgula)"
                className={fieldControlClass} />
              <p className="text-[10px] text-gray-500 mt-1">Palavras que a marca quer ver nas respostas.</p>
            </div>
            <div>
              <label data-field="forbidden_terms" className={fieldLabelLegacyClass}>Termos Proibidos</label>
              <input type="text" value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)}
                placeholder="barato, mais ou menos, nome do concorrente (separe por virgula)"
                className={fieldControlClass} />
              <p className="text-[10px] text-gray-500 mt-1">Palavras que NUNCA podem aparecer nas respostas.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
              <span className="text-xs font-medium text-gray-600">Usar emojis</span>
              <Toggle value={includeEmojis} onChange={() => setIncludeEmojis(!includeEmojis)} />
            </div>
            <div>
              <label className={fieldLabelLegacyClass}>Max. caracteres</label>
              <input type="number" value={maxLength} onChange={e => setMaxLength(e.target.value)} min={100} max={2000}
                className={fieldControlClass} />
            </div>
          </div>
          <button onClick={saveProfile} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50 transition shadow-sm">
            {saving ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </>)}

      {/* ── Tab: Squad & Atendimento ──
          Antes tinha 3 cards "Autonomo/Co-piloto/Manual" decorativos (Co-piloto era
          hardcoded active=false sem backend). Removido. Agora soh o card REAL do
          toggle Global + os regras (SquadRules que ja sao funcionais). */}
      {tab === 'squad' && (<>
        {/* Status Global da IA — card unico, REAL */}
        <div className={`rounded-2xl p-5 border ${globalAiEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`w-12 h-12 rounded-xl grid place-items-center shrink-0 ${globalAiEnabled ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                <Bot size={22} className="text-white" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-bold text-gray-900">Atendimento autonomo da IA</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                    globalAiEnabled ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                  }`}>
                    {globalAiEnabled ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
                <p className="text-[12px] text-gray-700 mt-1 leading-snug">
                  {globalAiEnabled
                    ? 'O agente responde automaticamente todas as conversas usando o perfil, conhecimento e habilidades configurados.'
                    : 'O agente esta pausado. Todas as mensagens entram em fila no menu Mensagens para atendimento manual.'}
                </p>
                {globalAiReason && (
                  <p className="text-[11px] text-gray-600 mt-1.5 italic">Motivo: {globalAiReason}</p>
                )}
              </div>
            </div>
            <Toggle value={globalAiEnabled} onChange={toggleGlobalAi} />
          </div>

          {/* Ações relacionadas */}
          <div className="mt-4 pt-4 border-t border-emerald-200/60 flex items-center gap-2 flex-wrap">
            <a href="/mensagens" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 text-[11.5px] font-semibold text-gray-700 transition">
              <MessageSquare size={12} strokeWidth={2.25} />
              Ver mensagens
            </a>
            <a href="/whatsapp" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 text-[11.5px] font-semibold text-gray-700 transition">
              <Phone size={12} strokeWidth={2.25} />
              Instancias WhatsApp
            </a>
            <span className="text-[10.5px] text-gray-500 ml-auto">
              Pause/ative individualmente por conversa no menu <a href="/mensagens" className="underline font-semibold hover:text-gray-900">Mensagens</a>.
            </span>
          </div>
        </div>

        {/* Regras de comportamento — funcionais */}
        <SquadRules showToast={showToast} />
      </>)}

      {/* ── Tab: Conhecimento (unificado) ──
          Antes eram 2 tabs separadas (Treinamento + Habilidades). Agora 1 tab com 2 sub-abas:
            - Habilidades — brand_skills estruturadas (squad IA multimodal, plugado no composer)
            - Textos livres — knowledge_base (texto solto, contexto extra no prompt)
          Sub-aba default = Habilidades (mais poderosa e nova). */}
      {tab === 'knowledge' && (<>
        {/* Sub-abas */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setKnowledgeTab('skills')}
            className={`h-9 px-4 rounded-lg text-[12.5px] font-bold transition ${
              knowledgeTab === 'skills' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Habilidades
          </button>
          <button
            onClick={() => setKnowledgeTab('texts')}
            className={`h-9 px-4 rounded-lg text-[12.5px] font-bold transition ${
              knowledgeTab === 'texts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Textos livres
          </button>
          <span className="ml-2 text-[10.5px] text-gray-400 font-medium hidden sm:inline">
            {knowledgeTab === 'skills'
              ? 'Habilidades treinadas com IA (multimodal) que disparam por gatilho'
              : 'Anotações de texto solto - vai sempre no prompt do agente como contexto extra'}
          </span>
        </div>

        {/* Sub-aba: Habilidades */}
        {knowledgeTab === 'skills' && (
          <div className="-mx-4 sm:-mx-6">
            <BrandSkillsPage />
          </div>
        )}

        {/* Sub-aba: Textos livres (knowledge_base antigo) */}
        {knowledgeTab === 'texts' && (<>
          <div className="bg-white rounded-2xl border border-border-light p-5 space-y-4">
            <p className="text-sm font-bold text-gray-900">Adicionar texto livre</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <textarea value={trainingText} onChange={e => setTrainingText(e.target.value)} rows={2}
                  placeholder="Ex: Nosso alho descascado tipo A e ideal para restaurantes que processam grandes volumes..."
                  className={fieldTextareaClass} />
              </div>
              <div className="flex flex-col gap-2">
                <Select
                  value={trainingCategory}
                  onChange={e => setTrainingCategory(e.target.value)}
                  className="h-10 text-xs"
                  aria-label="Categoria do texto"
                >
                  <option value="faq">FAQ</option>
                  <option value="produto">Produto</option>
                  <option value="preco">Preço</option>
                  <option value="entrega">Entrega</option>
                  <option value="geral">Geral</option>
                </Select>
                <button onClick={addTraining}
                  className="px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold transition">Adicionar</button>
              </div>
            </div>
            <p className="text-[10.5px] text-gray-400 leading-snug">
              <b>Quando usar:</b> anotações soltas que o agente deve ter sempre em mente (FAQ, polítca, observações).
              Para habilidades estruturadas com gatilhos e dados, use a aba <b>Habilidades</b>.
            </p>
          </div>

          {/* KB entries */}
          <div className="bg-white rounded-2xl border border-border-light overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">Base de Conhecimento</p>
              <span className="text-[10px] text-gray-400">{kbEntries.length} entradas</span>
            </div>
            {kbEntries.length === 0 ? (
              <div className="py-10 text-center"><p className="text-xs text-gray-400">Nenhum conhecimento cadastrado</p></div>
            ) : kbEntries.map((e: any) => (
              <div key={e.id} className="px-4 py-3 border-b border-gray-100 last:border-0 flex items-start gap-3">
                <span className="text-[9px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 shrink-0">{e.category || 'geral'}</span>
                <p className="text-xs text-gray-600 flex-1 line-clamp-2">{e.question || e.answer || e.content}</p>
                <button onClick={() => deleteKb(e.id)} className="text-gray-400 hover:text-red-500 transition shrink-0 p-1"><X size={12} /></button>
              </div>
            ))}
          </div>
        </>)}
      </>)}
    </div>
  )
}

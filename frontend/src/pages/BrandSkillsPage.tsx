/**
 * BrandSkillsPage — gerencia as habilidades treinaveis do brand atual.
 *
 * Abas:
 *   1. "Minhas Habilidades" — lista de skills criadas (custom + de template)
 *   2. "Galeria" — catálogo de 10 templates prontos, ativar com 1 clique
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Plus, RefreshCw, CheckCircle2, Pause, Trash2, Sparkles,
  FileText, Image as ImageIcon, Table2, Calculator, Layers, Shield,
  Lightbulb, Loader2, AlertCircle, X, ChevronRight, Activity,
  Target, ShoppingBag, UserCheck, HeartHandshake, HelpCircle,
  RotateCcw, CalendarCheck, Building2, ShieldCheck, LayoutGrid,
  ListChecks, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SkillTrainerWizardModal } from '@/components/SkillTrainerWizardModal'
import { useSkillsBridgeOptional } from '@/lib/agent/SkillsBridgeContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'

type SkillType = 'info' | 'calculator' | 'lookup' | 'flow' | 'policy'
type TabId = 'skills' | 'gallery'

interface BrandSkill {
  id: string
  slug: string
  name: string
  description: string
  skill_type: SkillType
  trigger_intents: string[]
  trigger_keywords: string[]
  trigger_examples: string[]
  instructions: string
  data_payload: any
  examples: Array<{ q: string; a: string }>
  confidence_score: number
  is_active: boolean
  sort_order: number
  source_summary: string
  created_at: string
  updated_at: string
}

interface SkillMaterial {
  id: string
  kind: 'text' | 'image' | 'table' | 'pdf' | 'url' | 'audio'
  content_text: string | null
  original_filename: string | null
  mime_type: string | null
  extracted_data: any
  size_bytes: number | null
  uploaded_at: string
}

interface SkillTemplate {
  id: string
  name: string
  description: string
  long_description: string
  skill_type: SkillType
  category: 'vendas' | 'atendimento' | 'produto' | 'suporte'
  icon: string
  color: string
  already_active: boolean
  active_skill_id: string | null
  confidence_score: number
}

/* ─────────────── Metadados visuais ─────────────── */

const TYPE_META: Record<SkillType, { label: string; Icon: LucideIcon; color: string }> = {
  info:       { label: 'Informativa',  Icon: Lightbulb,  color: 'sky' },
  calculator: { label: 'Calculadora',  Icon: Calculator, color: 'violet' },
  lookup:     { label: 'Consulta',     Icon: Layers,     color: 'emerald' },
  flow:       { label: 'Fluxo',        Icon: Activity,   color: 'amber' },
  policy:     { label: 'Política',     Icon: Shield,     color: 'rose' },
}

const TYPE_PALETTE: Record<string, { bg: string; text: string; ring: string; chip: string }> = {
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-200',     chip: 'bg-sky-100 text-sky-700' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-200',  chip: 'bg-violet-100 text-violet-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', chip: 'bg-emerald-100 text-emerald-700' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   chip: 'bg-amber-100 text-amber-700' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200',    chip: 'bg-rose-100 text-rose-700' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-200',  chip: 'bg-indigo-100 text-indigo-700' },
}

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Target, ShoppingBag, ShieldCheck, UserCheck, Calculator,
  HeartHandshake, Building2, HelpCircle, RotateCcw, CalendarCheck,
  Brain, Sparkles, Zap,
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  vendas:       { label: 'Vendas',      color: 'bg-rose-100 text-rose-700' },
  atendimento:  { label: 'Atendimento', color: 'bg-sky-100 text-sky-700' },
  produto:      { label: 'Produto',     color: 'bg-violet-100 text-violet-700' },
  suporte:      { label: 'Suporte',     color: 'bg-emerald-100 text-emerald-700' },
}

/* ─────────────── Helpers ─────────────── */

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function fmtRelative(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `há ${Math.round(diff / 1000)}s`
  if (diff < 3600_000) return `há ${Math.round(diff / 60_000)} min`
  if (diff < 86400_000) return `há ${Math.round(diff / 3600_000)}h`
  return `há ${Math.round(diff / 86400_000)}d`
}

/* ═══════════════════════════════════════════════════════════════════
   Página principal
   ═══════════════════════════════════════════════════════════════════ */

export function BrandSkillsPage() {
  const skillsBridge = useSkillsBridgeOptional()
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState<TabId>('skills')
  const [skills, setSkills] = useState<BrandSkill[]>([])
  const [templates, setTemplates] = useState<SkillTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [openSkillId, setOpenSkillId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadSkills = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/brand-skills', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setSkills(Array.isArray(d?.skills) ? d.skills : [])
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar habilidades')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const r = await fetch('/api/brand-skills/templates', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setTemplates(Array.isArray(d?.templates) ? d.templates : [])
    } catch (e: any) {
      showToast(e?.message || 'Erro ao carregar galeria', 'err')
    } finally {
      setTemplatesLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadSkills() }, [loadSkills])

  useEffect(() => {
    if (!skillsBridge?.publishSnapshot || !isDesktop || loading) return
    const rows = skills.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.skill_type,
      active: s.is_active,
      confidence: s.confidence_score,
    }))
    skillsBridge.publishSnapshot({
      skills: rows,
      total: skills.length,
      activeCount: skills.filter((s) => s.is_active).length,
      selectedId: openSkillId,
      selectedName: openSkillId ? (skills.find((s) => s.id === openSkillId)?.name || '') : '',
      loading: false,
    })
  }, [skillsBridge, isDesktop, loading, skills, openSkillId])

  useEffect(() => {
    if (tab === 'gallery' && templates.length === 0) loadTemplates()
  }, [tab, templates.length, loadTemplates])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lead-system:active-brand-id') {
        loadSkills()
        setTemplates([]) // force reload on brand switch
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [loadSkills])

  const handleToggle = useCallback(async (id: string) => {
    setTogglingId(id)
    try {
      const r = await fetch(`/api/brand-skills/${id}/toggle`, { method: 'POST', headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Falha')
      showToast(d?.skill?.is_active ? 'Habilidade ativada' : 'Habilidade pausada')
      await loadSkills()
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    } finally {
      setTogglingId(null)
    }
  }, [loadSkills, showToast])

  const handleRemove = useCallback(async (id: string) => {
    if (!confirm('Excluir essa habilidade? Esta ação não pode ser desfeita.')) return
    setRemovingId(id)
    try {
      const r = await fetch(`/api/brand-skills/${id}`, { method: 'DELETE', headers: getHeaders() })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        throw new Error(d?.error || `Erro ${r.status}`)
      }
      showToast('Removida')
      await loadSkills()
      /* Atualiza flag de ativo nos templates */
      setTemplates((prev) => prev.map((t) =>
        t.active_skill_id === id ? { ...t, already_active: false, active_skill_id: null } : t
      ))
    } catch (e: any) {
      showToast(e?.message || 'Erro', 'err')
    } finally {
      setRemovingId(null)
    }
  }, [loadSkills, showToast])

  const handleActivateTemplate = useCallback(async (templateId: string) => {
    setActivatingId(templateId)
    try {
      const r = await fetch(`/api/brand-skills/templates/${templateId}/activate`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      const msg = d.customized
        ? 'Habilidade criada e personalizada para seu brand'
        : 'Habilidade ativada'
      showToast(msg)
      /* Atualiza template como ativo */
      setTemplates((prev) => prev.map((t) =>
        t.id === templateId
          ? { ...t, already_active: true, active_skill_id: d.skill?.id || null }
          : t
      ))
      await loadSkills()
    } catch (e: any) {
      showToast(e?.message || 'Erro ao ativar', 'err')
    } finally {
      setActivatingId(null)
    }
  }, [loadSkills, showToast])

  const stats = {
    total: skills.length,
    active: skills.filter((s) => s.is_active).length,
    paused: skills.filter((s) => !s.is_active).length,
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Brain size={18} strokeWidth={2.25} className="text-gray-900" />
            Habilidades do agente
          </h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">
            Treine habilidades especificas ou ative templates prontos. O agente usa em todas as conversas do brand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadSkills}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-[12.5px] font-semibold text-gray-700 transition">
            <RefreshCw size={13} strokeWidth={2.25} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button onClick={() => setWizardOpen(true)}
            className="ai-shimmer relative overflow-hidden inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[12.5px] font-bold transition">
            <Sparkles size={13} strokeWidth={2.5} className="relative z-10" />
            <span className="relative z-10">Criar habilidade</span>
            <Plus size={13} strokeWidth={2.5} className="relative z-10" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Ativas', value: stats.active, color: 'text-emerald-600' },
          { label: 'Pausadas', value: stats.paused, color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl bg-white border border-gray-200">
            <div className={`text-[22px] font-bold tabular-nums leading-none ${s.color}`}>{s.value}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-gray-500 mt-1 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: 'skills' as TabId, label: 'Minhas Habilidades', Icon: ListChecks },
          { id: 'gallery' as TabId, label: 'Galeria de Templates', Icon: LayoutGrid },
        ]).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12.5px] font-semibold transition ${
              tab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={13} strokeWidth={2.25} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Minhas Habilidades ── */}
      {tab === 'skills' && (
        <>
          {loading ? (
            <div className="py-20 grid place-items-center text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : skills.length === 0 ? (
            <EmptySkills
              onWizard={() => setWizardOpen(true)}
              onGallery={() => setTab('gallery')}
            />
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id} skill={skill}
                  isToggling={togglingId === skill.id}
                  isRemoving={removingId === skill.id}
                  onToggle={() => handleToggle(skill.id)}
                  onRemove={() => handleRemove(skill.id)}
                  onOpen={() => setOpenSkillId(skill.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Galeria ── */}
      {tab === 'gallery' && (
        <GalleryTab
          templates={templates}
          loading={templatesLoading}
          activatingId={activatingId}
          onActivate={handleActivateTemplate}
          onViewSkill={(id) => { setTab('skills'); setOpenSkillId(id) }}
        />
      )}

      {/* Wizard de criar skill */}
      <SkillTrainerWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSkillCreated={(id) => {
          loadSkills()
          setTimeout(() => setOpenSkillId(id), 400)
        }}
      />

      {/* Detalhe da skill */}
      {openSkillId && (
        <SkillDetailModal
          skillId={openSkillId}
          onClose={() => setOpenSkillId(null)}
          onChanged={loadSkills}
          showToast={showToast}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-[12.5px] font-semibold ${
          toast.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}

/* ─────────────── Empty state com call-to-action pra galeria ─────────────── */

function EmptySkills({ onWizard, onGallery }: { onWizard: () => void; onGallery: () => void }) {
  return (
    <div className="py-12 text-center">
      <Brain size={28} className="mx-auto mb-3 opacity-30 text-gray-500" strokeWidth={1.5} />
      <p className="text-[13px] font-semibold text-gray-700">Nenhuma habilidade ainda</p>
      <p className="text-[12px] text-gray-500 mt-1 max-w-md mx-auto">
        Ative templates prontos da galeria com 1 clique, ou crie uma habilidade customizada com o treinador.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
        <button onClick={onGallery}
          className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-gray-900 hover:bg-black text-white text-[13px] font-bold transition">
          <LayoutGrid size={14} strokeWidth={2.25} />
          Ver galeria de templates
        </button>
        <button onClick={onWizard}
          className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[13px] font-semibold transition">
          <Plus size={14} strokeWidth={2.25} />
          Criar do zero
        </button>
      </div>
    </div>
  )
}

/* ─────────────── Galeria de templates ─────────────── */

function GalleryTab({
  templates, loading, activatingId, onActivate, onViewSkill,
}: {
  templates: SkillTemplate[]
  loading: boolean
  activatingId: string | null
  onActivate: (id: string) => void
  onViewSkill: (skillId: string) => void
}) {
  if (loading) {
    return <div className="py-20 grid place-items-center text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
  }

  if (templates.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 text-[13px]">
        <LayoutGrid size={24} className="mx-auto mb-3 opacity-30" />
        Galeria não disponível
      </div>
    )
  }

  const categories = ['vendas', 'produto', 'atendimento', 'suporte'] as const
  const byCategory = Object.fromEntries(
    categories.map((c) => [c, templates.filter((t) => t.category === c)])
  )

  const activeCount = templates.filter((t) => t.already_active).length

  return (
    <div className="space-y-8">
      {/* Intro banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 text-white flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-white/10 grid place-items-center">
          <Zap size={18} strokeWidth={2} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold">Templates prontos — IA personaliza para o seu negócio</p>
          <p className="text-[11.5px] text-gray-300 mt-0.5 leading-relaxed">
            Clique em "Ativar" e a IA lê o perfil do seu brand (nome, produtos, tom) e cria a habilidade já adaptada. Leva ~10 segundos.
          </p>
        </div>
        {activeCount > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-[22px] font-bold tabular-nums leading-none">{activeCount}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">ativas</p>
          </div>
        )}
      </div>

      {/* Grid por categoria */}
      {categories.map((cat) => {
        const group = byCategory[cat]
        if (!group || group.length === 0) return null
        const { label, color } = CATEGORY_META[cat]
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${color}`}>
                {label}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {group.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  activating={activatingId === template.id}
                  onActivate={() => onActivate(template.id)}
                  onViewSkill={template.active_skill_id ? () => onViewSkill(template.active_skill_id!) : undefined}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── Card de template ─────────────── */

function TemplateCard({
  template, activating, onActivate, onViewSkill,
}: {
  template: SkillTemplate
  activating: boolean
  onActivate: () => void
  onViewSkill?: () => void
}) {
  const palette = TYPE_PALETTE[template.color] || TYPE_PALETTE.sky
  const Icon = TEMPLATE_ICONS[template.icon] || Brain
  const typeMeta = TYPE_META[template.skill_type]
  const typeChip = TYPE_PALETTE[typeMeta?.color || 'sky']

  return (
    <div className={`relative p-4 rounded-xl bg-white border transition-all ${
      template.already_active
        ? 'border-emerald-200 ring-1 ring-emerald-100'
        : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Badge ativa */}
      {template.already_active && (
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9.5px] font-bold uppercase tracking-wider">
          <CheckCircle2 size={9} strokeWidth={2.5} />
          Ativa
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Ícone */}
        <div className={`shrink-0 w-10 h-10 rounded-lg grid place-items-center ${palette.bg} ring-1 ${palette.ring}`}>
          <Icon size={18} strokeWidth={1.75} className={palette.text} />
        </div>

        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-[13.5px] font-bold text-gray-900">{template.name}</h3>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${typeChip.chip}`}>
              {typeMeta?.label}
            </span>
          </div>
          <p className="text-[11.5px] text-gray-500 mt-1 leading-snug line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>

      {/* Ações */}
      <div className="mt-3.5 flex items-center gap-2">
        {template.already_active ? (
          <>
            <div className="flex-1 flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11.5px] font-semibold">
              <CheckCircle2 size={11} strokeWidth={2.5} />
              Habilidade ativa no agente
            </div>
            {onViewSkill && (
              <button onClick={onViewSkill}
                className="h-8 px-3 rounded-lg border border-gray-200 hover:border-gray-300 text-[11.5px] font-semibold text-gray-600 hover:text-gray-900 transition">
                Ver
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onActivate}
            disabled={activating}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-gray-900 hover:bg-black text-white text-[11.5px] font-bold transition disabled:opacity-60"
          >
            {activating ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Personalizando...
              </>
            ) : (
              <>
                <Sparkles size={11} strokeWidth={2.5} />
                Ativar para este brand
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────── Card individual de skill ─────────────── */

function SkillCard({ skill, isToggling, isRemoving, onToggle, onRemove, onOpen }: {
  skill: BrandSkill
  isToggling: boolean
  isRemoving: boolean
  onToggle: () => void
  onRemove: () => void
  onOpen: () => void
}) {
  const typeMeta = TYPE_META[skill.skill_type] || TYPE_META.info
  const palette = TYPE_PALETTE[typeMeta.color] || TYPE_PALETTE.sky
  const Icon = typeMeta.Icon
  const isFromTemplate = skill.source_summary?.startsWith('template:')

  return (
    <article className="p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-all group">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg grid place-items-center ${palette.bg} ring-1 ${palette.ring}`}>
          <Icon size={18} strokeWidth={1.75} className={palette.text} />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-gray-900 truncate">{skill.name}</h3>
            <span className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${palette.chip}`}>
              {typeMeta.label}
            </span>
            {isFromTemplate && (
              <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                Template
              </span>
            )}
            {skill.is_active ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={9} strokeWidth={2.5} />
                Ativa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                <Pause size={9} strokeWidth={2.5} />
                Pausada
              </span>
            )}
            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {skill.confidence_score}/100
            </span>
          </div>
          <p className="text-[12px] text-gray-600 mt-1 leading-snug line-clamp-2">{skill.description}</p>

          {skill.trigger_keywords.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {skill.trigger_keywords.slice(0, 5).map((kw, i) => (
                <span key={i} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600">{kw}</span>
              ))}
              {skill.trigger_keywords.length > 5 && (
                <span className="text-[9.5px] text-gray-400">+{skill.trigger_keywords.length - 5}</span>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-[10.5px] text-gray-500 font-medium">
            <span>Criada {fmtRelative(skill.created_at)}</span>
            {!isFromTemplate && <><span>·</span><span>{skill.source_summary || 'sem materiais'}</span></>}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <button onClick={onOpen} title="Detalhes"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition">
            <ChevronRight size={14} strokeWidth={2.25} />
          </button>
          <button onClick={onRemove} disabled={isRemoving} title="Remover"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-rose-700 hover:bg-rose-50 transition disabled:opacity-40">
            {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.25} />}
          </button>
          <button onClick={onToggle} disabled={isToggling}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11.5px] font-bold transition disabled:opacity-40 ${
              skill.is_active
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}>
            {isToggling ? <Loader2 size={12} className="animate-spin" /> :
             skill.is_active ? <Pause size={11} strokeWidth={2.5} /> :
             <CheckCircle2 size={11} strokeWidth={2.5} />}
            {skill.is_active ? 'Pausar' : 'Ativar'}
          </button>
        </div>
      </div>
    </article>
  )
}

/* ─────────────── Modal de detalhe ─────────────── */

function SkillDetailModal({ skillId, onClose, onChanged, showToast }: {
  skillId: string
  onClose: () => void
  onChanged: () => void
  showToast: (t: string, k?: 'ok' | 'err') => void
}) {
  const [skill, setSkill] = useState<BrandSkill | null>(null)
  const [materials, setMaterials] = useState<SkillMaterial[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/brand-skills/${skillId}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) {
          setSkill(d.skill); setMaterials(d.materials || []); setRuns(d.runs || [])
        }
      })
      .finally(() => setLoading(false))
  }, [skillId])

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-bold text-gray-900 truncate">{skill?.name || 'Carregando…'}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{skill?.skill_type ? TYPE_META[skill.skill_type]?.label : ''} · confidence {skill?.confidence_score || 0}/100</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading || !skill ? (
            <div className="py-12 grid place-items-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              <Section title="Descrição">
                <p className="text-[13px] text-gray-800 leading-relaxed">{skill.description}</p>
              </Section>

              <Section title="Gatilhos">
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Keywords</p>
                    <div className="flex flex-wrap gap-1">
                      {skill.trigger_keywords.map((k, i) => (
                        <span key={i} className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700">{k}</span>
                      ))}
                    </div>
                  </div>
                  {skill.trigger_examples.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Exemplos</p>
                      <ul className="space-y-1">
                        {skill.trigger_examples.map((ex, i) => (
                          <li key={i} className="text-[12px] text-gray-700">· "{ex}"</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Instruções pro agente">
                <pre className="text-[12px] text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3 font-sans">
                  {skill.instructions}
                </pre>
              </Section>

              {skill.examples.length > 0 && (
                <Section title="Exemplos de Q&A">
                  <div className="space-y-2">
                    {skill.examples.map((ex, i) => (
                      <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1">
                        <p className="text-[11.5px] font-bold text-gray-500">Cliente:</p>
                        <p className="text-[12.5px] text-gray-800">"{ex.q}"</p>
                        <p className="text-[11.5px] font-bold text-emerald-700 mt-1.5">Agente:</p>
                        <p className="text-[12.5px] text-gray-800">"{ex.a}"</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {skill.data_payload && (
                <Section title="Dados estruturados">
                  <details>
                    <summary className="cursor-pointer text-[11.5px] font-semibold text-gray-600 hover:text-gray-900">Ver JSON</summary>
                    <pre className="mt-1.5 text-[10.5px] bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all max-h-60">
                      {JSON.stringify(skill.data_payload, null, 2)}
                    </pre>
                  </details>
                </Section>
              )}

              {materials.length > 0 && (
                <Section title={`Materiais (${materials.length})`}>
                  <div className="space-y-1">
                    {materials.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[11.5px]">
                        {m.kind === 'image' ? <ImageIcon size={12} strokeWidth={2} className="text-gray-400" /> :
                         m.kind === 'table' ? <Table2 size={12} strokeWidth={2} className="text-gray-400" /> :
                         <FileText size={12} strokeWidth={2} className="text-gray-400" />}
                        <span className="flex-1 text-gray-700 truncate">{m.original_filename || `${m.kind} (texto)`}</span>
                        <span className="text-[10px] text-gray-400">{m.size_bytes ? `${Math.round(m.size_bytes / 1024)}KB` : ''}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {runs.length > 0 && (
                <Section title={`Histórico de uso (${runs.length})`}>
                  <div className="space-y-1">
                    {runs.slice(0, 5).map((r) => (
                      <div key={r.id} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[11px]">
                        <div className="flex items-center justify-between text-gray-600">
                          <span>Matched score: <b>{r.matched_score}</b></span>
                          <span className="text-[10px] text-gray-400">{fmtRelative(r.executed_at)}</span>
                        </div>
                        {r.input && <p className="text-[11px] text-gray-700 mt-0.5 line-clamp-1">→ "{r.input}"</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{title}</p>
      {children}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, ChevronRight, GraduationCap } from 'lucide-react'
import { affiliateAppCache } from '@/lib/affiliate-app-cache'
import { AffiliateCommissionCard } from '@/pages/affiliate/AffiliateCommissionCard'
import type { AppContext } from '@/pages/affiliate/types'
import type { AffiliateLearningModule } from '@/lib/affiliates/types'

const PROGRESS_KEY = 'lc-affiliate-learning-progress'

function readProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
  } catch {
    return {}
  }
}

function markRead(moduleId: string) {
  const p = readProgress()
  p[moduleId] = true
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 pb-2">
      <div className="affiliate-skel h-20 w-full" />
      <div className="affiliate-skel h-16 w-full" />
      <div className="affiliate-skel h-16 w-full" />
      <div className="affiliate-skel h-36 w-full" />
    </div>
  )
}

type Props = {
  ctx: AppContext
}

export function AffiliateLearningPanel({ ctx }: Props) {
  const snap = affiliateAppCache.get()
  const [modules, setModules] = useState<AffiliateLearningModule[]>(snap.learningModules || [])
  const [training, setTraining] = useState<any>(snap.training)
  const [loading, setLoading] = useState(snap.learningModules == null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [progress, setProgress] = useState(readProgress)

  useEffect(() => {
    let cancelled = false
    affiliateAppCache.prefetchAll({ region: ctx.affiliate?.region })
      .then(() => {
        if (cancelled) return
        const c = affiliateAppCache.get()
        if (c.learningModules) setModules(c.learningModules)
        if (c.training) setTraining(c.training)
      })
      .catch(() => {
        if (!cancelled && !affiliateAppCache.get().learningModules) {
          ctx.showToast('Erro ao carregar aprendizado', 'err')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ctx.affiliate?.region, ctx.showToast, ctx.cacheVersion])

  const active = modules.find((m) => m.id === activeId)

  function openModule(mod: AffiliateLearningModule) {
    setActiveId(mod.id)
    markRead(mod.id)
    setProgress(readProgress())
  }

  if (loading && !modules.length) return <PanelSkeleton />

  if (active) {
    return (
      <div className="space-y-4 pb-2">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="flex items-center gap-1 text-xs font-bold text-[#8e8e93] active:opacity-70"
        >
          <ChevronRight size={14} className="rotate-180" /> Voltar
        </button>
        <div className="affiliate-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={18} style={{ color: ctx.primary }} />
            <h2 className="font-bold text-base text-[#1c1c1e]">{active.title}</h2>
          </div>
          {active.media_url && (
            <img src={active.media_url} alt="" className="w-full rounded-xl mb-4 max-h-48 object-cover" />
          )}
          {active.content_html ? (
            <div className="prose prose-sm max-w-none text-sm text-[#636366] leading-relaxed" dangerouslySetInnerHTML={{ __html: active.content_html }} />
          ) : (
            <p className="text-sm text-[#8e8e93]">Conteúdo em atualização pela marca.</p>
          )}
        </div>
        {active.module_type === 'comissao' && ctx.commission && (
          <AffiliateCommissionCard commission={ctx.commission} primary={ctx.primary} secondary={ctx.secondary} />
        )}
        {training?.terms_html && active.module_type === 'programa' && (
          <div className="affiliate-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Termos do programa</p>
            <div className="prose prose-sm max-w-none text-xs" dangerouslySetInnerHTML={{ __html: training.terms_html }} />
          </div>
        )}
      </div>
    )
  }

  const requiredDone = modules.filter((m) => m.is_required).every((m) => progress[m.id])
  const published = modules.length

  if (!published) {
    return (
      <div className="text-center py-14 text-[#8e8e93]">
        <GraduationCap size={32} className="mx-auto mb-3 opacity-35" />
        <p className="text-sm font-semibold text-[#1c1c1e]">Área de aprendizado em breve</p>
        <p className="text-xs mt-1">A marca vai publicar conteúdo sobre o programa aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-2">
      <div
        className="affiliate-card px-4 py-3 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${ctx.primary}12, ${ctx.secondary}08)` }}
      >
        <GraduationCap size={20} style={{ color: ctx.primary }} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1c1c1e]">Central de conhecimento</p>
          <p className="text-xs text-[#8e8e93]">
            {requiredDone ? 'Tudo concluído!' : 'Complete os módulos obrigatórios'}
          </p>
        </div>
      </div>

      {ctx.commission && (
        <AffiliateCommissionCard commission={ctx.commission} primary={ctx.primary} secondary={ctx.secondary} compact />
      )}

      <div className="space-y-2">
        {modules.map((m) => {
          const done = !!progress[m.id]
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => openModule(m)}
              className="affiliate-learn-card w-full text-left"
            >
              <div className="affiliate-learn-card__icon" style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}>
                <BookOpen size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-[#1c1c1e] truncate">{m.title}</p>
                {m.is_required && !done && (
                  <p className="text-[10px] font-bold text-amber-600 mt-0.5">Obrigatório</p>
                )}
              </div>
              {done ? (
                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              ) : (
                <ChevronRight size={18} className="text-[#c7c7cc] shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {training?.commission_rules?.trim() && (
        <div className="affiliate-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] mb-2">Regras de comissão</p>
          <div className="text-xs text-[#636366] whitespace-pre-wrap leading-relaxed">{training.commission_rules.trim()}</div>
        </div>
      )}
    </div>
  )
}
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Lock,
  Sparkles,
  X,
  Building2,
  Smartphone,
  Target,
  Zap,
} from 'lucide-react'
import {
  closePlanUpgrade,
  subscribePlanUpgrade,
  type PlanUpgradePayload,
} from '@/lib/plan-upgrade'
import { Button } from '@/components/ui/Button'

/**
 * Global modal: plan wall → explain block → suggest upgrade.
 * Mounted once in admin shell; opened via openPlanUpgrade / API entitlement errors.
 */
export function PlanUpgradeModalHost() {
  const [payload, setPayload] = useState<PlanUpgradePayload | null>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => subscribePlanUpgrade(setPayload), [])

  useEffect(() => {
    if (!payload) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlanUpgrade()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [payload])

  if (!payload || typeof document === 'undefined') return null

  const isLimit =
    payload.code === 'plan_brand_limit' ||
    payload.code === 'plan_instance_limit' ||
    payload.code === 'plan_leads_day_limit' ||
    payload.code === 'plan_leads_month_limit'

  const Icon =
    payload.code === 'plan_brand_limit' || payload.code === 'plan_multi_brand_required'
      ? Building2
      : payload.code === 'plan_instance_limit'
        ? Smartphone
        : isLimit
          ? Target
          : Lock

  const benefits = [
    'Desbloqueie módulos e limites alinhados ao que o plano promete',
    'Sem surpresas: o que está no plano é o que a plataforma libera',
    'Troca de plano com o mesmo fluxo de checkout oficial',
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="presentation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-gray-950/55 backdrop-blur-[2px] motion-safe:animate-[fadeIn_160ms_ease-out] motion-reduce:animate-none"
        onClick={() => closePlanUpgrade()}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full sm:max-w-[440px] max-h-[min(92vh,640px)] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5 motion-safe:animate-[slideUp_200ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none"
      >
        {/* Top accent bar — full width, not side-stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-gray-900 via-emerald-600 to-gray-900" />

        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gray-900 text-white grid place-items-center shrink-0 shadow-sm">
                <Icon size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  Plano atual
                  {payload.planName || payload.planSlug
                    ? ` · ${payload.planName || payload.planSlug}`
                    : ''}
                </p>
                <h2
                  id={titleId}
                  className="text-[18px] sm:text-[20px] font-bold tracking-tight text-gray-900 text-balance mt-0.5"
                >
                  {payload.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => closePlanUpgrade()}
              className="w-9 h-9 grid place-items-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition shrink-0"
              aria-label="Fechar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <p id={descId} className="mt-4 text-[14px] leading-relaxed text-gray-600 text-pretty">
            {payload.message}
          </p>

          {payload.featureLabel && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-200/80 text-amber-900">
              <Lock size={13} strokeWidth={2.25} className="text-amber-700" />
              <span className="text-[12px] font-semibold">{payload.featureLabel}</span>
              <span className="text-[11px] font-medium text-amber-800/70">bloqueado</span>
            </div>
          )}

          {payload.limit != null && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gray-50 ring-1 ring-gray-200/80 px-4 py-3">
              <div className="text-center min-w-[4.5rem]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Uso</p>
                <p className="text-[20px] font-bold tabular-nums text-gray-900">
                  {payload.used ?? '—'}
                </p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center min-w-[4.5rem]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Limite
                </p>
                <p className="text-[20px] font-bold tabular-nums text-gray-900">
                  {payload.limit < 0 ? '∞' : payload.limit}
                </p>
              </div>
              <p className="flex-1 text-[12px] text-gray-500 leading-snug">
                Extrapolou o que o plano entrega. Upgrade libera mais capacidade.
              </p>
            </div>
          )}

          <ul className="mt-5 space-y-2.5">
            {benefits.map(b => (
              <li key={b} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                <Sparkles
                  size={14}
                  strokeWidth={2.25}
                  className="mt-0.5 text-emerald-600 shrink-0"
                />
                <span className="text-pretty">{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
            <Button
              type="button"
              variant="secondary"
              className="sm:flex-1"
              onClick={() => closePlanUpgrade()}
            >
              Continuar no plano atual
            </Button>
            <Link
              to="/inicio#planos"
              onClick={() => closePlanUpgrade()}
              className="sm:flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold tracking-tight hover:bg-gray-800 active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              Ver planos e upgrade
              <ArrowUpRight size={16} strokeWidth={2.25} />
            </Link>
          </div>

          {payload.requestId && (
            <p className="mt-4 text-[10px] font-mono text-gray-400 truncate">
              ref {payload.requestId}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[fadeIn_160ms_ease-out\\],
          .motion-safe\\:animate-\\[slideUp_200ms_cubic-bezier\\(0\\.16\\,1\\,0\\.3\\,1\\)\\] {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  )
}

/** Compact CTA used next to locked UI */
export function PlanUpgradeHint({
  featureKey,
  className = '',
}: {
  featureKey: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        import('@/lib/plan-upgrade').then(({ openPlanUpgradeForFeature }) => {
          openPlanUpgradeForFeature(featureKey)
        })
      }}
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 ${className}`}
    >
      <Zap size={13} strokeWidth={2.25} />
      Fazer upgrade
    </button>
  )
}

import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Check,
  Crown,
  Lock,
  ShieldAlert,
  Smartphone,
  Target,
  X,
  Zap,
} from 'lucide-react'
import {
  closePlanUpgrade,
  subscribePlanUpgrade,
  type PlanUpgradePayload,
} from '@/lib/plan-upgrade'
import { Button } from '@/components/ui/Button'

/**
 * Global plan-wall modal — product register (Linear/Stripe density).
 * Mounted once in admin shell; opened via openPlanUpgrade / API 403.
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

  const usagePct = useMemo(() => {
    if (!payload || payload.limit == null || payload.limit <= 0) return null
    const used = Number(payload.used ?? 0)
    return Math.min(100, Math.round((used / payload.limit) * 100))
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
          : ShieldAlert

  const planLabel = payload.planName || payload.planSlug || 'seu plano atual'

  const unlockPoints = isLimit
    ? [
        'Mais cotas (leads, WhatsApp, marcas) sem reinventar o fluxo',
        'Mesmo painel — só sobe o teto do que o plano libera',
        'Checkout oficial de upgrade na página de planos',
      ]
    : [
        payload.featureLabel
          ? `Acesso a ${payload.featureLabel} e módulos relacionados`
          : 'Acesso aos módulos que o plano superior inclui',
        'Nav e API liberam juntos — sem “tem no marketing e falta no sistema”',
        'Upgrade no mesmo fluxo de pagamento da plataforma',
      ]

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-5"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-[#0a0a0a]/60 backdrop-blur-[3px] plan-upgrade-fade"
        onClick={() => closePlanUpgrade()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full sm:max-w-[460px] max-h-[min(94vh,680px)] overflow-hidden rounded-t-[1.75rem] sm:rounded-[1.5rem] bg-[#fafafa] shadow-[0_32px_96px_-28px_rgba(0,0,0,0.55)] ring-1 ring-black/10 plan-upgrade-panel"
      >
        {/* Header band */}
        <div className="relative px-6 sm:px-7 pt-6 pb-5 bg-[#111113] text-white overflow-hidden">
          <div
            className="pointer-events-none absolute -right-10 -top-12 w-44 h-44 rounded-full opacity-[0.14]"
            style={{
              background:
                'radial-gradient(circle at center, #34d399 0%, transparent 68%)',
            }}
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.08] ring-1 ring-white/15 grid place-items-center shrink-0">
                <Icon size={22} strokeWidth={1.85} className="text-emerald-400" />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-white/[0.08] ring-1 ring-white/10">
                  <Crown size={11} strokeWidth={2.25} className="text-emerald-400" />
                  <span className="text-[10px] font-semibold tracking-wide text-white/70 uppercase">
                    Upgrade de plano
                  </span>
                </div>
                <h2
                  id={titleId}
                  className="mt-2 text-[19px] sm:text-[21px] font-bold tracking-tight text-white text-balance leading-snug"
                >
                  {payload.title}
                </h2>
                <p className="mt-1 text-[12px] text-white/50 font-medium truncate">
                  Plano atual: <span className="text-white/80">{planLabel}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => closePlanUpgrade()}
              className="w-9 h-9 grid place-items-center rounded-xl text-white/55 hover:text-white hover:bg-white/10 transition shrink-0"
              aria-label="Fechar"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="px-6 sm:px-7 py-5 overflow-y-auto max-h-[min(62vh,420px)]">
          <p id={descId} className="text-[14px] leading-relaxed text-gray-600 text-pretty">
            {payload.message}
          </p>

          {/* Blocked resource card */}
          {payload.featureLabel && (
            <div className="mt-4 rounded-2xl bg-white ring-1 ring-gray-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 ring-1 ring-amber-200/70 grid place-items-center shrink-0">
                  <Lock size={16} strokeWidth={2.25} className="text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-500">Recurso solicitado</p>
                  <p className="text-[15px] font-bold text-gray-900 truncate">
                    {payload.featureLabel}
                  </p>
                </div>
                <span className="shrink-0 h-7 px-2.5 rounded-lg bg-gray-900 text-[10px] font-bold uppercase tracking-wide text-white grid place-items-center">
                  Bloqueado
                </span>
              </div>
              <p className="mt-3 text-[12px] text-gray-500 leading-snug">
                No plano atual este módulo não está liberado. O painel e a API recusam a ação
                de propósito — o que o plano propõe é o que o sistema entrega.
              </p>
            </div>
          )}

          {/* Usage meter */}
          {payload.limit != null && (
            <div className="mt-4 rounded-2xl bg-white ring-1 ring-gray-200/90 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-end justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">Consumo do plano</p>
                  <p className="text-[13px] font-bold text-gray-900 mt-0.5">
                    {payload.used ?? 0}
                    <span className="text-gray-400 font-semibold"> / </span>
                    {payload.limit < 0 ? '∞' : payload.limit}
                  </p>
                </div>
                {usagePct != null && (
                  <span
                    className={`text-[12px] font-bold tabular-nums ${
                      usagePct >= 100 ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {usagePct}%
                  </span>
                )}
              </div>
              {usagePct != null && (
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                      usagePct >= 100 ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              )}
              <p className="mt-2.5 text-[12px] text-gray-500 leading-snug">
                Você atingiu o teto do plano. Upgrade aumenta a cota sem mudar o fluxo de trabalho.
              </p>
            </div>
          )}

          {/* Unlock list */}
          <div className="mt-5">
            <p className="text-[11px] font-semibold text-gray-500 mb-2.5">
              Com um plano superior
            </p>
            <ul className="space-y-2">
              {unlockPoints.map(line => (
                <li
                  key={line}
                  className="flex items-start gap-2.5 text-[13px] text-gray-700 leading-snug"
                >
                  <span className="mt-0.5 w-5 h-5 rounded-md bg-emerald-50 ring-1 ring-emerald-200/80 grid place-items-center shrink-0">
                    <Check size={12} strokeWidth={2.5} className="text-emerald-700" />
                  </span>
                  <span className="text-pretty">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2.5">
            <Button
              type="button"
              variant="secondary"
              className="sm:flex-1 !bg-white !ring-1 !ring-gray-200"
              onClick={() => closePlanUpgrade()}
            >
              Continuar no plano atual
            </Button>
            <Link
              to="/inicio#planos"
              onClick={() => closePlanUpgrade()}
              className="sm:flex-[1.15] group inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold tracking-tight hover:bg-gray-800 active:scale-[0.98] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            >
              Ver planos e fazer upgrade
              <ArrowRight
                size={16}
                strokeWidth={2.25}
                className="transition-transform group-hover:translate-x-0.5"
              />
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
        .plan-upgrade-fade {
          animation: planUpgradeFade 180ms ease-out both;
        }
        .plan-upgrade-panel {
          animation: planUpgradeSlide 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes planUpgradeFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes planUpgradeSlide {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .plan-upgrade-fade,
          .plan-upgrade-panel {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  )
}

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

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, AlertTriangle, ChevronRight, Loader2, ClipboardList,
} from 'lucide-react'
import { getHeaders } from '@/lib/admin/helpers'
import { formatCommissionShort, normalizeCommissionMode } from '@/lib/affiliate-commission'
import { labelOf, PAYOUT_FREQUENCY_OPTIONS, PAYOUT_METHOD_OPTIONS } from '@/lib/affiliates/program-config'

type CheckItem = {
  id: string
  label: string
  ok: boolean
  critical: boolean
  tab?: string
  hint?: string
}

type Props = {
  program: any | null
  learningModules: Array<{ is_published?: boolean; is_required?: boolean; content_html?: string | null }>
  materials: Array<{ is_published?: boolean; is_active?: boolean }>
  catalogProductsCount: number
  onGoTab: (tab: string) => void
}

function hasText(v: unknown, min = 40) {
  return String(v || '').replace(/<[^>]+>/g, '').trim().length >= min
}

export function AffiliateReadinessPanel({
  program,
  learningModules,
  materials,
  catalogProductsCount,
  onGoTab,
}: Props) {
  const brandId = localStorage.getItem('lead-system:active-brand-id') || ''
  const [loading, setLoading] = useState(true)
  const [bundle, setBundle] = useState<any>(null)
  const [dist, setDist] = useState<any>(null)

  useEffect(() => {
    if (!brandId) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const headers = getHeaders()
        if (!headers['x-brand-id']) headers['x-brand-id'] = brandId
        const [progListRes, distRes] = await Promise.all([
          fetch(`/api/affiliate-programs?brand_id=${encodeURIComponent(brandId)}&include_draft=1`, { headers }),
          fetch(`/api/affiliates/distribution/overview?brand_id=${encodeURIComponent(brandId)}`, { headers }),
        ])
        const progList = await progListRes.json().catch(() => ({}))
        const distData = await distRes.json().catch(() => ({}))
        const primary =
          (progList.programs || []).find((p: any) => p.is_default) ||
          (progList.programs || []).find((p: any) => p.status === 'active') ||
          (progList.programs || [])[0]
        let detail = null
        if (primary?.id) {
          const dRes = await fetch(
            `/api/affiliate-programs/${encodeURIComponent(primary.id)}?brand_id=${encodeURIComponent(brandId)}`,
            { headers },
          )
          detail = await dRes.json().catch(() => null)
        }
        if (!cancelled) {
          setBundle(detail)
          setDist(distData)
        }
      } catch {
        if (!cancelled) {
          setBundle(null)
          setDist(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [brandId])

  const checks: CheckItem[] = useMemo(() => {
    const p = bundle?.program || null
    const steps = bundle?.steps || []
    const trainings = bundle?.trainings || []
    const offers = (bundle?.offers || []).filter((o: any) => o.is_active !== false)
    const rules = dist?.rules || {}
    const pubLearn = learningModules.filter((m) => m.is_published)
    const richLearn = pubLearn.filter((m) => hasText(m.content_html, 80))
    const pubMats = materials.filter((m) => m.is_published !== false && m.is_active !== false)

    const enabled = program?.is_enabled !== false
    const marketplace = p?.status === 'active' && p?.is_marketplace_visible !== false
    const commissionLabel = p
      ? formatCommissionShort(normalizeCommissionMode(p.commission_mode), Number(p.commission_value || 0))
      : program
        ? formatCommissionShort(
          normalizeCommissionMode(program.default_commission_mode),
          Number(program.default_commission_value ?? program.default_commission_pct ?? 0),
        )
        : '—'

    return [
      {
        id: 'enabled',
        label: 'Programa da marca ativo',
        ok: enabled,
        critical: true,
        tab: 'programs',
        hint: 'Ative o programa em Programas → Configurações',
      },
      {
        id: 'marketplace',
        label: 'Campanha visível no mercado de parceiros',
        ok: marketplace,
        critical: true,
        tab: 'programs',
        hint: 'Ative o programa em Programas → Ativar no mercado',
      },
      {
        id: 'commission',
        label: `Comissão definida (${commissionLabel})`,
        ok: Number(p?.commission_value ?? program?.default_commission_value ?? 0) > 0,
        critical: true,
        tab: 'programs',
      },
      {
        id: 'payout',
        label: p?.payout_method
          ? `Repasse: ${labelOf(PAYOUT_METHOD_OPTIONS, p.payout_method)} · ${labelOf(PAYOUT_FREQUENCY_OPTIONS, p.payout_frequency)}`
          : 'Repasse PIX e periodicidade configurados',
        ok: Boolean(p?.payout_method && p?.payout_frequency),
        critical: true,
        tab: 'programs',
        hint: 'Defina forma, periodicidade e mínimo de saque',
      },
      {
        id: 'terms',
        label: 'Termos do programa preenchidos',
        ok: hasText(p?.terms_html || program?.terms_html, 120),
        critical: true,
        tab: 'programs',
      },
      {
        id: 'policies',
        label: 'Políticas de conduta preenchidas',
        ok: hasText(p?.policies_html, 120),
        critical: true,
        tab: 'programs',
      },
      {
        id: 'orientation',
        label: 'Orientação / preparação do onboarding',
        ok: hasText(p?.orientation_html, 80),
        critical: true,
        tab: 'programs',
      },
      {
        id: 'steps',
        label: `Etapas de onboarding (${steps.length})`,
        ok: steps.length >= 3,
        critical: true,
        tab: 'programs',
      },
      {
        id: 'trainings',
        label: `Treinamentos do programa (${trainings.length})`,
        ok: trainings.length >= 1,
        critical: false,
        tab: 'programs',
      },
      {
        id: 'learning',
        label: `Aprendizado publicado (${pubLearn.length}, conteúdo rico: ${richLearn.length})`,
        ok: pubLearn.length >= 4 && richLearn.length >= 3,
        critical: true,
        tab: 'learning',
      },
      {
        id: 'offers',
        label: `Ofertas / produtos do programa (${offers.length})`,
        ok: offers.length >= 1 || catalogProductsCount >= 1,
        critical: false,
        tab: 'programs',
      },
      {
        id: 'materials',
        label: `Materiais de divulgação (${pubMats.length})`,
        ok: pubMats.length >= 1,
        critical: false,
        tab: 'programs',
        hint: 'Cadastre artes em Programas → Materiais',
      },
      {
        id: 'share',
        label: 'Textos de compartilhamento (título/descrição)',
        ok: Boolean(String(p?.share_title || program?.share_title || '').trim()),
        critical: false,
        tab: 'programs',
        hint: 'Preencha em Programas → Configurações',
      },
      {
        id: 'dist',
        label: 'Distribuição de leads com regras e mensagens',
        ok:
          rules.is_enabled !== false &&
          rules.is_enabled !== 0 &&
          Boolean(String(rules.initial_message_template || '').trim()),
        critical: false,
        tab: 'distribution',
      },
      {
        id: 'dist_pix',
        label: 'Distribuição exige PIX (recomendado p/ repasse diário)',
        ok: rules.require_pix_key === true || rules.require_pix_key === 1,
        critical: false,
        tab: 'distribution',
      },
      {
        id: 'applications',
        label: 'Candidaturas abertas no mercado',
        ok: p?.accept_applications !== false && program?.accept_new_affiliates !== false,
        critical: true,
        tab: 'programs',
      },
    ]
  }, [bundle, dist, program, learningModules, materials, catalogProductsCount])

  const critical = checks.filter((c) => c.critical)
  const criticalOk = critical.filter((c) => c.ok).length
  const allOk = checks.filter((c) => c.ok).length
  const ready = critical.every((c) => c.ok)
  const pct = Math.round((allOk / Math.max(checks.length, 1)) * 100)

  if (loading) {
    return (
      <div className="affiliates-ready affiliates-ready--loading" aria-busy="true">
        <Loader2 size={18} className="animate-spin opacity-40" />
        <span>Avaliando prontidão do programa…</span>
      </div>
    )
  }

  return (
    <section className={`affiliates-ready${ready ? ' is-ready' : ''}`} aria-label="Prontidão do programa de afiliados">
      <header className="affiliates-ready__head">
        <div className="affiliates-ready__icon" aria-hidden="true">
          <ClipboardList size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="affiliates-ready__title">
            {ready ? 'Programa pronto para receber candidatos' : 'Checklist para ativar o programa'}
          </p>
          <p className="affiliates-ready__meta">
            {criticalOk}/{critical.length} críticos · {allOk}/{checks.length} itens · {pct}% completo
          </p>
        </div>
        <div className="affiliates-ready__score" aria-label={`${pct} por cento completo`}>
          <span className="affiliates-ready__score-num tabular-nums">{pct}</span>
          <span className="affiliates-ready__score-unit">%</span>
        </div>
      </header>

      <div className="affiliates-ready__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="affiliates-ready__bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {!ready && (
        <p className="affiliates-ready__banner">
          <AlertTriangle size={14} />
          Complete os itens críticos antes de divulgar o link de candidatura em escala.
        </p>
      )}

      <ul className="affiliates-ready__list">
        {checks.map((c) => (
          <li key={c.id} className={`affiliates-ready__item${c.ok ? ' is-ok' : ''}${c.critical && !c.ok ? ' is-critical' : ''}`}>
            <span className="affiliates-ready__check" aria-hidden="true">
              {c.ok ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="affiliates-ready__label">
                {c.label}
                {c.critical && !c.ok && <span className="affiliates-ready__tag">crítico</span>}
              </p>
              {!c.ok && c.hint && <p className="affiliates-ready__hint">{c.hint}</p>}
            </div>
            {c.tab && !c.ok && (
              <button
                type="button"
                className="affiliates-ready__go"
                onClick={() => onGoTab(c.tab!)}
              >
                Ir <ChevronRight size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

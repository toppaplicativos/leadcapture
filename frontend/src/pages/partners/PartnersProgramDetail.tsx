import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronLeft, Loader2, Building2, Sparkles, GraduationCap, Layers,
  Package, FileText, ChevronRight, Clock, CheckCircle2, Percent,
  Users, ShieldCheck, Scale, BookOpen, BadgePercent,
} from 'lucide-react'
import { partnersApi } from '@/lib/api-partners'

type Props = {
  programRef: string
  onBack: () => void
  onOnboarding: (enrollmentId: string) => void
  showToast: (text: string, type?: 'ok' | 'err') => void
  onApplied?: () => void
}

function Section({
  icon: Icon,
  title,
  children,
  tone = 'default',
}: {
  icon: typeof FileText
  title: string
  children: ReactNode
  tone?: 'default' | 'accent'
}) {
  return (
    <section className={`partners-program__section${tone === 'accent' ? ' partners-program__section--accent' : ''}`}>
      <header className="partners-program__section-head">
        <span className="partners-program__section-icon" aria-hidden>
          <Icon size={15} strokeWidth={2.25} />
        </span>
        <h2 className="partners-program__section-title">{title}</h2>
      </header>
      <div className="partners-program__section-body">{children}</div>
    </section>
  )
}

export function PartnersProgramDetail({ programRef, onBack, onOnboarding, showToast, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [program, setProgram] = useState<any>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  useEffect(() => {
    setLoading(true)
    partnersApi.programDetail(programRef)
      .then((res) => setProgram(res.program))
      .catch((e: Error) => showToast(e.message, 'err'))
      .finally(() => setLoading(false))
  }, [programRef, showToast])

  async function apply() {
    if (!program?.can_apply) return
    if (!termsAccepted) {
      showToast('Aceite os termos para continuar', 'err')
      return
    }
    setApplying(true)
    try {
      const res = await partnersApi.applyProgram(program.id, { accepted_terms: true })
      showToast(res.auto_approved ? 'Inscrição iniciada!' : 'Candidatura enviada!')
      if (res.enrollment?.id) {
        onOnboarding(res.enrollment.id)
      } else {
        const refreshed = await partnersApi.programDetail(program.id)
        setProgram(refreshed.program)
      }
      onApplied?.()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro na candidatura', 'err')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="partners-program partners-program--loading" aria-busy="true">
        <div className="partners-program__skeleton partners-program__skeleton--cover" />
        <div className="partners-program__skeleton partners-program__skeleton--kpis" />
        <div className="partners-program__skeleton partners-program__skeleton--block" />
        <div className="partners-program__skeleton partners-program__skeleton--block" />
      </div>
    )
  }

  if (!program) {
    return (
      <div className="partners-program__empty">
        <p className="partners-program__empty-title">Programa não encontrado</p>
        <p className="partners-program__empty-sub">Ele pode ter sido removido ou está indisponível no mercado.</p>
        <button type="button" className="partners-program__link-back" onClick={onBack}>
          <ChevronLeft size={14} /> Voltar ao mercado
        </button>
      </div>
    )
  }

  const primary = String(program.organization?.primary_color || '#1c1c1e')
  const secondary = String(program.organization?.secondary_color || primary)
  const hasTerms = !!String(program.terms_html || '').trim()
  const hasPolicies = !!String(program.policies_html || '').trim()
  const hasOrientation = !!String(program.orientation_html || '').trim()
  const prospects = Number(
    program.prospects_captured
    ?? program.leads_captured
    ?? program.organization?.prospects_captured
    ?? 0,
  )
  const offersCount = (program.offers || []).length
  const stepsCount = Number(program.onboarding?.required_steps_count || program.onboarding?.steps_count || 0)
  const trainingsCount = Number(program.onboarding?.required_trainings_count || program.onboarding?.trainings_count || 0)
  const status = String(program.participation_status || 'not_applied')

  const statusMeta: Record<string, { label: string; tone: string }> = {
    not_applied: { label: 'Disponível', tone: 'info' },
    pending: { label: 'Em análise', tone: 'warn' },
    onboarding: { label: 'Onboarding', tone: 'info' },
    active: { label: 'Você participa', tone: 'ok' },
    rejected: { label: 'Não aprovado', tone: 'danger' },
    suspended: { label: 'Suspenso', tone: 'danger' },
  }
  const st = statusMeta[status] || statusMeta.not_applied

  return (
    <div className="partners-program">
      <button type="button" onClick={onBack} className="partners-program__back">
        <ChevronLeft size={15} strokeWidth={2.25} />
        Mercado
      </button>

      {/* ── Capa ── */}
      <header
        className="partners-program__cover"
        style={{
          background: `linear-gradient(155deg, ${primary} 0%, ${secondary} 55%, color-mix(in srgb, ${primary} 70%, #0a0a0a) 100%)`,
        }}
      >
        <div className="partners-program__cover-top">
          <div className="partners-program__cover-brand">
            {program.organization?.logo_url ? (
              <img
                src={program.organization.logo_url}
                alt=""
                className="partners-program__cover-logo"
              />
            ) : (
              <div className="partners-program__cover-logo partners-program__cover-logo--fallback">
                <Building2 size={22} />
              </div>
            )}
            <div className="min-w-0">
              <p className="partners-program__cover-org">{program.organization?.name || 'Organização'}</p>
              <h1 className="partners-program__cover-name">{program.name}</h1>
            </div>
          </div>
          <span className={`partners-program__status partners-program__status--${st.tone}`}>
            {st.label}
          </span>
        </div>

        {program.organization?.slogan && (
          <p className="partners-program__cover-slogan">{program.organization.slogan}</p>
        )}

        <div className="partners-program__cover-highlight">
          <div className="partners-program__cover-comm">
            <span className="partners-program__cover-comm-label">
              <BadgePercent size={13} /> Comissão
            </span>
            <p className="partners-program__cover-comm-value">{program.commission_label || '—'}</p>
          </div>
          <div className="partners-program__cover-divider" aria-hidden />
          <div className="partners-program__cover-comm">
            <span className="partners-program__cover-comm-label">
              <Users size={13} /> Base da marca
            </span>
            <p className="partners-program__cover-comm-value tabular-nums">
              {prospects.toLocaleString('pt-BR')}
              <span className="partners-program__cover-comm-unit">prospects</span>
            </p>
          </div>
        </div>
      </header>

      {/* ── KPIs ── */}
      <div className="partners-program__kpis" role="group" aria-label="Resumo do programa">
        <div className="partners-program__kpi">
          <Percent size={14} className="partners-program__kpi-ico" aria-hidden />
          <p className="partners-program__kpi-val">{program.commission_label || '—'}</p>
          <p className="partners-program__kpi-lbl">Comissão</p>
        </div>
        <div className="partners-program__kpi">
          <Users size={14} className="partners-program__kpi-ico" aria-hidden />
          <p className="partners-program__kpi-val tabular-nums">{prospects.toLocaleString('pt-BR')}</p>
          <p className="partners-program__kpi-lbl">Prospects</p>
        </div>
        <div className="partners-program__kpi">
          <Package size={14} className="partners-program__kpi-ico" aria-hidden />
          <p className="partners-program__kpi-val tabular-nums">{offersCount}</p>
          <p className="partners-program__kpi-lbl">Ofertas</p>
        </div>
        <div className="partners-program__kpi">
          <Layers size={14} className="partners-program__kpi-ico" aria-hidden />
          <p className="partners-program__kpi-val tabular-nums">{stepsCount}</p>
          <p className="partners-program__kpi-lbl">Etapas</p>
        </div>
      </div>

      {/* ── Sobre ── */}
      {program.description && (
        <Section icon={BookOpen} title="Sobre a oportunidade">
          <p className="partners-program__prose">{program.description}</p>
        </Section>
      )}

      {/* ── Comissão ── */}
      <Section icon={BadgePercent} title="Comissão e ganhos" tone="accent">
        <div className="partners-program__comm-row">
          <div>
            <p className="partners-program__comm-big">{program.commission_label || '—'}</p>
            <p className="partners-program__muted">Modelo de remuneração do programa</p>
          </div>
        </div>
        {program.commission_rules ? (
          <div className="partners-program__rules-box">
            <p className="partners-program__rules-label">
              <Scale size={13} /> Regras comerciais
            </p>
            <p className="partners-program__prose partners-program__prose--pre">{program.commission_rules}</p>
          </div>
        ) : (
          <p className="partners-program__muted">
            Detalhes de pagamento e apuração são confirmados no onboarding e nos termos.
          </p>
        )}
      </Section>

      {/* ── Condições / elegibilidade ── */}
      {(program.eligibility_rules || hasPolicies) && (
        <Section icon={ShieldCheck} title="Condições e requisitos">
          {program.eligibility_rules && (
            <div className="partners-program__block">
              <p className="partners-program__block-label">Quem pode participar</p>
              <p className="partners-program__prose partners-program__prose--pre">{program.eligibility_rules}</p>
            </div>
          )}
          {hasPolicies && (
            <div className="partners-program__block">
              <p className="partners-program__block-label">Políticas</p>
              <div
                className="partners-program__html"
                dangerouslySetInnerHTML={{ __html: program.policies_html }}
              />
            </div>
          )}
        </Section>
      )}

      {/* ── Ofertas ── */}
      {offersCount > 0 && (
        <Section icon={Package} title={`Ofertas e produtos (${offersCount})`}>
          <ul className="partners-program__offers">
            {program.offers.map((o: any) => (
              <li key={o.id} className="partners-program__offer">
                <span className="partners-program__offer-dot" style={{ backgroundColor: primary }} aria-hidden />
                <div className="min-w-0">
                  <p className="partners-program__offer-title">{o.title || o.product_name || 'Oferta'}</p>
                  {(o.product_name && o.title) || o.description ? (
                    <p className="partners-program__muted">
                      {[o.product_name && o.title ? o.product_name : null, o.description]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Onboarding ── */}
      <Section icon={GraduationCap} title="Onboarding e preparação">
        <div className="partners-program__onboard-grid">
          <div className="partners-program__onboard-chip">
            <Layers size={14} />
            <div>
              <p className="partners-program__onboard-n tabular-nums">{stepsCount}</p>
              <p className="partners-program__muted">etapas obrigatórias</p>
            </div>
          </div>
          <div className="partners-program__onboard-chip">
            <GraduationCap size={14} />
            <div>
              <p className="partners-program__onboard-n tabular-nums">{trainingsCount}</p>
              <p className="partners-program__muted">treinamentos</p>
            </div>
          </div>
        </div>
        {(program.onboarding?.steps || []).length > 0 && (
          <ol className="partners-program__steps">
            {program.onboarding.steps.map((s: any, i: number) => (
              <li key={s.id || i} className="partners-program__step">
                <span className="partners-program__step-n">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="partners-program__offer-title">{s.title || `Etapa ${i + 1}`}</p>
                  {s.is_required && <p className="partners-program__step-tag">Obrigatória</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {hasOrientation && (
          <div className="partners-program__block">
            <p className="partners-program__block-label">Orientação da marca</p>
            <div
              className="partners-program__html"
              dangerouslySetInnerHTML={{ __html: program.orientation_html }}
            />
          </div>
        )}
      </Section>

      {/* ── Termos ── */}
      {hasTerms && (
        <Section icon={FileText} title="Termos do programa">
          <div
            className="partners-program__html partners-program__html--scroll"
            dangerouslySetInnerHTML={{ __html: program.terms_html }}
          />
        </Section>
      )}

      {/* ── CTA sticky ── */}
      <div className="partners-program__cta">
        {program.can_apply && (
          <>
            <label className="partners-program__terms-check">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                Li e aceito os termos{hasTerms ? ' acima' : ' do programa'} e desejo me candidatar
              </span>
            </label>
            <button
              type="button"
              className="partners-program__cta-btn"
              style={{ backgroundColor: primary }}
              disabled={applying || !termsAccepted}
              onClick={() => apply()}
            >
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Candidatar-se ao programa
            </button>
          </>
        )}

        {program.can_continue && program.enrollment?.id && (
          <button
            type="button"
            className="partners-program__cta-btn"
            style={{ backgroundColor: primary }}
            onClick={() => onOnboarding(program.enrollment.id)}
          >
            Continuar onboarding <ChevronRight size={16} />
          </button>
        )}

        {status === 'pending' && (
          <p className="partners-program__cta-status partners-program__cta-status--warn">
            <Clock size={16} /> Aguardando aprovação da organização
          </p>
        )}

        {status === 'active' && (
          <p className="partners-program__cta-status partners-program__cta-status--ok">
            <CheckCircle2 size={16} /> Você já participa deste programa
          </p>
        )}
      </div>
    </div>
  )
}

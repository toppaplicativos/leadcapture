import { useEffect, useMemo, useState } from 'react'
import {
  Bell, Check, ChevronRight, Link2, Loader2, Megaphone, Sparkles, X, Wallet,
} from 'lucide-react'
import { pushPermission, pushSupported, subscribeToPush } from '@/lib/push/client'

type StepId = 'welcome' | 'earn' | 'alerts' | 'ready'

type Props = {
  userName?: string | null
  brandName?: string | null
  brandLogo?: string | null
  /** Cor do botão primário — textos ficam sempre claros no fundo escuro */
  brandColor?: string | null
  onComplete: (opts?: { enabledPush?: boolean }) => void
  onSkip?: () => void
}

const STORAGE_PREFIX = 'lc_aff_first_run_v1'
const SCOPE_APP = 'partners'

export function firstRunStorageKey(userId: string, scope: string = SCOPE_APP) {
  return `${STORAGE_PREFIX}:${scope}:${userId}`
}

export function hasCompletedFirstRun(userId: string, scope: string = SCOPE_APP) {
  if (!userId || typeof window === 'undefined') return true
  try {
    return localStorage.getItem(firstRunStorageKey(userId, scope)) === '1'
  } catch {
    return true
  }
}

export function markFirstRunComplete(userId: string, scope: string = SCOPE_APP) {
  if (!userId || typeof window === 'undefined') return
  try {
    localStorage.setItem(firstRunStorageKey(userId, scope), '1')
  } catch {
    /* private mode */
  }
}

const STEPS: StepId[] = ['welcome', 'earn', 'alerts', 'ready']

/**
 * Onboarding único: só após cadastro inicial no LeadCapture Parceiros.
 * Não deve aparecer ao entrar em um programa específico.
 */
export function AffiliateFirstRunOnboarding({
  userName,
  brandName,
  brandColor,
  brandLogo,
  onComplete,
  onSkip,
}: Props) {
  const [step, setStep] = useState(0)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushOk, setPushOk] = useState(pushPermission() === 'granted')
  const [pushMsg, setPushMsg] = useState<string | null>(null)
  const [videoFailed, setVideoFailed] = useState<Record<string, boolean>>({})

  // CTA sólido legível — evita accent escuro sumido no fundo dark
  const ctaBg = (() => {
    const raw = String(brandColor || '').trim()
    if (!raw || raw === '#171717' || raw === '#1c1c1e' || raw === '#0a0a0a' || raw === '#111827') {
      return '#ffffff'
    }
    return raw
  })()
  const ctaFg = ctaBg === '#ffffff' || ctaBg.toLowerCase() === '#fff' ? '#0a0a0a' : '#ffffff'

  const firstName = String(userName || '').trim().split(/\s+/)[0] || 'parceiro'
  const appLabel = brandName?.trim() || 'LeadCapture Parceiros'

  const stepId = STEPS[step] || 'welcome'
  const progress = ((step + 1) / STEPS.length) * 100

  const copy = useMemo(() => ({
    welcomeTitle: `Bem-vindo ao seu\napp de parceiro, ${firstName}`,
    welcomeBody:
      'Uma central só sua para entrar em programas, divulgar com link e cupom, receber contatos e acompanhar comissão — do primeiro clique ao Pix.',
    earnTitle: 'Três passos para\nganhar de verdade',
    earnBody: 'O app foi feito para isso. Sem planilha, sem improviso.',
    earnPoints: [
      { icon: Megaphone, label: 'Entre em um programa no Mercado' },
      { icon: Link2, label: 'Compartilhe link, cupom e materiais' },
      { icon: Wallet, label: 'Receba comissão a cada venda' },
    ],
    alertsTitle: 'Não perca nenhum\nlead nem comissão',
    alertsBody:
      'Ative os alertas e saiba na hora quando um contato chegar, um pedido fechar ou a carteira se mover — mesmo com o app fechado.',
    readyTitle: 'Sua operação de\nparceiro começa agora',
    readyBody:
      'Explore o Mercado, escolha o programa certo e use o app para vender com rastreio, materiais oficiais e carteira em um só lugar.',
    primaryReady: 'Começar no Mercado',
  }), [firstName])

  const mediaForStep = (id: StepId): { poster: string; video?: string } => {
    if (id === 'welcome') return { poster: '/onboarding/step-welcome.jpg', video: '/onboarding/step-welcome.mp4' }
    if (id === 'earn') return { poster: '/onboarding/step-share.jpg', video: '/onboarding/step-share.mp4' }
    if (id === 'alerts') return { poster: '/onboarding/step-alerts.jpg', video: '/onboarding/step-alerts.mp4' }
    return { poster: '/onboarding/step-welcome.jpg', video: '/onboarding/step-welcome.mp4' }
  }

  useEffect(() => {
    setPushOk(pushPermission() === 'granted')
  }, [step])

  async function enablePush() {
    if (!pushSupported()) {
      setPushMsg('Este dispositivo não suporta push. Você ainda pode usar o app normalmente.')
      return
    }
    setPushBusy(true)
    setPushMsg(null)
    try {
      const r = await subscribeToPush()
      if (!r.ok) {
        setPushMsg(r.message || 'Não foi possível ativar agora')
        setPushOk(pushPermission() === 'granted')
        return
      }
      setPushOk(true)
      setPushMsg(null)
    } catch (e: unknown) {
      setPushMsg(e instanceof Error ? e.message : 'Erro ao ativar notificações')
    } finally {
      setPushBusy(false)
    }
  }

  function finish(enabledPush?: boolean) {
    onComplete({ enabledPush: enabledPush ?? pushOk })
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish()
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  const media = mediaForStep(stepId)
  const showVideo = Boolean(media.video) && !videoFailed[stepId]

  return (
    <div className="aff-first-run" role="dialog" aria-modal="true" aria-labelledby="aff-first-run-title">
      <div className="aff-first-run__shell">
        <header className="aff-first-run__top">
          <div className="aff-first-run__brand">
            {brandLogo ? (
              <img src={brandLogo} alt="" className="aff-first-run__logo" />
            ) : (
              <span className="aff-first-run__logo aff-first-run__logo--fallback">
                <Sparkles size={14} />
              </span>
            )}
            <span className="aff-first-run__brand-name">{appLabel}</span>
          </div>
          <button
            type="button"
            className="aff-first-run__skip"
            onClick={() => (onSkip ? onSkip() : finish())}
            aria-label="Pular introdução"
          >
            Pular
          </button>
        </header>

        <div className="aff-first-run__progress" aria-hidden>
          <div className="aff-first-run__progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="aff-first-run__media" key={stepId}>
          {showVideo ? (
            <video
              className="aff-first-run__media-el"
              src={media.video}
              poster={media.poster}
              autoPlay
              muted
              loop
              playsInline
              onError={() => setVideoFailed((v) => ({ ...v, [stepId]: true }))}
            />
          ) : (
            <img className="aff-first-run__media-el" src={media.poster} alt="" />
          )}
        </div>

        <div className="aff-first-run__body">
          {stepId === 'welcome' && (
            <>
              <p className="aff-first-run__kicker">Seu app de parceiro · 1 min</p>
              <h1 id="aff-first-run-title" className="aff-first-run__title">
                {copy.welcomeTitle.split('\n').map((line, i) => (
                  <span key={i} className="aff-first-run__title-line">{line}</span>
                ))}
              </h1>
              <p className="aff-first-run__text">{copy.welcomeBody}</p>
            </>
          )}

          {stepId === 'earn' && (
            <>
              <p className="aff-first-run__kicker">Como funciona</p>
              <h1 id="aff-first-run-title" className="aff-first-run__title">
                {copy.earnTitle.split('\n').map((line, i) => (
                  <span key={i} className="aff-first-run__title-line">{line}</span>
                ))}
              </h1>
              <p className="aff-first-run__text">{copy.earnBody}</p>
              <ul className="aff-first-run__points">
                {copy.earnPoints.map((p) => (
                  <li key={p.label}>
                    <span className="aff-first-run__point-icon">
                      <p.icon size={16} strokeWidth={2.25} />
                    </span>
                    <span>{p.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {stepId === 'alerts' && (
            <>
              <p className="aff-first-run__kicker">Alertas em tempo real</p>
              <h1 id="aff-first-run-title" className="aff-first-run__title">
                {copy.alertsTitle.split('\n').map((line, i) => (
                  <span key={i} className="aff-first-run__title-line">{line}</span>
                ))}
              </h1>
              <p className="aff-first-run__text">{copy.alertsBody}</p>
              <div className="aff-first-run__push-card">
                <div className="aff-first-run__push-row">
                  <span className="aff-first-run__point-icon">
                    <Bell size={16} strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="aff-first-run__push-title">
                      {pushOk ? 'Notificações ativas' : 'Ativar push no celular'}
                    </p>
                    <p className="aff-first-run__push-sub">
                      {pushOk
                        ? 'Você será avisado de leads, vendas e comissões.'
                        : pushSupported()
                          ? 'Um toque. Você controla categorias depois no perfil.'
                          : 'Seu navegador não suporta push neste dispositivo.'}
                    </p>
                  </div>
                  {pushOk && (
                    <span className="aff-first-run__check" aria-hidden>
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                {pushMsg && <p className="aff-first-run__push-err">{pushMsg}</p>}
                {!pushOk && pushSupported() && (
                  <button
                    type="button"
                    className="aff-first-run__push-btn"
                    style={{ background: ctaBg, color: ctaFg }}
                    onClick={() => void enablePush()}
                    disabled={pushBusy}
                  >
                    {pushBusy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                    Ativar notificações
                  </button>
                )}
              </div>
            </>
          )}

          {stepId === 'ready' && (
            <>
              <p className="aff-first-run__kicker">Pronto para vender</p>
              <h1 id="aff-first-run-title" className="aff-first-run__title">
                {copy.readyTitle.split('\n').map((line, i) => (
                  <span key={i} className="aff-first-run__title-line">{line}</span>
                ))}
              </h1>
              <p className="aff-first-run__text">{copy.readyBody}</p>
              <div className="aff-first-run__ready-chips">
                <span>Link rastreado</span>
                <span>Materiais oficiais</span>
                <span>Carteira</span>
                {pushOk ? <span className="is-on">Alertas ativos</span> : <span>Alertas opcional</span>}
              </div>
            </>
          )}
        </div>

        <footer className="aff-first-run__footer">
          <div className="aff-first-run__dots" aria-hidden>
            {STEPS.map((id, i) => (
              <span
                key={id}
                className={`aff-first-run__dot${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`}
              />
            ))}
          </div>
          <div className="aff-first-run__actions">
            {step > 0 ? (
              <button type="button" className="aff-first-run__btn aff-first-run__btn--ghost" onClick={back}>
                Voltar
              </button>
            ) : (
              <span className="aff-first-run__actions-spacer" />
            )}
            {stepId === 'alerts' && !pushOk ? (
              <button type="button" className="aff-first-run__btn aff-first-run__btn--ghost" onClick={next}>
                Depois
              </button>
            ) : null}
            <button
              type="button"
              className="aff-first-run__btn aff-first-run__btn--primary"
              style={{ background: ctaBg, color: ctaFg }}
              onClick={() => {
                if (stepId === 'ready') finish()
                else next()
              }}
            >
              {stepId === 'ready' ? copy.primaryReady : 'Continuar'}
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

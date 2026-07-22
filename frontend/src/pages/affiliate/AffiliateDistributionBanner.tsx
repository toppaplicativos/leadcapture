/**
 * Direcionamento de liberação no Início do afiliado.
 * Compacto: some quando requisitos reais estão ok.
 * Sessão WhatsApp (Baileys) NÃO entra no gate — só número cadastrado, termos, onboarding, Pix.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  Loader2,
  Phone,
  Store,
  Wallet,
  X,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type ChecklistItem = {
  key: string
  label: string
  ok: boolean
  action?: string | null
  cta?: string | null
  action_path?: string | null
}

type DistributionStatus = {
  can_receive?: boolean
  can_claim?: boolean
  distribution_status?: string
  whatsapp_status?: string
  blockers?: string[]
  claim_blockers?: string[]
  checklist?: ChecklistItem[]
  program_name?: string | null
  enrollment_id?: string | null
  terms_html?: string | null
  registered_whatsapp_ok?: boolean
}

/** Itens que realmente bloqueiam / pedem ação no home */
const HARD_KEYS = new Set([
  'terms',
  'training',
  'program_active',
  'whatsapp_number',
  'pix',
  'affiliate_active',
])

const ICON_BY_KEY: Record<string, typeof FileText> = {
  terms: FileText,
  training: GraduationCap,
  whatsapp_number: Phone,
  pix: Wallet,
  program_active: Store,
  affiliate_active: Store,
}

export function AffiliateDistributionBanner({
  ctx,
  onConnectWhatsApp,
  onViewOpportunities,
  onNavigate,
}: {
  ctx: AppContext
  onConnectWhatsApp?: () => void
  onViewOpportunities?: () => void
  onNavigate?: (path: string) => void
}) {
  const [data, setData] = useState<DistributionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [termsHtml, setTermsHtml] = useState<string | null>(null)
  const [termsLoading, setTermsLoading] = useState(false)
  const [termsBusy, setTermsBusy] = useState(false)

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const r = await affiliateApi.distributionStatus()
      setData(r)
    } catch {
      if (!quiet) setData(null)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(false)
  }, [refresh, ctx.cacheVersion])

  useEffect(() => {
    const onFocus = () => {
      void refresh(true)
    }
    window.addEventListener('focus', onFocus)
    const t = window.setInterval(onFocus, 60_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(t)
    }
  }, [refresh])

  /** Só pendências reais — ignora sessão WhatsApp e itens ok */
  const pending = useMemo(
    () =>
      (data?.checklist || []).filter(
        (c) => !c.ok && HARD_KEYS.has(c.key) && c.key !== 'whatsapp',
      ),
    [data?.checklist],
  )

  const termsPending = pending.find((c) => c.key === 'terms')
  const ready =
    Boolean(data?.can_claim)
    && pending.length === 0
    && !(data?.claim_blockers && data.claim_blockers.length > 0)

  async function openTermsSheet() {
    setTermsOpen(true)
    setTermsChecked(false)
    if (data?.terms_html) {
      setTermsHtml(data.terms_html)
      return
    }
    setTermsLoading(true)
    try {
      let html = data?.terms_html || null
      if (!html && data?.enrollment_id) {
        const onboarding = await affiliateApi.onboarding(String(data.enrollment_id))
        html = onboarding?.enrollment?.terms_html || onboarding?.terms_html || null
      }
      if (!html) {
        const list = await affiliateApi.programEnrollments().catch(() => null)
        const en =
          (list?.enrollments || []).find((e: any) =>
            ['active', 'onboarding'].includes(String(e.status || '')),
          ) || (list?.enrollments || [])[0]
        if (en?.id) {
          const onboarding = await affiliateApi.onboarding(String(en.id))
          html = onboarding?.enrollment?.terms_html || null
        }
      }
      setTermsHtml(
        html
        || '<p>Não encontramos o texto dos termos. Abra <strong>Aprender</strong> e conclua a etapa de aceite, ou contate a marca.</p>',
      )
    } catch {
      setTermsHtml('<p>Não foi possível carregar os termos. Tente de novo em instantes.</p>')
    } finally {
      setTermsLoading(false)
    }
  }

  async function submitTermsAccept() {
    if (!termsChecked) {
      ctx.showToast('Marque a confirmação para registrar o aceite', 'err')
      return
    }
    setTermsBusy(true)
    try {
      const res = await affiliateApi.acceptDistributionTerms(true)
      setData(res)
      setTermsOpen(false)
      setTermsChecked(false)
      ctx.showToast('Termos aceitos · liberação atualizada')
      void refresh(true)
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Não foi possível registrar o aceite', 'err')
    } finally {
      setTermsBusy(false)
    }
  }

  function handleItemAction(item: ChecklistItem) {
    if (item.key === 'terms' || item.action_path === 'accept_terms') {
      void openTermsSheet()
      return
    }
    if (item.key === 'whatsapp_number') {
      onConnectWhatsApp?.()
      return
    }
    const path = item.action_path
    // Onboarding real do programa (nunca /aprendizado)
    if (
      path
      && (path.includes('/onboarding/') || item.key === 'program_active' || item.key === 'training')
      && onNavigate
    ) {
      if (path.includes('/onboarding/')) {
        onNavigate(path.startsWith('/') ? path : `/${path}`)
        return
      }
      if (data?.enrollment_id) {
        onNavigate(`/onboarding/${encodeURIComponent(String(data.enrollment_id))}`)
        return
      }
      onNavigate('/mercado')
      return
    }
    if (path && onNavigate) {
      onNavigate(path.startsWith('/') ? path : `/${path}`)
      return
    }
    if ((item.key === 'training' || item.key === 'program_active') && onNavigate) {
      if (data?.enrollment_id) {
        onNavigate(`/onboarding/${encodeURIComponent(String(data.enrollment_id))}`)
      } else {
        onNavigate('/mercado')
      }
      return
    }
    if (item.key === 'pix' && onNavigate) onNavigate('/pagamentos')
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs text-neutral-500">
        <Loader2 size={14} className="animate-spin" /> Verificando liberação…
      </div>
    )
  }

  if (!data) return null

  /* Liberado: some do home */
  if (ready || pending.length === 0) return null

  const primary = termsPending || pending[0]
  const PrimaryIcon = ICON_BY_KEY[primary.key] || FileText
  const remaining = Math.max(0, pending.length - 1)

  return (
    <>
      <div
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        role="region"
        aria-label="Pendências de liberação"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `${ctx.primary}14`, color: ctx.primary }}
          >
            <PrimaryIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-snug text-neutral-950">
              {primary.label}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
              {remaining > 0
                ? `Próximo passo · +${remaining} pendência${remaining > 1 ? 's' : ''}`
                : primary.action || 'Complete para liberar oportunidades'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleItemAction(primary)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-[12px] font-bold text-white"
            style={{ backgroundColor: ctx.primary }}
          >
            {primary.cta || (termsPending ? 'Aceitar' : 'Abrir')}
            <ChevronRight size={14} />
          </button>
        </div>

        {pending.length > 1 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2.5">
            {pending.slice(1).map((item) => {
              const Icon = ICON_BY_KEY[item.key] || FileText
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleItemAction(item)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 text-[11px] font-semibold text-neutral-700"
                >
                  <Icon size={12} className="text-neutral-500" />
                  {item.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {termsOpen ? (
        <div
          className="fixed inset-0 z-[560] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aff-terms-title"
          onMouseDown={() => !termsBusy && setTermsOpen(false)}
        >
          <div
            className="flex max-h-[min(92dvh,720px)] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-lg sm:rounded-[22px]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h2 id="aff-terms-title" className="text-[17px] font-bold text-neutral-950">
                  Aceite dos termos
                </h2>
                <p className="mt-1 text-xs leading-snug text-neutral-500">
                  {data.program_name
                    ? `Programa ${data.program_name}`
                    : 'Confirme para liberar a distribuição.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                disabled={termsBusy}
                onClick={() => setTermsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 active:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
              {termsLoading ? (
                <p className="flex items-center gap-2 py-8 text-sm text-neutral-500">
                  <Loader2 size={16} className="animate-spin" /> Carregando termos…
                </p>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-[13px] leading-relaxed text-neutral-800"
                  dangerouslySetInnerHTML={{ __html: termsHtml || '' }}
                />
              )}
            </div>

            <div className="space-y-3 border-t border-neutral-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
              <label className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-neutral-900"
                />
                <span className="text-[12px] leading-snug text-neutral-700">
                  Li e aceito os termos e condições do programa de afiliados.
                </span>
              </label>
              <button
                type="button"
                disabled={termsBusy || termsLoading || !termsChecked}
                onClick={() => void submitTermsAccept()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-sm font-bold text-white disabled:opacity-40"
              >
                {termsBusy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {termsBusy ? 'Registrando…' : 'Confirmar aceite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

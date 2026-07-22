import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, FileText, Link2, Loader2, MessageCircle, Pause, Play, Radio, RefreshCw, Send, UserRound, WifiOff, X } from 'lucide-react'
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
  can_receive: boolean
  blockers?: string[]
  checklist?: ChecklistItem[]
  enrollment_id?: string | null
  enrollment_status?: string | null
  program_name?: string | null
  terms_html?: string | null
  stats?: {
    assigned_total?: number
    assigned_active?: number
    assigned_today?: number
    messages_sent_today?: number
    messages_failed_today?: number
    queued_for_brand?: number
  }
}

type Assignment = {
  id: string
  prospect_name?: string | null
  prospect_city?: string | null
  prospect_region?: string | null
  assignment_status: string
  current_stage: string
  assigned_at?: string | null
  last_interaction_at?: string | null
  conversion_status?: string
  niche?: string | null
  initial_message_status?: string
  initial_message_at?: string | null
  initial_message_error?: string | null
  instance_id?: string | null
  instance_name?: string | null
  instance_phone?: string | null
}

type AssistantControl = {
  assistant: { affiliate_enabled: boolean; organization_enabled: boolean; effective_enabled: boolean }
  connections: {
    total: number
    connected: number
    daily_capacity: number
    capacity_per_connection?: number
  }
  conversations: { total: number; autonomous: number; waiting: number }
  campaigns: { active: number; queued: number; sent_today: number }
}

const DELIVERY_TEXT: Record<string, string> = {
  sent: 'Enviado pelo WhatsApp',
  failed: 'Falha no envio',
  not_sent: 'Ainda não enviado',
  disabled: 'Envio automático pausado',
  pending: 'Preparando envio',
  unknown: 'Entrega não confirmada',
}

function relativeTime(value?: string | null) {
  if (!value) return 'Agora'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'Agora'
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `Há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Há ${hours}h`
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('A sincronização está demorando mais que o esperado')), ms)),
  ])
}

export function AffiliateLiveDispatchPanel({
  ctx,
  onConnectWhatsApp,
  onNavigate,
}: {
  ctx: AppContext
  onConnectWhatsApp: () => void
  onNavigate?: (path: string) => void
}) {
  const [status, setStatus] = useState<DistributionStatus | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [control, setControl] = useState<AssistantControl | null>(null)
  const [confirmEnabled, setConfirmEnabled] = useState<boolean | null>(null)
  const [savingControl, setSavingControl] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [termsHtml, setTermsHtml] = useState<string | null>(null)
  const [termsBusy, setTermsBusy] = useState(false)
  const [termsLoading, setTermsLoading] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const [statusResult, assignmentsResult, controlResult] = await Promise.allSettled([
        withTimeout(affiliateApi.distributionStatus()),
        withTimeout(affiliateApi.distributionAssignments()),
        withTimeout(affiliateApi.assistantControl()),
      ])
      if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
      if (assignmentsResult.status === 'fulfilled') setAssignments(assignmentsResult.value.assignments || [])
      if (controlResult.status === 'fulfilled') setControl(controlResult.value)
      const failed = [statusResult, assignmentsResult, controlResult].filter((result) => result.status === 'rejected')
      if (failed.length === 3) throw new Error('Não foi possível sincronizar a central agora')
      setUpdatedAt(new Date())
      setError(failed.length ? 'Alguns dados ainda estão sendo sincronizados' : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar os envios')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refreshWhenVisible, 6_000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [load, ctx.cacheVersion])

  const live = Boolean(status?.can_receive)
  const sentTotal = assignments.length
  const engaged = useMemo(
    () => assignments.filter((item) => item.current_stage === 'engaged').length,
    [assignments],
  )
  const converted = useMemo(() => assignments.filter((item) => item.assignment_status === 'converted' || item.conversion_status === 'converted').length, [assignments])
  const pendingChecks = useMemo(
    () => (status?.checklist || []).filter((item) => !item.ok),
    [status?.checklist],
  )
  const pendingCheck = pendingChecks[0]
  const blockerText = pendingCheck?.action || pendingCheck?.label || status?.blockers?.[0] || 'Conclua a configuração para participar da distribuição.'
  // Prefer health/API connections; fallback para snapshot de distribuição
  const connected = Math.max(
    Number(control?.connections?.connected || 0),
    Number((status as any)?.connected_instances || 0),
  )
  const capacityPerConn = Number(control?.connections?.capacity_per_connection || 40)
  const capacity = Number(control?.connections?.daily_capacity || 0) || (connected * capacityPerConn)
  const sentToday = Number(status?.stats?.messages_sent_today || 0)
  const failedToday = Number(status?.stats?.messages_failed_today || 0)
  const queued = Number(status?.stats?.queued_for_brand || control?.campaigns?.queued || 0)
  const capacityPct = capacity > 0 ? Math.min(100, Math.round((sentToday / capacity) * 100)) : 0

  async function openTermsSheet() {
    setTermsOpen(true)
    setTermsChecked(false)
    setTermsBusy(false)
    if (status?.terms_html) {
      setTermsHtml(status.terms_html)
      return
    }
    setTermsLoading(true)
    try {
      let html = status?.terms_html || null
      const enrollmentId = status?.enrollment_id
      if (!html && enrollmentId) {
        const onboarding = await affiliateApi.onboarding(enrollmentId)
        html = onboarding?.enrollment?.terms_html || onboarding?.terms_html || null
      }
      if (!html) {
        // tenta listar enrollments ativos e carregar o primeiro
        const list = await affiliateApi.programEnrollments().catch(() => null)
        const en = (list?.enrollments || []).find((e: any) =>
          ['active', 'onboarding'].includes(String(e.status || '')),
        ) || (list?.enrollments || [])[0]
        if (en?.id) {
          const onboarding = await affiliateApi.onboarding(String(en.id))
          html = onboarding?.enrollment?.terms_html || null
        }
      }
      setTermsHtml(html || '<p>Não encontramos o texto dos termos. Contate a marca ou conclua o solicitado no programa.</p>')
    } catch {
      setTermsHtml('<p>Não foi possível carregar os termos agora. Tente novamente.</p>')
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
      setStatus(res)
      setTermsOpen(false)
      setTermsChecked(false)
      ctx.showToast('Termos aceitos. Status atualizado.')
      void load(true)
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Não foi possível registrar o aceite', 'err')
    } finally {
      setTermsBusy(false)
    }
  }

  function handleBlockerAction(item?: ChecklistItem | null) {
    if (!item || item.ok) return
    if (item.key === 'terms' || item.action_path === 'accept_terms') {
      void openTermsSheet()
      return
    }
    if (item.key === 'whatsapp' || item.action_path === '/conexoes') {
      onConnectWhatsApp()
      return
    }
    const path = item.action_path
    if (path && onNavigate) {
      onNavigate(path.startsWith('/') ? path : `/${path}`)
      return
    }
    if (item.key === 'training' && onNavigate) onNavigate('/aprendizado')
    if (item.key === 'pix' && onNavigate) onNavigate('/pagamentos')
    if (item.key === 'program_active' && onNavigate) onNavigate('/aprendizado')
  }

  async function applyAssistantControl() {
    if (confirmEnabled === null) return
    const next = confirmEnabled
    setSavingControl(true)
    try {
      await affiliateApi.updateAssistantControl(next)
      setControl((current) => current ? {
        ...current,
        assistant: { ...current.assistant, affiliate_enabled: next, effective_enabled: next && current.assistant.organization_enabled },
      } : current)
      ctx.showToast(next ? 'Assistente liberado nas suas conexões' : 'Assistente pausado nas suas conexões')
      setConfirmEnabled(null)
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : 'Não foi possível atualizar o assistente', 'err')
    } finally { setSavingControl(false) }
  }

  return (
    <div className="affiliate-live space-y-3 pb-2" aria-live="polite">
      <section className={`affiliate-ops__assistant ${control?.assistant.effective_enabled ? 'is-on' : ''}`}>
        <div className="affiliate-ops__assistant-top">
          <div className="affiliate-ops__assistant-icon"><Bot size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2>Assistente de atendimento</h2><span>{!control ? 'Carregando' : control.assistant.effective_enabled ? 'Ativo' : 'Pausado'}</span></div>
            <p>{!control ? 'Verificando a autonomia nas suas conexões.' : control.assistant.effective_enabled ? 'Respondendo automaticamente nas suas conexões.' : control.assistant.organization_enabled === false ? 'A organização ainda não liberou o atendimento automático.' : 'As respostas automáticas estão pausadas por você.'}</p>
          </div>
          <button
            type="button"
            className={`affiliate-ops__toggle ${control?.assistant.affiliate_enabled ? 'is-on' : ''}`}
            aria-pressed={Boolean(control?.assistant.affiliate_enabled)}
            aria-label={control?.assistant.affiliate_enabled ? 'Pausar assistente' : 'Ativar assistente'}
            disabled={!control || savingControl}
            onClick={() => setConfirmEnabled(!control?.assistant.affiliate_enabled)}
          ><span /></button>
        </div>
        <div className="affiliate-ops__assistant-stats">
          <div><MessageCircle size={15} /><span>Conversas</span><strong>{control?.conversations.total || 0}</strong></div>
          <div><Bot size={15} /><span>Com IA</span><strong>{control?.conversations.autonomous || 0}</strong></div>
          <div><AlertTriangle size={15} /><span>Aguardando</span><strong>{control?.conversations.waiting || 0}</strong></div>
        </div>
      </section>

      <section className="affiliate-ops__capacity affiliate-card">
        <div className="affiliate-ops__capacity-head">
          <div className="affiliate-ops__capacity-icon"><Send size={18} /></div>
          <div className="min-w-0 flex-1">
            <h3>Capacidade de alcance</h3>
            <p>
              {connected} {connected === 1 ? 'conexão ativa' : 'conexões ativas'}
              {connected > 0
                ? ` · até ${capacity.toLocaleString('pt-BR')} contatos/dia`
                : ' · conecte um WhatsApp para liberar alcance'}
            </p>
          </div>
          <strong>{sentToday}<small> enviados hoje</small></strong>
        </div>
        <div className="affiliate-ops__progress"><span style={{ width: `${capacityPct}%` }} /></div>
        <div className="affiliate-ops__queue">
          <span><Radio size={13} /> {control?.campaigns?.active || 0} campanhas</span>
          <span><Clock3 size={13} /> {queued} na fila</span>
          {failedToday > 0 && <span><AlertTriangle size={13} /> {failedToday} com falha</span>}
          {connected > 0 && (
            <span>{capacityPerConn}/conexão</span>
          )}
        </div>
        <button type="button" onClick={onConnectWhatsApp}>
          <Link2 size={15} />
          <span>
            <strong>{connected > 0 ? 'Conecte mais números' : 'Conectar WhatsApp'}</strong>
            <small>
              {connected > 0
                ? `Cada conexão adiciona cerca de ${capacityPerConn} contatos por dia.`
                : `Sem conexão ativa a capacidade fica em 0. Cada número libera cerca de ${capacityPerConn} contatos/dia.`}
            </small>
          </span>
        </button>
      </section>

      <section className={`affiliate-live__hero ${live ? 'is-live' : 'is-paused'}`}>
        <div className="affiliate-live__hero-head">
          <div className="affiliate-live__signal" aria-hidden="true"><Radio size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="affiliate-live__title">Distribuição ao vivo</h2>
              {live && <span className="affiliate-live__pulse" aria-label="Ativo" />}
            </div>
            <p className="affiliate-live__subtitle">{live ? 'Pronto para receber novos contatos da marca.' : 'O recebimento está pausado.'}</p>
          </div>
          <button type="button" className="affiliate-live__refresh" onClick={() => void load()} disabled={refreshing} aria-label="Atualizar agora">
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        {!live && (
          <div className="affiliate-live__blocker">
            <WifiOff size={16} />
            <div className="affiliate-live__blocker-copy min-w-0 flex-1">
              <span>{blockerText}</span>
              {pendingChecks.length > 1 && (
                <small className="block text-[11px] opacity-80 mt-0.5">
                  +{pendingChecks.length - 1} pendência{pendingChecks.length > 2 ? 's' : ''}
                </small>
              )}
            </div>
            {(pendingCheck?.cta || pendingCheck?.key === 'whatsapp' || pendingCheck?.key === 'terms') && (
              <button type="button" onClick={() => handleBlockerAction(pendingCheck)}>
                {pendingCheck?.cta
                  || (pendingCheck?.key === 'terms' ? 'Aceitar termos' : null)
                  || (pendingCheck?.key === 'whatsapp' ? 'Conectar' : 'Resolver')}
              </button>
            )}
          </div>
        )}
        {!live && pendingChecks.length > 0 && (
          <ul className="affiliate-live__checklist" aria-label="Checklist de elegibilidade">
            {pendingChecks.map((item) => (
              <li key={item.key}>
                <span className="affiliate-live__check-label">{item.label}</span>
                {(item.cta || item.key === 'terms' || item.key === 'whatsapp') && (
                  <button type="button" className="affiliate-live__check-cta" onClick={() => handleBlockerAction(item)}>
                    {item.cta
                      || (item.key === 'terms' ? 'Aceitar termos' : null)
                      || (item.key === 'whatsapp' ? 'Conectar' : 'Resolver')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="affiliate-live__metrics">
          <div><span>Enviados</span><strong>{sentTotal}</strong></div>
          <div><span>Responderam</span><strong>{engaged}</strong></div>
          <div><span>Convertidos</span><strong>{converted}</strong></div>
        </div>
      </section>

      <div className="affiliate-live__section-head">
        <div><h3>Envios confirmados</h3><p>{updatedAt ? `Atualizado ${relativeTime(updatedAt.toISOString()).toLowerCase()}` : 'Sincronizando dados reais'}</p></div>
        <span>{assignments.length}</span>
      </div>
      {error && <div className="affiliate-live__error"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {loading ? (
        <div className="space-y-2"><div className="affiliate-skel h-24" /><div className="affiliate-skel h-24" /><div className="affiliate-skel h-24" /></div>
      ) : !assignments.length ? (
        <div className="affiliate-live__empty">
          <Activity size={25} /><p>Nenhum envio confirmado ainda</p>
          <span>{live ? 'Somente mensagens realmente enviadas pela sua seção do WhatsApp aparecerão aqui.' : 'Resolva o bloqueio acima para começar a enviar.'}</span>
        </div>
      ) : (
        <div className="affiliate-live__feed">
          {assignments.map((item) => {
            const convertedItem = item.assignment_status === 'converted' || item.conversion_status === 'converted'
            const deliveryFailed = item.initial_message_status === 'failed' || item.initial_message_status === 'not_sent'
            const needsAttention = item.current_stage === 'needs_human_attention' || deliveryFailed
            const Icon = convertedItem ? CheckCircle2 : needsAttention ? AlertTriangle : UserRound
            return (
              <article key={item.id} className="affiliate-live__item">
                <div className={`affiliate-live__item-icon ${convertedItem ? 'is-success' : needsAttention ? 'is-warning' : ''}`}><Icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="affiliate-live__item-top"><p>{item.prospect_name || 'Novo contato'}</p><time>{relativeTime(item.initial_message_at)}</time></div>
                  <span className="affiliate-live__place">{[item.prospect_city, item.prospect_region].filter(Boolean).join(' · ') || 'Região não informada'}</span>
                  <span className="affiliate-live__niche">{item.niche || 'Nicho não informado na origem'}</span>
                  <div className="affiliate-live__item-status">
                    <span>{DELIVERY_TEXT[item.initial_message_status || 'sent'] || 'Enviado pelo WhatsApp'}</span>
                    <small><Send size={11} /> {item.instance_name || item.instance_phone || 'Seção do afiliado'}</small>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {confirmEnabled !== null && (
        <div className="affiliate-ops__confirm" role="dialog" aria-modal="true" aria-labelledby="assistant-confirm-title">
          <button type="button" className="affiliate-ops__confirm-backdrop" aria-label="Cancelar" onClick={() => setConfirmEnabled(null)} />
          <div className="affiliate-ops__confirm-sheet">
            <div className="affiliate-ops__confirm-icon">{confirmEnabled ? <Play size={22} /> : <Pause size={22} />}</div>
            <button type="button" className="affiliate-ops__confirm-close" aria-label="Fechar" onClick={() => setConfirmEnabled(null)}><X size={18} /></button>
            <h2 id="assistant-confirm-title">{confirmEnabled ? 'Ativar o assistente?' : 'Pausar o assistente?'}</h2>
            <p>{confirmEnabled ? 'A IA poderá responder novos contatos nas conexões deste programa, respeitando as regras da organização.' : 'A IA deixará de responder automaticamente. Suas conversas e filas continuarão disponíveis para atendimento manual.'}</p>
            <div className="affiliate-ops__confirm-actions"><button type="button" onClick={() => setConfirmEnabled(null)}>Cancelar</button><button type="button" disabled={savingControl} onClick={() => void applyAssistantControl()}>{savingControl ? 'Salvando…' : confirmEnabled ? 'Ativar assistente' : 'Pausar assistente'}</button></div>
          </div>
        </div>
      )}

      {termsOpen && (
        <div className="affiliate-ops__confirm" role="dialog" aria-modal="true" aria-labelledby="terms-accept-title">
          <button type="button" className="affiliate-ops__confirm-backdrop" aria-label="Fechar" onClick={() => setTermsOpen(false)} />
          <div className="affiliate-ops__confirm-sheet affiliate-live__terms-sheet">
            <div className="affiliate-ops__confirm-icon"><FileText size={22} /></div>
            <button type="button" className="affiliate-ops__confirm-close" aria-label="Fechar" onClick={() => setTermsOpen(false)}><X size={18} /></button>
            <h2 id="terms-accept-title">Aceite dos termos</h2>
            <p>
              {status?.program_name
                ? `Leia e confirme o aceite do programa ${status.program_name} para liberar a distribuição ao vivo.`
                : 'Leia e confirme o aceite dos termos do programa para liberar a distribuição ao vivo.'}
            </p>
            <div className="affiliate-live__terms-body">
              {termsLoading ? (
                <div className="grid place-items-center py-8"><Loader2 size={22} className="animate-spin text-[#c7c7cc]" /></div>
              ) : (
                <div
                  className="affiliate-live__terms-html prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: termsHtml || '' }}
                />
              )}
            </div>
            <label className="affiliate-live__terms-check">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
              />
              <span>Li e aceito os termos e condições deste programa</span>
            </label>
            <div className="affiliate-ops__confirm-actions">
              <button type="button" onClick={() => setTermsOpen(false)}>Cancelar</button>
              <button
                type="button"
                disabled={termsBusy || termsLoading || !termsChecked}
                onClick={() => void submitTermsAccept()}
              >
                {termsBusy ? 'Registrando…' : 'Confirmar aceite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

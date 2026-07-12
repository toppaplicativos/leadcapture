import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Link2, MessageCircle, Pause, Play, Radio, RefreshCw, Send, UserRound, WifiOff, X } from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

type DistributionStatus = {
  can_receive: boolean
  blockers?: string[]
  checklist?: Array<{ key: string; label: string; ok: boolean; action?: string | null }>
  stats?: { assigned_total?: number; assigned_active?: number; assigned_today?: number; queued_for_brand?: number }
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
}

type AssistantControl = {
  assistant: { affiliate_enabled: boolean; organization_enabled: boolean; effective_enabled: boolean }
  connections: { total: number; connected: number; daily_capacity: number }
  conversations: { total: number; autonomous: number; waiting: number }
  campaigns: { active: number; queued: number; sent_today: number }
}

const STATUS_TEXT: Record<string, string> = {
  assigned: 'Recebido', active: 'Em atendimento', converted: 'Convertido',
  lost: 'Encerrado', recycled: 'Redistribuído',
}
const STAGE_TEXT: Record<string, string> = {
  assigned_to_affiliate: 'Novo contato', engaged: 'Contato respondeu',
  needs_human_attention: 'Precisa de atenção', converted: 'Venda registrada',
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

export function AffiliateLiveDispatchPanel({ ctx, onConnectWhatsApp }: { ctx: AppContext; onConnectWhatsApp: () => void }) {
  const [status, setStatus] = useState<DistributionStatus | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [control, setControl] = useState<AssistantControl | null>(null)
  const [confirmEnabled, setConfirmEnabled] = useState<boolean | null>(null)
  const [savingControl, setSavingControl] = useState(false)

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
  const active = Number(status?.stats?.assigned_active || 0)
  const total = Number(status?.stats?.assigned_total || assignments.length)
  const converted = useMemo(() => assignments.filter((item) => item.assignment_status === 'converted' || item.conversion_status === 'converted').length, [assignments])
  const pendingCheck = status?.checklist?.find((item) => !item.ok)
  const blockerText = pendingCheck?.action || pendingCheck?.label || status?.blockers?.[0] || 'Conclua a configuração para participar da distribuição.'
  const blockerNeedsWhatsApp = pendingCheck?.key === 'whatsapp'
  const connected = Number(control?.connections.connected || 0)
  const capacity = Number(control?.connections.daily_capacity || connected * 40)
  const sentToday = Number(status?.stats?.assigned_today || control?.campaigns.sent_today || 0)
  const queued = Number(status?.stats?.queued_for_brand || control?.campaigns.queued || 0)
  const capacityPct = capacity > 0 ? Math.min(100, Math.round((sentToday / capacity) * 100)) : 0

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
          <div className="min-w-0 flex-1"><h3>Capacidade de alcance</h3><p>{connected} {connected === 1 ? 'conexão ativa' : 'conexões ativas'} · até {capacity} contatos/dia</p></div>
          <strong>{sentToday}<small> hoje</small></strong>
        </div>
        <div className="affiliate-ops__progress"><span style={{ width: `${capacityPct}%` }} /></div>
        <div className="affiliate-ops__queue"><span><Radio size={13} /> {control?.campaigns.active || 0} campanhas</span><span><Clock3 size={13} /> {queued} na fila</span></div>
        <button type="button" onClick={onConnectWhatsApp}><Link2 size={15} /><span><strong>Conecte mais números</strong><small>Cada conexão adiciona capacidade média para 40 contatos por dia.</small></span></button>
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
            <WifiOff size={16} /><span>{blockerText}</span>
            {blockerNeedsWhatsApp && <button type="button" onClick={onConnectWhatsApp}>Resolver</button>}
          </div>
        )}
        <div className="affiliate-live__metrics">
          <div><span>Ativos</span><strong>{active}</strong></div>
          <div><span>Recebidos</span><strong>{total}</strong></div>
          <div><span>Convertidos</span><strong>{converted}</strong></div>
        </div>
      </section>

      <div className="affiliate-live__section-head">
        <div><h3>Atividade recente</h3><p>{updatedAt ? `Atualizado ${relativeTime(updatedAt.toISOString()).toLowerCase()}` : 'Sincronizando dados reais'}</p></div>
        <span>{assignments.length}</span>
      </div>
      {error && <div className="affiliate-live__error"><AlertTriangle size={17} /><span>{error}</span><button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {loading ? (
        <div className="space-y-2"><div className="affiliate-skel h-24" /><div className="affiliate-skel h-24" /><div className="affiliate-skel h-24" /></div>
      ) : !assignments.length ? (
        <div className="affiliate-live__empty">
          <Activity size={25} /><p>Nenhum contato recebido ainda</p>
          <span>{live ? 'Esta tela será atualizada automaticamente quando a marca iniciar uma distribuição.' : 'Resolva o bloqueio acima para começar a receber.'}</span>
        </div>
      ) : (
        <div className="affiliate-live__feed">
          {assignments.map((item) => {
            const convertedItem = item.assignment_status === 'converted' || item.conversion_status === 'converted'
            const needsAttention = item.current_stage === 'needs_human_attention'
            const Icon = convertedItem ? CheckCircle2 : needsAttention ? AlertTriangle : UserRound
            return (
              <article key={item.id} className="affiliate-live__item">
                <div className={`affiliate-live__item-icon ${convertedItem ? 'is-success' : needsAttention ? 'is-warning' : ''}`}><Icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="affiliate-live__item-top"><p>{item.prospect_name || 'Novo contato'}</p><time>{relativeTime(item.last_interaction_at || item.assigned_at)}</time></div>
                  <span className="affiliate-live__place">{[item.prospect_city, item.prospect_region].filter(Boolean).join(' · ') || 'Região não informada'}</span>
                  <span className="affiliate-live__niche">{item.niche || 'Nicho ainda não identificado'}</span>
                  <div className="affiliate-live__item-status"><span>{STATUS_TEXT[item.assignment_status] || 'Em acompanhamento'}</span><small><Clock3 size={11} /> {STAGE_TEXT[item.current_stage] || 'Fluxo iniciado'}</small></div>
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
    </div>
  )
}

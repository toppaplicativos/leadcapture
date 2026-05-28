/**
 * AICampaignWizardModal — wizard de IA pra montar campanha do zero.
 *
 * 3 estagios:
 *   1. INPUT  — textarea pra prompt + chips de exemplo
 *   2. STREAM — pipeline visual com 7 skills, status ao vivo via SSE
 *   3. RESULT — resumo da campanha gerada + botoes (revisar / fechar)
 *
 * O backend (POST /api/ai-campaign/squad-stream) faz streaming SSE.
 * Como fetch+SSE nao roda nativo com POST, usamos fetch() com body de streaming
 * pra parsear os "data: ..." manualmente (mesmo padrao do landingChat).
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Sparkles, X, Loader2, ArrowRight, MessageSquare, Target,
  Users, Brain, Gauge, Zap, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, AlertCircle, Lightbulb, Send,
  Compass, MapPin, Activity,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  /* Chamado quando a campanha foi criada — pai navega pra revisao */
  onCampaignCreated: (campaignId: string) => void
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

/* ────────── Mapeamento das 7 skills (label + icon + descricao) ────────── */

interface SkillMeta {
  step: number
  name: string
  label: string
  description: string
  Icon: LucideIcon
}

const SKILLS: SkillMeta[] = [
  { step: 1, name: 'interpretBrief',       label: 'Interpretar pedido',        description: 'Lendo seu prompt e extraindo intenção, oferta, urgência e tom', Icon: Lightbulb },
  { step: 2, name: 'defineAudience',       label: 'Definir público',           description: 'Escolhendo segmentos, cidades, critérios e perfil ideal', Icon: Target },
  { step: 3, name: 'discoverNewProspects', label: 'Descobrir novos prospects', description: 'IA sugerindo segmentos rastreáveis no Google Maps', Icon: Compass },
  { step: 4, name: 'selectExistingLeads',  label: 'Selecionar leads do brand', description: 'Filtrando customers já no seu CRM por categoria + cidade', Icon: Users },
  { step: 5, name: 'composeMessage',       label: 'Compor mensagem',           description: 'Escrevendo template + personalização por IA', Icon: MessageSquare },
  { step: 6, name: 'calibrateSpeed',       label: 'Calibrar velocidade',       description: 'Intervalo, cap diário, rotação de instâncias anti-ban', Icon: Gauge },
  { step: 7, name: 'assembleCampaign',     label: 'Montar campanha',           description: 'Persistindo no engine como rascunho pronto pra revisão', Icon: Zap },
]

type StepStatus = 'pending' | 'running' | 'done' | 'error'
interface StepState { status: StepStatus; output?: any; durationMs?: number; message?: string }

/* ────────── Exemplos de prompt (estaticos por ora) ────────── */
const PROMPT_EXAMPLES = [
  'Quero vender consórcio para pequenos comerciantes em Fortaleza',
  'Reativar leads de pizzarias que captei mas não respondem há 30 dias',
  'Campanha educativa para clínicas odontológicas em SP sobre nosso software',
  'Oferta de delivery para restaurantes de Aldeota com ticket médio alto',
]

/* ────────── Helpers ────────── */
function fmtDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function fmtKv(obj: any, max = 5): Array<[string, string]> {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).slice(0, max).map(([k, v]) => {
    const val = Array.isArray(v) ? v.slice(0, 4).join(', ') : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v)
    return [k, val.length > 120 ? val.slice(0, 120) + '…' : val] as [string, string]
  })
}

/* ════════════════════════════════════════════════════════════════
   COMPONENTE
   ════════════════════════════════════════════════════════════════ */

export function AICampaignWizardModal({ open, onClose, onCampaignCreated }: Props) {
  type Stage = 'input' | 'stream' | 'result' | 'error'
  const [stage, setStage] = useState<Stage>('input')
  const [prompt, setPrompt] = useState('')
  const [steps, setSteps] = useState<Record<string, StepState>>({})
  const [final, setFinal] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* ESC fecha (so quando nao esta streaming) */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'stream') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, stage])

  /* Reset quando fecha */
  useEffect(() => {
    if (!open) {
      setStage('input'); setPrompt(''); setSteps({}); setFinal(null); setErrorMsg(null)
      abortRef.current?.abort(); abortRef.current = null
    }
  }, [open])

  const handleClose = useCallback(() => {
    if (stage === 'stream') {
      /* Pergunta antes de cancelar squad em execucao */
      if (!confirm('O squad está em execução. Deseja cancelar?')) return
      abortRef.current?.abort()
    }
    onClose()
  }, [onClose, stage])

  const generate = useCallback(async () => {
    const p = prompt.trim()
    if (!p) return setErrorMsg('Descreva o que você quer fazer')
    if (p.length < 12) return setErrorMsg('Conte um pouco mais — uma frase com o objetivo, público e oferta')

    setErrorMsg(null)
    setSteps({})
    setFinal(null)
    setStage('stream')

    /* Marca todas as 7 skills como pending pra UI mostrar o pipeline completo */
    const initial: Record<string, StepState> = {}
    for (const s of SKILLS) initial[s.name] = { status: 'pending' }
    setSteps(initial)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const r = await fetch('/api/ai-campaign/squad-stream', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ prompt: p, options: {} }),
        signal: controller.signal,
      })
      if (!r.ok || !r.body) {
        const err = await r.json().catch(() => null)
        throw new Error(err?.error || `HTTP ${r.status}`)
      }

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const raw of lines) {
          const line = raw.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const evt = JSON.parse(payload)
            handleEvent(evt)
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setErrorMsg('Cancelado.')
      } else {
        setErrorMsg(e?.message || 'Falha ao executar squad')
      }
      setStage('error')
    } finally {
      abortRef.current = null
    }
  }, [prompt])

  /* Lida com cada evento SSE: atualiza estado dos steps */
  const handleEvent = useCallback((evt: any) => {
    if (!evt || typeof evt !== 'object') return

    /* Erro fatal do squad */
    if (evt.name === 'error') {
      setErrorMsg(evt.message || 'Erro durante execução')
      setStage('error')
      return
    }

    /* Evento "final" — tem output da campanha gerada */
    if (evt.name === 'final') {
      setFinal(evt.output)
      setStage('result')
      return
    }

    /* Eventos das skills.
       - running/done: padrão
       - error (no contexto de uma skill, NAO no global): soft-fail — squad
         continua mas marca essa skill como erro visual (amber/rose) sem matar o stage */
    if (typeof evt.name === 'string' && evt.status) {
      const skillStatus: StepStatus =
        evt.status === 'running' ? 'running' :
        evt.status === 'done'    ? 'done'    :
        evt.status === 'error'   ? 'error'   :
        'pending'
      setSteps((prev) => ({
        ...prev,
        [evt.name]: {
          status: skillStatus !== 'pending' ? skillStatus : (prev[evt.name]?.status || 'pending'),
          output: evt.output ?? prev[evt.name]?.output,
          durationMs: evt.durationMs ?? prev[evt.name]?.durationMs,
          message: evt.message ?? prev[evt.name]?.message,
        },
      }))
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/45 backdrop-blur-sm p-4" style={{ animation: 'fadeIn 160ms ease-out' }}>
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col"
        style={{ animation: 'slideUp 220ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 shrink-0">
          <div className="ai-shimmer w-10 h-10 rounded-xl bg-gray-900 grid place-items-center shrink-0 relative overflow-hidden">
            <Sparkles size={18} className="text-white relative z-10" strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-gray-900 tracking-tight leading-tight">
              Criar campanha com IA
            </h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              {stage === 'input' && 'Descreva o que quer fazer — o squad monta tudo pra você revisar.'}
              {stage === 'stream' && '7 skills em execução. Você vai ver tudo ao vivo.'}
              {stage === 'result' && 'Campanha pronta em rascunho. Revise antes de disparar.'}
              {stage === 'error' && 'Algo deu errado. Veja detalhes abaixo.'}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition shrink-0"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto">

          {/* ════════ INPUT STAGE ════════ */}
          {stage === 'input' && (
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  O que você quer que a IA faça?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
                  placeholder="Ex: Quero vender consórcio para pequenos comerciantes em Fortaleza, foco em quem busca crédito rápido"
                  rows={4}
                  autoFocus
                  className="w-full p-3 rounded-xl border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 placeholder:font-normal resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
                <p className="text-[10.5px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                  <Lightbulb size={11} strokeWidth={2} />
                  Inclua objetivo, público e oferta. <kbd className="ml-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[9px] font-mono">⌘+Enter</kbd>
                </p>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Sparkles size={10} strokeWidth={2.25} className="text-gray-400" />
                  Exemplos
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-[11px] text-gray-700 font-medium transition border border-transparent hover:border-gray-200"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-[12px] font-medium flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ════════ STREAM STAGE — Pipeline visual ════════ */}
          {stage === 'stream' && (
            <div className="p-5">
              <SquadPipeline steps={steps} />
            </div>
          )}

          {/* ════════ RESULT STAGE ════════ */}
          {stage === 'result' && final && (
            <div className="p-5 space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 grid place-items-center shrink-0">
                    <CheckCircle2 size={18} className="text-white" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[15px] font-bold text-emerald-900">Campanha criada em rascunho</h4>
                    <p className="text-[12px] text-emerald-800/80 mt-0.5">
                      Revise o público, mensagem e velocidade antes de disparar.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <ResultRow label="Nome" value={final.name} />
                  <ResultRow label="Público alvo" value={`${final.target_count || 0} leads selecionados`} />
                  <ResultRow label="Velocidade" value={final.speed_summary || '—'} />
                  {final.message_preview && (
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-900/60 uppercase tracking-wider mb-1">Prévia da mensagem</p>
                      <div className="p-3 rounded-xl bg-white border border-emerald-100 text-[12.5px] text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {final.message_preview}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pipeline read-only embaixo */}
              <details className="rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                <summary className="px-4 py-2.5 cursor-pointer text-[11.5px] font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
                  <Activity size={11} strokeWidth={2.25} />
                  Ver os 7 passos do squad
                </summary>
                <div className="p-4 pt-2 border-t border-gray-100">
                  <SquadPipeline steps={steps} compact />
                </div>
              </details>
            </div>
          )}

          {/* ════════ ERROR STAGE ════════ */}
          {stage === 'error' && (
            <div className="p-5 space-y-3">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 grid place-items-center shrink-0">
                    <XCircle size={18} className="text-white" strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-bold text-rose-900">Não foi possível gerar a campanha</h4>
                    <p className="text-[12px] text-rose-800/85 mt-1">{errorMsg}</p>
                  </div>
                </div>
              </div>
              {Object.keys(steps).length > 0 && <SquadPipeline steps={steps} />}
            </div>
          )}

        </div>

        {/* Footer ações */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0 bg-gray-50/50">
          {stage === 'input' && (
            <>
              <button
                onClick={handleClose}
                className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={generate}
                disabled={!prompt.trim()}
                className="ai-shimmer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[12.5px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
              >
                <Sparkles size={13} strokeWidth={2.5} className="relative z-10" />
                <span className="relative z-10">Gerar campanha</span>
                <ArrowRight size={13} strokeWidth={2.5} className="relative z-10" />
              </button>
            </>
          )}

          {stage === 'stream' && (
            <button
              onClick={handleClose}
              className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-rose-700 hover:bg-rose-50 transition"
            >
              Cancelar squad
            </button>
          )}

          {stage === 'result' && final?.campaign_id && (
            <>
              <button
                onClick={handleClose}
                className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                Fechar
              </button>
              <button
                onClick={() => { onCampaignCreated(final.campaign_id); onClose() }}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold transition"
              >
                <Send size={13} strokeWidth={2.5} />
                Abrir campanha para revisar
                <ArrowRight size={13} strokeWidth={2.5} />
              </button>
            </>
          )}

          {stage === 'error' && (
            <>
              <button
                onClick={handleClose}
                className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                Fechar
              </button>
              <button
                onClick={() => { setStage('input'); setErrorMsg(null); setSteps({}); }}
                className="h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[12.5px] font-bold transition"
              >
                Tentar novamente
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   SquadPipeline — stepper vertical reutilizavel
   ════════════════════════════════════════════════════════════════ */

export function SquadPipeline({ steps, compact = false }: {
  steps: Record<string, StepState>
  compact?: boolean
}) {
  return (
    <ol className="relative space-y-3">
      {SKILLS.map((skill, idx) => {
        const state = steps[skill.name] || { status: 'pending' as StepStatus }
        const isLast = idx === SKILLS.length - 1
        return (
          <li key={skill.name} className="relative">
            {/* Linha conectora */}
            {!isLast && (
              <div className={`absolute left-[19px] top-10 bottom-[-12px] w-px ${
                state.status === 'done' ? 'bg-emerald-300' : 'bg-gray-200'
              }`} />
            )}

            <div className="flex items-start gap-3">
              {/* Dot/icone */}
              <StepDot status={state.status} Icon={skill.Icon} />

              {/* Conteudo */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10.5px] font-mono font-bold text-gray-400 tabular-nums">{String(skill.step).padStart(2, '0')}</span>
                    <span className={`text-[13.5px] font-bold tracking-tight ${
                      state.status === 'running' ? 'text-gray-900' :
                      state.status === 'done' ? 'text-gray-900' :
                      state.status === 'error' ? 'text-rose-700' : 'text-gray-400'
                    }`}>
                      {skill.label}
                    </span>
                    <StatusPill status={state.status} />
                  </div>
                  {state.durationMs && <span className="text-[10px] font-mono text-gray-400 tabular-nums">{fmtDuration(state.durationMs)}</span>}
                </div>

                {!compact && (
                  <p className={`text-[11.5px] mt-0.5 leading-snug ${
                    state.status === 'pending' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {state.message || skill.description}
                  </p>
                )}

                {/* Output preview — chips com KV (so quando done) */}
                {(state.status === 'done' || state.status === 'error') && state.output && (
                  <OutputPreview output={state.output} skillName={skill.name} compact={compact} />
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepDot({ status, Icon }: { status: StepStatus; Icon: LucideIcon }) {
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isError = status === 'error'

  return (
    <div className={`relative shrink-0 w-10 h-10 rounded-full grid place-items-center transition-all ${
      isDone ? 'bg-emerald-500 ring-4 ring-emerald-100' :
      isError ? 'bg-rose-500 ring-4 ring-rose-100' :
      isRunning ? 'bg-gray-900 ring-4 ring-gray-900/10' :
      'bg-white border-2 border-gray-200'
    }`}>
      {isRunning && (
        <>
          <span className="absolute inset-0 rounded-full animate-ping bg-gray-900 opacity-30" />
          <Loader2 size={14} className="text-white animate-spin relative z-10" />
        </>
      )}
      {isDone && <CheckCircle2 size={16} className="text-white" strokeWidth={2.5} />}
      {isError && <XCircle size={16} className="text-white" strokeWidth={2.5} />}
      {status === 'pending' && <Icon size={14} className="text-gray-400" strokeWidth={2} />}
    </div>
  )
}

function StatusPill({ status }: { status: StepStatus }) {
  if (status === 'running') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white tracking-wider uppercase animate-pulse">Rodando</span>
  if (status === 'done') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 tracking-wider uppercase">Concluído</span>
  if (status === 'error') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 tracking-wider uppercase">Erro</span>
  return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 tracking-wider uppercase flex items-center gap-1"><Clock size={9} strokeWidth={2.5} /> Aguardando</span>
}

/* Preview do output — extrai os campos mais uteis por skill pra mostrar inline */
function OutputPreview({ output, skillName, compact }: { output: any; skillName: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  if (compact) return null

  /* Custom preview por skill - mostra so o essencial */
  let summary: Array<[string, string]> = []
  switch (skillName) {
    case 'interpretBrief':
      summary = [
        ['Oferta', output?.offering || '—'],
        ['Público', output?.audience_hint || '—'],
        ['Tom', `${output?.tone || '—'} · urgência ${output?.urgency || '—'}`],
      ]
      break
    case 'defineAudience':
      summary = [
        ['Descrição', output?.description || '—'],
        ['Segmentos', (output?.segments || []).slice(0, 4).join(', ') || '—'],
        ['Cidades', (output?.cities || []).join(', ') || '(qualquer)'],
      ]
      break
    case 'discoverNewProspects':
      summary = [
        ['Leitura de mercado', output?.market_reading || '—'],
        ['Segmentos sugeridos', (output?.segments_to_search || []).slice(0, 4).join(', ') || '—'],
        ['Cidades recomendadas', (output?.cities_recommended || []).slice(0, 3).map((c: any) => `${c.name}/${c.state}`).join(', ') || '—'],
      ]
      break
    case 'selectExistingLeads':
      summary = [
        ['Leads selecionados', String(output?.count || 0)],
        ['Amostra', (output?.sample || []).slice(0, 3).map((l: any) => l.name).join(', ') || '(nenhum)'],
      ]
      break
    case 'composeMessage':
      summary = [
        ['Template', String(output?.messageTemplate || '').slice(0, 140) + ((output?.messageTemplate || '').length > 140 ? '…' : '')],
        ['Variáveis', (output?.variables || []).join(', ') || '(sem)'],
        ['IA por lead', output?.useAI ? 'Sim' : 'Não'],
      ]
      break
    case 'calibrateSpeed':
      summary = [
        ['Estratégia', output?.reasoning || '—'],
        ['Cap diário', String(output?.dailyLimit || '—')],
        ['Modo', output?.campaignMode || '—'],
      ]
      break
    case 'assembleCampaign':
      summary = [
        ['Campanha', output?.name || '—'],
        ['Status', output?.status || '—'],
        ['Leads alvo', String(output?.target_count || 0)],
      ]
      break
    default:
      summary = fmtKv(output, 4)
  }

  return (
    <div className="mt-2 space-y-1">
      {summary.map(([k, v]) => (
        <div key={k} className="text-[11px] leading-snug">
          <span className="font-bold text-gray-500 uppercase tracking-wider text-[9.5px] mr-1.5">{k}:</span>
          <span className="text-gray-800">{v}</span>
        </div>
      ))}
      {output && Object.keys(output).length > summary.length && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10.5px] font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-0.5 mt-1"
        >
          {expanded ? <><ChevronUp size={10} /> Recolher</> : <><ChevronDown size={10} /> Ver tudo</>}
        </button>
      )}
      {expanded && (
        <pre className="mt-1.5 text-[10px] bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-gray-700 whitespace-pre-wrap break-all max-h-48">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-emerald-900/60 uppercase tracking-wider">{label}</p>
      <p className="text-[13px] font-medium text-emerald-950">{value}</p>
    </div>
  )
}

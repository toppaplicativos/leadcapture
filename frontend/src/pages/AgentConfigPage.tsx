/**
 * AgentConfigPage — Configuração completa do atendente IA
 *
 * Seções:
 *   1. Identidade       — nome, tom, emojis, tamanho máximo
 *   2. Abordagem Inicial — first_contact_script
 *   3. Comunicação      — communication_rules, objective
 *   4. Treinamento      — business_context, training_notes, termos
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Bot, MessageSquare, BookOpen, Settings2, Save, Loader2,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

function splitCsv(s: string): string[] {
  return s.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)
}

/* ─────────────────────────────────────────────────────────────
   Sub-componente: Section card
   ───────────────────────────────────────────────────────────── */
function Section({
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Field helpers
   ───────────────────────────────────────────────────────────── */
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
        {children}
      </span>
      {hint && (
        <span className="group relative cursor-default">
          <Info size={12} className="text-gray-400" />
          <span className="pointer-events-none absolute left-5 top-0 z-10 w-56 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            {hint}
          </span>
        </span>
      )}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition"
    />
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition resize-none"
    />
  )
}

/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */
export function AgentConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ── Form state ── */
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState<'formal' | 'casual' | 'friendly' | 'professional'>('professional')
  const [includeEmojis, setIncludeEmojis] = useState(true)
  const [maxLength, setMaxLength] = useState('500')

  const [firstContactScript, setFirstContactScript] = useState('')

  const [objective, setObjective] = useState('')
  const [communicationRules, setCommunicationRules] = useState('')

  const [businessContext, setBusinessContext] = useState('')
  const [trainingNotes, setTrainingNotes] = useState('')
  const [preferredTerms, setPreferredTerms] = useState('')
  const [forbiddenTerms, setForbiddenTerms] = useState('')

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ai/agent-profile', { headers: getHeaders() })
      const json = await r.json()
      const p = json.profile || {}
      setAgentName(p.agent_name || '')
      setTone(p.tone || 'professional')
      setIncludeEmojis(Boolean(p.include_emojis ?? true))
      setMaxLength(String(p.max_length || 500))
      setFirstContactScript(p.first_contact_script || '')
      setObjective(p.objective || '')
      setCommunicationRules(p.communication_rules || '')
      setBusinessContext(p.business_context || '')
      setTrainingNotes(p.training_notes || '')
      setPreferredTerms(
        Array.isArray(p.preferred_terms) ? p.preferred_terms.join(', ') : (p.preferred_terms || '')
      )
      setForbiddenTerms(
        Array.isArray(p.forbidden_terms) ? p.forbidden_terms.join(', ') : (p.forbidden_terms || '')
      )
    } catch {
      setError('Falha ao carregar configurações.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* ── Save ── */
  const save = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await fetch('/api/ai/agent-profile', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          agent_name: agentName,
          tone,
          include_emojis: includeEmojis,
          max_length: Math.max(100, Math.min(1200, Number(maxLength) || 500)),
          first_contact_script: firstContactScript,
          objective,
          communication_rules: communicationRules,
          business_context: businessContext,
          training_notes: trainingNotes,
          preferred_terms: splitCsv(preferredTerms),
          forbidden_terms: splitCsv(forbiddenTerms),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  /* ── Tone labels ── */
  const toneOptions = [
    { value: 'professional', label: 'Profissional' },
    { value: 'friendly',     label: 'Amigavel' },
    { value: 'formal',       label: 'Formal' },
    { value: 'casual',       label: 'Casual' },
  ] as const

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Atendente</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure a identidade e o comportamento do agente IA
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={15} />
          ) : (
            <Save size={15} />
          )}
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 1. Identidade */}
      <Section
        icon={Bot}
        title="Identidade"
        description="Nome, tom de voz e limites de resposta do agente"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <Label hint="Como o agente se apresenta ao lead">Nome do agente</Label>
            <Input
              value={agentName}
              onChange={setAgentName}
              placeholder="Assistente Comercial"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label hint="Define o registro de linguagem das respostas">Tom de voz</Label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
            >
              {toneOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label hint="Comprimento máximo de cada resposta em caracteres">Tamanho max. (chars)</Label>
            <Input
              value={maxLength}
              onChange={setMaxLength}
              placeholder="500"
              type="number"
            />
          </div>
          <div>
            <Label>Emojis nas respostas</Label>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIncludeEmojis(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  includeEmojis
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                Permitir
              </button>
              <button
                type="button"
                onClick={() => setIncludeEmojis(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  !includeEmojis
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                Desativar
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* 2. Abordagem Inicial */}
      <Section
        icon={MessageSquare}
        title="Abordagem Inicial"
        description="Como o agente responde quando alguem envia a primeira mensagem"
      >
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Como funciona</p>
          <p>
            Quando um lead envia sua primeira mensagem (ex: "Oi"), o agente responde de forma
            simples e natural, sem apresentacao formal completa. A apresentacao acontece
            gradualmente conforme a conversa evolui.
          </p>
          <p className="mt-1">
            Use o campo abaixo para personalizar esse primeiro contato. Se deixar vazio, o
            agente usa o padrao: responde ao cumprimento e convida o lead a falar.
          </p>
        </div>

        <div>
          <Label hint="Exemplo: 'Responda com um Oi simples e pergunte em que pode ajudar. Nao mencione o nome da empresa ainda.'">
            Script de abordagem inicial
          </Label>
          <Textarea
            value={firstContactScript}
            onChange={setFirstContactScript}
            placeholder={`Exemplos:\n• Responda com um cumprimento simples e pergunte em que pode ajudar.\n• Na primeira mensagem, diga apenas 'Oi! Como posso te ajudar hoje?'\n• Cumprimente pelo nome se disponivel e pergunte o que precisa.`}
            rows={4}
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            Deixe vazio para usar o comportamento padrao (abordagem natural automatica).
          </p>
        </div>
      </Section>

      {/* 3. Comunicacao */}
      <Section
        icon={Settings2}
        title="Comunicacao"
        description="Objetivo do agente e regras de como ele deve escrever"
      >
        <div>
          <Label hint="O que o agente deve tentar conseguir em cada conversa">
            Objetivo principal
          </Label>
          <Textarea
            value={objective}
            onChange={setObjective}
            placeholder="Converter leads em oportunidades com atendimento consultivo."
            rows={2}
          />
        </div>
        <div>
          <Label hint="Tom, formalidade, limites, padroes de escrita — ex: 'Nunca mencionar concorrentes'">
            Regras de comunicacao
          </Label>
          <Textarea
            value={communicationRules}
            onChange={setCommunicationRules}
            placeholder="Como o agente deve escrever: tom, formalidade, limites, padroes de fechamento..."
            rows={3}
          />
        </div>
      </Section>

      {/* 4. Treinamento */}
      <Section
        icon={BookOpen}
        title="Treinamento"
        description="Contexto do negocio, aprendizados internos e vocabulario da marca"
        defaultOpen={false}
      >
        <div>
          <Label hint="Descricao do negocio, produtos, diferenciais — contexto base do agente">
            Contexto do negocio
          </Label>
          <Textarea
            value={businessContext}
            onChange={setBusinessContext}
            placeholder="Descreva o negocio, produtos principais, publico-alvo e diferenciais..."
            rows={3}
          />
        </div>
        <div>
          <Label hint="Scripts da equipe, padroes de objecao, aprendizados de atendimento">
            Notas de treinamento
          </Label>
          <Textarea
            value={trainingNotes}
            onChange={setTrainingNotes}
            placeholder="Aprendizados internos, padroes de objecao, scripts da equipe..."
            rows={3}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label hint="Palavras e expressoes que o agente deve priorizar (separadas por virgula)">
              Termos preferidos
            </Label>
            <Textarea
              value={preferredTerms}
              onChange={setPreferredTerms}
              placeholder="consorcio, carta de credito, contemplacao..."
              rows={2}
            />
          </div>
          <div>
            <Label hint="Palavras que o agente nao pode usar (separadas por virgula)">
              Termos proibidos
            </Label>
            <Textarea
              value={forbiddenTerms}
              onChange={setForbiddenTerms}
              placeholder="financiamento, emprestimo, barato..."
              rows={2}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">
          Separe os termos por virgula ou uma por linha.
        </p>
      </Section>

      {/* Save footer */}
      <div className="flex justify-end pt-2 pb-6">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={15} />
          ) : (
            <Save size={15} />
          )}
          {saving ? 'Salvando...' : saved ? 'Configuracoes salvas' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  )
}

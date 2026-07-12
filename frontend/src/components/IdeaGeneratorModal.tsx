/**
 * IdeaGeneratorModal — Gerador de Ideias por IA pra Busca de Leads.
 *
 * Usuario descreve o negocio em texto livre ("vendo bolos pra noivas em Fortaleza"),
 * IA retorna sugestoes acionaveis: segmentos (palavras-chave), cidades, raio
 * recomendado e estrategia. Cada sugestao tem botao "Usar isso" que preenche
 * Segmento + Cidade + Raio na Busca em 1 clique.
 *
 * Design: dark accent + light surface, layout limpo, sem cores fortes alem do
 * gradient de IA. Inspirado em assistants premium (Linear AI, Notion AI).
 */
import { useState, useCallback, useEffect } from 'react'
import {
  Sparkles, X, Loader2, MapPin, Target, ArrowRight, Lightbulb, AlertCircle,
  Clock, Building2, Users, ChevronDown, Search, Flame, BookOpen, ArrowUpRight,
} from 'lucide-react'

interface IdeaCity {
  name: string
  state: string
  reason: string
  recommendedRadiusKm: number
}

interface IdeaSuggestion {
  segment: string
  whyTheyBuy: string
  searchFootprints: string[]
  cities: IdeaCity[]
  competitorTier: 'baixa' | 'media' | 'alta'
  priorityScore: number
  bestTimeWindow?: string
}

interface IdeasResponse {
  marketReading: string
  targetCustomers: string
  suggestions: IdeaSuggestion[]
  strategy: Array<{ tip: string; rationale: string }>
}

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado quando o usuario escolhe uma combinacao — aplica na Busca. */
  onApply: (params: { segment: string; city: string; radiusKm: number }) => void
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

/* Fallback genérico caso o backend ainda nao tenha contexto do brand */
const FALLBACK_PROMPTS = [
  'Distribuição B2B do meu produto principal',
  'Serviço local com ticket médio alto',
  'Produto vendido pra revendedores',
  'Atendimento corporativo na minha região',
]

const tierColor: Record<IdeaSuggestion['competitorTier'], string> = {
  baixa: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  media: 'bg-amber-50 text-amber-700 border-amber-200',
  alta:  'bg-rose-50 text-rose-700 border-rose-200',
}
const tierLabel: Record<IdeaSuggestion['competitorTier'], string> = {
  baixa: 'Baixa competição',
  media: 'Competição média',
  alta:  'Alta competição',
}

export function IdeaGeneratorModal({ open, onClose, onApply }: Props) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<IdeasResponse | null>(null)
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(0)
  /* Exemplos dinamicos por brand — IA gera 4 prompts contextuais baseados em
     business_context declarado no Treinamento (ai_agent_profiles_brand). Cacheado backend (5min). */
  const [seedPrompts, setSeedPrompts] = useState<string[]>(FALLBACK_PROMPTS)
  const [seedLoading, setSeedLoading] = useState(false)
  /* meta.needsTraining = brand nao tem business_context cadastrado → sugestoes genericas.
     UI mostra um banner orientando treinar o agente em /ai-agent. */
  const [needsTraining, setNeedsTraining] = useState(false)
  const [brandName, setBrandName] = useState<string>('')

  /* ESC fecha */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Fetch dos seed prompts + brand-context quando o modal abre.
     - seed-prompts: gera 4 frases adaptadas (cacheado 5min backend)
     - brand-context: verifica se ha business_context cadastrado pra mostrar aviso */
  useEffect(() => {
    if (!open) return
    let alive = true
    setSeedLoading(true)
    Promise.all([
      fetch('/api/lead-ideas/seed-prompts', { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
      fetch('/api/lead-ideas/brand-context', { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
    ])
      .then(([seed, ctx]) => {
        if (!alive) return
        if (seed) {
          const arr = Array.isArray(seed?.prompts) ? seed.prompts.filter(Boolean) : []
          if (arr.length > 0) setSeedPrompts(arr)
          /* meta.needsTraining vem true quando o brand nao tem business_context */
          setNeedsTraining(Boolean(seed?.meta?.needsTraining))
        }
        if (ctx) {
          setBrandName(String(ctx?.brandName || '').trim())
          /* brand-context tem fonte mais confiavel — sobrescreve se diverge */
          if (typeof ctx?.meta?.hasBusinessContext === 'boolean') {
            setNeedsTraining(!ctx.meta.hasBusinessContext)
          }
        }
      })
      .catch(() => {/* mantem fallback */})
      .finally(() => { if (alive) setSeedLoading(false) })
    return () => { alive = false }
  }, [open])

  const generate = useCallback(async () => {
    const desc = description.trim()
    if (!desc) { setError('Descreva seu negócio pra IA sugerir ideias.'); return }
    if (desc.length < 12) { setError('Conte um pouco mais — uma frase ajuda muito (ex: o que vende, pra quem, em qual cidade).'); return }
    setLoading(true)
    setError(null)
    setIdeas(null)
    try {
      const r = await fetch('/api/lead-ideas/generate', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ description: desc }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`)
      setIdeas(d.ideas)
      setExpandedSuggestion(0)
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar ideias')
    } finally {
      setLoading(false)
    }
  }, [description])

  const applyCombo = useCallback((segment: string, city: IdeaCity) => {
    const cityLabel = city.state ? `${city.name}, ${city.state}` : city.name
    onApply({ segment, city: cityLabel, radiusKm: city.recommendedRadiusKm })
    onClose()
  }, [onApply, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 backdrop-blur-sm p-4" style={{ animation: 'fadeIn 160ms ease-out' }}>
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col"
        style={{ animation: 'slideUp 220ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
          <div className="ai-shimmer w-10 h-10 rounded-xl bg-gray-900 grid place-items-center shrink-0 relative overflow-hidden">
            <Sparkles size={18} className="text-white relative z-10" strokeWidth={2.25} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-gray-900 tracking-tight leading-tight">
              Inteligência de prospecção
            </h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">
              {ideas
                ? 'Escolha um segmento + cidade pra aplicar na Busca. Footprints listados são rastreáveis no Google Maps.'
                : 'Descreva o que você vende. A IA identifica QUEM COMPRA e onde achar esses contatos no Google Maps.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition shrink-0"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Conteudo scrollavel */}
        <div className="flex-1 overflow-y-auto">
          {/* INPUT STAGE */}
          {!ideas && (
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  O que você vende ou oferece?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
                  placeholder="Ex.: produto ou serviço, público-alvo e região de atuação"
                  rows={4}
                  autoFocus
                  className="w-full p-3 rounded-xl border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 placeholder:font-normal resize-none focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                />
                <p className="text-[10.5px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                  <Lightbulb size={11} strokeWidth={2} />
                  Descreva o produto/serviço — a IA infere QUEM COMPRA isso e como achar no Google. <kbd className="ml-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[9px] font-mono">⌘+Enter</kbd>
                </p>
              </div>

              {/* Aviso de treinamento — brand sem business_context cadastrado.
                  Sugestoes ficam genericas (Software/SaaS pra todo mundo) porque a IA
                  nao tem fonte da verdade do que o brand realmente vende. */}
              {needsTraining && !seedLoading && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-2">
                    <BookOpen size={14} className="text-amber-700 shrink-0 mt-0.5" strokeWidth={2.25} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-amber-900 leading-tight">
                        Treine o agente para sugestões específicas
                      </p>
                      <p className="text-[11px] text-amber-800/90 mt-0.5 leading-snug">
                        {brandName ? <><b>{brandName}</b> ainda não tem </> : 'Esse brand ainda não tem '}
                        <b>contexto comercial</b> declarado. As sugestões abaixo são genéricas.
                        Cadastre <b>o que vende</b> em Treinamento da IA para que a inteligência de prospecção
                        identifique <b>quem realmente compra</b> seu produto/serviço.
                      </p>
                      <a
                        href="/agente"
                        className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2"
                      >
                        Abrir Treinamento da IA <ArrowUpRight size={11} strokeWidth={2.5} />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Exemplos rapidos — gerados pela IA por brand (5min cache backend) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles size={10} strokeWidth={2.25} className="text-gray-400" />
                    {needsTraining ? 'Sugestões genéricas (sem treinamento)' : 'Sugestões para seu negócio'}
                  </p>
                  {seedLoading && <Loader2 size={11} className="text-gray-400 animate-spin" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {seedPrompts.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setDescription(ex)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-[11px] text-gray-700 font-medium transition border border-transparent hover:border-gray-200"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-[12px] font-medium flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="ai-shimmer w-12 h-12 rounded-2xl bg-gray-900 grid place-items-center relative overflow-hidden">
                <Loader2 size={20} className="text-white animate-spin relative z-10" />
              </div>
              <p className="text-[13px] font-semibold text-gray-900">Pensando…</p>
              <p className="text-[11.5px] text-gray-500 max-w-xs">
                Inferindo quem compra, mapeando segmentos rastreáveis no Google Maps e calibrando raio por densidade.
              </p>
            </div>
          )}

          {/* IDEAS STAGE */}
          {ideas && !loading && (
            <div className="p-5 space-y-4">
              {/* Leitura de mercado + alvo de compradores */}
              {(ideas.marketReading || ideas.targetCustomers) && (
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
                  {ideas.marketReading && (
                    <p className="text-[12.5px] font-semibold text-gray-900 leading-snug flex items-start gap-1.5">
                      <Building2 size={12} className="mt-0.5 shrink-0 text-gray-400" />
                      {ideas.marketReading}
                    </p>
                  )}
                  {ideas.targetCustomers && (
                    <p className="text-[11.5px] text-gray-600 leading-snug flex items-start gap-1.5">
                      <Users size={11} className="mt-0.5 shrink-0 text-gray-400" />
                      <span><span className="font-semibold text-gray-700">Quem compra: </span>{ideas.targetCustomers}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Sugestoes */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Target size={11} strokeWidth={2.5} /> Segmentos prospectáveis ({ideas.suggestions.length})
                  <span className="ml-auto text-[9.5px] font-medium text-gray-400 normal-case tracking-normal">Ordenado por prioridade</span>
                </h4>
                {ideas.suggestions.map((s, i) => {
                  const open = expandedSuggestion === i
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border transition-all ${
                        open ? 'border-gray-300 shadow-[0_2px_8px_rgba(0,0,0,0.04)]' : 'border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => setExpandedSuggestion(open ? null : i)}
                        className="w-full flex items-center gap-3 p-3.5 text-left"
                      >
                        {/* PriorityScore como badge gigante visual em vez do index */}
                        <div
                          className="w-9 h-9 rounded-lg grid place-items-center shrink-0 text-[12px] font-bold tabular-nums"
                          style={{
                            background: s.priorityScore >= 8 ? '#111827' : s.priorityScore >= 6 ? '#374151' : '#9ca3af',
                            color: 'white',
                          }}
                          title={`Prioridade ${s.priorityScore}/10`}
                        >
                          {s.priorityScore}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-bold text-gray-900 truncate">{s.segment}</p>
                            <span className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tierColor[s.competitorTier]}`}>
                              {tierLabel[s.competitorTier]}
                            </span>
                            {s.priorityScore >= 8 && (
                              <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700">
                                <Flame size={10} strokeWidth={2.5} /> Hot
                              </span>
                            )}
                            {s.bestTimeWindow && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                                <Clock size={10} strokeWidth={2} /> {s.bestTimeWindow}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{s.whyTheyBuy}</p>
                        </div>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Conteudo expandido: whyTheyBuy completo + footprints + cidades */}
                      {open && (
                        <div className="border-t border-gray-100 bg-gray-50/40">
                          {/* Footprints — termos prontos pra busca no Google Maps */}
                          {s.searchFootprints.length > 0 && (
                            <div className="px-3.5 py-2.5 border-b border-gray-100/80">
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Search size={10} strokeWidth={2.5} /> Termos rastreáveis no Google Maps
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {s.searchFootprints.map((fp, k) => (
                                  <button
                                    key={k}
                                    onClick={() => {
                                      /* Aplica esse footprint como segmento sem trocar de cidade.
                                         Se ainda nao escolheu cidade, usa a 1a sugerida */
                                      const city = s.cities[0]
                                      if (city) {
                                        onApply({
                                          segment: fp,
                                          city: city.state ? `${city.name}, ${city.state}` : city.name,
                                          radiusKm: city.recommendedRadiusKm,
                                        })
                                        onClose()
                                      }
                                    }}
                                    className="group inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 hover:border-gray-900 hover:bg-gray-900 hover:text-white text-[10.5px] font-medium text-gray-700 transition-all"
                                    title="Aplicar este termo de busca"
                                  >
                                    <Search size={9} strokeWidth={2.5} className="opacity-50 group-hover:opacity-100" />
                                    {fp}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cidades clicaveis */}
                          {s.cities.length > 0 && (
                            <div className="px-3.5 py-2.5 space-y-1.5">
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                Cidades sugeridas — clique para aplicar
                              </p>
                              {s.cities.map((c, j) => (
                                <button
                                  key={j}
                                  onClick={() => applyCombo(s.segment, c)}
                                  className="group w-full flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-gray-200 hover:border-gray-900 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-left transition-all"
                                >
                                  <div className="w-7 h-7 rounded-lg bg-gray-100 grid place-items-center shrink-0 group-hover:bg-gray-900 group-hover:text-white transition-colors">
                                    <MapPin size={12} strokeWidth={2.25} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-semibold text-gray-900 truncate">
                                      {c.name}{c.state ? ` · ${c.state}` : ''}
                                      <span className="ml-2 text-[10.5px] font-bold text-gray-500 tabular-nums">
                                        raio {c.recommendedRadiusKm < 1 ? `${Math.round(c.recommendedRadiusKm * 1000)}m` : `${c.recommendedRadiusKm}km`}
                                      </span>
                                    </p>
                                    <p className="text-[10.5px] text-gray-500 truncate mt-0.5">{c.reason}</p>
                                  </div>
                                  <ArrowRight size={13} className="text-gray-300 group-hover:text-gray-900 transition-colors shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Estrategia */}
              {ideas.strategy.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <Lightbulb size={11} strokeWidth={2.5} /> Estratégia de prospecção
                  </h4>
                  <div className="space-y-1.5">
                    {ideas.strategy.map((t, i) => (
                      <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <p className="text-[12px] font-semibold text-gray-900 leading-snug">{t.tip}</p>
                        {t.rationale && (
                          <p className="text-[11px] text-gray-500 mt-1 leading-snug">{t.rationale}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!ideas && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-700 hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              onClick={generate}
              disabled={loading || !description.trim()}
              className="ai-shimmer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-[12px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.25} />}
              Gerar ideias
            </button>
          </div>
        )}
        {ideas && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between gap-2">
            <button
              onClick={() => { setIdeas(null); setError(null); }}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-gray-900 transition"
            >
              <Building2 size={12} strokeWidth={2.25} /> Nova descrição
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-700 hover:bg-gray-100 transition"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle, CheckCircle2, Database, KeyRound, RefreshCw, Save, ServerCog,
  ShieldCheck, Sparkles, TestTubeDiagonal,
} from 'lucide-react'
import {
  type AdminIntegrationLogEntry,
  type AdminIntegrationProvider,
  type AdminIntegrationSnapshot,
  integrationApi,
} from '@/lib/api-admin'

type ToastFn = (text: string, type?: 'ok' | 'err') => void

type FieldSpec = {
  key: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  placeholder?: string
  help?: string
  options?: Array<{ label: string; value: string }>
}

type ProviderMeta = {
  label: string
  tagline: string
  accent: string
  fields: FieldSpec[]
}

type ProviderDraft = {
  key: string
  is_active: boolean
  priority: string
  config: Record<string, unknown>
}

const PROVIDER_META: Record<AdminIntegrationProvider, ProviderMeta> = {
  gemini: {
    label: 'Gemini',
    tagline: 'Mensagens, classificacao, memoria e criativos de texto.',
    accent: 'from-blue-500 to-cyan-500',
    fields: [
      { key: 'model', label: 'Modelo padrao', type: 'text', placeholder: 'gemini-2.5-flash' },
      { key: 'temperature', label: 'Temperatura', type: 'number', placeholder: '0.7', help: 'Valor entre 0 e 2.' },
    ],
  },
  openai: {
    label: 'OpenAI',
    tagline: 'Fallback opcional para prompts e workflows alternativos.',
    accent: 'from-emerald-500 to-teal-500',
    fields: [
      { key: 'model', label: 'Modelo padrao', type: 'text', placeholder: 'gpt-4o-mini' },
      { key: 'organization', label: 'Organization ID', type: 'text', placeholder: 'org_xxx' },
      { key: 'use_as_fallback', label: 'Usar como fallback', type: 'checkbox', help: 'Permite entrar como alternativa secundaria.' },
    ],
  },
  grok: {
    label: 'Grok',
    tagline: 'Modelo alternativo para fluxos experimentais.',
    accent: 'from-slate-700 to-slate-500',
    fields: [
      { key: 'model', label: 'Modelo padrao', type: 'text', placeholder: 'grok-3-mini' },
    ],
  },
  rapidapi: {
    label: 'RapidAPI',
    tagline: 'Primeira etapa para busca de places, com failover para Google Places.',
    accent: 'from-amber-500 to-orange-500',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'google-map-places-new-v2.p.rapidapi.com' },
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://google-map-places-new-v2.p.rapidapi.com' },
      { key: 'fallbacks', label: 'Fallbacks', type: 'text', placeholder: 'google_places', help: 'Separe providers por virgula.' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '15000' },
    ],
  },
  google_places: {
    label: 'Google Places',
    tagline: 'Fallback oficial quando o provider primario falhar.',
    accent: 'from-rose-500 to-pink-500',
    fields: [
      { key: 'timeout', label: 'Timeout (ms)', type: 'number', placeholder: '15000' },
      { key: 'fallback_active', label: 'Fallback ativo', type: 'checkbox', help: 'Mantem o provider pronto para assumir automaticamente.' },
    ],
  },
  runway: {
    label: 'Runway',
    tagline: 'Geracao audiovisual para criativos e video.',
    accent: 'from-violet-500 to-fuchsia-500',
    fields: [
      {
        key: 'generation_type',
        label: 'Tipo de geracao',
        type: 'select',
        options: [
          { label: 'Video', value: 'video' },
          { label: 'Imagem', value: 'image' },
        ],
      },
      {
        key: 'quality',
        label: 'Qualidade',
        type: 'select',
        options: [
          { label: 'Alta', value: 'high' },
          { label: 'Media', value: 'medium' },
          { label: 'Baixa', value: 'low' },
        ],
      },
    ],
  },
}

const PROVIDERS = Object.keys(PROVIDER_META) as AdminIntegrationProvider[]

function formatDate(value?: string) {
  if (!value) return 'Agora'
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function toDraft(snapshot: AdminIntegrationSnapshot): ProviderDraft {
  const config = snapshot.config || {}
  return {
    key: '',
    is_active: Boolean(snapshot.is_active),
    priority: String(snapshot.priority || 1),
    config: {
      ...config,
      fallbacks: Array.isArray(config.fallbacks) ? config.fallbacks.join(', ') : String(config.fallbacks || ''),
    },
  }
}

function toPayload(provider: AdminIntegrationProvider, draft: ProviderDraft) {
  const config = { ...draft.config }

  if (provider === 'gemini') {
    config.temperature = Number(config.temperature || 0.7)
  }
  if (provider === 'rapidapi' || provider === 'google_places') {
    config.timeout = Number(config.timeout || 15000)
  }
  if (provider === 'rapidapi') {
    config.fallbacks = String(config.fallbacks || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return {
    ...(draft.key.trim() ? { key: draft.key.trim() } : {}),
    is_active: draft.is_active,
    priority: Number(draft.priority || 1),
    config,
  }
}

function statusBadge(source: AdminIntegrationSnapshot['source']) {
  if (source === 'database') return 'bg-emerald-100 text-emerald-700'
  if (source === 'env') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

export function IntegrationsPage({ showToast }: { showToast: ToastFn }) {
  const [providers, setProviders] = useState<AdminIntegrationSnapshot[]>([])
  const [activeProvider, setActiveProvider] = useState<AdminIntegrationProvider>('gemini')
  const [draft, setDraft] = useState<ProviderDraft | null>(null)
  const [logs, setLogs] = useState<AdminIntegrationLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [reloadingLogs, setReloadingLogs] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency_ms: number; source?: string } | null>(null)

  const snapshot = useMemo(
    () => providers.find((item) => item.provider === activeProvider) || null,
    [providers, activeProvider],
  )

  async function loadProviders(preferredProvider?: AdminIntegrationProvider) {
    setLoading(true)
    try {
      const data = await integrationApi.listProviders()
      const nextProviders = data.providers || []
      setProviders(nextProviders)
      const currentProvider = preferredProvider || activeProvider
      const selected = nextProviders.find((item) => item.provider === currentProvider) || nextProviders[0]
      if (selected) {
        setActiveProvider(selected.provider)
        setDraft(toDraft(selected))
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao carregar integrações', 'err')
    } finally {
      setLoading(false)
    }
  }

  async function loadLogs(provider = activeProvider) {
    setReloadingLogs(true)
    try {
      const data = await integrationApi.logs(provider, 12)
      setLogs(data.logs || [])
    } catch (error: any) {
      showToast(error.message || 'Erro ao carregar logs', 'err')
    } finally {
      setReloadingLogs(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  useEffect(() => {
    if (!snapshot) return
    setDraft(toDraft(snapshot))
    setTestResult(null)
    loadLogs(snapshot.provider)
  }, [snapshot?.provider, snapshot?.updated_at])

  function updateField(key: string, value: unknown) {
    setDraft((current) => current ? { ...current, config: { ...current.config, [key]: value } } : current)
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    try {
      const payload = toPayload(activeProvider, draft)
      const result = await integrationApi.saveProvider(activeProvider, payload)
      showToast(`Integração ${PROVIDER_META[activeProvider].label} salva.`)
      setProviders((current) => current.map((item) => item.provider === activeProvider ? result.provider : item))
      setDraft(toDraft(result.provider))
      await loadProviders(activeProvider)
      await loadLogs(activeProvider)
    } catch (error: any) {
      showToast(error.message || 'Erro ao salvar integração', 'err')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!draft) return
    setTesting(true)
    try {
      const payload = toPayload(activeProvider, draft)
      const result = await integrationApi.testProvider(activeProvider, payload)
      setTestResult(result)
      showToast(result.ok ? 'Conexão validada.' : result.message, result.ok ? 'ok' : 'err')
      await loadLogs(activeProvider)
    } catch (error: any) {
      setTestResult({ ok: false, message: error.message || 'Falha no teste', latency_ms: 0 })
      showToast(error.message || 'Falha no teste', 'err')
    } finally {
      setTesting(false)
    }
  }

  if (loading && !snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 rounded-xl bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-3xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!snapshot || !draft) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <AlertCircle size={28} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-700">Nenhuma integração disponível.</p>
      </div>
    )
  }

  const meta = PROVIDER_META[activeProvider]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Integrações</h2>
          <p className="text-[13px] text-gray-400 mt-0.5">
            O painel salva no banco. Variável de ambiente fica apenas como fallback técnico.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadProviders(activeProvider)}
            className="px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition flex items-center gap-2 shadow-sm"
          >
            {testing ? <RefreshCw size={14} className="animate-spin" /> : <TestTubeDiagonal size={14} />} Testar conexão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3.5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2 shadow-sm"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
        {PROVIDERS.map((provider) => {
          const providerSnapshot = providers.find((item) => item.provider === provider)
          const providerMeta = PROVIDER_META[provider]
          const active = provider === activeProvider
          return (
            <button
              key={provider}
              onClick={() => setActiveProvider(provider)}
              className={`text-left rounded-2xl border px-4 py-3.5 transition-all ${
                active
                  ? 'bg-gray-950 border-gray-950 text-white shadow-lg'
                  : 'bg-white border-gray-100 text-gray-800 hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${providerMeta.accent} grid place-items-center mb-3 shadow-sm`}>
                <Sparkles size={16} className="text-white" />
              </div>
              <p className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-900'}`}>{providerMeta.label}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${providerSnapshot ? statusBadge(providerSnapshot.source) : 'bg-gray-100 text-gray-500'}`}>
                  {providerSnapshot?.source === 'database' ? 'DB' : providerSnapshot?.source === 'env' ? 'ENV' : 'VAZIO'}
                </span>
                {providerSnapshot?.is_active ? (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Ativo</span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500">Inativo</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_380px] gap-5 items-start">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start gap-4 flex-wrap justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-extrabold text-gray-900">{meta.label}</h3>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statusBadge(snapshot.source)}`}>
                    Fonte: {snapshot.source === 'database' ? 'Banco' : snapshot.source === 'env' ? 'Fallback ENV' : 'Sem configuração'}
                  </span>
                </div>
                <p className="text-[13px] text-gray-400 mt-1">{meta.tagline}</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <Database size={14} /> Conta: <span className="font-semibold text-gray-700">{snapshot.account_id}</span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InfoCard
                icon={<ShieldCheck size={15} className="text-emerald-600" />}
                label="Chave atual"
                value={snapshot.masked_key || 'Nenhuma chave salva'}
                tone="bg-emerald-50"
              />
              <InfoCard
                icon={<ServerCog size={15} className="text-blue-600" />}
                label="Fallback ENV"
                value={snapshot.env_fallback_available ? 'Disponível' : 'Ausente'}
                tone="bg-blue-50"
              />
              <InfoCard
                icon={<KeyRound size={15} className="text-violet-600" />}
                label="Atualizado em"
                value={snapshot.updated_at ? formatDate(snapshot.updated_at) : 'Sem histórico'}
                tone="bg-violet-50"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">Nova chave</span>
                <input
                  type="password"
                  value={draft.key}
                  onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                  placeholder="Deixe em branco para manter a chave atual"
                  className="w-full px-3.5 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <p className="text-[11px] text-gray-400">O backend passa a consumir a configuração do banco assim que você salvar.</p>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">Prioridade</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.priority}
                    onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                    className="w-full px-3.5 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
                <label className="rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3 mt-[22px]">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Ativo</p>
                    <p className="text-[11px] text-gray-400">Permite uso em runtime</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}
                    className={`relative w-11 h-6 rounded-full transition shrink-0 ${draft.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.is_active ? 'translate-x-5' : ''}`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meta.fields.map((field) => {
                const rawValue = draft.config[field.key]
                const booleanValue = Boolean(rawValue)
                const textValue = String(rawValue ?? '')

                if (field.type === 'checkbox') {
                  return (
                    <label key={field.key} className="rounded-2xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{field.label}</p>
                        {field.help ? <p className="text-[11px] text-gray-400 mt-1">{field.help}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateField(field.key, !booleanValue)}
                        className={`relative w-11 h-6 rounded-full transition shrink-0 ${booleanValue ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${booleanValue ? 'translate-x-5' : ''}`} />
                      </button>
                    </label>
                  )
                }

                if (field.type === 'select') {
                  return (
                    <label key={field.key} className="space-y-1.5">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">{field.label}</span>
                      <select
                        value={textValue}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        className="w-full px-3.5 py-3 border border-gray-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        {(field.options || []).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {field.help ? <p className="text-[11px] text-gray-400">{field.help}</p> : null}
                    </label>
                  )
                }

                return (
                  <label key={field.key} className="space-y-1.5">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em]">{field.label}</span>
                    <input
                      type={field.type}
                      value={textValue}
                      onChange={(event) => updateField(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3.5 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    {field.help ? <p className="text-[11px] text-gray-400">{field.help}</p> : null}
                  </label>
                )
              })}
            </div>

            <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 p-4">
              <p className="text-sm font-bold text-blue-900">Fluxo de prioridade</p>
              <p className="text-[12px] text-blue-800 mt-1">
                1. Painel admin salva no banco por conta/marca.
              </p>
              <p className="text-[12px] text-blue-800">
                2. Backend resolve DB primeiro e usa ENV apenas se não existir configuração ativa.
              </p>
              <p className="text-[12px] text-blue-800">
                3. RapidAPI pode falhar e ceder lugar automaticamente ao Google Places quando habilitado.
              </p>
            </div>

            {testResult ? (
              <div className={`rounded-2xl p-4 border ${testResult.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start gap-3">
                  {testResult.ok ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" /> : <AlertCircle size={18} className="text-red-600 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-bold ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                      {testResult.ok ? 'Conexão validada' : 'Falha na validação'}
                    </p>
                    <p className={`text-[12px] mt-1 ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                      {testResult.message}
                    </p>
                    <p className={`text-[11px] mt-1 ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      Latência: {testResult.latency_ms} ms{testResult.source ? ` • Fonte: ${testResult.source}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Logs recentes</h3>
                <p className="text-[12px] text-gray-400 mt-0.5">Eventos do provider selecionado.</p>
              </div>
              <button
                onClick={() => loadLogs(activeProvider)}
                className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 grid place-items-center hover:bg-gray-200 transition"
              >
                <RefreshCw size={14} className={reloadingLogs ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {logs.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-center text-[12px] text-gray-400">
                  Nenhum log recente para {meta.label}.
                </div>
              ) : logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-gray-100 p-3.5 bg-gray-50/70">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${log.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {log.status === 'success' ? 'Sucesso' : 'Erro'}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDate(log.created_at)}</span>
                  </div>
                  <p className="text-[12px] font-semibold text-gray-800 mt-2">{log.message}</p>
                  {log.metadata_json && Object.keys(log.metadata_json).length > 0 ? (
                    <pre className="mt-2 text-[10px] text-gray-500 whitespace-pre-wrap break-words bg-white rounded-xl border border-gray-100 p-2.5">
                      {JSON.stringify(log.metadata_json, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-950 rounded-3xl p-5 text-white shadow-xl">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.12em]">Governança</p>
            <h3 className="text-base font-extrabold mt-2">Painel manda, backend consome.</h3>
            <p className="text-[12px] text-white/65 mt-2 leading-relaxed">
              A configuração operacional fica no banco por conta ativa. `.env` serve só para bootstrap ou desastre controlado.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function InfoCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-4 ${tone}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">{label}</p>
      </div>
      <p className="text-sm font-bold text-gray-900 break-all">{value}</p>
    </div>
  )
}
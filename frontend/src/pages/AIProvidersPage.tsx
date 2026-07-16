import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff, Zap, Sparkles, Video, Image, Type, Save, TestTube, Bot, Film, Plug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui'

const TIER_BADGE: Record<string, { label: string; cls: string }> = {
  cheap: { label: 'Econômico', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { label: 'Médio', cls: 'bg-gray-100 text-gray-700' },
  expensive: { label: 'Premium', cls: 'bg-amber-50 text-amber-700' },
}

const PROVIDER_META: Record<string, { label: string; color: string; Icon: LucideIcon }> = {
  atlas: { label: 'Atlas Cloud', color: 'from-emerald-600 to-teal-700', Icon: Plug },
  openai: { label: 'OpenAI', color: 'from-gray-800 to-gray-900', Icon: Bot },
  gemini: { label: 'Google Gemini', color: 'from-blue-500 to-cyan-500', Icon: Sparkles },
  grok: { label: 'xAI Grok Imagine', color: 'from-gray-700 to-gray-800', Icon: Zap },
  veo: { label: 'Google Veo', color: 'from-purple-500 to-indigo-500', Icon: Film },
  kling: { label: 'Kling AI', color: 'from-pink-500 to-rose-500', Icon: Video },
}

const TAB_CFG = [
  { key: 'text' as const, label: 'Texto', icon: Type, desc: 'Geracao de mensagens, copy, analise' },
  { key: 'image' as const, label: 'Imagem', icon: Image, desc: 'Geracao e edicao de imagens' },
  { key: 'video' as const, label: 'Video', icon: Video, desc: 'Geracao de videos' },
]

type Category = 'text' | 'image' | 'video' | 'audio'

interface ModelDef { id: string; label: string; tier: string; description?: string }
type Catalog = Record<Category, Record<string, ModelDef[]>>
type Preferences = Record<Category, { provider: string; model: string }>

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function AIProvidersPage() {
  const [tab, setTab] = useState<Category>('text')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // Per-provider local state for editing keys
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string } | null>>({})
  const [testing, setTesting] = useState<string | null>(null)

  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, prefRes, provRes] = await Promise.all([
        fetch('/api/integrations/models-catalog', { headers: getHeaders() }).then(r => r.json()),
        fetch('/api/integrations/preferences', { headers: getHeaders() }).then(r => r.json()),
        fetch('/api/integrations/providers', { headers: getHeaders() }).then(r => r.json()),
      ])
      setCatalog(catRes.models || null)
      setPrefs(prefRes.preferences || null)
      setProviders(provRes.providers || [])
    } catch (e: any) { flash(e.message, 'err') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const savePrefs = async (newPrefs: Partial<Preferences>) => {
    setSaving(true)
    try {
      const res = await fetch('/api/integrations/preferences', {
        method: 'PUT', headers: getHeaders(), body: JSON.stringify(newPrefs),
      }).then(r => r.json())
      if (res.preferences) setPrefs(res.preferences)
      flash('Preferencias salvas!')
    } catch (e: any) { flash(e.message, 'err') }
    setSaving(false)
  }

  const saveProviderKey = async (providerKey: string) => {
    const key = editKeys[providerKey]
    if (!key?.trim()) return
    setSaving(true)
    try {
      await fetch(`/api/integrations/${providerKey}`, {
        method: 'PUT', headers: getHeaders(),
        body: JSON.stringify({ key: key.trim(), is_active: true }),
      }).then(r => r.json())
      flash(`Chave ${PROVIDER_META[providerKey]?.label || providerKey} salva!`)
      setEditKeys(prev => ({ ...prev, [providerKey]: '' }))
      load()
    } catch (e: any) { flash(e.message, 'err') }
    setSaving(false)
  }

  const testProvider = async (providerKey: string) => {
    setTesting(providerKey)
    setTestResults(prev => ({ ...prev, [providerKey]: null }))
    try {
      const payload = editKeys[providerKey]?.trim() ? { key: editKeys[providerKey].trim() } : {}
      const res = await fetch(`/api/integrations/${providerKey}/test`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(payload),
      }).then(r => r.json())
      setTestResults(prev => ({ ...prev, [providerKey]: { ok: res.success, msg: res.result?.message || (res.success ? 'OK' : 'Falhou') } }))
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [providerKey]: { ok: false, msg: e.message } }))
    }
    setTesting(null)
  }

  const getProviderSnapshot = (pk: string) => providers.find((p: any) => p.provider === pk)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
    </div>
  )

  const currentTabProviders = catalog ? Object.keys(catalog[tab] || {}) : []
  const currentPref = prefs?.[tab]

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <header>
        <h1 className="text-[26px] font-bold tracking-tight text-gray-900">Provedores IA</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Configure as chaves de API e escolha o modelo padrão para cada tipo de geração</p>
      </header>

      {/* Category tabs (segmented control style) */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-full">
        {TAB_CFG.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full text-[12px] font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <t.icon size={14} strokeWidth={1.75} /> {t.label}
          </button>
        ))}
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {currentTabProviders.map(pk => {
          const meta = PROVIDER_META[pk] || { label: pk, color: 'from-gray-500 to-gray-600', Icon: Plug }
          const models = catalog![tab][pk] || []
          const snap = getProviderSnapshot(pk)
          const hasKey = snap?.has_key === true
          const maskedKey = snap?.masked_key || ''
          const testRes = testResults[pk]

          return (
            <div key={pk} className="bg-white rounded-2xl border border-border-light overflow-hidden">
              {/* Provider header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-border-light">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-gray-900 text-white grid place-items-center shrink-0">
                    <meta.Icon size={16} strokeWidth={1.75} />
                  </span>
                  <h3 className="text-[14px] font-semibold tracking-tight text-gray-900">{meta.label}</h3>
                </div>
                {hasKey && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} strokeWidth={2} /> Configurado
                  </span>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* API Key section */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 tracking-wide">Chave API</label>
                  <div className="flex gap-2 mt-1.5">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[pk] ? 'text' : 'password'}
                        value={editKeys[pk] ?? ''}
                        onChange={e => setEditKeys(prev => ({ ...prev, [pk]: e.target.value }))}
                        placeholder={hasKey ? maskedKey : 'Cole sua API key aqui'}
                        className="w-full h-10 pl-3.5 pr-9 rounded-xl border border-border bg-white text-[12px] font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 transition"
                      />
                      <button
                        onClick={() => setShowKeys(prev => ({ ...prev, [pk]: !prev[pk] }))}
                        aria-label={showKeys[pk] ? 'Ocultar chave' : 'Mostrar chave'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      >
                        {showKeys[pk] ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
                      </button>
                    </div>
                    <Button
                      onClick={() => saveProviderKey(pk)}
                      loading={saving}
                      disabled={!editKeys[pk]?.trim()}
                      size="sm"
                      iconLeft={<Save size={13} strokeWidth={1.75} />}
                    >
                      Salvar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => testProvider(pk)}
                      loading={testing === pk}
                      size="sm"
                      iconLeft={<TestTube size={13} strokeWidth={1.75} />}
                    >
                      Testar
                    </Button>
                  </div>
                  {testRes && (
                    <div className={`inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium ${testRes.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                      {testRes.ok ? <CheckCircle2 size={12} strokeWidth={2} /> : <XCircle size={12} strokeWidth={2} />}
                      {testRes.msg}
                    </div>
                  )}
                </div>

                {/* Models */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 tracking-wide">Modelos disponíveis</label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {models.map(m => {
                      const badge = TIER_BADGE[m.tier] || TIER_BADGE.medium
                      const isSelected = currentPref?.provider === pk && currentPref?.model === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => savePrefs({ [tab]: { provider: pk, model: m.id } })}
                          disabled={saving}
                          title={m.description}
                          aria-pressed={isSelected}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium transition ${
                            isSelected
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span className="truncate max-w-[160px]">{m.label}</span>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                            isSelected ? 'bg-white/15 text-white/80' : badge.cls
                          }`}>
                            {badge.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Current default info */}
      {currentPref && (
        <div className="bg-gray-900 text-white rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50 flex items-center gap-1.5">
            <Zap size={11} strokeWidth={2} />
            Padrão ativo · {TAB_CFG.find(t => t.key === tab)?.label}
          </p>
          <p className="text-[14px] font-medium mt-1.5">
            {PROVIDER_META[currentPref.provider]?.label || currentPref.provider}
            <span className="text-white/50 font-normal"> · {currentPref.model}</span>
          </p>
          <p className="text-[11px] text-white/40 mt-1">Clique em qualquer modelo acima para alterar</p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[76px] lg:bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div
            role="status"
            className={`px-4 py-2.5 rounded-full text-white text-[13px] font-medium shadow-lg pointer-events-auto ${
              toast.type === 'err' ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

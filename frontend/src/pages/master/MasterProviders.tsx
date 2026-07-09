import { useCallback, useEffect, useState } from 'react'
import {
  Loader2,
  Eye,
  EyeOff,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  Bot,
  Sparkles,
  Zap,
  Video,
  Film,
  Plug,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { masterApi } from '@/lib/master-api'
import { MasterPageHeader, MasterCard } from './MasterShell'

const PROVIDER_META: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  openai: { label: 'OpenAI', Icon: Bot, color: 'from-gray-700 to-gray-900' },
  gemini: { label: 'Google Gemini', Icon: Sparkles, color: 'from-blue-600 to-cyan-600' },
  grok: { label: 'xAI Grok', Icon: Zap, color: 'from-gray-600 to-gray-800' },
  veo: { label: 'Google Veo', Icon: Film, color: 'from-purple-600 to-indigo-600' },
  kling: { label: 'Kling AI', Icon: Video, color: 'from-pink-600 to-rose-600' },
  rapidapi: { label: 'RapidAPI', Icon: Plug, color: 'from-orange-600 to-amber-600' },
  google_places: { label: 'Google Places', Icon: Plug, color: 'from-green-600 to-emerald-600' },
  runway: { label: 'Runway', Icon: Film, color: 'from-violet-600 to-purple-600' },
}

const VISIBLE_PROVIDERS = ['openai', 'gemini', 'grok', 'veo', 'kling', 'rapidapi', 'google_places']

export function MasterProviders() {
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string } | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await masterApi.listProviders()
      setProviders((r.providers || []).filter(p => VISIBLE_PROVIDERS.includes(p.provider)))
      setError(null)
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function saveProvider(provider: string, patch: Record<string, any>) {
    setBusy(provider)
    try {
      const r = await masterApi.updateProvider(provider, patch)
      setProviders(prev => prev.map(p => (p.provider === provider ? r.provider : p)))
      setEditKeys(prev => ({ ...prev, [provider]: '' }))
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar')
    } finally {
      setBusy(null)
    }
  }

  async function testProvider(provider: string) {
    setBusy(`test:${provider}`)
    setTestResults(prev => ({ ...prev, [provider]: null }))
    try {
      const key = editKeys[provider]?.trim()
      const r = await masterApi.testProvider(provider, key ? { key } : {})
      setTestResults(prev => ({ ...prev, [provider]: { ok: r.ok, msg: r.message } }))
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [provider]: { ok: false, msg: err?.message || 'Falha' } }))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <>
        <MasterPageHeader title="Providers IA" />
        <div className="grid place-items-center py-20">
          <Loader2 size={20} className="animate-spin text-white/40" />
        </div>
      </>
    )
  }

  return (
    <>
      <MasterPageHeader
        title="Providers IA"
        subtitle="Chaves globais da plataforma — fallback para todos os clientes sem provider próprio."
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {providers.map(p => {
          const meta = PROVIDER_META[p.provider] || {
            label: p.provider,
            Icon: Plug,
            color: 'from-gray-600 to-gray-800',
          }
          const test = testResults[p.provider]
          const isBusy = busy === p.provider || busy === `test:${p.provider}`

          return (
            <MasterCard key={p.provider} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} grid place-items-center text-white`}
                  >
                    <meta.Icon size={18} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-white">{meta.label}</h3>
                    <p className="text-[11px] text-white/40">
                      {p.source === 'database' ? 'Configurado no banco' : p.source === 'env' ? 'Via variável de ambiente' : 'Não configurado'}
                      {p.env_fallback_available ? ' · env disponível' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveProvider(p.provider, { is_active: !p.is_active })}
                  disabled={isBusy}
                  className={`h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wide transition ${
                    p.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {p.is_active ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40 mb-1.5 block">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKeys[p.provider] ? 'text' : 'password'}
                      value={editKeys[p.provider] ?? ''}
                      onChange={e => setEditKeys(prev => ({ ...prev, [p.provider]: e.target.value }))}
                      placeholder={p.has_key ? p.masked_key || '••••••••' : 'Cole a chave aqui'}
                      className="w-full h-10 pl-3 pr-10 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys(prev => ({ ...prev, [p.provider]: !prev[p.provider] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-white/40 hover:text-white"
                    >
                      {showKeys[p.provider] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {test && (
                  <div
                    className={`flex items-center gap-2 text-[12px] ${
                      test.ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {test.msg}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const key = editKeys[p.provider]?.trim()
                      saveProvider(p.provider, {
                        ...(key ? { key } : {}),
                        is_active: true,
                      })
                    }}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white text-gray-900 text-[12px] font-semibold hover:bg-white/90 disabled:opacity-50"
                  >
                    {busy === p.provider ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => testProvider(p.provider)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/15 text-[12px] font-medium text-white/80 hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    {busy === `test:${p.provider}` ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <TestTube size={13} />
                    )}
                    Testar
                  </button>
                </div>
              </div>
            </MasterCard>
          )
        })}
      </div>
    </>
  )
}
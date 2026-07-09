import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, LayoutGrid, BarChart3, Zap, CalendarDays, MessageCircle,
  RefreshCw, Plus, Eye, TrendingUp, Users, Heart, MessageSquare, Globe,
  Loader2, CheckCircle2, AlertCircle, ExternalLink, X, Settings, Trash2,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons'
import { PageSplash } from '@/components/PageSplash'

const API = '/api/facebook'

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...getHeaders(), ...(opts?.headers || {}) } })
  return res.json()
}

const TABS = [
  { key: 'overview', label: 'Visao Geral', icon: FacebookIcon },
  { key: 'create', label: 'Gerar Conteudo', icon: Sparkles },
  { key: 'posts', label: 'Post', icon: LayoutGrid },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'automations', label: 'Automacoes', icon: Zap },
  { key: 'calendar', label: 'Calendario', icon: CalendarDays },
  { key: 'messages', label: 'Mensagens', icon: MessageCircle },
] as const

export type FacebookTabKey = typeof TABS[number]['key']
type TabKey = FacebookTabKey

type FacebookPageProps = {
  embedded?: boolean
  initialTab?: TabKey
}

export function FacebookPage({ embedded = false, initialTab = 'overview' }: FacebookPageProps = {}) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [profile, setProfile] = useState<any>(null)
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const [connRes, profRes] = await Promise.all([api('/connection'), api('/profile')])
      if (connRes.success) setConnection(connRes.connection)
      if (profRes.success) setProfile(profRes.profile)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])
  useEffect(() => { setTab(initialTab) }, [initialTab])

  if (loading) {
    return <PageSplash variant={embedded ? 'canvas' : 'page'} label="Facebook" />
  }

  if (!connection) {
    return (
      <>
        <NotConnectedView embedded={embedded} onConnect={() => setShowConnectModal(true)} />
        {showConnectModal && (
          <ConnectModal onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); loadProfile() }} />
        )}
      </>
    )
  }

  const stats = {
    published: profile?.posts_count || 0,
    scheduled: 0,
    drafts: 0,
  }

  const handleReconnect = async () => {
    if (!confirm('Desconectar a pagina atual e reconectar?')) return
    await api('/connection', { method: 'DELETE' })
    setConnection(null)
    setProfile(null)
    setShowConnectModal(true)
  }

  return (
    <>
      <div className="space-y-0">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center">
              <FacebookIcon size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Facebook</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{profile?.name || '--'}</span>
                <span className="text-gray-300">·</span>
                <span>{(profile?.fan_count || 0).toLocaleString('pt-BR')} curtidas</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.published}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Publicados</p></div>
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.scheduled}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Agendados</p></div>
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.drafts}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Rascunhos</p></div>
            <button onClick={handleReconnect} title="Reconectar pagina" className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 -mx-1 px-1 scrollbar-none">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pt-4">
          {tab === 'overview' && <OverviewTab profile={profile} onRefresh={loadProfile} />}
          {tab === 'create' && <CreateTab />}
          {tab === 'posts' && <PostsTab />}
          {tab === 'performance' && <PerformanceTab />}
          {tab === 'automations' && <AutomationsTab />}
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'messages' && <MessagesTab />}
        </div>
      </div>

      {showConnectModal && (
        <ConnectModal onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); loadProfile() }} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════
   NOT CONNECTED VIEW — clean empty state
   ═══════════════════════════════════════════ */
function NotConnectedView({ onConnect, embedded = false }: { onConnect: () => void; embedded?: boolean }) {
  return (
    <div className={`max-w-md mx-auto text-center ${embedded ? 'py-8' : 'py-16'}`}>
      <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-6 shadow-lg shadow-blue-200/50">
        <FacebookIcon size={32} className="text-white" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Facebook Pages</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        Conecte sua Pagina do Facebook para publicar, gerenciar mensagens e acompanhar metricas.
      </p>
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 text-white text-sm font-semibold hover:opacity-90 transition shadow-sm"
      >
        <FacebookIcon size={18} />
        Conectar Pagina
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CONNECT MODAL — paste token to connect
   ═══════════════════════════════════════════ */
function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const connect = async () => {
    if (!token.trim()) return setError('Cole o Access Token para continuar')
    setSaving(true)
    setError('')
    setResult(null)
    try {
      const res = await api('/connection', {
        method: 'POST',
        body: JSON.stringify({ access_token: token.trim() }),
      })
      if (res.success) {
        setResult(res.profile || res.page)
        setTimeout(() => onConnected(), 1200)
      } else {
        setError(res.error || 'Erro ao conectar')
      }
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center">
              <FacebookIcon size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Conectar Pagina do Facebook</h2>
              <p className="text-[11px] text-gray-400">Cole o token de acesso da pagina</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
              <p className="text-sm font-semibold text-gray-900">
                {result.name} conectado!
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(result.fan_count || 0).toLocaleString('pt-BR')} curtidas
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
                  Access Token
                </label>
                <textarea
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Cole aqui o Page Access Token do Facebook"
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 resize-none font-mono text-xs"
                />
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Obtido na plataforma Meta for Developers, gere um Page Access Token com as permissoes necessarias.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 pb-5 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={connect}
              disabled={saving || !token.trim()}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              {saving ? 'Validando...' : 'Conectar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: VISAO GERAL
   ═══════════════════════════════════════════ */
function OverviewTab({ profile, onRefresh }: { profile: any; onRefresh: () => void }) {
  const [feed, setFeed] = useState<any[]>([])
  const [loadingFeed, setLoadingFeed] = useState(true)

  useEffect(() => {
    setLoadingFeed(true)
    api('/feed?limit=6').then(r => { if (r.success) setFeed(r.feed || r.posts || []); setLoadingFeed(false) }).catch(() => setLoadingFeed(false))
  }, [])

  return (
    <div className="space-y-5">
      {/* Profile Card */}
      <div className="flex items-start gap-4 bg-white border border-gray-100 rounded-xl p-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-300 grid place-items-center text-white text-xl font-bold shrink-0 overflow-hidden">
          {profile?.picture?.data?.url
            ? <img src={profile.picture.data.url} className="w-full h-full object-cover" />
            : (profile?.name?.[0] || 'F').toUpperCase()
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-base font-bold text-gray-900">{profile?.name || '--'}</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Conectado
            </span>
          </div>
          {profile?.category && (
            <p className="text-xs text-blue-500 mb-0.5">{profile.category}</p>
          )}
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{profile?.about || profile?.description || ''}</p>
          <div className="flex gap-4 text-xs">
            <div><span className="font-bold text-gray-900">{(profile?.fan_count || 0).toLocaleString('pt-BR')}</span> <span className="text-gray-400 uppercase text-[10px]">curtidas</span></div>
            <div><span className="font-bold text-gray-900">{(profile?.followers_count || 0).toLocaleString('pt-BR')}</span> <span className="text-gray-400 uppercase text-[10px]">seguidores</span></div>
            {profile?.website && (
              <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-500 hover:underline">
                <Globe size={10} /> {(() => { try { return new URL(profile.website).hostname } catch { return profile.website } })()}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={onRefresh} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5">
            <RefreshCw size={12} /> Atualizar
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 text-white text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5">
            <Plus size={12} /> Novo Post
          </button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Impressoes (7D)', value: '--', icon: Eye },
          { label: 'Alcance (7D)', value: '--', icon: TrendingUp },
          { label: 'Engajamento', value: '--', icon: Heart },
          { label: 'Novos Fas', value: '--', icon: Users },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{m.label}</span>
              <m.icon size={14} className="text-gray-300" />
            </div>
            <p className="text-lg font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Recent Posts */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Posts Recentes</h3>
              <p className="text-[10px] text-gray-400">Ultimas {feed.length} publicacoes</p>
            </div>
            <button className="text-xs text-blue-500 hover:underline font-medium">Ver todos</button>
          </div>
          {loadingFeed ? (
            <div className="grid place-items-center h-40"><Loader2 size={16} className="animate-spin text-gray-300" /></div>
          ) : feed.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Nenhum post encontrado</p>
          ) : (
            <div className="space-y-2">
              {feed.slice(0, 6).map((p: any) => (
                <div key={p.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition">
                  {p.full_picture && (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                      <img src={p.full_picture} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 line-clamp-2">{p.message || '(sem texto)'}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                      {p.likes?.summary?.total_count != null && (
                        <span className="flex items-center gap-0.5"><Heart size={10} /> {p.likes.summary.total_count}</span>
                      )}
                      {p.comments?.summary?.total_count != null && (
                        <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {p.comments.summary.total_count}</span>
                      )}
                      {p.created_time && (
                        <span>{new Date(p.created_time).toLocaleDateString('pt-BR')}</span>
                      )}
                    </div>
                  </div>
                  {p.permalink_url && (
                    <a href={p.permalink_url} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-gray-100 shrink-0">
                      <ExternalLink size={12} className="text-gray-400" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Summary */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Resumo de Atividade</h3>
          <div className="space-y-2">
            {[
              { label: 'Mensagens', count: 0, icon: MessageCircle },
              { label: 'Agendados', count: 0, icon: CalendarDays },
              { label: 'Rascunhos', count: 0, icon: Settings },
            ].map(a => (
              <button key={a.label} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-50 transition text-left">
                <div className="flex items-center gap-2">
                  <a.icon size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-700">{a.label}</span>
                </div>
                <span className={`text-xs font-bold ${a.count > 0 ? 'text-blue-500' : 'text-gray-300'}`}>{a.count}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between px-3">
            <span className="text-xs text-gray-500">Token</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Valido
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: GERAR CONTEUDO (placeholder)
   ═══════════════════════════════════════════ */
function CreateTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <Sparkles size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Gerar Conteudo</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: POSTS (placeholder)
   ═══════════════════════════════════════════ */
function PostsTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <LayoutGrid size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Posts</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: PERFORMANCE (placeholder)
   ═══════════════════════════════════════════ */
function PerformanceTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <BarChart3 size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Performance</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: AUTOMACOES (placeholder)
   ═══════════════════════════════════════════ */
function AutomationsTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <Zap size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Automacoes</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: CALENDARIO (placeholder)
   ═══════════════════════════════════════════ */
function CalendarTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <CalendarDays size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Calendario</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: MENSAGENS (placeholder)
   ═══════════════════════════════════════════ */
function MessagesTab() {
  return (
    <div className="py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 grid place-items-center mb-4">
        <MessageCircle size={24} className="text-white" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Mensagens</h3>
      <p className="text-sm text-gray-400">Em breve</p>
    </div>
  )
}

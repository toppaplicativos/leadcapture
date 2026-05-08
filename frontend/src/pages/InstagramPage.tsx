import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Camera, Home, Sparkles, LayoutGrid, BarChart3, Zap, Bot, CalendarDays, MessageCircle,
  RefreshCw, Plus, Eye, TrendingUp, Users, Heart, MessageSquare, Bookmark, Image,
  Video, Film, Play, Pause, Square, ChevronLeft, ChevronRight, Send, Clock, FileText,
  Upload, Search, List, Grid3X3, Loader2, CheckCircle2, AlertCircle, ExternalLink,
  Trash2, Settings, Globe, X, MoreHorizontal,
} from 'lucide-react'

const API = '/api/instagram'

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
  { key: 'overview', label: 'Visao Geral', icon: Home },
  { key: 'create', label: 'Gerar Conteudo', icon: Sparkles },
  { key: 'posts', label: 'Post', icon: LayoutGrid },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'automations', label: 'Automacoes', icon: Zap },
  { key: 'ai', label: 'Atendimento IA', icon: Bot },
  { key: 'calendar', label: 'Calendario', icon: CalendarDays },
  { key: 'messages', label: 'Mensagens', icon: MessageCircle },
] as const

type TabKey = typeof TABS[number]['key']

export function InstagramPage() {
  const [tab, setTab] = useState<TabKey>('overview')
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

  const isConnected = profile?.is_connected

  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!connection) {
    return (
      <>
        <NotConnectedView onConnect={() => setShowConnectModal(true)} />
        {showConnectModal && (
          <ConnectModal onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); loadProfile() }} />
        )}
      </>
    )
  }

  const stats = {
    published: profile?.media_count || 0,
    scheduled: 0,
    drafts: 0,
  }

  const handleReconnect = async () => {
    if (!confirm('Desconectar a conta atual e reconectar?')) return
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 grid place-items-center">
              <Camera size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Instagram</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                <span>@{profile?.username || '—'}</span>
                <span className="text-gray-300">·</span>
                <span>{profile?.followers_count || 0} seguidores</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.published}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Publicados</p></div>
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.scheduled}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Agendados</p></div>
            <div className="text-center"><p className="text-base font-bold text-gray-900">{stats.drafts}</p><p className="text-gray-400 uppercase tracking-wider text-[10px]">Rascunhos</p></div>
            <button onClick={handleReconnect} title="Reconectar conta" className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
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
                  ? 'border-purple-500 text-purple-600'
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
          {tab === 'ai' && <AITab />}
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
function NotConnectedView({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="max-w-md mx-auto py-16 text-center">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 grid place-items-center mb-6 shadow-lg shadow-purple-200/50">
        <Camera size={32} className="text-white" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Instagram</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        Conecte uma conta Instagram Business para gerenciar posts, mensagens, metricas e automacoes em um so lugar.
      </p>
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white text-sm font-semibold hover:opacity-90 transition shadow-sm"
      >
        <Camera size={18} />
        Conectar Instagram
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
        setResult(res.profile)
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 grid place-items-center">
              <Camera size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Conectar Instagram</h2>
              <p className="text-[11px] text-gray-400">Cole o token de acesso da conta</p>
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
                @{result.username} conectado!
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {result.followers_count || 0} seguidores · {result.media_count || 0} posts
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
                  placeholder="Cole aqui o token de acesso do Instagram Business"
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400 resize-none font-mono text-xs"
                />
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Obtido na plataforma Meta for Developers, na secao de tokens de acesso.
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
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
  const [media, setMedia] = useState<any[]>([])
  const [loadingMedia, setLoadingMedia] = useState(true)
  const [snapping, setSnapping] = useState(false)

  useEffect(() => {
    setLoadingMedia(true)
    api('/media?limit=9').then(r => { if (r.success) setMedia(r.media || []); setLoadingMedia(false) }).catch(() => setLoadingMedia(false))
  }, [])

  const snapshot = async () => {
    setSnapping(true)
    await api('/snapshot', { method: 'POST' })
    onRefresh()
    setSnapping(false)
  }

  return (
    <div className="space-y-5">
      {/* Profile Card */}
      <div className="flex items-start gap-4 bg-white border border-gray-100 rounded-xl p-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 grid place-items-center text-white text-xl font-bold shrink-0 overflow-hidden">
          {profile?.profile_picture_url
            ? <img src={profile.profile_picture_url} className="w-full h-full object-cover" />
            : (profile?.username?.[0] || 'I').toUpperCase()
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-base font-bold text-gray-900">@{profile?.username || '—'}</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Conectado
            </span>
          </div>
          <p className="text-sm text-gray-700 mb-0.5">{profile?.name || ''}</p>
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{profile?.biography || ''}</p>
          <div className="flex gap-4 text-xs">
            <div><span className="font-bold text-gray-900">{(profile?.followers_count || 0).toLocaleString('pt-BR')}</span> <span className="text-gray-400 uppercase text-[10px]">seguidores</span></div>
            <div><span className="font-bold text-gray-900">{(profile?.follows_count || 0).toLocaleString('pt-BR')}</span> <span className="text-gray-400 uppercase text-[10px]">seguindo</span></div>
            <div><span className="font-bold text-gray-900">{(profile?.media_count || 0).toLocaleString('pt-BR')}</span> <span className="text-gray-400 uppercase text-[10px]">posts</span></div>
            {profile?.website && (
              <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-purple-500 hover:underline">
                <Globe size={10} /> {new URL(profile.website).hostname}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={snapshot} disabled={snapping} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5">
            {snapping ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Snapshot agora
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5">
            <Plus size={12} /> Novo Post
          </button>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Impressoes (7D)', value: '—', icon: Eye },
          { label: 'Alcance (7D)', value: '—', icon: TrendingUp },
          { label: 'Visitas ao Perfil', value: '—', icon: Users },
          { label: 'Contas Engajadas', value: '—', icon: Heart },
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
              <p className="text-[10px] text-gray-400">Ultimas {media.length} publicacoes</p>
            </div>
            <button className="text-xs text-purple-500 hover:underline font-medium">Ver todos</button>
          </div>
          {loadingMedia ? (
            <div className="grid place-items-center h-40"><Loader2 size={16} className="animate-spin text-gray-300" /></div>
          ) : media.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Nenhum post encontrado</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {media.slice(0, 9).map((m: any) => (
                <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer"
                   className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-80 transition">
                  <img src={m.media_url || m.thumbnail_url} className="w-full h-full object-cover" loading="lazy" />
                </a>
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
              { label: 'Mencoes', count: 0, icon: Users },
              { label: 'Agendados', count: 0, icon: CalendarDays },
              { label: 'Rascunhos', count: 0, icon: FileText },
            ].map(a => (
              <button key={a.label} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-50 transition text-left">
                <div className="flex items-center gap-2">
                  <a.icon size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-700">{a.label}</span>
                </div>
                <span className={`text-xs font-bold ${a.count > 0 ? 'text-purple-500' : 'text-gray-300'}`}>{a.count}</span>
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
   TAB: GERAR CONTEUDO
   ═══════════════════════════════════════════ */
function CreateTab() {
  const [postType, setPostType] = useState<'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS' | 'VIDEO'>('IMAGE')
  const [mediaSource, setMediaSource] = useState<'upload' | 'ai-img' | 'ai-video'>('upload')
  const [caption, setCaption] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [when, setWhen] = useState<'now' | 'schedule' | 'draft'>('now')
  const [publishing, setPublishing] = useState(false)

  const postTypes = [
    { key: 'IMAGE' as const, label: 'Imagem', sub: 'Post com 1 foto', icon: Image },
    { key: 'CAROUSEL_ALBUM' as const, label: 'Carrossel', sub: '2-10 midias', icon: LayoutGrid },
    { key: 'REELS' as const, label: 'Reels', sub: 'Video curto', icon: Film },
    { key: 'VIDEO' as const, label: 'Video', sub: 'Video no feed', icon: Video },
  ]

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const status = when === 'now' ? 'publishing' : when === 'schedule' ? 'scheduled' : 'draft'
      const res = await api('/posts', {
        method: 'POST',
        body: JSON.stringify({ media_type: postType, media_url: mediaUrl, caption, status }),
      })
      if (res.success && when === 'now' && res.post?.id) {
        await api(`/posts/${res.post.id}/publish`, { method: 'POST' })
      }
    } catch {}
    setPublishing(false)
  }

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-4">
        {/* Post Type */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tipo de Post</h3>
          <div className="grid grid-cols-4 gap-2">
            {postTypes.map(pt => (
              <button key={pt.key} onClick={() => setPostType(pt.key)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition text-center ${
                  postType === pt.key ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-gray-200'
                }`}>
                <pt.icon size={18} className={postType === pt.key ? 'text-purple-500' : 'text-gray-400'} />
                <span className={`text-xs font-semibold ${postType === pt.key ? 'text-purple-600' : 'text-gray-600'}`}>{pt.label}</span>
                <span className="text-[10px] text-gray-400">{pt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Media */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Midia</h3>
          <div className="flex gap-1 mb-3 bg-gray-50 rounded-lg p-0.5">
            {[
              { key: 'upload' as const, label: 'Upload', icon: Upload },
              { key: 'ai-img' as const, label: 'Imagens IA', icon: Image },
              { key: 'ai-video' as const, label: 'Videos IA', icon: Video },
            ].map(s => (
              <button key={s.key} onClick={() => setMediaSource(s.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
                  mediaSource === s.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <s.icon size={12} /> {s.label}
              </button>
            ))}
          </div>
          {mediaUrl ? (
            <div className="relative">
              <img src={mediaUrl} className="w-full max-h-64 object-contain rounded-lg bg-gray-50" />
              <button onClick={() => setMediaUrl('')} className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={12} /></button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center">
              <Upload size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Clique ou arraste arquivos aqui</p>
              <p className="text-[10px] text-gray-400">JPG, PNG, WEBP</p>
              <input type="text" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                placeholder="Ou cole a URL da imagem aqui..."
                className="mt-3 mx-auto max-w-xs px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:border-purple-400" />
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Caption</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">{caption.length}/2200</span>
              <button className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-1"><Settings size={10} /> Templates</button>
              <button className="px-2 py-1 rounded-lg bg-purple-500 text-white text-[10px] font-semibold hover:bg-purple-600 flex items-center gap-1"><Sparkles size={10} /> Gerar com IA</button>
            </div>
          </div>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} maxLength={2200}
            placeholder="Escreva ou gere com IA a legenda do seu post..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400" />
        </div>

        {/* When */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1"><Clock size={12} /> Quando Publicar</h3>
          <div className="flex gap-1 bg-gray-50 rounded-lg p-0.5">
            {[
              { key: 'now' as const, label: 'Agora', icon: Send },
              { key: 'schedule' as const, label: 'Agendar', icon: Clock },
              { key: 'draft' as const, label: 'Rascunho', icon: FileText },
            ].map(w => (
              <button key={w.key} onClick={() => setWhen(w.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
                  when === w.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <w.icon size={12} /> {w.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handlePublish} disabled={publishing}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {when === 'now' ? 'Publicar Agora' : when === 'schedule' ? 'Agendar Post' : 'Salvar Rascunho'}
        </button>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 sticky top-4 self-start">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Preview</h3>
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-gray-100">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
            <span className="text-xs font-semibold text-gray-700">preview</span>
          </div>
          <div className="aspect-square bg-gray-50 grid place-items-center">
            {mediaUrl ? (
              <img src={mediaUrl} className="w-full h-full object-cover" />
            ) : (
              <div className="text-center">
                <Upload size={24} className="mx-auto text-gray-300 mb-1" />
                <p className="text-[10px] text-gray-400">Selecione uma midia acima</p>
              </div>
            )}
          </div>
          <div className="p-2 flex items-center gap-3">
            <Heart size={16} className="text-gray-400" />
            <MessageCircle size={16} className="text-gray-400" />
            <Send size={16} className="text-gray-400" />
            <Bookmark size={16} className="text-gray-400 ml-auto" />
          </div>
        </div>
        {(postType === 'IMAGE' || postType === 'CAROUSEL_ALBUM') && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1"><Sparkles size={10} /> Dicas — Imagem</p>
            <ul className="text-[10px] text-gray-500 space-y-0.5">
              <li>Resolucao recomendada: 1080x1080 (quadrado) ou 1080x1350 (retrato)</li>
              <li>Formatos: JPG, PNG</li>
              <li>Maximo: 8MB</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: POSTS
   ═══════════════════════════════════════════ */
function PostsTab() {
  const [posts, setPosts] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<'list' | 'feed'>('list')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = filter === 'all' ? '' : `&status=${filter}`
    const r = await api(`/posts?limit=50${params}`)
    if (r.success) { setPosts(r.posts || []); setTotal(r.total || 0) }
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'published', label: 'Publicado' },
    { key: 'scheduled', label: 'Agendado' },
    { key: 'draft', label: 'Rascunho' },
    { key: 'publishing', label: 'Publicando' },
    { key: 'failed', label: 'Falhou' },
  ]

  const statusColors: Record<string, string> = {
    published: 'bg-emerald-100 text-emerald-700',
    scheduled: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-600',
    publishing: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
  }

  const filtered = search
    ? posts.filter(p => (p.caption || '').toLowerCase().includes(search.toLowerCase()))
    : posts

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Posts</h2>
          <p className="text-xs text-gray-400">Publicacoes, rascunhos e agendamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar captions..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs w-48 focus:outline-none focus:border-purple-400" />
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-white shadow-sm' : ''}`}><List size={14} className="text-gray-600" /></button>
            <button onClick={() => setView('feed')} className={`p-1.5 rounded ${view === 'feed' ? 'bg-white shadow-sm' : ''}`}><Grid3X3 size={14} className="text-gray-600" /></button>
          </div>
          <button onClick={load} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={14} className="text-gray-500" /></button>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {filters.map(f => {
          const count = f.key === 'all' ? total : posts.filter(p => p.status === f.key).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f.key ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label} {count > 0 && <span className="ml-1 opacity-75">{count}</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Nenhum post encontrado</p>
      ) : view === 'list' ? (
        <div className="space-y-1">
          {filtered.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition">
              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                {p.media_url && <img src={p.media_url} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-gray-400 flex items-center gap-1"><Image size={10} /> {p.media_type}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColors[p.status] || 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                </div>
                <p className="text-xs text-gray-700 truncate">{p.caption || '(sem legenda)'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="p-1.5 rounded-lg hover:bg-gray-100"><ExternalLink size={12} className="text-gray-400" /></button>
                <button onClick={async () => { await api(`/posts/${p.id}`, { method: 'DELETE' }); load() }}
                  className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={12} className="text-gray-400" /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filtered.map(p => (
            <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100 relative group cursor-pointer">
              {p.media_url && <img src={p.media_url} className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3 text-white text-xs">
                <span className="flex items-center gap-1"><Heart size={12} /> {p.likes_count || 0}</span>
                <span className="flex items-center gap-1"><MessageSquare size={12} /> {p.comments_count || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: PERFORMANCE
   ═══════════════════════════════════════════ */
function PerformanceTab() {
  const [period, setPeriod] = useState(30)
  const [metrics, setMetrics] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api(`/metrics?days=${period}`),
      api('/profile'),
    ]).then(([mr, pr]) => {
      if (mr.success) setMetrics(mr.metrics || [])
      if (pr.success) setProfile(pr.profile)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [period])

  const last = metrics[metrics.length - 1]
  const first = metrics[0]
  const followersDelta = last && first ? (last.followers_count || 0) - (first.followers_count || 0) : 0

  const snapshot = async () => {
    await api('/snapshot', { method: 'POST' })
    const mr = await api(`/metrics?days=${period}`)
    if (mr.success) setMetrics(mr.metrics || [])
  }

  if (loading) return <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Performance</h2>
          <p className="text-xs text-gray-400">Historico diario armazenado no banco — seguidores, engajamento, alcance e posts</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${period === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {d}d
            </button>
          ))}
          <button onClick={snapshot} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1">
            <Camera size={12} /> Snapshot
          </button>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-gray-400 uppercase">Seguidores ({period}D)</span><Users size={14} className="text-gray-300" /></div>
          <p className="text-2xl font-bold text-gray-900">{profile?.followers_count || 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-gray-400 uppercase">Engajamento ({period}D)</span><TrendingUp size={14} className="text-gray-300" /></div>
          <p className="text-2xl font-bold text-gray-900">0.00%</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-gray-400 uppercase">Posts Publicados</span><LayoutGrid size={14} className="text-gray-300" /></div>
          <p className="text-2xl font-bold text-gray-900">{profile?.media_count || 0} {followersDelta !== 0 && <span className={`text-xs ${followersDelta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{followersDelta > 0 ? '+' : ''}{followersDelta}</span>}</p>
        </div>
      </div>

      {/* Detail Metrics */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Posts Publicados', value: profile?.media_count || 0, icon: CheckCircle2 },
          { label: 'Impressoes Totais', value: 0, icon: Eye },
          { label: 'Alcance Total', value: 0, icon: TrendingUp },
          { label: 'Curtidas', value: 0, icon: Heart },
          { label: 'Comentarios', value: 0, icon: MessageCircle },
          { label: 'Salvos', value: 0, icon: Bookmark },
          { label: 'Engajamento Medio', value: '0.0%', icon: BarChart3 },
          { label: 'Posts Semana', value: 0, icon: CalendarDays },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-gray-400 uppercase">{m.label}</span><m.icon size={14} className="text-gray-300" /></div>
            <p className="text-lg font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Seguidores ao longo do tempo</h3>
          <p className="text-[10px] text-gray-400 mb-3">Evolucao nos ultimos {period} dias</p>
          {metrics.length > 0 ? (
            <div className="h-40 flex items-end gap-1">
              {metrics.map((m, i) => {
                const max = Math.max(...metrics.map(x => x.followers_count || 1))
                const h = ((m.followers_count || 0) / max) * 100
                return <div key={i} className="flex-1 bg-purple-200 rounded-t" style={{ height: `${Math.max(h, 2)}%` }} title={`${m.date}: ${m.followers_count}`} />
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-8 text-center">Sem dados. Clique em "Snapshot" para coletar.</p>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Engajamento medio</h3>
          <p className="text-[10px] text-gray-400 mb-3">Taxa % por dia</p>
          <p className="text-xs text-gray-400 py-8 text-center">Dados serao coletados com snapshots diarios</p>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: AUTOMACOES
   ═══════════════════════════════════════════ */
function AutomationsTab() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Automacoes Instagram</h2>
          <p className="text-xs text-gray-400">Automacoes estrategicas — conteudo, engajamento, monitoramento e analise</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-center"><span className="text-sm font-bold text-purple-500">0</span><p className="text-gray-400">Ativas</p></div>
          <div className="text-center"><span className="text-sm font-bold text-gray-900">0</span><p className="text-gray-400">Execucoes</p></div>
          <div className="text-center"><span className="text-sm font-bold text-emerald-500">0</span><p className="text-gray-400">Sucessos</p></div>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { name: 'Post Matinal de Valor', desc: 'Publica conteudo educativo todo dia util as 9h', type: 'Post Squad' },
          { name: 'Stories Diarios de Engajamento', desc: 'Gera conteudo criativo para Story todos os dias as 11h', type: 'Stories' },
          { name: 'Monitor de Mencoes', desc: 'Verifica mencoes ao perfil a cada 3 horas', type: 'Mencoes' },
          { name: 'Relatorio Semanal de Performance', desc: 'Toda segunda as 8h consolida metricas da semana', type: 'Relatorio' },
          { name: 'Post de Conversao', desc: 'Post focado em conversao toda sexta as 19h', type: 'Post Squad' },
        ].map((a, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-800">{a.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-semibold">{a.type}</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{a.desc}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button className="p-1.5 rounded-lg hover:bg-gray-100"><Play size={14} className="text-gray-400" /></button>
              <button className="p-1.5 rounded-lg hover:bg-gray-100"><Pause size={14} className="text-gray-400" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: ATENDIMENTO IA
   ═══════════════════════════════════════════ */
function AITab() {
  const [subTab, setSubTab] = useState<'marca' | 'faq' | 'regras' | 'skills' | 'testar'>('marca')
  const [autoReplyDM, setAutoReplyDM] = useState(false)
  const [autoReplyComments, setAutoReplyComments] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Bot size={18} /> Atendimento IA</h2>
          <p className="text-xs text-gray-400">Treine seu bot com o DNA da marca — FAQ, regras rapidas e respostas automaticas em DMs e comentarios</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1"><Sparkles size={12} /> Seed com contexto do site</button>
        <button onClick={() => setAutoReplyDM(!autoReplyDM)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${autoReplyDM ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${autoReplyDM ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          Auto-reply DMs: {autoReplyDM ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => setAutoReplyComments(!autoReplyComments)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${autoReplyComments ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${autoReplyComments ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          Auto-reply Comentarios: {autoReplyComments ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-50 rounded-lg p-0.5 w-fit">
        {[
          { key: 'marca' as const, label: 'Marca', icon: Camera },
          { key: 'faq' as const, label: 'FAQ', icon: FileText },
          { key: 'regras' as const, label: 'Regras', icon: Settings },
          { key: 'skills' as const, label: 'Skills', icon: Sparkles },
          { key: 'testar' as const, label: 'Testar', icon: Play },
        ].map(s => (
          <button key={s.key} onClick={() => setSubTab(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === s.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <s.icon size={12} /> {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        {subTab === 'marca' && (
          <div className="space-y-4">
            <div><h3 className="text-sm font-bold text-gray-900 mb-0.5">Identidade da marca</h3><p className="text-xs text-gray-400">Como o bot se apresenta e fala</p></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Nome da marca</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400" placeholder="Nome da sua marca" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Persona do atendente</label><textarea rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400" placeholder="Descreva quem e o bot..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Tom de voz</label><input className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400" placeholder="Ex: caloroso e direto" /></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Tamanho maximo (chars)</label><input type="number" defaultValue={500} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-purple-400" /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Diretrizes detalhadas</label><textarea rows={4} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400" placeholder="O que fazer / evitar..." /></div>
            <button className="px-4 py-2 rounded-lg bg-purple-500 text-white text-xs font-semibold hover:bg-purple-600 transition">Salvar</button>
          </div>
        )}
        {subTab === 'faq' && <p className="text-sm text-gray-400 py-8 text-center">Configure perguntas frequentes para respostas automaticas</p>}
        {subTab === 'regras' && <p className="text-sm text-gray-400 py-8 text-center">Defina regras rapidas de resposta</p>}
        {subTab === 'skills' && <p className="text-sm text-gray-400 py-8 text-center">Habilidades especiais do bot</p>}
        {subTab === 'testar' && <p className="text-sm text-gray-400 py-8 text-center">Teste o bot antes de ativar</p>}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: CALENDARIO
   ═══════════════════════════════════════════ */
function CalendarTab() {
  const [date, setDate] = useState(new Date())
  const [posts, setPosts] = useState<any[]>([])

  useEffect(() => {
    api('/posts?limit=200').then(r => { if (r.success) setPosts(r.posts || []) })
  }, [])

  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const monthNames = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  const prev = () => setDate(new Date(year, month - 1, 1))
  const next = () => setDate(new Date(year, month + 1, 1))

  const getPostsForDay = (day: number) => {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return posts.filter(p => (p.created_at || p.published_at || p.scheduled_at || '').startsWith(d))
  }

  const statusDot: Record<string, string> = {
    published: 'bg-emerald-500',
    scheduled: 'bg-blue-500',
    draft: 'bg-amber-500',
    failed: 'bg-red-500',
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} className="text-gray-500" /></button>
        <h2 className="text-base font-bold text-gray-900">{monthNames[month]} De {year}</h2>
        <button onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={16} className="text-gray-500" /></button>
      </div>

      <div className="grid grid-cols-7 border border-gray-100 rounded-xl overflow-hidden">
        {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(d => (
          <div key={d} className="text-center py-2 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 border-b border-gray-100">{d}</div>
        ))}
        {cells.map((day, i) => {
          const dayPosts = day ? getPostsForDay(day) : []
          const isToday = day && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
          return (
            <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${!day ? 'bg-gray-50/50' : ''}`}>
              {day && (
                <>
                  <span className={`text-xs font-medium ${isToday ? 'text-purple-600 font-bold' : 'text-gray-600'}`}>{day}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayPosts.slice(0, 3).map((p, j) => (
                      <div key={j} className="flex items-center gap-1 text-[9px] text-gray-500 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[p.status] || 'bg-gray-300'}`} />
                        {p.media_type}
                      </div>
                    ))}
                    {dayPosts.length > 3 && <p className="text-[9px] text-gray-400">+{dayPosts.length - 3} mais</p>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-4 mt-3 text-[10px]">
        {[
          { label: 'Publicado', color: 'bg-emerald-500' },
          { label: 'Agendado', color: 'bg-blue-500' },
          { label: 'Rascunho', color: 'bg-amber-500' },
          { label: 'Falhou', color: 'bg-red-500' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${l.color}`} /><span className="text-gray-500">{l.label}</span></div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: MENSAGENS
   ═══════════════════════════════════════════ */
function MessagesTab() {
  const [conversations, setConversations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    setLoading(true)
    api('/conversations').then(r => { if (r.success) setConversations(r.conversations || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">Mensagens</h2>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Buscar conversas..." className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs w-48 focus:outline-none focus:border-purple-400" />
          </div>
          <button className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={14} className="text-gray-500" /></button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">Direct do Instagram · Atualiza em tempo real quando chegar DM</p>

      <div className="grid grid-cols-3 gap-4 min-h-[400px]">
        {/* Conversation List */}
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Conversas</span>
            <span className="text-[10px] text-gray-400">{conversations.length}</span>
          </div>
          {loading ? (
            <div className="py-8 grid place-items-center"><Loader2 size={14} className="animate-spin text-gray-300" /></div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">Nenhuma conversa</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((c: any, i: number) => (
                <button key={i} onClick={() => setSelected(c)}
                  className={`w-full text-left p-2 rounded-lg transition ${selected === c ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-200 grid place-items-center text-xs font-bold text-purple-600 shrink-0">
                      {(c.participants?.data?.[0]?.username || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">@{c.participants?.data?.[0]?.username || '—'}</p>
                      <p className="text-[10px] text-gray-400 truncate">{c.messages?.data?.[0]?.message || ''}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-center">
          {selected ? (
            <div className="w-full space-y-3">
              <div className="border-b border-gray-100 pb-2 mb-3">
                <p className="text-sm font-bold text-gray-800">@{selected.participants?.data?.[0]?.username || '—'}</p>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {(selected.messages?.data || []).map((m: any, i: number) => (
                  <div key={i} className={`max-w-[70%] p-2 rounded-lg text-xs ${m.from?.username === selected.participants?.data?.[0]?.username ? 'bg-gray-100 text-gray-700' : 'bg-purple-500 text-white ml-auto'}`}>
                    {m.message}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <MessageCircle size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Selecione uma conversa</p>
              <p className="text-[10px] text-gray-300">Ou aguarde alguem mandar DM</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

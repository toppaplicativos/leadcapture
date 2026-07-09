import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Camera, Sparkles, LayoutGrid, BarChart3, Zap, Bot, CalendarDays, MessageCircle,
  RefreshCw, Plus, Eye, TrendingUp, Users, Heart, MessageSquare, Bookmark, Image,
  Video, Film, Play, Pause, Square, ChevronLeft, ChevronRight, Send, Clock, FileText,
  Upload, Search, List, Grid3X3, Loader2, CheckCircle2, AlertCircle, ExternalLink, Images,
  Trash2, Settings, Globe, X, Pencil,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { PageSplash } from '@/components/PageSplash'
import { InstagramAutomationsTab } from '@/components/agent/instagram/InstagramAutomationsTab'
import { InstagramStudioShell } from '@/components/instagram/InstagramStudioShell'
import { InstagramOverviewTab } from '@/components/instagram/InstagramOverviewTab'
import { InstagramMessagesTab } from '@/components/instagram/InstagramMessagesTab'
import { InstagramPostAnalysisModal } from '@/components/instagram/InstagramPostAnalysisModal'
import { InstagramCalendarTab } from '@/components/instagram/InstagramCalendarTab'
import { InstagramCreateTab } from '@/components/instagram/InstagramCreateTab'
import { InstagramPostQueueSheet } from '@/components/instagram/InstagramPostQueueSheet'
import { InstagramAiTab } from '@/components/instagram/InstagramAiTab'
import { PostMediaThumb } from '@/components/instagram/PostMediaThumb'
import { useInstagramQueueAlerts } from '@/lib/instagram/useInstagramQueueAlerts'
import { instagramApi, fmtIgMetric, getInstagramHeaders } from '@/lib/instagram/pageApi'
import { fetchInstagramSnapshot, invalidateInstagramSnapshotCache } from '@/lib/instagram/client'
import { useToast } from '@/components/Toast'
import type { InstagramTabKey } from '@/lib/instagram/nav'

export type { InstagramTabKey } from '@/lib/instagram/nav'

type TabKey = InstagramTabKey

const api = instagramApi
const fmtMetric = fmtIgMetric

type InstagramPageProps = {
  embedded?: boolean
  initialTab?: TabKey
}

export function InstagramPage({ embedded = false, initialTab = 'overview' }: InstagramPageProps = {}) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [profile, setProfile] = useState<any>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [postsNav, setPostsNav] = useState<{ filter: string; token: number } | null>(null)
  const [createNav, setCreateNav] = useState<{
    editPostId?: string
    schedulePrefill?: string
    token: number
  } | null>(null)
  const [queuePost, setQueuePost] = useState<any>(null)
  const [postsRefreshToken, setPostsRefreshToken] = useState(0)
  const { showToast } = useToast()
  const brandId =
    typeof window !== 'undefined' ? localStorage.getItem('lead-system:active-brand-id') || undefined : undefined

  const loadProfile = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true)
    try {
      if (opts?.force) invalidateInstagramSnapshotCache()
      // Uma única fonte: snapshot já traz /dashboard (sem segundo round-trip)
      const snap = await fetchInstagramSnapshot(opts?.force ? { force: true } : undefined)
      const conn = snap.connection || null
      setConnection(conn)

      if (snap.connected) {
        const prof = snap.profile || (conn ? {
          username: conn.username,
          name: conn.name,
          profile_picture_url: conn.profile_picture_url,
          followers_count: conn.followers_count,
          media_count: conn.media_count,
        } : null)
        setProfile({
          ...(prof || {}),
          is_connected: true,
          token_valid: prof?.token_valid !== false,
        })

        if (snap.dashboard) {
          setDashboard(snap.dashboard)
          if (snap.dashboard.profile) {
            setProfile({
              ...snap.dashboard.profile,
              is_connected: true,
              token_valid: snap.dashboard.token_valid !== false,
            })
          }
        } else if (snap.analytics || (snap.media && snap.media.length > 0)) {
          // Fallback parcial se /dashboard falhou no snapshot
          setDashboard({
            profile: prof,
            analytics: snap.analytics,
            recent_media: snap.media || [],
            post_counts: null,
            conversations_count: 0,
            token_valid: prof?.token_valid !== false,
          })
        } else {
          setDashboard(null)
        }
      } else {
        setConnection(null)
        setProfile(null)
        setDashboard(null)
      }
    } catch {
      /* keep previous if any */
    }
    setLoading(false)
  }, [])

  const refreshProfile = useCallback(() => loadProfile({ force: true }), [loadProfile])

  // Um único load no mount / troca de marca (antes: 2 useEffects = 2 waterfalls)
  useEffect(() => {
    void loadProfile()
  }, [brandId, loadProfile])
  useEffect(() => { setTab(initialTab) }, [initialTab])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthSuccess = params.get('oauth_success')
    const oauthError = params.get('oauth_error')
    if (!oauthSuccess && !oauthError) return
    if (oauthSuccess) {
      const username = params.get('username')
      showToast(username ? `@${username} conectado via Instagram!` : 'Instagram conectado!', 'success')
      void refreshProfile()
    }
    if (oauthError) {
      showToast(decodeURIComponent(oauthError.replace(/\+/g, ' ')), 'error')
      setShowConnectModal(true)
    }
    const clean = window.location.pathname + window.location.hash
    window.history.replaceState({}, '', clean)
  }, [refreshProfile, showToast])

  useInstagramQueueAlerts(
    Boolean(connection),
    (post, kind) => {
      const snippet = (post.caption || 'Post').slice(0, 48)
      if (kind === 'failed') {
        showToast(`Falha ao publicar: ${snippet}`, 'error')
        void refreshProfile()
        setPostsRefreshToken(Date.now())
        return
      }
      showToast(`Post publicado: ${snippet}`, 'success')
      void refreshProfile()
    },
    90_000,
  )

  const isConnected = !!(
    connection
    || profile?.is_connected
    || profile?.username
  )

  if (loading) {
    return <PageSplash variant={embedded ? 'canvas' : 'page'} label="Instagram" />
  }

  // Só "desconectado" se não há connection E não há profile/username
  if (!isConnected) {
    return (
      <>
        <NotConnectedView embedded={embedded} onConnect={() => setShowConnectModal(true)} />
        {showConnectModal && (
          <ConnectModal onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); void refreshProfile() }} />
        )}
      </>
    )
  }

  const stats = {
    published: dashboard?.post_counts?.published_ig ?? profile?.media_count ?? 0,
    scheduled: dashboard?.post_counts?.scheduled ?? 0,
    drafts: dashboard?.post_counts?.drafts ?? 0,
    failed: dashboard?.post_counts?.failed ?? 0,
  }

  const handleReconnect = async () => {
    if (!confirm('Desconectar a conta atual e reconectar?')) return
    await api('/connection', { method: 'DELETE' })
    invalidateInstagramSnapshotCache()
    setConnection(null)
    setProfile(null)
    setDashboard(null)
    setShowConnectModal(true)
  }

  return (
    <>
      <InstagramStudioShell
        embedded={embedded}
        tab={tab}
        onTabChange={setTab}
        profile={{
          username: profile?.username,
          name: profile?.name,
          profile_picture_url: profile?.profile_picture_url,
          followers_count: profile?.followers_count,
          is_connected: isConnected,
        }}
        stats={stats}
        onRefresh={refreshProfile}
        onReconnect={handleReconnect}
      >
        {tab === 'overview' && (
          <InstagramOverviewTab
            profile={profile}
            dashboard={dashboard}
            onRefresh={refreshProfile}
            onNavigate={setTab}
          />
        )}
        {tab === 'create' && (
          <InstagramCreateTab
            profile={profile}
            brandId={brandId}
            analytics={dashboard?.analytics}
            editPostId={createNav?.editPostId}
            editToken={createNav?.token}
            schedulePrefill={createNav?.schedulePrefill}
            onNavigateToPosts={(filter) => {
              setPostsNav({ filter, token: Date.now() })
              setTab('posts')
            }}
            onEditCancel={() => setCreateNav(null)}
            onEditComplete={() => {
              setCreateNav(null)
              void refreshProfile()
            }}
          />
        )}
        {tab === 'posts' && (
          <PostsTab
            profile={profile}
            initialSource={postsNav ? 'local' : undefined}
            initialFilter={postsNav?.filter}
            navToken={postsNav?.token}
            refreshToken={postsRefreshToken}
            onOpenPost={setQueuePost}
            onEditPost={(id) => {
              setCreateNav({ editPostId: id, token: Date.now() })
              setQueuePost(null)
              setTab('create')
            }}
          />
        )}
        {tab === 'performance' && <PerformanceTab />}
        {tab === 'automations' && <InstagramAutomationsTab />}
        {tab === 'ai' && <InstagramAiTab profile={profile} conversationsCount={dashboard?.conversations_count ?? 0} />}
        {tab === 'calendar' && (
          <InstagramCalendarTab
            onOpenPost={setQueuePost}
            onCreateForDay={(scheduledAtLocal) => {
              setCreateNav({ schedulePrefill: scheduledAtLocal, token: Date.now() })
              setTab('create')
            }}
            onPostsChanged={() => {
              void refreshProfile()
              setPostsRefreshToken(Date.now())
            }}
          />
        )}
        {tab === 'messages' && <InstagramMessagesTab initialCount={dashboard?.conversations_count ?? 0} />}
      </InstagramStudioShell>

      {showConnectModal && (
        <ConnectModal onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); void refreshProfile() }} />
      )}

      <InstagramPostQueueSheet
        post={queuePost}
        open={Boolean(queuePost)}
        onClose={() => setQueuePost(null)}
        onEdit={(id) => {
          setCreateNav({ editPostId: id, token: Date.now() })
          setQueuePost(null)
          setTab('create')
        }}
        onRefresh={async () => {
          void refreshProfile()
          setPostsRefreshToken(Date.now())
          if (!queuePost?.id) return
          const res = await api(`/posts/${queuePost.id}`)
          if (res.success && res.post) setQueuePost(res.post)
          else setQueuePost(null)
        }}
      />
    </>
  )
}

/* ═══════════════════════════════════════════
   NOT CONNECTED VIEW — clean empty state
   ═══════════════════════════════════════════ */
function NotConnectedView({ onConnect, embedded = false }: { onConnect: () => void; embedded?: boolean }) {
  return (
    <div className={`max-w-md mx-auto text-center ${embedded ? 'py-8' : 'py-16'}`}>
      <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 grid place-items-center mb-6 shadow-lg shadow-purple-200/50">
        <InstagramIcon size={32} className="text-white" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Instagram</h1>
      <p className="text-sm text-gray-500 mb-8 leading-relaxed">
        Conecte uma conta Instagram Business para gerenciar posts, mensagens, metricas e automacoes em um so lugar.
      </p>
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white text-sm font-semibold hover:opacity-90 transition shadow-sm"
      >
        <InstagramIcon size={18} />
        Conectar Instagram
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════
   CONNECT MODAL — paste token to connect
   ═══════════════════════════════════════════ */
function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [mode, setMode] = useState<'oauth' | 'token'>('oauth')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const connectOAuth = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/meta/oauth/start', { headers: getInstagramHeaders() })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Não foi possível iniciar a conexão OAuth')
        setSaving(false)
        return
      }
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

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
              <InstagramIcon size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Conectar Instagram</h2>
              <p className="text-[11px] text-gray-400">
                {mode === 'oauth' ? 'Login oficial via Meta' : 'Token manual (avançado)'}
              </p>
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
              <div className="flex gap-1 bg-gray-50 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('oauth')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium ${mode === 'oauth' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >
                  Login oficial
                </button>
                <button
                  type="button"
                  onClick={() => setMode('token')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium ${mode === 'token' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >
                  Token manual
                </button>
              </div>

              {mode === 'oauth' ? (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">
                    Autorize com sua conta Instagram Business. Permissões de publicação, mensagens e métricas são solicitadas automaticamente.
                  </p>
                  <button
                    type="button"
                    onClick={() => void connectOAuth()}
                    disabled={saving}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <InstagramIcon size={16} />}
                    {saving ? 'Abrindo Instagram...' : 'Conectar com Instagram'}
                  </button>
                </div>
              ) : (
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
                    Obtido na plataforma Meta for Developers, na seção de tokens de acesso.
                  </p>
                </div>
              )}

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
            {mode === 'token' && (
              <button
                onClick={connect}
                disabled={saving || !token.trim()}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                {saving ? 'Validando...' : 'Conectar'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: POSTS
   ═══════════════════════════════════════════ */
function PostsTab({
  profile,
  initialSource,
  initialFilter,
  navToken,
  refreshToken,
  onOpenPost,
  onEditPost,
}: {
  profile: any
  initialSource?: 'instagram' | 'local'
  initialFilter?: string
  navToken?: number
  refreshToken?: number
  onOpenPost?: (post: any) => void
  onEditPost?: (postId: string) => void
}) {
  const [igMedia, setIgMedia] = useState<any[]>([])
  const [localPosts, setLocalPosts] = useState<any[]>([])
  const [totalLocal, setTotalLocal] = useState(0)
  const [source, setSource] = useState<'instagram' | 'local'>(initialSource || 'instagram')
  const [filter, setFilter] = useState(initialFilter || 'all')
  const [view, setView] = useState<'grid' | 'list' | 'large'>('grid')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState({ likes: 0, comments: 0 })
  const [analysisPostId, setAnalysisPostId] = useState<string | null>(null)
  const [analysisPreview, setAnalysisPreview] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [alertHistory, setAlertHistory] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [mediaRes, postsRes] = await Promise.all([
      api('/media?limit=50'),
      api('/posts?limit=50'),
    ])
    if (mediaRes.success) {
      const media = mediaRes.media || []
      setIgMedia(media)
      setSummary({
        likes: media.reduce((s: number, m: any) => s + Number(m.like_count || 0), 0),
        comments: media.reduce((s: number, m: any) => s + Number(m.comments_count || 0), 0),
      })
    }
    if (postsRes.success) {
      setLocalPosts(postsRes.posts || [])
      setTotalLocal(postsRes.total || 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load, refreshToken])

  useEffect(() => {
    if (source !== 'local') return
    api('/alerts/history?limit=8').then((res) => {
      if (res.success) setAlertHistory(res.history || [])
    }).catch(() => {})
  }, [source, refreshToken])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBulk = async (action: 'delete' | 'draft' | 'publish') => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (action === 'delete' && !confirm(`Excluir ${ids.length} post(s)?`)) return
    setBulkBusy(true)
    try {
      const res = await api('/posts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action, ids }),
      })
      if (res.success) {
        setSelectedIds(new Set())
        await load()
      }
    } finally {
      setBulkBusy(false)
    }
  }

  useEffect(() => {
    if (!navToken) return
    if (initialSource) setSource(initialSource)
    if (initialFilter) setFilter(initialFilter)
  }, [navToken, initialSource, initialFilter])

  const posts = source === 'instagram' ? igMedia : localPosts
  const filters = source === 'instagram'
    ? [{ key: 'all', label: 'Todos' }]
    : [
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
    ? posts.filter((p: any) => (p.caption || '').toLowerCase().includes(search.toLowerCase()))
    : (source === 'local' && filter !== 'all'
      ? posts.filter((p: any) => p.status === filter)
      : posts)

  const openAnalysis = (p: any) => {
    setAnalysisPostId(String(p.id))
    setAnalysisPreview(p)
  }

  const openLocalPost = (p: any) => {
    onOpenPost?.(p)
  }

  const renderGridTile = (p: any, size: 'grid' | 'large') => {
    const hasMedia = Boolean(p.media_url || p.thumbnail_url || p.media_items?.length)
    const inner = (
      <>
        {hasMedia ? (
          <PostMediaThumb post={p} className="ig-posts-tile__thumb" />
        ) : (
          <div className="ig-posts-tile__empty" />
        )}
        <div className="ig-posts-tile__overlay">
          {source === 'instagram' ? (
            <>
              <span className="flex items-center gap-1"><Heart size={12} /> {p.like_count ?? 0}</span>
              <span className="flex items-center gap-1"><MessageSquare size={12} /> {p.comments_count ?? 0}</span>
              <span className="ig-posts-tile__analyze"><BarChart3 size={12} /> Analisar</span>
            </>
          ) : (
            <>
              <span className={`ig-posts-tile__status ${statusColors[p.status] || ''}`}>
                {p.status === 'failed' && p.error_message ? 'falhou' : p.status}
              </span>
              {p.status === 'scheduled' && p.scheduled_at && (
                <span className="ig-posts-tile__time">
                  {new Date(p.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </>
          )}
        </div>
      </>
    )
    const cls = `ig-posts-tile${size === 'large' ? ' ig-posts-tile--large' : ''}`
    if (source === 'instagram') {
      return (
        <button key={p.id} type="button" className={cls} onClick={() => openAnalysis(p)} aria-label="Analisar post">
          {inner}
        </button>
      )
    }
    const selected = selectedIds.has(String(p.id))
    return (
      <div key={p.id} className={`ig-posts-tile-wrap${selected ? ' is-selected' : ''}`}>
        <input
          type="checkbox"
          className="ig-posts-tile__check"
          checked={selected}
          onChange={() => toggleSelect(String(p.id))}
          aria-label="Selecionar post"
        />
        <button
          type="button"
          className={cls}
          onClick={() => openLocalPost(p)}
          aria-label="Gerenciar post"
        >
          {inner}
        </button>
      </div>
    )
  }

  return (
    <div className="ig-posts-tab">
      <div className="ig-posts-tab__toolbar">
        <p className="ig-posts-tab__stats">
          {source === 'instagram'
            ? `@${profile?.username || 'conta'} · ${igMedia.length} publicados · ${fmtMetric(summary.likes)} curtidas · ${fmtMetric(summary.comments)} comentários`
            : `${totalLocal} itens na fila local`}
        </p>
        <div className="ig-posts-tab__actions">
          <div className="ig-posts-tab__search">
            <Search size={14} className="ig-posts-tab__search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar legendas…"
              className="ig-posts-tab__search-input"
            />
          </div>
          <div className="ig-posts-tab__view-toggle" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={view === 'grid' ? 'is-active' : ''}
              title="Grade padrão"
              aria-label="Grade padrão"
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={view === 'list' ? 'is-active' : ''}
              title="Lista"
              aria-label="Lista"
              aria-pressed={view === 'list'}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('large')}
              className={view === 'large' ? 'is-active' : ''}
              title="Grade ampla"
              aria-label="Grade ampla"
              aria-pressed={view === 'large'}
            >
              <Grid3X3 size={14} />
            </button>
          </div>
          <button type="button" onClick={load} className="ig-posts-tab__refresh" title="Atualizar" aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => { setSource('instagram'); setFilter('all') }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${source === 'instagram' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            No Instagram ({igMedia.length})
          </button>
          <button onClick={() => setSource('local')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${source === 'local' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            Fila local ({totalLocal})
          </button>
        </div>
        {source === 'local' && filters.map(f => {
          const count = f.key === 'all' ? totalLocal : localPosts.filter((p: any) => p.status === f.key).length
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

      {source === 'local' && selectedIds.size > 0 && (
        <div className="ig-posts-bulk">
          <span>{selectedIds.size} selecionado(s)</span>
          <button type="button" disabled={bulkBusy} onClick={() => void runBulk('publish')}>Publicar</button>
          <button type="button" disabled={bulkBusy} onClick={() => void runBulk('draft')}>Rascunho</button>
          <button type="button" disabled={bulkBusy} onClick={() => void runBulk('delete')}>Excluir</button>
          <button type="button" onClick={() => setSelectedIds(new Set())}>Limpar</button>
        </div>
      )}

      {source === 'local' && alertHistory.length > 0 && (
        <div className="ig-posts-alerts">
          <p className="ig-posts-alerts__title">Historico de alertas recentes</p>
          <ul>
            {alertHistory.slice(0, 5).map((a: any) => (
              <li key={a.id}>
                <span>{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                <span>{a.channel === 'whatsapp' ? 'WhatsApp' : 'App'}</span>
                <span className="truncate">{(a.caption || a.message || '').slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Nenhum post encontrado</p>
      ) : view === 'list' ? (
        <div className="ig-posts-list">
          {filtered.map((p: any) => (
            <div key={p.id} className={`ig-posts-list__row${source === 'instagram' ? ' ig-posts-list__row--clickable' : ''}`}>
              {source === 'instagram' ? (
                <button type="button" className="ig-posts-list__main" onClick={() => openAnalysis(p)} aria-label="Analisar post">
                  <div className="ig-posts-list__thumb">
                    {(p.media_url || p.thumbnail_url || p.media_items?.length) ? (
                      <PostMediaThumb post={p} className="ig-posts-list__thumb-inner" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><Image size={10} /> {p.media_type || 'IMAGE'}</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><Heart size={10} /> {p.like_count || 0}</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><MessageSquare size={10} /> {p.comments_count || 0}</span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">{p.caption || '(sem legenda)'}</p>
                  </div>
                  <BarChart3 size={14} className="text-gray-400 shrink-0" />
                </button>
              ) : (
                <button type="button" className="ig-posts-list__main flex-1" onClick={() => openLocalPost(p)}>
                  <div className="ig-posts-list__thumb">
                    {(p.media_url || p.thumbnail_url || p.media_items?.length) ? (
                      <PostMediaThumb post={p} className="ig-posts-list__thumb-inner" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><Image size={10} /> {p.media_type || 'IMAGE'}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColors[p.status] || 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                    </div>
                    <p className="text-xs text-gray-700 truncate">{p.caption || '(sem legenda)'}</p>
                    {p.status === 'failed' && p.error_message && (
                      <p className="text-[10px] text-red-500 truncate mt-0.5">{p.error_message}</p>
                    )}
                  </div>
                </button>
              )}
              {source === 'local' && (
                <button type="button" onClick={() => onEditPost?.(String(p.id))}
                  className="p-1.5 rounded-lg hover:bg-purple-50 shrink-0" aria-label="Editar" title="Editar">
                  <Pencil size={12} className="text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={`ig-posts-grid${view === 'large' ? ' ig-posts-grid--large' : ''}`}>
          {filtered.map((p: any) => renderGridTile(p, view))}
        </div>
      )}

      <InstagramPostAnalysisModal
        open={Boolean(analysisPostId)}
        mediaId={analysisPostId}
        preview={analysisPreview || undefined}
        onClose={() => { setAnalysisPostId(null); setAnalysisPreview(null) }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════
   TAB: PERFORMANCE
   ═══════════════════════════════════════════ */
function PerformanceTab() {
  const [period, setPeriod] = useState(30)
  const [metrics, setMetrics] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mr, ar] = await Promise.all([
        api(`/metrics?days=${period}`),
        api(`/analytics?days=${period}`),
      ])
      if (mr.success) setMetrics(mr.metrics || [])
      if (ar.success) setAnalytics(ar.analytics || null)
    } catch {}
    setLoading(false)
  }, [period])

  useEffect(() => { void load() }, [load])

  const last = metrics[metrics.length - 1]
  const first = metrics[0]
  const followersDelta = last && first ? (last.followers_count || 0) - (first.followers_count || 0) : 0
  const profile = analytics?.profile
  const account = analytics?.account
  const mediaSummary = analytics?.media_summary

  const snapshot = async () => {
    await api('/snapshot', { method: 'POST' })
    await load()
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
          <p className="text-2xl font-bold text-gray-900">{mediaSummary?.engagement_rate?.toFixed(2) || '0.00'}%</p>
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
          { label: 'Visualizacoes', value: fmtMetric(account?.views), icon: Eye },
          { label: 'Alcance Total', value: fmtMetric(account?.reach), icon: TrendingUp },
          { label: 'Curtidas (API)', value: fmtMetric(account?.likes || mediaSummary?.total_likes), icon: Heart },
          { label: 'Comentarios (API)', value: fmtMetric(account?.comments || mediaSummary?.total_comments), icon: MessageCircle },
          { label: 'Salvos', value: fmtMetric(account?.saves), icon: Bookmark },
          { label: 'Engajamento Medio', value: `${mediaSummary?.engagement_rate?.toFixed(1) || '0.0'}%`, icon: BarChart3 },
          { label: 'Interacoes Totais', value: fmtMetric(account?.total_interactions), icon: CalendarDays },
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
          <h3 className="text-sm font-bold text-gray-900 mb-1">Visualizacoes e alcance</h3>
          <p className="text-[10px] text-gray-400 mb-3">Snapshots diarios · {period} dias</p>
          {metrics.some((m: any) => (m.impressions || m.reach || m.reach_count)) ? (
            <div className="h-40 flex items-end gap-1">
              {metrics.map((m: any, i: number) => {
                const views = m.impressions || 0
                const reach = m.reach || m.reach_count || 0
                const max = Math.max(...metrics.map((x: any) => Math.max(x.impressions || 0, x.reach || x.reach_count || 0, 1)))
                const hViews = (views / max) * 100
                const hReach = (reach / max) * 100
                return (
                  <div key={i} className="flex-1 flex gap-0.5 items-end h-full" title={`${m.date}: ${views} views, ${reach} alcance`}>
                    <div className="flex-1 bg-pink-200 rounded-t" style={{ height: `${Math.max(hViews, 2)}%` }} />
                    <div className="flex-1 bg-purple-300 rounded-t" style={{ height: `${Math.max(hReach, 2)}%` }} />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-8 text-center">
              Periodo atual: {fmtMetric(account?.views)} views · {fmtMetric(account?.reach)} alcance. Clique em Snapshot para historico.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}







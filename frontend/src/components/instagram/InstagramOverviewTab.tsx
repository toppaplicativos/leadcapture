import { useEffect, useState } from 'react'
import {
  Eye, TrendingUp, Users, Heart, MessageCircle, CalendarDays, FileText,
  Sparkles, LayoutGrid, BarChart3, Zap, Bot, Plus, Loader2,
  ChevronRight, ExternalLink,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { instagramApi, fmtIgMetric } from '@/lib/instagram/pageApi'
import type { InstagramTabKey } from '@/lib/instagram/nav'
import { InstagramPostAnalysisModal } from '@/components/instagram/InstagramPostAnalysisModal'

type Props = {
  profile: any
  dashboard: any
  onRefresh: () => void
  onNavigate: (tab: InstagramTabKey) => void
}

const QUICK_MODULES: Array<{
  tab: InstagramTabKey
  label: string
  sub: string
  icon: typeof Sparkles
  accent: string
}> = [
  { tab: 'create', label: 'Criar post', sub: 'IA + publicar', icon: Sparkles, accent: 'rose' },
  { tab: 'posts', label: 'Posts', sub: 'Feed e fila', icon: LayoutGrid, accent: 'violet' },
  { tab: 'messages', label: 'Mensagens', sub: 'Direct', icon: MessageCircle, accent: 'emerald' },
  { tab: 'automations', label: 'Automações', sub: 'Webhooks', icon: Zap, accent: 'amber' },
  { tab: 'performance', label: 'Performance', sub: '7–90 dias', icon: BarChart3, accent: 'sky' },
  { tab: 'ai', label: 'Atendimento IA', sub: 'Persona', icon: Bot, accent: 'indigo' },
]

export function InstagramOverviewTab({ profile, dashboard, onRefresh, onNavigate }: Props) {
  const [media, setMedia] = useState<any[]>(dashboard?.recent_media || [])
  const [analytics, setAnalytics] = useState<any>(dashboard?.analytics || null)
  const [postCounts, setPostCounts] = useState<any>(dashboard?.post_counts || null)
  const [conversationsCount, setConversationsCount] = useState(dashboard?.conversations_count ?? 0)
  const [loading, setLoading] = useState(!dashboard)
  const [snapping, setSnapping] = useState(false)
  const [analysisPostId, setAnalysisPostId] = useState<string | null>(null)
  const [analysisPreview, setAnalysisPreview] = useState<any>(null)

  useEffect(() => {
    if (dashboard) {
      setMedia(dashboard.recent_media || [])
      setAnalytics(dashboard.analytics || null)
      setPostCounts(dashboard.post_counts || null)
      setConversationsCount(dashboard.conversations_count ?? 0)
      setLoading(false)
      return
    }
    setLoading(true)
    instagramApi('/dashboard').then((res) => {
      if (res.success && res.dashboard) {
        setMedia(res.dashboard.recent_media || [])
        setAnalytics(res.dashboard.analytics || null)
        setPostCounts(res.dashboard.post_counts || null)
        setConversationsCount(res.dashboard.conversations_count ?? 0)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dashboard])

  const snapshot = async () => {
    setSnapping(true)
    await instagramApi('/snapshot', { method: 'POST' })
    onRefresh()
    setSnapping(false)
  }

  const engagement = analytics?.media_summary?.engagement_rate
  const metrics = [
    { label: 'Visualizações', value: loading ? '…' : fmtIgMetric(analytics?.account?.views), icon: Eye },
    { label: 'Alcance 7d', value: loading ? '…' : fmtIgMetric(analytics?.account?.reach), icon: TrendingUp },
    { label: 'Visitas perfil', value: loading ? '…' : fmtIgMetric(analytics?.account?.profile_views), icon: Users },
    { label: 'Engajamento', value: loading ? '…' : `${Number(engagement || 0).toFixed(2)}%`, icon: Heart },
  ]

  const activity = [
    { label: 'Mensagens', count: conversationsCount, tab: 'messages' as InstagramTabKey, icon: MessageCircle },
    { label: 'Curtidas', count: analytics?.media_summary?.total_likes ?? 0, tab: 'performance' as InstagramTabKey, icon: Heart },
    { label: 'Agendados', count: postCounts?.scheduled ?? 0, tab: 'calendar' as InstagramTabKey, icon: CalendarDays },
    { label: 'Rascunhos', count: postCounts?.drafts ?? 0, tab: 'posts' as InstagramTabKey, icon: FileText },
  ]

  return (
    <div className="ig-overview">
      <section className="ig-overview__hero">
        <div className="ig-overview__hero-main">
          <p className="ig-overview__bio">{profile?.biography || profile?.name || 'Conta conectada'}</p>
          <div className="ig-overview__hero-stats">
            <div>
              <span className="ig-overview__hero-val tabular-nums">{(profile?.followers_count || 0).toLocaleString('pt-BR')}</span>
              <span className="ig-overview__hero-lbl">seguidores</span>
            </div>
            <div>
              <span className="ig-overview__hero-val tabular-nums">{(profile?.media_count || 0).toLocaleString('pt-BR')}</span>
              <span className="ig-overview__hero-lbl">posts</span>
            </div>
            <div>
              <span className="ig-overview__hero-val tabular-nums">{(profile?.follows_count || 0).toLocaleString('pt-BR')}</span>
              <span className="ig-overview__hero-lbl">seguindo</span>
            </div>
          </div>
        </div>
        <div className="ig-overview__hero-actions">
          <button type="button" className="ig-overview__btn ig-overview__btn--ghost" onClick={() => void snapshot()} disabled={snapping}>
            {snapping ? <Loader2 size={14} className="animate-spin" /> : <InstagramIcon size={14} />}
            Atualizar métricas
          </button>
          <button type="button" className="ig-overview__btn ig-overview__btn--primary" onClick={() => onNavigate('create')}>
            <Plus size={14} />
            Novo post
          </button>
        </div>
      </section>

      <section className="ig-overview__metrics" aria-label="Métricas dos últimos 7 dias">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.label} className="ig-overview__metric">
              <div className="ig-overview__metric-top">
                <span className="ig-overview__metric-lbl">{m.label}</span>
                <Icon size={14} className="ig-overview__metric-icon" />
              </div>
              <p className="ig-overview__metric-val tabular-nums">{m.value}</p>
            </div>
          )
        })}
      </section>

      <section className="ig-overview__modules">
        <div className="ig-overview__section-head">
          <h3 className="ig-overview__section-title">Módulos</h3>
          <p className="ig-overview__section-sub">Acesso rápido às áreas do Instagram</p>
        </div>
        <div className="ig-overview__module-grid">
          {QUICK_MODULES.map((mod) => {
            const Icon = mod.icon
            return (
              <button
                key={mod.tab}
                type="button"
                className={`ig-overview__module ig-overview__module--${mod.accent}`}
                onClick={() => onNavigate(mod.tab)}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="ig-overview__module-label">{mod.label}</span>
                <span className="ig-overview__module-sub">{mod.sub}</span>
                <ChevronRight size={14} className="ig-overview__module-chevron" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="ig-overview__split">
        <section className="ig-overview__posts">
          <div className="ig-overview__section-head ig-overview__section-head--row">
            <div>
              <h3 className="ig-overview__section-title">Posts recentes</h3>
              <p className="ig-overview__section-sub">{media.length} publicações carregadas</p>
            </div>
            <button type="button" className="ig-overview__link" onClick={() => onNavigate('posts')}>
              Ver todos
            </button>
          </div>
          {loading ? (
            <div className="ig-overview__posts-loading"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
          ) : media.length === 0 ? (
            <p className="ig-overview__empty">Nenhum post na conta ainda.</p>
          ) : (
            <div className="ig-overview__posts-strip">
              {media.slice(0, 8).map((m: any) => (
                <button
                  key={m.id}
                  type="button"
                  className="ig-overview__post-tile"
                  onClick={() => { setAnalysisPostId(String(m.id)); setAnalysisPreview(m) }}
                  aria-label="Analisar post"
                >
                  <img src={m.thumbnail_url || m.media_url} alt="" loading="lazy" />
                  <span className="ig-overview__post-overlay">
                    <Heart size={11} /> {m.like_count || 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ig-overview__activity">
          <h3 className="ig-overview__section-title">Atividade</h3>
          <ul className="ig-overview__activity-list">
            {activity.map((a) => {
              const Icon = a.icon
              return (
                <li key={a.label}>
                  <button type="button" className="ig-overview__activity-row" onClick={() => onNavigate(a.tab)}>
                    <Icon size={15} className="ig-overview__activity-icon" />
                    <span className="ig-overview__activity-label">{a.label}</span>
                    <span className={`ig-overview__activity-count tabular-nums${a.count > 0 ? ' has-value' : ''}`}>
                      {a.count}
                    </span>
                    <ChevronRight size={14} className="ig-overview__activity-chevron" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="ig-overview__token">
            <span>Conexão com o Instagram</span>
            <span className="ig-overview__token-ok">
              <span className="ig-studio__status is-on" aria-hidden /> Válido
            </span>
          </div>
        </section>
      </div>
      <InstagramPostAnalysisModal
        open={Boolean(analysisPostId)}
        mediaId={analysisPostId}
        preview={analysisPreview || undefined}
        onClose={() => { setAnalysisPostId(null); setAnalysisPreview(null) }}
      />
    </div>
  )
}

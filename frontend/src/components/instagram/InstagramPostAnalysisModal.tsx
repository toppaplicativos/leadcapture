import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, ExternalLink, Loader2, RefreshCw, Camera, Heart, MessageSquare,
  Eye, TrendingUp, Bookmark, Share2, Users, BarChart3, Sparkles, AlertCircle,
} from 'lucide-react'
import { instagramApi, fmtIgMetric } from '@/lib/instagram/pageApi'

type Analysis = {
  media: {
    id: string
    caption?: string
    media_type: string
    media_url?: string
    thumbnail_url?: string
    permalink?: string
    timestamp?: string
    like_count?: number
    comments_count?: number
  }
  insights: Record<string, number | undefined>
  insights_error?: string
  computed: {
    engagement_rate: number
    reach_rate: number
    view_rate: number
    save_rate: number
    comment_rate: number
    interaction_rate: number
    performance_label: 'excelente' | 'bom' | 'medio' | 'baixo'
    strategic_notes: string[]
  }
  account_context: { followers_count: number; username?: string }
  snapshots_count: number
  fetched_at: string
}

type HistoryRow = {
  id: string
  captured_at: string
  metrics?: string | Record<string, number>
  computed?: string | { engagement_rate?: number }
}

type Props = {
  open: boolean
  mediaId: string | null
  preview?: { thumbnail_url?: string; media_url?: string; caption?: string; media_type?: string; permalink?: string }
  onClose: () => void
}

const PERF_LABELS: Record<string, string> = {
  excelente: 'Excelente',
  bom: 'Bom',
  medio: 'Médio',
  baixo: 'Baixo',
}

function fmtDate(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(ms?: number) {
  if (!ms || ms <= 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

function parseJsonField<T>(raw?: string | T): T | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return null
  }
}

export function InstagramPostAnalysisModal({ open, mediaId, preview, onClose }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    if (!mediaId) return
    setLoading(true)
    try {
      const res = await instagramApi(`/media/${mediaId}/analysis`)
      if (res.success && res.analysis) {
        setAnalysis(res.analysis)
        setHistory(res.history || [])
      }
    } catch {
      /* ignore */
    }
    setLoading(false)
  }, [mediaId])

  useEffect(() => {
    if (!open || !mediaId) return
    void load()
  }, [open, mediaId, load])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const saveSnapshot = async () => {
    if (!mediaId) return
    setSaving(true)
    try {
      const res = await instagramApi(`/media/${mediaId}/snapshot`, { method: 'POST' })
      if (res.success) {
        setToast('Snapshot salvo para análise futura')
        await load()
      } else {
        setToast(res.error || 'Erro ao salvar')
      }
    } catch {
      setToast('Erro ao salvar snapshot')
    }
    setSaving(false)
    setTimeout(() => setToast(''), 2800)
  }

  if (!open || !mediaId) return null

  const media = analysis?.media
  const ins = analysis?.insights || {}
  const comp = analysis?.computed
  const thumb = media?.thumbnail_url || media?.media_url || preview?.thumbnail_url || preview?.media_url
  const permalink = media?.permalink || preview?.permalink

  const primaryMetrics = [
    { key: 'views', label: 'Visualizações', icon: Eye, value: ins.views },
    { key: 'reach', label: 'Alcance', icon: TrendingUp, value: ins.reach },
    { key: 'likes', label: 'Curtidas', icon: Heart, value: ins.likes ?? media?.like_count },
    { key: 'comments', label: 'Comentários', icon: MessageSquare, value: ins.comments ?? media?.comments_count },
  ]

  const secondaryMetrics = [
    { key: 'saved', label: 'Salvos', icon: Bookmark, value: ins.saved },
    { key: 'shares', label: 'Compartilhamentos', icon: Share2, value: ins.shares },
    { key: 'total_interactions', label: 'Interações', icon: BarChart3, value: ins.total_interactions },
    { key: 'profile_visits', label: 'Visitas ao perfil', icon: Users, value: ins.profile_visits },
    { key: 'follows', label: 'Novos seguidores', icon: Users, value: ins.follows },
    { key: 'profile_activity', label: 'Atividade no perfil', icon: Sparkles, value: ins.profile_activity },
    { key: 'reposts', label: 'Reposts', icon: Share2, value: ins.reposts },
  ].filter((m) => m.value != null && Number(m.value) > 0)

  const reelMetrics = [
    { label: 'Tempo médio assistido', value: fmtDuration(ins.ig_reels_avg_watch_time as number | undefined) },
    { label: 'Tempo total de reprodução', value: fmtDuration(ins.ig_reels_video_view_total_time as number | undefined) },
    { label: 'Taxa de skip (3s)', value: ins.reels_skip_rate != null ? `${Number(ins.reels_skip_rate).toFixed(1)}%` : '—' },
  ]

  const rateMetrics = comp ? [
    { label: 'Engajamento / seguidores', value: `${comp.engagement_rate}%` },
    { label: 'Alcance / seguidores', value: `${comp.reach_rate}%` },
    { label: 'Views / seguidores', value: `${comp.view_rate}%` },
    { label: 'Salvos / alcance', value: `${comp.save_rate}%` },
    { label: 'Comentários / alcance', value: `${comp.comment_rate}%` },
    { label: 'Interações / alcance', value: `${comp.interaction_rate}%` },
  ] : []

  return createPortal(
    <div className="ig-post-analysis-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ig-post-analysis"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ig-post-analysis-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ig-post-analysis__head">
          <div className="min-w-0">
            <p className="ig-post-analysis__eyebrow">Análise do post</p>
            <h2 id="ig-post-analysis-title" className="ig-post-analysis__title">
              {media?.media_type || preview?.media_type || 'Post'}
              {analysis?.account_context?.username ? ` · @${analysis.account_context.username}` : ''}
            </h2>
            <p className="ig-post-analysis__sub">
              {fmtDate(media?.timestamp)}
              {analysis?.fetched_at ? ` · atualizado ${fmtDate(analysis.fetched_at)}` : ''}
            </p>
          </div>
          <div className="ig-post-analysis__head-actions">
            <button type="button" className="ig-post-analysis__icon-btn" onClick={() => void load()} title="Atualizar" aria-label="Atualizar">
              <RefreshCw size={15} />
            </button>
            <button type="button" className="ig-post-analysis__icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="ig-post-analysis__loading">
            <Loader2 size={22} className="animate-spin text-gray-400" />
            <p>Carregando métricas da API…</p>
          </div>
        ) : (
          <div className="ig-post-analysis__body">
            <div className="ig-post-analysis__hero">
              <div className="ig-post-analysis__media">
                {thumb ? <img src={thumb} alt="" /> : <div className="ig-post-analysis__media-fallback" />}
              </div>
              <div className="ig-post-analysis__hero-meta">
                {comp && (
                  <span className={`ig-post-analysis__perf ig-post-analysis__perf--${comp.performance_label}`}>
                    {PERF_LABELS[comp.performance_label]}
                  </span>
                )}
                <p className="ig-post-analysis__caption">{media?.caption || preview?.caption || '(sem legenda)'}</p>
                <div className="ig-post-analysis__hero-actions">
                  {permalink && (
                    <a href={permalink} target="_blank" rel="noreferrer" className="ig-post-analysis__link-btn">
                      <ExternalLink size={14} /> Ver no Instagram
                    </a>
                  )}
                  <button type="button" className="ig-post-analysis__snap-btn" onClick={() => void saveSnapshot()} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    Salvar snapshot ({analysis?.snapshots_count ?? 0})
                  </button>
                </div>
                {toast && <p className="ig-post-analysis__toast">{toast}</p>}
              </div>
            </div>

            {analysis?.insights_error && (
              <div className="ig-post-analysis__notice">
                <AlertCircle size={14} />
                <span>
                  Insights parciais: {analysis.insights_error}. Métricas básicas (curtidas/comentários) ainda disponíveis.
                </span>
              </div>
            )}

            <section className="ig-post-analysis__section">
              <h3>Métricas principais</h3>
              <div className="ig-post-analysis__metric-grid ig-post-analysis__metric-grid--4">
                {primaryMetrics.map((m) => {
                  const Icon = m.icon
                  return (
                    <div key={m.key} className="ig-post-analysis__metric">
                      <div className="ig-post-analysis__metric-top">
                        <span>{m.label}</span>
                        <Icon size={14} />
                      </div>
                      <p className="ig-post-analysis__metric-val tabular-nums">{fmtIgMetric(Number(m.value || 0))}</p>
                    </div>
                  )
                })}
              </div>
            </section>

            {secondaryMetrics.length > 0 && (
              <section className="ig-post-analysis__section">
                <h3>Engajamento avançado</h3>
                <div className="ig-post-analysis__metric-grid">
                  {secondaryMetrics.map((m) => {
                    const Icon = m.icon
                    return (
                      <div key={m.key} className="ig-post-analysis__metric ig-post-analysis__metric--soft">
                        <div className="ig-post-analysis__metric-top">
                          <span>{m.label}</span>
                          <Icon size={14} />
                        </div>
                        <p className="ig-post-analysis__metric-val tabular-nums">{fmtIgMetric(Number(m.value || 0))}</p>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {(media?.media_type === 'REELS' || preview?.media_type === 'REELS') && (
              <section className="ig-post-analysis__section">
                <h3>Reels</h3>
                <div className="ig-post-analysis__rates">
                  {reelMetrics.map((r) => (
                    <div key={r.label} className="ig-post-analysis__rate">
                      <span>{r.label}</span>
                      <strong className="tabular-nums">{r.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {rateMetrics.length > 0 && (
              <section className="ig-post-analysis__section">
                <h3>Taxas estratégicas</h3>
                <p className="ig-post-analysis__section-sub">
                  Base: {fmtIgMetric(analysis?.account_context.followers_count)} seguidores
                </p>
                <div className="ig-post-analysis__rates">
                  {rateMetrics.map((r) => (
                    <div key={r.label} className="ig-post-analysis__rate">
                      <span>{r.label}</span>
                      <strong className="tabular-nums">{r.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {comp && comp.strategic_notes.length > 0 && (
              <section className="ig-post-analysis__section ig-post-analysis__section--notes">
                <h3>Leitura estratégica</h3>
                <ul className="ig-post-analysis__notes">
                  {comp.strategic_notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            )}

            {history.length > 0 && (
              <section className="ig-post-analysis__section">
                <h3>Histórico de snapshots</h3>
                <ul className="ig-post-analysis__history">
                  {history.map((row) => {
                    const metrics = parseJsonField<Record<string, number>>(row.metrics)
                    const computed = parseJsonField<{ engagement_rate?: number }>(row.computed)
                    return (
                      <li key={row.id} className="ig-post-analysis__history-row">
                        <span>{fmtDate(row.captured_at)}</span>
                        <span className="tabular-nums">
                          {metrics?.reach != null ? `${fmtIgMetric(metrics.reach)} alcance` : '—'}
                        </span>
                        <span className="tabular-nums">
                          {computed?.engagement_rate != null ? `${computed.engagement_rate}% eng.` : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Users, Image, MessageCircle,
  ChevronRight, ExternalLink, Plus,
} from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import { fetchInstagramSnapshot, invalidateInstagramSnapshotCache, type InstagramTab } from '@/lib/instagram/client'
import { PageSplash } from '@/components/PageSplash'
import { useInstagramBridgeOptional } from '@/lib/agent/InstagramBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'
import { InstagramPostAnalysisModal } from '@/components/instagram/InstagramPostAnalysisModal'

const InstagramManager = lazy(() =>
  import('@/pages/InstagramPage').then((m) => ({ default: m.InstagramPage })),
)

const TAB_CHIPS: { tab: InstagramTab; label: string }[] = [
  { tab: 'posts', label: 'Posts' },
  { tab: 'create', label: 'Criar' },
  { tab: 'messages', label: 'DMs' },
  { tab: 'calendar', label: 'Calendário' },
]

export function InstagramInlinePanel() {
  const bridge = useInstagramBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const [media, setMedia] = useState<Array<{ id: string; media_url?: string; thumbnail_url?: string; permalink?: string }>>([])
  const [reach7d, setReach7d] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<InstagramTab>('overview')
  const [analysisPostId, setAnalysisPostId] = useState<string | null>(null)
  const [analysisPreview, setAnalysisPreview] = useState<typeof media[number] | null>(null)
  const brandId = typeof window !== 'undefined'
    ? (localStorage.getItem('lead-system:active-brand-id') || '')
    : ''
  const lastBrandRef = useRef<string>('')

  const load = useCallback(async (force = false) => {
    setLoading(true)
    publishSnapshot?.({ loading: true })
    try {
      if (force) invalidateInstagramSnapshotCache()
      const data = await fetchInstagramSnapshot(force ? { force: true } : undefined)
      setMedia(data.media || [])
      setReach7d(data.analytics?.account?.reach ?? null)
      const username = data.profile?.username
        || data.connection?.username
        || ''
      publishSnapshot?.({
        connected: !!data.connected,
        username,
        name: data.profile?.name || data.connection?.name || '',
        followers: Number(data.profile?.followers_count || data.connection?.followers_count || 0),
        following: Number(data.profile?.follows_count || data.connection?.follows_count || 0),
        mediaCount: Number(data.profile?.media_count || data.connection?.media_count || 0),
        avatarUrl: data.profile?.profile_picture_url
          || data.connection?.profile_picture_url
          || '',
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false, connected: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  // Sempre recarrega ao montar e ao trocar de marca
  useEffect(() => {
    if (lastBrandRef.current && lastBrandRef.current !== brandId) {
      setMedia([])
      setReach7d(null)
    }
    lastBrandRef.current = brandId
    void load()
  }, [brandId, load])

  const openManager = useCallback((tab: InstagramTab = 'overview') => {
    setManagerTab(tab)
    publishSnapshot?.({ activeTab: tab })
    setModuleExpanded?.(true)
    if (isDesktop) {
      openCanvas('/instagram')
    } else {
      setManagerOpen(true)
    }
  }, [isDesktop, openCanvas, publishSnapshot, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers) return
    return registerHandlers({
      openFull: () => openManager(snap?.activeTab || 'overview'),
      refresh: () => { void load(true) },
      setTab: (tab) => openManager(tab),
      connect: () => openManager('overview'),
    })
  }, [registerHandlers, openManager, load, snap?.activeTab])

  // Enquanto carrega, nunca mostre "desconectado" (evita flash falso)
  if (loading || snap?.loading) {
    return (
      <PageSplash variant="panel" label="Instagram" />
    )
  }

  if (!snap?.connected) {
    return (
      <div className="catalog-panel catalog-panel--instagram">
        <div className="catalog-instagram-connect">
          <InstagramIcon size={20} className="text-rose-500" />
          <p className="catalog-instagram-connect__title">Conta não conectada nesta marca</p>
          <p className="catalog-instagram-connect__desc">
            Confirme a marca <b>Alho Pronto</b> no topo (não CE). Se o token já existia e ainda falhar,
            atualize a página após o backend reiniciar — status de conexão não deve mais ser bloqueado pelo plano.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button type="button" className="catalog-panel__action catalog-panel__action--instagram" onClick={() => openManager('overview')}>
              Conectar Instagram
            </button>
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => void load()}>
              Atualizar status
            </button>
          </div>
        </div>
        {!isDesktop && (
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Instagram"
            subtitle="Conectar e gerenciar conta"
          >
            <Suspense fallback={<PageSplash variant="panel" label="Instagram" />}>
              <InstagramManager embedded initialTab="overview" />
            </Suspense>
          </CatalogManagerSheet>
        )}
      </div>
    )
  }

  const activeTab = snap.activeTab

  return (
    <div className="catalog-panel catalog-panel--instagram">
      <div className="catalog-instagram-profile">
        <div className="catalog-instagram-profile__avatar">
          {snap.avatarUrl ? (
            <img src={snap.avatarUrl} alt="" />
          ) : (
            <InstagramIcon size={16} className="text-rose-400" />
          )}
        </div>
        <div className="catalog-instagram-profile__meta">
          <p className="catalog-instagram-profile__user">@{snap.username}</p>
          <p className="catalog-instagram-profile__name">{snap.name || 'Conta conectada'}</p>
        </div>
        <span className="catalog-instagram-profile__dot" aria-hidden />
      </div>

      <div className="catalog-instagram-kpi-grid">
        <div className="catalog-instagram-kpi">
          <Users size={12} className="text-gray-400" />
          <p className="catalog-instagram-kpi__value tabular-nums">{snap.followers.toLocaleString('pt-BR')}</p>
          <span className="catalog-instagram-kpi__label">Seguidores</span>
        </div>
        <div className="catalog-instagram-kpi">
          <Image size={12} className="text-gray-400" />
          <p className="catalog-instagram-kpi__value tabular-nums">{snap.mediaCount.toLocaleString('pt-BR')}</p>
          <span className="catalog-instagram-kpi__label">Posts</span>
        </div>
        <div className="catalog-instagram-kpi">
          <MessageCircle size={12} className="text-gray-400" />
          <p className="catalog-instagram-kpi__value tabular-nums">{reach7d != null ? reach7d.toLocaleString('pt-BR') : '—'}</p>
          <span className="catalog-instagram-kpi__label">Alcance 7d</span>
        </div>
      </div>

      {media.length > 0 && (
        <div className="catalog-instagram-media-strip">
          {media.slice(0, 4).map((m) => (
            <button
              key={m.id}
              type="button"
              className="catalog-instagram-media-tile"
              onClick={() => { setAnalysisPostId(m.id); setAnalysisPreview(m) }}
              aria-label="Analisar post"
            >
              <img src={m.thumbnail_url || m.media_url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="catalog-panel__filters">
        {TAB_CHIPS.map((chip) => (
          <button
            key={chip.tab}
            type="button"
            className={`catalog-panel__filter-chip catalog-panel__filter-chip--instagram${activeTab === chip.tab ? ' is-active' : ''}`}
            onClick={() => openManager(chip.tab)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {isDesktop ? (
        <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('create')}>
          <Plus size={12} />
          Novo post no canvas
          <ChevronRight size={13} />
        </button>
      ) : (
        <>
          <div className="catalog-panel__toolbar catalog-panel__toolbar--tight">
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => openManager('create')}>
              <Plus size={14} /> Novo post
            </button>
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => openManager('overview')}>
              <ExternalLink size={14} /> Studio completo
            </button>
          </div>
          <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('overview')}>
            Abrir Instagram completo
            <ChevronRight size={13} />
          </button>
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Instagram"
            subtitle={snap.username ? `@${snap.username}` : 'Gerenciar conta'}
          >
            <Suspense fallback={<PageSplash variant="panel" label="Instagram" />}>
              <InstagramManager embedded initialTab={managerTab} />
            </Suspense>
          </CatalogManagerSheet>
        </>
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
import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Users, ThumbsUp, Image,
  ChevronRight, ExternalLink, Plus,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons'
import { fetchFacebookSnapshot, type FacebookTab } from '@/lib/facebook/client'
import { PageSplash } from '@/components/PageSplash'
import { useFacebookBridgeOptional } from '@/lib/agent/FacebookBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const FacebookManager = lazy(() =>
  import('@/pages/FacebookPage').then((m) => ({ default: m.FacebookPage })),
)

const TAB_CHIPS: { tab: FacebookTab; label: string }[] = [
  { tab: 'posts', label: 'Posts' },
  { tab: 'create', label: 'Criar' },
  { tab: 'messages', label: 'Mensagens' },
  { tab: 'calendar', label: 'Calendário' },
]

export function FacebookInlinePanel() {
  const bridge = useFacebookBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const [feed, setFeed] = useState<Array<{ id: string; message?: string; full_picture?: string; permalink_url?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<FacebookTab>('overview')
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchFacebookSnapshot()
      setFeed(data.feed || [])
      publishSnapshot?.({
        connected: data.connected,
        pageName: data.profile?.page_name || data.profile?.name || '',
        category: data.profile?.page_category || data.profile?.category || '',
        fans: Number(data.profile?.fan_count || 0),
        followers: Number(data.profile?.followers_count || 0),
        postsCount: Number(data.profile?.posts_count || data.feed?.length || 0),
        avatarUrl: data.profile?.page_picture_url || data.profile?.picture_url || '',
        loading: false,
      })
    } catch {
      publishSnapshot?.({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [publishSnapshot])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openManager = useCallback((tab: FacebookTab = 'overview') => {
    setManagerTab(tab)
    publishSnapshot?.({ activeTab: tab })
    setModuleExpanded?.(true)
    if (isDesktop) {
      openCanvas('/facebook')
    } else {
      setManagerOpen(true)
    }
  }, [isDesktop, openCanvas, publishSnapshot, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers) return
    return registerHandlers({
      openFull: () => openManager(snap?.activeTab || 'overview'),
      refresh: () => { void load() },
      setTab: (tab) => openManager(tab),
      connect: () => openManager('overview'),
    })
  }, [registerHandlers, openManager, load, snap?.activeTab])

  if ((loading || snap?.loading) && !snap?.pageName) {
    return (
      <PageSplash variant="panel" label="Facebook" />
    )
  }

  if (!snap?.connected) {
    return (
      <div className="catalog-panel catalog-panel--facebook">
        <div className="catalog-facebook-connect">
          <FacebookIcon size={20} className="text-blue-500" />
          <p className="catalog-facebook-connect__title">Página não conectada</p>
          <p className="catalog-facebook-connect__desc">
            Vincule uma página Facebook para publicar posts, ver métricas e responder mensagens.
          </p>
          <button type="button" className="catalog-panel__action catalog-panel__action--facebook" onClick={() => openManager('overview')}>
            Conectar Facebook
          </button>
        </div>
        {!isDesktop && (
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Facebook"
            subtitle="Conectar e gerenciar página"
          >
            <Suspense fallback={<PageSplash variant="panel" label="Facebook" />}>
              <FacebookManager embedded initialTab="overview" />
            </Suspense>
          </CatalogManagerSheet>
        )}
      </div>
    )
  }

  const activeTab = snap.activeTab

  return (
    <div className="catalog-panel catalog-panel--facebook">
      <div className="catalog-facebook-profile">
        <div className="catalog-facebook-profile__avatar">
          {snap.avatarUrl ? (
            <img src={snap.avatarUrl} alt="" />
          ) : (
            <FacebookIcon size={16} className="text-blue-400" />
          )}
        </div>
        <div className="catalog-facebook-profile__meta">
          <p className="catalog-facebook-profile__user">{snap.pageName}</p>
          <p className="catalog-facebook-profile__name">{snap.category || 'Página conectada'}</p>
        </div>
        <span className="catalog-facebook-profile__dot" aria-hidden />
      </div>

      <div className="catalog-facebook-kpi-grid">
        <div className="catalog-facebook-kpi">
          <ThumbsUp size={12} className="text-gray-400" />
          <p className="catalog-facebook-kpi__value tabular-nums">{snap.fans.toLocaleString('pt-BR')}</p>
          <span className="catalog-facebook-kpi__label">Curtidas</span>
        </div>
        <div className="catalog-facebook-kpi">
          <Users size={12} className="text-gray-400" />
          <p className="catalog-facebook-kpi__value tabular-nums">{snap.followers.toLocaleString('pt-BR')}</p>
          <span className="catalog-facebook-kpi__label">Seguidores</span>
        </div>
        <div className="catalog-facebook-kpi">
          <Image size={12} className="text-gray-400" />
          <p className="catalog-facebook-kpi__value tabular-nums">{snap.postsCount.toLocaleString('pt-BR')}</p>
          <span className="catalog-facebook-kpi__label">Posts</span>
        </div>
      </div>

      {feed.length > 0 && (
        <div className="catalog-facebook-media-strip">
          {feed.slice(0, 4).map((m) => (
            <a
              key={m.id}
              href={m.permalink_url || '#'}
              target="_blank"
              rel="noreferrer"
              className="catalog-facebook-media-tile"
            >
              {m.full_picture ? (
                <img src={m.full_picture} alt="" loading="lazy" />
              ) : (
                <span className="catalog-facebook-media-tile__text">{String(m.message || '').slice(0, 40)}</span>
              )}
            </a>
          ))}
        </div>
      )}

      <div className="catalog-panel__filters">
        {TAB_CHIPS.map((chip) => (
          <button
            key={chip.tab}
            type="button"
            className={`catalog-panel__filter-chip catalog-panel__filter-chip--facebook${activeTab === chip.tab ? ' is-active' : ''}`}
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
            Abrir Facebook completo
            <ChevronRight size={13} />
          </button>
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Facebook"
            subtitle={snap.pageName || 'Gerenciar página'}
          >
            <Suspense fallback={<PageSplash variant="panel" label="Facebook" />}>
              <FacebookManager embedded initialTab={managerTab} />
            </Suspense>
          </CatalogManagerSheet>
        </>
      )}
    </div>
  )
}
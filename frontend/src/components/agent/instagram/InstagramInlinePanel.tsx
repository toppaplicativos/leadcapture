import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Camera, Users, Image, MessageCircle,
  ChevronRight, ExternalLink, Plus,
} from 'lucide-react'
import { fetchInstagramSnapshot, type InstagramTab } from '@/lib/instagram/client'
import { useInstagramBridgeOptional } from '@/lib/agent/InstagramBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

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
  const [loading, setLoading] = useState(true)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<InstagramTab>('overview')
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchInstagramSnapshot()
      setMedia(data.media || [])
      publishSnapshot?.({
        connected: data.connected,
        username: data.profile?.username || '',
        name: data.profile?.name || '',
        followers: Number(data.profile?.followers_count || 0),
        following: Number(data.profile?.follows_count || 0),
        mediaCount: Number(data.profile?.media_count || 0),
        avatarUrl: data.profile?.profile_picture_url || '',
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
      refresh: () => { void load() },
      setTab: (tab) => openManager(tab),
      connect: () => openManager('overview'),
    })
  }, [registerHandlers, openManager, load, snap?.activeTab])

  if ((loading || snap?.loading) && !snap?.username) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!snap?.connected) {
    return (
      <div className="catalog-panel catalog-panel--instagram">
        <div className="catalog-instagram-connect">
          <Camera size={20} className="text-rose-500" strokeWidth={1.75} />
          <p className="catalog-instagram-connect__title">Conta não conectada</p>
          <p className="catalog-instagram-connect__desc">
            Vincule uma conta Instagram Business para publicar, responder DMs e ver métricas.
          </p>
          <button type="button" className="catalog-panel__action catalog-panel__action--instagram" onClick={() => openManager('overview')}>
            Conectar Instagram
          </button>
        </div>
        {!isDesktop && (
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Instagram"
            subtitle="Conectar e gerenciar conta"
          >
            <Suspense fallback={<div className="catalog-panel__loading"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}>
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
            <Camera size={16} className="text-rose-400" />
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
          <p className="catalog-instagram-kpi__value tabular-nums">—</p>
          <span className="catalog-instagram-kpi__label">DMs</span>
        </div>
      </div>

      {media.length > 0 && (
        <div className="catalog-instagram-media-strip">
          {media.slice(0, 4).map((m) => (
            <a
              key={m.id}
              href={m.permalink || '#'}
              target="_blank"
              rel="noreferrer"
              className="catalog-instagram-media-tile"
            >
              <img src={m.thumbnail_url || m.media_url} alt="" loading="lazy" />
            </a>
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
            <Suspense fallback={<div className="catalog-panel__loading"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}>
              <InstagramManager embedded initialTab={managerTab} />
            </Suspense>
          </CatalogManagerSheet>
        </>
      )}
    </div>
  )
}
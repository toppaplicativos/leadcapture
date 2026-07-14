import { useState, type ReactNode } from 'react'
import { RefreshCw, MoreHorizontal, X, Unplug } from 'lucide-react'
import { InstagramIcon } from '@/components/icons'
import {
  IG_NAV_GROUPS,
  IG_MOBILE_PRIMARY,
  IG_NAV_ITEMS,
  findNavItem,
  type InstagramTabKey,
} from '@/lib/instagram/nav'

type Props = {
  embedded?: boolean
  tab: InstagramTabKey
  onTabChange: (tab: InstagramTabKey) => void
  profile: {
    username?: string
    name?: string
    profile_picture_url?: string
    followers_count?: number
    is_connected?: boolean
  }
  stats: { published: number; scheduled: number; drafts: number; failed?: number }
  onRefresh: () => void
  onReconnect: () => void
  children: ReactNode
}

export function InstagramStudioShell({
  embedded = false,
  tab,
  onTabChange,
  profile,
  stats,
  onRefresh,
  onReconnect,
  children,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const active = findNavItem(tab)
  const isPrimaryMobile = IG_MOBILE_PRIMARY.some((t) => t.key === tab)
  const childOwnsHeading = tab === 'automations' || tab === 'ai'

  const closeMore = (next: InstagramTabKey) => {
    onTabChange(next)
    setMoreOpen(false)
  }

  return (
    <div className={`ig-studio${embedded ? ' ig-studio--embedded' : ''}`}>
      <header className="ig-studio__header">
        <div className="ig-studio__identity">
          <div className="ig-studio__avatar">
            {profile.profile_picture_url ? (
              <img src={profile.profile_picture_url} alt="" />
            ) : (
              <span>{(profile.username?.[0] || 'I').toUpperCase()}</span>
            )}
          </div>
          <div className="ig-studio__identity-text">
            <p className="ig-studio__title">
              <InstagramIcon size={14} className="brand-icon--ig shrink-0" aria-hidden />
              Instagram
            </p>
            <p className="ig-studio__handle">
              <span
                className={`ig-studio__status${(profile.is_connected || !!profile.username) ? ' is-on' : ''}`}
                aria-hidden
                title={(profile.is_connected || !!profile.username) ? 'Conectado' : 'Desconectado'}
              />
              @{profile.username || '—'}
              <span className="ig-studio__sep">·</span>
              <span className="tabular-nums">{(profile.followers_count || 0).toLocaleString('pt-BR')}</span>
              <span className="ig-studio__muted"> seguidores</span>
            </p>
          </div>
        </div>

        <div className="ig-studio__header-actions">
          <div className="ig-studio__stat-pills" aria-label="Resumo de posts">
            <div className="ig-studio__stat-pill">
              <span className="ig-studio__stat-val tabular-nums">{stats.published}</span>
              <span className="ig-studio__stat-lbl">Pub.</span>
            </div>
            <div className="ig-studio__stat-pill">
              <span className="ig-studio__stat-val tabular-nums">{stats.scheduled}</span>
              <span className="ig-studio__stat-lbl">Agend.</span>
            </div>
            <div className="ig-studio__stat-pill">
              <span className="ig-studio__stat-val tabular-nums">{stats.drafts}</span>
              <span className="ig-studio__stat-lbl">Rasc.</span>
            </div>
            {(stats.failed ?? 0) > 0 && (
              <div className="ig-studio__stat-pill ig-studio__stat-pill--alert">
                <span className="ig-studio__stat-val tabular-nums">{stats.failed}</span>
                <span className="ig-studio__stat-lbl">Falhou</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="ig-studio__icon-btn"
            onClick={onRefresh}
            title="Atualizar dados"
            aria-label="Atualizar dados"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="ig-studio__icon-btn ig-studio__icon-btn--connection"
            onClick={onReconnect}
            title="Gerenciar conexão"
            aria-label="Gerenciar conexão do Instagram"
          >
            <Unplug size={14} />
          </button>
        </div>
      </header>

      <div className="ig-studio__body">
        <nav className="ig-studio__sidebar" aria-label="Módulos Instagram">
          {IG_NAV_GROUPS.map((group) => (
            <div key={group.id} className="ig-studio__nav-group">
              <p className="ig-studio__nav-group-label">{group.label}</p>
              <ul className="ig-studio__nav-list">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = tab === item.key
                  const showFailedBadge = item.key === 'posts' && (stats.failed ?? 0) > 0
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={`ig-studio__nav-item${isActive ? ' is-active' : ''}`}
                        onClick={() => onTabChange(item.key)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon size={16} strokeWidth={1.75} />
                        {showFailedBadge && (
                          <span className="ig-studio__nav-badge" aria-label={`${stats.failed} falharam`}>
                            {stats.failed}
                          </span>
                        )}
                        <span className="ig-studio__nav-item-text">
                          <span className="ig-studio__nav-item-label">{item.label}</span>
                          {item.description && (
                            <span className="ig-studio__nav-item-desc">{item.description}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <main className="ig-studio__main">
          {active && tab !== 'overview' && tab !== 'posts' && tab !== 'messages' && !childOwnsHeading && (
            <div className="ig-studio__main-head">
              <h2 className="ig-studio__main-title">{active.label}</h2>
              {active.description && (
                <p className="ig-studio__main-desc">{active.description}</p>
              )}
            </div>
          )}
          <div className="ig-studio__main-content">{children}</div>
        </main>
      </div>

      <nav className="ig-studio__bottom" aria-label="Navegação rápida">
        {IG_MOBILE_PRIMARY.map((item) => {
          const Icon = item.icon
          const isActive = tab === item.key
          return (
            <button
              key={item.key}
              type="button"
              className={`ig-studio__bottom-item${isActive ? ' is-active' : ''}`}
              onClick={() => onTabChange(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{item.shortLabel}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`ig-studio__bottom-item${!isPrimaryMobile ? ' is-active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
          <span>Mais</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="ig-studio__more-backdrop" role="presentation" onClick={() => setMoreOpen(false)}>
          <div
            className="ig-studio__more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Outros módulos"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ig-studio__more-head">
              <p className="ig-studio__more-title">Módulos</p>
              <button type="button" className="ig-studio__icon-btn" onClick={() => setMoreOpen(false)} aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <div className="ig-studio__more-grid">
              {IG_NAV_ITEMS.filter((t) => !t.mobilePrimary).map((item) => {
                const Icon = item.icon
                const isActive = tab === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`ig-studio__more-card${isActive ? ' is-active' : ''}`}
                    onClick={() => closeMore(item.key)}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span className="ig-studio__more-card-label">{item.label}</span>
                    {item.description && (
                      <span className="ig-studio__more-card-desc">{item.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

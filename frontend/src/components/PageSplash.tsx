import { BrandMark } from '@/components/BrandMark'
import { getCachedActiveBrand } from '@/lib/brand-splash'

export type PageSplashVariant = 'route' | 'canvas' | 'page' | 'panel'

type Props = {
  /** route = lazy route; canvas = painel direito; page = dados da view; panel = sheet inline no chat */
  variant?: PageSplashVariant
  /** Módulo em carregamento — ex. Instagram, Leads (subtitle abaixo da marca) */
  label?: string
  /** Sobrescreve o nome da marca ativa */
  brandName?: string
  brandLogoUrl?: string | null
  view?: 'admin' | 'store' | 'stock'
}

const MODULE_LABELS: Record<string, string> = {
  '/instagram': 'Instagram',
  '/facebook': 'Facebook',
  '/mensagens': 'Mensagens',
  '/leads': 'Leads',
  '/clientes': 'Clientes',
  '/produtos': 'Produtos',
  '/pedidos': 'Pedidos',
  '/campanhas': 'Campanhas',
  '/busca': 'Busca',
  '/galeria': 'Galeria',
  '/automacoes': 'Automacoes',
  '/fluxos': 'Fluxos',
  '/habilidades': 'Habilidades',
  '/afiliados': 'Afiliados',
  '/agente': 'Agente IA',
  '/criativos': 'Criativos',
  '/video-studio': 'Video Studio',
  '/loja': 'Loja',
  '/design': 'Loja',
  '/dashboard': 'Painel',
}

export function canvasSplashLabel(route: string): string | undefined {
  const base = route.split('?')[0]
  return MODULE_LABELS[base]
}

export function PageSplash({
  variant = 'route',
  label,
  brandName,
  brandLogoUrl,
  view = 'admin',
}: Props) {
  const cached = getCachedActiveBrand()
  const activeBrand = brandName?.trim() || cached.name
  const activeLogo = brandLogoUrl !== undefined ? brandLogoUrl : cached.logoUrl
  const moduleLabel = label?.trim() || undefined

  const markSize = variant === 'panel' ? 48 : 64
  const ariaLabel = moduleLabel
    ? `Carregando ${moduleLabel} · ${activeBrand}`
    : `Carregando ${activeBrand}`

  return (
    <div
      className={`page-splash page-splash--${variant}`}
      data-view={view}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {activeLogo ? (
        <img
          src={activeLogo}
          alt=""
          className="page-splash__logo"
          width={markSize}
          height={markSize}
        />
      ) : (
        <BrandMark size={markSize} className="page-splash__mark" />
      )}
      <p className="page-splash__label">{activeBrand}</p>
      {moduleLabel ? <p className="page-splash__sublabel">{moduleLabel}</p> : null}
    </div>
  )
}
import { BrandMark } from '@/components/BrandMark'
import { getCachedActiveBrand } from '@/lib/brand-splash'

export type PageSplashVariant = 'route' | 'canvas' | 'page' | 'panel'
export type PageSplashView = 'admin' | 'store' | 'stock' | 'affiliate'

type Props = {
  /** route = lazy route; canvas = painel direito; page = dados da view; panel = sheet inline no chat */
  variant?: PageSplashVariant
  /** Módulo em carregamento — ex. Instagram, Leads (subtitle abaixo da marca) */
  label?: string
  /** Sobrescreve o nome da marca ativa */
  brandName?: string
  brandLogoUrl?: string | null
  view?: PageSplashView
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
  '/atendente': 'Atendente',
  '/criativos': 'Criativos',
  '/video-studio': 'Video Studio',
  '/loja': 'Loja',
  '/design': 'Loja',
  '/dashboard': 'Painel',
  '/whatsapp': 'WhatsApp',
  '/configuracoes': 'Configurações',
  '/notificacoes': 'Notificações',
  '/cupons': 'Cupons',
  '/frete': 'Frete',
  '/estoque': 'Estoque',
  '/emails': 'Emails',
  '/pagamentos': 'Pagamentos',
  '/dominio': 'Domínio',
  '/provedores-ia': 'Provedores IA',
  '/tirar-pedido': 'Tirar pedido',
}

export function canvasSplashLabel(route: string): string | undefined {
  const base = route.split('?')[0]
  return MODULE_LABELS[base]
}

function resolveSplashIcon(view: PageSplashView, logoUrl: string | null): string {
  if (logoUrl) {
    // Ainda usamos a API PWA para fundo colorido por app + logo embutido
    const params = new URLSearchParams({ app: view, size: '192' })
    // Logo remoto/local é resolvido no backend quando slug existir; sem slug usa mark
    return `/pwa/icon?${params.toString()}`
  }
  return `/pwa/icon?app=${view}&size=192`
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
  const iconSrc = resolveSplashIcon(view, activeLogo)

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
      <div className="page-splash__tile" aria-hidden="true">
        {activeLogo ? (
          <img
            src={activeLogo}
            alt=""
            className="page-splash__logo"
            width={44}
            height={44}
            onError={(e) => {
              // Fallback para ícone gerado do app se logo falhar
              const img = e.currentTarget
              if (img.dataset.fallback === '1') return
              img.dataset.fallback = '1'
              img.src = iconSrc
            }}
          />
        ) : (
          <BrandMark
            size={variant === 'panel' ? 28 : 36}
            inverted
            className="page-splash__mark"
          />
        )}
      </div>
      <p className="page-splash__label">{activeBrand}</p>
      {moduleLabel ? <p className="page-splash__sublabel">{moduleLabel}</p> : null}
    </div>
  )
}

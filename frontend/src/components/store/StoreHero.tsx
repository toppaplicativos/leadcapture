import { Truck, Clock, MessageCircle } from 'lucide-react'
import { optimizedImage, optimizedSrcset } from '@/lib/image'
import { money } from '@/lib/store-context'

export interface StoreHeroProps {
  displayName: string
  displaySlogan?: string
  logoUrl?: string
  coverImage?: string
  isOpen: boolean
  freeAbove?: number
  deliveryFee?: number
  deliveryTime?: string
  whatsappPhone?: string
}

export function StoreHero({
  displayName,
  displaySlogan,
  logoUrl,
  coverImage,
  isOpen,
  freeAbove = 0,
  deliveryFee = 0,
  deliveryTime = '',
  whatsappPhone,
}: StoreHeroProps) {
  const hasShippingInfo = freeAbove > 0 || deliveryFee > 0 || !!deliveryTime
  const waDigits = whatsappPhone?.replace(/\D/g, '')

  return (
    <section className="store-hero">
      {coverImage ? (
        <div className="relative overflow-hidden">
          <img
            src={optimizedImage(coverImage, 1280, 82)}
            srcSet={optimizedSrcset(coverImage, [640, 960, 1280, 1600], 82) || undefined}
            sizes="100vw"
            alt=""
            className="store-hero__cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={(e) => {
              ;(e.currentTarget.parentElement as HTMLElement).style.display = 'none'
            }}
          />
          <div className="store-hero__scrim" aria-hidden />
        </div>
      ) : (
        <div className="store-hero__placeholder" aria-hidden />
      )}

      <div className="relative z-10 max-w-[var(--store-max)] mx-auto px-4 -mt-10 sm:-mt-14 pb-5">
        <div className="store-identity">
          <div className="flex gap-3.5 sm:gap-4">
            {logoUrl ? (
              <img
                src={optimizedImage(logoUrl, 240, 88)}
                srcSet={optimizedSrcset(logoUrl, [160, 240, 320], 88) || undefined}
                sizes="80px"
                alt={displayName}
                className="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 ring-1 ring-black/5"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div
                className="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 rounded-2xl bg-brand text-white grid place-items-center text-2xl font-bold shrink-0"
                aria-hidden
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[1.35rem] sm:text-[1.5rem] font-bold text-gray-900 tracking-[-0.03em] leading-[1.15] text-wrap-balance">
                  {displayName}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                    isOpen ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-red-500'}`}
                    aria-hidden
                  />
                  {isOpen ? 'Aberto' : 'Fechado'}
                </span>
              </div>

              {displaySlogan && (
                <p className="text-[13px] sm:text-[14px] text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
                  {displaySlogan}
                </p>
              )}
            </div>
          </div>

          {(hasShippingInfo || waDigits) && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {freeAbove > 0 && (
                <span className="store-chip bg-emerald-50 text-emerald-800">
                  <Truck size={12} strokeWidth={2} aria-hidden />
                  Frete grátis acima de {money(freeAbove)}
                </span>
              )}
              {deliveryFee > 0 && (
                <span className="store-chip bg-gray-100 text-gray-700">
                  Entrega {money(deliveryFee)}
                </span>
              )}
              {deliveryTime && (
                <span className="store-chip bg-gray-100 text-gray-700">
                  <Clock size={12} strokeWidth={2} aria-hidden />
                  {deliveryTime}
                </span>
              )}
              {waDigits && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="store-chip bg-brand text-white hover:opacity-90"
                >
                  <MessageCircle size={12} strokeWidth={2} aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
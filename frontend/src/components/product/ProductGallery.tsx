import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, ZoomIn } from 'lucide-react'
import { optimizedImage, optimizedSrcset } from '@/lib/image'

export interface ProductGalleryProps {
  images: string[]
  productName: string
  discount?: number
  isOutOfStock?: boolean
  isLowStock?: boolean
  stockQty?: number | null
  /** Quando variante muda, volta para primeira imagem da variante */
  resetKey?: string
}

export function ProductGallery({
  images,
  productName,
  discount = 0,
  isOutOfStock = false,
  isLowStock = false,
  stockQty,
  resetKey,
}: ProductGalleryProps) {
  const [idx, setIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    setIdx(0)
  }, [resetKey, images.join('|')])

  const go = useCallback(
    (delta: number) => {
      if (images.length <= 1) return
      setIdx((p) => (p + delta + images.length) % images.length)
    },
    [images.length],
  )

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [lightbox, go])

  if (images.length === 0) {
    return (
      <div className="product-gallery product-gallery--empty">
        <div className="product-gallery__stage aspect-[4/5] lg:aspect-square">
          <ImageOff className="w-12 h-12 text-gray-400" strokeWidth={1.5} />
          <p className="text-[13px] text-gray-500 mt-2">Sem imagem</p>
        </div>
      </div>
    )
  }

  const current = images[idx] || images[0]

  return (
    <div className="product-gallery">
      <div className="product-gallery__stage-wrap">
        <div className="product-gallery__stage aspect-[4/5] lg:aspect-[1/1]">
          <img
            src={optimizedImage(current, 1280, 88)}
            srcSet={optimizedSrcset(current, [640, 960, 1280, 1600], 88) || undefined}
            sizes="(min-width: 1024px) 50vw, 100vw"
            alt={productName}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="product-gallery__img"
          />

          {discount > 0 && !isOutOfStock && (
            <span className="product-gallery__badge product-gallery__badge--sale">−{discount}%</span>
          )}
          {isOutOfStock && (
            <span className="product-gallery__badge product-gallery__badge--sold">Esgotado</span>
          )}
          {!isOutOfStock && isLowStock && stockQty != null && (
            <span className="product-gallery__badge product-gallery__badge--low">
              Últimas {stockQty}
            </span>
          )}

          {isOutOfStock && <div className="product-gallery__scrim" aria-hidden />}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Imagem anterior"
                className="product-gallery__nav product-gallery__nav--prev"
              >
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Próxima imagem"
                className="product-gallery__nav product-gallery__nav--next"
              >
                <ChevronRight size={20} strokeWidth={2} />
              </button>
              <span className="product-gallery__counter tabular-nums">
                {idx + 1} / {images.length}
              </span>
            </>
          )}

          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label="Ampliar imagem"
            className="product-gallery__zoom"
          >
            <ZoomIn size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {images.length > 1 && (
        <div className="product-gallery__thumbs" role="tablist" aria-label="Galeria de imagens">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={`Imagem ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`product-gallery__thumb ${i === idx ? 'is-active' : ''}`}
            >
              <img
                src={optimizedImage(src, 160, 78)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="product-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Galeria — ${productName}`}
          onClick={() => setLightbox(false)}
        >
          <img
            src={optimizedImage(current, 1920, 90)}
            alt={productName}
            className="product-gallery__lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <>
              <button type="button" className="product-gallery__lightbox-nav product-gallery__lightbox-nav--prev" onClick={(e) => { e.stopPropagation(); go(-1) }}>
                <ChevronLeft size={24} />
              </button>
              <button type="button" className="product-gallery__lightbox-nav product-gallery__lightbox-nav--next" onClick={(e) => { e.stopPropagation(); go(1) }}>
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
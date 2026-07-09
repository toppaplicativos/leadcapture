import { useState, useCallback } from 'react'
import { Share2, Link2, Check } from 'lucide-react'
import type { Product } from '@/lib/api'
import { absoluteProductUrl, type ProductUrlOptions } from '@/lib/product-url'
import { useToast } from '@/components/Toast'

type Props = {
  product: Pick<Product, 'slug' | 'name' | 'id' | 'description'>
  className?: string
  catalogSlug?: string
  primaryDomain?: string | null
}

export function ProductShareButton({
  product,
  className = '',
  catalogSlug,
  primaryDomain,
}: Props) {
  const { showToast } = useToast()
  const [copied, setCopied] = useState(false)

  const urlOptions: ProductUrlOptions = {
    catalogSlug,
    primaryDomain,
    fallbackOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  }
  const shareUrl = absoluteProductUrl(product, urlOptions)

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      showToast('Link copiado!')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Não foi possível copiar o link')
    }
  }, [shareUrl, showToast])

  const share = useCallback(async () => {
    const text = product.description
      ? truncateShareText(product.description, 120)
      : `Confira ${product.name}`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text,
          url: shareUrl,
        })
        return
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }
    await copyLink()
  }, [product, shareUrl, copyLink])

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gray-100 text-gray-800 text-[13px] font-semibold hover:bg-gray-200 active:scale-[0.98] transition"
      >
        <Share2 size={16} strokeWidth={1.75} />
        Compartilhar
      </button>
      <button
        type="button"
        onClick={copyLink}
        aria-label="Copiar link do produto"
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-[0.98] transition"
      >
        {copied ? <Check size={16} className="text-emerald-600" /> : <Link2 size={16} strokeWidth={1.75} />}
      </button>
    </div>
  )
}

function truncateShareText(text: string, max: number): string {
  const trimmed = String(text).replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}
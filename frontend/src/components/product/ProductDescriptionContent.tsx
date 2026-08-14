import { productDescriptionToHtml } from '@/lib/product-description'

export function ProductDescriptionContent({ description, variant = 'editorial' }: { description?: string; variant?: 'editorial' | 'compact' }) {
  const html = productDescriptionToHtml(description)
  if (!html) return null
  return <div className={variant === 'compact' ? 'product-description-rich product-description-rich--compact' : 'product-editorial__sections product-description-rich'} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Client-side SEO helper for the public catalog SPA.
 *
 * Caveat: search engines that don't execute JS won't see these — for proper bot
 * indexing, the next iteration should add server-side rendering or a prerender step.
 * What this DOES cover well:
 *  - Browser tab title (visible UX)
 *  - Link previews when a user shares from inside the app (Twitter/WhatsApp pull the meta tags
 *    on subsequent fetches if the bot triggers a JS render — Google does this most of the time)
 *  - Consistent meta state across SPA route changes
 */

interface SeoTags {
  title?: string
  description?: string | null
  image?: string | null
  url?: string | null
}

function upsertMeta(attr: 'name' | 'property', key: string, value: string | null | undefined) {
  if (typeof document === 'undefined') return
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!value) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', String(value))
}

function upsertCanonical(url: string | null | undefined) {
  if (typeof document === 'undefined') return
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!url) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', 'canonical')
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', String(url))
}

export function applySeo(tags: SeoTags) {
  if (typeof document === 'undefined') return
  if (tags.title) document.title = tags.title

  upsertMeta('name', 'description', tags.description)
  upsertMeta('property', 'og:title', tags.title)
  upsertMeta('property', 'og:description', tags.description)
  upsertMeta('property', 'og:image', tags.image)
  upsertMeta('property', 'og:url', tags.url)
  upsertMeta('property', 'og:type', 'website')

  upsertMeta('name', 'twitter:card', tags.image ? 'summary_large_image' : 'summary')
  upsertMeta('name', 'twitter:title', tags.title)
  upsertMeta('name', 'twitter:description', tags.description)
  upsertMeta('name', 'twitter:image', tags.image)

  upsertCanonical(tags.url)
}

/** Truncate a string for use as meta description (max 160 chars). */
export function truncate(text: string | null | undefined, max = 160): string | null {
  if (!text) return null
  const trimmed = String(text).replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}

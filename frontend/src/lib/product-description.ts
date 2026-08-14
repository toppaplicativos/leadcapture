export type ProductDescriptionSection = {
  title?: string
  level?: 1 | 2 | 3
  paragraphs: string[]
  bullets: string[]
}

const LEGACY_HEADINGS = new Set(['Visão geral', 'Por que escolher', 'Detalhes que fazem diferença', 'Para quem é', 'Como aproveitar melhor'])

export function parseProductDescription(value?: string): ProductDescriptionSection[] {
  const sections: ProductDescriptionSection[] = []
  let current: ProductDescriptionSection = { paragraphs: [], bullets: [] }
  const flush = () => {
    if (current.title || current.paragraphs.length || current.bullets.length) sections.push(current)
    current = { paragraphs: [], bullets: [] }
  }
  for (const rawLine of String(value || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^[-*_]{3,}$/.test(line)) { flush(); continue }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flush()
      current.title = heading[2].trim()
      current.level = heading[1].length as 1 | 2 | 3
    } else if (LEGACY_HEADINGS.has(line.replace(/:$/, ''))) {
      flush()
      current.title = line.replace(/:$/, '')
      current.level = 2
    } else if (/^[•*-]\s+/.test(line)) {
      current.bullets.push(line.replace(/^[•*-]\s+/, ''))
    } else {
      current.paragraphs.push(line)
    }
  }
  flush()
  return sections
}

export function stripProductDescriptionFormatting(value?: string): string {
  return String(value || '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-3]|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, ' ')
    .replace(/^[•*-]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALLOWED_HTML_TAGS = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'ul', 'ol', 'li'])

export function sanitizeProductDescriptionHtml(value?: string): string {
  return String(value || '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(\/?)([a-z0-9]+)(?:\s[^>]*)?>/gi, (_match, closing: string, rawTag: string) => {
      const tag = String(rawTag).toLowerCase()
      if (!ALLOWED_HTML_TAGS.has(tag)) return ''
      if (tag === 'br') return '<br>'
      return `<${closing ? '/' : ''}${tag}>`
    })
}

function inlineMarkdownToHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

export function productDescriptionToHtml(value?: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/<\/?(?:p|div|br|strong|b|em|i|h2|h3|ul|ol|li)\b/i.test(raw)) return sanitizeProductDescriptionHtml(raw)
  return parseProductDescription(raw).map(section => {
    const title = section.title ? `<${section.level === 1 ? 'h2' : 'h3'}>${inlineMarkdownToHtml(section.title)}</${section.level === 1 ? 'h2' : 'h3'}>` : ''
    const paragraphs = section.paragraphs.map(text => `<p>${inlineMarkdownToHtml(text)}</p>`).join('')
    const bullets = section.bullets.length ? `<ul>${section.bullets.map(text => `<li>${inlineMarkdownToHtml(text)}</li>`).join('')}</ul>` : ''
    return `${title}${paragraphs}${bullets}`
  }).join('')
}

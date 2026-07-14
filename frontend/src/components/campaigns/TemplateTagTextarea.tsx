import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type MutableRefObject,
  type TextareaHTMLAttributes,
} from 'react'

export type TemplateTagToken = {
  token: string
  label?: string
  description?: string
}

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'unknown'; value: string }
  | { kind: 'broken'; value: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Quebra o texto em segmentos: texto livre, tag válida, desconhecida ou quebrada. */
export function tokenizeTemplateTags(text: string, knownTokens: Set<string>): Segment[] {
  const src = String(text || '')
  if (!src) return [{ kind: 'text', value: '' }]
  const parts: Segment[] = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{{', i)
    if (open === -1) {
      parts.push({ kind: 'text', value: src.slice(i) })
      break
    }
    if (open > i) parts.push({ kind: 'text', value: src.slice(i, open) })
    const close = src.indexOf('}}', open + 2)
    if (close === -1) {
      parts.push({ kind: 'broken', value: src.slice(open) })
      break
    }
    const token = src.slice(open, close + 2)
    const inner = src.slice(open + 2, close)
    if (/^[a-zA-Z0-9_]+$/.test(inner)) {
      parts.push({
        kind: knownTokens.has(token) ? 'tag' : 'unknown',
        value: token,
      })
    } else {
      parts.push({ kind: 'broken', value: token })
    }
    i = close + 2
  }
  return parts
}

export function collectUsedTemplateTags(text: string, knownTokens: Set<string>): Set<string> {
  const used = new Set<string>()
  for (const seg of tokenizeTemplateTags(text, knownTokens)) {
    if (seg.kind === 'tag') used.add(seg.value)
  }
  return used
}

function segmentsToHtml(segments: Segment[]): string {
  return segments
    .map((seg) => {
      const safe = escapeHtml(seg.value)
      if (seg.kind === 'text') return safe
      if (seg.kind === 'tag') {
        return `<mark class="template-tag-editor__mark template-tag-editor__mark--ok" data-token="${safe}">${safe}</mark>`
      }
      if (seg.kind === 'unknown') {
        return `<mark class="template-tag-editor__mark template-tag-editor__mark--unknown" title="Tag com sintaxe ok, mas não está na lista oficial">${safe}</mark>`
      }
      return `<mark class="template-tag-editor__mark template-tag-editor__mark--broken" title="Tag incompleta ou com grafia inválida — corrija para {{nome}}">${safe}</mark>`
    })
    .join('')
    // trailing newline needs a visible line in the backdrop (like textarea)
    + (segments.length && segments[segments.length - 1]?.value.endsWith('\n') ? '<br/>' : '')
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  knownTokens: string[]
  /** Extra class on the outer shell */
  shellClassName?: string
}

export const TemplateTagTextarea = forwardRef<HTMLTextAreaElement, Props>(function TemplateTagTextarea(
  {
    value,
    onChange,
    knownTokens,
    className = '',
    shellClassName = '',
    onScroll,
    rows = 3,
    ...rest
  },
  ref,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement)

  const knownSet = useMemo(() => new Set(knownTokens), [knownTokens])
  const segments = useMemo(() => tokenizeTemplateTags(value, knownSet), [value, knownSet])
  const html = useMemo(() => segmentsToHtml(segments), [segments])

  const hasIssues = segments.some((s) => s.kind === 'broken' || s.kind === 'unknown')
  const tagCount = segments.filter((s) => s.kind === 'tag').length

  const syncScroll = useCallback(() => {
    const ta = localRef.current
    const bd = backdropRef.current
    if (!ta || !bd) return
    bd.scrollTop = ta.scrollTop
    bd.scrollLeft = ta.scrollLeft
  }, [])

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      localRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as MutableRefObject<HTMLTextAreaElement | null>).current = el
    },
    [ref],
  )

  return (
    <div className={`template-tag-editor ${shellClassName}`.trim()}>
      <div className="template-tag-editor__frame">
        <div
          ref={backdropRef}
          className="template-tag-editor__backdrop"
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: html || '<span class="template-tag-editor__placeholder-gap">&nbsp;</span>',
          }}
        />
        <textarea
          {...rest}
          ref={setRefs}
          value={value}
          rows={rows}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            syncScroll()
            onScroll?.(e)
          }}
          className={`template-tag-editor__textarea ${className}`.trim()}
        />
      </div>
      {(tagCount > 0 || hasIssues) && (
        <div className="template-tag-editor__status" aria-live="polite">
          {tagCount > 0 && (
            <span className="template-tag-editor__status-ok">
              {tagCount} tag{tagCount === 1 ? '' : 's'} marcada{tagCount === 1 ? '' : 's'}
            </span>
          )}
          {hasIssues && (
            <span className="template-tag-editor__status-warn">
              Há trechos em amarelo/vermelho — corrija a grafia (ex.: {'{{nome}}'})
            </span>
          )}
        </div>
      )}
    </div>
  )
})

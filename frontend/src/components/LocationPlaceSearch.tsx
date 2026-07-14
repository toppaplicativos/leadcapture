/**
 * Autocomplete de local real (cidade/bairro/endereço) com lat/lng.
 * Consome GET /api/leads/location-search — Mapbox → Nominatim → Places.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, MapPin, X } from 'lucide-react'

export type PlaceHit = {
  id: string
  label: string
  shortLabel: string
  latitude: number
  longitude: number
  source: string
}

export type SelectedPlace = {
  label: string
  latitude: number
  longitude: number
  shortLabel?: string
  source?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect?: (place: SelectedPlace) => void
  onClearPlace?: () => void
  /** Local já confirmado (coords) — mostra chip/estado “confirmado” */
  selected?: SelectedPlace | null
  placeholder?: string
  required?: boolean
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  /** 'inline' = sem ícone/wrapper (usa o do parent); 'field' = com MapPin embutido */
  variant?: 'inline' | 'field'
  enterKeyHint?: 'search' | 'next' | 'done' | 'go' | 'enter' | 'send'
  name?: string
  id?: string
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

export function LocationPlaceSearch({
  value,
  onChange,
  onSelect,
  onClearPlace,
  selected,
  placeholder = 'Buscar cidade ou bairro…',
  required,
  disabled,
  autoFocus,
  className = '',
  inputClassName = '',
  dropdownClassName = '',
  variant = 'field',
  enterKeyHint = 'search',
  name,
  id: idProp,
}: Props) {
  const autoId = useId()
  const inputId = idProp || autoId
  const [hits, setHits] = useState<PlaceHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pickedLabel = selected?.label || ''

  const confirmed =
    !!selected &&
    Number.isFinite(selected.latitude) &&
    Number.isFinite(selected.longitude) &&
    value.trim() === (selected.label || selected.shortLabel || '').trim()

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    try {
      const r = await fetch(
        `/api/leads/location-search?q=${encodeURIComponent(trimmed)}&limit=6`,
        { headers: getHeaders(), signal: ac.signal }
      )
      const d = await r.json().catch(() => ({}))
      if (ac.signal.aborted) return
      const list: PlaceHit[] = Array.isArray(d?.locations) ? d.locations : []
      setHits(list)
      setOpen(list.length > 0)
      setActiveIdx(list.length > 0 ? 0 : -1)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setHits([])
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const q = value.trim()
    // Já confirmou o mesmo texto — não re-busca
    if (confirmed || (pickedLabel && q === pickedLabel.trim())) {
      setHits([])
      setOpen(false)
      setLoading(false)
      return
    }
    if (q.length < 2) {
      setHits([])
      setOpen(false)
      setLoading(false)
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => runSearch(q), 320)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, confirmed, pickedLabel, runSearch])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(hit: PlaceHit) {
    const place: SelectedPlace = {
      label: hit.label,
      shortLabel: hit.shortLabel,
      latitude: hit.latitude,
      longitude: hit.longitude,
      source: hit.source,
    }
    onChange(hit.label)
    onSelect?.(place)
    setHits([])
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleChange(next: string) {
    onChange(next)
    // Digitou de novo → coords antigas não valem
    if (selected && next.trim() !== (selected.label || '').trim()) {
      onClearPlace?.()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i <= 0 ? hits.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIdx >= 0 && hits[activeIdx]) {
      e.preventDefault()
      pick(hits[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && hits.length > 0

  return (
    <div ref={wrapRef} className={`location-place-search ${className}`.trim()}>
      <div className={`location-place-search__row ${variant === 'field' ? 'location-place-search__row--field' : ''}`}>
        {variant === 'field' && (
          <MapPin size={13} className="location-place-search__icon" aria-hidden />
        )}
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={`${inputId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={activeIdx >= 0 ? `${inputId}-opt-${activeIdx}` : undefined}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (hits.length > 0 && !confirmed) setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint={enterKeyHint}
          title={value || placeholder}
          className={inputClassName}
        />
        {loading && (
          <Loader2 size={13} className="location-place-search__spin animate-spin" aria-hidden />
        )}
        {confirmed && !loading && (
          <span className="location-place-search__ok" title="Local confirmado com coordenadas">
            <MapPin size={11} />
          </span>
        )}
        {value && !disabled && (
          <button
            type="button"
            className="location-place-search__clear"
            aria-label="Limpar local"
            onClick={() => {
              onChange('')
              onClearPlace?.()
              setHits([])
              setOpen(false)
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {showDropdown && (
        <ul
          id={`${inputId}-list`}
          role="listbox"
          className={`location-place-search__list ${dropdownClassName}`.trim()}
        >
          {hits.map((hit, i) => (
            <li key={hit.id || `${hit.latitude}-${hit.longitude}-${i}`} role="presentation">
              <button
                type="button"
                id={`${inputId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className={`location-place-search__opt ${i === activeIdx ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(hit)
                }}
              >
                <MapPin size={13} className="location-place-search__opt-icon" />
                <span className="location-place-search__opt-text">
                  <span className="location-place-search__opt-title">{hit.shortLabel || hit.label}</span>
                  {hit.label !== hit.shortLabel && (
                    <span className="location-place-search__opt-sub">{hit.label}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

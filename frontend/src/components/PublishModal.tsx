import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Send, Megaphone, Sparkles, Loader2, MapPin,
  Check, AlertCircle, ImageIcon, BookImage, Search, Hash, Eye,
} from 'lucide-react'
import { InstagramIcon, WhatsAppIcon } from '@/components/icons'
import { Button } from '@/components/ui'

/* ── types ── */

type PublishDestination = 'instagram' | 'whatsapp' | 'campaign'

type InstagramMediaType = 'IMAGE' | 'STORIES'

type LocationResult = { id: string; name: string; address?: string }

interface Props {
  open: boolean
  onClose: () => void
  imageUrl: string
  /** Optional context for AI caption generation (product name, headline, etc) */
  captionContext?: string
}

/* ── helpers ── */

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('lead-system-token')
  if (t) h['Authorization'] = `Bearer ${t}`
  const b = localStorage.getItem('lead-system:active-brand-id')
  if (b) h['x-brand-id'] = b
  return h
}

/* ── component ── */

export function PublishModal({ open, onClose, imageUrl, captionContext }: Props) {
  const [destination, setDestination] = useState<PublishDestination>('instagram')

  // Instagram state
  const [igConnected, setIgConnected] = useState<boolean | null>(null)
  const [igUsername, setIgUsername] = useState('')
  const [igPfp, setIgPfp] = useState('')
  const [mediaType, setMediaType] = useState<InstagramMediaType>('IMAGE')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [hashtagInput, setHashtagInput] = useState('')
  const [altText, setAltText] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [locationSearching, setLocationSearching] = useState(false)
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const locationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check Instagram connection on open
  useEffect(() => {
    if (!open) return
    setResult(null)
    setPublishing(false)
    fetch('/api/instagram/connection-status', { headers: getHeaders() })
      .then(r => r.json())
      .then(d => {
        setIgConnected(!!d.connected)
        setIgUsername(d.username || '')
        setIgPfp(d.profilePicture || '')
      })
      .catch(() => setIgConnected(false))
  }, [open])

  // Generate caption with AI
  const generateCaption = useCallback(async () => {
    setGeneratingCaption(true)
    try {
      const r = await fetch('/api/instagram/caption-generate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          context: captionContext || '',
          tone: 'profissional e envolvente',
        }),
      })
      const d = await r.json()
      if (d.success) {
        setCaption(d.caption || '')
        if (d.hashtags?.length) setHashtags(prev => {
          const merged = [...new Set([...prev, ...d.hashtags])]
          return merged.slice(0, 30)
        })
      }
    } catch { /* silent */ }
    setGeneratingCaption(false)
  }, [captionContext])

  // Location search with debounce
  useEffect(() => {
    if (locationTimer.current) clearTimeout(locationTimer.current)
    if (!locationQuery || locationQuery.length < 3) {
      setLocationResults([])
      return
    }
    setLocationSearching(true)
    locationTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/instagram/location-search?q=${encodeURIComponent(locationQuery)}`, { headers: getHeaders() })
        const d = await r.json()
        setLocationResults(d.locations || [])
      } catch { setLocationResults([]) }
      setLocationSearching(false)
    }, 400)
    return () => { if (locationTimer.current) clearTimeout(locationTimer.current) }
  }, [locationQuery])

  // Add hashtag
  function addHashtag() {
    const raw = hashtagInput.trim().replace(/^#/, '')
    if (!raw || hashtags.length >= 30) return
    const tag = `#${raw}`
    if (!hashtags.includes(tag)) setHashtags(prev => [...prev, tag])
    setHashtagInput('')
  }

  function removeHashtag(tag: string) {
    setHashtags(prev => prev.filter(t => t !== tag))
  }

  // Build full caption with hashtags
  function fullCaption(): string {
    const parts = [caption.trim()]
    if (hashtags.length > 0) parts.push('', hashtags.join(' '))
    return parts.join('\n')
  }

  // Publish
  async function handlePublish() {
    if (publishing) return
    setPublishing(true)
    setResult(null)

    // Make sure image URL is absolute
    let absoluteUrl = imageUrl
    if (imageUrl.startsWith('/')) {
      absoluteUrl = `${window.location.origin}${imageUrl}`
    }

    try {
      const r = await fetch('/api/instagram/publish-image', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          imageUrl: absoluteUrl,
          caption: mediaType === 'STORIES' ? undefined : fullCaption(),
          mediaType,
          locationId: mediaType === 'STORIES' ? undefined : selectedLocation?.id,
          altText: mediaType === 'STORIES' ? undefined : altText || undefined,
        }),
      })
      const d = await r.json()
      setResult({ ok: !!d.ok, message: d.message || (d.ok ? 'Publicado com sucesso' : 'Erro ao publicar') })
    } catch (err: any) {
      setResult({ ok: false, message: err.message || 'Erro de conexao' })
    }
    setPublishing(false)
  }

  if (!open) return null

  const isStory = mediaType === 'STORIES'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* modal */}
      <div className="relative w-full max-w-[720px] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[17px] font-bold text-gray-900 tracking-tight">Publicar imagem</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* destination tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { key: 'instagram' as const, icon: InstagramIcon, label: 'Instagram', enabled: true },
            { key: 'whatsapp' as const, icon: WhatsAppIcon, label: 'WhatsApp', enabled: false },
            { key: 'campaign' as const, icon: Megaphone, label: 'Campanha', enabled: false },
          ]).map(d => (
            <button
              key={d.key}
              disabled={!d.enabled}
              onClick={() => d.enabled && setDestination(d.key)}
              className={`flex items-center gap-1.5 px-4 h-9 rounded-lg text-[12px] font-semibold transition ${
                destination === d.key
                  ? 'bg-gray-900 text-white'
                  : d.enabled
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
              }`}
            >
              <d.icon size={14} />
              {d.label}
              {!d.enabled && <span className="text-[9px] opacity-60 ml-0.5">Em breve</span>}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {destination === 'instagram' && (
            <div className="flex gap-5">
              {/* Left: preview */}
              <div className="shrink-0 w-[200px]">
                <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
                {igConnected && igUsername && (
                  <div className="flex items-center gap-2 mt-3">
                    {igPfp ? (
                      <img src={igPfp} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
                    )}
                    <span className="text-[12px] font-semibold text-gray-700">@{igUsername}</span>
                  </div>
                )}
              </div>

              {/* Right: form */}
              <div className="flex-1 space-y-4 min-w-0">
                {/* Connection check */}
                {igConnected === false && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Instagram nao conectado</p>
                      <p className="text-[12px] mt-0.5 opacity-80">Conecte sua conta na pagina Instagram antes de publicar.</p>
                    </div>
                  </div>
                )}

                {igConnected !== false && (
                  <>
                    {/* Media type */}
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo de publicacao</p>
                      <div className="flex gap-2">
                        {([
                          { key: 'IMAGE' as const, icon: ImageIcon, label: 'Post no Feed' },
                          { key: 'STORIES' as const, icon: BookImage, label: 'Story' },
                        ]).map(t => (
                          <button
                            key={t.key}
                            onClick={() => setMediaType(t.key)}
                            className={`flex items-center gap-2 px-4 h-10 rounded-xl text-[13px] font-semibold transition border ${
                              mediaType === t.key
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <t.icon size={15} />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Caption (only for feed posts) */}
                    {!isStory && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Legenda</p>
                          <button
                            onClick={generateCaption}
                            disabled={generatingCaption}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500 text-white text-[10px] font-bold hover:bg-purple-600 disabled:opacity-50 transition"
                          >
                            {generatingCaption ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                            {generatingCaption ? 'Gerando...' : 'Gerar com IA'}
                          </button>
                        </div>
                        <textarea
                          value={caption}
                          onChange={e => setCaption(e.target.value)}
                          rows={4}
                          maxLength={2200}
                          placeholder="Escreva ou gere com IA a legenda do seu post..."
                          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 resize-none transition"
                        />
                        <div className="flex justify-end mt-1">
                          <span className={`text-[10px] font-semibold ${caption.length > 2000 ? 'text-red-500' : 'text-gray-400'}`}>
                            {caption.length}/2200
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Hashtags (only for feed posts) */}
                    {!isStory && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          <Hash size={10} className="inline -mt-0.5" /> Hashtags ({hashtags.length}/30)
                        </p>
                        <div className="flex gap-2">
                          <input
                            value={hashtagInput}
                            onChange={e => setHashtagInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag() } }}
                            placeholder="Digite uma hashtag"
                            className="flex-1 h-9 rounded-lg border border-gray-200 bg-white px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition"
                          />
                          <button
                            onClick={addHashtag}
                            disabled={!hashtagInput.trim() || hashtags.length >= 30}
                            className="h-9 px-3 rounded-lg bg-gray-100 text-gray-700 text-[12px] font-semibold hover:bg-gray-200 disabled:opacity-40 transition"
                          >
                            Adicionar
                          </button>
                        </div>
                        {hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {hashtags.map(tag => (
                              <span key={tag} className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold">
                                {tag}
                                <button onClick={() => removeHashtag(tag)} className="hover:text-red-500 transition">
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Location (only for feed posts) */}
                    {!isStory && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          <MapPin size={10} className="inline -mt-0.5" /> Localizacao
                        </p>
                        {selectedLocation ? (
                          <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px]">
                            <MapPin size={13} className="text-emerald-600" />
                            <span className="font-semibold text-emerald-800 flex-1 truncate">{selectedLocation.name}</span>
                            <button onClick={() => setSelectedLocation(null)} className="text-emerald-600 hover:text-red-500 transition">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="flex items-center gap-2 h-9 rounded-lg border border-gray-200 bg-white px-3">
                              {locationSearching ? <Loader2 size={13} className="text-gray-400 animate-spin" /> : <Search size={13} className="text-gray-400" />}
                              <input
                                value={locationQuery}
                                onChange={e => setLocationQuery(e.target.value)}
                                placeholder="Buscar local..."
                                className="flex-1 text-[12px] bg-transparent focus:outline-none"
                              />
                            </div>
                            {locationResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto z-10">
                                {locationResults.map(loc => (
                                  <button
                                    key={loc.id}
                                    onClick={() => { setSelectedLocation(loc); setLocationQuery(''); setLocationResults([]) }}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                                  >
                                    <p className="text-[12px] font-semibold text-gray-900">{loc.name}</p>
                                    {loc.address && <p className="text-[10px] text-gray-500 truncate">{loc.address}</p>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Alt text (only for feed posts) */}
                    {!isStory && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          <Eye size={10} className="inline -mt-0.5" /> Texto alternativo
                        </p>
                        <input
                          value={altText}
                          onChange={e => setAltText(e.target.value)}
                          placeholder="Descricao da imagem para acessibilidade"
                          className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition"
                        />
                      </div>
                    )}

                    {/* Story notice */}
                    {isStory && (
                      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-[12px] text-blue-800">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <p>Stories publicados via API exibem apenas a imagem. Stickers, legendas e localizacao nao sao suportados pela API do Instagram.</p>
                      </div>
                    )}
                  </>
                )}

                {/* Result */}
                {result && (
                  <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-[13px] ${
                    result.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    {result.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                    <p className="font-medium">{result.message}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Placeholder for future destinations */}
          {destination === 'whatsapp' && (
            <div className="text-center py-12 text-gray-400">
              <WhatsAppIcon size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-[14px] font-semibold">Envio por WhatsApp</p>
              <p className="text-[12px] mt-1">Em breve disponivel.</p>
            </div>
          )}
          {destination === 'campaign' && (
            <div className="text-center py-12 text-gray-400">
              <Megaphone size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-[14px] font-semibold">Usar em Campanha</p>
              <p className="text-[12px] mt-1">Em breve disponivel.</p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-xl text-[13px] font-semibold text-gray-600 hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            {destination === 'instagram' && igConnected && !result?.ok && (
              <Button
                onClick={handlePublish}
                loading={publishing}
                disabled={publishing || !igConnected}
                iconLeft={publishing ? undefined : <Send size={14} />}
                size="md"
              >
                {publishing
                  ? 'Publicando...'
                  : isStory
                    ? 'Publicar Story'
                    : 'Publicar no Feed'}
              </Button>
            )}
            {result?.ok && (
              <Button onClick={onClose} variant="secondary" size="md">
                Fechar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

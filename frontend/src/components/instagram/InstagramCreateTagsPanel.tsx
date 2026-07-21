/**
 * Marcação de post Instagram: localização, usuários, alt text, collab e opções de Reels.
 * Localização: /api/instagram/location-search (Facebook Pages place com location física).
 * Capa Reels: upload/galeria (não URL manual) — recomendado 4:5.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Loader2,
  MapPin,
  Plus,
  UserPlus,
  X,
  Accessibility,
  Users,
  Image as ImageIcon,
  Upload,
  Music2,
} from 'lucide-react'
import { instagramApi } from '@/lib/instagram/pageApi'
import type { InstagramUserTagForm, PostType } from '@/lib/instagram/createForm'
import { MediaPickerModal } from '@/components/gallery/MediaPickerModal'
import { uploadGalleryFile } from '@/lib/gallery/api'
import type { GalleryItem } from '@/lib/gallery/types'
import { IMAGE_ONLY_ACCEPT } from '@/lib/media/detectFileKind'

type LocationHit = { id: string; name: string; address?: string }

type Props = {
  postType: PostType
  locationId: string
  locationName: string
  userTags: InstagramUserTagForm[]
  altText: string
  shareToFeed: boolean
  coverUrl: string
  audioName: string
  collaborators: string[]
  onChange: (patch: {
    locationId?: string
    locationName?: string
    userTags?: InstagramUserTagForm[]
    altText?: string
    shareToFeed?: boolean
    coverUrl?: string
    audioName?: string
    collaborators?: string[]
  }) => void
}

/** Ideal feed portrait; Meta cover Reels is often 9:16 — we recommend 4:5 as product default. */
const COVER_RATIO_TARGET = 4 / 5
const COVER_RATIO_TOLERANCE = 0.08

function probeImageRatio(url: string): Promise<{ width: number; height: number; ratio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || 0
      const h = img.naturalHeight || 0
      if (!w || !h) {
        resolve(null)
        return
      }
      resolve({ width: w, height: h, ratio: w / h })
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function InstagramCreateTagsPanel({
  postType,
  locationId,
  locationName,
  userTags,
  altText,
  shareToFeed,
  coverUrl,
  audioName,
  collaborators,
  onChange,
}: Props) {
  const [locQuery, setLocQuery] = useState(locationName || '')
  const [locHits, setLocHits] = useState<LocationHit[]>([])
  const [locLoading, setLocLoading] = useState(false)
  const [locError, setLocError] = useState('')
  const [userDraft, setUserDraft] = useState('')
  const [collabDraft, setCollabDraft] = useState('')
  const [coverGalleryOpen, setCoverGalleryOpen] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverHint, setCoverHint] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const supportsLocation =
    postType === 'IMAGE' || postType === 'CAROUSEL_ALBUM' || postType === 'VIDEO' || postType === 'REELS'
  const supportsUserTags = postType === 'IMAGE' || postType === 'STORIES'
  const supportsAlt = postType === 'IMAGE'
  const supportsReelsOpts = postType === 'REELS' || postType === 'VIDEO'
  const supportsCollab = postType === 'IMAGE' || postType === 'CAROUSEL_ALBUM' || postType === 'REELS'
  const supportsAudioName = postType === 'REELS' || postType === 'VIDEO'

  useEffect(() => {
    setLocQuery(locationName || '')
  }, [locationName, locationId])

  useEffect(() => {
    if (!supportsLocation) return
    const q = locQuery.trim()
    if (q.length < 2) {
      setLocHits([])
      setLocError('')
      return
    }
    // se já está com o local selecionado, não re-busca
    if (locationId && q === locationName) {
      setLocHits([])
      setLocError('')
      return
    }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLocLoading(true)
      setLocError('')
      try {
        const res = await instagramApi(`/location-search?q=${encodeURIComponent(q)}`)
        const list = Array.isArray(res?.locations) ? res.locations : []
        setLocHits(list)
        if (!list.length) {
          setLocError(
            res?.error
              ? String(res.error)
              : 'Nenhum local com coordenadas encontrado. Tente o nome do estabelecimento ou cidade.',
          )
        }
      } catch (e: any) {
        setLocHits([])
        setLocError(e?.message || 'Falha ao buscar localização (Pages Search da Meta).')
      } finally {
        setLocLoading(false)
      }
    }, 350)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [locQuery, locationId, locationName, supportsLocation])

  useEffect(() => {
    let cancelled = false
    if (!coverUrl) {
      setCoverHint('')
      return
    }
    ;(async () => {
      const meta = await probeImageRatio(coverUrl)
      if (cancelled || !meta) return
      const diff = Math.abs(meta.ratio - COVER_RATIO_TARGET)
      if (diff <= COVER_RATIO_TOLERANCE) {
        setCoverHint(`✓ ${meta.width}×${meta.height} — proporção ~4:5 ideal`)
      } else {
        setCoverHint(
          `${meta.width}×${meta.height} — recomendado 4:5 (retrato). A Meta pode cortar o centro.`,
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [coverUrl])

  const applyCover = async (url: string) => {
    onChange({ coverUrl: url })
  }

  const handleCoverUpload = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setCoverHint('Envie uma imagem JPEG/PNG para a capa.')
      return
    }
    setCoverUploading(true)
    setCoverHint('')
    try {
      const item = await uploadGalleryFile(file, ['instagram', 'reels-cover'], 'publicidade')
      await applyCover(item.url)
    } catch (e: any) {
      setCoverHint(e?.message || 'Falha no upload da capa.')
    } finally {
      setCoverUploading(false)
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  const handleCoverFromGallery = (item: GalleryItem) => {
    if (item.type !== 'image') return
    applyCover(item.url)
    setCoverGalleryOpen(false)
  }

  const addUserTag = () => {
    const username = userDraft.replace(/^@/, '').trim()
    if (!username) return
    if (userTags.some((t) => t.username.toLowerCase() === username.toLowerCase())) {
      setUserDraft('')
      return
    }
    // Distribui menções no centro da imagem (x/y 0–1). O IG exige posição.
    const n = userTags.length
    const x = 0.35 + (n % 3) * 0.15
    const y = 0.4 + Math.floor(n / 3) * 0.15
    onChange({
      userTags: [...userTags, { username, x: Math.min(0.9, x), y: Math.min(0.9, y) }],
    })
    setUserDraft('')
  }

  const addCollaborator = () => {
    const username = collabDraft.replace(/^@/, '').trim()
    if (!username) return
    if (collaborators.length >= 3) return
    if (collaborators.some((c) => c.toLowerCase() === username.toLowerCase())) {
      setCollabDraft('')
      return
    }
    onChange({ collaborators: [...collaborators, username] })
    setCollabDraft('')
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Marcação do post
        </h3>
        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
          Localização, pessoas, texto alternativo e collab — enviados na publicação via API do Instagram.
        </p>
      </div>

      {supportsLocation && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <MapPin size={12} className="text-rose-500" /> Localização
          </label>
          {locationId ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
              <MapPin size={14} className="text-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-900 truncate">{locationName || locationId}</p>
                <p className="text-[10px] text-gray-400 font-mono truncate">Page id: {locationId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChange({ locationId: '', locationName: '' })
                  setLocQuery('')
                  setLocHits([])
                  setLocError('')
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-red-500"
                aria-label="Remover localização"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="search"
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder="Buscar estabelecimento, cidade ou ponto de interesse…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
              />
              {locLoading && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
              )}
              {locHits.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {locHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({ locationId: hit.id, locationName: hit.name })
                          setLocQuery(hit.name)
                          setLocHits([])
                          setLocError('')
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-xs font-semibold text-gray-900">{hit.name}</p>
                        {hit.address && (
                          <p className="text-[10px] text-gray-400 truncate">{hit.address}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {locError && !locationId && (
            <p className="text-[10px] text-amber-700 leading-snug">{locError}</p>
          )}
          <p className="text-[9px] text-gray-400 leading-snug">
            Só locais com Page do Facebook + coordenadas (exigência da Meta). O id é gravado no post e enviado no publish.
          </p>
        </div>
      )}

      {supportsUserTags && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <UserPlus size={12} className="text-violet-500" /> Marcar usuários
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={userDraft}
              onChange={(e) => setUserDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addUserTag()
                }
              }}
              placeholder="@usuario"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
            />
            <button
              type="button"
              onClick={addUserTag}
              className="min-h-10 px-3 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {userTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {userTags.map((t) => (
                <span
                  key={t.username}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800"
                >
                  @{t.username}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ userTags: userTags.filter((u) => u.username !== t.username) })
                    }
                    className="text-violet-400 hover:text-red-500"
                    aria-label={`Remover @${t.username}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[9px] text-gray-400">
            Contas públicas/profissionais. A posição na imagem é definida automaticamente.
          </p>
        </div>
      )}

      {supportsAlt && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <Accessibility size={12} className="text-sky-500" /> Texto alternativo
          </label>
          <input
            type="text"
            value={altText}
            onChange={(e) => onChange({ altText: e.target.value.slice(0, 1000) })}
            placeholder="Descreva a imagem para acessibilidade…"
            maxLength={1000}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
        </div>
      )}

      {postType === 'IMAGE' && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <Music2 size={12} className="text-gray-400" /> Música na foto
          </p>
          <p className="text-[10px] text-gray-500 mt-1 leading-snug">
            A API oficial do Instagram <strong>não permite</strong> marcar trilha da biblioteca de música em posts de
            imagem. Isso só existe no app nativo. Em Reels, dá para renomear o áudio original do vídeo (campo abaixo).
          </p>
        </div>
      )}

      {supportsCollab && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
            <Users size={12} className="text-amber-500" /> Colaboradores (collab)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={collabDraft}
              onChange={(e) => setCollabDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCollaborator()
                }
              }}
              placeholder="@parceiro (até 3)"
              disabled={collaborators.length >= 3}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addCollaborator}
              disabled={collaborators.length >= 3}
              className="min-h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
          {collaborators.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {collaborators.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900"
                >
                  @{c}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ collaborators: collaborators.filter((x) => x !== c) })
                    }
                    className="text-amber-500 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[9px] text-gray-400">
            Convite de collab depende da conta e da API — se a Meta rejeitar, o post ainda publica sem collab.
          </p>
        </div>
      )}

      {supportsReelsOpts && (
        <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3">
          <p className="text-[11px] font-semibold text-gray-600">
            {postType === 'REELS' ? 'Opções de Reels' : 'Opções de vídeo no feed'}
          </p>
          {postType === 'REELS' && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-600">Também compartilhar no feed</span>
              <input
                type="checkbox"
                checked={shareToFeed}
                onChange={(e) => onChange({ shareToFeed: e.target.checked })}
                className="w-4 h-4 accent-gray-900"
              />
            </label>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
              <ImageIcon size={12} className="text-pink-500" /> Capa do vídeo
            </label>
            <p className="text-[10px] text-gray-500 leading-snug">
              Envie uma imagem (upload ou galeria). <strong>Proporção recomendada 4:5</strong> para encaixe limpo no
              feed. JPEG, até 8&nbsp;MB. Se a proporção for outra, o Instagram corta o centro.
            </p>

            {coverUrl ? (
              <div className="flex items-start gap-3">
                <div
                  className="relative shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                  style={{ width: 72, height: 90 }}
                >
                  <img src={coverUrl} alt="Capa" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {coverHint && (
                    <p className="text-[10px] text-gray-600 leading-snug">{coverHint}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={coverUploading}
                      className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[10px] font-bold hover:bg-gray-800 disabled:opacity-50"
                    >
                      Trocar upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverGalleryOpen(true)}
                      disabled={coverUploading}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[10px] font-bold text-gray-700 hover:bg-gray-50"
                    >
                      Galeria
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ coverUrl: '' })
                        setCoverHint('')
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50"
                >
                  {coverUploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {coverUploading ? 'Enviando…' : 'Enviar capa'}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverGalleryOpen(true)}
                  disabled={coverUploading}
                  className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  <ImageIcon size={14} /> Galeria
                </button>
              </div>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept={IMAGE_ONLY_ACCEPT}
              className="hidden"
              onChange={(e) => handleCoverUpload(e.target.files)}
            />
            {coverHint && !coverUrl && (
              <p className="text-[10px] text-amber-700">{coverHint}</p>
            )}
          </div>

          {supportsAudioName && (
            <div className="space-y-1.5 pt-1 border-t border-gray-100">
              <label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                <Music2 size={12} className="text-emerald-600" /> Nome do áudio original
              </label>
              <input
                type="text"
                value={audioName}
                onChange={(e) => onChange({ audioName: e.target.value.slice(0, 100) })}
                placeholder="Ex.: Som original — Minha marca"
                maxLength={100}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
              />
              <p className="text-[9px] text-gray-400 leading-snug">
                Só renomeia o áudio do próprio vídeo (API). Não busca faixas licenciadas do Instagram.
              </p>
            </div>
          )}
        </div>
      )}

      <MediaPickerModal
        open={coverGalleryOpen}
        onClose={() => setCoverGalleryOpen(false)}
        onSelect={handleCoverFromGallery}
        accept={['image']}
        preferSection="publicidade"
        title="Capa do Reels — escolher imagem"
        useContext="post"
      />
    </div>
  )
}

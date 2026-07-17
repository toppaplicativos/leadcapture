import { useEffect, useState } from 'react'
import {
  Bookmark,
  Film,
  Heart,
  Image,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Pencil,
  Send,
  Settings,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { InstagramCaptionTemplatesModal } from '@/components/instagram/InstagramCaptionTemplatesModal'
import { InstagramCreateWhenPanel } from '@/components/instagram/InstagramCreateWhenPanel'
import { InstagramCreateTagsPanel } from '@/components/instagram/InstagramCreateTagsPanel'
import {
  InstagramCreateMediaPanel,
  postMediaPreview,
  type PostMediaItem,
} from '@/components/instagram/InstagramCreateMediaPanel'
import {
  InstagramPublishModal,
  type InstagramPublishPhase,
} from '@/components/instagram/InstagramPublishModal'
import {
  buildPostPayload,
  createDefaultFormState,
  ctaLabelForForm,
  formatScheduleLabel,
  postToFormState,
  POST_TYPE_LABELS,
  validateSchedule,
  type PostType,
  type WhenMode,
} from '@/lib/instagram/createForm'
import { instagramApi } from '@/lib/instagram/pageApi'

const api = instagramApi
type Props = {
  profile: any
  analytics?: any
  brandId?: string
  editPostId?: string | null
  editToken?: number
  schedulePrefill?: string
  onNavigateToPosts?: (filter: 'scheduled' | 'draft' | 'all') => void
  onEditCancel?: () => void
  onEditComplete?: () => void
}

export function InstagramCreateTab({
  profile,
  brandId,
  editPostId,
  editToken,
  schedulePrefill,
  onNavigateToPosts,
  onEditCancel,
  onEditComplete,
}: Props) {
  const [form, setForm] = useState(createDefaultFormState)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [publishPhase, setPublishPhase] = useState<InstagramPublishPhase>('publishing')
  const [publishMessage, setPublishMessage] = useState('')
  const [publishPermalink, setPublishPermalink] = useState<string | undefined>()
  const [savedPostId, setSavedPostId] = useState<string | undefined>()
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const {
    postType, caption, mediaItems, when, scheduledAt,
    locationId, locationName, userTags, altText, shareToFeed, coverUrl, collaborators,
  } = form
  const isEditing = Boolean(editingId)

  useEffect(() => {
    if (schedulePrefill && !editPostId) {
      setForm({
        ...createDefaultFormState(),
        when: 'schedule',
        scheduledAt: schedulePrefill,
      })
      setEditingId(null)
    }
  }, [schedulePrefill, editToken, editPostId])

  useEffect(() => {
    if (!editPostId) {
      if (!schedulePrefill) return
      return
    }
    let cancelled = false
    setLoadingEdit(true)
    ;(async () => {
      try {
        const res = await api(`/posts/${editPostId}`)
        if (cancelled) return
        if (!res.success || !res.post) {
          setScheduleError(res.error || 'Post nao encontrado.')
          return
        }
        setForm(postToFormState(res.post))
        setEditingId(res.post.id)
        setScheduleError('')
      } finally {
        if (!cancelled) setLoadingEdit(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editPostId, editToken, schedulePrefill])

  const postTypes: Array<{
    key: PostType
    label: string
    sub: string
    icon: typeof Image
  }> = [
    { key: 'IMAGE', label: 'Imagem', sub: 'Post com 1 foto', icon: Image },
    { key: 'CAROUSEL_ALBUM', label: 'Carrossel', sub: '2-10 midias', icon: LayoutGrid },
    { key: 'REELS', label: 'Reels', sub: 'Video curto', icon: Film },
    { key: 'VIDEO', label: 'Video', sub: 'Video no feed', icon: Video },
    { key: 'STORIES', label: 'Story', sub: 'Foto ou vídeo 24h', icon: Sparkles },
  ]

  const minMedia = postType === 'CAROUSEL_ALBUM' ? 2 : 1
  const canPublish = mediaItems.length >= minMedia && !loadingEdit

  const patchForm = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }))

  const handlePostTypeChange = (next: PostType) => {
    if (next === 'CAROUSEL_ALBUM') {
      setForm((prev) => ({
        ...prev,
        postType: next,
        mediaItems: prev.mediaItems.filter((i) => i.type === 'image'),
      }))
      return
    }
    if (next === 'STORIES') {
      // Stories aceitam imagem ou vídeo (1 mídia)
      const keep = mediaItems.find((i) => i.type === 'image' || i.type === 'video')
      setForm((prev) => ({
        ...prev,
        postType: next,
        mediaItems: keep ? [keep] : [],
        caption: '',
      }))
      return
    }
    if (next === 'REELS' || next === 'VIDEO') {
      const video = mediaItems.find((i) => i.type === 'video')
      setForm((prev) => ({
        ...prev,
        postType: next,
        mediaItems: video ? [video] : [],
      }))
      return
    }
    const image = mediaItems.find((i) => i.type === 'image')
    setForm((prev) => ({
      ...prev,
      postType: next,
      mediaItems: image ? [image] : [],
    }))
  }

  const resetCreateForm = () => {
    setForm(createDefaultFormState())
    setEditingId(null)
    setScheduleError('')
    setPublishMessage('')
    setPublishPermalink(undefined)
    setSavedPostId(undefined)
    setPublishModalOpen(false)
    onEditCancel?.()
  }

  const closePublishModal = () => {
    const shouldReset =
      publishPhase === 'success' || publishPhase === 'scheduled' || publishPhase === 'draft'
    if (shouldReset) {
      resetCreateForm()
      onEditComplete?.()
      return
    }
    setPublishModalOpen(false)
    setPublishMessage('')
    setPublishPermalink(undefined)
    setSavedPostId(undefined)
  }

  const handleViewQueue = () => {
    const filter = when === 'schedule' ? 'scheduled' : when === 'draft' ? 'draft' : 'all'
    resetCreateForm()
    onEditComplete?.()
    onNavigateToPosts?.(filter)
  }

  const handleCreateAnother = () => {
    resetCreateForm()
    onEditComplete?.()
  }

  const handlePublish = async () => {
    if (!canPublish || publishing) return

    if (when === 'schedule') {
      const err = validateSchedule(scheduledAt)
      if (err) {
        setScheduleError(err)
        return
      }
      setScheduleError('')
    }

    if (postType === 'REELS' || postType === 'VIDEO') {
      const video = mediaItems.find((i) => i.type === 'video')
      if (!video) {
        setScheduleError('Envie um video MP4 ou MOV para Reels/Video.')
        return
      }
    }

    if (postType === 'STORIES') {
      const media = mediaItems[0]
      if (!media || (media.type !== 'image' && media.type !== 'video')) {
        setScheduleError('Envie uma imagem ou um video (MP4/MOV) para o Story.')
        return
      }
    }

    setPublishing(true)
    setPublishPhase(when === 'now' ? 'publishing' : 'saving')
    setPublishMessage('')
    setPublishPermalink(undefined)
    setPublishModalOpen(true)

    try {
      const payload = buildPostPayload(form, isEditing)
      const postId = editingId

      if (isEditing && postId) {
        const res = await api(`/posts/${postId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        if (!res.success) {
          setPublishPhase('error')
          setPublishMessage(res.error || res.message || 'Falha ao atualizar post.')
          return
        }
        setSavedPostId(postId)

        if (when !== 'now') {
          setPublishPhase(when === 'schedule' ? 'scheduled' : 'draft')
          return
        }

        const pub = await api(`/posts/${postId}/publish`, { method: 'POST' })
        if (!pub.success || pub.ok === false) {
          setPublishPhase('error')
          setPublishMessage(pub.message || pub.error || 'Falha ao publicar no Instagram.')
          return
        }
        setPublishPhase('success')
        setPublishPermalink(pub.permalink || undefined)
        return
      }

      const res = await api('/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.success) {
        setPublishPhase('error')
        setPublishMessage(res.error || res.message || 'Falha ao salvar post.')
        return
      }

      if (res.post?.id) setSavedPostId(res.post.id)

      if (when !== 'now') {
        setPublishPhase(when === 'schedule' ? 'scheduled' : 'draft')
        return
      }

      if (!res.post?.id) {
        setPublishPhase('error')
        setPublishMessage('Post criado, mas sem ID para publicar.')
        return
      }

      const pub = await api(`/posts/${res.post.id}/publish`, { method: 'POST' })
      if (!pub.success || pub.ok === false) {
        setPublishPhase('error')
        setPublishMessage(pub.message || pub.error || 'Falha ao publicar no Instagram.')
        return
      }

      setPublishPhase('success')
      setPublishPermalink(pub.permalink || undefined)
    } catch (err: any) {
      setPublishPhase('error')
      setPublishMessage(err?.message || 'Erro inesperado ao publicar.')
    } finally {
      setPublishing(false)
    }
  }

  const handleGenerateCaption = async () => {
    setGeneratingCaption(true)
    try {
      const res = await api('/caption-generate', {
        method: 'POST',
        body: JSON.stringify({
          context: profile?.biography || profile?.name || '',
          tone: 'profissional e acolhedor',
          objective: 'engajamento e conversao',
        }),
      })
      if (res.success && res.caption) {
        const hashtags = Array.isArray(res.hashtags) ? res.hashtags.join(' ') : ''
        patchForm({
          caption: hashtags ? `${res.caption}\n\n${hashtags}` : res.caption,
        })
      }
    } catch {}
    setGeneratingCaption(false)
  }

  const ctaLabel = ctaLabelForForm(when, isEditing)
  const videoTips = postType === 'REELS' || postType === 'VIDEO' || postType === 'STORIES'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-4 xl:gap-5">
      <div className="min-w-0 space-y-4">
        {isEditing && (
          <div className="ig-create-edit-banner">
            <Pencil size={14} />
            <span>Editando post da fila local</span>
            <button type="button" onClick={resetCreateForm} className="ig-create-edit-banner__cancel">
              <X size={14} /> Cancelar edicao
            </button>
          </div>
        )}

        {loadingEdit && (
          <div className="ig-create-edit-loading">
            <Loader2 size={16} className="animate-spin" />
            Carregando post…
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Tipo de Post
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {postTypes.map((pt) => (
              <button
                key={pt.key}
                type="button"
                onClick={() => handlePostTypeChange(pt.key)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition text-center ${
                  postType === pt.key
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <pt.icon
                  size={18}
                  className={postType === pt.key ? 'text-gray-900' : 'text-gray-400'}
                />
                <span
                  className={`text-xs font-semibold ${
                    postType === pt.key ? 'text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {pt.label}
                </span>
                <span className="text-[10px] text-gray-400">{pt.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <InstagramCreateMediaPanel
          postType={postType}
          items={mediaItems}
          onChange={(items: PostMediaItem[]) => patchForm({ mediaItems: items })}
        />

        <InstagramCreateTagsPanel
          postType={postType}
          locationId={locationId}
          locationName={locationName}
          userTags={userTags}
          altText={altText}
          shareToFeed={shareToFeed}
          coverUrl={coverUrl}
          collaborators={collaborators}
          onChange={(patch) => patchForm(patch)}
        />

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Legenda
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">{caption.length}/2200</span>
              <button
                type="button"
                onClick={() => setTemplatesOpen(true)}
                className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-1"
              >
                <Settings size={10} /> Templates
              </button>
              <button
                type="button"
                onClick={handleGenerateCaption}
                disabled={generatingCaption}
                className="min-h-9 px-3 py-1 rounded-xl bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
              >
                {generatingCaption ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Sparkles size={10} />
                )}{' '}
                Gerar com IA
              </button>
            </div>
          </div>
          <textarea
            value={caption}
            onChange={(e) => patchForm({ caption: e.target.value })}
            rows={4}
            maxLength={2200}
            placeholder="Escreva ou gere com IA a legenda do seu post..."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400"
          />
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <InstagramCreateWhenPanel
            when={when}
            scheduledAt={scheduledAt}
            onWhenChange={(mode: WhenMode) => {
              patchForm({ when: mode })
              setScheduleError('')
            }}
            onScheduledAtChange={(value) => {
              patchForm({ scheduledAt: value })
              setScheduleError('')
            }}
            scheduleError={scheduleError}
          />
        </div>

        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || !canPublish}
          className="ig-create-cta"
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {ctaLabel}
        </button>
      </div>

      <aside className="bg-white border border-gray-100 rounded-xl p-4 xl:sticky xl:top-4 self-start">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Prévia
        </h3>
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-gray-100">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
            <span className="text-xs font-semibold text-gray-700">
              @{profile?.username || 'preview'}
            </span>
          </div>
          <div className="aspect-square bg-gray-50 grid place-items-center overflow-hidden">
            {mediaItems.length ? (
              postMediaPreview(mediaItems, postType)
            ) : (
              <div className="text-center">
                <Upload size={24} className="mx-auto text-gray-300 mb-1" />
                <p className="text-[10px] text-gray-400">Selecione uma mídia acima</p>
              </div>
            )}
          </div>
          <div className="p-2 flex items-center gap-3">
            <Heart size={16} className="text-gray-400" />
            <MessageCircle size={16} className="text-gray-400" />
            <Send size={16} className="text-gray-400" />
            <Bookmark size={16} className="text-gray-400 ml-auto" />
          </div>
          {caption && (
            <p className="px-2 pb-2 text-[10px] text-gray-600 line-clamp-3 whitespace-pre-wrap">
              {caption}
            </p>
          )}
          {(locationName || userTags.length > 0 || collaborators.length > 0) && (
            <div className="px-2 pb-2 space-y-0.5 border-t border-gray-50 pt-1.5">
              {locationName && (
                <p className="text-[10px] text-gray-500 truncate">📍 {locationName}</p>
              )}
              {userTags.length > 0 && (
                <p className="text-[10px] text-violet-600 truncate">
                  👤 {userTags.map((t) => `@${t.username}`).join(' ')}
                </p>
              )}
              {collaborators.length > 0 && (
                <p className="text-[10px] text-amber-700 truncate">
                  🤝 collab {collaborators.map((c) => `@${c}`).join(' ')}
                </p>
              )}
            </div>
          )}
        </div>
        {(postType === 'IMAGE' || postType === 'CAROUSEL_ALBUM') && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1">
              <Sparkles size={10} /> Dicas — Imagem
            </p>
            <ul className="text-[10px] text-gray-500 space-y-0.5">
              <li>Resolução: 1080x1080 ou 1080x1350</li>
              <li>Formatos: JPG, PNG (convertido automaticamente)</li>
              <li>Máximo: 8MB por arquivo</li>
            </ul>
          </div>
        )}
        {videoTips && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1">
              <Film size={10} /> Dicas —{' '}
              {postType === 'REELS' ? 'Reels' : postType === 'STORIES' ? 'Story' : 'Vídeo'}
            </p>
            <ul className="text-[10px] text-gray-500 space-y-0.5">
              <li>Formato: MP4 ou MOV (H.264 + AAC)</li>
              {postType === 'STORIES' ? (
                <>
                  <li>Story: imagem ou vídeo vertical 9:16</li>
                  <li>Vídeo de story: até 60 segundos, máximo ~95MB</li>
                </>
              ) : (
                <>
                  <li>Reels: 9:16, até 90 segundos</li>
                  <li>Vídeo no feed: até 60 segundos, máximo de 100MB</li>
                </>
              )}
              <li>A URL pública deve estar acessível para o Instagram</li>
            </ul>
          </div>
        )}
        {when !== 'now' && (
          <div className={`ig-create-preview-badge ig-create-preview-badge--${when}`}>
            {when === 'schedule'
              ? `Agendado: ${formatScheduleLabel(scheduledAt)}`
              : 'Rascunho — nao publicado'}
          </div>
        )}
      </aside>

      <InstagramCaptionTemplatesModal
        open={templatesOpen}
        brandId={brandId}
        brandName={profile?.name || profile?.username}
        currentCaption={caption}
        onClose={() => setTemplatesOpen(false)}
        onApply={(text, mode) => {
          patchForm({
            caption: mode === 'append' && caption.trim() ? `${caption.trim()}\n\n${text}` : text,
          })
        }}
      />

      <InstagramPublishModal
        open={publishModalOpen}
        phase={publishPhase}
        postTypeLabel={POST_TYPE_LABELS[postType]}
        username={profile?.username}
        previewUrl={mediaItems[0]?.url}
        permalink={publishPermalink}
        scheduledAtLabel={when === 'schedule' ? formatScheduleLabel(scheduledAt) : undefined}
        message={publishMessage}
        onClose={closePublishModal}
        onCreateAnother={
          publishPhase === 'success' || publishPhase === 'scheduled' || publishPhase === 'draft'
            ? handleCreateAnother
            : undefined
        }
        onViewQueue={
          publishPhase === 'scheduled' || publishPhase === 'draft' ? handleViewQueue : undefined
        }
        savedPostId={savedPostId}
      />
    </div>
  )
}

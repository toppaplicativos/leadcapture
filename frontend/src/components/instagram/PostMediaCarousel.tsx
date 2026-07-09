import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PostMediaThumb } from '@/components/instagram/PostMediaThumb'
import type { PostType } from '@/lib/instagram/createForm'

type PostLike = {
  media_type?: PostType | string
  media_url?: string
  thumbnail_url?: string
  media_items?: Array<{ url: string; type?: string }>
}

export function PostMediaCarousel({ post, className }: { post: PostLike; className?: string }) {
  const items = Array.isArray(post.media_items) ? post.media_items.filter((i) => i?.url) : []
  const [idx, setIdx] = useState(0)

  if (items.length <= 1) {
    return <PostMediaThumb post={post} className={className} />
  }

  const current = items[idx]
  const slice: PostLike = {
    ...post,
    media_url: current.url,
    media_items: [current],
    media_type: current.type === 'video' ? 'VIDEO' : post.media_type,
  }

  const prev = () => setIdx((i) => (i <= 0 ? items.length - 1 : i - 1))
  const next = () => setIdx((i) => (i >= items.length - 1 ? 0 : i + 1))

  return (
    <div className={`ig-media-carousel${className ? ` ${className}` : ''}`}>
      <PostMediaThumb post={slice} className="ig-media-carousel__thumb" />
      <button type="button" className="ig-media-carousel__nav ig-media-carousel__nav--prev" onClick={prev} aria-label="Mídia anterior">
        <ChevronLeft size={16} />
      </button>
      <button type="button" className="ig-media-carousel__nav ig-media-carousel__nav--next" onClick={next} aria-label="Próxima mídia">
        <ChevronRight size={16} />
      </button>
      <span className="ig-media-carousel__count">
        {idx + 1} / {items.length}
      </span>
    </div>
  )
}
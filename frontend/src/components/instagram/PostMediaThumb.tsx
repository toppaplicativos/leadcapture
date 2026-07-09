import { Film, Images } from 'lucide-react'
import type { PostType } from '@/lib/instagram/createForm'

type PostLike = {
  media_type?: PostType | string
  media_url?: string
  thumbnail_url?: string
  media_items?: Array<{ url: string; type?: string }>
}

function resolveThumb(post: PostLike): { url?: string; isVideo: boolean; carouselCount: number } {
  const items = Array.isArray(post.media_items) ? post.media_items : []
  const first = items[0]
  const url = first?.url || post.media_url || post.thumbnail_url
  const isVideo =
    first?.type === 'video' ||
    post.media_type === 'REELS' ||
    post.media_type === 'VIDEO'
  return { url, isVideo, carouselCount: items.length }
}

export function PostMediaThumb({ post, className }: { post: PostLike; className?: string }) {
  const { url, isVideo, carouselCount } = resolveThumb(post)
  if (!url) return null

  return (
    <div className={className}>
      {isVideo ? (
        <video src={url} className="ig-post-thumb__media" muted playsInline preload="metadata" />
      ) : (
        <img src={url} alt="" className="ig-post-thumb__media" />
      )}
      {isVideo && (
        <span className="ig-post-thumb__badge">
          <Film size={12} /> Video
        </span>
      )}
      {carouselCount > 1 && (
        <span className="ig-post-thumb__badge ig-post-thumb__badge--carousel">
          <Images size={12} /> {carouselCount}
        </span>
      )}
    </div>
  )
}
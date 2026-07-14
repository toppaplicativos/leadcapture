import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image, Loader2, Search, Package, Camera, Sparkles, Award, Megaphone,
  FolderOpen, Layers, Wand2, LayoutGrid, Copy, Share2, X, Play, Download,
} from 'lucide-react'
import { affiliateApi } from '@/lib/api-affiliate'
import { AffiliateMaterialStudio } from '@/pages/affiliate/AffiliateMaterialStudio'
import type { AppContext } from '@/pages/affiliate/types'

type LibraryFolder = {
  slug: string
  label: string
  icon: string
  count: number
}

type LibraryItem = {
  id: string
  title: string
  type: 'image' | 'video'
  media_url: string
  thumbnail_url?: string | null
  folder: string
  folder_label: string
  category?: string | null
  channel?: string | null
  product_id?: string | null
  product_name?: string | null
  source?: string
  copy_text?: string | null
  material_id?: string | null
}

type Props = { ctx: AppContext }

const FOLDER_ICONS: Record<string, typeof Image> = {
  all: LayoutGrid,
  programa: Sparkles,
  posts: Camera,
  produtos: Package,
  marca: Award,
  campanhas: Megaphone,
  ia: Wand2,
  uploads: FolderOpen,
  publicidade: Image,
  outros: Layers,
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'video') return <Play size={12} className="fill-current" />
  return <Image size={12} />
}

/**
 * Biblioteca de materiais do programa — galeria por pastas:
 * posts, produtos, marca/logo, campanhas, criativos IA e materiais do programa.
 */
export function AffiliateMaterialsPanel({ ctx }: Props) {
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [items, setItems] = useState<LibraryItem[]>([])
  const [totalAll, setTotalAll] = useState(0)
  const [loading, setLoading] = useState(true)
  const [folder, setFolder] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'' | 'image' | 'video'>('')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [active, setActive] = useState<LibraryItem | null>(null)
  const [preview, setPreview] = useState<LibraryItem | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 280)
    return () => window.clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await affiliateApi.materialsLibrary({
        region: ctx.affiliate?.region,
        folder: folder || 'all',
        type: typeFilter || undefined,
        q: qDebounced || undefined,
      })
      setFolders(res.folders || [])
      setItems((res.items || []) as LibraryItem[])
      setTotalAll(Number(res.total_all || 0))
    } catch {
      setFolders([])
      setItems([])
      ctx.showToast('Erro ao carregar materiais', 'err')
    } finally {
      setLoading(false)
    }
  }, [ctx, folder, typeFilter, qDebounced])

  useEffect(() => {
    void load()
  }, [load, ctx.cacheVersion])

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of folders) m.set(f.slug, f.count)
    return m
  }, [folders])

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      ctx.showToast('Link da mídia copiado!')
    } catch {
      ctx.showToast('Não foi possível copiar', 'err')
    }
  }

  function openShare(item: LibraryItem) {
    // MaterialStudio / ShareStudio precisam de id de material real para legenda IA
    if (item.material_id) {
      setActive(item)
      return
    }
    setPreview(item)
  }

  if (active?.material_id) {
    return (
      <AffiliateMaterialStudio
        material={{
          id: active.material_id,
          title: active.title,
          type: active.type,
          media_url: active.media_url,
          category: active.category,
          channel: active.channel,
        }}
        ctx={ctx}
        onClose={() => setActive(null)}
      />
    )
  }

  return (
    <div className="aff-lib pb-3">
      {/* Header compacto */}
      <header className="aff-lib__header">
        <div className="aff-lib__header-row">
          <div>
            <h2 className="aff-lib__title">Materiais</h2>
            <p className="aff-lib__sub">
              Galeria da marca — posts, produtos, logos e artes do programa
            </p>
          </div>
          <span className="aff-lib__count" style={{ color: ctx.primary }}>
            {totalAll}
          </span>
        </div>

        <div className="aff-lib__search">
          <Search size={15} className="aff-lib__search-icon" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, produto…"
            className="aff-lib__search-input"
            aria-label="Buscar materiais"
          />
          {q && (
            <button type="button" className="aff-lib__search-clear" onClick={() => setQ('')} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="aff-lib__type-row" role="group" aria-label="Tipo de mídia">
          {([
            { id: '' as const, label: 'Tudo' },
            { id: 'image' as const, label: 'Imagens' },
            { id: 'video' as const, label: 'Vídeos' },
          ]).map((t) => (
            <button
              key={t.id || 'all'}
              type="button"
              className={`aff-lib__chip${typeFilter === t.id ? ' is-on' : ''}`}
              style={typeFilter === t.id ? { backgroundColor: ctx.primary, borderColor: ctx.primary } : undefined}
              onClick={() => setTypeFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Pastas horizontais */}
      <nav className="aff-lib__folders" aria-label="Pastas da galeria">
        {(folders.length ? folders : [{ slug: 'all', label: 'Todos', icon: 'layout-grid', count: 0 }]).map((f) => {
          const Icon = FOLDER_ICONS[f.slug] || FolderOpen
          const on = folder === f.slug
          return (
            <button
              key={f.slug}
              type="button"
              className={`aff-lib__folder${on ? ' is-on' : ''}`}
              style={on ? { borderColor: ctx.primary, backgroundColor: `${ctx.primary}12` } : undefined}
              onClick={() => setFolder(f.slug)}
              aria-current={on ? 'true' : undefined}
            >
              <span
                className="aff-lib__folder-icon"
                style={on ? { color: ctx.primary, backgroundColor: `${ctx.primary}18` } : undefined}
              >
                <Icon size={16} />
              </span>
              <span className="aff-lib__folder-label">{f.label}</span>
              <span className="aff-lib__folder-count">{folderCounts.get(f.slug) ?? f.count}</span>
            </button>
          )
        })}
      </nav>

      {/* Grid */}
      {loading ? (
        <div className="aff-lib__grid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aff-lib__skel" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="aff-lib__empty">
          <div className="aff-lib__empty-icon">
            <Image size={28} strokeWidth={1.5} />
          </div>
          <p className="aff-lib__empty-title">Nada nesta pasta</p>
          <p className="aff-lib__empty-text">
            {qDebounced
              ? 'Nenhum material corresponde à busca. Tente outro termo.'
              : 'Quando a marca publicar posts, fotos de produtos ou artes do programa, eles aparecem aqui organizados por pasta.'}
          </p>
          {(folder !== 'all' || typeFilter || qDebounced) && (
            <button
              type="button"
              className="aff-lib__empty-btn"
              style={{ backgroundColor: ctx.primary }}
              onClick={() => {
                setFolder('all')
                setTypeFilter('')
                setQ('')
              }}
            >
              Ver todos os materiais
            </button>
          )}
        </div>
      ) : (
        <div className="aff-lib__grid">
          {items.map((item) => (
            <article key={item.id} className="aff-lib__card">
              <button
                type="button"
                className="aff-lib__thumb"
                onClick={() => openShare(item)}
                aria-label={`Abrir ${item.title}`}
              >
                {item.type === 'video' ? (
                  <>
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt="" className="aff-lib__media" loading="lazy" />
                    ) : (
                      <div className="aff-lib__media aff-lib__media--ph" />
                    )}
                    <span className="aff-lib__play"><Play size={18} fill="currentColor" /></span>
                  </>
                ) : (
                  <img
                    src={item.thumbnail_url || item.media_url}
                    alt=""
                    className="aff-lib__media"
                    loading="lazy"
                  />
                )}
                <span className="aff-lib__badge">
                  <TypeIcon type={item.type} />
                  {item.folder_label}
                </span>
              </button>
              <div className="aff-lib__meta">
                <p className="aff-lib__name" title={item.title}>{item.title}</p>
                {item.product_name && (
                  <p className="aff-lib__hint">{item.product_name}</p>
                )}
                <div className="aff-lib__actions">
                  <button
                    type="button"
                    className="aff-lib__action"
                    style={{ color: ctx.primary }}
                    onClick={() => openShare(item)}
                  >
                    <Share2 size={13} /> Usar
                  </button>
                  <button
                    type="button"
                    className="aff-lib__action"
                    onClick={() => copyUrl(item.media_url)}
                  >
                    <Copy size={13} /> Link
                  </button>
                  <a
                    className="aff-lib__action"
                    href={item.media_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    <Download size={13} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Preview sheet para itens sem material_id (só compartilhar URL / ver) */}
      {preview && !preview.material_id && (
        <div className="aff-lib-sheet" role="dialog" aria-modal="true" aria-label={preview.title}>
          <button type="button" className="aff-lib-sheet__backdrop" aria-label="Fechar" onClick={() => setPreview(null)} />
          <div className="aff-lib-sheet__panel">
            <div className="aff-lib-sheet__head">
              <div className="min-w-0">
                <p className="aff-lib-sheet__kicker">{preview.folder_label}</p>
                <h3 className="aff-lib-sheet__title">{preview.title}</h3>
              </div>
              <button type="button" className="aff-lib-sheet__close" onClick={() => setPreview(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="aff-lib-sheet__preview">
              {preview.type === 'video' ? (
                <video src={preview.media_url} controls playsInline className="aff-lib-sheet__media" />
              ) : (
                <img src={preview.media_url} alt={preview.title} className="aff-lib-sheet__media" />
              )}
            </div>
            <div className="aff-lib-sheet__actions">
              <button
                type="button"
                className="aff-lib-sheet__btn"
                style={{ backgroundColor: ctx.primary }}
                onClick={() => {
                  const text = encodeURIComponent(
                    `${preview.title}${ctx.affiliate?.coupon_code ? ` · cupom ${ctx.affiliate.coupon_code}` : ''}`,
                  )
                  window.open(`https://wa.me/?text=${text}%20${encodeURIComponent(preview.media_url)}`, '_blank')
                }}
              >
                <Share2 size={15} /> WhatsApp
              </button>
              <button type="button" className="aff-lib-sheet__btn aff-lib-sheet__btn--ghost" onClick={() => copyUrl(preview.media_url)}>
                <Copy size={15} /> Copiar link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

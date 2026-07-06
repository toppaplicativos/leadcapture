import { useEffect, useState, useCallback } from 'react'
import { Loader2, Package, Plus, Search } from 'lucide-react'
import { getHeaders, money } from '@/lib/admin/helpers'
import { useProductsBridgeOptional } from '@/lib/agent/ProductsBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'

export function ProductsInlinePanel() {
  const bridge = useProductsBridgeOptional()
  const { openCanvas } = useAgentShell()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/products', { headers: getHeaders() })
      const d = await r.json()
      const list = d.products || []
      setProducts(list)
      const active = list.filter((p: any) => p.active !== false && p.is_active !== false).length
      const drafts = list.filter((p: any) => p?.metadata?.is_draft).length
      bridge?.publishSnapshot({
        total: list.length,
        active,
        drafts,
        search,
        loading: false,
      })
    } catch {
      bridge?.publishSnapshot({ loading: false })
    } finally {
      setLoading(false)
    }
  }, [bridge, search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!bridge) return
    return bridge.registerHandlers({
      search: (q) => setSearch(q),
      selectProduct: (id, name) => {
        bridge.publishSnapshot({ selectedId: id, selectedName: name || '' })
        openCanvas('/produtos')
      },
      createNew: () => openCanvas('/produtos'),
      openFull: () => openCanvas('/produtos'),
      refresh: () => load(),
    })
  }, [bridge, load, openCanvas])

  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (p.name || '').toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <div className="catalog-panel__loading">
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="catalog-panel catalog-panel--products">
      <div className="catalog-panel__toolbar">
        <div className="catalog-panel__search">
          <Search size={13} className="text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              bridge?.publishSnapshot({ search: e.target.value })
            }}
            placeholder="Buscar produto…"
          />
        </div>
        <button
          type="button"
          className="catalog-panel__action"
          onClick={() => bridge?.dispatch({ type: 'create_new' })}
        >
          <Plus size={14} /> Novo
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="catalog-panel__empty">Nenhum produto. Crie pelo chat ou no gerenciador.</p>
      ) : (
        <div className="catalog-panel__grid">
          {filtered.slice(0, 8).map((p) => (
            <button
              key={p.id}
              type="button"
              className="catalog-panel__card"
              onClick={() => bridge?.dispatch({ type: 'select_product', id: p.id, name: p.name })}
            >
              <div className="catalog-panel__thumb">
                {(p.imageUrl || p.image) ? (
                  <img src={p.imageUrl || p.image} alt="" />
                ) : (
                  <Package size={18} className="text-gray-300" />
                )}
              </div>
              <span className="catalog-panel__label">{p.name}</span>
              <span className="catalog-panel__meta">{money(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
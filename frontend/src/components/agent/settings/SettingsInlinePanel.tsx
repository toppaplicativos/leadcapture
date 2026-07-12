import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { ExternalLink, Plus, Store, Settings } from 'lucide-react'
import { Skeleton } from '@/components/admin/primitives'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'
import { getHeaders } from '@/lib/admin/helpers'

const SettingsManager = lazy(() =>
  import('@/pages/admin/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
)

type BrandRow = {
  id: string
  name: string
  slug?: string
  logo_url?: string | null
}

export function SettingsInlinePanel() {
  const { openCanvas, triggerSkill } = useAgentShell()
  const isDesktop = useIsDesktop()
  const [loading, setLoading] = useState(true)
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [activeId, setActiveId] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/brands', { headers: getHeaders() })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Erro')
      setBrands(Array.isArray(d.brands) ? d.brands : [])
      setActiveId(String(d.active_brand_id || ''))
    } catch {
      setBrands([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openFull = useCallback(() => {
    if (isDesktop) openCanvas('/configuracoes')
    else setManagerOpen(true)
  }, [isDesktop, openCanvas])

  const openStore = useCallback(() => {
    triggerSkill('design.edit', {
      label: 'Studio da Loja',
      assistantMessage: 'Studio da loja — cores, logo e vitrine:',
    })
  }, [triggerSkill])

  if (loading) {
    return <Skeleton rows={3} variant="panel" />
  }

  return (
    <div className="catalog-panel catalog-panel--settings">
      <div className="catalog-panel__toolbar">
        <p className="text-[12px] text-gray-500">
          Conta · {brands.length} marca{brands.length === 1 ? '' : 's'}
          {activeId ? ' · uma ativa' : ''}
        </p>
        <div className="flex gap-1.5">
          <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openStore}>
            <Store size={14} /> Loja
          </button>
          <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openFull}>
            <ExternalLink size={14} /> Completo
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 px-0.5 -mt-1 mb-1">
        Conta, e-mail, senha e marcas. WhatsApp é ferramenta separada.
      </p>

      <ul className="space-y-1.5">
        {brands.slice(0, 5).map((b) => {
          const active = String(b.id) === String(activeId)
          return (
            <li
              key={b.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-gray-100 bg-white"
            >
              {b.logo_url ? (
                <img src={b.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-gray-100 grid place-items-center">
                  <Settings size={14} className="text-gray-400" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 truncate">
                  {b.name}
                  {active && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">
                      ativa
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-400 truncate">{b.slug || '—'}</p>
              </div>
            </li>
          )
        })}
        {brands.length === 0 && (
          <li className="text-[12px] text-gray-500 px-1 py-3">Nenhuma marca ainda. Crie em Configurações.</li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          className="catalog-panel__action"
          onClick={openFull}
        >
          <Plus size={14} /> Gerenciar brands
        </button>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openStore}>
          <Store size={14} /> Editar estilo da loja
        </button>
      </div>

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Configurações"
      >
        <Suspense fallback={<Skeleton rows={4} variant="settings" />}>
          <SettingsManager
            showToast={() => {}}
            onOpenStore={() => {
              setManagerOpen(false)
              openStore()
            }}
          />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}

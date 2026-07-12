import { useCallback, useState, lazy, Suspense } from 'react'
import { ExternalLink, Palette, Eye } from 'lucide-react'
import { Skeleton } from '@/components/admin/primitives'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'
import { getCachedActiveBrand } from '@/lib/brand-splash'

const StoreStudio = lazy(() =>
  import('@/pages/admin/store/StoreStudioPage').then((m) => ({ default: m.StoreStudioPage })),
)

export function StoreInlinePanel() {
  const { openCanvas } = useAgentShell()
  const isDesktop = useIsDesktop()
  const [managerOpen, setManagerOpen] = useState(false)
  const brand = getCachedActiveBrand()

  const openFull = useCallback(() => {
    if (isDesktop) openCanvas('/loja')
    else setManagerOpen(true)
  }, [isDesktop, openCanvas])

  return (
    <div className="catalog-panel catalog-panel--store">
      <div className="catalog-panel__toolbar">
        <p className="text-[12px] text-gray-500 truncate">
          {brand.name} · vitrine, cores e logo
        </p>
        <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={openFull}>
          <ExternalLink size={14} /> Abrir studio
        </button>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white mb-2">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
        ) : (
          <span className="w-12 h-12 rounded-xl bg-gray-900 grid place-items-center">
            <Palette size={18} className="text-white" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{brand.name}</p>
          <p className="text-[11px] text-gray-500">
            Edite cores, logo, capa e layout no Studio da Loja.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="catalog-panel__action" onClick={openFull}>
          <Palette size={14} /> Editar estilo
        </button>
        <button
          type="button"
          className="catalog-panel__action catalog-panel__action--ghost"
          onClick={() => openCanvas('/loja')}
        >
          <Eye size={14} /> Abrir no canvas
        </button>
      </div>

      <CatalogManagerSheet
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Studio da Loja"
      >
        <Suspense fallback={<Skeleton rows={4} variant="settings" />}>
          <StoreStudio />
        </Suspense>
      </CatalogManagerSheet>
    </div>
  )
}

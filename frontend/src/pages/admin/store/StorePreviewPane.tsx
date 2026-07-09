import { ExternalLink, Smartphone } from 'lucide-react'

export function StorePreviewPane({ slug }: { slug: string }) {
  if (!slug) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-gray-50 p-6 text-center text-sm text-gray-500">
        Salve a loja para visualizar o catálogo.
      </div>
    )
  }

  const previewUrl = `/catalogo/${encodeURIComponent(slug)}?preview=1`

  return (
    <div className="flex flex-col h-full min-h-[320px] lg:min-h-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-600">
          <Smartphone size={14} strokeWidth={1.75} aria-hidden />
          Pré-visualização
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:text-gray-900"
        >
          Abrir
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
      <div className="flex-1 rounded-2xl border border-border overflow-hidden bg-gray-100 shadow-inner">
        <iframe
          title="Pré-visualização do catálogo"
          src={previewUrl}
          className="w-full h-full min-h-[420px] lg:min-h-[560px] bg-white"
        />
      </div>
    </div>
  )
}
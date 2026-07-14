import { useState } from 'react'
import { ExternalLink, Monitor, Smartphone, Tablet } from 'lucide-react'

type PreviewDevice = 'mobile' | 'tablet' | 'desktop'

const DEVICES = [
  { id: 'mobile' as const, label: 'Celular', Icon: Smartphone },
  { id: 'tablet' as const, label: 'Tablet', Icon: Tablet },
  { id: 'desktop' as const, label: 'Desktop', Icon: Monitor },
]

export function StorePreviewPane({ slug }: { slug: string }) {
  const [device, setDevice] = useState<PreviewDevice>('mobile')
  if (!slug) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-gray-50 p-6 text-center text-sm text-gray-500">
        Salve a loja para visualizar o catálogo.
      </div>
    )
  }

  const previewUrl = `/catalogo/${encodeURIComponent(slug)}?preview=1`

  return (
    <div className="rounded-2xl border border-border-light bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[12px] font-semibold text-gray-800">Pré-visualização</p>
          <p className="text-[10px] text-gray-400">Confira sem sair do editor</p>
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
      <div className="mb-3 grid grid-cols-3 rounded-xl bg-gray-100 p-1" aria-label="Dispositivo da pré-visualização">
        {DEVICES.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setDevice(id)} aria-pressed={device === id} title={label}
            className={`min-h-9 rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-semibold transition ${device === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            <Icon size={13} aria-hidden />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>
      <div className="h-[440px] rounded-xl border border-border overflow-auto bg-gray-100 p-2">
        <div className={`mx-auto h-full overflow-hidden bg-white shadow-sm transition-[width,border-radius] ${device === 'mobile' ? 'w-[280px] max-w-full rounded-[22px]' : device === 'tablet' ? 'w-[520px] max-w-full rounded-[16px]' : 'w-full rounded-lg'}`}>
          <iframe title={`Pré-visualização do catálogo em ${device}`} src={previewUrl} className="w-full h-full bg-white" />
        </div>
      </div>
    </div>
  )
}

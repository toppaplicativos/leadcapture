import { Images, Sparkles, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function GalleryEmpty({
  folder,
  hasFilters,
  onUpload,
}: {
  folder: string
  hasFilters: boolean
  onUpload: () => void
}) {
  if (hasFilters) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
        <p className="text-[15px] font-semibold text-gray-900">Nenhum resultado</p>
        <p className="text-[13px] text-gray-500 mt-1">Tente outro filtro ou limpe a busca.</p>
      </div>
    )
  }

  const isUploads = folder === 'uploads'

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 grid place-items-center mx-auto mb-3">
        {isUploads ? (
          <Upload size={22} className="text-gray-400" strokeWidth={1.5} />
        ) : (
          <Images size={22} className="text-gray-400" strokeWidth={1.5} />
        )}
      </div>
      <p className="text-[15px] font-semibold text-gray-900">
        {isUploads ? 'Nenhum upload ainda' : 'Nada nesta pasta'}
      </p>
      <p className="text-[13px] text-gray-500 mt-1 max-w-sm mx-auto">
        {isUploads
          ? 'Envie imagens ou vídeos para usar em campanhas, posts e produtos.'
          : folder === 'ia'
            ? 'Gere criativos em Criativos IA — eles aparecem aqui automaticamente.'
            : 'Os itens entram nesta pasta quando você os usa em campanhas, posts ou produtos.'}
      </p>
      <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
        {isUploads ? (
          <Button onClick={onUpload} iconLeft={<Upload size={15} />}>
            Fazer upload
          </Button>
        ) : (
          <Link to="/criativos">
            <Button variant="secondary" iconLeft={<Sparkles size={15} />}>
              Ir para Criativos IA
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
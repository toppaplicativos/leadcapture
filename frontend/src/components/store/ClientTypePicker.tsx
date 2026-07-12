import type { PublicClientType } from '@/lib/api'

export function ClientTypePicker({
  types,
  value,
  onChange,
  label = 'Como você se identifica?',
  hint = 'Escolha o tipo que melhor descreve você para esta loja.',
  required = false,
}: {
  types: PublicClientType[]
  value?: string
  onChange: (typeName: string) => void
  label?: string
  hint?: string
  required?: boolean
}) {
  if (!types.length) return null

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[12px] font-semibold text-gray-700">
          {label}
          {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </p>
        {hint && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2" role="listbox" aria-label={label}>
        {types.map((t) => {
          const active = value === t.name
          const color = t.color || 'var(--brand-secondary, #171717)'
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(t.name)}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-full text-[12px] font-semibold border transition ${
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-700 border-border hover:bg-gray-50'
              }`}
              style={
                active
                  ? { background: color, borderColor: color }
                  : { borderColor: undefined }
              }
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: active ? 'rgba(255,255,255,0.9)' : color }}
                aria-hidden
              />
              {t.name}
            </button>
          )
        })}
      </div>
      {value && (
        <p className="text-[11px] text-gray-500">
          Selecionado: <strong className="text-gray-800">{value}</strong>
        </p>
      )}
    </div>
  )
}

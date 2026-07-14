import type { ReactNode } from 'react'
import { StoreWhatsAppFab } from '@/components/store/StoreWhatsAppFab'
import {
  WA_COLOR_OPTIONS,
  WA_CONTENT_OPTIONS,
  WA_EFFECT_OPTIONS,
  WA_SHAPE_OPTIONS,
  WA_SIZE_OPTIONS,
  type StoreWhatsAppButtonDesign,
  type WaBtnColorPreset,
  type WaBtnContent,
  type WaBtnEffect,
  type WaBtnShape,
  type WaBtnSize,
} from '@/lib/store-marketing'

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-[11px] font-semibold text-gray-700">{children}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

function ChoiceGrid({
  columns = 3,
  children,
}: {
  columns?: 2 | 3 | 4
  children: ReactNode
}) {
  const col =
    columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
  return <div className={`grid ${col} gap-2`}>{children}</div>
}

function ChoiceButton({
  active,
  onClick,
  title,
  subtitle,
  swatch,
}: {
  active: boolean
  onClick: () => void
  title: string
  subtitle?: string
  swatch?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border px-2.5 py-2.5 transition min-h-[44px] ${
        active
          ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
          : 'border-border bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="flex items-center gap-2">
        {swatch && (
          <span
            className="w-4 h-4 rounded-full shrink-0 ring-1 ring-black/10"
            style={{ background: swatch }}
            aria-hidden
          />
        )}
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold leading-tight">{title}</span>
          {subtitle && (
            <span
              className={`block text-[10px] mt-0.5 leading-snug ${
                active ? 'text-white/70' : 'text-gray-500'
              }`}
            >
              {subtitle}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export function WhatsAppButtonStyleSection({
  design,
  onChange,
  brandPrimary,
  phoneDigits,
  prefilledMessage,
  fabPosition,
}: {
  design: StoreWhatsAppButtonDesign
  onChange: (next: StoreWhatsAppButtonDesign) => void
  brandPrimary?: string
  phoneDigits?: string
  prefilledMessage?: string
  fabPosition: 'bottom-right' | 'bottom-left'
}) {
  function patch(partial: Partial<StoreWhatsAppButtonDesign>) {
    let next = { ...design, ...partial }

    // Círculo = só ícone (comportamento nativo de FAB)
    if (next.shape === 'circle' && next.content !== 'icon') {
      next = { ...next, content: 'icon' }
    }
    // Com só texto, evita círculo
    if (next.content === 'text' && next.shape === 'circle') {
      next = { ...next, shape: 'pill' }
    }
    onChange(next)
  }

  const isCustom = design.color_preset === 'custom'

  return (
    <div className="space-y-5">
        {/* Prévia — mesmo componente do catálogo */}
        <div className="rounded-2xl border border-dashed border-border bg-gray-50 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.35] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(0deg, transparent 24%, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.03) 26%, transparent 27%, transparent 74%, rgba(0,0,0,0.03) 75%, rgba(0,0,0,0.03) 76%, transparent 77%), linear-gradient(90deg, transparent 24%, rgba(0,0,0,0.03) 25%, rgba(0,0,0,0.03) 26%, transparent 27%, transparent 74%, rgba(0,0,0,0.03) 75%, rgba(0,0,0,0.03) 76%, transparent 77%)',
              backgroundSize: '18px 18px',
            }}
            aria-hidden
          />
          <div className="relative px-4 pt-3 pb-16 min-h-[140px]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Prévia ao vivo · flutuante
            </p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-[16rem]">
              O botão fica fixo no canto da tela do catálogo (acima do menu inferior).
            </p>
            <div className="absolute bottom-3 right-3 left-3 flex justify-end pointer-events-none">
              <div className="pointer-events-auto scale-[0.92] origin-bottom-right">
                <StoreWhatsAppFab
                  mode="preview"
                  phone={phoneDigits || '5511999999999'}
                  message={prefilledMessage}
                  position={fabPosition}
                  design={design}
                  brandPrimary={brandPrimary}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Formato */}
        <div>
          <FieldLabel hint="Círculo é o FAB clássico (só ícone).">Formato</FieldLabel>
          <ChoiceGrid columns={3}>
            {WA_SHAPE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.id}
                active={design.shape === opt.id}
                onClick={() => patch({ shape: opt.id as WaBtnShape })}
                title={opt.label}
                subtitle={opt.hint}
              />
            ))}
          </ChoiceGrid>
        </div>

        {/* Tamanho */}
        <div>
          <FieldLabel>Tamanho</FieldLabel>
          <ChoiceGrid columns={3}>
            {WA_SIZE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.id}
                active={design.size === opt.id}
                onClick={() => patch({ size: opt.id as WaBtnSize })}
                title={opt.label}
              />
            ))}
          </ChoiceGrid>
        </div>

        {/* Conteúdo / texto */}
        <div>
          <FieldLabel hint="No círculo, só ícone é permitido.">Conteúdo</FieldLabel>
          <ChoiceGrid columns={3}>
            {WA_CONTENT_OPTIONS.map((opt) => {
              const disabled = design.shape === 'circle' && opt.id !== 'icon'
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ content: opt.id as WaBtnContent })}
                  aria-pressed={design.content === opt.id}
                  className={`text-left rounded-xl border px-2.5 py-2.5 transition min-h-[44px] ${
                    design.content === opt.id
                      ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                      : disabled
                        ? 'border-border bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-border bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="block text-[12px] font-semibold leading-tight">{opt.label}</span>
                  <span
                    className={`block text-[10px] mt-0.5 ${
                      design.content === opt.id ? 'text-white/70' : 'text-gray-500'
                    }`}
                  >
                    {opt.hint}
                  </span>
                </button>
              )
            })}
          </ChoiceGrid>

          {design.content !== 'icon' && (
            <div className="mt-3">
              <label
                htmlFor="wa-btn-label"
                className="block text-[11px] font-semibold text-gray-700 mb-1.5"
              >
                Texto do botão
              </label>
              <input
                id="wa-btn-label"
                type="text"
                maxLength={40}
                value={design.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Chamar no WhatsApp"
                className="w-full h-11 px-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900"
              />
            </div>
          )}
        </div>

        {/* Cores */}
        <div>
          <FieldLabel hint="Marca usa a cor primária da loja.">Cores</FieldLabel>
          <ChoiceGrid columns={3}>
            {WA_COLOR_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.id}
                active={design.color_preset === opt.id}
                onClick={() => patch({ color_preset: opt.id as WaBtnColorPreset })}
                title={opt.label}
                swatch={opt.swatch}
              />
            ))}
          </ChoiceGrid>

          {isCustom && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Fundo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={design.bg_color}
                    onChange={(e) => patch({ bg_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5 bg-white"
                    aria-label="Cor de fundo"
                  />
                  <input
                    type="text"
                    value={design.bg_color}
                    onChange={(e) => patch({ bg_color: e.target.value })}
                    className="flex-1 h-10 px-2 rounded-lg border border-border text-[12px] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Texto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={design.text_color}
                    onChange={(e) => patch({ text_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5 bg-white"
                    aria-label="Cor do texto"
                  />
                  <input
                    type="text"
                    value={design.text_color}
                    onChange={(e) => patch({ text_color: e.target.value })}
                    className="flex-1 h-10 px-2 rounded-lg border border-border text-[12px] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Borda</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={design.border_color}
                    onChange={(e) => patch({ border_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5 bg-white"
                    aria-label="Cor da borda"
                  />
                  <input
                    type="text"
                    value={design.border_color}
                    onChange={(e) => patch({ border_color: e.target.value })}
                    className="flex-1 h-10 px-2 rounded-lg border border-border text-[12px] font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Efeitos */}
        <div>
          <FieldLabel>Efeitos</FieldLabel>
          <ChoiceGrid columns={2}>
            {WA_EFFECT_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.id}
                active={design.effect === opt.id}
                onClick={() => patch({ effect: opt.id as WaBtnEffect })}
                title={opt.label}
                subtitle={opt.hint}
              />
            ))}
          </ChoiceGrid>
        </div>
    </div>
  )
}

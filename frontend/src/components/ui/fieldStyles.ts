/**
 * Shared form control classes — product register (ink focus, true neutrals).
 * Prefer Input / Select / Textarea components; use these when raw markup is required.
 */
export const fieldControlClass =
  'w-full min-h-11 px-3.5 py-2.5 border border-border rounded-xl text-sm text-gray-900 bg-white ' +
  'placeholder:text-gray-400 transition-[border,box-shadow] duration-150 ' +
  'focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-900 ' +
  'disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed'

export const fieldSelectClass =
  fieldControlClass +
  ' h-11 py-0 pr-10 font-medium cursor-pointer appearance-none'

export const fieldTextareaClass =
  fieldControlClass + ' resize-none leading-relaxed'

export const fieldLabelClass =
  'block text-[12px] font-semibold text-gray-700 mb-1.5'

/** Prefer fieldLabelClass on new UI — uppercase tracking is legacy KPI grammar */
export const fieldLabelLegacyClass =
  'text-[11px] font-semibold text-gray-500 tracking-tight mb-1.5 block'

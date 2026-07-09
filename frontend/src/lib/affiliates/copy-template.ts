export type AffiliateCopyContext = {
  nome_afiliado?: string
  cupom?: string
  link_catalogo?: string
  marca?: string
  codigo?: string
}

const PLACEHOLDERS: Record<string, keyof AffiliateCopyContext> = {
  '{{nome_afiliado}}': 'nome_afiliado',
  '{{cupom}}': 'cupom',
  '{{link_catalogo}}': 'link_catalogo',
  '{{marca}}': 'marca',
  '{{codigo}}': 'codigo',
}

export function resolveAffiliateCopyTemplate(text: string, ctx: AffiliateCopyContext): string {
  if (!text) return ''
  let out = text
  for (const [token, key] of Object.entries(PLACEHOLDERS)) {
    const val = String(ctx[key] || '').trim()
    out = out.split(token).join(val)
  }
  return out
}

export const COPY_TEMPLATE_HINT =
  'Use {{nome_afiliado}}, {{cupom}}, {{link_catalogo}}, {{marca}} ou {{codigo}}'
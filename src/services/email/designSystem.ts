/**
 * Email Design System — table-based HTML compatible with major clients.
 * Mirrors product DESIGN.md: true neutrals, Inter stack, monochrome BrandMark.
 *
 * Official identity:
 * - Name: LeadCapture (never "LC", never colorful pin logo)
 * - Mark: monochrome target — brand-mark.png (light UI) / brand-mark-dark.png (dark UI)
 * - Type: Inter first, system stack fallback
 */

/** Canonical product name — single source for all system emails. */
export const PRODUCT_NAME = "LeadCapture"

/** Public origin for absolute asset URLs (email clients require absolute). */
export const EMAIL_PUBLIC_ORIGIN = "https://app.leadcapture.online"

export const EMAIL_DS = {
  ink: "#171717",
  muted: "#6b6b6b",
  subtle: "#9a9a9a",
  canvas: "#f5f5f5",
  surface: "#ffffff",
  surfaceAlt: "#fafafa",
  border: "#e5e5e5",
  borderLight: "#ededed",
  brand: "#0a0a0a",
  success: "#059669",
  successBg: "#ecfdf5",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  warning: "#d97706",
  warningBg: "#fffbeb",
  info: "#2563eb",
  infoBg: "#eff6ff",
  radius: "16px",
  radiusSm: "12px",
  radiusPill: "9999px",
  /**
   * Inter-first stack (matches frontend --font-sans / DESIGN.md).
   * Clients without Inter fall through to system UI fonts.
   */
  font: "Inter,-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  /** Light theme mark — obsidian square, white target (use on light surfaces). */
  brandMarkUrl: `${EMAIL_PUBLIC_ORIGIN}/brand-mark.png`,
  /** Dark theme mark — white square, obsidian target (use on dark surfaces / header). */
  brandMarkDarkUrl: `${EMAIL_PUBLIC_ORIGIN}/brand-mark-dark.png`,
  /** @deprecated Use brandMarkUrl — kept so old templates with logoUrl still resolve if referenced. */
  logoUrl: `${EMAIL_PUBLIC_ORIGIN}/brand-mark.png`,
  productName: PRODUCT_NAME,
} as const

const d = EMAIL_DS

export type EmailLayoutKind = "system" | "tenant"

/**
 * Official monochrome BrandMark for email.
 * theme="light" → dark square (default, content areas)
 * theme="dark"  → light square (header on obsidian bar)
 */
export function emailBrandLogo(size = 32, theme: "light" | "dark" = "light"): string {
  const src = theme === "dark" ? d.brandMarkDarkUrl : d.brandMarkUrl
  return `<img src="${src}" width="${size}" height="${size}" alt="${PRODUCT_NAME}" style="display:block;width:${size}px;height:${size}px;border-radius:8px;border:0;object-fit:cover" />`
}

/** Wordmark next to the mark — normalized weight/tracking from DESIGN title scale. */
export function emailProductName(color = "#ffffff"): string {
  return `<span style="font-family:${d.font};font-size:15px;font-weight:700;letter-spacing:-0.022em;line-height:1.3;color:${color}">${PRODUCT_NAME}</span>`
}

/**
 * Content accent — official monochrome mark, never emoji / "LC" text.
 * First arg kept for call-site compatibility (ignored).
 */
export function emailIconBadge(_label?: string, bg: string = d.surfaceAlt): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
  <td style="width:48px;height:48px;border-radius:14px;background:${bg};border:1px solid ${d.borderLight};text-align:center;vertical-align:middle">
    <img src="${d.brandMarkUrl}" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;border-radius:7px;border:0;object-fit:cover;vertical-align:middle" />
  </td>
</tr></table>`
}

export function emailH1(text: string, color: string = d.ink): string {
  return `<h1 style="font-family:${d.font};font-size:22px;font-weight:700;letter-spacing:-0.025em;line-height:1.25;margin:0 0 12px;color:${color}">${text}</h1>`
}

export function emailP(text: string, margin = "0 0 14px"): string {
  return `<p style="font-family:${d.font};font-size:15px;line-height:1.55;color:#404040;margin:${margin}">${text}</p>`
}

export function emailMuted(text: string): string {
  return `<p style="font-family:${d.font};font-size:13px;line-height:1.5;color:${d.muted};margin:0 0 8px">${text}</p>`
}

export function emailCta(
  href: string,
  label: string,
  variant: "primary" | "secondary" | "brand" = "primary",
  brandColor?: string,
): string {
  const bg =
    variant === "secondary"
      ? d.surfaceAlt
      : variant === "brand"
        ? brandColor || d.brand
        : d.brand
  const color = variant === "secondary" ? d.ink : "#ffffff"
  const border = variant === "secondary" ? `border:1px solid ${d.border};` : ""
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;font-family:${d.font};font-weight:600;font-size:14px;letter-spacing:-0.01em;padding:13px 22px;border-radius:${d.radiusSm};${border}">${label}</a>`
}

export function emailCard(inner: string, opts?: { bg?: string; border?: string }): string {
  const bg = opts?.bg || d.surfaceAlt
  const border = opts?.border || d.borderLight
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:${d.radiusSm};margin:0 0 18px">
  <tr><td style="padding:16px 18px">${inner}</td></tr>
</table>`
}

export function emailKvRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:8px 0;font-size:12px;font-family:${d.font};color:${d.muted};border-bottom:1px solid ${d.borderLight}">${label}</td>
  <td style="padding:8px 0;font-size:13px;font-family:${d.font};font-weight:600;color:${d.ink};text-align:right;border-bottom:1px solid ${d.borderLight}">${value}</td>
</tr>`
}

export function emailKvTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
${rows.map(([l, v]) => emailKvRow(l, v)).join("")}
</table>`
}

export function emailDivider(): string {
  return `<div style="height:1px;background:${d.borderLight};margin:20px 0"></div>`
}

export function emailPill(text: string, tone: "success" | "danger" | "warning" | "info" | "neutral" = "neutral"): string {
  const map = {
    success: { bg: d.successBg, color: d.success },
    danger: { bg: d.dangerBg, color: d.danger },
    warning: { bg: d.warningBg, color: d.warning },
    info: { bg: d.infoBg, color: d.info },
    neutral: { bg: d.surfaceAlt, color: d.muted },
  }[tone]
  return `<span style="display:inline-block;background:${map.bg};color:${map.color};font-family:${d.font};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:5px 10px;border-radius:${d.radiusPill}">${text}</span>`
}

const FONT_PRELOAD = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style type="text/css">
  body, table, td, a, p, h1, h2, span { font-family: ${d.font} !important; }
</style>`

/** System layout — LeadCapture global brand (obsidian header + monochrome mark). */
export function systemEmailLayout(content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{subject}}</title>
${FONT_PRELOAD}
</head>
<body style="margin:0;padding:0;background:${d.canvas};font-family:${d.font};color:${d.ink};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.canvas};padding:36px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${d.surface};border-radius:20px;overflow:hidden;border:1px solid ${d.borderLight};box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <tr><td style="background:${d.brand};padding:16px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle">${emailBrandLogo(32, "dark")}</td>
            <td style="padding-left:12px;vertical-align:middle">
              ${emailProductName("#ffffff")}
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 28px 8px">
${content}
      </td></tr>
      <tr><td style="padding:20px 28px 24px;border-top:1px solid ${d.borderLight};background:${d.surfaceAlt}">
        <p style="margin:0 0 6px;font-size:11px;line-height:1.55;color:${d.muted};font-family:${d.font}">
          E-mail transacional da plataforma ${PRODUCT_NAME}.
        </p>
        <p style="margin:0;font-size:11px;line-height:1.55;color:${d.subtle};font-family:${d.font}">
          Se não reconhece esta mensagem, ignore com segurança.
        </p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:${d.subtle};margin:18px 0 0;letter-spacing:-0.01em;font-family:${d.font}">
      © ${PRODUCT_NAME} · <a href="https://leadcapture.online" style="color:${d.subtle};text-decoration:none">leadcapture.online</a>
    </p>
  </td></tr>
</table>
</body>
</html>`
}

/** Tenant layout — customer brand name + optional brand_color for CTA. */
export function tenantEmailLayout(content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{subject}}</title>
${FONT_PRELOAD}
</head>
<body style="margin:0;padding:0;background:${d.canvas};font-family:${d.font};color:${d.ink};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.canvas};padding:36px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${d.surface};border-radius:20px;overflow:hidden;border:1px solid ${d.borderLight};box-shadow:0 1px 3px rgba(0,0,0,0.04)">
      <tr><td style="padding:0">
        <div style="height:4px;background:{{brand_color}};line-height:4px;font-size:0">&nbsp;</div>
      </td></tr>
      <tr><td style="padding:22px 28px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:36px;vertical-align:middle">
              <img src="{{brand_logo_url}}" width="36" height="36" alt="{{brand_name}}" style="display:block;width:36px;height:36px;border-radius:9px;border:1px solid ${d.borderLight};object-fit:cover" />
            </td>
            <td style="padding-left:12px;vertical-align:middle">
              <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:-0.022em;color:${d.ink};font-family:${d.font}">{{brand_name}}</p>
              <p style="margin:4px 0 0;font-size:11px;color:${d.subtle};font-family:${d.font}">via ${PRODUCT_NAME}</p>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 28px 8px">
${content}
      </td></tr>
      <tr><td style="padding:18px 28px 22px;border-top:1px solid ${d.borderLight};background:${d.surfaceAlt}">
        <p style="margin:0 0 6px;font-size:11px;line-height:1.55;color:${d.muted};font-family:${d.font}">
          Você está recebendo este e-mail de <strong style="color:${d.ink}">{{brand_name}}</strong>.
        </p>
        <p style="margin:0;font-size:11px;line-height:1.55;color:${d.subtle};font-family:${d.font}">
          Para sair da lista, responda com o assunto “remover”.
        </p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:${d.subtle};margin:18px 0 0;font-family:${d.font}">
      Enviado por {{brand_name}} · Powered by ${PRODUCT_NAME}
    </p>
  </td></tr>
</table>
</body>
</html>`
}

export function brandCta(hrefVar: string, label: string): string {
  return `<a href="${hrefVar}" style="display:inline-block;background:{{brand_color}};color:#ffffff;text-decoration:none;font-family:${d.font};font-weight:600;font-size:14px;letter-spacing:-0.01em;padding:13px 22px;border-radius:${d.radiusSm}">${label}</a>`
}

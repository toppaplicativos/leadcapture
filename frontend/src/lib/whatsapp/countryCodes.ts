export const PAIRING_COUNTRY_CODES: [string, string][] = [
  ['55', 'Brasil'], ['1', 'EUA/Canada'], ['351', 'Portugal'], ['244', 'Angola'], ['258', 'Mocambique'],
  ['238', 'Cabo Verde'], ['245', 'Guine-Bissau'], ['239', 'S.Tome e Principe'], ['670', 'Timor-Leste'],
  ['54', 'Argentina'], ['56', 'Chile'], ['57', 'Colombia'], ['593', 'Equador'],
  ['52', 'Mexico'], ['51', 'Peru'], ['598', 'Uruguai'], ['58', 'Venezuela'], ['595', 'Paraguai'], ['591', 'Bolivia'],
  ['34', 'Espanha'], ['33', 'Franca'], ['49', 'Alemanha'], ['39', 'Italia'], ['44', 'Reino Unido'],
]

export function splitPhoneE164(phone: string | null | undefined): { country: string; local: string } {
  if (!phone) return { country: '55', local: '' }
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    const rawLocal = digits.slice(2)
    return { country: '55', local: normalizeBrazilLocalPhone(rawLocal).local }
  }
  if (digits.length >= 10) {
    return { country: '55', local: normalizeBrazilLocalPhone(digits).local }
  }
  return { country: '55', local: digits }
}

export type BrazilPhoneNormalization = {
  local: string
  e164: string
  adjusted: boolean
  hint?: string
}

/**
 * Normaliza celular BR no campo local (sem +55).
 * - 11 dígitos com 9 duplicado após DDD (85 99 …) → remove o 9 extra
 * - 10 dígitos (DDD + 8) → adiciona o 9 móvel no E.164 para pairing
 */
export function normalizeBrazilLocalPhone(raw: string): BrazilPhoneNormalization {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return { local: '', e164: '55', adjusted: false }

  let local = digits
  let adjusted = false
  let hint: string | undefined

  if (local.length === 11) {
    const modern = local.match(/^(\d{2})9(\d{8})$/)
    if (modern) {
      // já no formato DDD + 9 + 8 dígitos
    } else {
      const dupMobile9 = local.match(/^(\d{2})9(\d{9})$/)
      if (dupMobile9 && dupMobile9[2].startsWith('9')) {
        local = `${dupMobile9[1]}${dupMobile9[2].slice(1)}`
        adjusted = true
        hint = 'Removemos um 9 duplicado após o DDD.'
      }
    }
  }

  if (local.length > 11) {
    local = local.slice(0, 11)
    adjusted = true
    hint = hint || 'Número limitado a 11 dígitos (DDD + celular).'
  }

  let e164 = `55${local}`
  if (local.length === 10) {
    const legacy = local.match(/^(\d{2})(\d{8})$/)
    if (legacy) {
      if (legacy[2].startsWith('99')) {
        /* Prefixo incompleto (ex: 8599643747) — não inserir 9 extra */
        e164 = `55${legacy[1]}${legacy[2]}`
      } else {
        e164 = `55${legacy[1]}9${legacy[2]}`
        if (!adjusted) {
          hint = 'Incluímos o 9 do celular para o pareamento no WhatsApp.'
        }
      }
    }
  } else if (local.length === 11) {
    const modern = local.match(/^(\d{2})9(\d{8})$/)
    if (modern) {
      e164 = `55${modern[1]}9${modern[2]}`
    }
  }

  return { local, e164, adjusted, hint }
}

export function buildPairingPhoneE164(country: string, local: string): BrazilPhoneNormalization {
  const cc = String(country || '55').replace(/\D/g, '') || '55'
  if (cc === '55') return normalizeBrazilLocalPhone(local)
  const digits = String(local || '').replace(/\D/g, '')
  return { local: digits, e164: `${cc}${digits}`, adjusted: false }
}

/** Número local BR válido para pairing (10 legado ou 11 móvel). */
export function isBrazilLocalComplete(local: string): boolean {
  const d = String(local || '').replace(/\D/g, '')
  if (d.length === 11) return /^(\d{2})9\d{8}$/.test(d)
  if (d.length === 10) return /^(\d{2})\d{8}$/.test(d)
  return false
}

/**
 * Pronto para Continuar / gerar código.
 * 11 dígitos (DDD+9+8) ou legado 10 dígitos sem 9 móvel.
 * 10 dígitos com 9 após o DDD = prefixo incompleto (ex: 8599643747 → falta o último).
 */
export function isBrazilLocalReadyToSubmit(local: string): boolean {
  const d = String(local || '').replace(/\D/g, '')
  if (d.length === 11) return /^(\d{2})9\d{8}$/.test(d)
  if (d.length === 10) {
    const legacy = d.match(/^(\d{2})(\d{8})$/)
    if (!legacy) return false
    return !legacy[2].startsWith('99')
  }
  return false
}

export function formatPairingE164Display(e164: string): string {
  const d = String(e164 || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) {
    return `+55 ${formatBrazilPhoneDisplay(d.slice(2))}`
  }
  return `+${d}`
}

export function formatBrazilPhoneDisplay(local: string): string {
  const d = String(local || '').replace(/\D/g, '')
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return d
}

/** Normaliza código Baileys: 8 caracteres alfanuméricos (ex: ABNF6HHJ). */
export function normalizePairingCode(code: string): string {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

export function formatPairingCode(code: string): string {
  const raw = normalizePairingCode(code)
  if (raw.length <= 4) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/** Código cru de 8 caracteres — o que o WhatsApp aceita ao digitar (sem hífen). */
export function pairingCodeRaw(code: string): string {
  return normalizePairingCode(code)
}
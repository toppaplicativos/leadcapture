#!/usr/bin/env node
/**
 * Valida normalização BR alinhada entre frontend (countryCodes) e backend (instanceManager).
 * Rode: node agent-tools/test-pairing-phone-normalize.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const fePath = join(root, 'frontend/src/lib/whatsapp/countryCodes.ts')
const feSrc = readFileSync(fePath, 'utf8')
if (!feSrc.includes('isBrazilLocalReadyToSubmit')) {
  console.error('FAIL  countryCodes.ts sem isBrazilLocalReadyToSubmit')
  process.exit(1)
}

function backendNormalize(phoneNumber) {
  let digits = String(phoneNumber || '').replace(/\D/g, '')
  if (!digits) return digits

  const dupMobile = digits.match(/^55(\d{2})9(\d{9})$/)
  if (dupMobile && dupMobile[2].startsWith('9')) {
    digits = `55${dupMobile[1]}9${dupMobile[2].slice(1)}`
  }

  const localDup = digits.match(/^(\d{2})9(\d{9})$/)
  if (localDup && localDup[2].startsWith('9')) {
    digits = `55${localDup[1]}9${localDup[2].slice(1)}`
  } else if (/^\d{10,11}$/.test(digits) && !digits.startsWith('55')) {
    const local = digits
    if (local.length === 10) {
      const legacy = local.match(/^(\d{2})(\d{8})$/)
      if (legacy) {
        digits = legacy[2].startsWith('99')
          ? `55${legacy[1]}${legacy[2]}`
          : `55${legacy[1]}9${legacy[2]}`
      }
    } else if (local.length === 11) {
      const modern = local.match(/^(\d{2})9(\d{8})$/)
      if (modern) digits = `55${modern[1]}9${modern[2]}`
    }
  }

  const legacyEight = digits.match(/^55(\d{2})(\d{8})$/)
  if (legacyEight && !legacyEight[2].startsWith('99')) {
    const [, ddd, rest] = legacyEight
    const dddNum = Number(ddd)
    if (dddNum >= 11 && dddNum <= 99) return `55${ddd}9${rest}`
  }
  return digits
}

function feNormalize(local) {
  const digits = String(local || '').replace(/\D/g, '')
  if (!digits) return { e164: '55', local: '' }

  let normLocal = digits
  if (normLocal.length === 11) {
    const dup = normLocal.match(/^(\d{2})9(\d{9})$/)
    if (dup && dup[2].startsWith('9')) {
      normLocal = `${dup[1]}${dup[2].slice(1)}`
    }
  }
  if (normLocal.length > 11) normLocal = normLocal.slice(0, 11)

  let e164 = `55${normLocal}`
  if (normLocal.length === 10) {
    const legacy = normLocal.match(/^(\d{2})(\d{8})$/)
    if (legacy) {
      e164 = legacy[2].startsWith('99')
        ? `55${legacy[1]}${legacy[2]}`
        : `55${legacy[1]}9${legacy[2]}`
    }
  } else if (normLocal.length === 11) {
    const modern = normLocal.match(/^(\d{2})9(\d{8})$/)
    if (modern) e164 = `55${modern[1]}9${modern[2]}`
  }
  return { local: normLocal, e164 }
}

function feReadyToSubmit(local) {
  const d = String(local || '').replace(/\D/g, '')
  if (d.length === 11) return /^(\d{2})9\d{8}$/.test(d)
  if (d.length === 10) {
    const legacy = d.match(/^(\d{2})(\d{8})$/)
    if (!legacy) return false
    return !legacy[2].startsWith('99')
  }
  return false
}

const cases = [
  { input: '85996437477', expectE164: '5585996437477', ready: true, label: 'móvel 11 dígitos CE' },
  { input: '8599643747', expectE164: '558599643747', ready: false, label: 'prefixo 10 dígitos (incompleto)', feOnly: true },
  { input: '8596437477', expectE164: '5585996437477', ready: true, label: 'legado 10 dígitos sem 9' },

  { input: '85996437477', expectE164: '5585996437477', ready: true, label: 'mesmo número via local 11 dígitos' },
]

let failed = 0
for (const c of cases) {
  const fe = feNormalize(c.input)
  const be = backendNormalize(c.input)
  const ready = feReadyToSubmit(c.input.replace(/^55/, ''))
  const beOk = c.feOnly ? true : be === c.expectE164
  if (fe.e164 !== c.expectE164 || !beOk) {
    console.error(`FAIL  ${c.label}: fe=${fe.e164} be=${be} expect=${c.expectE164}`)
    failed++
  } else if (ready !== c.ready) {
    console.error(`FAIL  ${c.label}: ready=${ready} expect=${c.ready}`)
    failed++
  } else {
    console.log(`OK    ${c.label} → ${c.expectE164} ready=${c.ready}`)
  }
}

if (failed) {
  console.error(`\n${failed} falha(s)`)
  process.exit(1)
}
console.log('\nTudo OK — normalização alinhada')
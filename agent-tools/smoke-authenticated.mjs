#!/usr/bin/env node
/**
 * Smoke autenticado — valida módulos catalog no workspace.
 * Uso:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node agent-tools/smoke-authenticated.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gotoAdminWorkspace, openWorkspaceShortcut, waitForWorkspaceReady } from './smoke-workspace-helpers.mjs'

const require = createRequire(import.meta.url)
const pwRoot = join(homedir(), '.grok', 'skills', 'playwright', 'scripts', 'node_modules', 'playwright')
const { chromium } = require(pwRoot)

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''

const MODULES = [
  { label: 'Painel', selector: '.catalog-module--dashboard', titleRe: /painel|resumo|lead|campanha|produto|pedido/i, minCount: 1 },
  { label: 'Leads', selector: '.catalog-module--leads', titleRe: /lead/i, minCount: 1 },
  { label: 'Produtos', selector: '.catalog-module.is-expanded', titleRe: /produto/i, minCount: 1 },
  { label: 'Campanhas', selector: '.catalog-module.is-expanded', titleRe: /campanha/i },
  { label: 'Habilidades', selector: '.catalog-module--skills', titleRe: /habilidade/i, minCount: 1 },
  { label: 'Pedidos', selector: '.catalog-module--orders', titleRe: /pedido/i },
  { label: 'Instagram', selector: '.catalog-module--instagram', titleRe: /instagram/i, canvasHint: /studio completo no canvas/i },
  { label: 'Facebook', selector: '.catalog-module--facebook', titleRe: /facebook/i, canvasHint: /studio completo no canvas/i },
]

let failed = 0

function fail(msg) {
  failed++
  console.error(`FAIL  ${msg}`)
}

function ok(msg) {
  console.log(`OK    ${msg}`)
}

if (!EMAIL || !PASSWORD) {
  console.error('Defina SMOKE_EMAIL e SMOKE_PASSWORD')
  process.exit(1)
}

console.log(`Smoke autenticado: ${BASE}\n`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin/, { timeout: 45000 })
  ok('login → /admin')

  await waitForWorkspaceReady(page, 45000)
  ok('workspace carregado')

  const chunkErrors = consoleErrors.filter((e) =>
    /ChunkLoadError|Failed to load module|MIME type.*text\/html/i.test(e),
  )
  if (chunkErrors.length) fail(`chunk error: ${chunkErrors[0]}`)
  else ok('sem erros de chunk pós-login')

  for (const mod of MODULES) {
    consoleErrors.length = 0
    await gotoAdminWorkspace(page, BASE, 45000)
    await openWorkspaceShortcut(page, mod.label)
    if (mod.label === 'Painel') {
      await page.waitForFunction(() => {
        const stats = document.querySelector('.catalog-module--dashboard .catalog-module__stats')
        if (!stats) return false
        const n = parseInt(String(stats.textContent || '').match(/(\d+)\s*lead/i)?.[1] || '0', 10)
        return n >= 1
      }, { timeout: 20000 }).catch(() => null)
    }
    await page.waitForTimeout(800)

    const candidates = page.locator(mod.selector)
    let block = candidates.first()
    let title = ''
    const count = await candidates.count()
    for (let i = 0; i < count; i++) {
      const cand = candidates.nth(i)
      const t = (await cand.locator('.catalog-module__title, .inbox-module__title').first().textContent())?.trim() || ''
      if (mod.titleRe.test(t)) {
        block = cand
        title = t
        break
      }
    }
    const visible = await block.isVisible().catch(() => false)
    if (!visible || !title) {
      fail(`${mod.label} → módulo não visível (${mod.selector})`)
      continue
    }
    if (!mod.titleRe.test(title)) {
      fail(`${mod.label} → título inesperado: "${title}"`)
    } else {
      ok(`${mod.label} → módulo aberto ("${title}")`)
    }

    if (mod.minCount) {
      const num = parseInt(title.match(/\d+/)?.[0] || '0', 10)
      if (num < mod.minCount) {
        fail(`${mod.label} → contagem ${num} (esperado ≥ ${mod.minCount})`)
      } else {
        ok(`${mod.label} → KPI ${num}`)
      }
    }

    if (mod.canvasHint) {
      const hint = block.locator('.catalog-module__hint')
      const hintText = (await hint.textContent().catch(() => '')) || ''
      if (mod.canvasHint.test(hintText)) ok(`${mod.label} → hint canvas desktop`)
      else fail(`${mod.label} → hint canvas ausente ("${hintText.trim()}")`)
      const canvasEmbed = page.locator('.agent-canvas__embed')
      if (await canvasEmbed.isVisible().catch(() => false)) ok(`${mod.label} → canvas embed visível`)
      else fail(`${mod.label} → canvas embed não visível no desktop`)
    }

    const modChunks = consoleErrors.filter((e) =>
      /ChunkLoadError|Failed to load module/i.test(e),
    )
    if (modChunks.length) fail(`${mod.label} → ${modChunks[0]}`)

    const closeBtn = block.locator('.catalog-module__close, .inbox-module__close')
    if (await closeBtn.count()) {
      await closeBtn.first().click()
      await page.waitForTimeout(400)
    }
  }
} catch (err) {
  fail(`fluxo: ${err.message}`)
}

await browser.close()
console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
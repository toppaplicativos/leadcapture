#!/usr/bin/env node
/**
 * Smoke autenticado — valida módulos catalog no workspace.
 * Uso:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node agent-tools/smoke-authenticated.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const pwRoot = join(homedir(), '.grok', 'skills', 'playwright', 'scripts', 'node_modules', 'playwright')
const { chromium } = require(pwRoot)

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''

const MODULES = [
  { label: 'Painel', selector: '.catalog-module--dashboard', titleRe: /painel|lead|campanha|produto|pedido/i },
  { label: 'Leads', selector: '.catalog-module--leads', titleRe: /lead/i, minCount: 1 },
  { label: 'Produtos', selector: '.catalog-module.is-expanded', titleRe: /produto/i, minCount: 1 },
  { label: 'Campanhas', selector: '.catalog-module.is-expanded', titleRe: /campanha/i },
  { label: 'Habilidades', selector: '.catalog-module--skills', titleRe: /habilidade/i, minCount: 1 },
  { label: 'Pedidos', selector: '.catalog-module--orders', titleRe: /pedido/i },
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
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin/, { timeout: 30000 })
  ok('login → /admin')

  await page.waitForSelector('.workspace-welcome, .workspace-chat__messages', { timeout: 20000 })
  ok('workspace carregado')

  const chunkErrors = consoleErrors.filter((e) =>
    /ChunkLoadError|Failed to load module|MIME type.*text\/html/i.test(e),
  )
  if (chunkErrors.length) fail(`chunk error: ${chunkErrors[0]}`)
  else ok('sem erros de chunk pós-login')

  async function openShortcut(label) {
    const welcome = page.locator('.workspace-welcome__card').filter({ hasText: label })
    if (await welcome.count()) {
      await Promise.all([
        welcome.first().click(),
        page.waitForResponse(
          (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
          { timeout: 20000 },
        ).catch(() => null),
      ])
      return
    }
    await page.locator('.workspace-chat__menu-btn').click()
    await Promise.all([
      page.locator('.workspace-chat__shortcut').filter({ hasText: label }).first().click(),
      page.waitForResponse(
        (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
        { timeout: 20000 },
      ).catch(() => null),
    ])
  }

  for (const mod of MODULES) {
    consoleErrors.length = 0
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForSelector('.workspace-welcome, .workspace-chat__messages', { timeout: 20000 })
    await openShortcut(mod.label)
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
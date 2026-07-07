#!/usr/bin/env node
/**
 * Smoke autenticado — viewport mobile (iPhone 14).
 * Uso:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node agent-tools/smoke-authenticated-mobile.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const pwRoot = join(homedir(), '.grok', 'skills', 'playwright', 'scripts', 'node_modules', 'playwright')
const { chromium, devices } = require(pwRoot)

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''

const MODULES = [
  { label: 'Painel', selector: '.catalog-module--dashboard', titleRe: /painel|resumo|lead/i, minCount: 1, sheetBtn: /painel completo/i },
  { label: 'Leads', selector: '.catalog-module--leads', titleRe: /lead/i, minCount: 1 },
  { label: 'Produtos', selector: '.catalog-module.is-expanded', titleRe: /produto/i, minCount: 1, sheetBtn: /catálogo completo|ver catálogo/i },
  { label: 'Campanhas', selector: '.catalog-module.is-expanded', titleRe: /campanha/i },
  { label: 'Habilidades', selector: '.catalog-module--skills', titleRe: /habilidade/i, minCount: 1, sheetBtn: /gerenciar habilidade/i },
  { label: 'Pedidos', selector: '.catalog-module--orders', titleRe: /pedido/i },
  { label: 'Instagram', selector: '.catalog-module--instagram', titleRe: /instagram/i, sheetBtn: /instagram completo/i },
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

console.log(`Smoke mobile (iPhone 14): ${BASE}\n`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  ...devices['iPhone 14'],
})
await context.addInitScript(() => {
  localStorage.setItem('pwa-install-dismissed', '1')
  localStorage.setItem('pwa-install-dismissed-until', String(Date.now() + 86400000 * 30))
})
const page = await context.newPage()

async function dismissPwaBanner() {
  const dialog = page.locator('[aria-label="Instalar app"]')
  if (await dialog.isVisible().catch(() => false)) {
    await page.locator('[aria-label="Instalar app"] button[aria-label="Fechar"]').click({ timeout: 3000 }).catch(() => null)
    await page.locator('[aria-label="Instalar app"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null)
  }
}

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
  ok('login → /admin (mobile)')

  await page.waitForSelector('.workspace-welcome, .workspace-chat__messages', { timeout: 20000 })
  await dismissPwaBanner()
  ok('workspace carregado')

  const footer = page.locator('.workspace-chat__footer')
  if (await footer.isVisible()) ok('footer do chat visível')
  else fail('footer do chat não visível')

  const footerPad = await footer.evaluate((el) => getComputedStyle(el).paddingBottom)
  if (footerPad && footerPad !== '0px') ok(`footer safe-area padding (${footerPad})`)
  else fail('footer sem padding inferior')

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
    await dismissPwaBanner()
    await openShortcut(mod.label)
    await page.waitForTimeout(900)

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
      fail(`${mod.label} → módulo inline não visível`)
      continue
    }
    ok(`${mod.label} → inline ("${title}")`)

    if (mod.minCount) {
      const num = parseInt(title.match(/\d+/)?.[0] || '0', 10)
      if (num < mod.minCount) fail(`${mod.label} → KPI ${num}`)
      else ok(`${mod.label} → KPI ${num}`)
    }

    const body = block.locator('.catalog-module__body')
    if (await body.isVisible().catch(() => false)) ok(`${mod.label} → painel expandido`)
    else fail(`${mod.label} → corpo do módulo não expandido`)

    if (mod.sheetBtn) {
      await dismissPwaBanner()
      const openBtn = block.locator('.catalog-panel__open-manager, .catalog-panel__more').filter({ hasText: mod.sheetBtn })
      if (await openBtn.count()) {
        await openBtn.first().click({ force: true })
        await page.waitForSelector('.catalog-manager-sheet', { timeout: 10000 })
        const sheetHead = page.locator('.catalog-manager-sheet__head')
        const headPad = await sheetHead.evaluate((el) => getComputedStyle(el).paddingTop)
        ok(`${mod.label} → CatalogManagerSheet aberto (head pad ${headPad})`)
        await page.locator('.catalog-manager-sheet__close').click()
        await page.waitForTimeout(300)
      } else {
        fail(`${mod.label} → botão manager sheet não encontrado`)
      }
    }

    const modChunks = consoleErrors.filter((e) => /ChunkLoadError|Failed to load module/i.test(e))
    if (modChunks.length) fail(`${mod.label} → ${modChunks[0]}`)

    const closeBtn = block.locator('.catalog-module__close, .inbox-module__close')
    if (await closeBtn.count()) {
      await closeBtn.first().click()
      await page.waitForTimeout(300)
    }
  }

  const canvasOpen = await page.locator('.agent-shell__canvas.is-open').count()
  if (canvasOpen === 0) ok('sem canvas fullscreen residual no mobile')
  else fail('canvas fullscreen aberto indevidamente no mobile')
} catch (err) {
  fail(`fluxo: ${err.message}`)
}

await browser.close()
console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK (mobile)')
process.exit(failed ? 1 : 0)
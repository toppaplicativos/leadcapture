#!/usr/bin/env node
/**
 * Smoke autenticado — viewport mobile (iPhone 14).
 * Uso:
 *   SMOKE_EMAIL=... SMOKE_PASSWORD=... node agent-tools/smoke-authenticated-mobile.mjs [baseUrl]
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gotoAdminWorkspace, openWorkspaceShortcut, waitForWorkspaceReady } from './smoke-workspace-helpers.mjs'

const require = createRequire(import.meta.url)
const pwRoot = join(homedir(), '.grok', 'skills', 'playwright', 'scripts', 'node_modules', 'playwright')
const { chromium, devices } = require(pwRoot)

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL || ''
const PASSWORD = process.env.SMOKE_PASSWORD || ''

const MODULES = [
  { label: 'Painel', selector: '.catalog-module--dashboard', titleRe: /painel|resumo|lead/i, minCount: 1, sheetBtn: /painel completo/i },
  { label: 'Leads', selector: '.catalog-module--leads, .catalog-module', titleRe: /lead/i, minCount: 1 },
  { label: 'Produtos', selector: '.catalog-module.is-expanded, .catalog-module', titleRe: /produto/i, minCount: 1, sheetBtn: /gerenciar|catálogo completo|ver catálogo/i },
  { label: 'Campanhas', selector: '.catalog-module.is-expanded, .catalog-module', titleRe: /campanha/i },
  { label: 'Habilidades', selector: '.catalog-module--skills', titleRe: /habilidade/i, minCount: 1, sheetBtn: /gerenciar habilidade/i },
  { label: 'Pedidos', selector: '.catalog-module--orders, .catalog-module', titleRe: /pedido/i },
  { label: 'Instagram', selector: '.catalog-module--instagram', titleRe: /instagram/i, sheetBtn: /instagram completo|conectar instagram/i },
  { label: 'Facebook', selector: '.catalog-module--facebook', titleRe: /facebook/i, sheetBtn: /facebook completo|conectar facebook/i },
  { label: 'Afiliados', selector: '.catalog-module--affiliates, .catalog-module', titleRe: /afiliado|parceiro|programa/i, sheetBtn: /gestão completa|abrir programa de afiliados/i },
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

async function loginToAdmin(attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0) await page.waitForTimeout(2500)
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.fill('input[type="email"]', EMAIL)
      await page.fill('input[type="password"]', PASSWORD)
      await Promise.all([
        page.waitForURL(/\/admin/, { timeout: 60000 }),
        page.click('button[type="submit"]'),
      ])
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

try {
  await loginToAdmin()
  ok('login → /admin (mobile)')

  await waitForWorkspaceReady(page, 45000)
  await dismissPwaBanner()
  ok('workspace carregado')

  const footer = page.locator('.workspace-chat__footer')
  if (await footer.isVisible()) ok('footer do chat visível')
  else fail('footer do chat não visível')

  const footerPad = await footer.evaluate((el) => getComputedStyle(el).paddingBottom)
  if (footerPad && footerPad !== '0px') ok(`footer safe-area padding (${footerPad})`)
  else fail('footer sem padding inferior')

  for (const mod of MODULES) {
    consoleErrors.length = 0
    await gotoAdminWorkspace(page, BASE, 45000)
    await dismissPwaBanner()
    await openWorkspaceShortcut(page, mod.label)
    await page.waitForTimeout(mod.label === 'Produtos' ? 1400 : 900)

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

    if (mod.label === 'Afiliados') {
      const dock = page.locator('.workspace-chat__action-dock')
      if (await dock.filter({ hasText: 'Cadastrar parceiro com IA' }).count()) {
        ok(`${mod.label} → composer dock visível`)
        const manageChip = dock.locator('.workspace-chat__catalog-chip').filter({ hasText: 'Gerenciar' })
        if (await manageChip.count()) {
          await manageChip.first().click({ force: true })
          await page.waitForSelector('.catalog-manager-sheet', { timeout: 10000 })
          ok(`${mod.label} → composer Gerenciar abre CatalogManagerSheet`)
          await page.locator('.catalog-manager-sheet__close').click()
          await page.waitForTimeout(300)
        } else {
          fail(`${mod.label} → chip Gerenciar não encontrado no composer`)
        }
      } else {
        fail(`${mod.label} → composer dock não visível`)
      }
    }

    if (mod.sheetBtn) {
      await dismissPwaBanner()
      if (mod.label === 'Instagram' || mod.label === 'Facebook') {
        await block.locator('.catalog-panel__loading').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => null)
        const connectSel = mod.label === 'Instagram'
          ? '.catalog-instagram-connect, .catalog-panel__open-manager'
          : '.catalog-facebook-connect, .catalog-panel__open-manager'
        await block.locator(connectSel).first()
          .waitFor({ state: 'visible', timeout: 12000 }).catch(() => null)
      }
      const panel = block.locator('.catalog-module__body')
      const openBtn = panel.locator('.catalog-panel__open-manager, .catalog-panel__more, .catalog-panel__action, .catalog-panel__action--instagram, .catalog-panel__action--facebook').filter({ hasText: mod.sheetBtn })
      if (await openBtn.count()) {
        await openBtn.first().click({ force: true })
        await page.waitForSelector('.catalog-manager-sheet', { timeout: 10000 })
        const sheetHead = page.locator('.catalog-manager-sheet__head')
        const headPad = await sheetHead.evaluate((el) => getComputedStyle(el).paddingTop)
        ok(`${mod.label} → CatalogManagerSheet aberto (head pad ${headPad})`)
        await page.locator('.catalog-manager-sheet__close').click()
        await page.waitForTimeout(300)
      } else if (mod.label === 'Instagram' || mod.label === 'Facebook') {
        /* Conta não conectada: empty-state só tem CTA de conectar, sem manager sheet — soft-skip */
        const connectCta = panel.locator(
          '.catalog-instagram-connect, .catalog-facebook-connect, button, a',
        ).filter({ hasText: /conectar|connect|vincular/i })
        const moduleText = ((await block.innerText().catch(() => '')) || '').toLowerCase()
        if (
          (await connectCta.count()) ||
          /conectar|não conectad|nao conectad|connect your|vincular/.test(moduleText)
        ) {
          ok(`${mod.label} → conta não conectada (skip manager sheet)`)
        } else {
          fail(`${mod.label} → botão manager sheet não encontrado`)
        }
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
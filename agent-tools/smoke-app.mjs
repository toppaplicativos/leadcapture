#!/usr/bin/env node
/**
 * Smoke test pós-deploy — detecta tela branca (ChunkLoadError, MIME HTML em JS).
 * Uso: node agent-tools/smoke-app.mjs [baseUrl]
 * Requer playwright (instalado em ~/.grok/skills/playwright/scripts).
 */
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const pwRoot = join(homedir(), '.grok', 'skills', 'playwright', 'scripts', 'node_modules', 'playwright')
const { chromium } = require(pwRoot)

const BASE = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')

const routes = ['/', '/login', '/admin', '/inicio']
let failed = 0

function fail(msg) {
  failed++
  console.error(`FAIL  ${msg}`)
}

function ok(msg) {
  console.log(`OK    ${msg}`)
}

console.log(`Smoke test: ${BASE}\n`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'LeadCapture-Smoke/1.0',
})
const page = await context.newPage()

const consoleErrors = []
const pageErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => pageErrors.push(String(err)))

for (const route of routes) {
  consoleErrors.length = 0
  pageErrors.length = 0

  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
    const status = res?.status() ?? 0
    if (status >= 500) fail(`${route} → HTTP ${status}`)
    else ok(`${route} → HTTP ${status}`)

    await page.waitForTimeout(1500)

    const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '')
    const hasRoot = await page.evaluate(() => !!document.getElementById('root'))
    const splashOnly = bodyText.length < 20 && /^(Catálogo|Admin|Carregando)/i.test(bodyText)

    if (!hasRoot && bodyText.length === 0) {
      fail(`${route} → body vazio (tela branca)`)
    } else if (splashOnly) {
      fail(`${route} → splash preso: "${bodyText.slice(0, 40)}"`)
    } else {
      ok(`${route} → conteúdo renderizado (${bodyText.length} chars)`)
    }

    const chunkErrors = [...consoleErrors, ...pageErrors].filter(
      (e) =>
        /ChunkLoadError|Failed to load module|MIME type.*text\/html/i.test(e),
    )
    if (chunkErrors.length) {
      fail(`${route} → ${chunkErrors[0]}`)
    } else {
      ok(`${route} → sem erros de chunk`)
    }
  } catch (err) {
    fail(`${route} → ${err.message}`)
  }
}

await browser.close()

console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
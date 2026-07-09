/**
 * Helpers compartilhados — smoke autenticado desktop/mobile.
 */

/** Mapa label do smoke → grupo do menu hierárquico (OBJECTIVE_GROUPS). */
export const SHORTCUT_GROUP = {
  Painel: 'Captar',
  Leads: 'Captar',
  Clientes: 'Captar',
  Prospectar: 'Captar',
  Produtos: 'Vender',
  Pedidos: 'Vender',
  Campanhas: 'Vender',
  Afiliados: 'Vender',
  Instagram: 'Marca',
  Facebook: 'Marca',
  Galeria: 'Marca',
  Habilidades: 'Mais',
  'Agente IA': 'Mais',
  Configurações: 'Mais',
  WhatsApp: 'Atender',
  Automações: 'Atender',
}

export async function waitForWorkspaceReady(page, timeout = 45000) {
  await page.waitForSelector('.workspace-chat', { timeout })
  await page.waitForFunction(() => {
    const sessionBar = document.querySelector('.workspace-chat__session-bar')
    if (sessionBar?.classList.contains('is-loading')) return false

    const scroll = document.querySelector('.workspace-chat__scroll')
    if (scroll?.classList.contains('workspace-chat__scroll--hydrating')) {
      const hasContent =
        document.querySelector('.workspace-welcome')
        || document.querySelector('.workspace-chat__msg')
      if (!hasContent) return false
    }

    return Boolean(
      document.querySelector('.workspace-welcome')
      || document.querySelector('.workspace-chat__msg')
      || document.querySelector('.workspace-chat__composer')
      || document.querySelector('.workspace-chat__footer')
    )
  }, { timeout })
}

export async function gotoAdminWorkspace(page, base, timeout = 45000) {
  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout })
  await waitForWorkspaceReady(page, timeout)
}

/**
 * Abre um atalho do workspace.
 * Suporta: welcome chips, atalho flat no menu, ou menu em 2 níveis (grupo → item).
 */
export async function openWorkspaceShortcut(page, label) {
  const welcome = page.locator('.workspace-welcome__shortcut').filter({ hasText: label })
  if (await welcome.count()) {
    await Promise.all([
      welcome.first().click(),
      page.waitForResponse(
        (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
        { timeout: 25000 },
      ).catch(() => null),
    ])
    return
  }

  // Também tenta chips de quick-starters no composer
  const chip = page.locator('.workspace-chat__chip, .workspace-chat__quick-chip').filter({ hasText: label })
  if (await chip.count()) {
    await Promise.all([
      chip.first().click(),
      page.waitForResponse(
        (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
        { timeout: 25000 },
      ).catch(() => null),
    ])
    return
  }

  const menuBtn = page.locator('.workspace-chat__menu-btn')
  if (!(await menuBtn.count())) {
    throw new Error(`Menu do workspace não encontrado para atalho "${label}"`)
  }
  await menuBtn.click()
  await page.waitForSelector('.workspace-chat__shortcuts', { timeout: 10000 })

  // Já no nível do item?
  const direct = page.locator('.workspace-chat__shortcut').filter({ hasText: label })
  if (await direct.count()) {
    await Promise.all([
      direct.first().click(),
      page.waitForResponse(
        (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
        { timeout: 25000 },
      ).catch(() => null),
    ])
    return
  }

  // Menu hierárquico: entra no grupo e depois no item
  const groupLabel = SHORTCUT_GROUP[label]
  if (groupLabel) {
    const group = page.locator('.workspace-chat__shortcut').filter({ hasText: groupLabel }).first()
    if (await group.count()) {
      await group.click()
      await page.waitForTimeout(200)
      const item = page.locator('.workspace-chat__shortcut').filter({ hasText: label }).first()
      await item.waitFor({ state: 'visible', timeout: 8000 })
      await Promise.all([
        item.click(),
        page.waitForResponse(
          (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
          { timeout: 25000 },
        ).catch(() => null),
      ])
      return
    }
  }

  // Fallback: tenta todos os grupos conhecidos
  for (const g of ['Captar', 'Vender', 'Marca', 'Atender', 'Mais']) {
    const group = page.locator('.workspace-chat__shortcut').filter({ hasText: g }).first()
    if (!(await group.count())) continue
    await group.click()
    await page.waitForTimeout(150)
    const item = page.locator('.workspace-chat__shortcut').filter({ hasText: label }).first()
    if (await item.count()) {
      await Promise.all([
        item.click(),
        page.waitForResponse(
          (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
          { timeout: 25000 },
        ).catch(() => null),
      ])
      return
    }
    // volta
    const back = page.locator('.workspace-chat__shortcut--back, .workspace-chat__shortcut').filter({ hasText: /voltar/i }).first()
    if (await back.count()) await back.click()
    else await menuBtn.click()
    await page.waitForTimeout(100)
    await menuBtn.click().catch(() => null)
    await page.waitForSelector('.workspace-chat__shortcuts', { timeout: 5000 }).catch(() => null)
  }

  throw new Error(`Atalho "${label}" não encontrado no menu do workspace`)
}

/**
 * Helpers compartilhados — smoke autenticado desktop/mobile.
 */

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

  await page.locator('.workspace-chat__menu-btn').click()
  await page.waitForSelector('.workspace-chat__shortcuts', { timeout: 10000 })
  await Promise.all([
    page.locator('.workspace-chat__shortcut').filter({ hasText: label }).first().click(),
    page.waitForResponse(
      (r) => r.url().includes('/api/admin-agent/chat') && r.status() === 200,
      { timeout: 25000 },
    ).catch(() => null),
  ])
}
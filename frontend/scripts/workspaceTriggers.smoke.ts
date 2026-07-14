/**
 * Smoke tests for conversational workspace triggers (shipped entry points).
 * Run: npx --yes tsx scripts/workspaceTriggers.smoke.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OBJECTIVE_GROUPS,
  QUICK_STARTERS,
  REQUIRED_DOMAIN_KEYS,
  listDomainCoverage,
  resolveActiveModuleId,
  resolveCanvasPathForSkill,
  resolveTrigger,
  resolveTriggerBySkill,
} from '../src/lib/agent/workspaceTriggers.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else {
    console.log('OK:', msg)
  }
}

// 1) First-level groups are progressive disclosure (not one wall of 25+)
assert(OBJECTIVE_GROUPS.length >= 4 && OBJECTIVE_GROUPS.length <= 7, `groups count=${OBJECTIVE_GROUPS.length} in 4–7`)
assert(QUICK_STARTERS.length <= 5, `quick starters ≤5 (got ${QUICK_STARTERS.length})`)
assert(QUICK_STARTERS.length >= 3, 'quick starters present')

// 2) Required audit domains resolve
for (const domain of REQUIRED_DOMAIN_KEYS) {
  const t = resolveTrigger(domain)
  assert(!!t?.skill, `resolveTrigger('${domain}') → skill`)
  const path = t?.canvasPath || resolveCanvasPathForSkill(t!.skill)
  // criativos/fluxos use skill→orchestrator canvas; others may use canvasPath
  const bySkill = resolveTriggerBySkill(t!.skill)
  assert(!!bySkill || !!path || !!t?.skill, `domain ${domain} has skill or path`)
}

const coverage = listDomainCoverage()
for (const row of coverage) {
  assert(!!row.skill, `coverage ${row.domain} has skill`)
  assert(!!row.groupId, `coverage ${row.domain} is in a group (got ${row.groupId})`)
}

// Explicit domain → path/skill wiring the product needs
assert(resolveTrigger('cupons')?.canvasPath === '/cupons', 'cupons → /cupons')
assert(resolveTrigger('frete')?.canvasPath === '/frete', 'frete → /frete')
assert(resolveTrigger('loja')?.canvasPath === '/loja', 'loja → /loja')
assert(resolveTrigger('emails')?.canvasPath === '/emails', 'emails → /emails')
assert(resolveTrigger('notificacoes')?.canvasPath === '/notificacoes', 'notificacoes path')
assert(resolveTrigger('estoque')?.canvasPath === '/estoque', 'estoque path')
assert(resolveTrigger('criativos')?.skill === 'creative.generate', 'criativos skill')
assert(resolveTrigger('fluxos')?.skill === 'flow.builder', 'fluxos skill')
assert(resolveTrigger('agente')?.skill === 'workspace.overview', 'agente skill')
assert(resolveCanvasPathForSkill('nav.cupons') === '/cupons', 'CANVAS_NAV cupons')
assert(resolveCanvasPathForSkill('settings.open') === '/configuracoes', 'settings canvas')

// 3) Active module single-descriptor resolution
assert(resolveActiveModuleId({ leads: true, inbox: true }) === 'inbox', 'priority inbox > leads')
assert(resolveActiveModuleId({ products: true }) === 'products', 'products active')
assert(resolveActiveModuleId({}) === null, 'no module → null')

// 4) Paths resolve too
assert(resolveTrigger('/cupons')?.skill === 'nav.cupons', 'path /cupons')
assert(resolveTrigger('/frete')?.userLabel === 'Frete', 'path /frete label')

// 5) UI wiring — shipped WorkspaceChat/Welcome must not reintroduce flat skill walls
const chatSrc = readFileSync(join(ROOT, 'src/components/agent/WorkspaceChat.tsx'), 'utf8')
const welcomeSrc = readFileSync(join(ROOT, 'src/components/agent/WorkspaceWelcome.tsx'), 'utf8')

assert(
  /QUICK_STARTERS\.map\s*\(\s*\(?\s*chip/.test(chatSrc),
  'WorkspaceChat footer chips map QUICK_STARTERS',
)
assert(
  !/OBJECTIVE_TRIGGERS\.map\s*\(/.test(chatSrc),
  'WorkspaceChat must NOT map OBJECTIVE_TRIGGERS (flat wall)',
)
assert(
  chatSrc.includes("from '@/lib/agent/workspaceTriggers'")
    || chatSrc.includes('from "@/lib/agent/workspaceTriggers"'),
  'WorkspaceChat imports workspaceTriggers',
)
assert(
  /import\s*\{[^}]*QUICK_STARTERS[^}]*\}\s*from\s*['"]@\/lib\/agent\/workspaceTriggers['"]/.test(
    chatSrc.replace(/\s+/g, ' '),
  ),
  'WorkspaceChat imports QUICK_STARTERS from workspaceTriggers',
)
assert(
  /OBJECTIVE_GROUPS\.map\s*\(/.test(chatSrc),
  'WorkspaceChat shortcut menu uses OBJECTIVE_GROUPS (progressive disclosure)',
)
assert(
  /QUICK_STARTERS\.map\s*\(/.test(welcomeSrc),
  'WorkspaceWelcome shows QUICK_STARTERS',
)
assert(
  /OBJECTIVE_GROUPS\.map\s*\(/.test(welcomeSrc),
  'WorkspaceWelcome groups use OBJECTIVE_GROUPS',
)
// Guard: chip map block must be small — count QUICK_STARTERS at runtime
assert(QUICK_STARTERS.length <= 5, `runtime QUICK_STARTERS length ≤5 (got ${QUICK_STARTERS.length})`)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log(`\nAll workspaceTriggers smoke assertions passed (${coverage.length} domains covered).`)

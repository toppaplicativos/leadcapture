/**
 * Smoke: edição conversacional de leads (função shipada + wiring UI).
 * Run: npx --yes tsx scripts/leadsInlineEdit.smoke.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEAD_EDITABLE_STATUSES,
  updateLeadStatus,
} from '../src/components/agent/leads/LeadsInlinePanel.tsx'
import {
  isConversationalEditable,
  moduleIdForSkill,
  moduleLabel,
  WORKSPACE_MODULE_DEFS,
} from '../src/lib/agent/moduleRegistry.ts'

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

// Pure: status list
assert(LEAD_EDITABLE_STATUSES.length >= 4, 'editable statuses present')
assert(LEAD_EDITABLE_STATUSES.includes('contacted'), 'contacted in list')
assert(LEAD_EDITABLE_STATUSES.includes('converted'), 'converted in list')

// Pure: updateLeadStatus validation (no network for empty id)
{
  const r = await updateLeadStatus('', 'contacted', { 'Content-Type': 'application/json' })
  assert(r.ok === false, 'updateLeadStatus rejects empty id')
}
{
  const r = await updateLeadStatus('abc', '', { 'Content-Type': 'application/json' })
  assert(r.ok === false, 'updateLeadStatus rejects empty status')
}

// Mock fetch for happy path
const originalFetch = globalThis.fetch
let lastUrl = ''
let lastBody: any = null
// @ts-expect-error test mock
globalThis.fetch = async (url: string, init?: RequestInit) => {
  lastUrl = String(url)
  lastBody = init?.body ? JSON.parse(String(init.body)) : null
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, lead: { id: 'lead-1', status: 'contacted', name: 'Teste' } }),
  } as Response
}
{
  const r = await updateLeadStatus('lead-1', 'contacted', {
    'Content-Type': 'application/json',
    Authorization: 'Bearer x',
  })
  assert(r.ok === true, 'updateLeadStatus ok with mock fetch')
  assert(r.lead?.status === 'contacted', 'returns updated lead')
  assert(lastUrl.includes('/api/leads/lead-1/status'), `hits real API path (${lastUrl})`)
  assert(lastBody?.status === 'contacted', 'sends status in body')
}
globalThis.fetch = originalFetch

// Registry
assert(WORKSPACE_MODULE_DEFS.length >= 10, 'module registry has domains')
assert(moduleIdForSkill('crm.leads.table') === 'leads', 'skill → leads module')
assert(moduleLabel('leads') === 'Leads', 'module label')
assert(isConversationalEditable('leads') === true, 'leads is conversationally editable')
assert(isConversationalEditable('gallery') === false, 'gallery not yet pilot-editable')

// UI wiring
const panel = readFileSync(join(ROOT, 'src/components/agent/leads/LeadsInlinePanel.tsx'), 'utf8')
assert(panel.includes('updateLeadStatus'), 'panel uses updateLeadStatus')
assert(panel.includes('Alterar no chat'), 'panel shows edit-in-chat label')
assert(panel.includes('LEAD_EDITABLE_STATUSES.map'), 'panel maps editable statuses')
assert(panel.includes('/api/leads/'), 'panel targets /api/leads status route')

const block = readFileSync(join(ROOT, 'src/components/agent/leads/LeadsModuleBlock.tsx'), 'utf8')
assert(block.includes('mudar o status aqui no chat'), 'module block teaches edit-in-chat')

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nleadsInlineEdit smoke passed.')

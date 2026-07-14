/**
 * Smoke: regra unificada de "Instagram conectado".
 * Run: npx --yes tsx scripts/instagramConnection.smoke.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isInstagramConnectionLinked } from '../src/lib/instagram/client.ts'

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

assert(isInstagramConnectionLinked({ access_token: '••••' }) === true, 'masked token counts as linked')
assert(isInstagramConnectionLinked({ account_id: '123' }) === true, 'account_id linked')
assert(isInstagramConnectionLinked({ username: 'loja' }) === true, 'username on connection')
assert(isInstagramConnectionLinked({ id: 'x', brand_id: 'y' }) === true, 'connection row id+brand')
assert(isInstagramConnectionLinked(null, { is_connected: true }) === true, 'profile is_connected')
assert(isInstagramConnectionLinked(null, { username: 'x' }) === true, 'profile username')
assert(isInstagramConnectionLinked(null, null) === false, 'empty not linked')
assert(isInstagramConnectionLinked({}) === false, 'empty object not linked')

const clientSrc = readFileSync(join(ROOT, 'src/lib/instagram/client.ts'), 'utf8')
assert(clientSrc.includes('connection-status'), 'snapshot consults connection-status')
assert(clientSrc.includes('isInstagramConnectionLinked'), 'exports shared helper')

const headerSrc = readFileSync(join(ROOT, 'src/components/admin/ChannelHeaderIcons.tsx'), 'utf8')
assert(headerSrc.includes('/api/instagram/connection-status'), 'header uses connection-status')

const routeSrc = readFileSync(
  join(ROOT, '../src/routes/instagram.ts'),
  'utf8',
)
assert(
  routeSrc.includes('hasToken') || routeSrc.includes('linked'),
  'connection-status uses token/linked rule (not only is_active)',
)
assert(
  !/connected:\s*!!\(conn\?\.access_token\s*&&\s*conn\?\.is_active\)/.test(routeSrc),
  'old is_active-only rule removed',
)

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\ninstagramConnection smoke passed')

const base = (process.argv[2] || 'https://app.leadcapture.online').replace(/\/$/, '')
const indexJs = await fetch(`${base}/`).then((r) => r.text())
const entry = indexJs.match(/assets\/index-[^"']+\.js/)?.[0]
if (!entry) {
  console.error('index bundle not found')
  process.exit(1)
}
const entryJs = await fetch(`${base}/${entry}`).then((r) => r.text())
const shell = entryJs.match(/assets\/AdminShell-[^"']+\.js/)?.[0]
if (!shell) {
  console.error('AdminShell chunk ref not found in', entry)
  process.exit(1)
}
const js = await fetch(`${base}/${shell}`).then((r) => r.text())
console.log('bundle:', shell)
const checks = [
  'Cadastrar parceiro com IA',
  'catalog-module__body--hidden',
  'Abrir programa de afiliados',
  'Métricas afiliados',
  'catalog-module--affiliates',
  'catalog-panel--affiliates',
]
for (const s of checks) {
  console.log(`${js.includes(s) ? 'OK' : 'NO '}  ${s}`)
}
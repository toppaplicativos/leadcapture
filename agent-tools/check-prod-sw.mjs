const url = process.argv[2] || 'https://app.leadcapture.online/service-worker.js'
const res = await fetch(url)
const text = await res.text()
const shell = text.match(/SHELL_CACHE_NAME\s*=\s*"([^"]+)"/)
const runtime = text.match(/RUNTIME_CACHE_NAME\s*=\s*"([^"]+)"/)
console.log('PROD shell:', shell?.[1] ?? 'NOT FOUND')
console.log('PROD runtime:', runtime?.[1] ?? 'NOT FOUND')
process.exit(shell && runtime ? 0 : 1)
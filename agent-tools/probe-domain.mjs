const urls = [
  'https://alhopronto.online/',
  'https://www.alhopronto.online/',
  'https://parceiros.alhopronto.online/',
  'https://app.leadcapture.online/catalogo/alhopronto',
]
for (const url of urls) {
  try {
    const r = await fetch(url, { redirect: 'follow' })
    const text = await r.text()
    const hasStore = /Alho Pronto|alhopronto|__STORE_SLUG__/i.test(text)
    console.log(`${r.status}  ${hasStore ? 'OK ' : 'NO '} ${url} (${text.length} chars)`)
  } catch (e) {
    console.log(`ERR  ${url} — ${e.message}`)
  }
}
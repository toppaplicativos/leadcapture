#!/usr/bin/env node
/**
 * Provisiona parceiros.leadcapture.online no Caddy do VPS.
 * DNS deve apontar para o mesmo IP do app (187.127.5.179).
 *
 * Uso:
 *   node agent-tools/provision-parceiros-subdomain.mjs
 *   node agent-tools/provision-parceiros-subdomain.mjs --check-only
 */
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const VPS = process.env.VPS_SSH || 'root@187.127.5.179'
const CADDYFILE = '/etc/caddy/Caddyfile'
const MARKER = '# leadcapture:parceiros.leadcapture.online'
const checkOnly = process.argv.includes('--check-only')

const BLOCK = `
${MARKER}
parceiros.leadcapture.online, afiliados.leadcapture.online {
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:3001 {
            transport http {
                read_timeout 5m
                write_timeout 5m
                dial_timeout 30s
            }
        }
    }
    handle /uploads/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        reverse_proxy 127.0.0.1:3001
        header Cache-Control "no-cache, no-store, must-revalidate"
    }
}
`

function ssh(cmd) {
  return execSync(`ssh ${VPS} ${JSON.stringify(cmd)}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function main() {
  console.log(`>> VPS: ${VPS}`)

  let remote = ''
  try {
    remote = ssh(`cat ${CADDYFILE}`)
  } catch (err) {
    console.error('Falha ao ler Caddyfile remoto:', err.stderr || err.message)
    process.exit(1)
  }

  if (remote.includes(MARKER) || remote.includes('parceiros.leadcapture.online')) {
    console.log('OK    bloco parceiros.leadcapture.online já existe no Caddyfile')
  } else {
    const insertAfter = 'app.leadcapture.online {'
    const idx = remote.indexOf(insertAfter)
    if (idx === -1) {
      console.error('ABORT: bloco app.leadcapture.online não encontrado no Caddyfile')
      process.exit(1)
    }

    const afterApp = remote.indexOf('\n}\n', remote.indexOf('app.leadcapture.online'))
    if (afterApp === -1) {
      console.error('ABORT: não foi possível localizar fim do bloco app.leadcapture.online')
      process.exit(1)
    }
    const updated = remote.slice(0, afterApp + 2) + BLOCK + remote.slice(afterApp + 2)

    const tmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '.caddyfile.tmp')
    writeFileSync(tmp, updated, 'utf8')

    if (checkOnly) {
      console.log('CHECK: seria inserido bloco parceiros (dry-run)')
      console.log(BLOCK.trim())
      process.exit(0)
    }

    execSync(`scp "${tmp}" ${VPS}:/tmp/Caddyfile.new`, { stdio: 'inherit' })
    ssh(`cp ${CADDYFILE} ${CADDYFILE}.bak.parceiros-$(date +%Y%m%d%H%M%S)`)
    ssh('cp /tmp/Caddyfile.new ' + CADDYFILE)
    ssh('caddy validate --config ' + CADDYFILE)
    ssh('systemctl reload caddy')
    console.log('OK    Caddy recarregado com parceiros.leadcapture.online')
  }

  for (const url of [
    'https://parceiros.leadcapture.online/parceiros',
    'https://parceiros.leadcapture.online/parceiros/entrar',
    'https://afiliados.leadcapture.online/parceiros',
  ]) {
    try {
      const out = execSync(`curl -sS -o /dev/null -w "%{http_code}" "${url}"`, { encoding: 'utf8' })
      console.log(`OK    ${url} → HTTP ${out.trim()}`)
    } catch (e) {
      console.warn(`WARN  ${url} não respondeu como esperado`)
    }
  }

  try {
    const dns = execSync('nslookup parceiros.leadcapture.online', { encoding: 'utf8' })
    console.log('DNS   parceiros.leadcapture.online:')
    console.log(dns.trim())
  } catch (e) {
    console.warn('WARN  DNS de parceiros.leadcapture.online não resolve neste ambiente')
  }
}

main()
#!/usr/bin/env node
/**
 * Provisiona mob.leadcapture.online no Caddy do VPS.
 * DNS A deve apontar para o mesmo IP do app (187.127.5.179).
 *
 * Uso:
 *   node agent-tools/provision-mob-subdomain.mjs
 *   node agent-tools/provision-mob-subdomain.mjs --check-only
 */
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const VPS = process.env.VPS_SSH || 'root@187.127.5.179'
const CADDYFILE = '/etc/caddy/Caddyfile'
const MARKER = '# leadcapture:mob.leadcapture.online'
const checkOnly = process.argv.includes('--check-only')

const BLOCK = `
${MARKER}
mob.leadcapture.online {
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

  if (remote.includes(MARKER) || remote.includes('mob.leadcapture.online')) {
    console.log('OK    bloco mob.leadcapture.online já existe no Caddyfile')
  } else {
    const appIdx = remote.indexOf('app.leadcapture.online')
    if (appIdx === -1) {
      console.error('ABORT: bloco app.leadcapture.online não encontrado no Caddyfile')
      process.exit(1)
    }
    const afterApp = remote.indexOf('\n}\n', appIdx)
    if (afterApp === -1) {
      console.error('ABORT: não foi possível localizar fim do bloco app.leadcapture.online')
      process.exit(1)
    }
    const updated = remote.slice(0, afterApp + 2) + BLOCK + remote.slice(afterApp + 2)

    const tmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '.caddyfile.mob.tmp')
    writeFileSync(tmp, updated, 'utf8')

    if (checkOnly) {
      console.log('CHECK: seria inserido bloco mob (dry-run)')
      console.log(BLOCK.trim())
      try { unlinkSync(tmp) } catch { /* ignore */ }
      process.exit(0)
    }

    execSync(`scp "${tmp}" ${VPS}:/tmp/Caddyfile.mob.new`, { stdio: 'inherit' })
    ssh(`cp ${CADDYFILE} ${CADDYFILE}.bak.mob-$(date +%Y%m%d%H%M%S)`)
    ssh('cp /tmp/Caddyfile.mob.new ' + CADDYFILE)
    ssh('caddy validate --config ' + CADDYFILE)
    ssh('systemctl reload caddy')
    console.log('OK    Caddy recarregado com mob.leadcapture.online')
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }

  // DNS hint
  try {
    const dig = execSync('nslookup mob.leadcapture.online 2>&1 || true', { encoding: 'utf8' })
    console.log('--- DNS lookup ---')
    console.log(dig.slice(0, 500))
  } catch {
    console.log('AVISO: confirme DNS A de mob.leadcapture.online → 187.127.5.179')
  }

  if (!checkOnly) {
    for (const url of [
      'https://mob.leadcapture.online/mob/entrar',
      'https://mob.leadcapture.online/rastreio',
    ]) {
      try {
        const out = ssh(`curl -sI -o /dev/null -w "%{http_code}" --max-time 15 ${url}`)
        console.log(`PROBE ${url} → HTTP ${String(out).trim()}`)
      } catch (e) {
        console.log(`PROBE ${url} → falha (${e.message || e})`)
      }
    }
  }
}

main()

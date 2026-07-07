#!/usr/bin/env node
/**
 * Atualiza versões de cache do service worker para forçar refresh pós-deploy.
 * Uso: node agent-tools/bump-service-worker.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

const targets = [
  join(root, 'frontend', 'public', 'service-worker.js'),
  join(root, 'public', 'service-worker.js'),
].filter((p) => existsSync(p))

if (!targets.length) {
  console.error('service-worker.js não encontrado')
  process.exit(1)
}

function nextCacheNames(content) {
  const shellMatch = content.match(/lead-system-shell-v(\d+)-/)
  const runtimeMatch = content.match(/lead-system-runtime-v(\d+)-/)
  const shellVer = shellMatch ? Number(shellMatch[1]) + 1 : 25
  const runtimeVer = runtimeMatch ? Number(runtimeMatch[1]) + 1 : 17
  return {
    shellName: `lead-system-shell-v${shellVer}-${stamp}`,
    runtimeName: `lead-system-runtime-v${runtimeVer}-${stamp}`,
  }
}

function applyBump(content, shellName, runtimeName) {
  let next = content.replace(/lead-system-shell-v\d+-\d+/g, shellName)
  next = next.replace(/lead-system-runtime-v\d+-\d+/g, runtimeName)
  return next
}

const primary = readFileSync(targets[0], 'utf8')
const { shellName, runtimeName } = nextCacheNames(primary)

for (const path of targets) {
  const next = applyBump(readFileSync(path, 'utf8'), shellName, runtimeName)
  writeFileSync(path, next, 'utf8')
  console.log(`OK    ${path}`)
}
console.log(`      shell=${shellName} runtime=${runtimeName}`)
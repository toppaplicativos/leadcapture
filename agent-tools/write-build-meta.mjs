#!/usr/bin/env node
/**
 * Writes dist/build-meta.json with git sha + build time for /api/health and /api/public/version.
 * Usage: node agent-tools/write-build-meta.mjs
 */
import { execSync } from "node:child_process"
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const distDir = join(root, "dist")

function git(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim()
  } catch {
    return null
  }
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const gitSha =
  process.env.GIT_SHA ||
  process.env.DEPLOY_SHA ||
  git("git rev-parse --short HEAD") ||
  null
const gitBranch = process.env.GIT_BRANCH || git("git rev-parse --abbrev-ref HEAD") || null
const buildTime = process.env.BUILD_TIME || new Date().toISOString()

const meta = {
  name: pkg.name || "leadcapture",
  version: pkg.version || "0.0.0",
  git_sha: gitSha,
  git_branch: gitBranch,
  build_time: buildTime,
  written_at: new Date().toISOString(),
}

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
const out = join(distDir, "build-meta.json")
writeFileSync(out, JSON.stringify(meta, null, 2) + "\n", "utf8")
console.log(`OK    build-meta ${meta.version} sha=${meta.git_sha} time=${meta.build_time}`)
console.log(`      → ${out}`)

/**
 * Build / deploy version for client sync and health checks.
 * Prefer dist/build-meta.json (written at deploy) over env / package.json.
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"

type BuildMeta = {
  name?: string
  version?: string
  git_sha?: string | null
  git_branch?: string | null
  build_time?: string | null
}

let packageCache: { version: string; name: string } | null = null
let metaCache: BuildMeta | null | undefined

function readPackage(): { version: string; name: string } {
  if (packageCache) return packageCache
  try {
    const pkgPath = join(__dirname, "../../package.json")
    const raw = JSON.parse(readFileSync(pkgPath, "utf8"))
    packageCache = {
      version: String(raw.version || "0.0.0"),
      name: String(raw.name || "leadcapture"),
    }
  } catch {
    packageCache = { version: "0.0.0", name: "leadcapture" }
  }
  return packageCache
}

function readBuildMeta(): BuildMeta | null {
  if (metaCache !== undefined) return metaCache
  const candidates = [
    join(__dirname, "../build-meta.json"), // dist/build-meta.json when running compiled
    join(__dirname, "../../dist/build-meta.json"), // ts-node / monorepo root
    join(process.cwd(), "dist/build-meta.json"),
  ]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      metaCache = JSON.parse(readFileSync(p, "utf8")) as BuildMeta
      return metaCache
    } catch {
      /* try next */
    }
  }
  metaCache = null
  return null
}

export function getPlatformVersion() {
  const pkg = readPackage()
  const meta = readBuildMeta()
  return {
    name: meta?.name || pkg.name,
    version: meta?.version || pkg.version,
    git_sha: process.env.GIT_SHA || process.env.DEPLOY_SHA || meta?.git_sha || null,
    git_branch: process.env.GIT_BRANCH || meta?.git_branch || null,
    build_time: process.env.BUILD_TIME || meta?.build_time || null,
    node: process.version,
    env: process.env.NODE_ENV || "production",
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptime_s: Math.floor(process.uptime()),
  }
}

/**
 * Global AI Algorithms — Master SaaS policy for function_key → provider+model.
 * Keys still resolve via IntegrationService chain (brand → user → __global__ → env).
 */

import { randomUUID } from "crypto"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import {
  ALGORITHM_REGISTRY,
  MODALITY_DEFAULT_KEYS,
  type AlgorithmDef,
  type AlgorithmModality,
} from "../config/ai-algorithms"
import {
  AI_MODELS,
  DEFAULT_PREFERENCES,
  resolveLiveModelId,
  isRetiredModelId,
  type AICategory,
} from "../config/ai-models"
import {
  estimateAlgorithmCost,
  pickBestAtlasModel,
  type CostEstimate,
} from "../config/ai-cost"
import { integrationService } from "./integrations"
import { getPlatformTools } from "./platformTools"
import { AtlasProvider } from "./providers/atlas-provider"

export type AlgorithmRow = {
  function_key: string
  modality: AlgorithmModality | string
  label: string
  description: string | null
  group_name: string | null
  provider: string
  model: string
  fallback_provider: string | null
  fallback_model: string | null
  temperature: number | null
  max_tokens: number | null
  is_enabled: boolean
  is_system: boolean
  coming_soon: boolean
  metadata: any
  updated_by: string | null
  created_at?: string
  updated_at?: string
}

export type ResolvedAlgorithm = {
  function_key: string
  modality: string
  provider: string
  model: string
  temperature: number | null
  max_tokens: number | null
  key: string | null
  source: "db" | "registry" | "modality_default" | "code_default"
  used_fallback: boolean
  coming_soon: boolean
  is_enabled: boolean
}

type Scope = { userId?: string; brandId?: string }

let _ready = false
let _readyPromise: Promise<void> | null = null
const cache = new Map<string, { row: AlgorithmRow; exp: number }>()
const CACHE_TTL = 60_000

export class AlgorithmsService {
  async ensureSchema(): Promise<void> {
    if (_ready) return
    if (_readyPromise) return _readyPromise
    _readyPromise = this._boot().finally(() => {
      _readyPromise = null
    })
    return _readyPromise
  }

  private async _boot(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS ai_algorithms (
        function_key       VARCHAR(80) PRIMARY KEY,
        modality           VARCHAR(16)  NOT NULL,
        label              VARCHAR(160) NOT NULL,
        description        TEXT NULL,
        group_name         VARCHAR(80) NULL,
        provider           VARCHAR(40)  NOT NULL,
        model              VARCHAR(120) NOT NULL,
        fallback_provider  VARCHAR(40) NULL,
        fallback_model     VARCHAR(120) NULL,
        temperature        NUMERIC(4,2) NULL,
        max_tokens         INT NULL,
        is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
        is_system          BOOLEAN NOT NULL DEFAULT TRUE,
        coming_soon        BOOLEAN NOT NULL DEFAULT FALSE,
        metadata           JSONB NULL,
        updated_by         VARCHAR(36) NULL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(`
      CREATE TABLE IF NOT EXISTS ai_algorithm_audit (
        id             VARCHAR(36) PRIMARY KEY,
        function_key   VARCHAR(80) NOT NULL,
        actor_user_id  VARCHAR(36) NULL,
        actor_email    VARCHAR(255) NULL,
        before_json    JSONB NULL,
        after_json     JSONB NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_ai_algorithms_modality ON ai_algorithms (modality)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_ai_algorithm_audit_fk ON ai_algorithm_audit (function_key)`)
    } catch {
      /* ignore */
    }
    await this.seedMissing()
    await this.sanitizeRetiredModels().catch((err: any) => {
      logger.warn(`[algorithms] sanitizeRetiredModels: ${err?.message}`)
    })
    _ready = true
    logger.info("[algorithms] schema ready")
  }

  /**
   * Reescreve na DB qualquer algoritmo apontando para model IDs descontinuados
   * (ex.: gemini-2.0-flash-lite, shutdown Google 2026-06-01).
   */
  /** Called only from _boot after schema exists — do not call ensureSchema (recursion). */
  async sanitizeRetiredModels(): Promise<number> {
    const rows = await query<AlgorithmRow[]>(`SELECT * FROM ai_algorithms`)
    const list = Array.isArray(rows) ? rows : []
    let n = 0
    for (const row of list) {
      const liveModel = resolveLiveModelId(row.model)
      const liveFallback = row.fallback_model
        ? resolveLiveModelId(String(row.fallback_model))
        : null
      const sameModel = liveModel === row.model
      const sameFallback =
        (liveFallback || null) === (row.fallback_model || null)
      if (sameModel && sameFallback) continue
      await query(
        `UPDATE ai_algorithms SET model = ?, fallback_model = ?, updated_at = NOW()
         WHERE function_key = ?`,
        [liveModel, liveFallback, row.function_key],
      )
      this.invalidate(row.function_key)
      n++
      logger.info(
        `[algorithms] retired model remapped ${row.function_key}: ${row.model} → ${liveModel}`,
      )
    }
    if (n > 0) logger.info(`[algorithms] sanitizeRetiredModels updated=${n}`)
    return n
  }

  /** Insert registry rows only when missing — never overwrite master edits */
  async seedMissing(): Promise<number> {
    let n = 0
    for (const def of ALGORITHM_REGISTRY) {
      const existing = await queryOne<{ function_key: string }>(
        `SELECT function_key FROM ai_algorithms WHERE function_key = ?`,
        [def.function_key],
      )
      if (existing) continue
      await query(
        `INSERT INTO ai_algorithms
          (function_key, modality, label, description, group_name, provider, model,
           fallback_provider, fallback_model, temperature, is_enabled, is_system, coming_soon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, ?)`,
        [
          def.function_key,
          def.modality,
          def.label,
          def.description || null,
          def.group_name,
          def.provider,
          def.model,
          def.fallback_provider || null,
          def.fallback_model || null,
          def.temperature ?? null,
          !!def.coming_soon,
        ],
      )
      n++
    }
    if (n > 0) logger.info(`[algorithms] seeded ${n} algorithms`)
    return n
  }

  async list(filters?: {
    modality?: string
    group?: string
    search?: string
  }): Promise<AlgorithmRow[]> {
    await this.ensureSchema()
    const params: any[] = []
    let where = "WHERE 1=1"
    if (filters?.modality) {
      where += " AND modality = ?"
      params.push(filters.modality)
    }
    if (filters?.group) {
      where += " AND group_name = ?"
      params.push(filters.group)
    }
    if (filters?.search) {
      const q = `%${String(filters.search).toLowerCase()}%`
      where +=
        " AND (LOWER(function_key) LIKE ? OR LOWER(label) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ?)"
      params.push(q, q, q)
    }
    const rows = await query<AlgorithmRow[]>(
      `SELECT * FROM ai_algorithms ${where}
       ORDER BY modality ASC, group_name ASC NULLS LAST, label ASC`,
      params,
    )
    return Array.isArray(rows) ? rows : []
  }

  async get(functionKey: string): Promise<AlgorithmRow | null> {
    await this.ensureSchema()
    const cached = cache.get(functionKey)
    if (cached && cached.exp > Date.now()) return cached.row

    const row = await queryOne<AlgorithmRow>(
      `SELECT * FROM ai_algorithms WHERE function_key = ?`,
      [functionKey],
    )
    if (row) cache.set(functionKey, { row, exp: Date.now() + CACHE_TTL })
    return row
  }

  invalidate(functionKey?: string): void {
    if (functionKey) cache.delete(functionKey)
    else cache.clear()
  }

  async update(
    functionKey: string,
    patch: {
      provider?: string
      model?: string
      fallback_provider?: string | null
      fallback_model?: string | null
      temperature?: number | null
      max_tokens?: number | null
      is_enabled?: boolean
      label?: string
      description?: string | null
    },
    actor?: { userId?: string; email?: string },
  ): Promise<AlgorithmRow> {
    await this.ensureSchema()
    const before = await this.get(functionKey)
    if (!before) throw Object.assign(new Error("algorithm_not_found"), { status: 404 })

    if (before.coming_soon && (patch.provider || patch.model)) {
      /* allow configuring coming_soon for future adapters, but keep flag */
    }

    const provider = patch.provider !== undefined ? String(patch.provider).trim() : before.provider
    let model = patch.model !== undefined ? String(patch.model).trim() : before.model
    if (isRetiredModelId(model)) {
      model = resolveLiveModelId(model)
    }
    this.assertModelInCatalog(before.modality, provider, model)

    let fallbackModel =
      patch.fallback_model !== undefined ? patch.fallback_model : before.fallback_model
    if (fallbackModel) fallbackModel = resolveLiveModelId(String(fallbackModel))

    if (patch.fallback_provider && fallbackModel) {
      this.assertModelInCatalog(
        before.modality,
        String(patch.fallback_provider),
        String(fallbackModel),
      )
    }

    await query(
      `UPDATE ai_algorithms SET
         provider = ?,
         model = ?,
         fallback_provider = ?,
         fallback_model = ?,
         temperature = ?,
         max_tokens = ?,
         is_enabled = ?,
         label = ?,
         description = ?,
         updated_by = ?,
         updated_at = NOW()
       WHERE function_key = ?`,
      [
        provider,
        model,
        patch.fallback_provider !== undefined
          ? patch.fallback_provider
          : before.fallback_provider,
        fallbackModel,
        patch.temperature !== undefined ? patch.temperature : before.temperature,
        patch.max_tokens !== undefined ? patch.max_tokens : before.max_tokens,
        patch.is_enabled !== undefined ? !!patch.is_enabled : before.is_enabled,
        patch.label !== undefined ? String(patch.label).trim() || before.label : before.label,
        patch.description !== undefined ? patch.description : before.description,
        actor?.userId || null,
        functionKey,
      ],
    )

    this.invalidate(functionKey)
    const after = await this.get(functionKey)
    if (!after) throw new Error("algorithm_update_failed")

    await query(
      `INSERT INTO ai_algorithm_audit (id, function_key, actor_user_id, actor_email, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        functionKey,
        actor?.userId || null,
        actor?.email || null,
        JSON.stringify(before),
        JSON.stringify(after),
      ],
    ).catch((err: any) => {
      logger.warn(`[algorithms] audit insert: ${err?.message}`)
    })

    return after
  }

  assertModelInCatalog(modality: string, provider: string, model: string): void {
    const mod = modality === "vision" ? "text" : modality
    const catalog = (AI_MODELS as any)[mod]
    if (!catalog) return // allow unknown modalities lightly
    const list = catalog[provider] as Array<{ id: string }> | undefined
    if (!list) {
      throw Object.assign(new Error(`invalid_provider_for_modality:${provider}`), {
        status: 400,
        code: "invalid_provider",
      })
    }
    if (list.some((m) => m.id === model)) return
    // Atlas: permite modelos live da API (ainda não no catálogo curado estático)
    if (provider === "atlas" && String(model).trim().length > 2) return
    throw Object.assign(new Error(`invalid_model:${model}`), {
      status: 400,
      code: "invalid_model",
    })
  }

  /**
   * Whether algorithms v1 global routing is active.
   * When false, aiRouter falls back to org __preferences__ (legacy).
   */
  async isEnabled(): Promise<boolean> {
    try {
      const tools = await getPlatformTools()
      const flag = (tools as any).algorithms_v1_enabled
      if (flag === false) return false
      return true
    } catch {
      return true
    }
  }

  async resolve(functionKey: string, scope: Scope = {}): Promise<ResolvedAlgorithm> {
    await this.ensureSchema()

    let row = await this.get(functionKey)
    let source: ResolvedAlgorithm["source"] = "db"

    if (!row) {
      const def = ALGORITHM_REGISTRY.find((d) => d.function_key === functionKey)
      if (def) {
        row = this.defToRow(def)
        source = "registry"
      }
    }

    if (!row || !row.is_enabled) {
      const modality = (row?.modality ||
        ALGORITHM_REGISTRY.find((d) => d.function_key === functionKey)?.modality ||
        "text") as AICategory
      const defaultKey =
        MODALITY_DEFAULT_KEYS[modality === ("vision" as any) ? "text" : (modality as AICategory)] ||
        MODALITY_DEFAULT_KEYS.text
      if (functionKey !== defaultKey) {
        const fallbackRow = await this.get(defaultKey)
        if (fallbackRow?.is_enabled) {
          row = fallbackRow
          source = "modality_default"
        }
      }
    }

    if (!row) {
      const cat: AICategory = "text"
      const pref = DEFAULT_PREFERENCES[cat]
      return {
        function_key: functionKey,
        modality: cat,
        provider: pref.provider,
        model: pref.model,
        temperature: null,
        max_tokens: null,
        key: await this.resolveKey(pref.provider, scope),
        source: "code_default",
        used_fallback: false,
        coming_soon: false,
        is_enabled: true,
      }
    }

    let provider = row.provider
    let model = resolveLiveModelId(row.model)
    let usedFallback = false
    let key = await this.resolveKey(provider, scope)

    if (!key && row.fallback_provider) {
      const fk = await this.resolveKey(row.fallback_provider, scope)
      if (fk) {
        provider = row.fallback_provider
        model = row.fallback_model || model
        key = fk
        usedFallback = true
      }
    }

    return {
      function_key: functionKey,
      modality: row.modality,
      provider,
      model,
      temperature: row.temperature != null ? Number(row.temperature) : null,
      max_tokens: row.max_tokens != null ? Number(row.max_tokens) : null,
      key,
      source,
      used_fallback: usedFallback,
      coming_soon: !!row.coming_soon,
      is_enabled: !!row.is_enabled,
    }
  }

  /** Build modality prefs from global modality defaults (for aiRouter.getPreferences) */
  async getGlobalModalityPreferences(): Promise<{
    text: { provider: string; model: string }
    image: { provider: string; model: string }
    video: { provider: string; model: string }
    audio: { provider: string; model: string }
  }> {
    await this.ensureSchema()
    const text = await this.get(MODALITY_DEFAULT_KEYS.text)
    const image = await this.get(MODALITY_DEFAULT_KEYS.image)
    const video = await this.get(MODALITY_DEFAULT_KEYS.video)
    const audio = await this.get(MODALITY_DEFAULT_KEYS.audio)
    return {
      text: {
        provider: text?.provider || DEFAULT_PREFERENCES.text.provider,
        model: text?.model || DEFAULT_PREFERENCES.text.model,
      },
      image: {
        provider: image?.provider || DEFAULT_PREFERENCES.image.provider,
        model: image?.model || DEFAULT_PREFERENCES.image.model,
      },
      video: {
        provider: video?.provider || DEFAULT_PREFERENCES.video.provider,
        model: video?.model || DEFAULT_PREFERENCES.video.model,
      },
      audio: {
        provider: audio?.provider || DEFAULT_PREFERENCES.audio.provider,
        model: audio?.model || DEFAULT_PREFERENCES.audio.model,
      },
    }
  }

  private async resolveKey(providerName: string, scope: Scope): Promise<string | null> {
    try {
      // veo uses gemini key
      const keyProvider = providerName === "veo" ? "gemini" : providerName
      const resolved = await integrationService.getProvider(keyProvider as any, {
        userId: scope.userId,
        brandId: scope.brandId,
      })
      return resolved?.key || null
    } catch {
      return null
    }
  }

  private defToRow(def: AlgorithmDef): AlgorithmRow {
    return {
      function_key: def.function_key,
      modality: def.modality,
      label: def.label,
      description: def.description || null,
      group_name: def.group_name,
      provider: def.provider,
      model: def.model,
      fallback_provider: def.fallback_provider || null,
      fallback_model: def.fallback_model || null,
      temperature: def.temperature ?? null,
      max_tokens: null,
      is_enabled: true,
      is_system: true,
      coming_soon: !!def.coming_soon,
      metadata: null,
      updated_by: null,
    }
  }

  async listAudit(limit = 50): Promise<any[]> {
    await this.ensureSchema()
    const rows = await query(
      `SELECT * FROM ai_algorithm_audit ORDER BY created_at DESC LIMIT ?`,
      [Math.min(200, Math.max(1, limit))],
    )
    return Array.isArray(rows) ? rows : []
  }

  /**
   * Migra todos os algoritmos ativos para Atlas, escolhendo o melhor modelo
   * por função (custo + adequação). Não toca coming_soon desnecessariamente.
   */
  async migrateAllToAtlas(actor?: { userId?: string; email?: string }): Promise<{
    updated: number
    skipped: number
    results: Array<{ function_key: string; model: string; fit_score: number; usd_per_1k: number }>
  }> {
    await this.ensureSchema()
    const rows = await this.list()
    let updated = 0
    let skipped = 0
    const results: Array<{ function_key: string; model: string; fit_score: number; usd_per_1k: number }> = []

    for (const row of rows) {
      if (!row.is_enabled) {
        skipped++
        continue
      }
      const pick = pickBestAtlasModel(row.function_key, String(row.modality))
      if (row.provider === "atlas" && row.model === pick.model) {
        skipped++
        continue
      }
      try {
        const after = await this.update(
          row.function_key,
          {
            provider: pick.provider,
            model: pick.model,
            // fallback barato no mesmo provider
            fallback_provider: "atlas",
            fallback_model:
              String(row.modality) === "image"
                ? "google/gemini-2.5-flash-image"
                : String(row.modality) === "video"
                  ? "bytedance/seedance-2.0-mini"
                  : String(row.modality) === "audio"
                    ? "minimax/speech-02-turbo"
                    : "google/gemini-2.5-flash-lite",
          },
          actor,
        )
        const est = estimateAlgorithmCost({
          function_key: after.function_key,
          modality: String(after.modality),
          provider: after.provider,
          model: after.model,
        })
        results.push({
          function_key: after.function_key,
          model: after.model,
          fit_score: est.fit.score,
          usd_per_1k: est.usd_per_1k_calls,
        })
        updated++
      } catch (err: any) {
        logger.warn(`[algorithms] migrate ${row.function_key}: ${err?.message}`)
        skipped++
      }
    }

    this.invalidate()
    logger.info(`[algorithms] migrateAllToAtlas updated=${updated} skipped=${skipped}`)
    return { updated, skipped, results }
  }

  estimate(functionKey: string, provider: string, model: string, modality?: string): CostEstimate {
    const mod =
      modality ||
      ALGORITHM_REGISTRY.find((d) => d.function_key === functionKey)?.modality ||
      "text"
    return estimateAlgorithmCost({
      function_key: functionKey,
      modality: String(mod),
      provider,
      model,
    })
  }

  /**
   * Catálogo unificado: estático + modelos Atlas live (se chave global).
   * Live models não sobrescrevem labels do catálogo curado; só expandem a lista.
   */
  async getMergedCatalog(opts?: { refreshAtlas?: boolean }): Promise<{
    models: typeof AI_MODELS
    defaults: typeof DEFAULT_PREFERENCES
    atlas_live: { count: number; source: string; fetched_at: string | null }
  }> {
    const models = JSON.parse(JSON.stringify(AI_MODELS)) as typeof AI_MODELS
    let liveCount = 0
    let source = "static"
    let fetchedAt: string | null = null

    if (opts?.refreshAtlas !== false) {
      try {
        const key = await this.resolveKey("atlas", {})
        if (key) {
          const atlas = new AtlasProvider(key)
          const live = await atlas.listModels()
          liveCount = live.length
          source = "atlas_api+static"
          fetchedAt = new Date().toISOString()

          const ensure = (mod: AICategory) => {
            if (!models[mod]) (models as any)[mod] = {}
            if (!(models as any)[mod].atlas) (models as any)[mod].atlas = []
          }
          ensure("text")
          ensure("image")
          ensure("video")
          ensure("audio")

          const existing = new Set(
            Object.values(models)
              .flatMap((byProv) => Object.values(byProv as any))
              .flat()
              .map((m: any) => String(m.id)),
          )

          for (const m of live) {
            if (!m.id || existing.has(m.id)) continue
            const cat = m.category || "text"
            if (!["text", "image", "video", "audio"].includes(cat)) continue
            ensure(cat as AICategory)
            ;(models as any)[cat].atlas.push({
              id: m.id,
              label: m.label || `Atlas · ${m.id}`,
              tier: m.tier || "medium",
              cost_label: m.cost_label || "via Atlas (live)",
              description: "Descoberto via GET /v1/models — validar fit no app",
              functions: m.functions || ["chat"],
              supports_references: !!m.supports_references,
              studio_selectable: cat === "image" ? !!m.supports_references : undefined,
            })
            existing.add(m.id)
          }
        }
      } catch (err: any) {
        logger.warn(`[algorithms] atlas live catalog: ${err?.message}`)
        source = "static_only"
      }
    }

    return {
      models,
      defaults: DEFAULT_PREFERENCES,
      atlas_live: { count: liveCount, source, fetched_at: fetchedAt },
    }
  }
}

export const algorithmsService = new AlgorithmsService()

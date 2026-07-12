/**
 * Automações compostas por brand — modelo Tattoo AI adaptado ao leadcapture.
 * Cada automação tem gatilho (agendamento | evento), pipeline de ações e limites.
 */

import { query, queryOne, insert, update } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import {
  buildCron,
  nextTriggerExecution,
  type AutomationTrigger,
  type TriggerAgendamento,
} from "../utils/automationCron";

export type AutomationDefinitionStatus = "rascunho" | "live" | "pausado" | "erro";

export type AutomationActionType =
  | "enviar_dm_wa"
  | "enviar_dm_ig"
  | "comentar_ig"
  | "publicar_conteudo"
  | "enviar_email"
  | "notificar_equipe";

export interface AutomationActionStep {
  ordem: number;
  tipo: AutomationActionType;
  config: Record<string, any>;
}

export interface AutomationLimits {
  maxPorUsuario: number;
  cooldownSegundos: number;
  maxPorHora: number;
  maxPorDia: number;
  /** Rolling window for maxPorUsuario (default 86400). Independent from cooldown. */
  janelaMaxUsuarioSegundos?: number;
  janelaFuncionamento?: {
    ativo: boolean;
    inicioHora: number;
    fimHora: number;
    timezone?: string;
  };
}

export interface AutomationMetrics {
  runs: number;
  sucessos: number;
  falhas: number;
  proximaExecucao?: string | null;
  ultimaExecucao?: string | null;
  ultimoErro?: { step: string; mensagem: string; em: string } | null;
}

export interface AutomationDefinition {
  id: string;
  brand_id: string;
  user_id: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  status: AutomationDefinitionStatus;
  trigger: AutomationTrigger;
  pipeline: AutomationActionStep[];
  limites: AutomationLimits;
  metrics: AutomationMetrics;
  seed_key?: string | null;
  origin?: "seed" | "user" | "migrated_catalog" | null;
  priority?: number;
  system_version?: number;
  user_modified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationDefinitionInput {
  nome: string;
  descricao?: string;
  ativa?: boolean;
  trigger: AutomationTrigger;
  pipeline: AutomationActionStep[];
  limites: AutomationLimits;
}

export interface AutomationDefinitionRun {
  id: string;
  automation_id: string;
  status: "running" | "success" | "error" | "skipped";
  triggered_by: "cron" | "manual" | "event";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result: Record<string, any> | null;
  error_message: string | null;
  actor_id?: string | null;
  outcome?: string | null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function defaultLimits(): AutomationLimits {
  return { maxPorUsuario: 1, cooldownSegundos: 3600, maxPorHora: 0, maxPorDia: 0 };
}

function defaultMetrics(): AutomationMetrics {
  return { runs: 0, sucessos: 0, falhas: 0 };
}

function normalizeTrigger(trigger: AutomationTrigger): AutomationTrigger {
  if (trigger.tipo === "agendamento") {
    const cron = trigger.cron || buildCron(trigger);
    return { ...trigger, cron, timezone: trigger.timezone || "America/Sao_Paulo" };
  }
  return {
    ...trigger,
    palavrasChave: Array.isArray(trigger.palavrasChave) ? trigger.palavrasChave : [],
  };
}

function computeStatus(ativa: boolean, current: AutomationDefinitionStatus): AutomationDefinitionStatus {
  if (!ativa) return current === "rascunho" ? "rascunho" : "pausado";
  return current === "rascunho" ? "live" : current === "pausado" ? "live" : current;
}

function mapRow(row: any): AutomationDefinition {
  const trigger = normalizeTrigger(parseJson<AutomationTrigger>(row.trigger_json, {
    tipo: "agendamento",
    frequencia: "diario",
    horarios: [{ hora: 9, minuto: 0 }],
    cron: "0 9 * * *",
    timezone: "America/Sao_Paulo",
  }));

  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    user_id: String(row.user_id),
    nome: String(row.nome || ""),
    descricao: String(row.descricao || ""),
    ativa: Boolean(row.ativa),
    status: (row.status || "rascunho") as AutomationDefinitionStatus,
    trigger,
    pipeline: parseJson<AutomationActionStep[]>(row.pipeline_json, []),
    limites: parseJson<AutomationLimits>(row.limites_json, defaultLimits()),
    metrics: parseJson<AutomationMetrics>(row.metrics_json, defaultMetrics()),
    seed_key: row.seed_key != null ? String(row.seed_key) : null,
    origin: row.origin || null,
    priority: row.priority != null ? Number(row.priority) : 100,
    system_version: row.system_version != null ? Number(row.system_version) : 0,
    user_modified_at: row.user_modified_at
      ? new Date(row.user_modified_at).toISOString()
      : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function computeNextRun(trigger: AutomationTrigger): Date | null {
  if (trigger.tipo !== "agendamento") return null;
  return nextTriggerExecution(trigger as TriggerAgendamento, new Date());
}

export class AutomationDefinitionsService {
  private ready = false;

  async ensureSchema(): Promise<void> {
    if (this.ready) return;

    await query(`
      CREATE TABLE IF NOT EXISTS automation_definitions (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        brand_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        nome VARCHAR(200) NOT NULL,
        descricao TEXT NULL,
        ativa BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'rascunho',
        trigger_json JSONB NOT NULL,
        pipeline_json JSONB NOT NULL DEFAULT '[]',
        limites_json JSONB NOT NULL DEFAULT '{}',
        metrics_json JSONB NOT NULL DEFAULT '{}',
        next_run_at TIMESTAMPTZ NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((err) => logger.warn(`automation_definitions DDL: ${err?.message || err}`));

    await query(`
      CREATE TABLE IF NOT EXISTS automation_definition_runs (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        automation_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        triggered_by VARCHAR(20) NOT NULL DEFAULT 'manual',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        duration_ms INT NULL,
        result_json JSONB NULL,
        error_message TEXT NULL
      )
    `).catch((err) => logger.warn(`automation_definition_runs DDL: ${err?.message || err}`));

    await query(
      `CREATE INDEX IF NOT EXISTS idx_automation_defs_brand ON automation_definitions (brand_id)`
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_automation_defs_next_run ON automation_definitions (next_run_at) WHERE ativa = TRUE`
    ).catch(() => undefined);

    // Seed / hybrid dispatch columns (idempotent ALTERs)
    const alterCols = [
      `ALTER TABLE automation_definitions ADD COLUMN IF NOT EXISTS seed_key VARCHAR(80) NULL`,
      `ALTER TABLE automation_definitions ADD COLUMN IF NOT EXISTS origin VARCHAR(40) NULL`,
      `ALTER TABLE automation_definitions ADD COLUMN IF NOT EXISTS priority INT DEFAULT 100`,
      `ALTER TABLE automation_definitions ADD COLUMN IF NOT EXISTS system_version INT DEFAULT 0`,
      `ALTER TABLE automation_definitions ADD COLUMN IF NOT EXISTS user_modified_at TIMESTAMPTZ NULL`,
      `ALTER TABLE automation_definition_runs ADD COLUMN IF NOT EXISTS actor_id VARCHAR(120) NULL`,
      `ALTER TABLE automation_definition_runs ADD COLUMN IF NOT EXISTS outcome VARCHAR(40) NULL`,
    ];
    for (const sql of alterCols) {
      await query(sql).catch(() => undefined);
    }
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_defs_brand_seed
       ON automation_definitions (brand_id, seed_key)
       WHERE seed_key IS NOT NULL`,
    ).catch(() => undefined);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_automation_runs_actor
       ON automation_definition_runs (automation_id, actor_id, status, started_at)`,
    ).catch(() => undefined);

    this.ready = true;
  }

  /**
   * Brand-scoped list (all members see brand automations).
   * Optional platform=instagram filter for mirror tab.
   */
  async list(
    brandId: string,
    _userId?: string,
    options?: { platform?: string },
  ): Promise<AutomationDefinition[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM automation_definitions
       WHERE brand_id = ?
       ORDER BY updated_at DESC`,
      [brandId],
    );
    let list = (rows || []).map(mapRow);
    if (options?.platform === "instagram") {
      const { isInstagramPlatformFilter } = await import("./automationMatchLogic");
      list = list.filter((d) => isInstagramPlatformFilter(d));
    }
    return list;
  }

  async getById(brandId: string, _userId: string, id: string): Promise<AutomationDefinition | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM automation_definitions WHERE id = ? AND brand_id = ? LIMIT 1`,
      [id, brandId],
    );
    return row ? mapRow(row) : null;
  }

  async create(brandId: string, userId: string, input: AutomationDefinitionInput): Promise<AutomationDefinition> {
    await this.ensureSchema();
    const id = uuidv4();
    const trigger = normalizeTrigger(input.trigger);
    const ativa = input.ativa ?? false;
    const status: AutomationDefinitionStatus = ativa ? "live" : "rascunho";
    const metrics = defaultMetrics();
    const nextRun = ativa && trigger.tipo === "agendamento" ? computeNextRun(trigger) : null;
    if (nextRun) metrics.proximaExecucao = nextRun.toISOString();

    await insert(
      `INSERT INTO automation_definitions
       (id, brand_id, user_id, nome, descricao, ativa, status, trigger_json, pipeline_json, limites_json, metrics_json, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        brandId,
        userId,
        input.nome.trim(),
        input.descricao || "",
        ativa,
        status,
        JSON.stringify(trigger),
        JSON.stringify(input.pipeline || []),
        JSON.stringify(input.limites || defaultLimits()),
        JSON.stringify(metrics),
        nextRun,
      ]
    );

    const created = await this.getById(brandId, userId, id);
    if (!created) throw new Error("Falha ao criar automação");
    return created;
  }

  async update(
    brandId: string,
    userId: string,
    id: string,
    patch: Partial<AutomationDefinitionInput> & { status?: AutomationDefinitionStatus; clearError?: boolean }
  ): Promise<AutomationDefinition | null> {
    const existing = await this.getById(brandId, userId, id);
    if (!existing) return null;

    const trigger = normalizeTrigger(patch.trigger || existing.trigger);
    const ativa = patch.ativa ?? existing.ativa;
    const pipeline = patch.pipeline ?? existing.pipeline;
    const limites = patch.limites ?? existing.limites;
    const nome = patch.nome?.trim() || existing.nome;
    const descricao = patch.descricao ?? existing.descricao;

    let status = patch.status || existing.status;
    if (patch.clearError && status === "erro") status = ativa ? "live" : "pausado";
    status = computeStatus(ativa, status);

    const metrics = { ...existing.metrics };
    if (patch.clearError) delete metrics.ultimoErro;

    const nextRun = ativa && trigger.tipo === "agendamento" ? computeNextRun(trigger) : null;
    metrics.proximaExecucao = nextRun ? nextRun.toISOString() : null;

    const contentChanged =
      patch.nome !== undefined ||
      patch.descricao !== undefined ||
      patch.trigger !== undefined ||
      patch.pipeline !== undefined ||
      patch.limites !== undefined;

    await update(
      `UPDATE automation_definitions
       SET nome = ?, descricao = ?, ativa = ?, status = ?, trigger_json = ?, pipeline_json = ?,
           limites_json = ?, metrics_json = ?, next_run_at = ?, updated_at = NOW()
           ${contentChanged ? ", user_modified_at = COALESCE(user_modified_at, NOW())" : ""}
       WHERE id = ? AND brand_id = ?`,
      [
        nome,
        descricao,
        ativa,
        status,
        JSON.stringify(trigger),
        JSON.stringify(pipeline),
        JSON.stringify(limites),
        JSON.stringify(metrics),
        nextRun,
        id,
        brandId,
      ],
    );

    return this.getById(brandId, userId, id);
  }

  async delete(brandId: string, userId: string, id: string): Promise<boolean> {
    await this.ensureSchema();
    await update(`DELETE FROM automation_definition_runs WHERE automation_id = ? AND brand_id = ?`, [id, brandId]);
    await update(
      `DELETE FROM automation_definitions WHERE id = ? AND brand_id = ?`,
      [id, brandId],
    );
    return true;
  }

  async duplicate(brandId: string, userId: string, id: string): Promise<AutomationDefinition | null> {
    const src = await this.getById(brandId, userId, id);
    if (!src) return null;
    return this.create(brandId, userId, {
      nome: `${src.nome} (cópia)`,
      descricao: src.descricao,
      ativa: false,
      trigger: src.trigger,
      pipeline: src.pipeline,
      limites: src.limites,
    });
  }

  async toggle(brandId: string, userId: string, id: string, ativa: boolean): Promise<AutomationDefinition | null> {
    return this.update(brandId, userId, id, { ativa, status: ativa ? "live" : "pausado" });
  }

  async getDue(batchSize = 20): Promise<AutomationDefinition[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM automation_definitions
       WHERE ativa = TRUE
         AND status IN ('live', 'erro')
         AND trigger_json->>'tipo' = 'agendamento'
         AND (next_run_at IS NULL OR next_run_at <= NOW())
       ORDER BY next_run_at ASC NULLS FIRST
       LIMIT ?`,
      [batchSize]
    );
    return (rows || []).map(mapRow);
  }

  async getEventMatches(
    brandId: string,
    plataforma: string,
    evento: string
  ): Promise<AutomationDefinition[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM automation_definitions
       WHERE brand_id = ?
         AND ativa = TRUE
         AND status IN ('live', 'erro')
         AND trigger_json->>'tipo' = 'evento'
         AND trigger_json->>'plataforma' = ?
         AND trigger_json->>'evento' = ?`,
      [brandId, plataforma, evento]
    );
    const { sortDefinitionsForMatch } = await import("./automationMatchLogic");
    return sortDefinitionsForMatch((rows || []).map(mapRow));
  }

  async startRun(
    automationId: string,
    brandId: string,
    triggeredBy: "cron" | "manual" | "event",
    options?: { actorId?: string | null },
  ): Promise<string> {
    const id = uuidv4();
    await insert(
      `INSERT INTO automation_definition_runs (id, automation_id, brand_id, status, triggered_by, actor_id)
       VALUES (?, ?, ?, 'running', ?, ?)`,
      [id, automationId, brandId, triggeredBy, options?.actorId || null],
    );
    return id;
  }

  async getActorRunStats(
    automationId: string,
    actorId: string,
    limites: AutomationLimits,
  ): Promise<{
    lastSuccessAt: string | null;
    successCountInMaxWindow: number;
    successCountLastHour: number;
    successCountLastDay: number;
  }> {
    if (!actorId) {
      return {
        lastSuccessAt: null,
        successCountInMaxWindow: 0,
        successCountLastHour: 0,
        successCountLastDay: 0,
      };
    }
    const windowSec = Math.max(0, Number(limites.janelaMaxUsuarioSegundos) || 86400);
    const last = await queryOne<any>(
      `SELECT started_at FROM automation_definition_runs
       WHERE automation_id = ? AND actor_id = ? AND status = 'success'
       ORDER BY started_at DESC LIMIT 1`,
      [automationId, actorId],
    );
    const countWindow = await queryOne<any>(
      `SELECT COUNT(*)::int AS c FROM automation_definition_runs
       WHERE automation_id = ? AND actor_id = ? AND status = 'success'
         AND started_at >= NOW() - (? || ' seconds')::interval`,
      [automationId, actorId, String(windowSec)],
    ).catch(async () =>
      queryOne<any>(
        `SELECT COUNT(*) AS c FROM automation_definition_runs
         WHERE automation_id = ? AND actor_id = ? AND status = 'success'
           AND started_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [automationId, actorId, windowSec],
      ),
    );
    const countHour = await queryOne<any>(
      `SELECT COUNT(*)::int AS c FROM automation_definition_runs
       WHERE automation_id = ? AND actor_id = ? AND status = 'success'
         AND started_at >= NOW() - INTERVAL '1 hour'`,
      [automationId, actorId],
    ).catch(async () =>
      queryOne<any>(
        `SELECT COUNT(*) AS c FROM automation_definition_runs
         WHERE automation_id = ? AND actor_id = ? AND status = 'success'
           AND started_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
        [automationId, actorId],
      ),
    );
    const countDay = await queryOne<any>(
      `SELECT COUNT(*)::int AS c FROM automation_definition_runs
       WHERE automation_id = ? AND actor_id = ? AND status = 'success'
         AND started_at >= NOW() - INTERVAL '1 day'`,
      [automationId, actorId],
    ).catch(async () =>
      queryOne<any>(
        `SELECT COUNT(*) AS c FROM automation_definition_runs
         WHERE automation_id = ? AND actor_id = ? AND status = 'success'
           AND started_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
        [automationId, actorId],
      ),
    );

    return {
      lastSuccessAt: last?.started_at ? new Date(last.started_at).toISOString() : null,
      successCountInMaxWindow: Number(countWindow?.c || 0),
      successCountLastHour: Number(countHour?.c || 0),
      successCountLastDay: Number(countDay?.c || 0),
    };
  }

  async finishRun(
    runId: string,
    automation: AutomationDefinition,
    ok: boolean,
    result: Record<string, any> | null,
    errorMessage: string | null,
    startedAt: Date,
    options?: { skipped?: boolean; outcome?: string; actorId?: string | null },
  ): Promise<void> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const skipped = Boolean(options?.skipped);
    const status = skipped ? "skipped" : ok ? "success" : "error";
    const outcome = options?.outcome || (skipped ? "skipped" : ok ? "success" : "error");

    await update(
      `UPDATE automation_definition_runs
       SET status = ?, completed_at = ?, duration_ms = ?, result_json = ?, error_message = ?,
           outcome = ?, actor_id = COALESCE(?, actor_id)
       WHERE id = ?`,
      [
        status,
        completedAt,
        durationMs,
        result ? JSON.stringify(result) : null,
        errorMessage,
        outcome,
        options?.actorId || null,
        runId,
      ],
    );

    const metrics = { ...automation.metrics };
    metrics.runs = (metrics.runs || 0) + 1;
    metrics.ultimaExecucao = completedAt.toISOString();
    // Only real success increments sucessos (not stub/skipped)
    if (ok && !skipped && outcome !== "stub") {
      metrics.sucessos = (metrics.sucessos || 0) + 1;
      delete metrics.ultimoErro;
    } else if (!ok && !skipped) {
      metrics.falhas = (metrics.falhas || 0) + 1;
      metrics.ultimoErro = {
        step: "pipeline",
        mensagem: errorMessage || "Erro desconhecido",
        em: completedAt.toISOString(),
      };
    }

    const nextRun =
      automation.ativa && automation.trigger.tipo === "agendamento"
        ? computeNextRun(automation.trigger)
        : null;
    metrics.proximaExecucao = nextRun ? nextRun.toISOString() : null;

    const newStatus: AutomationDefinitionStatus =
      skipped || outcome === "stub"
        ? automation.ativa
          ? "live"
          : automation.status
        : ok
          ? automation.ativa
            ? "live"
            : automation.status
          : "erro";

    await update(
      `UPDATE automation_definitions
       SET metrics_json = ?, status = ?, next_run_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(metrics), newStatus, nextRun, automation.id],
    );
  }

  async listRuns(automationId: string, brandId: string, limit = 30): Promise<AutomationDefinitionRun[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM automation_definition_runs
       WHERE automation_id = ? AND brand_id = ?
       ORDER BY started_at DESC LIMIT ?`,
      [automationId, brandId, limit]
    );
    return (rows || []).map((row) => ({
      id: String(row.id),
      automation_id: String(row.automation_id),
      status: row.status,
      triggered_by: row.triggered_by,
      started_at: new Date(row.started_at).toISOString(),
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      duration_ms: row.duration_ms ? Number(row.duration_ms) : null,
      result: parseJson(row.result_json, null),
      error_message: row.error_message || null,
    }));
  }

  async getKpis(brandId: string, userId: string) {
    const list = await this.list(brandId, userId);
    const live = list.filter((a) => a.status === "live").length;
    const pausado = list.filter((a) => a.status === "pausado").length;
    const erro = list.filter((a) => a.status === "erro").length;
    const agendadas = list.filter((a) => a.trigger.tipo === "agendamento").length;
    const eventos = list.filter((a) => a.trigger.tipo === "evento").length;
    const runs = list.reduce((s, a) => s + (a.metrics.runs || 0), 0);
    const sucessos = list.reduce((s, a) => s + (a.metrics.sucessos || 0), 0);
    return {
      total: list.length,
      live,
      pausado,
      erro,
      agendadas,
      eventos,
      runs,
      successRate: runs > 0 ? Math.round((sucessos / runs) * 100) : 0,
    };
  }
}

export const automationDefinitionsService = new AutomationDefinitionsService();
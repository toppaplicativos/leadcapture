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
  status: "running" | "success" | "error";
  triggered_by: "cron" | "manual" | "event";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result: Record<string, any> | null;
  error_message: string | null;
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

    this.ready = true;
  }

  async list(brandId: string, userId: string): Promise<AutomationDefinition[]> {
    await this.ensureSchema();
    const rows = await query<any[]>(
      `SELECT * FROM automation_definitions
       WHERE brand_id = ? AND user_id = ?
       ORDER BY updated_at DESC`,
      [brandId, userId]
    );
    return (rows || []).map(mapRow);
  }

  async getById(brandId: string, userId: string, id: string): Promise<AutomationDefinition | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM automation_definitions WHERE id = ? AND brand_id = ? AND user_id = ? LIMIT 1`,
      [id, brandId, userId]
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

    await update(
      `UPDATE automation_definitions
       SET nome = ?, descricao = ?, ativa = ?, status = ?, trigger_json = ?, pipeline_json = ?,
           limites_json = ?, metrics_json = ?, next_run_at = ?, updated_at = NOW()
       WHERE id = ? AND brand_id = ? AND user_id = ?`,
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
        userId,
      ]
    );

    return this.getById(brandId, userId, id);
  }

  async delete(brandId: string, userId: string, id: string): Promise<boolean> {
    await this.ensureSchema();
    await update(`DELETE FROM automation_definition_runs WHERE automation_id = ? AND brand_id = ?`, [id, brandId]);
    const result = await update(
      `DELETE FROM automation_definitions WHERE id = ? AND brand_id = ? AND user_id = ?`,
      [id, brandId, userId]
    );
    return (result as any)?.affectedRows > 0 || true;
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
    return (rows || []).map(mapRow);
  }

  async startRun(
    automationId: string,
    brandId: string,
    triggeredBy: "cron" | "manual" | "event"
  ): Promise<string> {
    const id = uuidv4();
    await insert(
      `INSERT INTO automation_definition_runs (id, automation_id, brand_id, status, triggered_by)
       VALUES (?, ?, ?, 'running', ?)`,
      [id, automationId, brandId, triggeredBy]
    );
    return id;
  }

  async finishRun(
    runId: string,
    automation: AutomationDefinition,
    ok: boolean,
    result: Record<string, any> | null,
    errorMessage: string | null,
    startedAt: Date
  ): Promise<void> {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await update(
      `UPDATE automation_definition_runs
       SET status = ?, completed_at = ?, duration_ms = ?, result_json = ?, error_message = ?
       WHERE id = ?`,
      [ok ? "success" : "error", completedAt, durationMs, result ? JSON.stringify(result) : null, errorMessage, runId]
    );

    const metrics = { ...automation.metrics };
    metrics.runs = (metrics.runs || 0) + 1;
    metrics.ultimaExecucao = completedAt.toISOString();
    if (ok) {
      metrics.sucessos = (metrics.sucessos || 0) + 1;
      delete metrics.ultimoErro;
    } else {
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

    const status: AutomationDefinitionStatus = ok ? (automation.ativa ? "live" : automation.status) : "erro";

    await update(
      `UPDATE automation_definitions
       SET metrics_json = ?, status = ?, next_run_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(metrics), status, nextRun, automation.id]
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
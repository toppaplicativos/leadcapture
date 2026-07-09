/**
 * Dispatcher de eventos Instagram (webhook → brand_automations).
 * Inspirado no dispatcher do Tattoo AI, adaptado ao modelo brand_automations.
 */

import { query } from "../config/database";
import { logger } from "../utils/logger";
import { brandAutomationsService } from "./brandAutomations";
import { automationDefinitionsService } from "./automationDefinitions";
import { runAutomationDefinition } from "./automationDefinitionRunner";
import { runOne } from "./automationScheduler";

export type InstagramWebhookEvent =
  | "resposta_padrao_dm"
  | "dm_keyword"
  | "comentario_keyword"
  | "mencao_story"
  | "novo_seguidor";

export interface DispatchInstagramEventInput {
  brandId: string;
  userId: string;
  igUserId: string;
  evento: InstagramWebhookEvent;
  triggeredBy?: string;
  payload: Record<string, any>;
  matchKeyword?: string;
}

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function keywordMatches(text: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const hay = normalizeText(text);
  return keywords.some((kw) => hay.includes(normalizeText(kw)));
}

function parseConfig(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

export async function dispatchInstagramEvent(
  input: DispatchInstagramEventInput,
): Promise<{ matched: number; results: Array<{ slug: string; status: string; error?: string }> }> {
  await brandAutomationsService.ensureSchema();

  const rows = (await query<any[]>(
    `SELECT ba.*, ac.task_type, ac.name AS catalog_name
     FROM brand_automations ba
     INNER JOIN automation_catalog ac ON ac.slug = ba.catalog_slug
     WHERE ba.brand_id = ?
       AND ba.user_id = ?
       AND ba.status = 'active'
       AND ac.task_type LIKE 'instagram:webhook-%'`,
    [input.brandId, input.userId],
  )) as any[];

  const automations = Array.isArray(rows) ? rows : [];
  const results: Array<{ slug: string; status: string; error?: string }> = [];
  let matched = 0;

  for (const row of automations) {
    const config = parseConfig(row.config);
    const triggerEvent = String(config.trigger_event || "");
    if (triggerEvent !== input.evento) continue;

    const keywords = Array.isArray(config.keywords)
      ? config.keywords.map((k: any) => String(k))
      : [];

    if (input.matchKeyword && keywords.length > 0 && !keywordMatches(input.matchKeyword, keywords)) {
      continue;
    }

    matched += 1;
    const delayMs = Math.max(0, Number(config.delay_seconds) || 0) * 1000;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 15000)));
    }

    try {
      const run = await runOne(
        {
          id: row.id,
          brand_id: row.brand_id,
          user_id: row.user_id,
          catalog_slug: row.catalog_slug,
          config: {
            ...config,
            _webhook: {
              ...input.payload,
              evento: input.evento,
              triggered_by: input.triggeredBy,
              ig_user_id: input.igUserId,
            },
          },
          task_type: row.task_type,
          catalog_name: row.catalog_name,
        },
        "webhook",
      );
      results.push({
        slug: row.catalog_slug,
        status: run.status,
        error: run.errorMessage,
      });
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 200);
      logger.error(`[IG Dispatcher] ${row.catalog_slug}: ${msg}`);
      results.push({ slug: row.catalog_slug, status: "error", error: msg });
    }
  }

  const defs = await automationDefinitionsService.getEventMatches(
    input.brandId,
    "instagram",
    input.evento
  );

  for (const def of defs) {
    if (def.trigger.tipo !== "evento") continue;
    const keywords = Array.isArray(def.trigger.palavrasChave) ? def.trigger.palavrasChave : [];
    if (input.matchKeyword && keywords.length > 0 && !keywordMatches(input.matchKeyword, keywords)) {
      continue;
    }

    matched += 1;
    try {
      const run = await runAutomationDefinition(def, {
        triggeredBy: "event",
        eventPayload: {
          ...input.payload,
          evento: input.evento,
          triggered_by: input.triggeredBy,
          ig_user_id: input.igUserId,
        },
        triggeredByUser: input.triggeredBy,
      });
      results.push({
        slug: def.id,
        status: run.ok ? "success" : "error",
        error: run.ok ? undefined : run.message,
      });
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 200);
      logger.error(`[IG Dispatcher] def ${def.id}: ${msg}`);
      results.push({ slug: def.id, status: "error", error: msg });
    }
  }

  return { matched, results };
}
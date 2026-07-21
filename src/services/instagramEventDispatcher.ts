/**
 * Dispatcher de eventos Instagram (webhook → definitions / brand_automations).
 * hybrid/definitions: first-match by surface on definitions; skip catalog webhook
 * reply tasks when any definition matched the event.
 */

import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { brandAutomationsService } from "./brandAutomations";
import { automationDefinitionsService } from "./automationDefinitions";
import { runAutomationDefinition } from "./automationDefinitionRunner";
import { runOne } from "./automationScheduler";
import {
  selectWinnersBySurface,
  shouldSkipCatalogWebhookReplies,
  keywordMatches,
  type DispatchMode,
} from "./automationMatchLogic";
import {
  getBrandDispatchMode,
  isBrandRepliesPaused,
  shouldApplyGlobalAutoReplyGates,
} from "./automationDispatchMode";

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
  /** Test override */
  modeOverride?: DispatchMode;
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

/**
 * Se a brand já tem automações (definitions) para o evento IG, o catálogo legado
 * NÃO deve responder em fallback — senão desligar todas na UI ainda deixa o
 * ig-webhook-dm-reply ativo mandando DM.
 */
async function brandHasEventDefinitions(brandId: string, evento: string): Promise<boolean> {
  try {
    const row = await queryOne<any>(
      `SELECT id FROM automation_definitions
       WHERE brand_id = ?
         AND trigger_json->>'tipo' = 'evento'
         AND trigger_json->>'plataforma' = 'instagram'
         AND trigger_json->>'evento' = ?
       LIMIT 1`,
      [brandId, evento],
    );
    return Boolean(row?.id);
  } catch {
    return false;
  }
}

async function runCatalogWebhookMatches(
  input: DispatchInstagramEventInput,
): Promise<Array<{ slug: string; status: string; error?: string }>> {
  // Só roda automação de catálogo com status = active (nunca global genérico)
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

  return results;
}

export async function dispatchInstagramEvent(
  input: DispatchInstagramEventInput,
): Promise<{
  matched: number;
  results: Array<{ slug: string; status: string; error?: string; source?: string }>;
  mode: DispatchMode;
  skippedCatalog: boolean;
}> {
  await brandAutomationsService.ensureSchema();
  await automationDefinitionsService.ensureSchema();

  const mode: DispatchMode = input.modeOverride || (await getBrandDispatchMode(input.brandId));
  const results: Array<{ slug: string; status: string; error?: string; source?: string }> = [];
  let matched = 0;
  let skippedCatalog = false;

  if (await isBrandRepliesPaused(input.brandId)) {
    logger.info(`[IG Dispatcher] replies paused brand=${input.brandId}`);
    return { matched: 0, results: [], mode, skippedCatalog: true };
  }

  // --- Definitions path (hybrid + definitions; also runs in catalog mode for stubs/backward compat) ---
  const defs = await automationDefinitionsService.getEventMatches(
    input.brandId,
    "instagram",
    input.evento,
  );

  const winners =
    mode === "catalog"
      ? // legacy multi-fire all keyword-matching defs (still stubs unless force)
        defs.filter((def) => {
          if (def.trigger.tipo !== "evento") return false;
          const keywords = Array.isArray(def.trigger.palavrasChave) ? def.trigger.palavrasChave : [];
          if (input.matchKeyword && keywords.length > 0 && !keywordMatches(input.matchKeyword, keywords)) {
            return false;
          }
          return true;
        })
      : selectWinnersBySurface(defs, input.matchKeyword);

  const defMatchCount = winners.length;

  if (mode === "hybrid" || mode === "definitions") {
    for (const def of winners) {
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
        // stub outcome must NOT count as success (would block catalog fallback with no real send)
        const status = run.skipped
          ? "skipped"
          : run.outcome === "stub"
            ? "stub"
            : run.ok
              ? "success"
              : "error";
        results.push({
          slug: def.id,
          status,
          error: run.ok || run.skipped || run.outcome === "stub" ? undefined : run.message,
          source: "definition",
        });
        logger.info(
          `[IG Dispatcher] def ${def.id} status=${status} msg=${(run.message || "").slice(0, 80)}`,
        );
      } catch (err: any) {
        const msg = String(err?.message || err).slice(0, 200);
        logger.error(`[IG Dispatcher] def ${def.id}: ${msg}`);
        results.push({ slug: def.id, status: "error", error: msg, source: "definition" });
      }
    }
  }

  // Only skip catalog when a definition actually SENT successfully
  const defSuccessCount = results.filter((r) => r.source === "definition" && r.status === "success").length;
  const hasEventDefs = await brandHasEventDefinitions(input.brandId, input.evento);

  // Regra de produto: resposta só por automação específica.
  // Se existem definitions para o evento (mesmo todas inativas), NÃO usar fallback
  // do catálogo legado — senão "desligar todas" ainda responde via ig-webhook-dm-reply.
  skippedCatalog =
    mode === "definitions" ||
    hasEventDefs ||
    (mode === "hybrid" && defSuccessCount > 0) ||
    shouldSkipCatalogWebhookReplies(mode, defSuccessCount);

  // --- Catalog path (legado: só brands sem definitions para o evento) ---
  if (skippedCatalog) {
    logger.info(
      `[IG Dispatcher] skip catalog brand=${input.brandId} evento=${input.evento} mode=${mode} hasEventDefs=${hasEventDefs} defSuccess=${defSuccessCount} defMatched=${defMatchCount}`,
    );
    // Desliga zumbis de catálogo quando o controle já é por definitions
    if (hasEventDefs) {
      if (input.evento === "resposta_padrao_dm" || input.evento === "dm_keyword") {
        void brandAutomationsService
          .pauseSlugForBrand(input.brandId, "ig-webhook-dm-reply")
          .catch(() => undefined);
      }
      if (input.evento === "comentario_keyword") {
        void brandAutomationsService
          .pauseSlugForBrand(input.brandId, "ig-webhook-comment-keyword")
          .catch(() => undefined);
      }
    }
  } else {
    // Apenas brand_automations com status='active' (filtro em runCatalogWebhookMatches)
    const catalogResults = await runCatalogWebhookMatches(input);
    matched += catalogResults.length;
    for (const r of catalogResults) {
      results.push({ ...r, source: "catalog" });
    }
  }

  // catalog mode still runs defs as secondary (legacy multi-fire) — keep for soft transition when stubs
  if (mode === "catalog") {
    for (const def of winners) {
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
          status: run.skipped ? "skipped" : run.ok ? "success" : "error",
          error: run.ok || run.skipped ? undefined : run.message,
          source: "definition",
        });
      } catch (err: any) {
        const msg = String(err?.message || err).slice(0, 200);
        results.push({ slug: def.id, status: "error", error: msg, source: "definition" });
      }
    }
  }

  return { matched, results, mode, skippedCatalog };
}

export { shouldApplyGlobalAutoReplyGates };

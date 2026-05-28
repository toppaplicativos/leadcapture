/**
 * ═══════════════════════════════════════════════════════════════════
 * Automation Scheduler — tick periodico que dispara brand_automations
 * ═══════════════════════════════════════════════════════════════════
 *
 * Como funciona:
 *   1. A cada 60s, busca brand_automations com status='active' e
 *      next_run_at <= NOW (LIMIT 20 por tick pra nao saturar).
 *   2. Pra cada uma, cria um registro de brand_automation_runs (status=running),
 *      dispara o executor da TASK_REGISTRY correspondente, e ao terminar
 *      chama finishRun() que atualiza counters + calcula proximo next_run_at.
 *   3. Roda no MESMO processo do API (in-process). Em escala maior,
 *      pode virar worker separado, mas pra ate dezenas de brands ativos
 *      o overhead eh trivial.
 *
 * Crashs em uma task NAO derrubam o scheduler — try/catch isola cada run.
 */

import { brandAutomationsService } from "./brandAutomations";
import { getTaskFunction } from "./automationTasks";
import { logger } from "../utils/logger";

const TICK_INTERVAL_MS = 60_000; // 1 minuto
const MAX_PER_TICK = 20;          // throttle: max automacoes disparadas por tick
const RUN_TIMEOUT_MS = 5 * 60_000; // 5 min hard timeout por task

let timer: NodeJS.Timeout | null = null;
let isTicking = false; // mutex pra evitar overlap se um tick demorar > 60s
let _started = false;

/* Inicia o scheduler. Idempotente — chamar varias vezes nao cria multiplos timers. */
export function startAutomationScheduler(): void {
  if (_started) return;
  _started = true;

  /* Garante schema antes do primeiro tick */
  brandAutomationsService.ensureSchema().catch((e) => {
    logger.error(`AutomationScheduler: falha ao garantir schema (${e.message})`);
  });

  /* Primeiro tick depois de 30s pra dar tempo do app subir */
  setTimeout(() => {
    void tick();
    timer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
  }, 30_000);

  logger.info(`AutomationScheduler iniciado (tick=${TICK_INTERVAL_MS}ms, max=${MAX_PER_TICK}/tick)`);
}

export function stopAutomationScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  _started = false;
}

async function tick(): Promise<void> {
  if (isTicking) {
    logger.warn("AutomationScheduler: tick anterior ainda em execucao, pulando");
    return;
  }
  isTicking = true;
  try {
    const due = await brandAutomationsService.getDueAutomations(MAX_PER_TICK);
    if (due.length === 0) return;

    logger.info(`AutomationScheduler tick: ${due.length} automacao(oes) due`);
    /* Executa todas em paralelo - sao tasks independentes por brand */
    await Promise.all(due.map((auto) => runOne(auto, "cron")));
  } catch (err: any) {
    logger.error(`AutomationScheduler tick failed: ${err?.message || err}`);
  } finally {
    isTicking = false;
  }
}

/* Executa UMA brand_automation. Cria run, chama task, finaliza run.
   Hard timeout de 5min. Erros isolados em try/catch. */
export async function runOne(
  auto: { id: string; brand_id: string; user_id: string; catalog_slug: string; config: Record<string, any>; task_type: string; catalog_name: string },
  triggeredBy: "cron" | "manual",
): Promise<{ runId: string; status: "success" | "error"; durationMs: number; result?: any; errorMessage?: string }> {
  const taskFn = getTaskFunction(auto.task_type);
  if (!taskFn) {
    logger.warn(`AutomationScheduler: task_type '${auto.task_type}' nao registrado (catalog=${auto.catalog_slug})`);
    const runId = await brandAutomationsService.startRun(auto.id, triggeredBy);
    const msg = `Task type '${auto.task_type}' nao registrado`;
    await brandAutomationsService.finishRun(runId, auto.id, "error", 0, undefined, msg);
    return { runId, status: "error", durationMs: 0, errorMessage: msg };
  }

  const runId = await brandAutomationsService.startRun(auto.id, triggeredBy);
  const start = Date.now();

  try {
    /* Timeout hard de 5min — se task pendurar, marca como error e segue */
    const result = await Promise.race([
      taskFn(auto.config || {}, {
        brandAutomationId: auto.id,
        runId,
        brandId: auto.brand_id,
        userId: auto.user_id,
        catalogSlug: auto.catalog_slug,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Task timeout apos ${RUN_TIMEOUT_MS}ms`)), RUN_TIMEOUT_MS),
      ),
    ]);

    const durationMs = Date.now() - start;
    await brandAutomationsService.finishRun(runId, auto.id, "success", durationMs, result);
    logger.info(`AutomationScheduler ok: ${auto.catalog_name} brand=${auto.brand_id} run=${runId} ${durationMs}ms`);
    return { runId, status: "success", durationMs, result };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const msg = String(err?.message || err).slice(0, 500);
    await brandAutomationsService.finishRun(runId, auto.id, "error", durationMs, undefined, msg);
    logger.error(`AutomationScheduler error: ${auto.catalog_name} brand=${auto.brand_id} run=${runId} - ${msg}`);
    return { runId, status: "error", durationMs, errorMessage: msg };
  }
}

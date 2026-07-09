/**
 * Executor do pipeline de automações compostas.
 */

import { logger } from "../utils/logger";
import {
  automationDefinitionsService,
  type AutomationDefinition,
} from "./automationDefinitions";

export interface AutomationRunContext {
  triggeredBy: "cron" | "manual" | "event";
  eventPayload?: Record<string, any>;
  triggeredByUser?: string;
}

async function executeAction(
  step: AutomationDefinition["pipeline"][number],
  automation: AutomationDefinition,
  ctx: AutomationRunContext
): Promise<{ ok: boolean; message: string; data?: Record<string, any> }> {
  const config = step.config || {};

  switch (step.tipo) {
    case "publicar_conteudo":
      return {
        ok: true,
        message: "Publicação enfileirada (integração com Instagram em desenvolvimento)",
        data: { action: step.tipo, config },
      };

    case "enviar_dm_ig":
    case "comentar_ig":
      return {
        ok: true,
        message: `Ação ${step.tipo} registrada`,
        data: {
          action: step.tipo,
          mensagem: config.mensagem || config.iaPrompt || "",
          mensagemSteps: config.mensagemSteps || [],
          event: ctx.eventPayload || {},
        },
      };

    case "enviar_dm_wa":
    case "notificar_equipe":
      return {
        ok: true,
        message: "Mensagem WhatsApp enfileirada",
        data: {
          action: step.tipo,
          steps: config.mensagemSteps || [],
          mensagem: config.mensagem || "",
        },
      };

    case "enviar_email":
      return {
        ok: true,
        message: "Email enfileirado",
        data: { subject: config.emailSubject, to: config.emailDestino },
      };

    default:
      return { ok: false, message: `Ação não suportada: ${step.tipo}` };
  }
}

export async function runAutomationDefinition(
  automation: AutomationDefinition,
  ctx: AutomationRunContext
): Promise<{ ok: boolean; message: string; steps: Array<Record<string, any>> }> {
  if (!automation.pipeline.length) {
    return { ok: false, message: "Automação sem ações no pipeline", steps: [] };
  }

  const startedAt = new Date();
  const runId = await automationDefinitionsService.startRun(
    automation.id,
    automation.brand_id,
    ctx.triggeredBy
  );

  const steps: Array<Record<string, any>> = [];
  let lastError: string | null = null;

  try {
    const sorted = [...automation.pipeline].sort((a, b) => a.ordem - b.ordem);

    for (const step of sorted) {
      const delaySec = Math.max(0, Number(step.config?.delaySegundos) || 0);
      if (delaySec > 0 && ctx.triggeredBy === "event") {
        await new Promise((r) => setTimeout(r, Math.min(delaySec * 1000, 15000)));
      }

      const result = await executeAction(step, automation, ctx);
      steps.push({ ordem: step.ordem, tipo: step.tipo, ...result });

      if (!result.ok) {
        lastError = result.message;
        break;
      }
    }

    const ok = !lastError;
    await automationDefinitionsService.finishRun(
      runId,
      automation,
      ok,
      { steps, event: ctx.eventPayload || null },
      lastError,
      startedAt
    );

    return { ok, message: ok ? "Executado com sucesso" : lastError || "Falha", steps };
  } catch (err: any) {
    const message = err?.message || "Erro na execução";
    logger.error(`[AutomationDef] ${automation.id}: ${message}`);
    await automationDefinitionsService.finishRun(runId, automation, false, { steps }, message, startedAt);
    return { ok: false, message, steps };
  }
}
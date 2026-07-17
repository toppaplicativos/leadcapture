/**
 * Executor do pipeline de automações compostas.
 * Real IG send for enviar_dm_ig / comentar_ig when sendReal is enabled.
 */

import { logger } from "../utils/logger";
import {
  automationDefinitionsService,
  type AutomationDefinition,
} from "./automationDefinitions";
import {
  applyBrandPlaceholders,
  composeInstagramReply,
  resolveMessageFromPipelineConfig,
  sendInstagramCommentReply,
  sendInstagramDm,
  sendInstagramDmFromPipeline,
} from "./instagramReplyHelpers";
import { evaluateLimits, extractActorId } from "./automationMatchLogic";
import { computeSendRealForMode, getBrandDispatchMode, isBrandRepliesPaused } from "./automationDispatchMode";
import { instagramService } from "./instagram";
import { FlowExecutorService } from "./flowExecutor";

export interface AutomationRunContext {
  triggeredBy: "cron" | "manual" | "event";
  eventPayload?: Record<string, any>;
  triggeredByUser?: string;
  /** Force send real (tests / manual with override). */
  forceSendReal?: boolean;
  /** Inject send adapters (tests mock Meta boundary only). */
  sendDmFn?: typeof sendInstagramDm;
  sendDmPipelineFn?: typeof sendInstagramDmFromPipeline;
  replyCommentFn?: typeof sendInstagramCommentReply;
  skipLimitCheck?: boolean;
}

async function executeAction(
  step: AutomationDefinition["pipeline"][number],
  automation: AutomationDefinition,
  ctx: AutomationRunContext,
  opts: { sendReal: boolean },
): Promise<{ ok: boolean; message: string; data?: Record<string, any>; outcome?: string }> {
  const config = step.config || {};
  const payload = ctx.eventPayload || {};

  switch (step.tipo) {
    case "publicar_conteudo": {
      const cp = (config.contentPublishing || {}) as Record<string, any>;
      const format = String(cp.format || "single_image");
      const mediaType =
        format === "reel"
          ? "REELS"
          : format === "story"
            ? "STORIES"
            : format === "carousel"
              ? "CAROUSEL_ALBUM"
              : "IMAGE";
      const caption = String(cp.captionOverride || config.mensagem || "").trim();
      const mediaUrl = String(cp.mediaUrl || config.midia?.url || "").trim();
      const userTagList = String(cp.userTags || "")
        .split(/[,;\s]+/)
        .map((u) => u.replace(/^@/, "").trim())
        .filter(Boolean);
      const collabList = String(cp.collaborators || "")
        .split(/[,;\s]+/)
        .map((u) => u.replace(/^@/, "").trim())
        .filter(Boolean)
        .slice(0, 3);
      const coverUrl = String(cp.coverUrl || "").trim();
      const publish_meta = {
        location_id: cp.locationId ? String(cp.locationId).trim() : undefined,
        location_name: cp.locationName ? String(cp.locationName).trim() : undefined,
        user_tags: userTagList.length
          ? userTagList.map((username, i) => ({
              username,
              x: Math.min(0.9, 0.35 + (i % 3) * 0.15),
              y: Math.min(0.9, 0.4 + Math.floor(i / 3) * 0.15),
            }))
          : undefined,
        alt_text: cp.altText ? String(cp.altText).trim() : undefined,
        share_to_feed: format === "reel" ? cp.shareToFeed !== false : undefined,
        collaborators: collabList.length ? collabList : undefined,
        cover_url: format === "reel" && coverUrl ? coverUrl : undefined,
      };

      if (!opts.sendReal && ctx.forceSendReal !== true) {
        return {
          ok: true,
          message: `Publicação simulada (${format})`,
          data: {
            action: step.tipo,
            format,
            caption,
            publish_meta,
            mediaUrl: mediaUrl || null,
            stub: true,
          },
          outcome: "stub",
        };
      }

      try {
        const approval = String(cp.approvalMode || "manual_review");
        const wantsAuto = approval === "auto_publish";
        const draft = await instagramService.createPost(automation.brand_id, {
          media_type: mediaType as any,
          media_url: mediaUrl || undefined,
          caption: caption || undefined,
          status: wantsAuto && mediaUrl ? "draft" : "draft",
          publish_meta,
        });

        let publishResult: any = null;
        if (wantsAuto && mediaUrl && mediaType === "IMAGE") {
          // Só auto-publica imagem simples com URL — carrossel/reels precisam de pipeline de mídia
          publishResult = await instagramService.publishPost(automation.brand_id, draft.id);
        }

        return {
          ok: true,
          message: publishResult?.ok
            ? "Post publicado no Instagram"
            : mediaUrl
              ? "Rascunho criado na fila do Instagram com marcação (local/usuários)"
              : "Configuração de publicação salva — adicione mídia e publique na aba Instagram",
          data: {
            action: step.tipo,
            format,
            draft_post_id: draft.id,
            publish_meta,
            published: Boolean(publishResult?.ok),
            publish_message: publishResult?.message || null,
          },
          outcome: publishResult?.ok ? "sent" : "queued",
        };
      } catch (err: any) {
        logger.error(`[automation] publicar_conteudo: ${err?.message || err}`);
        return {
          ok: false,
          message: err?.message || "Falha ao enfileirar publicação IG",
          outcome: "error",
        };
      }
    }

    case "enviar_dm_ig": {
      const msg = resolveMessageFromPipelineConfig(config);
      const recipientId = String(
        payload.sender_id || payload.from_id || payload.from || payload.recipient_id || "",
      );
      const inboundText = String(payload.text || payload.inbound_text || payload.postback_payload || "");
      const steps = Array.isArray(config.mensagemSteps) ? config.mensagemSteps : [];
      const hasInteractive = steps.some((s: any) =>
        ["botoes", "cta", "link"].includes(String(s?.tipo || "")),
      );

      if (!opts.sendReal && ctx.forceSendReal !== true) {
        return {
          ok: true,
          message: `Ação ${step.tipo} simulada (send desabilitado)`,
          data: {
            action: step.tipo,
            mensagem: msg.mensagem || msg.fallback,
            interactive: hasInteractive,
            event: payload,
            stub: true,
          },
          outcome: "stub",
        };
      }

      if (!recipientId) {
        return { ok: false, message: "recipient/sender_id ausente para DM IG", outcome: "error" };
      }

      // BotLoopGuard — block peer-bot before compose/send (defense in depth)
      if (inboundText && opts.sendReal !== false) {
        try {
          const { evaluateAndMaybeLockIg } = await import("./botLoopGuard");
          const decision = await evaluateAndMaybeLockIg({
            brandId: automation.brand_id,
            senderId: recipientId,
            inboundText,
          });
          if (decision.block) {
            return {
              ok: false,
              message: `Bot loop bloqueado: ${decision.reason}`,
              data: {
                action: step.tipo,
                sender_id: recipientId,
                bot_loop: true,
                reason: decision.reason,
                risk: decision.risk,
                signals: decision.signals,
              },
              outcome: "bot_loop_blocked",
            };
          }
        } catch (err: any) {
          logger.warn(`[automation] botLoopGuard enviar_dm_ig: ${err?.message || err}`);
        }
      }

      // Interactive pipeline (buttons / CTA / link) → Meta quick_replies or button template
      if (hasInteractive && steps.length) {
        const pipelineFn = ctx.sendDmPipelineFn || sendInstagramDmFromPipeline;
        const brandName = String(
          payload.brand_context?.brand_name || "",
        );
        const composedText = await composeInstagramReply({
          brandId: automation.brand_id,
          userId: automation.user_id,
          inboundText,
          fallbackMessage: msg.fallback,
          iaGenerated: msg.iaGenerated,
          mensagem: msg.mensagem,
          username: payload.username || payload.from_username,
          senderId: recipientId,
        });
        // Expand brand placeholders + hydrate product links on buttons/CTA
        const {
          collectProductIdsFromMensagemSteps,
          loadProductsForMessaging,
          buildProductTemplateValues,
          applyTemplateTags,
          hydrateInteractiveWithProducts,
        } = await import("./productMessageTags");
        const productIds = collectProductIdsFromMensagemSteps(steps);
        const productCtx = await loadProductsForMessaging(productIds, {
          brandId: automation.brand_id,
          userId: automation.user_id,
        });
        const productValues = buildProductTemplateValues(productCtx);
        const productsById = new Map(productCtx.map((p) => [p.id, p]));
        const expand = (s: any) => {
          if (!s || typeof s !== "object") return s;
          const next = { ...s };
          if (next.caption) {
            next.caption = applyBrandPlaceholders(String(next.caption), {
              brand_name: brandName || undefined,
              username: payload.username || payload.from_username,
            });
            next.caption = applyTemplateTags(next.caption, productValues);
          }
          if (next.url) next.url = applyTemplateTags(String(next.url), productValues);
          if (Array.isArray(next.buttons)) {
            next.buttons = hydrateInteractiveWithProducts(next.buttons, productsById);
          }
          if (next.productId && productsById.has(String(next.productId))) {
            const p = productsById.get(String(next.productId))!;
            if (!next.url) next.url = p.link;
            if (next.tipo === "cta" && !next.ctaLabel) next.ctaLabel = "Ver produto";
          }
          return next;
        };
        const expandedSteps = steps.map(expand);
        // Prefer static captions on button steps; inject composed text as first text if missing
        const stepsWithText = expandedSteps.some((s: any) => s?.tipo === "texto" && s.caption)
          ? expandedSteps
          : [{ tipo: "texto", caption: composedText.reply }, ...expandedSteps];
        const sent = await pipelineFn(
          automation.brand_id,
          recipientId,
          stepsWithText,
          composedText.reply,
        );
        return {
          ok: sent.ok,
          message: sent.ok
            ? `DM interativa enviada (${sent.kind || "ok"})`
            : sent.error || "Falha ao enviar DM interativa",
          data: {
            action: step.tipo,
            sender_id: recipientId,
            kind: sent.kind,
            reply_text: composedText.reply.slice(0, 200),
            source: composedText.source,
            message_id: sent.messageId,
            error: sent.error,
          },
          outcome: sent.ok ? "success" : "error",
        };
      }

      const composed = await composeInstagramReply({
        brandId: automation.brand_id,
        userId: automation.user_id,
        inboundText,
        fallbackMessage: msg.fallback,
        iaGenerated: msg.iaGenerated,
        mensagem: msg.mensagem,
        username: payload.username || payload.from_username,
        senderId: recipientId,
      });

      const sendFn = ctx.sendDmFn || sendInstagramDm;
      // Prefer multi-bubble send when helper supports bubbles (no mid-sentence truncate)
      const sent =
        sendFn === sendInstagramDm
          ? await sendInstagramDm(automation.brand_id, recipientId, composed.reply, {
              bubbles: composed.bubbles,
            })
          : await sendFn(automation.brand_id, recipientId, composed.reply);
      return {
        ok: sent.ok,
        message: sent.ok
          ? `DM enviada${(sent as any).bubblesSent > 1 ? ` (${(sent as any).bubblesSent} bolhas)` : ""}`
          : sent.error || "Falha ao enviar DM",
        data: {
          action: step.tipo,
          sender_id: recipientId,
          reply_text: composed.reply.slice(0, 200),
          bubbles: composed.bubbles?.length || 1,
          source: composed.source,
          message_id: sent.messageId,
          error: sent.error,
        },
        outcome: sent.ok ? "success" : "error",
      };
    }

    case "comentar_ig": {
      const msg = resolveMessageFromPipelineConfig(config);
      const commentId = String(payload.comment_id || payload.id || "");
      const inboundText = String(payload.text || "");

      if (!opts.sendReal && ctx.forceSendReal !== true) {
        return {
          ok: true,
          message: `Ação ${step.tipo} simulada (send desabilitado)`,
          data: { action: step.tipo, stub: true, comment_id: commentId },
          outcome: "stub",
        };
      }

      if (!commentId) {
        return { ok: false, message: "comment_id ausente", outcome: "error" };
      }

      const composed = await composeInstagramReply({
        brandId: automation.brand_id,
        userId: automation.user_id,
        inboundText,
        fallbackMessage: msg.fallback,
        iaGenerated: msg.iaGenerated,
        mensagem: msg.mensagem,
        username: payload.username || payload.from_username,
        extraPromptLines: ["Modo: resposta publica no comentario"],
      });

      const replyFn = ctx.replyCommentFn || sendInstagramCommentReply;
      const sent = await replyFn(automation.brand_id, commentId, composed.reply);
      return {
        ok: sent.ok,
        message: sent.ok ? "Comentário respondido" : sent.error || "Falha ao responder comentário",
        data: {
          action: step.tipo,
          comment_id: commentId,
          reply_text: composed.reply.slice(0, 200),
          source: composed.source,
          reply_id: sent.replyId,
          error: sent.error,
        },
        outcome: sent.ok ? "success" : "error",
      };
    }

    case "enviar_dm_wa":
    case "notificar_equipe":
      return {
        ok: true,
        message: "Mensagem WhatsApp enfileirada (stub nesta fase)",
        data: {
          action: step.tipo,
          steps: config.mensagemSteps || [],
          mensagem: config.mensagem || "",
        },
        outcome: "stub",
      };

    case "enviar_email":
      return {
        ok: true,
        message: "Email enfileirado (stub)",
        data: { subject: config.emailSubject, to: config.emailDestino },
        outcome: "stub",
      };

    case "iniciar_fluxo": {
      const flowId = String(
        config.flowId || config.fluxoId || config.flow_id || ""
      ).trim();
      if (!flowId) {
        return { ok: false, message: "flowId ausente na ação iniciar_fluxo", outcome: "error" };
      }
      const phone = String(
        payload.phone ||
          payload.telefone ||
          payload.from ||
          payload.wa_id ||
          payload.customer?.phone ||
          config.destinoValor ||
          ""
      ).trim();
      try {
        const result = await FlowExecutorService.get().startFlowById({
          flowId,
          userId: automation.user_id,
          brandId: automation.brand_id,
          phone,
          message: String(payload.message || payload.text || payload.body || ""),
          name: String(payload.name || payload.nome || ""),
          instanceId: payload.instanceId ? String(payload.instanceId) : undefined,
          triggerSubtype: "automation",
          source: "automation",
        });
        return {
          ok: result.ok,
          message: result.ok
            ? `Fluxo iniciado (${result.executionId})`
            : result.error || "Falha ao iniciar fluxo",
          data: {
            action: step.tipo,
            flow_id: flowId,
            execution_id: result.executionId,
            phone: phone || null,
            error: result.error,
          },
          outcome: result.ok ? "success" : "error",
        };
      } catch (err: any) {
        return {
          ok: false,
          message: String(err?.message || err),
          outcome: "error",
        };
      }
    }

    default:
      return { ok: false, message: `Ação não suportada: ${step.tipo}`, outcome: "error" };
  }
}

export async function runAutomationDefinition(
  automation: AutomationDefinition,
  ctx: AutomationRunContext,
): Promise<{
  ok: boolean;
  message: string;
  steps: Array<Record<string, any>>;
  skipped?: boolean;
  outcome?: string;
}> {
  if (!automation.pipeline.length) {
    return { ok: false, message: "Automação sem ações no pipeline", steps: [] };
  }

  if (!automation.ativa && ctx.triggeredBy === "event") {
    return {
      ok: false,
      message: "Automação inativa",
      steps: [],
      skipped: true,
      outcome: "inactive",
    };
  }

  const evento = String(ctx.eventPayload?.evento || automation.trigger?.tipo === "evento"
    ? (automation.trigger as any).evento
    : "");
  const actorId = extractActorId(
    evento || "resposta_padrao_dm",
    ctx.eventPayload || {},
    ctx.triggeredByUser,
  );

  let sendReal = false;
  try {
    const mode = await getBrandDispatchMode(automation.brand_id);
    sendReal = ctx.forceSendReal === true || computeSendRealForMode(mode);
    if (await isBrandRepliesPaused(automation.brand_id)) {
      return {
        ok: false,
        message: "Replies pausados na brand",
        steps: [],
        skipped: true,
        outcome: "paused",
      };
    }
  } catch {
    sendReal = ctx.forceSendReal === true;
  }

  if (!ctx.skipLimitCheck && actorId && ctx.triggeredBy === "event") {
    try {
      const stats = await automationDefinitionsService.getActorRunStats(
        automation.id,
        actorId,
        automation.limites,
      );
      const decision = evaluateLimits(automation, stats);
      if (!decision.allow) {
        const startedAt = new Date();
        const runId = await automationDefinitionsService.startRun(
          automation.id,
          automation.brand_id,
          ctx.triggeredBy,
          { actorId },
        );
        await automationDefinitionsService.finishRun(
          runId,
          automation,
          false,
          { reason: decision.reason, actor_id: actorId },
          decision.reason,
          startedAt,
          { skipped: true, outcome: decision.reason, actorId },
        );
        return {
          ok: false,
          message: `Limite: ${decision.reason}`,
          steps: [],
          skipped: true,
          outcome: decision.reason,
        };
      }
    } catch (err: any) {
      logger.warn(`[AutomationDef] limit check failed: ${err?.message || err}`);
    }
  }

  const startedAt = new Date();
  const runId = await automationDefinitionsService.startRun(
    automation.id,
    automation.brand_id,
    ctx.triggeredBy,
    { actorId },
  );

  const steps: Array<Record<string, any>> = [];
  let lastError: string | null = null;
  let lastOutcome = "success";
  let anyStub = false;

  try {
    const sorted = [...automation.pipeline].sort((a, b) => a.ordem - b.ordem);

    for (const step of sorted) {
      const delaySec = Math.max(0, Number(step.config?.delaySegundos) || 0);
      if (delaySec > 0 && ctx.triggeredBy === "event") {
        await new Promise((r) => setTimeout(r, Math.min(delaySec * 1000, 15000)));
      }

      const result = await executeAction(step, automation, ctx, { sendReal });
      steps.push({ ordem: step.ordem, tipo: step.tipo, ...result });

      if (result.outcome === "stub") anyStub = true;
      if (!result.ok) {
        lastError = result.message;
        lastOutcome = result.outcome || "error";
        break;
      }
      lastOutcome = result.outcome || "success";
    }

    const ok = !lastError;
    const outcome = anyStub && ok ? "stub" : lastOutcome;
    await automationDefinitionsService.finishRun(
      runId,
      automation,
      ok,
      { steps, event: ctx.eventPayload || null, outcome },
      lastError,
      startedAt,
      { outcome, actorId, skipped: false },
    );

    return {
      ok,
      message: ok ? (anyStub ? "Executado (simulado)" : "Executado com sucesso") : lastError || "Falha",
      steps,
      outcome,
    };
  } catch (err: any) {
    const message = err?.message || "Erro na execução";
    logger.error(`[AutomationDef] ${automation.id}: ${message}`);
    await automationDefinitionsService.finishRun(
      runId,
      automation,
      false,
      { steps },
      message,
      startedAt,
      { outcome: "error", actorId },
    );
    return { ok: false, message, steps, outcome: "error" };
  }
}

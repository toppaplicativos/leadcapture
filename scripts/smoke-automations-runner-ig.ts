/**
 * Drives shipped runAutomationDefinition for enviar_dm_ig / comentar_ig
 * with Meta send mocked only at the send function boundary.
 * DB is stubbed via light monkey-patch of automationDefinitionsService run methods.
 *
 * Run: npx --yes tsx scripts/smoke-automations-runner-ig.ts
 */

import assert from "node:assert/strict";
import type { AutomationDefinition } from "../src/services/automationDefinitions";
import { automationDefinitionsService } from "../src/services/automationDefinitions";
import { runAutomationDefinition } from "../src/services/automationDefinitionRunner";
import { evaluateLimits } from "../src/services/automationMatchLogic";

const sends: Array<{ kind: string; to: string; text: string }> = [];

// Stub run persistence (no real DB)
(automationDefinitionsService as any).startRun = async () => "run-test-1";
(automationDefinitionsService as any).finishRun = async () => undefined;
(automationDefinitionsService as any).getActorRunStats = async () => ({
  lastSuccessAt: null,
  successCountInMaxWindow: 0,
  successCountLastHour: 0,
  successCountLastDay: 0,
});

// forceSendReal + skipLimitCheck on context; mode module may still hit DB — patch ensure flags
(automationDefinitionsService as any).ensureSchema = async () => undefined;

function makeDef(overrides: Partial<AutomationDefinition> = {}): AutomationDefinition {
  return {
    id: "def-1",
    brand_id: "brand-1",
    user_id: "user-1",
    nome: "Test DM",
    descricao: "",
    ativa: true,
    status: "live",
    trigger: {
      tipo: "evento",
      plataforma: "instagram",
      evento: "resposta_padrao_dm",
      palavrasChave: [],
    },
    pipeline: [
      {
        ordem: 1,
        tipo: "enviar_dm_ig",
        config: {
          mensagem: "Olá do seed",
          iaGenerated: false,
          fallback_message: "FB",
        },
      },
    ],
    limites: {
      maxPorUsuario: 3,
      cooldownSegundos: 0,
      maxPorHora: 0,
      maxPorDia: 0,
      janelaMaxUsuarioSegundos: 86400,
    },
    metrics: { runs: 0, sucessos: 0, falhas: 0 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function main() {
  console.log("=== smoke-automations-runner-ig ===\n");

  // 1) Real runner + mock sendDm at boundary
  const def = makeDef();
  const result = await runAutomationDefinition(def, {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: true,
    eventPayload: {
      evento: "resposta_padrao_dm",
      sender_id: "psid-99",
      text: "oi",
    },
    sendDmFn: async (_brand, recipientId, text) => {
      sends.push({ kind: "dm", to: recipientId, text });
      return { ok: true, messageId: "mid-1" };
    },
  });

  assert.equal(result.ok, true, `expected ok, got ${result.message}`);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, "psid-99");
  assert.equal(sends[0].text, "Olá do seed");
  console.log("  OK  enviar_dm_ig success path (mocked Meta boundary)");

  // 2) Inactive definition does not send on event
  sends.length = 0;
  const inactive = makeDef({ ativa: false });
  const r2 = await runAutomationDefinition(inactive, {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: true,
    eventPayload: { evento: "resposta_padrao_dm", sender_id: "psid-1", text: "x" },
    sendDmFn: async (_b, to, text) => {
      sends.push({ kind: "dm", to, text });
      return { ok: true };
    },
  });
  assert.equal(r2.skipped, true);
  assert.equal(sends.length, 0);
  console.log("  OK  inactive definition → no send");

  // 3) Comment reply
  sends.length = 0;
  const commentDef = makeDef({
    pipeline: [
      {
        ordem: 1,
        tipo: "comentar_ig",
        config: { mensagem: "Valeu!", iaGenerated: false, fallback_message: "FB" },
      },
    ],
  });
  const r3 = await runAutomationDefinition(commentDef, {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: true,
    eventPayload: {
      evento: "comentario_keyword",
      comment_id: "cmt-55",
      text: "preço?",
      from_id: "u1",
    },
    replyCommentFn: async (_b, commentId, text) => {
      sends.push({ kind: "comment", to: commentId, text });
      return { ok: true, replyId: "rr" };
    },
  });
  assert.equal(r3.ok, true, r3.message);
  assert.equal(sends[0]?.kind, "comment");
  assert.equal(sends[0]?.to, "cmt-55");
  console.log("  OK  comentar_ig success path");

  // 4) Limit skip (pure, same function runner uses)
  const lim = evaluateLimits(def, {
    successCountInMaxWindow: 3,
    lastSuccessAt: new Date(Date.now() - 999999).toISOString(),
  });
  assert.equal(lim.allow, false);
  console.log("  OK  limit maxPorUsuario blocks before send");

  // 5) Limit path in runner with stubbed stats
  (automationDefinitionsService as any).getActorRunStats = async () => ({
    lastSuccessAt: null,
    successCountInMaxWindow: 99,
    successCountLastHour: 0,
    successCountLastDay: 0,
  });
  sends.length = 0;
  const r4 = await runAutomationDefinition(makeDef(), {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: false,
    eventPayload: { evento: "resposta_padrao_dm", sender_id: "psid-x", text: "hi" },
    sendDmFn: async (_b, to, text) => {
      sends.push({ kind: "dm", to, text });
      return { ok: true };
    },
  });
  assert.equal(r4.skipped, true);
  assert.equal(sends.length, 0);
  console.log("  OK  runner enforces limits → no send");

  console.log("\n=== runner-ig smoke passed ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Smoke tests for IG automations restructure — drives shipped modules.
 * Run: npx --yes tsx scripts/smoke-automations-structure.ts
 */

import assert from "node:assert/strict";
import {
  selectWinnersBySurface,
  evaluateLimits,
  shouldSkipCatalogWebhookReplies,
  primarySurface,
  sortDefinitionsForMatch,
  keywordMatches,
  resolveSendReal,
  isInstagramPlatformFilter,
  type MatchableDefinition,
} from "../src/services/automationMatchLogic";
import {
  getInstagramReplySeedPack,
  listInstagramSeedKeys,
  IG_SEED_PACK_VERSION,
} from "../src/services/automationDefinitionSeeds";
import {
  resolveMessageFromPipelineConfig,
} from "../src/services/instagramReplyHelpers";
import {
  computeSendRealForMode,
  isIgSendEnabled,
  shouldApplyGlobalAutoReplyGates,
} from "../src/services/automationDispatchMode";

function def(partial: Partial<MatchableDefinition> & { id: string }): MatchableDefinition {
  return {
    priority: 100,
    ativa: true,
    created_at: "2026-01-01T00:00:00.000Z",
    trigger: { tipo: "evento", plataforma: "instagram", evento: "comentario_keyword", palavrasChave: [] },
    pipeline: [{ ordem: 1, tipo: "enviar_dm_ig", config: {} }],
    limites: { maxPorUsuario: 3, cooldownSegundos: 3600, janelaMaxUsuarioSegundos: 86400 },
    ...partial,
  };
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  OK  ${name}`);
    passed += 1;
  } catch (e: any) {
    console.error(`  FAIL ${name}`);
    console.error(e?.message || e);
    process.exitCode = 1;
  }
}

console.log("=== smoke-automations-structure ===\n");

console.log("-- seed pack");
check("pack has default DM + comment surfaces", () => {
  const keys = listInstagramSeedKeys();
  assert.ok(keys.includes("ig.dm.default_reply"));
  assert.ok(keys.includes("ig.comment.keyword_dm"));
  assert.ok(keys.includes("ig.comment.keyword_public"));
  assert.ok(keys.includes("ig.dm.keyword"));
  assert.equal(IG_SEED_PACK_VERSION >= 1, true);
  const pack = getInstagramReplySeedPack();
  for (const s of pack) {
    assert.equal(s.pipeline.length >= 1, true);
    assert.ok(s.seed_key.startsWith("ig."));
  }
  // all seeds inactive by product design — pack itself has no ativa field; install sets false
  assert.ok(pack.length >= 5);
});

check("seed pack limits: max and cooldown independent (3/24h + 1h gap)", () => {
  const dm = getInstagramReplySeedPack().find((s) => s.seed_key === "ig.dm.default_reply")!;
  assert.equal(dm.limites.maxPorUsuario, 3);
  assert.equal(dm.limites.cooldownSegundos, 3600);
  assert.equal(dm.limites.janelaMaxUsuarioSegundos, 86400);
});

console.log("\n-- match / surface");
check("primarySurface dm vs public_comment", () => {
  assert.equal(primarySurface(def({ id: "1", pipeline: [{ ordem: 1, tipo: "enviar_dm_ig" }] })), "dm");
  assert.equal(primarySurface(def({ id: "2", pipeline: [{ ordem: 1, tipo: "comentar_ig" }] })), "public_comment");
});

check("first-match by surface allows dual comment winners", () => {
  const winners = selectWinnersBySurface(
    [
      def({
        id: "dm",
        priority: 30,
        pipeline: [{ ordem: 1, tipo: "enviar_dm_ig" }],
        trigger: {
          tipo: "evento",
          plataforma: "instagram",
          evento: "comentario_keyword",
          palavrasChave: ["preco"],
        },
      }),
      def({
        id: "pub",
        priority: 40,
        pipeline: [{ ordem: 1, tipo: "comentar_ig" }],
        trigger: {
          tipo: "evento",
          plataforma: "instagram",
          evento: "comentario_keyword",
          palavrasChave: ["preco"],
        },
      }),
      def({
        id: "dm2",
        priority: 10,
        pipeline: [{ ordem: 1, tipo: "enviar_dm_ig" }],
        trigger: {
          tipo: "evento",
          plataforma: "instagram",
          evento: "comentario_keyword",
          palavrasChave: ["preco", "valor"],
        },
      }),
    ],
    "qual o preco?",
  );
  assert.equal(winners.length, 2);
  assert.ok(winners.some((w) => w.id === "dm2")); // higher specificity + priority
  assert.ok(winners.some((w) => w.id === "pub"));
  assert.ok(!winners.some((w) => w.id === "dm")); // same surface as dm2
});

check("keyword filter + sort priority", () => {
  const sorted = sortDefinitionsForMatch([
    def({ id: "b", priority: 50 }),
    def({ id: "a", priority: 10 }),
  ]);
  assert.equal(sorted[0].id, "a");
  assert.equal(keywordMatches("quanto custa o preco", ["preço", "valor"]), true);
  assert.equal(keywordMatches("ola", ["preço"]), false);
});

check("inactive definitions never win", () => {
  const winners = selectWinnersBySurface([
    def({ id: "off", ativa: false }),
    def({ id: "on", priority: 90 }),
  ]);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].id, "on");
});

console.log("\n-- limits");
check("cooldown independent of maxPorUsuario", () => {
  const d = def({
    id: "L",
    limites: { maxPorUsuario: 3, cooldownSegundos: 3600, janelaMaxUsuarioSegundos: 86400 },
  });
  // after 1 success 30min ago: blocked by cooldown
  const cool = evaluateLimits(d, {
    lastSuccessAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    successCountInMaxWindow: 1,
  });
  assert.equal(cool.allow, false);
  if (!cool.allow) assert.equal(cool.reason, "cooldown");

  // after 1 success 2h ago: allowed (max not hit)
  const ok = evaluateLimits(d, {
    lastSuccessAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    successCountInMaxWindow: 1,
  });
  assert.equal(ok.allow, true);

  // 3 successes in window: max blocks even if cooldown ok
  const maxed = evaluateLimits(d, {
    lastSuccessAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    successCountInMaxWindow: 3,
  });
  assert.equal(maxed.allow, false);
  if (!maxed.allow) assert.equal(maxed.reason, "max_por_usuario");
});

check("inactive def limit", () => {
  const r = evaluateLimits(def({ id: "x", ativa: false }), {});
  assert.equal(r.allow, false);
});

console.log("\n-- dispatch skip catalog");
check("skip catalog when hybrid/definitions and def matched", () => {
  assert.equal(shouldSkipCatalogWebhookReplies("catalog", 5), false);
  assert.equal(shouldSkipCatalogWebhookReplies("hybrid", 0), false);
  assert.equal(shouldSkipCatalogWebhookReplies("hybrid", 1), true);
  assert.equal(shouldSkipCatalogWebhookReplies("definitions", 1), true);
  assert.equal(shouldSkipCatalogWebhookReplies("definitions", 0), false);
});

check("sendReal formula", () => {
  assert.equal(resolveSendReal("catalog", true), false);
  assert.equal(resolveSendReal("hybrid", true), true);
  assert.equal(resolveSendReal("hybrid", false), false);
  assert.equal(resolveSendReal("definitions", "false"), false);
  assert.equal(shouldApplyGlobalAutoReplyGates("catalog"), true);
  assert.equal(shouldApplyGlobalAutoReplyGates("hybrid"), false);
  assert.equal(shouldApplyGlobalAutoReplyGates("definitions"), false);
});

check("platform filter for mirror", () => {
  assert.equal(
    isInstagramPlatformFilter(
      def({
        id: "1",
        trigger: { tipo: "evento", plataforma: "instagram", evento: "dm_keyword" },
      }),
    ),
    true,
  );
  assert.equal(
    isInstagramPlatformFilter(
      def({
        id: "2",
        trigger: { tipo: "evento", plataforma: "whatsapp", evento: "dm_keyword" },
        pipeline: [{ ordem: 1, tipo: "enviar_dm_wa" }],
      }),
    ),
    false,
  );
});

console.log("\n-- reply helpers (message resolve — shipped)");
check("resolveMessageFromPipelineConfig", () => {
  const r = resolveMessageFromPipelineConfig({
    fallback_message: "FB",
    iaGenerated: true,
    mensagemSteps: [{ tipo: "texto", caption: "Oi" }],
  });
  assert.equal(r.fallback, "FB");
  assert.equal(r.iaGenerated, true);
  assert.equal(r.mensagem, "Oi");
});

console.log("\n-- helper send path + limit skip (no DB)");
check("static message resolve + limit blocks send decision", () => {
  const sends: Array<{ type: string; id: string; text: string }> = [];
  const staticCfg = resolveMessageFromPipelineConfig({
    mensagem: "Resposta fixa seed",
    iaGenerated: false,
    fallback_message: "FB",
  });
  assert.equal(staticCfg.mensagem, "Resposta fixa seed");
  assert.equal(staticCfg.iaGenerated, false);

  // Simulate runner decision: only send if limits allow
  const blocked = evaluateLimits(
    def({
      id: "blk",
      limites: { maxPorUsuario: 1, cooldownSegundos: 0, janelaMaxUsuarioSegundos: 86400 },
    }),
    { successCountInMaxWindow: 1 },
  );
  assert.equal(blocked.allow, false);
  if (blocked.allow) {
    sends.push({ type: "dm", id: "x", text: staticCfg.mensagem! });
  }
  assert.equal(sends.length, 0);

  assert.equal(typeof isIgSendEnabled(), "boolean");
  assert.equal(typeof computeSendRealForMode("hybrid"), "boolean");
});

console.log(`\n=== ${passed} checks passed ===`);
if (process.exitCode) process.exit(process.exitCode);

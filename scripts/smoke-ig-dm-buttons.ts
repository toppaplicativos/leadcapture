/**
 * Tests for Instagram DM buttons (Quick Replies + Button Template).
 * Drives shipped payload builders + runner path with Meta boundary mocked.
 *
 * Run: npx --yes tsx scripts/smoke-ig-dm-buttons.ts
 */

import assert from "node:assert/strict";
import {
  buildQuickReplies,
  buildTemplateButtons,
  buildInteractiveMessage,
  buildMessageFromPipelineSteps,
  extractButtonsFromMensagemSteps,
  truncateTitle,
} from "../src/services/instagramMessagingPayloads";
import type { AutomationDefinition } from "../src/services/automationDefinitions";
import { automationDefinitionsService } from "../src/services/automationDefinitions";
import { runAutomationDefinition } from "../src/services/automationDefinitionRunner";

let passed = 0;
function ok(name: string) {
  console.log(`  OK  ${name}`);
  passed += 1;
}

console.log("=== smoke-ig-dm-buttons ===\n");

// --- pure payload builders (shipped) ---
console.log("-- Meta payload builders");
{
  const titles = buildQuickReplies([
    { label: "Ver catálogo de produtos", payload: "NAV_CATALOG" },
    { label: "Preços", payload: "NAV_PRICES" },
    { label: "Falar com humano" },
  ]);
  assert.equal(titles.length, 3);
  assert.equal(titles[0].title.length <= 20, true);
  assert.equal(titles[0].title, "Ver catálogo de prod"); // truncated
  assert.equal(titles[0].payload, "NAV_CATALOG");
  assert.equal(titles[0].content_type, "text");
  assert.equal(titles[2].payload, "FALAR_COM_HUMANO"); // slug from label
  ok("quick_replies: max title 20 + payload");

  const btns = buildTemplateButtons([
    { label: "Site", url: "https://loja.example.com" },
    { label: "Pedido", payload: "NAV_ORDER" },
    { label: "Extra 4", payload: "X" },
    { label: "Extra 5", payload: "Y" },
  ]);
  assert.equal(btns.length, 3); // max 3
  assert.equal(btns[0].type, "web_url");
  if (btns[0].type === "web_url") assert.equal(btns[0].url, "https://loja.example.com");
  assert.equal(btns[1].type, "postback");
  ok("button_template: web_url + postback, max 3");

  const qr = buildInteractiveMessage("Como posso ajudar?", [
    { label: "Catálogo", payload: "NAV_CATALOG" },
    { label: "Suporte", payload: "NAV_SUPPORT" },
  ]);
  assert.equal(qr.kind, "quick_replies");
  if (qr.kind === "quick_replies") {
    assert.equal(qr.message.quick_replies.length, 2);
    assert.ok(qr.message.text.includes("ajudar"));
  }
  ok("interactive → quick_replies when no URLs");

  const tmpl = buildInteractiveMessage("Escolha", [
    { label: "Abrir site", url: "https://example.com" },
    { label: "Continuar", payload: "CONTINUE" },
  ]);
  assert.equal(tmpl.kind, "button_template");
  ok("interactive → button_template when URL present");

  assert.equal(truncateTitle("abc", 20), "abc");
}

console.log("\n-- pipeline steps → API message");
{
  const steps = [
    { tipo: "texto", caption: "Bem-vindo! O que você quer?" },
    {
      tipo: "botoes",
      caption: "Navegação",
      buttons: [
        { id: "1", label: "Catálogo", payload: "NAV_CATALOG" },
        { id: "2", label: "Preços", payload: "NAV_PRICES" },
        { id: "3", label: "WhatsApp", payload: "NAV_WA" },
      ],
    },
  ];
  const ext = extractButtonsFromMensagemSteps(steps);
  assert.equal(ext.buttons.length, 3);
  assert.equal(ext.mode, "quick_replies");
  const built = buildMessageFromPipelineSteps(steps);
  assert.equal(built.kind, "quick_replies");
  if (built.kind === "quick_replies") {
    assert.equal(built.message.quick_replies.length, 3);
    assert.ok(built.message.text.includes("Bem-vindo"));
  }
  ok("mensagemSteps botoes → quick_replies payload");

  const ctaSteps = [
    { tipo: "texto", caption: "Confira nosso site" },
    { tipo: "cta", ctaLabel: "Abrir loja", url: "https://loja.example.com/x" },
  ];
  const ctaBuilt = buildMessageFromPipelineSteps(ctaSteps);
  assert.equal(ctaBuilt.kind, "button_template");
  if (ctaBuilt.kind === "button_template") {
    assert.equal(ctaBuilt.message.attachment.payload.buttons[0].type, "web_url");
  }
  ok("cta block → button_template web_url");
}

async function runRunnerTests() {
  console.log("\n-- runner with mocked Meta send");
  (automationDefinitionsService as any).startRun = async () => "run-btn-1";
  (automationDefinitionsService as any).finishRun = async () => undefined;
  (automationDefinitionsService as any).getActorRunStats = async () => ({
    lastSuccessAt: null,
    successCountInMaxWindow: 0,
    successCountLastHour: 0,
    successCountLastDay: 0,
  });

  const sent: any[] = [];
  const def: AutomationDefinition = {
    id: "def-btn",
    brand_id: "brand-1",
    user_id: "user-1",
    nome: "Menu navegação IG",
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
          iaGenerated: false,
          mensagem: "Menu",
          mensagemSteps: [
            { tipo: "texto", caption: "Escolha uma opção:" },
            {
              tipo: "botoes",
              buttons: [
                { id: "a", label: "Catálogo", payload: "NAV_CATALOG" },
                { id: "b", label: "Preços", payload: "NAV_PRICES" },
              ],
            },
          ],
        },
      },
    ],
    limites: {
      maxPorUsuario: 0,
      cooldownSegundos: 0,
      maxPorHora: 0,
      maxPorDia: 0,
    },
    metrics: { runs: 0, sucessos: 0, falhas: 0 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await runAutomationDefinition(def, {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: true,
    eventPayload: {
      evento: "resposta_padrao_dm",
      sender_id: "igsid-test-1",
      text: "oi",
    },
    sendDmPipelineFn: async (brandId, recipientId, steps, fallback) => {
      const built = buildMessageFromPipelineSteps(steps as any, fallback);
      sent.push({ brandId, recipientId, built });
      return { ok: true, messageId: "mid-btn-1", kind: built.kind };
    },
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipientId, "igsid-test-1");
  assert.equal(sent[0].built.kind, "quick_replies");
  assert.equal(sent[0].built.message.quick_replies.length, 2);
  assert.equal(sent[0].built.message.quick_replies[0].payload, "NAV_CATALOG");
  ok("runner enviar_dm_ig uses pipeline interactive send");

  const plainSent: string[] = [];
  const plainDef: AutomationDefinition = {
    ...def,
    id: "def-plain",
    pipeline: [
      {
        ordem: 1,
        tipo: "enviar_dm_ig",
        config: {
          iaGenerated: false,
          mensagem: "Só texto",
          mensagemSteps: [{ tipo: "texto", caption: "Só texto" }],
        },
      },
    ],
  };
  const r2 = await runAutomationDefinition(plainDef, {
    triggeredBy: "event",
    forceSendReal: true,
    skipLimitCheck: true,
    eventPayload: { evento: "resposta_padrao_dm", sender_id: "igsid-2", text: "x" },
    sendDmFn: async (_b, to, text) => {
      plainSent.push(`${to}:${text}`);
      return { ok: true, messageId: "m2" };
    },
  });
  assert.equal(r2.ok, true);
  assert.equal(plainSent[0], "igsid-2:Só texto");
  ok("plain text DM still uses sendDm");
}

runRunnerTests()
  .then(() => {
    console.log(`\n=== ${passed} checks passed ===`);
  })
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  });

/* Smoke test for cognitive agent — run on VPS via `node scripts/smoke-cognitive.js` */
require("dotenv").config();
const { cognitiveAgent, conversationMemoryService } = require("../dist/services/cognitive");

const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";

(async () => {
  console.log("========== SCENARIO A: cold buyer matching brand catalog ==========");
  const a = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-A-" + Date.now(),
    incomingMessage: "oi quanto custa o alho descascado de 1kg?",
    conversationHistory: [],
    lastOutgoingMessages: [],
  });
  console.log("RESPOSTA:", a.text);
  console.log("  stage=" + a.reasoning.funnel_stage, "| emo=" + a.reasoning.emotional_state, "| conf=" + a.reasoning.confidence);
  console.log("  strat:", a.reasoning.response_strategy);
  console.log("  products:", a.reasoning.mentioned_products);
  console.log("  latency:", a.latencyMs);

  console.log("\n========== SCENARIO B: post-bot frustration ==========");
  const b = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-B-" + Date.now(),
    incomingMessage: "To tentando comprar faz uma semana e ngm responde direito. Vcs entregam aqui em Joao Pessoa ou nao?",
    conversationHistory: [
      "Lead: bom dia, queria saber sobre o alho",
      "Atendente: Olá! Digite 1 para vendas, 2 para suporte.",
      "Lead: 1",
      "Atendente: Aguarde um momento, transferindo...",
      "Lead: Olá?",
      "Atendente: Esta mensagem é automática. Nosso horário é seg-sex 9h-18h.",
      "Lead: vcs tem alho pronto pra entrega rapida?",
    ],
    lastOutgoingMessages: ["Esta mensagem é automática. Nosso horário é seg-sex 9h-18h."],
  });
  console.log("RESPOSTA:", b.text);
  console.log("  stage=" + b.reasoning.funnel_stage, "| emo=" + b.reasoning.emotional_state);
  console.log("  bot_detected:", b.reasoning.bot_interaction_detected);
  console.log("  frustration:", b.reasoning.frustration_signals);
  console.log("  must_acknowledge:", b.reasoning.must_acknowledge);
  console.log("  strat:", b.reasoning.response_strategy);
  console.log("  latency:", b.latencyMs);

  console.log("\n========== SCENARIO C: price objection ==========");
  const c = await cognitiveAgent.respond({
    userId, brandId,
    conversationId: "smoke-C-" + Date.now(),
    incomingMessage: "caro pra ser sincero, na quitanda aqui pego mais barato",
    conversationHistory: [
      "Lead: quanto é a pasta de alho chimichurri 500g?",
      "Atendente: A Pasta de Alho Saborizada Chimichurri 500g está R$ 4,00.",
      "Lead: hmm",
    ],
    lastOutgoingMessages: ["A Pasta de Alho Saborizada Chimichurri 500g está R$ 4,00."],
  });
  console.log("RESPOSTA:", c.text);
  console.log("  stage=" + c.reasoning.funnel_stage, "| emo=" + c.reasoning.emotional_state);
  console.log("  objections:", c.reasoning.objections_detected);
  console.log("  strat:", c.reasoning.response_strategy);
  console.log("  latency:", c.latencyMs);

  console.log("\n========== MEMORY persistence check (scenario B) ==========");
  await new Promise(r => setTimeout(r, 2000)); /* allow async save to flush */
  const mem = await conversationMemoryService.load(b.memory.conversation_id);
  console.log("  conversation_id:", mem.conversation_id);
  console.log("  turn_count:", mem.turn_count);
  console.log("  funnel_stage:", mem.funnel_stage);
  console.log("  last_emotional_state:", mem.last_emotional_state);
  console.log("  frustration_score:", mem.frustration_score, "/ bot_score:", mem.bot_interaction_score);
  console.log("  facts_learned:", mem.facts_learned);
  process.exit(0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});

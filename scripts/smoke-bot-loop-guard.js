/**
 * Smoke tests for BotLoopGuard (no DB / no network).
 * Run: node scripts/smoke-bot-loop-guard.js
 * Requires: dist/services/botLoopGuard.js (npm run build) OR ts-node.
 */
const path = require("path");
const fs = require("fs");

function loadModule() {
  const dist = path.join(__dirname, "..", "dist", "services", "botLoopGuard.js");
  if (fs.existsSync(dist)) return require(dist);
  // Fallback: try ts-node style not available — fail clearly
  throw new Error("Build first: npm run build (need dist/services/botLoopGuard.js)");
}

const { evaluateBotLoopRisk, detectBotPhrases } = loadModule();

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  OK  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("========== BotLoopGuard smoke ==========\n");

// A) Classic IVR menu → block
{
  const d = evaluateBotLoopRisk({
    channel: "instagram",
    inboundText:
      "Olá! Obrigado por entrar em contato.\nDigite 1 para vendas\nDigite 2 para suporte\nDigite 3 para falar com atendente",
    historyLines: [],
    lastOutgoing: [],
  });
  assert("IVR menu blocks", d.block === true, `risk=${d.risk} signals=${(d.signals || []).join(",")}`);
  assert("IVR has reason", d.block && typeof d.reason === "string");
}

// B) Human "digite seu CEP" alone → allow
{
  const d = evaluateBotLoopRisk({
    channel: "whatsapp",
    inboundText: "pode digite seu CEP por favor que eu vejo o frete",
    historyLines: ["Lead: quanto fica a entrega?"],
    lastOutgoing: ["Me passa seu CEP que calculo o frete."],
  });
  assert("Human digite CEP allows", d.block === false, `risk=${d.risk} reason=${d.reason || "-"}`);
}

// C) Active lock → block
{
  const d = evaluateBotLoopRisk({
    channel: "instagram",
    inboundText: "oi",
    lockedUntilMs: Date.now() + 60_000,
  });
  assert("Active lock blocks", d.block === true && d.reason === "bot_lock_active");
}

// D) Self-echo of our last reply → block
{
  const ours = "Olá! Como posso ajudar você hoje com nossos produtos?";
  const d = evaluateBotLoopRisk({
    channel: "whatsapp",
    inboundText: "Olá! Como posso ajudar você hoje com nossos produtos?",
    lastOutgoing: [ours],
    historyLines: [
      "Lead: oi",
      `Atendente: ${ours}`,
    ],
  });
  assert("Self-echo blocks", d.block === true, `risk=${d.risk} signals=${(d.signals || []).join(",")}`);
}

// E) Score threshold + weak signal → block
{
  const d = evaluateBotLoopRisk({
    channel: "instagram",
    inboundText: "Aguarde um momento, transferindo para o setor responsável.",
    botInteractionScore: 2,
    lastOutgoing: ["Qual produto te interessa?"],
  });
  assert("Score+template blocks", d.block === true, `risk=${d.risk}`);
}

// F) Normal human buyer → allow
{
  const d = evaluateBotLoopRisk({
    channel: "whatsapp",
    inboundText: "quero 2kg de alho descascado pra amanha se der",
    historyLines: [
      "Lead: oi, vcs entregam em JP?",
      "Atendente: Entregamos sim! Qual bairro?",
    ],
    lastOutgoing: ["Entregamos sim! Qual bairro?"],
    botInteractionScore: 0,
  });
  assert("Normal buyer allows", d.block === false, `risk=${d.risk}`);
}

// G) detectBotPhrases utility
{
  const hits = detectBotPhrases("Esta mensagem é automática. Nosso horário de atendimento é 9h-18h.");
  assert("detectBotPhrases finds auto msg", hits.length >= 1, `hits=${hits.join(",")}`);
}

console.log(`\n========== ${passed} passed, ${failed} failed ==========`);
process.exit(failed ? 1 : 0);

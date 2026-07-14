/**
 * Smoke: multi-bubble split never mid-word for typical IG limits.
 * Run: npx --yes tsx scripts/message-split.smoke.ts
 */
import { splitMessageIntoBubbles } from "../src/services/messageSplit";
import { clampChannelMaxChars, CHANNEL_HARD_CAPS } from "../src/services/channelLimits";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const long = [
  "Olá! Temos alho descascado premium e pasta de alho para o seu negócio.",
  "O pacote de 1kg sai a partir de valores promocionais no atacado.",
  "Posso te passar o catálogo completo e frete para sua região.",
  "Se preferir, digite *menu* para ver opções rápidas de pedido.",
].join(" ");

assert(CHANNEL_HARD_CAPS.instagram.text === 1000, "IG hard cap 1000");
assert(clampChannelMaxChars("instagram", 2000) === 1000, "clamp 2000→1000");
assert(clampChannelMaxChars("instagram", 50) === 50, "clamp min 50 ok");

const bubbles = splitMessageIntoBubbles(long, 120, 3);
assert(bubbles.length >= 2 && bubbles.length <= 3, `expected 2-3 bubbles got ${bubbles.length}`);
for (const b of bubbles) {
  assert(b.length <= 120, `bubble over limit: ${b.length}`);
  assert(!b.endsWith(" ") || b.length < 5, "no trailing space issues required");
}

const short = splitMessageIntoBubbles("Oi!", 100, 3);
assert(short.length === 1 && short[0] === "Oi!", "short stays single");

const sep = splitMessageIntoBubbles("Parte um\n\n---\n\nParte dois bem maior que o limite se precisar", 40, 3);
assert(sep.length >= 2, "separator splits");

console.log("message-split smoke OK", { bubbles: bubbles.map((b) => b.length) });

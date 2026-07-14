/**
 * Verifies both DM paths for every brand pattern:
 *  1) dm_keyword when text matches keywords
 *  2) resposta_padrao_dm when no keyword matches
 *
 * npx --yes tsx scripts/smoke-ig-dm-dual-path.ts
 */
import assert from "node:assert/strict";
import {
  selectWinnersBySurface,
  keywordMatches,
  type MatchableDefinition,
} from "../src/services/automationMatchLogic";
import { applyBrandPlaceholders } from "../src/services/instagramReplyHelpers";

function def(partial: Partial<MatchableDefinition> & { id: string }): MatchableDefinition {
  return {
    ativa: true,
    priority: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    trigger: { tipo: "evento", plataforma: "instagram", evento: "dm_keyword", palavrasChave: [] },
    pipeline: [{ ordem: 1, tipo: "enviar_dm_ig", config: {} }],
    ...partial,
  };
}

let n = 0;
function ok(msg: string) {
  console.log("  OK ", msg);
  n += 1;
}

console.log("=== smoke-ig-dm-dual-path ===\n");

const keywordDef = def({
  id: "kw",
  priority: 20,
  trigger: {
    tipo: "evento",
    plataforma: "instagram",
    evento: "dm_keyword",
    palavrasChave: ["preço", "preco", "valor", "catalogo"],
  },
});

const defaultDef = def({
  id: "default",
  priority: 50,
  trigger: {
    tipo: "evento",
    plataforma: "instagram",
    evento: "resposta_padrao_dm",
    palavrasChave: [],
  },
});

// Simulate intake: pick event type like orchestrator
function resolvePath(text: string) {
  const kwPool = [keywordDef];
  const winners = selectWinnersBySurface(kwPool, text);
  if (winners.length > 0) return { path: "keyword" as const, winners };
  // no keyword → default event pool
  const defWinners = selectWinnersBySurface([defaultDef], text);
  return { path: "default" as const, winners: defWinners };
}

const r1 = resolvePath("quanto custa o preço?");
assert.equal(r1.path, "keyword");
assert.equal(r1.winners[0].id, "kw");
ok("com keyword → path dm_keyword");

const r2 = resolvePath("olá, bom dia, tudo bem?");
assert.equal(r2.path, "default");
assert.equal(r2.winners[0].id, "default");
ok("sem keyword → path resposta_padrao_dm");

const r3 = resolvePath("NAV_CATALOG");
// keyword def does not list NAV_ — falls to default in this unit pool
assert.equal(r3.path, "default");
ok("payload sem keyword no pool → default (nav seeds would catch in real pack)");

assert.equal(keywordMatches("preco especial", ["preço", "valor"]), true);
assert.equal(keywordMatches("mensagem livre xyz", ["preço", "valor"]), false);
assert.equal(keywordMatches("qualquer coisa", []), true); // empty keywords = match all (default)
ok("keyword matcher: empty list matches all (default behavior)");

const branded = applyBrandPlaceholders("Oi da {brand}! Digite menu.", {
  brand_name: "Alho Pronto",
});
assert.equal(branded.includes("Alho Pronto"), true);
assert.equal(branded.includes("{brand}"), false);
ok("template {brand} filled per brand");

// Same structure for two brands — only content differs
const brandA = applyBrandPlaceholders("Bem-vindo à {marca}", { brand_name: "Loja A" });
const brandB = applyBrandPlaceholders("Bem-vindo à {marca}", { brand_name: "Loja B" });
assert.equal(brandA, "Bem-vindo à Loja A");
assert.equal(brandB, "Bem-vindo à Loja B");
ok("mesmo padrão de template, conteúdo por brand");

console.log(`\n=== ${n} checks passed ===`);

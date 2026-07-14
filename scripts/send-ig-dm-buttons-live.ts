/**
 * Live / dry-run send of Instagram DM with Quick Replies (navigation menu).
 *
 * Usage:
 *   npx --yes tsx scripts/send-ig-dm-buttons-live.ts --dry-run
 *   npx --yes tsx scripts/send-ig-dm-buttons-live.ts --brand=<uuid> --recipient=<IGSID>
 *   npx --yes tsx scripts/send-ig-dm-buttons-live.ts --brand=<uuid> --last-conversation
 *   npx --yes tsx scripts/send-ig-dm-buttons-live.ts --brand=<uuid> --seed-only
 *
 * --dry-run: only print payload (no Graph call)
 * --seed-only: install nav seeds for brand, no send
 * --last-conversation: pick most recent incoming sender from instagram_messages
 */

import { query, queryOne } from "../src/config/database";
import { instagramService } from "../src/services/instagram";
import { seedInstagramReplyDefinitions } from "../src/services/automationDefinitionSeeds";
import {
  buildInteractiveMessage,
  buildMessageFromPipelineSteps,
} from "../src/services/instagramMessagingPayloads";
import { setBrandDispatchMode } from "../src/services/automationDispatchMode";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function resolveBrandId(): Promise<{ brandId: string; userId: string; username?: string }> {
  const brandArg = arg("brand");
  if (brandArg) {
    const conn = await queryOne<any>(
      `SELECT brand_id, user_id, username FROM instagram_connections WHERE brand_id = ? AND is_active = TRUE LIMIT 1`,
      [brandArg],
    );
    if (!conn) throw new Error(`Nenhuma conexão IG ativa para brand ${brandArg}`);
    return { brandId: conn.brand_id, userId: conn.user_id, username: conn.username };
  }

  const conn = await queryOne<any>(
    `SELECT brand_id, user_id, username FROM instagram_connections
     WHERE is_active = TRUE AND access_token IS NOT NULL AND access_token <> ''
     ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
  );
  if (!conn) throw new Error("Nenhuma conexão Instagram ativa no banco");
  return { brandId: conn.brand_id, userId: conn.user_id, username: conn.username };
}

async function resolveRecipient(brandId: string): Promise<string> {
  const explicit = arg("recipient");
  if (explicit) return explicit;

  const row = await queryOne<any>(
    `SELECT sender_id FROM instagram_messages
     WHERE brand_id = ? AND direction = 'incoming' AND sender_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [brandId],
  );
  if (row?.sender_id) return String(row.sender_id);

  // Fallback: Graph /me/conversations
  try {
    const result = await instagramService.getConversations(brandId);
    const withPeer = (result.conversations || []).find((c) => c.sender_id);
    if (withPeer?.sender_id) return String(withPeer.sender_id);
  } catch (e: any) {
    console.warn("getConversations:", e?.message || e);
  }

  throw new Error(
    "Informe --recipient=<IGSID> (IGSID do usuário que falou com a conta nas últimas 24h)",
  );
}

async function main() {
  const dry = flag("dry-run");
  const seedOnly = flag("seed-only");
  const setHybrid = flag("set-hybrid");

  console.log("=== send-ig-dm-buttons-live ===");
  console.log("dry-run:", dry, "seed-only:", seedOnly);

  const { brandId, userId, username } = await resolveBrandId();
  console.log("brand:", brandId, "ig:", username || "—", "user:", userId);

  // Always ensure nav seeds exist
  const seedResult = await seedInstagramReplyDefinitions(brandId, userId, { mode: "fill-missing" });
  console.log("seeds:", JSON.stringify(seedResult));

  if (setHybrid) {
    const modeRes = await setBrandDispatchMode(brandId, "hybrid");
    console.log("dispatch mode hybrid:", modeRes);
  }

  if (seedOnly) {
    console.log("Seed-only done. Ative as automações ig.dm.nav_* no hub Automações.");
    process.exit(0);
  }

  const menuSteps = [
    { tipo: "texto", caption: "Olá! 👋 Como posso ajudar? (teste de botões LeadCapture)" },
    {
      tipo: "botoes",
      caption: "Escolha:",
      buttons: [
        { id: "1", label: "Catálogo", payload: "NAV_CATALOG" },
        { id: "2", label: "Preços", payload: "NAV_PRICES" },
        { id: "3", label: "Falar conosco", payload: "NAV_HUMAN" },
      ],
    },
  ];

  const built = buildMessageFromPipelineSteps(menuSteps);
  console.log("\nPayload Meta a enviar:");
  console.log(JSON.stringify(built, null, 2));

  // Also show pure quick_replies builder
  const alt = buildInteractiveMessage("Menu rápido", [
    { label: "Catálogo", payload: "NAV_CATALOG" },
    { label: "Preços", payload: "NAV_PRICES" },
  ]);
  console.log("\nAlternativa (só 2 botões):", JSON.stringify(alt, null, 2));

  if (dry) {
    console.log("\n[dry-run] Nenhum envio à Graph API.");
    process.exit(0);
  }

  const recipientId = await resolveRecipient(brandId);
  console.log("\nrecipient IGSID:", recipientId);

  const result = await instagramService.sendDmBuilt(brandId, recipientId, built);
  console.log("\nGraph result:", JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error("\nFalha no envio. Verifique: token, janela 24h, permissão instagram_manage_messages.");
    process.exit(1);
  }

  console.log("\nOK — message_id:", result.messageId, "kind:", result.kind);
  console.log("Peça ao usuário tocar um botão; o webhook deve disparar dm_keyword com NAV_*.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e?.message || e);
  process.exit(1);
});

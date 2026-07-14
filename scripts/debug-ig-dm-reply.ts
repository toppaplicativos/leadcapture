/**
 * Diagnose why default DM reply is not firing.
 * npx --yes tsx scripts/debug-ig-dm-reply.ts
 */
import { query, queryOne } from "../src/config/database";
import { getBrandDispatchMode, computeSendRealForMode } from "../src/services/automationDispatchMode";
import { automationDefinitionsService } from "../src/services/automationDefinitions";
import { keywordMatches } from "../src/services/automationMatchLogic";

async function main() {
  const brand =
    process.argv.find((a) => a.startsWith("--brand="))?.split("=")[1] ||
    (
      await queryOne<any>(
        `SELECT brand_id FROM instagram_connections WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      )
    )?.brand_id;

  if (!brand) throw new Error("no brand");

  console.log("brand", brand);

  const conn = await queryOne<any>(
    `SELECT id, username, ig_user_id, account_id, user_id,
            left(access_token, 12) as token_prefix,
            length(access_token) as token_len, is_active
     FROM instagram_connections WHERE brand_id = ? LIMIT 1`,
    [brand],
  );
  console.log("connection", conn);

  const mode = await getBrandDispatchMode(brand);
  console.log("dispatch_mode", mode, "sendReal", computeSendRealForMode(mode));

  const ai = await queryOne<any>(
    `SELECT auto_reply_dm, auto_reply_comments FROM instagram_ai_settings WHERE brand_id = ?`,
    [brand],
  );
  console.log("ai_settings", ai);

  const defs = await query<any[]>(
    `SELECT seed_key, nome, ativa, status,
            trigger_json->>'evento' as evento,
            trigger_json->>'palavrasChave' as keywords,
            left(pipeline_json::text, 120) as pipeline_preview
     FROM automation_definitions
     WHERE brand_id = ? AND trigger_json->>'plataforma' = 'instagram'
     ORDER BY seed_key`,
    [brand],
  );
  console.log("\n=== definitions IG ===");
  for (const d of defs || []) {
    console.log(
      `  ${d.ativa ? "ON " : "off"} ${d.seed_key || d.nome} | ${d.evento} | status=${d.status} | kw=${d.keywords}`,
    );
  }

  const defaultDef = (defs || []).find(
    (d) => d.evento === "resposta_padrao_dm" || d.seed_key === "ig.dm.default_reply",
  );
  console.log("\ndefault_reply def:", defaultDef || "MISSING");

  const ba = await query<any[]>(
    `SELECT catalog_slug, status FROM brand_automations
     WHERE brand_id = ? AND catalog_slug LIKE 'ig-webhook%'`,
    [brand],
  );
  console.log("catalog webhooks", ba);

  const events = await query<any[]>(
    `SELECT event_type, field, triggered_by, dedup_key, processed_at
     FROM instagram_webhook_events
     WHERE brand_id = ?
     ORDER BY processed_at DESC LIMIT 10`,
    [brand],
  );
  console.log("\n=== last webhook events ===");
  console.log(JSON.stringify(events, null, 2));

  const msgs = await query<any[]>(
    `SELECT direction, sender_id, left(coalesce(message_text,''), 80) as text, created_at
     FROM instagram_messages WHERE brand_id = ?
     ORDER BY created_at DESC LIMIT 12`,
    [brand],
  );
  console.log("\n=== last messages ===");
  console.log(JSON.stringify(msgs, null, 2));

  // Simulate keyword short-circuit risk: would "oi" match nav_menu?
  const matches = await automationDefinitionsService.getEventMatches(brand, "instagram", "dm_keyword");
  console.log("\n=== active dm_keyword defs ===", matches.length);
  for (const m of matches) {
    const kws = (m.trigger as any).palavrasChave || [];
    const oi = keywordMatches("oi teste", kws);
    const random = keywordMatches("mensagem aleatoria sem keyword xyz", kws);
    console.log(`  ${m.nome} kws=${JSON.stringify(kws)} match("oi"):${oi} match(random):${random}`);
  }

  const defaultMatches = await automationDefinitionsService.getEventMatches(
    brand,
    "instagram",
    "resposta_padrao_dm",
  );
  console.log("\n=== active resposta_padrao_dm defs ===", defaultMatches.length);
  for (const m of defaultMatches) {
    console.log(`  ${m.nome} ativa=${m.ativa} id=${m.id}`);
  }

  // Check env
  console.log("\nAUTOMATIONS_V2_DISPATCH", process.env.AUTOMATIONS_V2_DISPATCH || "(default catalog)");
  console.log("AUTOMATIONS_V2_IG_SEND", process.env.AUTOMATIONS_V2_IG_SEND || "(default true)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

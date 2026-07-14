/**
 * Force-refresh keyword + default DM templates for a brand (keeps ativa as-is unless --activate).
 * npx --yes tsx scripts/sync-ig-dm-templates.ts --brand=... --activate
 */
import { query, queryOne, update } from "../src/config/database";
import { getInstagramReplySeedPack } from "../src/services/automationDefinitionSeeds";
import { setBrandDispatchMode } from "../src/services/automationDispatchMode";
import { instagramService } from "../src/services/instagram";

const brandArg = process.argv.find((a) => a.startsWith("--brand="))?.split("=")[1];
const activate = process.argv.includes("--activate");

async function main() {
  let brandId = brandArg;
  let userId = "system";
  if (!brandId) {
    const c = await queryOne<any>(
      `SELECT brand_id, user_id FROM instagram_connections WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    );
    brandId = c?.brand_id;
    userId = c?.user_id || userId;
  }
  if (!brandId) throw new Error("no brand");

  const pack = getInstagramReplySeedPack();
  const keys = ["ig.dm.keyword", "ig.dm.default_reply"];
  for (const key of keys) {
    const seed = pack.find((p) => p.seed_key === key)!;
    const existing = await queryOne<any>(
      `SELECT id, ativa, user_modified_at FROM automation_definitions WHERE brand_id = ? AND seed_key = ?`,
      [brandId, key],
    );
    if (!existing) {
      console.log("missing seed", key, "— run seed install first");
      continue;
    }
    // Refresh pipeline/trigger even if modified (user asked for standard pattern)
    await update(
      `UPDATE automation_definitions
       SET nome = ?, descricao = ?, trigger_json = ?::jsonb, pipeline_json = ?::jsonb,
           limites_json = ?::jsonb, priority = ?, system_version = 2,
           ativa = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        seed.nome,
        seed.descricao,
        JSON.stringify(seed.trigger),
        JSON.stringify(seed.pipeline),
        JSON.stringify(seed.limites),
        seed.priority,
        activate ? true : Boolean(existing.ativa),
        activate || existing.ativa ? "live" : "rascunho",
        existing.id,
      ],
    );
    console.log("updated", key, "ativa=", activate || existing.ativa);
  }

  await setBrandDispatchMode(brandId, "hybrid");
  try {
    const profile = await instagramService.getProfile(brandId);
    await instagramService.saveAiSettings(brandId, {
      auto_reply_dm: true,
      auto_reply_comments: true,
      brand_name: profile?.name || profile?.username || "Loja",
      persona: profile?.biography || "",
      tone: "caloroso e direto",
      max_chars: 500,
      guidelines: "Responda de forma breve, útil e no tom da marca. Se não souber, peça mais detalhes.",
      faq: [],
      rules: [],
      notify_whatsapp: false,
      notify_phone: "",
    });
    console.log("brand AI context refreshed");
  } catch (e: any) {
    console.warn("ai settings", e.message);
  }

  const rows = await query(
    `SELECT seed_key, ativa, status, trigger_json->>'evento' as evento
     FROM automation_definitions WHERE brand_id = ? AND seed_key IN ('ig.dm.keyword','ig.dm.default_reply')`,
    [brandId],
  );
  console.log(JSON.stringify({ brandId, hybrid: true, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

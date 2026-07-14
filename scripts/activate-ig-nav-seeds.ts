/**
 * Activate IG navigation button automations for a brand.
 * Usage: npx --yes tsx scripts/activate-ig-nav-seeds.ts --brand=<uuid>
 */
import { query, update } from "../src/config/database";
import { seedInstagramReplyDefinitions } from "../src/services/automationDefinitionSeeds";
import { setBrandDispatchMode } from "../src/services/automationDispatchMode";

const brandArg = process.argv.find((a) => a.startsWith("--brand="))?.split("=")[1];
const KEYS = ["ig.dm.nav_menu", "ig.dm.nav_catalog", "ig.dm.nav_prices", "ig.dm.nav_human"];

async function main() {
  let brandId = brandArg;
  let userId = "system";

  if (!brandId) {
    const conn = await query<any[]>(
      `SELECT brand_id, user_id FROM instagram_connections
       WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    );
    brandId = conn?.[0]?.brand_id;
    userId = conn?.[0]?.user_id || userId;
  } else {
    const conn = await query<any[]>(
      `SELECT user_id FROM instagram_connections WHERE brand_id = ? LIMIT 1`,
      [brandId],
    );
    userId = conn?.[0]?.user_id || userId;
  }

  if (!brandId) throw new Error("brand not found");

  await seedInstagramReplyDefinitions(brandId, userId, { mode: "fill-missing" });
  await setBrandDispatchMode(brandId, "hybrid");

  for (const k of KEYS) {
    await update(
      `UPDATE automation_definitions
       SET ativa = TRUE, status = 'live', updated_at = NOW()
       WHERE brand_id = ? AND seed_key = ?`,
      [brandId, k],
    );
  }

  const rows = await query<any[]>(
    `SELECT seed_key, ativa, status, nome FROM automation_definitions
     WHERE brand_id = ? AND seed_key LIKE 'ig.dm.nav%' ORDER BY seed_key`,
    [brandId],
  );
  console.log(JSON.stringify({ brandId, hybrid: true, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

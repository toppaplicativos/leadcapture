/**
 * Dry-run / write migration: catalog ig-webhook-* → automation_definitions seeds.
 *
 * Usage:
 *   npx tsx scripts/migrate-ig-webhook-to-definitions.ts --brand=<id> --dry-run
 *   npx tsx scripts/migrate-ig-webhook-to-definitions.ts --brand=<id> --write
 *
 * Does NOT set hybrid mode unless --set-mode=hybrid and send real is enabled.
 */

import { query, queryOne, insert, update } from "../src/config/database";
import { v4 as uuidv4 } from "uuid";
import {
  getInstagramReplySeedPack,
  seedInstagramReplyDefinitions,
} from "../src/services/automationDefinitionSeeds";
import { setBrandDispatchMode, isIgSendEnabled } from "../src/services/automationDispatchMode";
import { automationDefinitionsService } from "../src/services/automationDefinitions";

const WEBHOOK_SLUGS = [
  "ig-webhook-dm-reply",
  "ig-webhook-comment-keyword",
  "ig-webhook-mention-thanks",
] as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const brand = args.find((a) => a.startsWith("--brand="))?.split("=")[1];
  const dryRun = args.includes("--dry-run") || !args.includes("--write");
  const setMode = args.find((a) => a.startsWith("--set-mode="))?.split("=")[1] as
    | "hybrid"
    | "definitions"
    | undefined;
  const userId = args.find((a) => a.startsWith("--user="))?.split("=")[1];
  return { brand, dryRun, setMode, userId };
}

function mapSlugToSeedKey(slug: string, config: Record<string, any>): string | null {
  if (slug === "ig-webhook-dm-reply") return "ig.dm.default_reply";
  if (slug === "ig-webhook-mention-thanks") return "ig.mention.thanks";
  if (slug === "ig-webhook-comment-keyword") {
    return String(config.reply_mode || "dm") === "comment"
      ? "ig.comment.keyword_public"
      : "ig.comment.keyword_dm";
  }
  return null;
}

async function main() {
  const { brand, dryRun, setMode, userId } = parseArgs();
  if (!brand) {
    console.error("Usage: --brand=<brandId> [--dry-run|--write] [--set-mode=hybrid] [--user=<userId>]");
    process.exit(1);
  }

  await automationDefinitionsService.ensureSchema();

  const rows = (await query<any[]>(
    `SELECT ba.*, ac.task_type FROM brand_automations ba
     LEFT JOIN automation_catalog ac ON ac.slug = ba.catalog_slug
     WHERE ba.brand_id = ? AND ba.catalog_slug IN (?, ?, ?)`,
    [brand, ...WEBHOOK_SLUGS],
  )) as any[];

  // AI settings for ativa formula
  const ai = await queryOne<any>(
    `SELECT auto_reply_dm, auto_reply_comments FROM instagram_ai_settings WHERE brand_id = ? LIMIT 1`,
    [brand],
  );

  const pack = getInstagramReplySeedPack();
  const plan: Array<Record<string, any>> = [];

  for (const row of rows || []) {
    let config: any = row.config;
    if (typeof config === "string") {
      try {
        config = JSON.parse(config);
      } catch {
        config = {};
      }
    }
    config = config || {};
    const seedKey = mapSlugToSeedKey(row.catalog_slug, config);
    if (!seedKey) continue;

    const template = pack.find((p) => p.seed_key === seedKey);
    let effectiveAuto = true;
    if (row.catalog_slug === "ig-webhook-dm-reply") {
      effectiveAuto = Boolean(ai?.auto_reply_dm);
    } else if (row.catalog_slug === "ig-webhook-comment-keyword") {
      effectiveAuto = Boolean(ai?.auto_reply_comments);
    }
    // mention: no AI gate
    const baActive = String(row.status) === "active";
    const ativa = baActive && effectiveAuto;

    plan.push({
      slug: row.catalog_slug,
      seed_key: seedKey,
      old_status: row.status,
      ativa,
      template_nome: template?.nome,
    });
  }

  console.log(JSON.stringify({ brand, dryRun, plan }, null, 2));

  if (dryRun) {
    console.log("Dry-run only. Pass --write to apply.");
    return;
  }

  const owner =
    userId ||
    (await queryOne<any>(`SELECT user_id FROM brand_automations WHERE brand_id = ? LIMIT 1`, [brand]))
      ?.user_id ||
    (await queryOne<any>(`SELECT user_id FROM instagram_connections WHERE brand_id = ? LIMIT 1`, [brand]))
      ?.user_id;

  if (!owner) {
    console.error("No user_id for brand");
    process.exit(1);
  }

  for (const item of plan) {
    const template = pack.find((p) => p.seed_key === item.seed_key)!;
    const existing = await queryOne<any>(
      `SELECT id, user_modified_at FROM automation_definitions WHERE brand_id = ? AND seed_key = ? LIMIT 1`,
      [brand, item.seed_key],
    );

    let defId = existing?.id as string | undefined;
    if (!existing) {
      defId = uuidv4();
      await insert(
        `INSERT INTO automation_definitions
         (id, brand_id, user_id, nome, descricao, ativa, status, trigger_json, pipeline_json, limites_json, metrics_json,
          seed_key, origin, priority, system_version, user_modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migrated_catalog', ?, 1, NULL)`,
        [
          defId,
          brand,
          owner,
          template.nome,
          template.descricao,
          item.ativa,
          item.ativa ? "live" : "rascunho",
          JSON.stringify(template.trigger),
          JSON.stringify(template.pipeline),
          JSON.stringify(template.limites),
          JSON.stringify({ runs: 0, sucessos: 0, falhas: 0 }),
          item.seed_key,
          template.priority,
        ],
      );
    } else if (!existing.user_modified_at) {
      await update(
        `UPDATE automation_definitions SET ativa = ?, status = ?, origin = 'migrated_catalog', updated_at = NOW()
         WHERE id = ?`,
        [item.ativa, item.ativa ? "live" : "pausado", existing.id],
      );
    }

    await insert(
      `INSERT INTO automation_migration_audit (id, brand_id, slug, old_ba_status, new_def_id, ativa, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        brand,
        item.slug,
        item.old_status,
        defId,
        item.ativa,
        JSON.stringify(item),
      ],
    ).catch(() => undefined);

    // Pause only webhook catalog slug
    await update(
      `UPDATE brand_automations SET status = 'paused', updated_at = NOW()
       WHERE brand_id = ? AND catalog_slug = ?`,
      [brand, item.slug],
    );
  }

  // Always fill-missing rest of pack (inactive)
  const fill = await seedInstagramReplyDefinitions(brand, owner, { mode: "fill-missing" });
  console.log("fill-missing", fill);

  if (setMode === "hybrid" || setMode === "definitions") {
    if (!isIgSendEnabled()) {
      console.error("Refusing --set-mode: AUTOMATIONS_V2_IG_SEND is false");
      process.exit(1);
    }
    const r = await setBrandDispatchMode(brand, setMode);
    console.log("set mode", r);
  }

  console.log("Migration write complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

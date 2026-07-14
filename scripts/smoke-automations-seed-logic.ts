/**
 * Drives SHIPPED seedInstagramReplyDefinitions against the real DB path.
 * Verifies: fill-missing install, ativa=false on inserts, list after seed,
 * second seed does not wipe user-modified content.
 *
 * Run: npx --yes tsx scripts/smoke-automations-seed-logic.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  seedInstagramReplyDefinitions,
  listInstagramSeedKeys,
  getInstagramReplySeedPack,
} from "../src/services/automationDefinitionSeeds";
import { automationDefinitionsService } from "../src/services/automationDefinitions";
import { query, update } from "../src/config/database";

async function main() {
  console.log("=== smoke-automations-seed-logic (shipped install path) ===\n");

  const brandId = randomUUID();
  const userId = randomUUID();
  const expectedKeys = listInstagramSeedKeys();
  console.log("brand fixture:", brandId);
  console.log("expected keys:", expectedKeys.join(", "));

  try {
    // --- 1) First install via shipped function ---
    const first = await seedInstagramReplyDefinitions(brandId, userId, {
      mode: "fill-missing",
    });
    console.log("first install result:", JSON.stringify(first));

    assert.ok(
      first.created.length >= expectedKeys.length,
      `expected all keys created on fresh brand, got created=${first.created.length}`,
    );
    for (const k of expectedKeys) {
      assert.ok(first.created.includes(k), `missing created seed_key ${k}`);
    }
    console.log("  OK  shipped seedInstagramReplyDefinitions created full pack");

    // --- 2) List via shipped service and assert ativa=false ---
    const listed = await automationDefinitionsService.list(brandId, userId, {
      platform: "instagram",
    });
    console.log(
      "list after install:",
      listed.map((a) => ({
        seed_key: a.seed_key,
        ativa: a.ativa,
        nome: a.nome,
        origin: a.origin,
      })),
    );

    const byKey = new Map(listed.filter((a) => a.seed_key).map((a) => [a.seed_key!, a]));
    for (const k of expectedKeys) {
      const row = byKey.get(k);
      assert.ok(row, `list missing seed_key ${k}`);
      assert.equal(row!.ativa, false, `fresh insert ${k} must be inactive (ativa=false)`);
      assert.equal(row!.origin, "seed");
    }
    assert.ok(
      byKey.has("ig.dm.default_reply") && byKey.has("ig.comment.keyword_dm"),
      "must include default DM + comment keyword DM surfaces",
    );
    console.log("  OK  list shows all IG seed keys with ativa=false");

    // --- 3) User customizes one definition (simulate PATCH content edit) ---
    const customKey = "ig.dm.default_reply";
    const custom = byKey.get(customKey)!;
    const customNome = `Custom DM reply ${Date.now()}`;
    await update(
      `UPDATE automation_definitions
       SET nome = ?, user_modified_at = NOW(), updated_at = NOW()
       WHERE id = ? AND brand_id = ?`,
      [customNome, custom.id, brandId],
    );
    console.log("  customized", customKey, "→", customNome);

    // --- 4) Second fill-missing + force: must NOT wipe customized ---
    const second = await seedInstagramReplyDefinitions(brandId, userId, {
      mode: "fill-missing",
      force: true,
    });
    console.log("second install (force) result:", JSON.stringify(second));

    assert.ok(
      second.skipped_customized.includes(customKey),
      `expected ${customKey} in skipped_customized, got ${JSON.stringify(second.skipped_customized)}`,
    );
    assert.ok(
      !second.updated.includes(customKey),
      "customized seed must not be in updated",
    );
    assert.ok(
      !second.created.includes(customKey),
      "customized seed must not be re-created",
    );

    const after = await automationDefinitionsService.list(brandId, userId);
    const still = after.find((a) => a.seed_key === customKey);
    assert.ok(still, "customized def still listed");
    assert.equal(still!.nome, customNome, "user-modified nome must survive re-seed");
    assert.ok(still!.user_modified_at, "user_modified_at must remain set");
    assert.equal(still!.ativa, false, "re-seed must not flip ativa");
    console.log("  OK  second seed via shipped install does not wipe user-modified content");

    // --- 5) Second fill-missing without force: all existing skipped ---
    const third = await seedInstagramReplyDefinitions(brandId, userId, {
      mode: "fill-missing",
    });
    console.log("third install (fill-missing only) result:", JSON.stringify(third));
    assert.equal(third.created.length, 0, "idempotent: no new creates on third call");
    assert.ok(
      third.skipped.length + third.skipped_customized.length >= expectedKeys.length,
      "existing keys skipped or skipped_customized",
    );
    console.log("  OK  fill-missing is idempotent on second/third call");

    // Pack integrity still available from shipped pack
    const pack = getInstagramReplySeedPack();
    assert.ok(pack.some((p) => p.seed_key === "ig.comment.keyword_public"));
    console.log("  OK  pack still exposes dual comment surfaces");

    console.log("\n=== seed shipped-path smoke PASSED ===");
  } finally {
    // Cleanup fixture brand rows
    try {
      await query(`DELETE FROM automation_definition_runs WHERE brand_id = ?`, [brandId]);
      await query(`DELETE FROM automation_definitions WHERE brand_id = ?`, [brandId]);
      console.log("cleaned fixture brand", brandId);
    } catch (e: any) {
      console.warn("cleanup warning:", e?.message || e);
    }
    process.exit(process.exitCode || 0);
  }
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

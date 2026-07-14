import { query, update } from "../src/config/database";

async function main() {
  const brand = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";

  const nav = await query<any[]>(
    `SELECT id, trigger_json FROM automation_definitions WHERE brand_id = ? AND seed_key = ?`,
    [brand, "ig.dm.nav_menu"],
  );
  if (nav?.[0]) {
    let t = nav[0].trigger_json;
    if (typeof t === "string") t = JSON.parse(t);
    t.palavrasChave = [
      "menu",
      "ajuda",
      "opções",
      "opcoes",
      "inicio",
      "início",
      "start",
      "navegação",
      "navegacao",
    ];
    await update(`UPDATE automation_definitions SET trigger_json = ?::jsonb, updated_at = NOW() WHERE id = ?`, [
      JSON.stringify(t),
      nav[0].id,
    ]);
    console.log("nav_menu keywords cleaned");
  }

  await update(
    `UPDATE automation_definitions
     SET status = 'live', ativa = TRUE, updated_at = NOW()
     WHERE brand_id = ? AND seed_key IN ('ig.dm.default_reply', 'ig.dm.keyword', 'ig.dm.nav_menu')`,
    [brand],
  );

  const check = await query(
    `SELECT seed_key, ativa, status, trigger_json->>'palavrasChave' as kw
     FROM automation_definitions
     WHERE brand_id = ? AND seed_key IN ('ig.dm.nav_menu','ig.dm.default_reply','ig.dm.keyword')`,
    [brand],
  );
  console.log("defs", JSON.stringify(check, null, 2));

  const ev = await query(
    `SELECT event_type, dedup_key, processed_at FROM instagram_webhook_events
     WHERE brand_id = ? ORDER BY processed_at DESC LIMIT 5`,
    [brand],
  );
  console.log("events", JSON.stringify(ev, null, 2));

  const msgs = await query(
    `SELECT direction, sender_id, left(coalesce(message_text,''), 60) as text, created_at
     FROM instagram_messages WHERE brand_id = ? ORDER BY created_at DESC LIMIT 5`,
    [brand],
  );
  console.log("messages", JSON.stringify(msgs, null, 2));

  const runs = await query(
    `SELECT status, left(coalesce(error_message,''), 100) as err, started_at
     FROM automation_definition_runs WHERE brand_id = ? ORDER BY started_at DESC LIMIT 5`,
    [brand],
  );
  console.log("runs", JSON.stringify(runs, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

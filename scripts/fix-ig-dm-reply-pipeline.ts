/**
 * Fix + verify default DM reply path.
 * - re-subscribe webhooks (messages + messaging_postbacks)
 * - ensure hybrid dispatch
 * - ensure default_reply active with reliable fallback text
 * - dry-run dispatch simulation (no Meta if no recipient)
 *
 * npx --yes tsx scripts/fix-ig-dm-reply-pipeline.ts
 * npx --yes tsx scripts/fix-ig-dm-reply-pipeline.ts --simulate --recipient=<IGSID>
 */
import { query, queryOne, update } from "../src/config/database";
import { instagramService } from "../src/services/instagram";
import { setBrandDispatchMode, getBrandDispatchMode } from "../src/services/automationDispatchMode";
import { seedInstagramReplyDefinitions } from "../src/services/automationDefinitionSeeds";
import { dispatchInstagramEvent } from "../src/services/instagramEventDispatcher";
import { automationDefinitionsService } from "../src/services/automationDefinitions";

function flag(n: string) {
  return process.argv.includes(`--${n}`);
}
function arg(n: string) {
  return process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
}

async function main() {
  const brand =
    arg("brand") ||
    (
      await queryOne<any>(
        `SELECT brand_id FROM instagram_connections WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      )
    )?.brand_id;
  if (!brand) throw new Error("no brand");

  const conn = await instagramService.getConnection(brand);
  if (!conn) throw new Error("no connection");
  console.log("brand", brand, "ig", conn.username, "ig_user_id", conn.ig_user_id || conn.account_id);

  // 1) seed + activate default reply
  await seedInstagramReplyDefinitions(brand, conn.user_id, { mode: "fill-missing" });
  await update(
    `UPDATE automation_definitions
     SET ativa = TRUE, status = 'live',
         pipeline_json = CASE
           WHEN pipeline_json::text NOT LIKE '%mensagemSteps%'
             OR pipeline_json::text LIKE '%"iaGenerated": true%'
           THEN pipeline_json
           ELSE pipeline_json
         END,
         updated_at = NOW()
     WHERE brand_id = ? AND seed_key = 'ig.dm.default_reply'`,
    [brand],
  );

  // Force a reliable pipeline: fallback text always present, ia optional
  const def = await queryOne<any>(
    `SELECT id, pipeline_json FROM automation_definitions WHERE brand_id = ? AND seed_key = 'ig.dm.default_reply'`,
    [brand],
  );
  if (def) {
    let pipe = def.pipeline_json;
    if (typeof pipe === "string") pipe = JSON.parse(pipe);
    if (Array.isArray(pipe) && pipe[0]) {
      pipe[0].config = {
        ...pipe[0].config,
        iaGenerated: false,
        mensagem:
          pipe[0].config?.mensagem ||
          "Oi! Recebemos sua mensagem 💚 Em breve retornamos. Digite *menu* para ver opções.",
        fallback_message:
          "Oi! Recebemos sua mensagem 💚 Em breve retornamos. Digite *menu* para ver opções.",
        mensagemSteps: [
          {
            id: "default-text",
            tipo: "texto",
            caption:
              "Oi! Recebemos sua mensagem 💚 Em breve retornamos. Digite *menu* para ver opções.",
            delaySegundos: 0,
          },
        ],
      };
      await update(
        `UPDATE automation_definitions
         SET pipeline_json = ?, ativa = TRUE, status = 'live', updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(pipe), def.id],
      );
      console.log("default_reply pipeline set to static text (reliable)");
    }
  }

  // 2) hybrid mode + enable AI auto_reply flags (catalog safety net)
  await setBrandDispatchMode(brand, "hybrid");
  console.log("mode", await getBrandDispatchMode(brand));

  try {
    await instagramService.saveAiSettings(brand, {
      auto_reply_dm: true,
      auto_reply_comments: true,
      brand_name: conn.username || "Marca",
      persona: "",
      tone: "caloroso e direto",
      max_chars: 500,
      guidelines: "Responda de forma breve e útil.",
      faq: [],
      rules: [],
      notify_whatsapp: false,
      notify_phone: "",
    });
    console.log("ai_settings auto_reply_dm=true saved");
  } catch (e: any) {
    console.warn("saveAiSettings", e?.message || e);
  }

  // 3) re-subscribe webhooks
  const sub = await instagramService.subscribeWebhooks(brand);
  console.log("subscribeWebhooks", sub);

  // 4) probe Graph subscribed_apps GET
  try {
    const ig = conn.ig_user_id || conn.account_id;
    const r = await fetch(
      `https://graph.instagram.com/v21.0/${ig}/subscribed_apps?access_token=${encodeURIComponent(conn.access_token!)}`,
    );
    const d = await r.json();
    console.log("GET subscribed_apps", JSON.stringify(d).slice(0, 800));
  } catch (e: any) {
    console.log("GET subscribed_apps error", e.message);
  }

  // 5) connection lookup by ig id (what webhook uses)
  const byIg = await instagramService.getConnectionByIgUserId(String(conn.ig_user_id || conn.account_id));
  console.log("lookup by ig_user_id", byIg ? "OK " + byIg.brand_id : "FAIL");

  // 6) recent events
  const events = await query<any[]>(
    `SELECT event_type, processed_at, dedup_key FROM instagram_webhook_events
     WHERE brand_id = ? ORDER BY processed_at DESC LIMIT 5`,
    [brand],
  );
  console.log("recent webhook events count", (events || []).length, events);

  // 7) optional simulate dispatch
  if (flag("simulate")) {
    const recipient =
      arg("recipient") ||
      (
        await queryOne<any>(
          `SELECT sender_id FROM instagram_messages WHERE brand_id = ? AND direction='incoming' ORDER BY created_at DESC LIMIT 1`,
          [brand],
        )
      )?.sender_id;

    if (!recipient) {
      console.log("SIMULATE skipped: no recipient. Pass --recipient=<IGSID>");
    } else {
      console.log("SIMULATE dispatch resposta_padrao_dm →", recipient);
      const result = await dispatchInstagramEvent({
        brandId: brand,
        userId: conn.user_id,
        igUserId: String(conn.ig_user_id || conn.account_id),
        evento: "resposta_padrao_dm",
        triggeredBy: recipient,
        payload: {
          sender_id: recipient,
          text: "teste resposta padrao",
          mid: `sim-${Date.now()}`,
        },
      });
      console.log("dispatch result", JSON.stringify(result, null, 2));
    }
  }

  const matches = await automationDefinitionsService.getEventMatches(
    brand,
    "instagram",
    "resposta_padrao_dm",
  );
  console.log(
    "active default matches",
    matches.map((m) => ({ id: m.id, nome: m.nome, ativa: m.ativa })),
  );

  console.log(`
=== PRÓXIMOS PASSOS ===
1) Confirme no Meta App que o webhook aponta para: https://SEU_DOMINIO/api/meta/webhook
2) Campos: messages, messaging_postbacks (Instagram)
3) Envie DM para @${conn.username} de outra conta
4) Rode de novo: npx tsx scripts/debug-ig-dm-reply.ts
   Se ainda não houver linhas em instagram_webhook_events, o Meta NÃO está entregando eventos.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

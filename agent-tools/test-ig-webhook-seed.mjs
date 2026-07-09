import "dotenv/config";

const BRAND = process.env.TEST_BRAND_ID || "dc8f901e-857b-4cfb-b353-86cd5146d1fd";

async function main() {
  const { instagramService } = await import("../src/services/instagram.ts");
  const { brandAutomationsService } = await import("../src/services/brandAutomations.ts");
  const { dispatchInstagramEvent } = await import("../src/services/instagramEventDispatcher.ts");

  const conn = await instagramService.getConnection(BRAND);
  if (!conn) {
    console.error("Instagram nao conectado para brand", BRAND);
    process.exit(1);
  }

  console.log("=== Connection ===");
  console.log({ brand: BRAND, username: conn.username, ig_user_id: conn.ig_user_id, user_id: conn.user_id });

  console.log("\n=== Seed slugs (activate) ===");
  const slugs = [
    "weekly-performance-report",
    "profile-health-23h",
    "auto-reply-comments-4h",
    "mention-monitor-3h",
    "ig-webhook-dm-reply",
    "ig-webhook-comment-keyword",
    "ig-webhook-mention-thanks",
  ];
  for (const slug of slugs) {
    const state = await brandAutomationsService.activateSlug(conn.user_id, BRAND, slug);
    console.log(`  ${slug}: ${state.status}`);
  }

  console.log("\n=== Webhook subscribe ===");
  const sub = await instagramService.subscribeWebhooks(BRAND);
  console.log(sub);

  console.log("\n=== Simular dispatch DM ===");
  const dm = await dispatchInstagramEvent({
    brandId: BRAND,
    userId: conn.user_id,
    igUserId: conn.ig_user_id || conn.account_id,
    evento: "resposta_padrao_dm",
    triggeredBy: "test-sender-123",
    payload: {
      sender_id: "test-sender-123",
      text: "Oi, qual o preço do alho?",
      mid: `test-${Date.now()}`,
    },
  });
  console.log(JSON.stringify(dm, null, 2));

  console.log("\n=== Webhook events (recent) ===");
  const events = await instagramService.listWebhookEvents(BRAND, 5);
  console.log(JSON.stringify(events, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
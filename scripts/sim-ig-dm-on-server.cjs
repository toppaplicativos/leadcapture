/**
 * Run ON production server (or locally with same DB):
 * node scripts/sim-ig-dm-on-server.cjs
 * Forces dispatch of default + keyword paths for a test sender.
 */
const path = require("path");
// Ensure dist modules resolve from leadcapture root
process.chdir(path.join(__dirname, ".."));

async function main() {
  const { instagramService } = require("../dist/services/instagram");
  const { handleIncomingInstagramDm } = require("../dist/services/instagramDmOrchestrator");
  const { getBrandDispatchMode } = require("../dist/services/automationDispatchMode");

  const brandId = process.env.BRAND_ID || "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const conn = await instagramService.getConnection(brandId);
  if (!conn) throw new Error("no connection");

  const mode = await getBrandDispatchMode(brandId);
  console.log("mode", mode, "ig", conn.username, conn.ig_user_id || conn.account_id);

  // Use last real sender if any, else fake (send will fail to fake IGSID but we see path)
  const { queryOne } = require("../dist/config/database");
  const last = await queryOne(
    `SELECT sender_id FROM instagram_messages WHERE brand_id = ? AND direction='incoming' ORDER BY created_at DESC LIMIT 1`,
    [brandId],
  ).catch(() => null);

  const senderId = process.env.SENDER_ID || last?.sender_id || "TEST_SENDER_SIM";
  console.log("sender", senderId);

  const text = process.env.DM_TEXT || "ola tem alguem ai?";
  console.log("text", text);

  const result = await handleIncomingInstagramDm({
    brandId,
    userId: conn.user_id,
    igUserId: String(conn.ig_user_id || conn.account_id),
    senderId,
    messageText: text,
    messageId: `sim-${Date.now()}`,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.path === "none" ? 2 : 0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

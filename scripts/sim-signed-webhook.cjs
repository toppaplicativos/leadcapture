/**
 * POST a signed Instagram DM webhook (local or prod).
 * node scripts/sim-signed-webhook.cjs [baseUrl]
 */
const crypto = require("crypto");
const { settingsService } = require("../dist/services/settings");

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:3001";
  const secret =
    process.env.META_APP_SECRET ||
    (await settingsService.getSetting("meta_app_secret")) ||
    "";

  const bodyObj = {
    object: "instagram",
    entry: [
      {
        id: "17841476365227201",
        time: Date.now(),
        messaging: [
          {
            sender: { id: process.env.SENDER_ID || "TEST_SENDER_SIM_OLA" },
            recipient: { id: "17841476365227201" },
            timestamp: Date.now(),
            message: {
              mid: `mid.sim.${Date.now()}`,
              text: process.env.DM_TEXT || "ola tem alguem ai?",
            },
          },
        ],
      },
    ],
  };
  const raw = Buffer.from(JSON.stringify(bodyObj), "utf8");
  const headers = { "Content-Type": "application/json" };
  if (secret.trim()) {
    headers["X-Hub-Signature-256"] =
      "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  }

  console.log("POST", base + "/api/meta/webhook", "signed=", Boolean(secret.trim()));
  const resp = await fetch(base + "/api/meta/webhook", {
    method: "POST",
    headers,
    body: raw,
  });
  const text = await resp.text();
  console.log("status", resp.status, text);

  // Give async handler time
  await new Promise((r) => setTimeout(r, 4000));
  process.exit(resp.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { queryOne } from "../src/config/database";
import { instagramService } from "../src/services/instagram";

async function main() {
  const brand = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const full = await queryOne<any>(`SELECT * FROM instagram_connections WHERE brand_id = ? LIMIT 1`, [brand]);
  console.log({
    ig_user_id: full.ig_user_id,
    account_id: full.account_id,
    app_id: full.app_id,
    is_active: full.is_active,
    token_prefix: String(full.access_token || "").slice(0, 10),
  });

  const a = await instagramService.getConnectionByIgUserId(String(full.ig_user_id));
  const b = await instagramService.getConnectionByIgUserId(String(full.account_id));
  console.log("lookup by ig_user_id", !!a?.brand_id);
  console.log("lookup by account_id", !!b?.brand_id);

  const token = full.access_token;
  const ig = full.ig_user_id || full.account_id;
  const payload = {
    recipient: { id: "1234567890" },
    message: { text: "probe" },
    access_token: token,
  };

  for (const base of [
    "https://graph.instagram.com/v21.0",
    "https://graph.instagram.com/v19.0",
    "https://graph.facebook.com/v21.0",
    "https://graph.facebook.com/v19.0",
  ]) {
    const r = await fetch(`${base}/${ig}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j: any = await r.json().catch(() => ({}));
    console.log(base, r.status, j?.error?.message || j?.error?.code || JSON.stringify(j).slice(0, 200));
  }

  // permissions
  const perm = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=user_id,username,id&access_token=${encodeURIComponent(token)}`,
  );
  console.log("me", await perm.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

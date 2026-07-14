import { queryOne } from "../src/config/database";

async function main() {
  const conn = await queryOne<any>(
    `SELECT access_token, ig_user_id, account_id, username FROM instagram_connections
     WHERE brand_id = 'dc8f901e-857b-4cfb-b353-86cd5146d1fd' LIMIT 1`,
  );
  if (!conn) throw new Error("no conn");
  const token = conn.access_token;
  const ig = conn.ig_user_id || conn.account_id;
  console.log("username", conn.username, "ig", ig);

  const endpoints = [
    `https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(token)}`,
    `https://graph.instagram.com/v21.0/${ig}/conversations?platform=instagram&limit=5&access_token=${encodeURIComponent(token)}`,
    `https://graph.instagram.com/v21.0/me/conversations?platform=instagram&limit=5&access_token=${encodeURIComponent(token)}`,
    `https://graph.instagram.com/v21.0/${ig}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
  ];

  for (const url of endpoints) {
    const label = url.split("?")[0].replace("https://graph.instagram.com/v21.0/", "");
    try {
      const r = await fetch(url);
      const j = await r.json();
      console.log("\n==", r.status, label);
      console.log(JSON.stringify(j, null, 2).slice(0, 1500));
    } catch (e: any) {
      console.log("ERR", label, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

require("dotenv").config();
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "lead-system-secret-key-2026";
const token = jwt.sign(
  { userId: "9ebbc422-758f-4556-9b6b-ddf4985615e2", email: "a@b.com", role: "operator" },
  SECRET,
  { expiresIn: "1h" }
);
const H = { authorization: "Bearer " + token, "x-brand-id": "dc8f901e-857b-4cfb-b353-86cd5146d1fd" };

(async () => {
  /* Sequential — relies on the in-memory bucket accumulating faster than the
   * 60s sliding window can prune. ~210 requests, no async sleeps. */
  const counts = {};
  let firstBlock = -1;
  for (let i = 0; i < 220; i++) {
    try {
      const r = await fetch("https://app.leadcapture.online/api/clients?limit=1", { headers: H });
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status === 429 && firstBlock === -1) firstBlock = i + 1;
    } catch (e) {
      counts.err = (counts.err || 0) + 1;
    }
  }
  console.log("counts:", JSON.stringify(counts));
  console.log("first 429 at request:", firstBlock);
})();

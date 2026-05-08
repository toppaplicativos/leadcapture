import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { instagramService } from "../services/instagram";
import { settingsService } from "../services/settings";
import crypto from "crypto";

const router = Router();

/**
 * Instagram Business Login API (new API — uses instagram.com/oauth/authorize)
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const IG_GRAPH_URL = "https://graph.instagram.com";

async function getAppId(): Promise<string> {
  return (await settingsService.getSetting("meta_app_id")) || process.env.META_APP_ID || "";
}
async function getAppSecret(): Promise<string> {
  return (await settingsService.getSetting("meta_app_secret")) || process.env.META_APP_SECRET || "";
}
function getRedirectUri(): string {
  return process.env.META_OAUTH_REDIRECT_URI || "https://app.leadcapture.online/api/meta/oauth/callback";
}

/**
 * Instagram Business Login scopes (new API):
 * - instagram_business_basic: profile, media
 * - instagram_business_content_publish: publish posts
 * - instagram_business_manage_comments: manage comments
 * - instagram_business_manage_insights: insights/metrics
 * - instagram_business_manage_messages: DMs
 */
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
].join(",");

// In-memory state store (short-lived, 10 min TTL)
const stateStore = new Map<string, { brandId: string; userId: string; expires: number }>();

// Cleanup expired states every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of stateStore) {
    if (val.expires < now) stateStore.delete(key);
  }
}, 300_000);

// ─── GET /api/meta/oauth/start ── Generate Instagram OAuth URL (authenticated) ───
router.get("/start", authMiddleware, attachBrandContext, async (req: BrandRequest, res: Response) => {
  const appId = await getAppId();
  if (!appId) {
    return res.status(500).json({ error: "META_APP_ID nao configurado. Vá em Configuracoes do App Meta para definir." });
  }

  const brandId = String(req.brandId || "").trim();
  const userId = String(req.user?.userId || req.userId || "").trim();
  if (!brandId || !userId) {
    return res.status(400).json({ error: "brand_id e autenticacao obrigatorios" });
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(24).toString("hex");
  stateStore.set(state, {
    brandId,
    userId,
    expires: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const redirectUri = getRedirectUri();

  // Instagram Business Login URL
  const oauthUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?enable_fb_login=0` +
    `&force_authentication=1` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${encodeURIComponent(state)}`;

  res.json({ success: true, url: oauthUrl });
});

// ─── GET /api/meta/oauth/callback ── Handle redirect from Instagram (public) ──
router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;
  const errorDesc = (req.query.error_description || req.query.error_reason || "") as string;

  // User denied permission
  if (error) {
    logger.warn(`[IG OAuth] User denied: ${error} — ${errorDesc}`);
    return res.redirect(`/instagram?oauth_error=${encodeURIComponent(errorDesc || error)}`);
  }

  if (!code) {
    return res.redirect("/instagram?oauth_error=Codigo+de+autorizacao+nao+recebido");
  }

  // Validate state (if present — Instagram may not always return it)
  let brandId = "";
  let userId = "";

  if (state) {
    const stored = stateStore.get(state);
    if (!stored || stored.expires < Date.now()) {
      stateStore.delete(state);
      return res.redirect("/instagram?oauth_error=Sessao+expirada.+Tente+novamente.");
    }
    stateStore.delete(state);
    brandId = stored.brandId;
    userId = stored.userId;
  } else {
    return res.redirect("/instagram?oauth_error=State+invalido.+Tente+novamente.");
  }

  const appId = await getAppId();
  const appSecret = await getAppSecret();

  if (!appId || !appSecret) {
    return res.redirect("/instagram?oauth_error=Configuracao+Meta+incompleta.+Defina+App+ID+e+Secret+nas+configuracoes.");
  }

  try {
    // ── Step 1: Exchange code for short-lived token ──
    // Instagram API uses POST with form body (NOT URL params like Facebook)
    const tokenResp = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: getRedirectUri(),
        code,
      }).toString(),
    });
    const tokenData: any = await tokenResp.json();

    if (tokenData.error_type || tokenData.error_message || tokenData.error) {
      const errMsg = tokenData.error_message || tokenData.error?.message || "Token exchange failed";
      logger.error("[IG OAuth] Token exchange failed:", errMsg);
      return res.redirect(`/instagram?oauth_error=${encodeURIComponent(errMsg)}`);
    }

    const shortToken = tokenData.access_token;
    const igUserId = String(tokenData.user_id || "");

    if (!shortToken) {
      return res.redirect("/instagram?oauth_error=Nao+foi+possivel+obter+o+token+de+acesso");
    }

    logger.info(`[IG OAuth] Got short-lived token for IG user ${igUserId}`);

    // ── Step 2: Exchange for long-lived token (60 days) ──
    const longResp = await fetch(
      `${IG_GRAPH_URL}/access_token` +
      `?grant_type=ig_exchange_token` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&access_token=${encodeURIComponent(shortToken)}`
    );
    const longData: any = await longResp.json();
    const longToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in || 5184000; // default 60 days

    logger.info(`[IG OAuth] Got long-lived token, expires in ${expiresIn}s`);

    // ── Step 3: Get Instagram profile info ──
    const profileResp = await fetch(
      `${IG_GRAPH_URL}/v21.0/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website&access_token=${encodeURIComponent(longToken)}`
    );
    const igProfile: any = await profileResp.json();

    if (igProfile.error) {
      logger.error("[IG OAuth] Profile fetch failed:", igProfile.error.message);
      // Still save the connection even if profile fails
    }

    const username = igProfile.username || "";
    const profileIgUserId = igProfile.user_id || igUserId;

    // ── Step 4: Save connection ──
    await instagramService.saveConnection(brandId, userId, {
      access_token: longToken,
      account_id: profileIgUserId,
      app_id: appId,
      app_secret: appSecret,
    });

    // ── Step 5: Update profile info ──
    await instagramService.updateConnectionProfile(brandId, {
      ig_user_id: profileIgUserId,
      username: username,
      name: igProfile.name || "",
      profile_picture_url: igProfile.profile_picture_url || "",
      followers_count: igProfile.followers_count || 0,
      follows_count: igProfile.follows_count || 0,
      media_count: igProfile.media_count || 0,
      biography: igProfile.biography || "",
      website: igProfile.website || "",
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

    logger.info(`[IG OAuth] Connected @${username || profileIgUserId} to brand ${brandId}`);

    // ── Step 6: Redirect back to frontend ──
    return res.redirect(`/instagram?oauth_success=true&username=${encodeURIComponent(username)}`);
  } catch (err: any) {
    logger.error("[IG OAuth] Callback error:", err.message);
    return res.redirect(`/instagram?oauth_error=${encodeURIComponent("Erro interno: " + err.message)}`);
  }
});

export default router;

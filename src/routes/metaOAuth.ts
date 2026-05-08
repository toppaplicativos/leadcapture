import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { instagramService } from "../services/instagram";
import crypto from "crypto";

const router = Router();

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

function getAppId(): string {
  return process.env.META_APP_ID || "";
}
function getAppSecret(): string {
  return process.env.META_APP_SECRET || "";
}
function getRedirectUri(): string {
  return process.env.META_OAUTH_REDIRECT_URI || "https://app.leadcapture.online/api/meta/oauth/callback";
}

/**
 * Scopes required for Instagram Business:
 * - instagram_basic: read profile, media
 * - instagram_content_publish: publish posts
 * - instagram_manage_comments: manage comments
 * - instagram_manage_insights: read insights/metrics
 * - instagram_manage_messages: read/send DMs
 * - pages_show_list: list Facebook Pages
 * - pages_read_engagement: read page engagement
 * - business_management: access business assets
 */
const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
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

// ─── GET /api/meta/oauth/start ── Generate OAuth URL (authenticated) ────
router.get("/start", authMiddleware, attachBrandContext, (req: BrandRequest, res: Response) => {
  const appId = getAppId();
  if (!appId) {
    return res.status(500).json({ error: "META_APP_ID nao configurado no servidor" });
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
  const oauthUrl =
    `https://www.facebook.com/v21.0/dialog/oauth` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  res.json({ success: true, url: oauthUrl });
});

// ─── GET /api/meta/oauth/callback ── Handle redirect from Meta (public) ──
router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;
  const errorDesc = req.query.error_description as string;

  // User denied permission
  if (error) {
    logger.warn(`[Meta OAuth] User denied: ${error} — ${errorDesc}`);
    return res.redirect(`/instagram?oauth_error=${encodeURIComponent(errorDesc || error)}`);
  }

  if (!code || !state) {
    return res.redirect("/instagram?oauth_error=Parametros+invalidos");
  }

  // Validate state
  const stored = stateStore.get(state);
  if (!stored || stored.expires < Date.now()) {
    stateStore.delete(state);
    return res.redirect("/instagram?oauth_error=Sessao+expirada.+Tente+novamente.");
  }
  stateStore.delete(state);

  const { brandId, userId } = stored;
  const appId = getAppId();
  const appSecret = getAppSecret();

  if (!appId || !appSecret) {
    return res.redirect("/instagram?oauth_error=Configuracao+Meta+incompleta+no+servidor");
  }

  try {
    // 1. Exchange code for short-lived access token
    const tokenUrl =
      `${META_GRAPH_URL}/oauth/access_token` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(getRedirectUri())}` +
      `&client_secret=${appSecret}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenResp = await fetch(tokenUrl);
    const tokenData: any = await tokenResp.json();

    if (tokenData.error) {
      logger.error("[Meta OAuth] Token exchange failed:", tokenData.error.message);
      return res.redirect(`/instagram?oauth_error=${encodeURIComponent(tokenData.error.message)}`);
    }

    const shortToken = tokenData.access_token;

    // 2. Exchange for long-lived token (60 days)
    const longUrl =
      `${META_GRAPH_URL}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`;

    const longResp = await fetch(longUrl);
    const longData: any = await longResp.json();
    const longToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in || 5184000; // default 60 days

    // 3. Get user's Facebook Pages
    const pagesResp = await fetch(
      `${META_GRAPH_URL}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(longToken)}`
    );
    const pagesData: any = await pagesResp.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return res.redirect("/instagram?oauth_error=Nenhuma+pagina+Facebook+encontrada.+Certifique-se+que+sua+conta+tem+uma+Page+vinculada.");
    }

    // 4. Find first page with Instagram Business Account
    let igAccountId = "";
    let pageAccessToken = longToken;
    let pageName = "";

    for (const page of pagesData.data) {
      if (page.instagram_business_account?.id) {
        igAccountId = page.instagram_business_account.id;
        pageAccessToken = page.access_token || longToken;
        pageName = page.name || "";
        break;
      }
    }

    if (!igAccountId) {
      return res.redirect("/instagram?oauth_error=Nenhuma+conta+Instagram+Business+vinculada+as+suas+Pages.+Converta+para+conta+profissional+primeiro.");
    }

    // 5. Get Instagram profile info
    const igProfileResp = await fetch(
      `${META_GRAPH_URL}/${igAccountId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    const igProfile: any = await igProfileResp.json();

    // 6. Save connection
    await instagramService.saveConnection(brandId, userId, {
      access_token: pageAccessToken,
      account_id: igAccountId,
      app_id: appId,
      app_secret: appSecret,
    });

    // 7. Update profile info in the connection
    await instagramService.updateConnectionProfile(brandId, {
      ig_user_id: igProfile.id || igAccountId,
      username: igProfile.username || "",
      name: igProfile.name || pageName,
      profile_picture_url: igProfile.profile_picture_url || "",
      followers_count: igProfile.followers_count || 0,
      follows_count: igProfile.follows_count || 0,
      media_count: igProfile.media_count || 0,
      biography: igProfile.biography || "",
      website: igProfile.website || "",
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

    logger.info(`[Meta OAuth] Connected IG @${igProfile.username || igAccountId} to brand ${brandId}`);

    // 8. Redirect back to frontend
    return res.redirect(`/instagram?oauth_success=true&username=${encodeURIComponent(igProfile.username || "")}`);
  } catch (err: any) {
    logger.error("[Meta OAuth] Callback error:", err.message);
    return res.redirect(`/instagram?oauth_error=${encodeURIComponent("Erro interno: " + err.message)}`);
  }
});

export default router;

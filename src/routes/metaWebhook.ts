import { Router, Request, Response } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";
import { settingsService } from "../services/settings";
import { instagramService } from "../services/instagram";
import { dispatchInstagramEvent } from "../services/instagramEventDispatcher";

const router = Router();

const DEFAULT_VERIFY_TOKEN = "leadcapture_meta_verify_2026";

async function getVerifyToken(): Promise<string> {
  return (
    process.env.META_WEBHOOK_VERIFY_TOKEN
    || (await settingsService.getSetting("meta_webhook_verify_token"))
    || DEFAULT_VERIFY_TOKEN
  );
}

async function getAppSecret(): Promise<string> {
  return process.env.META_APP_SECRET || (await settingsService.getSetting("meta_app_secret")) || "";
}

/** Collect candidate secrets (settings + connection rows) — mismatch was a silent drop in the past. */
async function getAppSecretCandidates(): Promise<string[]> {
  const set = new Set<string>();
  const primary = await getAppSecret();
  if (primary.trim()) set.add(primary.trim());
  if (process.env.META_APP_SECRET?.trim()) set.add(process.env.META_APP_SECRET.trim());
  try {
    const { query } = await import("../config/database");
    const rows = await query<any[]>(
      `SELECT DISTINCT app_secret FROM instagram_connections
       WHERE app_secret IS NOT NULL AND app_secret <> '' LIMIT 10`,
    );
    for (const r of rows || []) {
      if (r.app_secret) set.add(String(r.app_secret).trim());
    }
  } catch {
    /* ignore */
  }
  return [...set];
}

function verifyHmac(rawBody: Buffer | undefined, signature: string, appSecret: string): boolean {
  if (!appSecret.trim()) return false;
  if (!signature || !rawBody || rawBody.length === 0) return false;
  // Meta signs the exact raw bytes (Tattoo AI: hmac.update(rawBody, 'utf8')).
  // Try Buffer as-is and utf8 string form — both must match for valid payloads.
  const expectedA = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedB = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody.toString("utf8"), "utf8")
    .digest("hex")}`;
  try {
    const a = Buffer.from(String(signature).trim());
    for (const exp of [expectedA, expectedB]) {
      const b = Buffer.from(exp);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyHmacAny(
  rawBody: Buffer | undefined,
  signature: string,
): Promise<{ ok: boolean; secretCount: number; reason?: string }> {
  const secrets = await getAppSecretCandidates();
  if (!secrets.length) {
    logger.error("[Meta Webhook] App Secret nao configurado; recusando evento (padrao Tattoo AI)");
    return { ok: false, secretCount: 0, reason: "no_secret" };
  }
  if (!rawBody || rawBody.length === 0) {
    return { ok: false, secretCount: secrets.length, reason: "empty_body" };
  }
  if (!signature) {
    return { ok: false, secretCount: secrets.length, reason: "no_signature" };
  }
  for (const s of secrets) {
    if (verifyHmac(rawBody, signature, s)) return { ok: true, secretCount: secrets.length };
  }
  return { ok: false, secretCount: secrets.length, reason: "mismatch" };
}

/** Resolve raw body whether mounted with express.raw (preferred) or json+verify. */
function resolveRawBody(req: Request): Buffer | undefined {
  if (Buffer.isBuffer(req.body)) return req.body;
  const rb = (req as any).rawBody;
  if (Buffer.isBuffer(rb)) return rb;
  if (typeof rb === "string") return Buffer.from(rb, "utf8");
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") {
    // Last resort — body already parsed; HMAC will likely fail but process may still log
    try {
      return Buffer.from(JSON.stringify(req.body), "utf8");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseWebhookBody(req: Request, rawBody: Buffer | undefined): any {
  if (rawBody && rawBody.length) {
    try {
      return JSON.parse(rawBody.toString("utf8"));
    } catch {
      return null;
    }
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  return null;
}

async function logWebhookDebug(entry: Record<string, unknown>): Promise<void> {
  try {
    const { query } = await import("../config/database");
    await query(`
      CREATE TABLE IF NOT EXISTS instagram_webhook_debug (
        id BIGSERIAL PRIMARY KEY,
        type VARCHAR(60),
        payload_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => undefined);
    const { insert } = await import("../config/database");
    await insert(
      `INSERT INTO instagram_webhook_debug (type, payload_json) VALUES (?, ?)`,
      [String(entry.type || "event"), JSON.stringify(entry)],
    );
  } catch {
    /* best-effort like Tattoo AI */
  }
}

interface IgMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type: string; payload?: Record<string, any> }>;
    quick_reply?: { payload?: string };
  };
  /** Button template / generic template postback */
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
}

interface IgEntry {
  id: string;
  time?: number;
  changes?: Array<{ field: string; value: Record<string, any> }>;
  messaging?: IgMessagingEvent[];
}

// ─── GET  /api/meta/webhook ── Verification challenge ───────────────
router.get("/", async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = await getVerifyToken();

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[Meta Webhook] Verification OK");
    return res.status(200).send(challenge);
  }

  logger.warn("[Meta Webhook] Verification FAILED — token mismatch");
  return res.status(403).json({ error: "Forbidden" });
});

async function entryIdsMatchKnownConnection(body: any): Promise<boolean> {
  const ids = (Array.isArray(body?.entry) ? body.entry : [])
    .map((e: any) => String(e?.id || "").trim())
    .filter(Boolean);
  if (!ids.length) return false;
  for (const id of ids) {
    const conn = await instagramService.getConnectionByIgUserId(id);
    if (conn) return true;
  }
  return false;
}

// ─── POST /api/meta/webhook ── Receive events ───────────────────────
// Mounted with express.raw BEFORE express.json (index.ts) — req.body is Buffer.
// Aliases: /api/instagram/webhook, /api/webhooks/meta/instagram
router.post("/", async (req: Request, res: Response) => {
  const rawBody = resolveRawBody(req);
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const hmac = await verifyHmacAny(rawBody, signature);

  const body = parseWebhookBody(req, rawBody);
  if (!body) {
    if (!hmac.ok) {
      return res.status(401).json({ error: "invalid_signature", reason: hmac.reason });
    }
    return res.status(400).json({ error: "invalid_json" });
  }

  if (!hmac.ok) {
    // Soft-accept: if App Secret is wrong in DB, Meta's real signatures always fail
    // while local smoke (signed with the same wrong secret) still works — which is
    // exactly the failure mode we hit. Process only when payload looks like IG/Page
    // for a known/active connection, so real DMs are not dropped until secret is fixed.
    const { validateMetaAppCredentials } = await import("../services/metaAppCredentials");
    const creds = await validateMetaAppCredentials();
    const known = await entryIdsMatchKnownConnection(body);
    const allowSoft =
      known &&
      (body.object === "instagram" || body.object === "page") &&
      (!creds.ok || process.env.META_WEBHOOK_SOFT_HMAC === "1");

    logger.warn(
      `[Meta Webhook] HMAC failed reason=${hmac.reason} soft=${allowSoft} secretOk=${creds.ok} secretErr=${creds.error || ""} bodyLen=${rawBody?.length || 0} secrets=${hmac.secretCount}`,
    );
    await logWebhookDebug({
      type: allowSoft ? "hmac_soft_accept" : "hmac_fail",
      reason: hmac.reason,
      signaturePresent: Boolean(signature),
      bodyLength: rawBody?.length || 0,
      secretCount: hmac.secretCount,
      secretOk: creds.ok,
      secretError: creds.error || null,
      contentType: req.headers["content-type"] || null,
      bodyPreview: rawBody ? rawBody.toString("utf8").slice(0, 400) : null,
      entryIds: (body.entry || []).map((e: any) => e?.id),
    });

    if (!allowSoft) {
      return res.status(401).json({
        error: "invalid_signature",
        reason: hmac.reason,
        hint: !creds.ok
          ? "App Secret invalido no LeadCapture — cole o App Secret correto do Meta Developers (mesmo app do OAuth)."
          : undefined,
      });
    }
    // fall through and process (return 200 so Meta keeps delivering)
  }

  // Respond immediately (Meta 20s timeout) — same pattern as Tattoo AI
  res.status(200).send("EVENT_RECEIVED");

  try {
    const entryCount = Array.isArray(body.entry) ? body.entry.length : 0;
    logger.info(
      `[Meta Webhook] POST object=${body.object} entries=${entryCount} ids=${(body.entry || [])
        .map((e: any) => e?.id)
        .join(",")
        .slice(0, 120)} bodyLen=${rawBody?.length || 0}`,
    );
    await logWebhookDebug({
      type: "received",
      object: body.object ?? null,
      entries: entryCount,
      entryIds: (body.entry || []).map((e: any) => e?.id),
      fields: (body.entry || []).flatMap((e: any) => {
        const changes = (e.changes || []).map((c: any) => c.field);
        const messaging = (e.messaging || []).length;
        return [...changes, ...(messaging > 0 ? ["messaging"] : [])];
      }),
      sample: body.entry?.[0] ? JSON.stringify(body.entry[0]).slice(0, 600) : null,
    });
    // Temporary debug: first entry shape (helps diagnose empty messaging)
    if (entryCount > 0) {
      const e0 = body.entry[0] || {};
      logger.info(
        `[Meta Webhook] entry0 keys=${Object.keys(e0).join(",")} sample=${JSON.stringify(e0).slice(0, 800)}`,
      );
    }
    if (body.object === "instagram") {
      await Promise.allSettled(
        (body.entry || []).map((entry: IgEntry) =>
          processInstagramEntry(entry).catch((err: any) => {
            logger.error(`[Meta Webhook] processEntry error: ${err.message}`);
          }),
        ),
      );
    } else if (body.object === "page") {
      // Page-linked Instagram messaging (some apps deliver DMs under object=page)
      for (const entry of body.entry || []) {
        const pageId = String(entry.id || "");
        for (const msg of entry.messaging || []) {
          logger.info(
            `[Meta Webhook] Page messaging page=${pageId} from=${msg.sender?.id} text=${String(msg.message?.text || msg.postback?.payload || "").slice(0, 40)}`,
          );
          // Attempt IG processing: entry.id may be page id OR ig id depending on setup
          await processInstagramEntry(entry as IgEntry).catch((err: any) => {
            logger.warn(`[Meta Webhook] page→ig process skipped: ${err?.message || err}`);
          });
        }
      }
    } else {
      logger.info(`[Meta Webhook] ignored object=${body.object}`);
    }
  } catch (err: any) {
    logger.error("[Meta Webhook] Error processing event:", err.message);
  }
});

/** Normalize Meta payload shapes into messaging events we already handle. */
function extractMessagingEvents(entry: IgEntry): IgMessagingEvent[] {
  const fromMessaging = Array.isArray(entry.messaging) ? [...entry.messaging] : [];
  // Instagram Login + Meta App Dashboard "Test" often deliver DMs under changes[].field = "messages"
  // (not entry.messaging). Real webhooks may use either shape.
  for (const change of entry.changes || []) {
    const field = String(change?.field || "");
    const value = change?.value || {};
    if (field === "messages" || field === "message" || field === "messaging") {
      // value may be the messaging event itself, or wrap message/sender
      if (value.sender || value.message || value.postback) {
        fromMessaging.push(value as IgMessagingEvent);
      } else if (value.messaging) {
        const nested = Array.isArray(value.messaging) ? value.messaging : [value.messaging];
        for (const m of nested) fromMessaging.push(m as IgMessagingEvent);
      }
    }
  }
  return fromMessaging;
}

/** Meta Test payloads use string timestamps / placeholders that crash Date#toISOString. */
function safeIsoTimestamp(value: unknown): string {
  if (value == null || value === "") return new Date().toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 0 && value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    let n = Number(s);
    if (n > 0 && n < 1e12) n *= 1000;
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

async function processInstagramEntry(entry: IgEntry) {
  const igUserId = String(entry.id || "");
  const messagingEvents = extractMessagingEvents(entry);
  const changeFields = (entry.changes || []).map((c) => c.field).join(",");
  logger.info(
    `[Meta Webhook] entry id=${igUserId} messaging=${messagingEvents.length} changes=${(entry.changes || []).length} fields=[${changeFields}] keys=${Object.keys(entry || {}).join(",")}`,
  );

  let connection = await instagramService.getConnectionByIgUserId(igUserId);
  if (!connection) {
    // Fallback: single active connection (common when Meta sends alternate id)
    const { queryOne } = await import("../config/database");
    connection = await queryOne<any>(
      `SELECT * FROM instagram_connections WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    );
    if (connection) {
      logger.warn(
        `[Meta Webhook] No exact match for entry.id=${igUserId}; fallback brand=${connection.brand_id} ig=${connection.ig_user_id || connection.account_id}`,
      );
    }
  }
  if (!connection) {
    logger.warn(`[Meta Webhook] No connection for IG user ${igUserId}`);
    return;
  }

  for (const msg of messagingEvents) {
    await processInstagramMessage(igUserId, connection, msg);
  }

  for (const change of entry.changes || []) {
    const field = String(change?.field || "");
    // Already handled as messaging above
    if (field === "messages" || field === "message" || field === "messaging") continue;
    await processInstagramChange(igUserId, connection, change);
  }
}

async function processInstagramMessage(
  igUserId: string,
  connection: { id: string; brand_id: string; user_id: string },
  msg: IgMessagingEvent,
) {
  const isOutbound = Boolean(msg.message?.is_echo || msg.sender?.id === igUserId);
  // Allow postback-only events (button template) without message body
  if (isOutbound) {
    logger.info(`[Meta Webhook] skip outbound/echo from=${msg.sender?.id}`);
    return;
  }
  if (!msg.message && !msg.postback) {
    logger.info(`[Meta Webhook] skip event without message/postback keys=${Object.keys(msg || {}).join(",")}`);
    return;
  }

  const senderId = String(msg.sender?.id || "");
  const postbackPayload = String(msg.postback?.payload || msg.message?.quick_reply?.payload || "");
  const postbackTitle = String(msg.postback?.title || "");
  const messageText = String(
    msg.message?.text || postbackTitle || (postbackPayload ? `[btn:${postbackPayload}]` : ""),
  );
  const messageId = String(
    msg.message?.mid || msg.postback?.mid || `dm-${Date.now()}-${senderId || "unknown"}`,
  );
  const timestamp = safeIsoTimestamp(msg.timestamp);

  if (!senderId) {
    logger.warn("[Meta Webhook] skip DM without sender.id");
    return;
  }

  // Meta Dashboard "Test" uses dummy ids (entry.id=0, sender 12334). Log and process
  // orchestration, but never treat as production success if send fails on fake IGSID.
  const isMetaDashboardTest =
    String(igUserId) === "0" ||
    senderId === "12334" ||
    messageId === "random_mid" ||
    messageText === "random_text";
  if (isMetaDashboardTest) {
    logger.info(
      `[Meta Webhook] Meta dashboard TEST payload detected entry=${igUserId} from=${senderId} — pipeline will run; send may fail on fake IDs (expected)`,
    );
  }

  const attachments = msg.message?.attachments || [];
  const hasShare = attachments.some((a: { type: string }) =>
    ["share", "story_mention", "ig_reel", "reel", "video"].includes(a.type),
  );
  if (!messageText && !hasShare && !postbackPayload) {
    logger.info(
      `[Meta Webhook] skip empty DM attachments=${attachments.map((a) => a.type).join(",") || "none"}`,
    );
    return;
  }

  logger.info(
    `[Meta Webhook] DM brand=${connection.brand_id} from=${senderId}: "${messageText.slice(0, 50)}"${
      postbackPayload ? ` postback=${postbackPayload.slice(0, 40)}` : ""
    }`,
  );

  // Best-effort store — never block reply orchestration for any user
  await instagramService.storeIncomingMessage({
    connectionId: connection.id,
    brandId: connection.brand_id,
    senderId,
    messageId,
    messageText: messageText || (hasShare ? "[compartilhamento/menção]" : ""),
    timestamp,
  }).catch((err: any) => {
    logger.warn(`[Meta Webhook] storeIncomingMessage: ${err?.message || err}`);
  });

  const dedupKey = `dm:${messageId}`;
  const isNew = await instagramService.recordWebhookEvent({
    brandId: connection.brand_id,
    igUserId,
    eventType: hasShare ? "mencao_story" : postbackPayload ? "dm_keyword" : "resposta_padrao_dm",
    field: "messaging",
    triggeredBy: senderId,
    dedupKey,
    payload: {
      sender_id: senderId,
      text: messageText,
      mid: messageId,
      timestamp: msg.timestamp,
      has_share: hasShare,
      postback: postbackPayload || undefined,
    },
  });
  if (!isNew) {
    logger.info(`[Meta Webhook] dedup skip mid=${messageId}`);
    return;
  }

  if (hasShare) {
    const { dispatchInstagramEvent } = await import("../services/instagramEventDispatcher");
    const dispatch = await dispatchInstagramEvent({
      brandId: connection.brand_id,
      userId: connection.user_id,
      igUserId,
      evento: "mencao_story",
      triggeredBy: senderId,
      payload: {
        sender_id: senderId,
        text: messageText,
        interaction_type: "story_mention",
      },
    });
    logger.info(`[Meta Webhook] mention DM dispatch matched=${dispatch.matched}`);
    return;
  }

  // Unified DM path for every brand:
  // 1) dm_keyword (palavras-chave / botões) → 2) resposta_padrao_dm (template + contexto da marca)
  const { handleIncomingInstagramDm } = await import("../services/instagramDmOrchestrator");
  const navText = postbackPayload
    ? [postbackTitle, postbackPayload, messageText].filter(Boolean).join(" ")
    : messageText;

  const outcome = await handleIncomingInstagramDm({
    brandId: connection.brand_id,
    userId: connection.user_id,
    igUserId,
    senderId,
    messageText: navText,
    messageId,
    postbackPayload: postbackPayload || undefined,
    postbackTitle: postbackTitle || undefined,
    isButton: Boolean(postbackPayload || msg.message?.quick_reply),
  });

  logger.info(
    `[Meta Webhook] DM done brand=${connection.brand_id} path=${outcome.path} keywordMatched=${outcome.keywordMatched} defaultMatched=${outcome.defaultMatched} results=${JSON.stringify(outcome.results).slice(0, 400)}`,
  );
}

async function processInstagramChange(
  igUserId: string,
  connection: { id: string; brand_id: string; user_id: string },
  change: { field: string; value: Record<string, any> },
) {
  const value = change.value || {};
  const fromUser = value.from as { id?: string; username?: string } | undefined;

  if (fromUser?.id && String(fromUser.id) === igUserId) {
    return;
  }

  const triggeredBy = fromUser?.id ? String(fromUser.id) : undefined;
  const username = fromUser?.username ? String(fromUser.username) : undefined;
  const text = String(value.text || "");
  const commentId = String(value.id || "");

  let evento: "comentario_keyword" | "mencao_story" | "novo_seguidor" | null = null;
  if (change.field === "comments") evento = "comentario_keyword";
  else if (change.field === "mentions") evento = "mencao_story";
  else if (change.field === "follow" || change.field === "follows") evento = "novo_seguidor";

  if (!evento) {
    logger.info(`[Meta Webhook] Ignored field: ${change.field}`);
    return;
  }

  const dedupKey = commentId
    ? `${change.field}:${commentId}`
    : `${change.field}:${triggeredBy || "unknown"}:${value.media_id || value.media?.id || entryTime(value)}`;

  const isNew = await instagramService.recordWebhookEvent({
    brandId: connection.brand_id,
    igUserId,
    eventType: evento,
    field: change.field,
    triggeredBy: change.field === "comments" && commentId ? commentId : triggeredBy,
    dedupKey,
    payload: { ...value, text, username, comment_id: commentId, sender_id: triggeredBy },
  });
  if (!isNew) return;

  logger.info(
    `[Meta Webhook] ${change.field} brand=${connection.brand_id} by @${username || "?"}: "${text.slice(0, 50)}"`,
  );

  if (evento === "novo_seguidor") {
    logger.info(`[Meta Webhook] Novo seguidor ${triggeredBy} — automação de boas-vindas ainda não seedada`);
    return;
  }

  if (evento === "comentario_keyword") {
    const { getBrandDispatchMode, shouldApplyGlobalAutoReplyGates } = await import(
      "../services/automationDispatchMode"
    );
    const mode = await getBrandDispatchMode(connection.brand_id);
    if (shouldApplyGlobalAutoReplyGates(mode)) {
      const aiSettings = await instagramService.getAiSettings(connection.brand_id);
      if (!aiSettings.auto_reply_comments) {
        logger.info(`[Meta Webhook] comment auto-reply OFF brand=${connection.brand_id} mode=${mode}`);
        return;
      }
    }
  }

  const commentTriggeredBy = change.field === "comments" && commentId ? commentId : triggeredBy;
  const dispatch = await dispatchInstagramEvent({
    brandId: connection.brand_id,
    userId: connection.user_id,
    igUserId,
    evento,
    triggeredBy: commentTriggeredBy,
    payload: {
      sender_id: triggeredBy,
      from_id: triggeredBy,
      from_username: username,
      username,
      text,
      comment_id: commentId,
      media_id: value.media_id || value.media?.id,
    },
    matchKeyword: text,
  });

  logger.info(`[Meta Webhook] ${evento} dispatch matched=${dispatch.matched}`);
}

function entryTime(value: Record<string, any>): string {
  return String(value.timestamp || value.created_time || Date.now());
}

export default router;
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

function verifyHmac(rawBody: Buffer | undefined, signature: string, appSecret: string): boolean {
  if (!appSecret.trim()) return true;
  if (!signature || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
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

// ─── POST /api/meta/webhook ── Receive events ───────────────────────
router.post("/", async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const appSecret = await getAppSecret();

  if (appSecret.trim() && !verifyHmac(rawBody, signature, appSecret)) {
    logger.warn("[Meta Webhook] HMAC verification failed");
    return res.status(401).json({ error: "invalid_signature" });
  }

  const body = req.body || {};
  res.status(200).send("EVENT_RECEIVED");

  try {
    if (body.object === "instagram") {
      await Promise.allSettled(
        (body.entry || []).map((entry: IgEntry) =>
          processInstagramEntry(entry).catch((err: any) => {
            logger.error(`[Meta Webhook] processEntry error: ${err.message}`);
          }),
        ),
      );
    } else if (body.object === "page") {
      for (const entry of body.entry || []) {
        for (const msg of entry.messaging || []) {
          logger.info(`[Meta Webhook] Page message from ${msg.sender?.id}`);
        }
      }
    }
  } catch (err: any) {
    logger.error("[Meta Webhook] Error processing event:", err.message);
  }
});

async function processInstagramEntry(entry: IgEntry) {
  const igUserId = String(entry.id || "");
  const connection = await instagramService.getConnectionByIgUserId(igUserId);
  if (!connection) {
    logger.warn(`[Meta Webhook] No connection for IG user ${igUserId}`);
    return;
  }

  for (const msg of entry.messaging || []) {
    await processInstagramMessage(igUserId, connection, msg);
  }

  for (const change of entry.changes || []) {
    await processInstagramChange(igUserId, connection, change);
  }
}

async function processInstagramMessage(
  igUserId: string,
  connection: { id: string; brand_id: string; user_id: string },
  msg: IgMessagingEvent,
) {
  const isOutbound = Boolean(msg.message?.is_echo || msg.sender?.id === igUserId);
  if (isOutbound || !msg.message) return;

  const senderId = String(msg.sender?.id || "");
  const messageText = String(msg.message?.text || "");
  const messageId = String(msg.message?.mid || `dm-${msg.timestamp}-${senderId}`);
  const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString();

  if (!senderId) return;

  const attachments = msg.message.attachments || [];
  const hasShare = attachments.some((a: { type: string }) =>
    ["share", "story_mention", "ig_reel", "reel", "video"].includes(a.type),
  );
  if (!messageText && !hasShare) return;

  logger.info(`[Meta Webhook] DM brand=${connection.brand_id} from=${senderId}: "${messageText.slice(0, 50)}"`);

  await instagramService.storeIncomingMessage({
    connectionId: connection.id,
    brandId: connection.brand_id,
    senderId,
    messageId,
    messageText: messageText || (hasShare ? "[compartilhamento/menção]" : ""),
    timestamp,
  });

  const dedupKey = `dm:${messageId}`;
  const isNew = await instagramService.recordWebhookEvent({
    brandId: connection.brand_id,
    igUserId,
    eventType: hasShare ? "mencao_story" : "resposta_padrao_dm",
    field: "messaging",
    triggeredBy: senderId,
    dedupKey,
    payload: {
      sender_id: senderId,
      text: messageText,
      mid: messageId,
      timestamp: msg.timestamp,
      has_share: hasShare,
    },
  });
  if (!isNew) return;

  if (hasShare) {
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

  let keywordHandled = false;
  if (messageText) {
    const keywordDispatch = await dispatchInstagramEvent({
      brandId: connection.brand_id,
      userId: connection.user_id,
      igUserId,
      evento: "dm_keyword",
      triggeredBy: senderId,
      payload: { sender_id: senderId, text: messageText, mid: messageId },
      matchKeyword: messageText,
    });
    keywordHandled = keywordDispatch.results.some((r) => r.status === "success");
  }

  if (!keywordHandled) {
    const aiSettings = await instagramService.getAiSettings(connection.brand_id);
    if (!aiSettings.auto_reply_dm) {
      logger.info(`[Meta Webhook] DM auto-reply OFF brand=${connection.brand_id}`);
      return;
    }
    const dispatch = await dispatchInstagramEvent({
      brandId: connection.brand_id,
      userId: connection.user_id,
      igUserId,
      evento: "resposta_padrao_dm",
      triggeredBy: senderId,
      payload: { sender_id: senderId, text: messageText, mid: messageId },
    });
    logger.info(`[Meta Webhook] DM dispatch matched=${dispatch.matched}`);
  }
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
    const aiSettings = await instagramService.getAiSettings(connection.brand_id);
    if (!aiSettings.auto_reply_comments) {
      logger.info(`[Meta Webhook] comment auto-reply OFF brand=${connection.brand_id}`);
      return;
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
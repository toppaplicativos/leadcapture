import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { query, queryOne, update } from "../config/database";

const router = Router();

/**
 * Meta Webhook Verify Token.
 * Set META_WEBHOOK_VERIFY_TOKEN env var on the server.
 * Must match the token you enter in the Meta App Dashboard → Webhooks → Edit Subscription.
 */
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "leadcapture_meta_verify_2026";

// ─── GET  /api/meta/webhook ── Verification challenge ───────────────
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.info("[Meta Webhook] Verification OK");
    return res.status(200).send(challenge);
  }

  logger.warn("[Meta Webhook] Verification FAILED — token mismatch");
  return res.status(403).json({ error: "Forbidden" });
});

// ─── POST /api/meta/webhook ── Receive events ───────────────────────
router.post("/", async (req: Request, res: Response) => {
  const body = req.body;

  // Always respond 200 quickly so Meta doesn't retry
  res.status(200).send("EVENT_RECEIVED");

  try {
    const object = body.object; // "instagram", "page", etc.

    if (object === "instagram") {
      for (const entry of body.entry || []) {
        const igUserId = entry.id;

        // ── Messaging (Instagram Direct) ──
        for (const msg of entry.messaging || []) {
          logger.info(`[Meta Webhook] Instagram DM from ${msg.sender?.id} to ${msg.recipient?.id}`);

          if (msg.message) {
            await processInstagramMessage(igUserId, msg);
          }
        }

        // ── Feed changes (comments, mentions) ──
        for (const change of entry.changes || []) {
          logger.info(`[Meta Webhook] Instagram change: ${change.field}`);

          if (change.field === "comments") {
            await processInstagramComment(igUserId, change.value);
          }
          if (change.field === "mentions") {
            await processInstagramMention(igUserId, change.value);
          }
        }
      }
    }

    if (object === "page") {
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

// ─── Helpers ────────────────────────────────────────────────────────

async function processInstagramMessage(igUserId: string, msg: any) {
  try {
    const connection = await queryOne<{ id: string; brand_id: string; access_token: string }>(
      `SELECT id, brand_id, access_token FROM instagram_connections WHERE ig_user_id = ?`,
      [String(igUserId)]
    );
    if (!connection) {
      logger.warn(`[Meta Webhook] No connection found for IG user ${igUserId}`);
      return;
    }

    const senderId = msg.sender?.id;
    const messageText = msg.message?.text || "";
    const messageId = msg.message?.mid || "";
    const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();

    logger.info(`[Meta Webhook] DM for brand ${connection.brand_id}: "${messageText.slice(0, 50)}"`);

    // Store incoming message for the conversations tab
    try {
      await update(
        `INSERT INTO instagram_messages (connection_id, brand_id, sender_id, message_id, message_text, direction, created_at)
         VALUES (?, ?, ?, ?, ?, 'incoming', ?)
         ON DUPLICATE KEY UPDATE message_text = VALUES(message_text)`,
        [connection.id, connection.brand_id, String(senderId), messageId, messageText, timestamp]
      );
    } catch (dbErr: any) {
      // Table might not exist yet — just log
      logger.warn(`[Meta Webhook] Could not store message: ${dbErr.message}`);
    }
  } catch (err: any) {
    logger.error(`[Meta Webhook] processInstagramMessage error: ${err.message}`);
  }
}

async function processInstagramComment(igUserId: string, value: any) {
  try {
    logger.info(`[Meta Webhook] Comment on media ${value?.media_id} by ${value?.from?.username}: "${(value?.text || "").slice(0, 50)}"`);
  } catch (err: any) {
    logger.error(`[Meta Webhook] processInstagramComment error: ${err.message}`);
  }
}

async function processInstagramMention(igUserId: string, value: any) {
  try {
    logger.info(`[Meta Webhook] Mention by ${value?.comment_id || value?.media_id}`);
  } catch (err: any) {
    logger.error(`[Meta Webhook] processInstagramMention error: ${err.message}`);
  }
}

export default router;

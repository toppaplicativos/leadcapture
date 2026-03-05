import { Router, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { getPool } from "../config/database";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { logger } from "../utils/logger";
import { RowDataPacket } from "mysql2";
import { ProductsService } from "../services/products";
import { AIService } from "../services/ai";
import { AIAgentProfileService } from "../services/aiAgentProfile";
import { KnowledgeBaseService } from "../services/knowledgeBase";

const router = Router();
router.use(authMiddleware, requireBrandContext);
const productsService = new ProductsService();
const aiService = new AIService();
const aiAgentProfileService = new AIAgentProfileService();
const knowledgeBaseService = new KnowledgeBaseService();
let aiSchemaReady = false;
let aiSchemaPromise: Promise<void> | null = null;

type ConversationAIMode = "manual" | "autonomous" | "supervised";

const inboxMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads/inbox-media");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const uploadInboxMedia = multer({
  storage: inboxMediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

function getMediaTypeFromMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function normalizeDigits(value?: string | null): string {
  return String(value || "").replace(/\D/g, "");
}

function extractPhoneFromJid(jid?: string | null): string {
  const raw = String(jid || "").trim();
  if (!raw) return "";
  const [left] = raw.split("@");
  const [phone] = left.split(":");
  return normalizeDigits(phone);
}

function isSamePhone(a?: string | null, b?: string | null): boolean {
  const left = normalizeDigits(a);
  const right = normalizeDigits(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function parseStringTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  }

  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
    }
  } catch {
    // noop
  }

  return [...new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function normalizePipelineStageInput(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;

  const aliases: Record<string, string> = {
    hot: "interested",
    warm: "negotiating",
    cold: "new",
    quente: "interested",
    morno: "negotiating",
    frio: "new",
  };

  const normalized = aliases[raw] || raw;
  const allowed = new Set(["new", "interested", "negotiating", "closing", "won", "lost"]);
  return allowed.has(normalized) ? normalized : null;
}

async function hasColumn(pool: any, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return Array.isArray(rows) && rows.length > 0;
}

async function resolveInstanceBrandScope(pool: any, brandId?: string | null): Promise<{ clause: string; params: any[] }> {
  const hasBrandColumn = await hasColumn(pool, "whatsapp_instances", "brand_id");
  if (!hasBrandColumn) return { clause: " AND 1 = 0", params: [] };
  const normalized = String(brandId || "").trim();
  if (!normalized) return { clause: " AND 1 = 0", params: [] };
  return { clause: " AND i.brand_id = ?", params: [normalized] };
}

function normalizeAIMode(value: unknown): ConversationAIMode {
  const raw = String(value || "autonomous").trim().toLowerCase();
  if (raw === "autonomous" || raw === "supervised" || raw === "manual") return raw;
  return "autonomous";
}

function safeParseJson<T = Record<string, unknown>>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as T;
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function parseBooleanInput(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseFromMeFlag(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  if (Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] === 1;
  }
  if (Array.isArray(value)) {
    return value.length > 0 && Number(value[0]) === 1;
  }
  if (typeof value === "object") {
    const maybeBuffer = value as { type?: string; data?: unknown };
    if (maybeBuffer?.type === "Buffer" && Array.isArray(maybeBuffer.data)) {
      return maybeBuffer.data.length > 0 && Number(maybeBuffer.data[0]) === 1;
    }
  }
  return false;
}

async function ensureAIConversationSchema(pool: any): Promise<void> {
  if (aiSchemaReady) return;
  if (aiSchemaPromise) {
    await aiSchemaPromise;
    return;
  }

  aiSchemaPromise = (async () => {
    const ensureColumn = async (column: string, ddl: string) => {
      const exists = await hasColumn(pool, "whatsapp_conversations", column);
      if (!exists) {
        await pool.query(`ALTER TABLE whatsapp_conversations ADD COLUMN ${ddl}`);
      }
    };

    await ensureColumn("ai_mode", "ai_mode VARCHAR(16) NOT NULL DEFAULT 'manual'");
    await ensureColumn("ai_lock_human", "ai_lock_human TINYINT(1) NOT NULL DEFAULT 1");
    await ensureColumn("ai_last_decision_json", "ai_last_decision_json JSON NULL");
    await ensureColumn("ai_updated_at", "ai_updated_at TIMESTAMP NULL");
    await ensureColumn("ai_updated_by", "ai_updated_by VARCHAR(36) NULL");
    await ensureColumn("ai_last_incoming_message_id", "ai_last_incoming_message_id VARCHAR(120) NULL");
    await ensureColumn("ai_last_reply_message_id", "ai_last_reply_message_id VARCHAR(120) NULL");

    await pool.execute(
      "UPDATE whatsapp_conversations SET ai_mode = 'manual' WHERE ai_mode IS NULL OR ai_mode = ''"
    );
    try {
      await pool.execute(
        "ALTER TABLE whatsapp_conversations MODIFY COLUMN ai_mode VARCHAR(16) NOT NULL DEFAULT 'manual'"
      );
    } catch {
      // no-op
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_conversation_decisions (
        id VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) DEFAULT NULL,
        brand_id VARCHAR(36) DEFAULT NULL,
        decision_type VARCHAR(40) NOT NULL,
        mode VARCHAR(16) NOT NULL,
        summary TEXT,
        payload_json JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_ai_cd_conv (conversation_id),
        KEY idx_ai_cd_user (user_id),
        KEY idx_ai_cd_brand (brand_id),
        KEY idx_ai_cd_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_global_settings (
        brand_id VARCHAR(36) PRIMARY KEY,
        auto_reply_enabled TINYINT(1) NOT NULL DEFAULT 0,
        updated_by VARCHAR(36) NULL,
        reason VARCHAR(255) NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    aiSchemaReady = true;
  })().finally(() => {
    aiSchemaPromise = null;
  });

  await aiSchemaPromise;
}

async function logAIDecision(
  pool: any,
  input: {
    conversationId: string;
    userId?: string;
    brandId?: string | null;
    decisionType: string;
    mode: ConversationAIMode;
    summary?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureAIConversationSchema(pool);
  const id = `aid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await pool.execute(
    `INSERT INTO ai_conversation_decisions
     (id, conversation_id, user_id, brand_id, decision_type, mode, summary, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.conversationId,
      input.userId || null,
      input.brandId || null,
      input.decisionType,
      input.mode,
      input.summary || null,
      JSON.stringify(input.payload || {}),
    ]
  );
}

async function getOwnedConversation(
  pool: any,
  conversationId: string,
  userId: string,
  brandId?: string | null,
) {
  await ensureAIConversationSchema(pool);
  const instanceBrandScope = await resolveInstanceBrandScope(pool, brandId);
  const [rows] = await pool.execute(
    `SELECT c.*
     FROM whatsapp_conversations c
     JOIN whatsapp_instances i ON i.id = c.instance_id
     WHERE c.id = ? AND i.created_by = ?${instanceBrandScope.clause}
     LIMIT 1`,
    [conversationId, userId, ...instanceBrandScope.params]
  );
  return (rows?.[0] as any) || null;
}

function isHumanReplyBlocked(conversation: any): boolean {
  const mode = normalizeAIMode(conversation?.ai_mode);
  const lockHuman = parseBooleanInput(conversation?.ai_lock_human, true);
  return mode === "autonomous" && lockHuman;
}

async function getGlobalAIState(pool: any, brandId?: string | null) {
  await ensureAIConversationSchema(pool);
  const normalizedBrandId = String(brandId || "").trim();
  if (!normalizedBrandId) {
    return {
      brand_id: null,
      enabled: false,
      reason: "brand_scope_missing",
      updated_at: null,
      updated_by: null,
    };
  }

  const [rows] = await pool.query(
    `SELECT brand_id, auto_reply_enabled, reason, updated_at, updated_by
     FROM ai_global_settings
     WHERE brand_id = ?
     LIMIT 1`,
    [normalizedBrandId]
  );

  const row = (rows as any[])?.[0];
  if (!row) {
    await pool.execute(
      `INSERT INTO ai_global_settings (brand_id, auto_reply_enabled, reason, updated_by)
       VALUES (?, 0, 'default_disabled', NULL)`,
      [normalizedBrandId]
    );

    return {
      brand_id: normalizedBrandId,
      enabled: false,
      reason: "default_disabled",
      updated_at: null,
      updated_by: null,
    };
  }

  return {
    brand_id: String(row.brand_id || normalizedBrandId),
    enabled: parseBooleanInput(row.auto_reply_enabled, false),
    reason: row.reason ? String(row.reason) : null,
    updated_at: row.updated_at || null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

// GET /api/inbox/conversations - List conversations with last message
router.get("/conversations", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const instanceBrandScope = await resolveInstanceBrandScope(pool, req.brandId);
    const { instance_id, status, search, limit, offset } = req.query;
    
    let query = `
      SELECT c.*, 
        i.name as instance_name,
        i.phone as instance_phone
      FROM whatsapp_conversations c
      JOIN whatsapp_instances i ON c.instance_id = i.id
      WHERE i.created_by = ?${instanceBrandScope.clause}
    `;
    const params: any[] = [userId, ...instanceBrandScope.params];

    if (instance_id) {
      query += " AND c.instance_id = ?";
      params.push(instance_id);
    }
    if (status) {
      query += " AND c.status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND (c.contact_name LIKE ? OR c.contact_phone LIKE ? OR c.remote_jid LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC, c.updated_at DESC, c.id DESC";
    
    const lim = Math.min(parseInt(limit as string) || 50, 200);
    const off = parseInt(offset as string) || 0;
    query += " LIMIT ? OFFSET ?";
    params.push(lim, off);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    const filteredRows = (rows as any[]).filter((row) => {
      const isGroup = Boolean(Number(row?.is_group || 0)) || String(row?.remote_jid || "").endsWith("@g.us");
      if (isGroup) return true;
      const remotePhone = extractPhoneFromJid(String(row?.remote_jid || ""));
      return !isSamePhone(remotePhone, String(row?.instance_phone || ""));
    });

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM whatsapp_conversations c
      JOIN whatsapp_instances i ON c.instance_id = i.id
      WHERE i.created_by = ?${instanceBrandScope.clause}
    `;
    const countParams: any[] = [userId, ...instanceBrandScope.params];
    if (instance_id) { countQuery += " AND c.instance_id = ?"; countParams.push(instance_id); }
    if (status) { countQuery += " AND c.status = ?"; countParams.push(status); }
    if (search) {
      countQuery += " AND (c.contact_name LIKE ? OR c.contact_phone LIKE ? OR c.remote_jid LIKE ?)";
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    const [countRows] = await pool.execute<RowDataPacket[]>(countQuery, countParams);

    const totalRaw = Number((countRows[0] as any).total || 0);
    const removedFromPage = Math.max(0, (rows as any[]).length - filteredRows.length);
    const adjustedTotal = Math.max(0, totalRaw - removedFromPage);

    res.json({
      success: true,
      conversations: filteredRows,
      total: adjustedTotal,
    });
  } catch (error: any) {
    logger.error(error, "Error listing conversations");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/messages - Get messages for a conversation
router.get("/conversations/:id/messages", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const instanceBrandScope = await resolveInstanceBrandScope(pool, req.brandId);
    const { limit, before_timestamp } = req.query;
    const lim = Math.min(parseInt(limit as string) || 50, 200);

    let query = `
      SELECT m.* FROM whatsapp_messages m
      JOIN whatsapp_conversations c ON c.id = m.conversation_id
      JOIN whatsapp_instances i ON i.id = c.instance_id
      WHERE m.conversation_id = ? AND i.created_by = ?${instanceBrandScope.clause}
    `;
    const params: any[] = [req.params.id, userId, ...instanceBrandScope.params];

    if (before_timestamp) {
      query += " AND m.message_timestamp < ?";
      params.push(before_timestamp);
    }

    query += " ORDER BY m.message_timestamp DESC, m.created_at DESC, m.id DESC LIMIT ?";
    params.push(lim);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Return in chronological order
    res.json({
      success: true,
      messages: (rows as any[]).reverse(),
    });
  } catch (error: any) {
    logger.error(error, "Error listing messages");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/avatar - Get avatar URL for the conversation JID
router.get("/conversations/:id/avatar", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const instanceBrandScope = await resolveInstanceBrandScope(pool, req.brandId);
    const [convRows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.instance_id, c.remote_jid
       FROM whatsapp_conversations c
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = ? AND i.created_by = ?${instanceBrandScope.clause}`,
      [req.params.id, userId, ...instanceBrandScope.params]
    );

    const conv = convRows[0] as any;
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const instanceManager = req.app.get("instanceManager");
    const avatarUrl = instanceManager
      ? await instanceManager.getProfilePictureUrl(conv.instance_id, conv.remote_jid)
      : null;

    res.json({ success: true, avatar_url: avatarUrl || null });
  } catch (error: any) {
    logger.error(error, "Error fetching conversation avatar");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/participants - Resolve group participants with optional names/photos
router.get("/conversations/:id/participants", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const instanceBrandScope = await resolveInstanceBrandScope(pool, req.brandId);
    const [convRows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.id, c.instance_id, c.remote_jid, c.is_group
       FROM whatsapp_conversations c
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = ? AND i.created_by = ?${instanceBrandScope.clause}`,
      [req.params.id, userId, ...instanceBrandScope.params]
    );

    const conv = convRows[0] as any;
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (!Number(conv.is_group)) {
      return res.json({ success: true, participants: [] });
    }

    const senderNameColumn = await hasColumn(pool, "whatsapp_messages", "sender_name");

    const query = senderNameColumn
      ? `
        SELECT
          sender_jid,
          MAX(NULLIF(TRIM(sender_name), '')) AS sender_name
        FROM whatsapp_messages
        WHERE conversation_id = ?
          AND sender_jid IS NOT NULL
          AND sender_jid <> ''
        GROUP BY sender_jid
      `
      : `
        SELECT
          sender_jid,
          NULL AS sender_name
        FROM whatsapp_messages
        WHERE conversation_id = ?
          AND sender_jid IS NOT NULL
          AND sender_jid <> ''
        GROUP BY sender_jid
      `;

    const [rows] = await pool.query<RowDataPacket[]>(query, [req.params.id]);
    const instanceManager = req.app.get("instanceManager");

    const participants = await Promise.all(
      (rows || []).map(async (row: any) => {
        const jid = String(row.sender_jid || "");
        const phone = extractPhoneFromJid(jid);
        const resolvedName = row.sender_name ? String(row.sender_name) : phone ? `+${phone}` : "Participante";
        const avatarUrl = instanceManager
          ? await instanceManager.getProfilePictureUrl(conv.instance_id, jid)
          : null;

        return {
          jid,
          phone,
          name: resolvedName,
          avatar_url: avatarUrl || null,
        };
      })
    );

    res.json({ success: true, participants });
  } catch (error: any) {
    logger.error(error, "Error fetching conversation participants");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/send - Send a message in a conversation
router.post("/conversations/:id/send", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (isHumanReplyBlocked(conv)) {
      await logAIDecision(pool, {
        conversationId: String(conv.id),
        userId,
        brandId: req.brandId,
        decisionType: "human_blocked",
        mode: normalizeAIMode(conv.ai_mode),
        summary: "Tentativa de envio humano bloqueada em modo autonomo.",
      });

      return res.status(409).json({
        error: "Atendimento Automatico ativo para esta conversa. Use 'Assumir Atendimento' para takeover manual.",
        code: "AI_AUTONOMOUS_LOCKED",
      });
    }

    // Get the instance manager from the app
    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    // Send via WhatsApp
    const sent = await instanceManager.sendMessageByJid(conv.instance_id, conv.remote_jid, message);
    if (!sent) return res.status(500).json({ error: "Failed to send message" });

    // Save to DB
    const msgId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);
    await pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, conv.id, conv.instance_id, conv.remote_jid, message, now]
    );

    // Update conversation
    await pool.execute(
      `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW() WHERE id = ?`,
      [message, conv.id]
    );

    res.json({
      success: true,
      message: {
        id: msgId,
        conversation_id: conv.id,
        from_me: true,
        body: message,
        message_type: "text",
        status: "sent",
        message_timestamp: now,
      },
    });
  } catch (error: any) {
    logger.error(error, "Error sending message");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/send-product - Send product card with image/caption
router.post("/conversations/:id/send-product", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ error: "productId is required" });

    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (isHumanReplyBlocked(conv)) {
      return res.status(409).json({
        error: "Atendimento Automatico ativo para esta conversa. Use 'Assumir Atendimento' para takeover manual.",
        code: "AI_AUTONOMOUS_LOCKED",
      });
    }
    const product = await productsService.getProduct(String(productId), userId, req.brandId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    const captionLines = [
      product.name,
      product.description || "",
      `Categoria: ${product.category}`,
      `Preco: R$ ${(Number(product.promoPrice ?? product.price) || 0).toFixed(2)}`
    ]
      .map((line) => String(line || "").trim())
      .filter(Boolean);

    const caption = captionLines.join("\n");
    const contextTags = [
      ...parseStringTags((conv as any).tags),
      String((conv as any).pipeline_stage || "").trim().toLowerCase(),
      String((conv as any).status || "").trim().toLowerCase(),
    ].filter(Boolean);

    const resolvedDynamicCover = await productsService.resolveDynamicCover(
      String(productId),
      { tags: contextTags },
      userId,
      req.brandId,
    );

    const imageUrl = String(
      (resolvedDynamicCover as any)?.image_url ||
      (resolvedDynamicCover as any)?.imageUrl ||
      (product as any).imageUrl ||
      (product as any).image ||
      ""
    ).trim();
    const now = Math.floor(Date.now() / 1000);
    const msgId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (imageUrl) {
      let localPath: string | null = null;
      let publicUrl = imageUrl;

      if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        try {
          const parsed = new URL(imageUrl);
          publicUrl = imageUrl;
          if (parsed.pathname.startsWith("/uploads/")) {
            localPath = path.join(__dirname, "../../", parsed.pathname.replace(/^\//, ""));
          }
        } catch {
          localPath = null;
        }
      } else if (imageUrl.startsWith("/uploads/")) {
        publicUrl = `${req.protocol}://${req.get("host")}${imageUrl}`;
        localPath = path.join(__dirname, "../../", imageUrl.replace(/^\//, ""));
      }

      if (localPath && fs.existsSync(localPath)) {
        const sentMedia = await instanceManager.sendMediaByJid(conv.instance_id, conv.remote_jid, {
          mediaType: "image",
          filePath: localPath,
          caption,
          fileName: `${product.name}.jpg`
        });

        if (!sentMedia) return res.status(500).json({ error: "Failed to send product image" });

        const encodedBody = `[media:image] ${publicUrl}\n${caption}`;
        await pool.execute(
          `INSERT INTO whatsapp_messages (
             id, conversation_id, instance_id, remote_jid, from_me, message_type, body, caption, media_url, status, message_timestamp, created_at
           )
           VALUES (?, ?, ?, ?, 1, 'image', ?, ?, ?, 'sent', ?, NOW())`,
          [msgId, conv.id, conv.instance_id, conv.remote_jid, encodedBody, caption, publicUrl, now]
        );

        await pool.execute(
          `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW() WHERE id = ?`,
          [`📦 Produto enviado: ${product.name}`, conv.id]
        );

        return res.json({
          success: true,
          message: {
            id: msgId,
            conversation_id: conv.id,
            from_me: true,
            body: encodedBody,
            message_type: "image",
            status: "sent",
            message_timestamp: now
          }
        });
      }
    }

    // fallback para texto caso imagem nao exista/nao esteja acessivel localmente
    const fallbackText = caption;
    const sentText = await instanceManager.sendMessageByJid(conv.instance_id, conv.remote_jid, fallbackText);
    if (!sentText) return res.status(500).json({ error: "Failed to send product message" });

    await pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, conv.id, conv.instance_id, conv.remote_jid, fallbackText, now]
    );

    await pool.execute(
      `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW() WHERE id = ?`,
      [fallbackText.slice(0, 500), conv.id]
    );

    res.json({
      success: true,
      message: {
        id: msgId,
        conversation_id: conv.id,
        from_me: true,
        body: fallbackText,
        message_type: "text",
        status: "sent",
        message_timestamp: now
      }
    });
  } catch (error: any) {
    logger.error(error, "Error sending product message");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/send-media - Send media in a conversation
router.post(
  "/conversations/:id/send-media",
  uploadInboxMedia.single("file"),
  async (req: BrandRequest, res: Response) => {
    try {
      const userId = req.user?.userId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "Arquivo de midia obrigatorio" });

      const pool = getPool();
      const { caption } = req.body || {};
      const voiceNoteRaw = String(req.body?.voiceNote || "").trim().toLowerCase();
      const voiceNote = ["1", "true", "yes", "on"].includes(voiceNoteRaw);

      const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });
      if (isHumanReplyBlocked(conv)) {
        return res.status(409).json({
          error: "Atendimento Automatico ativo para esta conversa. Use 'Assumir Atendimento' para takeover manual.",
          code: "AI_AUTONOMOUS_LOCKED",
        });
      }
      const instanceManager = req.app.get("instanceManager");
      if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

      const mediaType = getMediaTypeFromMime(file.mimetype);
      const sent = await instanceManager.sendMediaByJid(conv.instance_id, conv.remote_jid, {
        mediaType,
        filePath: file.path,
        caption: caption ? String(caption) : undefined,
        mimeType: file.mimetype,
        fileName: file.originalname,
        voiceNote: mediaType === "audio" ? voiceNote : false,
      });

      if (!sent) return res.status(500).json({ error: "Failed to send media" });

      const now = Math.floor(Date.now() / 1000);
      const msgId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const mediaUrl = `${req.protocol}://${req.get("host")}/uploads/inbox-media/${file.filename}`;
      const encodedBody = `[media:${mediaType}] ${mediaUrl}${caption ? `\n${String(caption)}` : ""}`;

      await pool.execute(
        `INSERT INTO whatsapp_messages (
           id, conversation_id, instance_id, remote_jid, from_me, message_type, body, caption, media_url, media_mimetype, media_filename, media_size, status, message_timestamp, created_at
         )
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, NOW())`,
        [
          msgId,
          conv.id,
          conv.instance_id,
          conv.remote_jid,
          mediaType,
          encodedBody,
          caption ? String(caption) : null,
          mediaUrl,
          file.mimetype,
          file.originalname,
          file.size,
          now
        ]
      );

      const previewText = caption
        ? String(caption)
        : mediaType === "image"
        ? "📷 Imagem enviada"
        : mediaType === "video"
        ? "🎬 Video enviado"
        : mediaType === "audio"
        ? voiceNote
          ? "🎤 Audio de voz enviado"
          : "🎧 Audio enviado"
        : "📎 Documento enviado";

      await pool.execute(
        `UPDATE whatsapp_conversations
         SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW()
         WHERE id = ?`,
        [previewText, conv.id]
      );

      res.json({
        success: true,
        message: {
          id: msgId,
          conversation_id: conv.id,
          from_me: true,
          body: encodedBody,
          message_type: mediaType,
          status: "sent",
          message_timestamp: now,
        },
      });
    } catch (error: any) {
      logger.error(error, "Error sending media");
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/inbox/conversations/:id/send-poll - Send poll in a conversation
router.post("/conversations/:id/send-poll", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { question, options, selectableCount, deliveryMode } = req.body || {};
    const normalizedQuestion = String(question || "").trim();
    const normalizedOptions = Array.isArray(options)
      ? options.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const normalizedDeliveryMode =
      deliveryMode === "native_only" || deliveryMode === "text_only" ? deliveryMode : "auto";

    if (!normalizedQuestion) return res.status(400).json({ error: "Pergunta obrigatoria" });
    if (normalizedOptions.length < 2) {
      return res.status(400).json({ error: "Envie pelo menos 2 opcoes para a enquete" });
    }

    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (isHumanReplyBlocked(conv)) {
      return res.status(409).json({
        error: "Atendimento Automatico ativo para esta conversa. Use 'Assumir Atendimento' para takeover manual.",
        code: "AI_AUTONOMOUS_LOCKED",
      });
    }
    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    const result = await instanceManager.sendPollByJid(conv.instance_id, conv.remote_jid, {
      question: normalizedQuestion,
      options: normalizedOptions,
      selectableCount:
        typeof selectableCount === "number" && selectableCount > 0 ? selectableCount : 1,
      deliveryMode: normalizedDeliveryMode,
    });

    if (!result.ok) {
      return res.status(500).json({
        error: result.error || "Failed to send poll",
        mode: result.mode,
        nativeError: result.nativeError || null,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const msgId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const encodedBody = `[poll] ${normalizedQuestion}\n${normalizedOptions
      .map((option: string) => `- ${option}`)
      .join("\n")}`;

    await pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, conv.id, conv.instance_id, conv.remote_jid, encodedBody, now]
    );

    await pool.execute(
      `UPDATE whatsapp_conversations
       SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW()
       WHERE id = ?`,
      [`📊 Enquete: ${normalizedQuestion}`, conv.id]
    );

    res.json({
      success: true,
      message: {
        id: msgId,
        conversation_id: conv.id,
        from_me: true,
        body: encodedBody,
        message_type: "poll",
        status: "sent",
        message_timestamp: now,
        delivery_mode: result.mode,
        native_error: result.nativeError || null,
      },
    });
  } catch (error: any) {
    logger.error(error, "Error sending poll");
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/inbox/conversations/:id - Update conversation (status, notes, tags)
router.patch("/conversations/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const instanceBrandScope = await resolveInstanceBrandScope(pool, req.brandId);
    const { status, notes, tags, pipeline_stage } = req.body;
    const [statusExists, notesExists, tagsExists, pipelineExists] = await Promise.all([
      hasColumn(pool, "whatsapp_conversations", "status"),
      hasColumn(pool, "whatsapp_conversations", "notes"),
      hasColumn(pool, "whatsapp_conversations", "tags"),
      hasColumn(pool, "whatsapp_conversations", "pipeline_stage"),
    ]);

    const updates: string[] = [];
    const params: any[] = [];

    if (status !== undefined && statusExists) { updates.push("c.status = ?"); params.push(status); }
    if (notes !== undefined && notesExists) { updates.push("c.notes = ?"); params.push(notes); }
    if (tags !== undefined && tagsExists) { updates.push("c.tags = ?"); params.push(JSON.stringify(tags)); }
    if (pipeline_stage !== undefined && pipelineExists) {
      const normalizedStage = normalizePipelineStageInput(pipeline_stage);
      if (normalizedStage) {
        updates.push("c.pipeline_stage = ?");
        params.push(normalizedStage);
      }
    }

    if (updates.length === 0) {
      return res.json({
        success: true,
        warning: "No supported fields available to update in current schema",
      });
    }

    updates.push("c.updated_at = NOW()");
    params.push(req.params.id, userId, ...instanceBrandScope.params);

    const [result] = await pool.execute(
      `UPDATE whatsapp_conversations c
       JOIN whatsapp_instances i ON i.id = c.instance_id
       SET ${updates.join(", ")}
       WHERE c.id = ? AND i.created_by = ?${instanceBrandScope.clause}`,
      params
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error updating conversation");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/ai-state
router.get("/ai-global-state", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const globalState = await getGlobalAIState(pool, req.brandId);
    return res.json({
      success: true,
      global_ai: globalState,
    });
  } catch (error: any) {
    logger.error(error, "Error fetching global inbox ai state");
    res.status(500).json({ error: error.message });
  }
});

router.patch("/ai-global-state", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const normalizedBrandId = String(req.brandId || "").trim();
    if (!normalizedBrandId) {
      return res.status(400).json({ error: "Brand context is required" });
    }

    const enabled = parseBooleanInput(req.body?.enabled, true);
    const reason = String(req.body?.reason || "").trim() || null;

    await ensureAIConversationSchema(pool);
    await pool.execute(
      `INSERT INTO ai_global_settings (brand_id, auto_reply_enabled, reason, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         auto_reply_enabled = VALUES(auto_reply_enabled),
         reason = VALUES(reason),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [normalizedBrandId, enabled ? 1 : 0, reason, userId]
    );

    const globalState = await getGlobalAIState(pool, normalizedBrandId);
    return res.json({
      success: true,
      global_ai: globalState,
    });
  } catch (error: any) {
    logger.error(error, "Error updating global inbox ai state");
    res.status(500).json({ error: error.message });
  }
});

router.get("/conversations/:id/ai-state", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    return res.json({
      success: true,
      ai: {
        mode: normalizeAIMode(conv.ai_mode),
        lock_human: parseBooleanInput(conv.ai_lock_human, true),
        last_decision: conv.ai_last_decision_json ? JSON.parse(String(conv.ai_last_decision_json)) : null,
        updated_at: conv.ai_updated_at || null,
        updated_by: conv.ai_updated_by || null,
        last_incoming_message_id: conv.ai_last_incoming_message_id || null,
        last_reply_message_id: conv.ai_last_reply_message_id || null,
      }
    });
  } catch (error: any) {
    logger.error(error, "Error fetching conversation ai state");
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/inbox/conversations/:id/ai-state
router.patch("/conversations/:id/ai-state", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const mode = normalizeAIMode(req.body?.mode);
    const globalState = await getGlobalAIState(pool, req.brandId);
    if (!globalState.enabled && mode !== "manual") {
      return res.status(409).json({
        error: "Atendimento Automatico globalmente desabilitado para esta marca.",
        code: "AI_GLOBAL_DISABLED",
      });
    }

    const lockHuman = parseBooleanInput(req.body?.lock_human, true);
    const reason = String(req.body?.reason || "").trim();
    const decisionPayload = {
      event: "mode_update",
      mode,
      lock_human: lockHuman,
      reason,
      updated_by: userId,
      at: new Date().toISOString(),
    };

    await pool.execute(
      `UPDATE whatsapp_conversations
       SET ai_mode = ?, ai_lock_human = ?, ai_last_decision_json = ?, ai_updated_at = NOW(), ai_updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [mode, lockHuman ? 1 : 0, JSON.stringify(decisionPayload), userId, String(req.params.id)]
    );

    await logAIDecision(pool, {
      conversationId: String(req.params.id),
      userId,
      brandId: req.brandId,
      decisionType: "mode_update",
      mode,
      summary: `Modo IA alterado para ${mode}${lockHuman ? " com lock" : " sem lock"}.`,
      payload: decisionPayload,
    });

    res.json({ success: true, ai: decisionPayload });
  } catch (error: any) {
    logger.error(error, "Error updating conversation ai state");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/ai-takeover
router.post("/conversations/:id/ai-takeover", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const decisionPayload = {
      event: "human_takeover",
      mode: "manual",
      lock_human: false,
      updated_by: userId,
      at: new Date().toISOString(),
    };

    await pool.execute(
      `UPDATE whatsapp_conversations
       SET ai_mode = 'manual', ai_lock_human = 0, ai_last_decision_json = ?, ai_updated_at = NOW(), ai_updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(decisionPayload), userId, String(req.params.id)]
    );

    await logAIDecision(pool, {
      conversationId: String(req.params.id),
      userId,
      brandId: req.brandId,
      decisionType: "human_takeover",
      mode: "manual",
      summary: "Operador assumiu atendimento manual.",
      payload: decisionPayload,
    });

    res.json({ success: true, ai: decisionPayload });
  } catch (error: any) {
    logger.error(error, "Error taking over conversation ai mode");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/ai-decisions
router.get("/conversations/:id/ai-decisions", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);
    const [rows] = await pool.query(
      `SELECT id, decision_type, mode, summary, payload_json, created_at
       FROM ai_conversation_decisions
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [String(req.params.id), limit]
    );

    const decisions = (rows as any[]).map((row) => ({
      id: String(row.id),
      decision_type: String(row.decision_type || ""),
      mode: normalizeAIMode(row.mode),
      summary: row.summary ? String(row.summary) : "",
      payload: row.payload_json ? JSON.parse(String(row.payload_json)) : null,
      created_at: row.created_at,
    }));

    res.json({ success: true, decisions });
  } catch (error: any) {
    logger.error(error, "Error listing ai decisions");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/ai-insights
router.get("/conversations/:id/ai-insights", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const [decisionRows] = await pool.query(
      `SELECT id, decision_type, mode, summary, payload_json, created_at
       FROM ai_conversation_decisions
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [String(req.params.id)]
    );

    const decisions = (decisionRows as any[]).map((row) => ({
      id: String(row.id),
      decision_type: String(row.decision_type || ""),
      mode: normalizeAIMode(row.mode),
      summary: row.summary ? String(row.summary) : "",
      payload: safeParseJson<Record<string, unknown>>(row.payload_json),
      created_at: row.created_at,
    }));

    const autonomousReplies = decisions.filter((item) => item.decision_type === "autonomous_reply").length;
    const autoEscalations = decisions.filter((item) => item.decision_type === "auto_escalation").length;
    const humanTakeovers = decisions.filter((item) => item.decision_type === "human_takeover").length;
    const humanBlocked = decisions.filter((item) => item.decision_type === "human_blocked").length;
    const modeChanges = decisions.filter((item) => item.decision_type === "mode_update").length;

    const [messageRows] = await pool.query<RowDataPacket[]>(
      `SELECT
          SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS inbound_count,
          SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS outbound_count
       FROM whatsapp_messages
       WHERE conversation_id = ?`,
      [String(req.params.id)]
    );

    const inboundCount = Number((messageRows?.[0] as any)?.inbound_count || 0);
    const outboundCount = Number((messageRows?.[0] as any)?.outbound_count || 0);
    const autonomyCoverage = inboundCount > 0 ? Math.min(1, autonomousReplies / inboundCount) : 0;
    const escalationRate = inboundCount > 0 ? Math.min(1, autoEscalations / inboundCount) : 0;

    const latestEscalation = decisions.find((item) => item.decision_type === "auto_escalation");
    const latestEscalationPayload = latestEscalation?.payload || null;
    const escalationReason = latestEscalationPayload
      ? String(
          (latestEscalationPayload.reason as string) ||
          (latestEscalationPayload.trigger as string) ||
          latestEscalation?.summary ||
          ""
        )
      : "";

    const scoreRaw =
      50 +
      Math.min(30, autonomousReplies * 4) -
      Math.min(26, autoEscalations * 13) -
      Math.min(12, humanBlocked * 3) +
      (humanTakeovers > 0 ? 4 : 0);
    const qualityScore = Math.max(0, Math.min(100, Math.round(scoreRaw)));

    res.json({
      success: true,
      insights: {
        conversation_id: String(req.params.id),
        mode: normalizeAIMode(conv.ai_mode),
        lock_human: parseBooleanInput(conv.ai_lock_human, true),
        quality_score: qualityScore,
        autonomy_coverage: autonomyCoverage,
        escalation_rate: escalationRate,
        totals: {
          inbound_messages: inboundCount,
          outbound_messages: outboundCount,
          autonomous_replies: autonomousReplies,
          auto_escalations: autoEscalations,
          human_takeovers: humanTakeovers,
          human_blocked_attempts: humanBlocked,
          mode_changes: modeChanges,
        },
        handoff_summary: latestEscalation
          ? {
              happened: true,
              at: latestEscalation?.created_at || null,
              reason: escalationReason || "Escalonamento automatico para humano.",
            }
          : {
              happened: false,
              at: null,
              reason: "Sem escalonamentos automaticos registrados.",
            },
      },
    });
  } catch (error: any) {
    logger.error(error, "Error fetching conversation ai insights");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/ai-respond
router.post("/conversations/:id/ai-respond", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const conv = await getOwnedConversation(pool, String(req.params.id), userId, req.brandId);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const globalState = await getGlobalAIState(pool, req.brandId);
    if (!globalState.enabled) {
      return res.status(409).json({
        error: "Atendimento Automatico globalmente desabilitado para esta marca.",
        code: "AI_GLOBAL_DISABLED",
      });
    }

    const mode = normalizeAIMode(conv.ai_mode);
    if (mode === "manual") {
      return res.status(409).json({ error: "Conversation is in manual mode", code: "AI_MODE_MANUAL" });
    }

    const [messagesRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, body, from_me, message_timestamp
       FROM whatsapp_messages
       WHERE conversation_id = ?
       ORDER BY message_timestamp DESC, created_at DESC, id DESC
       LIMIT 20`,
      [String(req.params.id)]
    );

    const recent = (messagesRows as any[]).reverse();
    const latestIncoming = [...recent]
      .reverse()
      .find((item) => !parseFromMeFlag(item.from_me) && String(item.body || "").trim());
    if (!latestIncoming) {
      return res.json({ success: true, skipped: true, reason: "no_incoming_message" });
    }

    if (String(conv.ai_last_incoming_message_id || "") === String(latestIncoming.id)) {
      return res.json({ success: true, skipped: true, reason: "already_handled" });
    }

    const context = recent
      .slice(-12)
      .map((item) => `${parseFromMeFlag(item.from_me) ? "Atendente" : "Lead"}: ${String(item.body || "")}`)
      .join("\n");

    const activeCompanyId = String(req.brandId || "").trim() || undefined;
    const profile = await aiAgentProfileService.getByUserId(userId, activeCompanyId);
    const [kbContext, behaviorBlock] = await Promise.all([
      knowledgeBaseService.searchForContext(String(latestIncoming.body || ""), userId, activeCompanyId || profile.company_id),
      Promise.resolve(aiAgentProfileService.buildBehaviorBlock(profile)),
    ]);

    const mergedContext = [
      context,
      behaviorBlock,
      kbContext ? `Base de conhecimento relevante:\n${kbContext}` : "",
    ].filter(Boolean).join("\n\n");

    const aiText = await aiService.generateCustomMessage(String(latestIncoming.body || ""), {
      tone: profile.tone,
      context: mergedContext,
      maxLength: profile.max_length,
      language: profile.language,
      includeEmojis: profile.include_emojis,
      agentName: profile.agent_name,
      objective: profile.objective,
      communicationRules: profile.communication_rules,
      trainingNotes: profile.training_notes,
      preferredTerms: profile.preferred_terms,
      forbiddenTerms: profile.forbidden_terms,
    });

    const finalText = String(aiText || "").trim();
    if (!finalText) {
      return res.status(500).json({ error: "Failed to generate autonomous reply" });
    }

    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    const sent = await instanceManager.sendMessageByJid(conv.instance_id, conv.remote_jid, finalText);
    if (!sent) return res.status(500).json({ error: "Failed to send autonomous reply" });

    const msgId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);
    await pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, conv.id, conv.instance_id, conv.remote_jid, finalText, now]
    );

    const decisionPayload = {
      event: "autonomous_reply",
      mode,
      incoming_message_id: String(latestIncoming.id),
      outgoing_message_id: msgId,
      model: "gemini-2.0-flash",
      at: new Date().toISOString(),
    };

    await pool.execute(
      `UPDATE whatsapp_conversations
       SET last_message_text = ?,
           last_message_at = NOW(),
           last_message_from_me = 1,
           ai_last_incoming_message_id = ?,
           ai_last_reply_message_id = ?,
           ai_last_decision_json = ?,
           ai_updated_at = NOW(),
           ai_updated_by = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        finalText.slice(0, 500),
        String(latestIncoming.id),
        msgId,
        JSON.stringify(decisionPayload),
        userId,
        conv.id,
      ]
    );

    await logAIDecision(pool, {
      conversationId: String(conv.id),
      userId,
      brandId: req.brandId,
      decisionType: "autonomous_reply",
      mode,
      summary: "IA enviou resposta autonoma.",
      payload: decisionPayload,
    });

    res.json({
      success: true,
      sent: true,
      message: {
        id: msgId,
        body: finalText,
        from_me: true,
        message_timestamp: now,
      },
    });
  } catch (error: any) {
    logger.error(error, "Error sending autonomous ai response");
    res.status(500).json({ error: error.message });
  }
});

export default router;

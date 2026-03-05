import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { extractIncomingMessageData } from "../utils/whatsappMessage";
import { AIService } from "./ai";
import { AIAgentProfileService } from "./aiAgentProfile";
import { KnowledgeBaseService } from "./knowledgeBase";
import { ProductsService } from "./products";

type MediaDownloadResult = {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  mediaType: "image" | "video" | "audio" | "document";
};

export class InboxService {
  private mediaDownloader?: (instanceId: string, msg: any) => Promise<MediaDownloadResult | null>;
  private messageSender?: (instanceId: string, jid: string, message: string) => Promise<boolean>;
  private senderNameColumnExists: boolean | null = null;
  private aiColumnsChecked = false;
  private readonly aiService = new AIService();
  private readonly aiAgentProfileService = new AIAgentProfileService();
  private readonly knowledgeBaseService = new KnowledgeBaseService();
  private readonly productsService = new ProductsService();
  private productsUserScopeReady: boolean | null = null;

  private normalizeAIMode(value: unknown): "manual" | "autonomous" | "supervised" {
    const normalized = String(value || "manual").trim().toLowerCase();
    if (normalized === "manual" || normalized === "autonomous" || normalized === "supervised") return normalized;
    return "manual";
  }

  private async ensureProductsUserScope(): Promise<boolean> {
    if (this.productsUserScopeReady !== null) return this.productsUserScopeReady;

    const pool = getPool();
    const [rows] = await pool.query("SHOW COLUMNS FROM products LIKE 'user_id'");
    this.productsUserScopeReady = Array.isArray(rows) && rows.length > 0;
    return this.productsUserScopeReady;
  }

  private buildProductsContextBlock(products: any[]): string {
    const lines = products
      .slice(0, 12)
      .map((product, index) => {
        const name = String(product?.name || "").trim();
        const category = String(product?.category || "").trim();
        const price = Number(product?.price || 0);
        const promoPrice = Number(product?.promoPrice || 0);
        const unit = String(product?.unit || "").trim();
        const features = Array.isArray(product?.features)
          ? product.features.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 3)
          : [];

        const priceLabel = promoPrice > 0
          ? `R$ ${promoPrice.toFixed(2)} (promo, de R$ ${price.toFixed(2)})`
          : `R$ ${price.toFixed(2)}`;
        const base = [name, category ? `categoria ${category}` : "", price > 0 ? priceLabel : "", unit ? `unidade ${unit}` : ""]
          .filter(Boolean)
          .join(" | ");
        const extra = features.length ? ` | destaques: ${features.join(", ")}` : "";
        return `${index + 1}. ${base}${extra}`;
      });

    if (!lines.length) return "";
    return [
      "CATALOGO_DA_BRAND (fonte oficial para respostas):",
      ...lines,
      "REGRA: use apenas itens deste catalogo quando citar produto/preco/categoria. Se nao existir no catalogo, diga que vai confirmar e faca pergunta objetiva.",
    ].join("\n");
  }

  private async getProductsContext(userId?: string, brandId?: string | null): Promise<string> {
    if (!userId) return "";

    const normalizedBrandId = String(brandId || "").trim() || null;
    try {
      const hasUserScope = await this.ensureProductsUserScope();
      const products = hasUserScope
        ? await this.productsService.getActiveProducts(userId, normalizedBrandId)
        : await this.productsService.getActiveProducts(undefined, normalizedBrandId);
      return this.buildProductsContextBlock(products);
    } catch (error: any) {
      logger.warn(`Failed to load product context for inbox AI: ${error?.message || error}`);
      return "";
    }
  }

  private parseBool(value: unknown, fallback = false): boolean {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const normalized = String(value).trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }

  private parseFromMeFlag(value: unknown): boolean {
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

  private shouldEscalateToHuman(message: string): { shouldEscalate: boolean; reason?: string } {
    const text = String(message || "").toLowerCase();
    if (!text) return { shouldEscalate: false };

    const explicitHuman = [
      "quero falar com humano",
      "quero falar com atendente",
      "falar com atendente",
      "falar com vendedor",
      "atendimento humano",
      "me passa para humano",
      "transferir para humano",
    ];

    if (explicitHuman.some((term) => text.includes(term))) {
      return { shouldEscalate: true, reason: "pedido_explicito_humano" };
    }

    const sensitiveTerms = ["procon", "advogado", "processo", "reclama", "cancelamento", "estorno"];
    if (sensitiveTerms.some((term) => text.includes(term))) {
      return { shouldEscalate: true, reason: "tema_sensivel" };
    }

    return { shouldEscalate: false };
  }

  private async ensureAIColumns(pool: any): Promise<void> {
    if (this.aiColumnsChecked) return;

    const ensureColumn = async (column: string, ddl: string) => {
      const [rows] = await pool.query(`SHOW COLUMNS FROM whatsapp_conversations LIKE ?`, [column]);
      if (!Array.isArray(rows) || rows.length === 0) {
        await pool.execute(`ALTER TABLE whatsapp_conversations ADD COLUMN ${ddl}`);
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
      // no-op in case engine/version doesn't allow modify style
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

    this.aiColumnsChecked = true;
  }

  private async isGlobalAIEnabled(pool: any, brandId?: string | null): Promise<boolean> {
    const normalizedBrandId = String(brandId || "").trim();
    if (!normalizedBrandId) return false;

    await this.ensureAIColumns(pool);
    const [rows] = await pool.query(
      `SELECT auto_reply_enabled
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
      return false;
    }

    return this.parseBool(row.auto_reply_enabled, false);
  }

  private async logAIDecision(
    pool: any,
    input: {
      conversationId: string;
      userId?: string;
      brandId?: string | null;
      decisionType: string;
      mode: "manual" | "autonomous" | "supervised";
      summary?: string;
      payload?: Record<string, unknown>;
    }
  ): Promise<void> {
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

  private async tryAutonomousReply(input: {
    pool: any;
    instanceId: string;
    conversationId: string;
    remoteJid: string;
    incomingMessageId: string;
    incomingBody: string;
    aiMode: "manual" | "autonomous" | "supervised";
  }): Promise<void> {
    if (!this.messageSender) return;
    if (input.aiMode === "manual") return;

    const [convRows] = await input.pool.execute(
      `SELECT ai_mode, ai_lock_human, ai_last_incoming_message_id
       FROM whatsapp_conversations WHERE id = ? LIMIT 1`,
      [input.conversationId]
    );
    const conv = convRows?.[0];
    const mode = this.normalizeAIMode(conv?.ai_mode);
    if (mode === "manual") return;
    if (String(conv?.ai_last_incoming_message_id || "") === String(input.incomingMessageId)) return;

    const escalation = this.shouldEscalateToHuman(input.incomingBody);
    const [ownerRows] = await input.pool.execute(
      "SELECT created_by, brand_id FROM whatsapp_instances WHERE id = ? LIMIT 1",
      [input.instanceId]
    );
    const owner = ownerRows?.[0] || {};
    const userId = String(owner.created_by || "").trim() || undefined;
    const brandId = String(owner.brand_id || "").trim() || null;

    if (!brandId) {
      const payload = {
        event: "auto_escalation",
        reason: "brand_scope_missing",
        incoming_message_id: input.incomingMessageId,
        at: new Date().toISOString(),
      };

      await input.pool.execute(
        `UPDATE whatsapp_conversations
         SET ai_mode = 'manual',
             ai_lock_human = 0,
             ai_last_incoming_message_id = ?,
             ai_last_decision_json = ?,
             ai_updated_at = NOW(),
             ai_updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [input.incomingMessageId, JSON.stringify(payload), userId || null, input.conversationId]
      );

      await this.logAIDecision(input.pool, {
        conversationId: input.conversationId,
        userId,
        brandId: null,
        decisionType: "auto_escalation",
        mode: "manual",
        summary: "Escalonado para humano: instancia sem brand_id (isolamento estrito).",
        payload,
      });
      return;
    }

    const globalAIEnabled = await this.isGlobalAIEnabled(input.pool, brandId);
    if (!globalAIEnabled) {
      const payload = {
        event: "global_ai_disabled_skip",
        incoming_message_id: input.incomingMessageId,
        mode,
        at: new Date().toISOString(),
      };

      await this.logAIDecision(input.pool, {
        conversationId: input.conversationId,
        userId,
        brandId,
        decisionType: "global_disabled_skip",
        mode,
        summary: "Resposta autonoma ignorada: atendimento automatico global desabilitado.",
        payload,
      });
      return;
    }

    if (escalation.shouldEscalate) {
      const payload = {
        event: "auto_escalation",
        reason: escalation.reason,
        incoming_message_id: input.incomingMessageId,
        summary: {
          interesse: "avaliar",
          duvidas: input.incomingBody.slice(0, 200),
          objecoes: escalation.reason === "tema_sensivel" ? ["sensivel"] : ["pedido_humano"],
          temperatura: escalation.reason === "tema_sensivel" ? "quente" : "morno",
        },
        at: new Date().toISOString(),
      };

      await input.pool.execute(
        `UPDATE whatsapp_conversations
         SET ai_mode = 'manual',
             ai_lock_human = 0,
             ai_last_incoming_message_id = ?,
             ai_last_decision_json = ?,
             ai_updated_at = NOW(),
             ai_updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [input.incomingMessageId, JSON.stringify(payload), userId || null, input.conversationId]
      );

      await this.logAIDecision(input.pool, {
        conversationId: input.conversationId,
        userId,
        brandId,
        decisionType: "auto_escalation",
        mode: "manual",
        summary: `Escalonado para humano (${escalation.reason}).`,
        payload,
      });
      return;
    }

    const [messagesRows] = await input.pool.query(
      `SELECT body, from_me
       FROM whatsapp_messages
       WHERE conversation_id = ?
       ORDER BY message_timestamp DESC, created_at DESC, id DESC
       LIMIT 12`,
      [input.conversationId]
    );
    const context = [...(messagesRows || [])]
      .reverse()
      .map((item: any) => `${this.parseFromMeFlag(item.from_me) ? "Atendente" : "Lead"}: ${String(item.body || "")}`)
      .join("\n");

    let finalText = "";
    if (userId) {
      const profile = await this.aiAgentProfileService.getByUserId(userId, brandId || undefined);
      const [kbContext, behaviorBlock, productsContext] = await Promise.all([
        this.knowledgeBaseService.searchForContext(input.incomingBody, userId, brandId || profile.company_id),
        Promise.resolve(this.aiAgentProfileService.buildBehaviorBlock(profile)),
        this.getProductsContext(userId, brandId),
      ]);

      const mergedContext = [
        context,
        behaviorBlock,
        productsContext,
        kbContext ? `Base de conhecimento relevante:\n${kbContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      finalText = await this.aiService.generateCustomMessage(input.incomingBody, {
        tone: profile.tone,
        context: mergedContext,
        maxLength: profile.max_length,
        language: profile.language,
        includeEmojis: profile.include_emojis,
        agentName: profile.agent_name,
        objective: profile.objective,
        trainingNotes: profile.training_notes,
        preferredTerms: profile.preferred_terms,
        forbiddenTerms: profile.forbidden_terms,
        communicationRules: [
          String(profile.communication_rules || "").trim(),
          "Nao inventar produtos, precos, promocoes ou disponibilidade. Usar somente o catalogo da brand no contexto.",
          "Se o lead pedir item nao presente no catalogo, informar que vai confirmar internamente e fazer pergunta de qualificacao.",
        ].filter(Boolean).join("\n"),
      });
    } else {
      finalText = await this.aiService.generateCustomMessage(input.incomingBody, {
        tone: "professional",
        context,
      });
    }

    finalText = String(finalText || "").trim();
    if (!finalText) return;

    const sent = await this.messageSender(input.instanceId, input.remoteJid, finalText);
    if (!sent) return;

    const msgId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);
    await input.pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, input.conversationId, input.instanceId, input.remoteJid, finalText, now]
    );

    const payload = {
      event: "autonomous_reply",
      incoming_message_id: input.incomingMessageId,
      outgoing_message_id: msgId,
      mode,
      at: new Date().toISOString(),
    };

    await input.pool.execute(
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
        input.incomingMessageId,
        msgId,
        JSON.stringify(payload),
        userId || null,
        input.conversationId,
      ]
    );

    await this.logAIDecision(input.pool, {
      conversationId: input.conversationId,
      userId,
      brandId,
      decisionType: "autonomous_reply",
      mode,
      summary: "IA enviou resposta autonoma (tempo real).",
      payload,
    });
  }

  private normalizeDigits(value?: string | null): string {
    return String(value || "").replace(/\D/g, "");
  }

  private extractPhoneFromJid(jid?: string | null): string {
    const raw = String(jid || "").trim();
    if (!raw) return "";

    const [left] = raw.split("@");
    const [phone] = left.split(":");
    return this.normalizeDigits(phone);
  }

  private isSamePhone(a?: string | null, b?: string | null): boolean {
    const left = this.normalizeDigits(a);
    const right = this.normalizeDigits(b);
    if (!left || !right) return false;
    return left === right || left.endsWith(right) || right.endsWith(left);
  }

  private async getInstancePhone(pool: any, instanceId: string): Promise<string | null> {
    const [rows] = await pool.execute("SELECT phone FROM whatsapp_instances WHERE id = ? LIMIT 1", [
      instanceId,
    ]);
    const list = Array.isArray(rows) ? rows : [];
    return list[0]?.phone ? String(list[0].phone) : null;
  }

  private isSelfDirectConversation(remoteJid: string, instancePhone: string | null): boolean {
    if (!remoteJid || remoteJid.endsWith("@g.us")) return false;
    if (!instancePhone) return false;
    const remotePhone = this.extractPhoneFromJid(remoteJid);
    return this.isSamePhone(remotePhone, instancePhone);
  }

  private async ensureSenderNameColumn(pool: any): Promise<boolean> {
    if (this.senderNameColumnExists !== null) return this.senderNameColumnExists;

    try {
      const [rows] = await pool.query("SHOW COLUMNS FROM whatsapp_messages LIKE 'sender_name'");
      const found = Array.isArray(rows) && rows.length > 0;
      if (found) {
        this.senderNameColumnExists = true;
        return true;
      }

      await pool.execute("ALTER TABLE whatsapp_messages ADD COLUMN sender_name VARCHAR(255) NULL");
      this.senderNameColumnExists = true;
      return true;
    } catch {
      this.senderNameColumnExists = false;
      return false;
    }
  }

  setMediaDownloader(downloader: (instanceId: string, msg: any) => Promise<MediaDownloadResult | null>) {
    this.mediaDownloader = downloader;
  }

  setMessageSender(sender: (instanceId: string, jid: string, message: string) => Promise<boolean>) {
    this.messageSender = sender;
  }

  private getFileExtension(mimeType?: string, fileName?: string): string {
    if (fileName && fileName.includes(".")) {
      const ext = fileName.split(".").pop();
      if (ext) return ext.toLowerCase();
    }

    const mime = String(mimeType || "").toLowerCase();
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("wav")) return "wav";
    if (mime.includes("aac")) return "aac";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("pdf")) return "pdf";
    return "bin";
  }

  private persistIncomingMedia(
    msgId: string,
    mediaType: "image" | "video" | "audio" | "document",
    media: MediaDownloadResult
  ): string | null {
    try {
      const incomingDir = path.join(__dirname, "../../uploads/inbox-media/incoming");
      if (!fs.existsSync(incomingDir)) {
        fs.mkdirSync(incomingDir, { recursive: true });
      }

      const extension = this.getFileExtension(media.mimeType, media.fileName);
      const fileName = `${Date.now()}_${msgId}.${extension}`;
      const absolutePath = path.join(incomingDir, fileName);
      fs.writeFileSync(absolutePath, media.buffer);

      return `/uploads/inbox-media/incoming/${fileName}`;
    } catch (error: any) {
      logger.error(`Error persisting incoming ${mediaType}: ${error.message}`);
      return null;
    }
  }

  private getConversationPreview(messageType: string, body: string): string {
    const safeBody = (body || "").trim();

    const mediaMatch = safeBody.match(/^\[media:(image|video|audio|document)\]\s+[^\n]+(?:\n([\s\S]*))?$/i);
    if (mediaMatch) {
      const mediaType = mediaMatch[1].toLowerCase();
      const caption = (mediaMatch[2] || "").trim();
      if (caption) return caption.substring(0, 500);

      if (mediaType === "audio") return "🎧 Audio recebido";
      if (mediaType === "image") return "📷 Imagem recebida";
      if (mediaType === "video") return "🎬 Video recebido";
      if (mediaType === "document") return "📎 Documento recebido";
    }

    const pollMatch = safeBody.match(/^\[poll\]\s*(.+)$/i);
    if (pollMatch) {
      const question = String(pollMatch[1] || "").split(/\r?\n/)[0].trim();
      return `📊 Enquete: ${question || "nova enquete"}`.substring(0, 500);
    }

    const taggedReply = safeBody.match(
      /^\[(button_reply|list_reply|interactive_reply|option_reply|poll_vote)\]\s*(.+)$/i
    );
    if (taggedReply) {
      return String(taggedReply[2] || "Interacao recebida").substring(0, 500);
    }

    if (safeBody) return safeBody.substring(0, 500);

    if (messageType === "audio") return "🎧 Audio recebido";
    if (messageType === "image") return "📷 Imagem recebida";
    if (messageType === "video") return "🎬 Video recebido";
    if (messageType === "document") return "📎 Documento recebido";
    if (messageType === "sticker") return "🙂 Figurinha recebida";
    if (messageType === "location") return "📍 Localizacao recebida";
    if (messageType === "contact") return "👤 Contato recebido";
    return "Nova mensagem";
  }

  // Handle incoming message - save to DB
  async handleIncomingMessage(instanceId: string, msg: any): Promise<void> {
    try {
      const pool = getPool();
      await this.ensureAIColumns(pool);
      const remoteJid = msg?.key?.remoteJid;
      if (!remoteJid || remoteJid === "status@broadcast") return;

      const isGroup = remoteJid.endsWith("@g.us");
      let fromMe = Boolean(msg?.key?.fromMe ?? msg?.fromMe);
      const senderJid = msg?.key?.participant || remoteJid;
      const pushName = msg.pushName || null;
      const senderName = !fromMe && !isGroup ? (pushName ? String(pushName) : null) : null;
      const instancePhone = await this.getInstancePhone(pool, instanceId);

      // Ignore self-chat noise created by sync/login events
      if (this.isSelfDirectConversation(String(remoteJid), instancePhone)) {
        return;
      }

      if (isGroup && !fromMe) {
        const participantPhone = this.extractPhoneFromJid(msg?.key?.participant);
        if (this.isSamePhone(participantPhone, instancePhone)) {
          fromMe = true;
        }
      }

      // Extract message body
      let body = "";
      let messageType = "text";
      let mediaUrlForDb: string | null = null;
      let mediaMimeForDb: string | null = null;
      let mediaFileNameForDb: string | null = null;
      let mediaSizeForDb: number | null = null;
      let captionForDb: string | null = null;
      const extracted = extractIncomingMessageData(msg.message || {});
      body = extracted.body;
      messageType = extracted.messageType;

      // Save message id early for media persistence naming
      const msgId = msg?.key?.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Download and persist incoming media for stable playback/rendering
      if (
        !fromMe &&
        this.mediaDownloader
      ) {
        const media = await this.mediaDownloader(instanceId, msg);
        if (media?.buffer) {
          const knownMediaTypes = ["audio", "image", "video", "document"] as const;
          const isKnownMessageMedia = (knownMediaTypes as readonly string[]).includes(messageType);
          const resolvedMediaType = (isKnownMessageMedia
            ? messageType
            : media.mediaType) as "image" | "video" | "audio" | "document";

          messageType = resolvedMediaType;
          const mediaUrl = this.persistIncomingMedia(msgId, resolvedMediaType, media);
          if (mediaUrl) {
            const caption = (body || "").trim();
            mediaUrlForDb = mediaUrl;
            mediaMimeForDb = media.mimeType || null;
            mediaFileNameForDb = media.fileName || null;
            mediaSizeForDb = media.buffer.length;
            captionForDb = caption || null;
            body = `[media:${resolvedMediaType}] ${mediaUrl}${caption ? `\n${caption}` : ""}`;
          }
        }
      }

      const normalizedBody = String(body || "").trim();
      const isRenderableMediaType = ["audio", "image", "video", "document"].includes(String(messageType || ""));
      const hasRenderablePayload = Boolean(normalizedBody) || Boolean(mediaUrlForDb) || isRenderableMediaType;
      if (!hasRenderablePayload) {
        // Ignore protocol/placeholder/system events without user-facing content
        return;
      }

      // Get or create conversation
      const [existingConv] = await pool.execute<any[]>(
        "SELECT id, unread_count, ai_mode, ai_lock_human, ai_last_incoming_message_id FROM whatsapp_conversations WHERE instance_id = ? AND remote_jid = ?",
        [instanceId, remoteJid]
      );

      let conversationId: string;
      let conversationAIMode: "manual" | "autonomous" | "supervised" = "autonomous";
      if (existingConv.length > 0) {
        conversationId = existingConv[0].id;
        conversationAIMode = this.normalizeAIMode(existingConv[0].ai_mode);
        const unread = fromMe ? 0 : (existingConv[0].unread_count || 0) + 1;
        const previewText = this.getConversationPreview(messageType, body);
        
        // Update conversation
        const updateFields: string[] = [
          "last_message_text = ?",
          "last_message_at = NOW()",
          "last_message_from_me = ?",
          "updated_at = NOW()",
        ];
        const updateParams: any[] = [previewText, fromMe ? 1 : 0];

        if (!fromMe) {
          updateFields.push("unread_count = ?");
          updateParams.push(unread);
          if (pushName) {
            updateFields.push("contact_push_name = ?");
            updateParams.push(pushName);
          }
        }

        updateParams.push(conversationId);
        await pool.execute(
          `UPDATE whatsapp_conversations SET ${updateFields.join(", ")} WHERE id = ?`,
          updateParams
        );
      } else {
        // Create new conversation
        conversationId = uuidv4();
        const contactPhone = isGroup
          ? String(remoteJid).split("@")[0]
          : this.extractPhoneFromJid(remoteJid);
        const initialContactName = isGroup
          ? contactPhone || String(remoteJid)
          : (!fromMe && pushName ? String(pushName) : (contactPhone || String(remoteJid)));
        const previewText = this.getConversationPreview(messageType, body);
        await pool.execute(
          `INSERT INTO whatsapp_conversations 
           (id, instance_id, remote_jid, contact_name, contact_phone, contact_push_name, is_group, status, last_message_text, last_message_at, last_message_from_me, unread_count, pipeline_stage, ai_mode, ai_lock_human, ai_updated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NOW(), ?, ?, 'new', 'autonomous', 1, NOW(), NOW(), NOW())`,
          [
            conversationId,
            instanceId,
            remoteJid,
            initialContactName,
            contactPhone,
            !fromMe ? pushName : null,
            isGroup ? 1 : 0,
            previewText,
            fromMe ? 1 : 0,
            fromMe ? 0 : 1
          ]
        );
      }

      // Save message
      const timestamp = msg.messageTimestamp ? (typeof msg.messageTimestamp === 'object' ? msg.messageTimestamp.low : msg.messageTimestamp) : Math.floor(Date.now() / 1000);

      // Check if message already exists (dedup)
      const [existingMsg] = await pool.execute<any[]>(
        "SELECT id FROM whatsapp_messages WHERE id = ?",
        [msgId]
      );
      if (existingMsg.length > 0) return;

      const hasSenderNameColumn = await this.ensureSenderNameColumn(pool);

      const fields = [
        "id",
        "conversation_id",
        "instance_id",
        "remote_jid",
        "from_me",
        "sender_jid",
      ];
      const values: any[] = [
        msgId,
        conversationId,
        instanceId,
        remoteJid,
        fromMe ? 1 : 0,
        senderJid,
      ];

      if (hasSenderNameColumn) {
        fields.push("sender_name");
        values.push(senderName);
      }

      fields.push(
        "message_type",
        "body",
        "caption",
        "media_url",
        "media_mimetype",
        "media_filename",
        "media_size",
        "status",
        "message_timestamp",
        "created_at"
      );
      values.push(
        messageType,
        body,
        captionForDb,
        mediaUrlForDb,
        mediaMimeForDb,
        mediaFileNameForDb,
        mediaSizeForDb,
        fromMe ? "sent" : "delivered",
        timestamp
      );

      const placeholders = fields.map((field) => (field === "created_at" ? "NOW()" : "?")).join(", ");

      await pool.execute(
        `INSERT INTO whatsapp_messages (${fields.join(", ")}) VALUES (${placeholders})`,
        values
      );

      if (!fromMe && !isGroup) {
        await this.tryAutonomousReply({
          pool,
          instanceId,
          conversationId,
          remoteJid: String(remoteJid),
          incomingMessageId: msgId,
          incomingBody: String(body || ""),
          aiMode: conversationAIMode,
        });
      }

      logger.info(`Message saved: ${msgId} in conversation ${conversationId}`);
    } catch (error: any) {
      logger.error(`Error saving message: ${error.message}`);
    }
  }
}

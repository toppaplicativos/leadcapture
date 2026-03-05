import { getPool } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

type MediaDownloadResult = {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  mediaType: "image" | "video" | "audio" | "document";
};

export class InboxService {
  private mediaDownloader?: (instanceId: string, msg: any) => Promise<MediaDownloadResult | null>;

  setMediaDownloader(downloader: (instanceId: string, msg: any) => Promise<MediaDownloadResult | null>) {
    this.mediaDownloader = downloader;
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
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid === "status@broadcast") return;

      const isGroup = remoteJid.endsWith("@g.us");
      const fromMe = msg.key.fromMe || false;
      const senderJid = msg.key.participant || remoteJid;
      const pushName = msg.pushName || null;

      // Extract message body
      let body = "";
      let messageType = "text";
      const m = msg.message;
      if (m) {
        if (m.conversation) { body = m.conversation; messageType = "text"; }
        else if (m.extendedTextMessage?.text) { body = m.extendedTextMessage.text; messageType = "text"; }
        else if (m.imageMessage) { body = m.imageMessage.caption || ""; messageType = "image"; }
        else if (m.videoMessage) { body = m.videoMessage.caption || ""; messageType = "video"; }
        else if (m.audioMessage) { body = ""; messageType = "audio"; }
        else if (m.documentMessage) { body = m.documentMessage.fileName || ""; messageType = "document"; }
        else if (m.stickerMessage) { messageType = "sticker"; }
        else if (m.locationMessage) { messageType = "location"; }
        else if (m.contactMessage) { messageType = "contact"; }
        else if (m.reactionMessage) { messageType = "reaction"; body = m.reactionMessage.text || ""; }
        else { messageType = "other"; }
      }

      // Save message id early for media persistence naming
      const msgId = msg.key.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Download and persist incoming media for stable playback/rendering
      if (
        !fromMe &&
        this.mediaDownloader &&
        (messageType === "audio" || messageType === "image" || messageType === "video" || messageType === "document")
      ) {
        const media = await this.mediaDownloader(instanceId, msg);
        if (media?.buffer) {
          const mediaUrl = this.persistIncomingMedia(msgId, messageType as "image" | "video" | "audio" | "document", media);
          if (mediaUrl) {
            const caption = (body || "").trim();
            body = `[media:${messageType}] ${mediaUrl}${caption ? `\n${caption}` : ""}`;
          }
        }
      }

      // Get or create conversation
      const [existingConv] = await pool.execute<any[]>(
        "SELECT id, unread_count FROM whatsapp_conversations WHERE instance_id = ? AND remote_jid = ?",
        [instanceId, remoteJid]
      );

      let conversationId: string;
      if (existingConv.length > 0) {
        conversationId = existingConv[0].id;
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
        const contactPhone = remoteJid.split("@")[0];
        const previewText = this.getConversationPreview(messageType, body);
        await pool.execute(
          `INSERT INTO whatsapp_conversations 
           (id, instance_id, remote_jid, contact_name, contact_phone, contact_push_name, is_group, status, last_message_text, last_message_at, last_message_from_me, unread_count, pipeline_stage, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, NOW(), ?, ?, 'new', NOW(), NOW())`,
          [conversationId, instanceId, remoteJid, pushName || contactPhone, contactPhone, pushName, isGroup ? 1 : 0, previewText, fromMe ? 1 : 0, fromMe ? 0 : 1]
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

      await pool.execute(
        `INSERT INTO whatsapp_messages 
         (id, conversation_id, instance_id, remote_jid, from_me, sender_jid, message_type, body, status, message_timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [msgId, conversationId, instanceId, remoteJid, fromMe ? 1 : 0, senderJid, messageType, body, fromMe ? 'sent' : 'delivered', timestamp]
      );

      logger.info(`Message saved: ${msgId} in conversation ${conversationId}`);
    } catch (error: any) {
      logger.error(`Error saving message: ${error.message}`);
    }
  }
}

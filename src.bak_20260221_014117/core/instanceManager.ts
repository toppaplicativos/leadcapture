import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { WhatsAppInstance } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";
import { getPool } from "../config/database";
import pino from "pino";

export class InstanceManager {
  private instances: Map<string, WhatsAppInstance> = new Map();
  private instanceOwners: Map<string, string | null> = new Map();
  private sockets: Map<string, WASocket> = new Map();
  private messageHandlers: Map<string, (msg: any) => void> = new Map();
  private globalMessageHandlers: Array<(instanceId: string, msg: any) => void> = [];
  private retryCount: Map<string, number> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private mediaLogger = pino({ level: "silent" }) as any;
  private static MAX_RETRIES = 5;
  private static BASE_DELAY = 5000; // 5s base, exponential backoff

  constructor() {
    if (!fs.existsSync(config.authDir)) {
      fs.mkdirSync(config.authDir, { recursive: true });
    }
  }

  // ==================== AUTO-RESTORE ON STARTUP ====================
  async restoreAllSessions(): Promise<void> {
    try {
      const pool = getPool();
      const [rows] = await pool.execute<any[]>(
        "SELECT id, name, phone, status, created_by FROM whatsapp_instances WHERE status IN ('connected', 'connecting')"
      );

      if (rows.length === 0) {
        // Also check auth dirs for orphaned sessions
        const authDirs = fs.readdirSync(config.authDir).filter(d => {
          const fullPath = path.join(config.authDir, d);
          return fs.statSync(fullPath).isDirectory() && 
                 fs.existsSync(path.join(fullPath, 'creds.json'));
        });
        
        if (authDirs.length > 0) {
          logger.info(`Found ${authDirs.length} orphaned auth dirs, checking DB for matching instances...`);
          // Check if these exist in DB at all (even disconnected)
          for (const dirId of authDirs) {
            const [dbRows] = await pool.execute<any[]>(
              "SELECT id, name, phone, status, created_by FROM whatsapp_instances WHERE id = ?",
              [dirId]
            );
            if (dbRows.length > 0) {
              const inst = dbRows[0];
              this.instanceOwners.set(inst.id, inst.created_by || null);
              logger.info(`Restoring orphaned instance: ${inst.name} (${inst.id})`);
              this.instances.set(inst.id, {
                id: inst.id,
                name: inst.name,
                status: "disconnected",
                phone: inst.phone || undefined,
                createdAt: new Date(),
                messagessSent: 0,
                messagesReceived: 0,
              });
              // Try to reconnect
              this.safeConnect(inst.id);
            }
          }
        }
        return;
      }

      logger.info(`Restoring ${rows.length} WhatsApp sessions...`);
      for (const row of rows) {
        const authPath = path.join(config.authDir, row.id);
        if (!fs.existsSync(path.join(authPath, 'creds.json'))) {
          logger.warn(`No auth files for instance ${row.name} (${row.id}), marking disconnected`);
          await pool.execute(
            "UPDATE whatsapp_instances SET status = 'disconnected' WHERE id = ?",
            [row.id]
          );
          continue;
        }

        // Load into memory
        this.instanceOwners.set(row.id, row.created_by || null);
        this.instances.set(row.id, {
          id: row.id,
          name: row.name,
          status: "disconnected",
          phone: row.phone || undefined,
          createdAt: new Date(),
          messagessSent: 0,
          messagesReceived: 0,
        });

        // Stagger reconnections to avoid overwhelming WhatsApp
        const delay = Array.from(this.instances.keys()).indexOf(row.id) * 3000;
        setTimeout(() => this.safeConnect(row.id), delay + 2000);
      }
    } catch (error: any) {
      logger.error(`Error restoring sessions: ${error.message}`);
    }
  }

  // Safe connect wrapper with error handling
  private async safeConnect(id: string): Promise<void> {
    try {
      await this.connectInstance(id);
    } catch (err: any) {
      logger.error(`Failed to restore instance ${id}: ${err.message}`);
    }
  }

  // ==================== DB SYNC HELPERS ====================
  private async syncInstanceToDB(instance: WhatsAppInstance): Promise<void> {
    try {
      const pool = getPool();
      const ownerUserId = this.instanceOwners.get(instance.id) || null;
      const [existing] = await pool.execute<any[]>(
        "SELECT id FROM whatsapp_instances WHERE id = ?",
        [instance.id]
      );

      if (existing.length > 0) {
        await pool.execute(
          `UPDATE whatsapp_instances SET name = ?, phone = ?, status = ?, 
           created_by = COALESCE(created_by, ?),
           last_connected_at = CASE WHEN ? = 'connected' THEN NOW() ELSE last_connected_at END,
           updated_at = NOW() WHERE id = ?`,
          [instance.name, instance.phone || null, instance.status, ownerUserId, instance.status, instance.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO whatsapp_instances (id, name, phone, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [instance.id, instance.name, instance.phone || null, instance.status, ownerUserId]
        );
      }
    } catch (err: any) {
      logger.error(`DB sync error for ${instance.id}: ${err.message}`);
    }
  }

  // ==================== INSTANCE LIFECYCLE ====================
  async createInstance(name: string, ownerUserId?: string): Promise<WhatsAppInstance> {
    const id = uuidv4();
    const instance: WhatsAppInstance = {
      id,
      name,
      status: "disconnected",
      createdAt: new Date(),
      messagessSent: 0,
      messagesReceived: 0,
    };
    this.instanceOwners.set(id, ownerUserId || null);
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);
    logger.info(`Instance created: ${name} (${id})`);
    return instance;
  }

  async connectInstance(id: string): Promise<string | null> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error("Instance not found");

    // CRITICAL: Clean up existing socket before creating new one
    await this.cleanupSocket(id);

    const authPath = path.join(config.authDir, id);
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    instance.status = "connecting";
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);

    return new Promise((resolve, reject) => {
      let resolved = false;

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
        browser: ["Lead System", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        retryRequestDelayMs: 500,
        qrTimeout: 40000,
        markOnlineOnConnect: false,
      });

      this.sockets.set(id, sock);
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
            instance.qrCode = qrDataUrl;
            instance.status = "qr_ready";
            this.instances.set(id, instance);
            await this.syncInstanceToDB(instance);
            logger.info(`QR Code generated for instance: ${instance.name}`);
            if (!resolved) {
              resolved = true;
              resolve(qrDataUrl);
            }
          } catch (err) {
            logger.error(`QR generation error: ${err}`);
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const retries = this.retryCount.get(id) || 0;

          logger.info(`Connection closed for ${instance.name}. Status: ${statusCode}. Retries: ${retries}/${InstanceManager.MAX_RETRIES}`);

          instance.status = "disconnected";
          instance.qrCode = undefined;
          this.instances.set(id, instance);
          await this.syncInstanceToDB(instance);

          // Handle specific disconnect reasons
          if (statusCode === DisconnectReason.loggedOut) {
            // User logged out - clean auth files
            logger.info(`Instance ${instance.name} logged out. Cleaning auth files.`);
            this.retryCount.delete(id);
            const authPath = path.join(config.authDir, id);
            if (fs.existsSync(authPath)) {
              fs.rmSync(authPath, { recursive: true });
            }
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          if (statusCode === DisconnectReason.connectionReplaced) {
            // Another session took over - don't retry
            logger.info(`Instance ${instance.name} replaced by another session. Not retrying.`);
            this.retryCount.delete(id);
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          // For 440 (conflict) and other errors: retry with exponential backoff
          if (retries >= InstanceManager.MAX_RETRIES) {
            logger.warn(`Instance ${instance.name} exceeded max retries (${InstanceManager.MAX_RETRIES}). Stopping.`);
            this.retryCount.delete(id);
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          // Exponential backoff: 5s, 10s, 20s, 40s, 80s
          const delay = InstanceManager.BASE_DELAY * Math.pow(2, retries);
          this.retryCount.set(id, retries + 1);
          logger.info(`Scheduling reconnect for ${instance.name} in ${delay / 1000}s (attempt ${retries + 1})`);

          // Clear any existing timer
          const existingTimer = this.reconnectTimers.get(id);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(async () => {
            this.reconnectTimers.delete(id);
            try {
              await this.connectInstance(id);
            } catch (err: any) {
              logger.error(`Reconnect failed for ${instance.name}: ${err.message}`);
            }
          }, delay);
          this.reconnectTimers.set(id, timer);

          if (!resolved) { resolved = true; resolve(null); }
        }

        if (connection === "open") {
          const user = sock.user;
          instance.status = "connected";
          instance.phone = user?.id?.split(":")[0] || user?.id?.split("@")[0];
          instance.qrCode = undefined;
          this.instances.set(id, instance);
          await this.syncInstanceToDB(instance);

          // Reset retry count on successful connection
          this.retryCount.delete(id);

          logger.info(`Instance connected: ${instance.name} (${instance.phone})`);
          if (!resolved) { resolved = true; resolve(null); }
        }
      });

      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;
        for (const msg of messages) {
          if (msg.key.fromMe) {
            // Still save outgoing messages
            for (const handler of this.globalMessageHandlers) {
              try { handler(id, msg); } catch (e) {}
            }
            continue;
          }
          instance.messagesReceived++;
          this.instances.set(id, instance);

          // Instance-specific handler
          const handler = this.messageHandlers.get(id);
          if (handler) handler(msg);

          // Global handlers (for inbox)
          for (const gHandler of this.globalMessageHandlers) {
            try { gHandler(id, msg); } catch (e) {}
          }

          logger.info(`Message received on ${instance.name} from ${msg.key.remoteJid}`);
        }
      });
    });
  }

  // Clean up socket before reconnecting
  private async cleanupSocket(id: string): Promise<void> {
    const existingSock = this.sockets.get(id);
    if (existingSock) {
      try {
        existingSock.ev.removeAllListeners("connection.update");
        existingSock.ev.removeAllListeners("creds.update");
        existingSock.ev.removeAllListeners("messages.upsert");
        existingSock.ws.close();
      } catch (e) {
        // Socket might already be closed
      }
      this.sockets.delete(id);
    }

    // Clear any pending reconnect timer
    const timer = this.reconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(id);
    }
  }

  async sendMessage(instanceId: string, phone: string, message: string): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }
    try {
      let jid = phone.replace(/\D/g, "");
      if (!jid.endsWith("@s.whatsapp.net")) {
        jid = jid + "@s.whatsapp.net";
      }
      const results = await sock.onWhatsApp(jid.split("@")[0]);
      const result = results && results[0];
      if (!result?.exists) {
        logger.warn(`Number ${phone} not on WhatsApp`);
        return false;
      }
      await sock.sendMessage(result.jid, { text: message });
      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Message sent from ${instance.name} to ${phone}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message: ${error.message}`);
      return false;
    }
  }

  // Send message by JID (for inbox replies)
  async sendMessageByJid(instanceId: string, jid: string, message: string): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }
    try {
      await sock.sendMessage(jid, { text: message });
      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Message sent from ${instance.name} to ${jid}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message by JID: ${error.message}`);
      return false;
    }
  }

  async sendMediaByJid(
    instanceId: string,
    jid: string,
    input: {
      mediaType: "image" | "video" | "audio" | "document";
      filePath: string;
      caption?: string;
      mimeType?: string;
      fileName?: string;
    }
  ): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    try {
      const fileBuffer = fs.readFileSync(input.filePath);
      const payload: Record<string, unknown> = {};

      if (input.mediaType === "image") {
        payload.image = fileBuffer;
        if (input.caption) payload.caption = input.caption;
      } else if (input.mediaType === "video") {
        payload.video = fileBuffer;
        if (input.caption) payload.caption = input.caption;
      } else if (input.mediaType === "audio") {
        payload.audio = fileBuffer;
        payload.ptt = false;
        if (input.mimeType) payload.mimetype = input.mimeType;
      } else {
        payload.document = fileBuffer;
        if (input.caption) payload.caption = input.caption;
        if (input.mimeType) payload.mimetype = input.mimeType;
        if (input.fileName) payload.fileName = input.fileName;
      }

      await sock.sendMessage(jid, payload as any);
      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Media message sent from ${instance.name} to ${jid} (${input.mediaType})`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending media by JID: ${error.message}`);
      return false;
    }
  }

  async sendMedia(
    instanceId: string,
    phone: string,
    input: {
      mediaType: "image" | "video" | "audio" | "document";
      filePath: string;
      caption?: string;
      mimeType?: string;
      fileName?: string;
    }
  ): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    try {
      let jid = phone.replace(/\D/g, "");
      if (!jid.endsWith("@s.whatsapp.net")) {
        jid = jid + "@s.whatsapp.net";
      }

      const results = await sock.onWhatsApp(jid.split("@")[0]);
      const result = results && results[0];
      if (!result?.exists) {
        logger.warn(`Number ${phone} not on WhatsApp`);
        return false;
      }

      return this.sendMediaByJid(instanceId, result.jid, input);
    } catch (error: any) {
      logger.error(`Error sending media: ${error.message}`);
      return false;
    }
  }

  async sendPollByJid(
    instanceId: string,
    jid: string,
    input: {
      question: string;
      options: string[];
      selectableCount?: number;
    }
  ): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    try {
      await sock.sendMessage(jid, {
        poll: {
          name: input.question,
          values: input.options,
          selectableCount: input.selectableCount ?? 1,
        },
      } as any);

      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Poll sent from ${instance.name} to ${jid}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending poll by JID: ${error.message}`);
      return false;
    }
  }

  async downloadIncomingMedia(
    instanceId: string,
    msg: any
  ): Promise<
    | {
        buffer: Buffer;
        mimeType?: string;
        fileName?: string;
        mediaType: "image" | "video" | "audio" | "document";
      }
    | null
  > {
    const sock = this.sockets.get(instanceId);
    if (!sock) return null;

    const rootMessage = msg?.message || {};
    const content =
      rootMessage?.ephemeralMessage?.message ||
      rootMessage?.viewOnceMessage?.message ||
      rootMessage?.viewOnceMessageV2?.message ||
      rootMessage;

    const hasImage = Boolean(content?.imageMessage);
    const hasVideo = Boolean(content?.videoMessage);
    const hasAudio = Boolean(content?.audioMessage);
    const hasDocument = Boolean(content?.documentMessage);

    let mediaType: "image" | "video" | "audio" | "document" | null = null;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (hasImage) {
      mediaType = "image";
      mimeType = content.imageMessage?.mimetype;
    } else if (hasVideo) {
      mediaType = "video";
      mimeType = content.videoMessage?.mimetype;
    } else if (hasAudio) {
      mediaType = "audio";
      mimeType = content.audioMessage?.mimetype;
    } else if (hasDocument) {
      mediaType = "document";
      mimeType = content.documentMessage?.mimetype;
      fileName = content.documentMessage?.fileName;
    }

    if (!mediaType) return null;

    try {
      const media = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger: this.mediaLogger,
          reuploadRequest: sock.updateMediaMessage,
        }
      );

      if (!media || !(media instanceof Buffer)) return null;

      return {
        buffer: media,
        mimeType,
        fileName,
        mediaType,
      };
    } catch (error: any) {
      logger.error(`Error downloading incoming media: ${error.message}`);
      return null;
    }
  }

  async disconnectInstance(id: string): Promise<void> {
    await this.cleanupSocket(id);
    const sock = this.sockets.get(id);
    const instance = this.instances.get(id);
    if (sock) {
      await sock.logout().catch(() => {});
      this.sockets.delete(id);
    }
    if (instance) {
      instance.status = "disconnected";
      instance.qrCode = undefined;
      instance.phone = undefined;
      this.instances.set(id, instance);
      await this.syncInstanceToDB(instance);
    }
    this.retryCount.delete(id);
  }

  async deleteInstance(id: string): Promise<void> {
    await this.disconnectInstance(id);
    this.instances.delete(id);
    this.instanceOwners.delete(id);
    this.messageHandlers.delete(id);
    this.retryCount.delete(id);
    
    // Remove from DB
    try {
      const pool = getPool();
      await pool.execute("DELETE FROM whatsapp_instances WHERE id = ?", [id]);
    } catch (e) {}

    const authPath = path.join(config.authDir, id);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true });
    }
  }

  onMessage(instanceId: string, handler: (msg: any) => void): void {
    this.messageHandlers.set(instanceId, handler);
  }

  onGlobalMessage(handler: (instanceId: string, msg: any) => void): void {
    this.globalMessageHandlers.push(handler);
  }

  getInstance(id: string, ownerUserId?: string): WhatsAppInstance | undefined {
    if (ownerUserId) {
      const owner = this.instanceOwners.get(id);
      if (owner !== ownerUserId) return undefined;
    }
    return this.instances.get(id);
  }

  getSocket(id: string): WASocket | undefined {
    return this.sockets.get(id);
  }

  getAllInstances(ownerUserId?: string): WhatsAppInstance[] {
    return Array.from(this.instances.values())
      .filter((inst) => {
        if (!ownerUserId) return true;
        return this.instanceOwners.get(inst.id) === ownerUserId;
      })
      .map((inst) => ({
      ...inst,
      qrCode: inst.qrCode ? "[QR_AVAILABLE]" : undefined,
    }));
  }

  getInstanceQR(id: string, ownerUserId?: string): string | undefined {
    if (ownerUserId) {
      const owner = this.instanceOwners.get(id);
      if (owner !== ownerUserId) return undefined;
    }
    return this.instances.get(id)?.qrCode;
  }
}

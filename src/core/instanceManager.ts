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

export type PollDeliveryMode = "auto" | "native_only" | "text_only";

export type PollSendResult = {
  ok: boolean;
  mode: "native_poll" | "text_fallback";
  error?: string;
  nativeError?: string;
};

export type ConnectedDestinationTarget = {
  jid: string;
  name: string;
  instance_id: string;
  instance_name?: string;
  target_type: "group" | "contact" | "channel";
  last_message_at?: string | null;
};

export class InstanceManager {
  private instances: Map<string, WhatsAppInstance> = new Map();
  private instanceOwners: Map<string, string | null> = new Map();
  private instanceBrands: Map<string, string | null> = new Map();
  private sockets: Map<string, WASocket> = new Map();
  private connectPromises: Map<string, Promise<string | null>> = new Map();
  private messageHandlers: Map<string, (msg: any) => void> = new Map();
  private globalMessageHandlers: Array<(instanceId: string, msg: any) => void> = [];
  private retryCount: Map<string, number> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private connectedSince: Map<string, number> = new Map();
  private preconditionCloseCount: Map<string, number> = new Map();

  /* PendingAcks: chave = messageId (key.id retornado pelo sendMessage),
     valor = {resolver, timer, instanceId, sentAt}. Quando o messages.update
     do Baileys chega com status >= SERVER_ACK (2), resolvemos true. Se timeout
     (default 5s) ou a instance desconectar antes, resolvemos false.
     Isso permite que sendMessage() so retorne true quando o WhatsApp REALMENTE
     confirmou recebimento — fim do "painel mente sent". */
  private pendingAcks: Map<string, { resolve: (ok: boolean) => void; timer: NodeJS.Timeout; instanceId: string; sentAt: number }> = new Map();
  private consecutiveAckTimeouts: Map<string, number> = new Map();
  /* Default 15s pra esperar ack. Configurável via env. 5s era muito curto em redes lentas
     (SERVER_ACK pode demorar 8-12s em alta carga do WA), causando drops silenciosos. */
  private static readonly DEFAULT_ACK_TIMEOUT_MS = Math.max(1000, Math.min(60000, Number(process.env.WHATSAPP_ACK_TIMEOUT_MS) || 15000));
  private static readonly MAX_CONSECUTIVE_ACK_TIMEOUTS = 4;
  private intentionalDisconnects: Set<string> = new Set();
  private mediaLogger = pino({ level: "silent" }) as any;
  private static MAX_RETRIES = 5;
  private static BASE_DELAY = 5000; // 5s base, exponential backoff
  private static MAX_DELAY = 120000;
  private static COOLDOWN_DELAY = 180000;
  private static MAX_RETRIES_BEFORE_COOLDOWN = 8;
  private static STABLE_CONNECTION_MS = 30000;
  private static MAX_428_CLOSES = 3;

  private async ensureInstanceLoaded(id: string): Promise<WhatsAppInstance | null> {
    const existing = this.instances.get(id);
    if (existing) return existing;

    try {
      const pool = getPool();
      const [rows] = await pool.execute<any[]>(
        "SELECT id, name, phone, status, created_by, created_at FROM whatsapp_instances WHERE id = ? LIMIT 1",
        [id]
      );

      if (!rows.length) return null;

      const row = rows[0];
      const loaded: WhatsAppInstance = {
        id: row.id,
        name: row.name,
        status: row.status || "disconnected",
        phone: row.phone || undefined,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        messagessSent: 0,
        messagesReceived: 0,
      };

      this.instanceOwners.set(row.id, row.created_by || null);
      this.instances.set(id, loaded);
      return loaded;
    } catch (error: any) {
      logger.error(`Failed to load instance ${id} from DB: ${error.message}`);
      return null;
    }
  }

  private normalizeDirectJid(rawJid: string): string {
    const jid = String(rawJid || "").trim();
    if (!jid) return "";

    if (jid.includes("@g.us")) return jid;

    if (jid.includes("@")) {
      const [left, domain] = jid.split("@");
      const normalizedLeft = String(left || "").split(":")[0].replace(/\D/g, "");
      if (normalizedLeft) {
        return `${normalizedLeft}@${domain || "s.whatsapp.net"}`;
      }
      return jid;
    }

    const digits = jid.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : "";
  }

  private async resolveSendTargetJid(sock: WASocket, rawJid: string): Promise<string> {
    const normalized = this.normalizeDirectJid(rawJid);
    if (!normalized) return rawJid;
    if (normalized.endsWith("@g.us")) return normalized;
    // LID JIDs are WhatsApp internal multi-device identifiers — not phone numbers.
    // onWhatsApp() probe always fails for them; send directly.
    if (normalized.endsWith("@lid")) return normalized;

    const digits = normalized.split("@")[0];
    /* Bug-19: same BR 9-digit gotcha applies here. resolveSendTargetJid is the
     * path used by sendMessageByJid + sendMediaByJid — that's how campaign
     * replies and media broadcasts hit Baileys. Use the variant-probe so we
     * don't end up sending media to a 10-digit ghost JID. */
    const resolved = await this.resolveWhatsAppTarget(sock, digits);
    if (resolved.exists && resolved.jid) return resolved.jid;
    return normalized;
  }

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
        "SELECT id, name, phone, status, created_by FROM whatsapp_instances WHERE status IN ('connected', 'connecting', 'qr_ready')"
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

  private async invalidateAuthState(id: string, instance: WhatsAppInstance): Promise<void> {
    logger.warn(`Invalidating auth state for ${instance.name} (${id}) after repeated connection failures.`);
    await this.cleanupSocket(id);
    this.retryCount.delete(id);
    this.connectedSince.delete(id);
    this.preconditionCloseCount.delete(id);

    const authPath = path.join(config.authDir, id);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }

    instance.status = "disconnected";
    instance.qrCode = undefined;
    instance.phone = undefined;
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);
  }

  // ==================== DB SYNC HELPERS ====================
  private async syncInstanceToDB(instance: WhatsAppInstance): Promise<void> {
    /* Nao persiste o estado transitório 'connecting' no DB.
       'connecting' é um estado in-process: escrever no DB causa drift oscilante
       (restoreAllSessions lê 'connecting' como "not connected" → orphaned path).
       Só persistimos 'connected', 'disconnected', 'qr_ready' e similares. */
    if (instance.status === "connecting") return;

    try {
      const pool = getPool();
      const ownerUserId = this.instanceOwners.get(instance.id) || null;
      const brandId = this.instanceBrands.get(instance.id) || null;
      const [existing] = await pool.execute<any[]>(
        "SELECT id FROM whatsapp_instances WHERE id = ?",
        [instance.id]
      );

      if (existing.length > 0) {
        /* COALESCE preserva brand_id antigo se o novo for null — nao apaga
           atribuicao previa por engano numa reconexao sem contexto. */
        await pool.execute(
          `UPDATE whatsapp_instances SET name = ?, phone = ?, status = ?,
           created_by = COALESCE(created_by, ?),
           brand_id = COALESCE(brand_id, ?),
           last_connected_at = CASE WHEN ? = 'connected' THEN NOW() ELSE last_connected_at END,
           updated_at = NOW() WHERE id = ?`,
          [instance.name, instance.phone || null, instance.status, ownerUserId, brandId, instance.status, instance.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO whatsapp_instances (id, name, phone, status, created_by, brand_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [instance.id, instance.name, instance.phone || null, instance.status, ownerUserId, brandId]
        );
      }
    } catch (err: any) {
      logger.error(`DB sync error for ${instance.id}: ${err.message}`);
    }
  }

  // ==================== INSTANCE LIFECYCLE ====================
  async createInstance(name: string, ownerUserId?: string, brandId?: string | null): Promise<WhatsAppInstance> {
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
    this.instanceBrands.set(id, brandId || null);
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);
    logger.info(`Instance created: ${name} (${id}) ownerUserId=${ownerUserId || "(none)"} brandId=${brandId || "(none)"}`);
    return instance;
  }

  async connectInstance(id: string): Promise<string | null> {
    const pendingConnect = this.connectPromises.get(id);
    if (pendingConnect) {
      return pendingConnect;
    }

    const connectTask = this.connectInstanceInternal(id)
      .finally(() => {
        this.connectPromises.delete(id);
      });

    this.connectPromises.set(id, connectTask);
    return connectTask;
  }

  private async connectInstanceInternal(id: string): Promise<string | null> {
    const instance = (await this.ensureInstanceLoaded(id)) || this.instances.get(id);
    if (!instance) throw new Error("Instance not found");

    const existingSock = this.sockets.get(id);
    if (instance.status === "connected" && existingSock) {
      logger.info(`Instance ${instance.name} is already connected. Skipping reconnect.`);
      return null;
    }

    // Avoid replacing a live connect flow unless we lost the socket reference
    if (instance.status === "connecting" && existingSock) {
      logger.info(`Instance ${instance.name} is already connecting. Reusing current flow.`);
      return instance.qrCode || null;
    }

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
          const connectedAt = this.connectedSince.get(id);
          this.connectedSince.delete(id);

          const connectionWasStable =
            typeof connectedAt === "number" &&
            Date.now() - connectedAt >= InstanceManager.STABLE_CONNECTION_MS;

          if (connectionWasStable) {
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
          }

          const retries = this.retryCount.get(id) || 0;

          logger.info(`Connection closed for ${instance.name}. Status: ${statusCode}. Retries: ${retries}/${InstanceManager.MAX_RETRIES}`);

          instance.status = "disconnected";
          instance.qrCode = undefined;
          this.instances.set(id, instance);
          await this.syncInstanceToDB(instance);

          /* Mata pendingAcks dessa instance — msgs em voo no momento do disconnect
             nao terao mais chance de ack. Quem chamou sendMessage recebe false e
             pode marcar como failed_dropped. */
          this.rejectPendingAcksForInstance(id, `disconnect status=${statusCode}`);

          if (this.intentionalDisconnects.has(id)) {
            logger.info(`Intentional disconnect for ${instance.name}. Skipping reconnect.`);
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          // Handle specific disconnect reasons
          if (statusCode === DisconnectReason.loggedOut) {
            /* WhatsApp invalidou a sessao (401). Auth files nao valem mais.
               TIER 2: limpar auth + auto-restart pra gerar NOVO QR + notificar admin.
               Antes: so limpava e desistia. Agora QR aparece pronto no painel. */
            logger.warn(`Instance ${instance.name} logged out (401). Cleaning auth + auto-restart pra novo QR.`);
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
            const authPath = path.join(config.authDir, id);
            if (fs.existsSync(authPath)) {
              try { fs.rmSync(authPath, { recursive: true }); } catch (e: any) {
                logger.warn(`Failed to clean auth for ${instance.name}: ${e.message}`);
              }
            }

            /* Dispara notificacao pro admin (sininho + push se inscrito) */
            this.notifySessionInvalidated(id, instance).catch((e: any) => {
              logger.warn(`Failed to send session-invalidated notification: ${e.message}`);
            });

            /* Auto-restart pra gerar novo QR — sem await pra nao bloquear o handler.
               Pequeno delay (3s) pra Baileys terminar de limpar listeners. */
            setTimeout(() => {
              this.connectInstance(id).catch((err: any) => {
                logger.error(`Auto-reconnect after loggedOut failed for ${instance.name}: ${err.message}`);
              });
            }, 3000);

            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          if (statusCode === DisconnectReason.connectionReplaced) {
            // Another session took over - don't retry
            logger.info(`Instance ${instance.name} replaced by another session. Not retrying.`);
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          if (statusCode === 428) {
            const closeCount = (this.preconditionCloseCount.get(id) || 0) + 1;
            this.preconditionCloseCount.set(id, closeCount);

            if (
              closeCount >= InstanceManager.MAX_428_CLOSES &&
              retries >= InstanceManager.MAX_RETRIES_BEFORE_COOLDOWN
            ) {
              await this.invalidateAuthState(id, instance);
              if (!resolved) { resolved = true; resolve(null); }
              return;
            }
          } else {
            this.preconditionCloseCount.delete(id);
          }

          let delay = Math.min(
            InstanceManager.BASE_DELAY * Math.pow(2, Math.min(retries, 6)),
            InstanceManager.MAX_DELAY
          );
          const nextRetry = retries + 1;
          this.retryCount.set(id, nextRetry);

          if (nextRetry > InstanceManager.MAX_RETRIES_BEFORE_COOLDOWN) {
            delay = InstanceManager.COOLDOWN_DELAY;
            logger.warn(
              `Instance ${instance.name} still offline after ${nextRetry} attempts. Entering cooldown (${delay / 1000}s) and continuing retries.`
            );
          } else {
            logger.info(`Scheduling reconnect for ${instance.name} in ${delay / 1000}s (attempt ${nextRetry})`);
          }

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

          this.connectedSince.set(id, Date.now());

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

      /* Ack do Baileys — eventos com update.status indicam progresso:
           0 = ERROR, 1 = PENDING (server), 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ
         Consideramos status >= 2 como "WhatsApp confirmou recebimento no servidor".
         Resolvemos pendingAcks aqui (true se ack ok, false se erro). */
      sock.ev.on("messages.update", (updates: any[]) => {
        try {
          for (const u of updates || []) {
            const messageId = u?.key?.id;
            if (!messageId) continue;
            const pending = this.pendingAcks.get(messageId);
            if (!pending) continue;
            const status = Number(u?.update?.status);
            if (status === 0) {
              /* Server rejeitou */
              clearTimeout(pending.timer);
              this.pendingAcks.delete(messageId);
              pending.resolve(false);
            } else if (status >= 2) {
              /* Server confirmou recebimento (>= SERVER_ACK) */
              clearTimeout(pending.timer);
              this.pendingAcks.delete(messageId);
              this.consecutiveAckTimeouts.delete(pending.instanceId);
              pending.resolve(true);
            }
          }
        } catch (e: any) {
          logger.warn(`messages.update handler error: ${e?.message}`);
        }
      });
    });
  }

  /* waitForAck — espera o messages.update com status >= 2 chegar pra esse messageId.
     Timeout default 5s (configuravel via WHATSAPP_ACK_TIMEOUT_MS env).
     Resolve true se ack ok, false se timeout, erro ou disconnect.
     Usado por sendMessage/sendMessageByJid pra so retornar true quando WhatsApp
     REALMENTE confirmou recebimento. Fim do bug "painel mente sent". */
  private waitForAck(messageId: string, instanceId: string, timeoutMs?: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = timeoutMs ?? InstanceManager.DEFAULT_ACK_TIMEOUT_MS;
      const timer = setTimeout(() => {
        if (this.pendingAcks.has(messageId)) {
          this.pendingAcks.delete(messageId);
          const consecutive = (this.consecutiveAckTimeouts.get(instanceId) || 0) + 1;
          this.consecutiveAckTimeouts.set(instanceId, consecutive);
          if (consecutive >= InstanceManager.MAX_CONSECUTIVE_ACK_TIMEOUTS) {
            const inst = this.instances.get(instanceId);
            logger.warn(`ZOMBIE DETECTED: ${inst?.name || instanceId} — ${consecutive} consecutive ack timeouts. Triggering reconnect.`);
            this.consecutiveAckTimeouts.delete(instanceId);
            setImmediate(() => this.triggerZombieRecovery(instanceId).catch(() => {}));
          }
          resolve(false);
        }
      }, timeout);
      this.pendingAcks.set(messageId, { resolve, timer, instanceId, sentAt: Date.now() });
    });
  }

  private async triggerZombieRecovery(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    const sock = this.sockets.get(instanceId);
    if (!sock) return;
    logger.warn(`ZOMBIE RECOVERY: Forcing reconnect for ${instance.name} (${instanceId})`);
    this.rejectPendingAcksForInstance(instanceId, "zombie_recovery");
    await this.cleanupSocket(instanceId);
    instance.status = "disconnected";
    this.instances.set(instanceId, instance);
    await this.syncInstanceToDB(instance);
    setTimeout(() => this.safeConnect(instanceId), 3000);
  }

  /* Notifica admin (dono da instance) que a sessao WhatsApp foi invalidada e
     precisa escanear QR novamente. Usado quando 401/loggedOut acontece.
     Dispara via notificationService — apareca no sininho + push se inscrito. */
  private async notifySessionInvalidated(instanceId: string, instance: WhatsAppInstance): Promise<void> {
    try {
      const ownerId = this.instanceOwners.get(instanceId);
      if (!ownerId) return;
      const { getNotificationService } = await import("../services/notifications");
      const svc = getNotificationService();
      await svc.createNotification({
        user_id: ownerId,
        type: "system",
        event: "whatsapp_session_invalidated",
        title: `Sessão WhatsApp expirou: ${instance.name}`,
        message: `O WhatsApp invalidou a sessão da instância "${instance.name}" (${instance.phone || ""}). ` +
                 `Um novo QR Code foi gerado automaticamente — escaneie em /whatsapp pra reconectar.`,
        priority: "high",
        metadata: {
          instance_id: instanceId,
          instance_name: instance.name,
          phone: instance.phone || null,
          reason: "session_expired_401",
        },
      } as any);
    } catch (err: any) {
      logger.warn(`notifySessionInvalidated failed: ${err.message}`);
    }
  }

  /* Quando uma instance desconecta, rejeitar todos pendingAcks dela como false
     (mensagens em voo nesse momento sao consideradas perdidas). */
  private rejectPendingAcksForInstance(instanceId: string, reason: string): void {
    let rejected = 0;
    for (const [messageId, pending] of this.pendingAcks.entries()) {
      if (pending.instanceId === instanceId) {
        clearTimeout(pending.timer);
        this.pendingAcks.delete(messageId);
        pending.resolve(false);
        rejected++;
      }
    }
    if (rejected > 0) {
      logger.warn(`Rejected ${rejected} pending acks for instance ${instanceId} (${reason})`);
    }
  }

  // Clean up socket before reconnecting
  private async cleanupSocket(id: string): Promise<void> {
    const existingSock = this.sockets.get(id);
    if (existingSock) {
      try {
        existingSock.ev.removeAllListeners("connection.update");
        existingSock.ev.removeAllListeners("creds.update");
        existingSock.ev.removeAllListeners("messages.upsert");
        existingSock.ev.removeAllListeners("messages.update");
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

    this.connectedSince.delete(id);
  }

  /**
   * Bug-19: Brazilian 9th-digit gotcha.
   *
   * Mobile numbers in BR since 2012 are 11 digits (DDD + 9 + 8). But Baileys'
   * onWhatsApp() — and the historical WhatsApp internal canonical JID format —
   * frequently returns the OLD 10-digit form (DDD + 8, no leading 9) even for
   * accounts that are actually reachable only via the 11-digit JID. Trusting
   * that response and sending to the 10-digit JID has two failure modes:
   *
   *   1. JID belongs to nobody → sock.sendMessage() succeeds locally (the
   *      protobuf went out on the socket) but no SERVER_ACK ever comes back,
   *      no messages.upsert event, no row in whatsapp_messages, no error in
   *      our logs. Operator sees "sent" but recipient gets nothing.
   *   2. JID belongs to a legacy landline / different account that registered
   *      WhatsApp with the 10-digit format → message goes to the WRONG person.
   *
   * Fix: enumerate both variants for any BR mobile number, probe each with
   * onWhatsApp, prefer the one that returns exists:true. If both exist, prefer
   * the one Baileys returns the JID for unchanged (it's the canonical one for
   * THAT specific account). If neither exists → genuinely off WhatsApp.
   */
  private brazilianVariants(digits: string): string[] {
    const m = digits.match(/^55(\d{2})(\d{8,9})$/);
    if (!m) return [digits];
    const [, ddd, rest] = m;
    const dddNum = Number(ddd);
    // Only DDDs 11-99 had the 9 added. DDDs outside that range are landlines/special.
    if (dddNum < 11 || dddNum > 99) return [digits];
    if (rest.length === 9 && rest.startsWith("9")) {
      // Came with 9 → test WITH first, then WITHOUT as fallback.
      return [`55${ddd}${rest}`, `55${ddd}${rest.slice(1)}`];
    }
    if (rest.length === 8) {
      // Came without 9 → test the 11-digit modern form first, then legacy as fallback.
      return [`55${ddd}9${rest}`, `55${ddd}${rest}`];
    }
    return [digits];
  }

  /**
   * Probes onWhatsApp with each BR variant and returns the first that exists.
   *
   * IMPORTANT: We deliberately DO NOT use `hit.jid` from Baileys' response.
   * Baileys' onWhatsApp() frequently returns a "canonical" jid that strips the
   * 9th digit from BR mobiles even when we queried the 11-digit modern form
   * (e.g. query "5585986818511" → returns "558586818511@s.whatsapp.net"). That
   * stripped JID is what's been silently dropping our campaign messages. The
   * modern 11-digit JID is the actually-reachable one on current accounts, so
   * we construct the target JID from the *variant we asked about* rather than
   * trusting the canonical form Baileys returns.
   */
  private async resolveWhatsAppTarget(
    sock: WASocket,
    digits: string
  ): Promise<{ exists: boolean; jid?: string; triedVariants: string[] }> {
    const variants = this.brazilianVariants(digits);
    for (const variant of variants) {
      try {
        const results = await sock.onWhatsApp(variant);
        const hit = results && results[0];
        if (hit?.exists) {
          return {
            exists: true,
            jid: `${variant}@s.whatsapp.net`,
            triedVariants: variants,
          };
        }
      } catch (err: any) {
        logger.warn(`onWhatsApp probe failed for ${variant}: ${err?.message || err}`);
      }
    }
    return { exists: false, triedVariants: variants };
  }

  async sendMessage(instanceId: string, phone: string, message: string): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }
    try {
      const digits = phone.replace(/\D/g, "");
      if (!digits) {
        logger.warn(`Empty phone digits for ${phone}`);
        return false;
      }
      const resolved = await this.resolveWhatsAppTarget(sock, digits);
      if (!resolved.exists || !resolved.jid) {
        logger.warn(`Number ${phone} not on WhatsApp (tried: ${resolved.triedVariants.join(", ")})`);
        return false;
      }
      const result: any = await sock.sendMessage(resolved.jid, { text: message });
      const messageId: string | undefined = result?.key?.id;

      /* HONESTIDADE: so retorna true se o WhatsApp confirmar SERVER_ACK em ate 5s.
         Se nao tem messageId (raro - Baileys nao retornou key) ou nao recebe ack,
         consideramos a msg perdida e retornamos false pra quem chamou marcar como failed. */
      let ackOk = true;
      if (messageId) {
        ackOk = await this.waitForAck(messageId, instanceId);
        if (!ackOk) {
          logger.warn(`Message to ${phone} sent locally but NO WhatsApp ack in ${InstanceManager.DEFAULT_ACK_TIMEOUT_MS}ms (instance=${instance.name}, mid=${messageId})`);
          return false;
        }
      } else {
        logger.warn(`Message to ${phone} sent but Baileys did not return messageId — cannot confirm ack`);
      }

      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Message sent from ${instance.name} to ${phone} (jid=${resolved.jid})${messageId ? ` mid=${messageId}` : ''}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message: ${error.message}`);
      return false;
    }
  }

  async checkWhatsAppNumber(
    instanceId: string,
    phone: string
  ): Promise<{ exists: boolean; jid?: string; normalizedPhone: string }> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone) {
      throw new Error("Phone is required");
    }

    try {
      const resolved = await this.resolveWhatsAppTarget(sock, normalizedPhone);
      if (!resolved.exists || !resolved.jid) {
        return { exists: false, normalizedPhone };
      }
      return { exists: true, jid: resolved.jid, normalizedPhone };
    } catch (error: any) {
      logger.error(`Error validating WhatsApp number: ${error.message}`);
      throw new Error("Failed to validate WhatsApp number");
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
      const targetJid = await this.resolveSendTargetJid(sock, jid);
      const result: any = await sock.sendMessage(targetJid, { text: message });
      const messageId: string | undefined = result?.key?.id;

      let ackOk = true;
      if (messageId) {
        ackOk = await this.waitForAck(messageId, instanceId);
        if (!ackOk) {
          logger.warn(`Message to ${targetJid} sent locally but NO WhatsApp ack in ${InstanceManager.DEFAULT_ACK_TIMEOUT_MS}ms (instance=${instance.name}, mid=${messageId})`);
          return false;
        }
      } else {
        logger.warn(`Message to ${targetJid} sent but Baileys did not return messageId — cannot confirm ack`);
      }

      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Message sent from ${instance.name} to ${targetJid}${messageId ? ` mid=${messageId}` : ''}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message by JID: ${error.message}`);
      return false;
    }
  }

  async getProfilePictureUrl(instanceId: string, jid: string): Promise<string | null> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      return null;
    }

    try {
      const avatarUrl = await sock.profilePictureUrl(jid, "image");
      return avatarUrl || null;
    } catch {
      return null;
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
      voiceNote?: boolean;
    }
  ): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    try {
      const targetJid = await this.resolveSendTargetJid(sock, jid);
      const fileBuffer = fs.readFileSync(input.filePath);
      const payload: Record<string, unknown> = {};

      // Auto-detect mimetype from file extension if not provided
      // WhatsApp requires correct mimetype to render media on recipient side;
      // missing/wrong mimetype causes "message pending forever" issue.
      const ext = (input.filePath.split(".").pop() || "").toLowerCase();
      const autoMimeType = input.mimeType || (() => {
        if (input.mediaType === "image") {
          if (ext === "png") return "image/png";
          if (ext === "webp") return "image/webp";
          if (ext === "gif") return "image/gif";
          return "image/jpeg";
        }
        if (input.mediaType === "video") {
          if (ext === "webm") return "video/webm";
          if (ext === "3gp") return "video/3gpp";
          return "video/mp4";
        }
        if (input.mediaType === "audio") {
          if (ext === "mp3") return "audio/mpeg";
          if (ext === "m4a") return "audio/mp4";
          if (ext === "wav") return "audio/wav";
          return "audio/ogg; codecs=opus";
        }
        if (input.mediaType === "document") {
          if (ext === "pdf") return "application/pdf";
          if (ext === "doc") return "application/msword";
          if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          return "application/octet-stream";
        }
        return undefined;
      })();

      if (input.mediaType === "image") {
        payload.image = fileBuffer;
        if (autoMimeType) payload.mimetype = autoMimeType;
        if (input.caption) payload.caption = input.caption;
      } else if (input.mediaType === "video") {
        payload.video = fileBuffer;
        if (autoMimeType) payload.mimetype = autoMimeType;
        if (input.caption) payload.caption = input.caption;
      } else if (input.mediaType === "audio") {
        payload.audio = fileBuffer;
        payload.ptt = Boolean(input.voiceNote);
        if (autoMimeType) payload.mimetype = autoMimeType;
      } else {
        payload.document = fileBuffer;
        if (input.caption) payload.caption = input.caption;
        if (autoMimeType) payload.mimetype = autoMimeType;
        if (input.fileName) payload.fileName = input.fileName;
      }

      const sent = await sock.sendMessage(targetJid, payload as any);
      if (!sent?.key?.id) {
        logger.warn(`Media send returned no message key for ${targetJid} — delivery uncertain`);
      }
      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Media message sent from ${instance.name} to ${targetJid} (${input.mediaType}, ${autoMimeType || 'auto'}, ${fileBuffer.length} bytes)`);
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
      voiceNote?: boolean;
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
      deliveryMode?: PollDeliveryMode;
    }
  ): Promise<PollSendResult> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    const deliveryMode: PollDeliveryMode = input.deliveryMode || "auto";
    const pollPayload = {
      poll: {
        name: input.question,
        values: input.options,
        selectableCount: input.selectableCount ?? 1,
      },
    } as any;

    const fallbackText = [
      `*${input.question}*`,
      ...input.options.map((option, index) => `${index + 1}) ${option}`),
      "",
      "Responda com o numero da opcao escolhida.",
    ]
      .join("\n")
      .trim();

    try {
      const targetJid = await this.resolveSendTargetJid(sock, jid);
      if (deliveryMode !== "text_only") {
        await sock.sendMessage(targetJid, pollPayload);
        instance.messagessSent++;
        this.instances.set(instanceId, instance);
        logger.info(`Poll sent from ${instance.name} to ${targetJid}`);
        return { ok: true, mode: "native_poll" };
      }
    } catch (error: any) {
      const nativeError = String(error?.message || "unknown_native_poll_error");
      logger.error(`Error sending poll by JID: ${nativeError}`);
      if (deliveryMode === "native_only") {
        return { ok: false, mode: "native_poll", error: nativeError };
      }

      try {
        const fallbackTargetJid = await this.resolveSendTargetJid(sock, jid);
        await sock.sendMessage(fallbackTargetJid, { text: fallbackText });
        instance.messagessSent++;
        this.instances.set(instanceId, instance);
        logger.warn(`Poll fallback text sent from ${instance.name} to ${fallbackTargetJid}`);
        return { ok: true, mode: "text_fallback", nativeError };
      } catch (fallbackError: any) {
        const fallbackErrorText = String(fallbackError?.message || "unknown_fallback_error");
        logger.error(`Error sending poll fallback text by JID: ${fallbackErrorText}`);
        return {
          ok: false,
          mode: "text_fallback",
          error: fallbackErrorText,
          nativeError,
        };
      }
    }

    try {
      const textOnlyTargetJid = await this.resolveSendTargetJid(sock, jid);
      await sock.sendMessage(textOnlyTargetJid, { text: fallbackText });
      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      logger.info(`Text-only poll sent from ${instance.name} to ${textOnlyTargetJid}`);
      return { ok: true, mode: "text_fallback" };
    } catch (error: any) {
      const err = String(error?.message || "unknown_text_only_error");
      logger.error(`Error sending text-only poll by JID: ${err}`);
      return { ok: false, mode: "text_fallback", error: err };
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
    const sock = this.sockets.get(id);
    const instance = this.instances.get(id);
    this.intentionalDisconnects.add(id);
    if (sock) {
      await sock.logout().catch(() => {});
    }
    await this.cleanupSocket(id);
    this.intentionalDisconnects.delete(id);

    if (instance) {
      instance.status = "disconnected";
      instance.qrCode = undefined;
      instance.phone = undefined;
      this.instances.set(id, instance);
      await this.syncInstanceToDB(instance);
    }
    this.retryCount.delete(id);
    this.preconditionCloseCount.delete(id);
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

  async listConnectedDestinationTargets(
    instanceId: string,
    input?: { search?: string; targetType?: "group" | "contact" | "channel" | "all"; limit?: number }
  ): Promise<ConnectedDestinationTarget[]> {
    const instance = this.instances.get(instanceId);
    const sock = this.sockets.get(instanceId);
    if (!instance || !sock || instance.status !== "connected") {
      return [];
    }

    const targetType = String(input?.targetType || "group").toLowerCase();
    const search = String(input?.search || "").trim().toLowerCase();
    const limit = Math.max(20, Math.min(Number(input?.limit || 120), 400));

    const allTargets: ConnectedDestinationTarget[] = [];

    if (targetType === "group" || targetType === "all") {
      try {
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, meta] of Object.entries(groups || {})) {
          allTargets.push({
            jid,
            name: String((meta as any)?.subject || jid),
            instance_id: instanceId,
            instance_name: instance.name,
            target_type: "group",
            last_message_at: null,
          });
        }
      } catch (error: any) {
        logger.warn(`Failed to fetch live groups for ${instanceId}: ${error?.message || error}`);
      }
    }

    if (targetType === "channel" || targetType === "all") {
      // Baileys currently does not expose a stable "list all followed channels" API.
      // Channels are enriched dynamically through newsletterMetadata on known JIDs.
    }

    const filtered = search
      ? allTargets.filter((item) => item.name.toLowerCase().includes(search) || item.jid.toLowerCase().includes(search))
      : allTargets;

    const seen = new Set<string>();
    const deduped: ConnectedDestinationTarget[] = [];
    for (const item of filtered) {
      const key = `${item.instance_id}::${item.jid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= limit) break;
    }

    return deduped;
  }

  async enrichConnectedChannelTargets(
    instanceId: string,
    channels: ConnectedDestinationTarget[]
  ): Promise<ConnectedDestinationTarget[]> {
    const instance = this.instances.get(instanceId);
    const sock = this.sockets.get(instanceId) as any;
    if (!instance || !sock || instance.status !== "connected" || !Array.isArray(channels) || channels.length === 0) {
      return channels;
    }

    if (typeof sock.newsletterMetadata !== "function") {
      return channels;
    }

    const enriched: ConnectedDestinationTarget[] = [];
    for (const item of channels) {
      if (item.target_type !== "channel") {
        enriched.push(item);
        continue;
      }

      try {
        const meta = await sock.newsletterMetadata("jid", item.jid);
        const liveName = String(meta?.name || "").trim();
        enriched.push({
          ...item,
          name: liveName || item.name,
          instance_name: item.instance_name || instance.name,
        });
      } catch {
        enriched.push(item);
      }
    }

    return enriched;
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

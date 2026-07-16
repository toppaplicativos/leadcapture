import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  generateMessageIDV2,
  generateWAMessageFromContent,
  isJidGroup,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
  useMultiFileAuthState,
  WASocket,
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
import {
  getWaSendContext,
  phoneFromJid,
  whatsappSendEligibility,
  type WaSendPurpose,
} from "../services/whatsappSendEligibility";

export type PollDeliveryMode = "auto" | "native_only" | "text_only";
export type InteractiveDeliveryMode = PollDeliveryMode;

export type PollSendResult = {
  ok: boolean;
  mode: "native_poll" | "text_fallback";
  error?: string;
  nativeError?: string;
};

export type PairingCodeResult = {
  code: string;
  phone: string;
};

export type InteractiveSendResult = {
  ok: boolean;
  mode: "native_flow" | "native" | "text_fallback";
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
  private instanceOwnerTypes: Map<string, "admin" | "affiliate"> = new Map();
  private instanceOwnerActors: Map<string, string | null> = new Map();
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
  /** Último zombie recovery por instância — evita flapping que gera 401. */
  private zombieRecoveryAt: Map<string, number> = new Map();
  /* Default 20s pra esperar ack. Configurável via env. Valores baixos geram
     ZOMBIE falso e reconnect agressivo (principal causa de logout 401 em carga). */
  private static readonly DEFAULT_ACK_TIMEOUT_MS = Math.max(1000, Math.min(60000, Number(process.env.WHATSAPP_ACK_TIMEOUT_MS) || 20000));
  private static readonly MAX_CONSECUTIVE_ACK_TIMEOUTS = 8;
  private static readonly ZOMBIE_COOLDOWN_MS = 10 * 60 * 1000;
  private static readonly ZOMBIE_MIN_UPTIME_MS = 90_000;
  private intentionalDisconnects: Set<string> = new Set();
  /* Sessoes aguardando usuario digitar o codigo no celular — bloqueia reconnect/QR dessa sessão. */
  private pairingSessions: Set<string> = new Set();
  private pairingSessionTimers: Map<string, NodeJS.Timeout> = new Map();
  private pairingLocks: Map<string, Promise<PairingCodeResult>> = new Map();
  private pairingReconnecting: Set<string> = new Set();
  /** Código já emitido para a sessão (socket deve ficar vivo até o usuário digitar). */
  private pairingCodeIssued: Set<string> = new Set();
  /** Erro legível para o frontend quando o socket de pairing morre antes do vínculo. */
  private pairingErrors: Map<string, string> = new Map();
  private static readonly PAIRING_SESSION_TTL_MS = 10 * 60 * 1000;
  private mediaLogger = pino({ level: "silent" }) as any;
  private static MAX_RETRIES = 8;
  private static BASE_DELAY = 5000; // 5s base, exponential backoff
  private static MAX_DELAY = 180000;
  private static COOLDOWN_DELAY = 240000;
  private static MAX_RETRIES_BEFORE_COOLDOWN = 10;
  private static STABLE_CONNECTION_MS = 30000;
  private static MAX_428_CLOSES = 5;

  private async ensureInstanceLoaded(id: string): Promise<WhatsAppInstance | null> {
    const existing = this.instances.get(id);
    if (existing) return existing;

    try {
      const pool = getPool();
      const [rows] = await pool.execute<any[]>(
        "SELECT id, name, phone, status, created_by, owner_type, owner_actor_id, created_at FROM whatsapp_instances WHERE id = ? LIMIT 1",
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
      this.instanceOwnerTypes.set(row.id, row.owner_type === "affiliate" ? "affiliate" : "admin");
      this.instanceOwnerActors.set(row.id, row.owner_actor_id || row.created_by || null);
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
        "SELECT id, name, phone, status, created_by, owner_type, owner_actor_id FROM whatsapp_instances WHERE status IN ('connected', 'connecting', 'qr_ready')"
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
              "SELECT id, name, phone, status, created_by, owner_type, owner_actor_id FROM whatsapp_instances WHERE id = ?",
              [dirId]
            );
            if (dbRows.length > 0) {
              const inst = dbRows[0];
              const credsPath = path.join(config.authDir, dirId, "creds.json");
              try {
                const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
                if (!creds?.registered) {
                  logger.info(`Skipping orphan restore for ${inst.name} — creds not registered (pairing parcial).`);
                  continue;
                }
              } catch {
                logger.info(`Skipping orphan restore for ${inst.name} — creds unreadable.`);
                continue;
              }
              this.instanceOwners.set(inst.id, inst.created_by || null);
              this.instanceOwnerTypes.set(inst.id, inst.owner_type === "affiliate" ? "affiliate" : "admin");
              this.instanceOwnerActors.set(inst.id, inst.owner_actor_id || inst.created_by || null);
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
        this.instanceOwnerTypes.set(row.id, row.owner_type === "affiliate" ? "affiliate" : "admin");
        this.instanceOwnerActors.set(row.id, row.owner_actor_id || row.created_by || null);
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
    if (this.pairingSessions.has(id)) {
      logger.info(`Skipping safeConnect for ${id} — pairing desta sessão em andamento.`);
      return;
    }
    try {
      await this.connectInstance(id);
    } catch (err: any) {
      logger.error(`Failed to restore instance ${id}: ${err.message}`);
    }
  }

  /** Socket WebSocket ainda aberto (não só referência residual no Map). */
  private isSocketAlive(sock: WASocket | undefined | null): boolean {
    if (!sock) return false;
    try {
      const ws = (sock as any).ws;
      if (ws?.isOpen === true) return true;
      if (ws?.readyState === 1) return true;
      if (sock.user) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Health / restore: reconecta se tiver credenciais multi-device e não estiver online.
   * Público para o monitor whatsappHealth.
   */
  async ensureStableConnection(id: string): Promise<"connected" | "connecting" | "skipped" | "no_creds"> {
    if (this.pairingSessions.has(id)) return "skipped";
    const instance = (await this.ensureInstanceLoaded(id)) || this.instances.get(id);
    if (!instance) return "skipped";

    const live = this.sockets.get(id);
    /* Socket vivo com user = online de verdade (mesmo se status em memória driftou). */
    if (this.isSocketAlive(live) && (live as any)?.user) {
      if (instance.status !== "connected") {
        await this.markInstanceConnected(id, instance, live);
      }
      return "connected";
    }
    if (instance.status === "connected" && this.isSocketAlive(live)) {
      return "connected";
    }

    const authPath = path.join(config.authDir, id);
    const credsPath = path.join(authPath, "creds.json");
    if (!fs.existsSync(credsPath)) return "no_creds";
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (!this.isPairingAuthReady(creds) && !creds.registered) return "no_creds";
    } catch {
      return "no_creds";
    }

    logger.info(`ensureStableConnection: reconectando ${instance.name} (${id})`);
    await this.safeConnect(id);
    const after = this.instances.get(id);
    if (after?.status === "connected" && this.isSocketAlive(this.sockets.get(id))) return "connected";
    return "connecting";
  }

  getRuntimeStatus(id: string): "connected" | "disconnected" | "connecting" | "pairing" {
    if (this.pairingSessions.has(id)) return "pairing";
    const inst = this.instances.get(id);
    const sock = this.sockets.get(id);
    const st = String(inst?.status || "").toLowerCase();
    /* Socket autenticado (user presente) = connected, mesmo se status em memória driftou. */
    if (this.isSocketAlive(sock) && (sock as any)?.user) {
      return "connected";
    }
    if (this.isSocketAlive(sock) && (st === "connected" || st === "authenticated" || st === "open")) {
      return "connected";
    }
    if (sock && (st === "connecting" || st === "qr_ready")) return "connecting";
    return "disconnected";
  }

  /** Marca connected em memória + DB de forma idempotente (evita drift reverso). */
  private async markInstanceConnected(
    id: string,
    instance: WhatsAppInstance,
    sock?: WASocket | null,
  ): Promise<void> {
    const user = sock?.user;
    instance.status = "connected";
    if (user) {
      instance.phone = user.id?.split(":")[0] || user.id?.split("@")[0] || instance.phone;
    }
    instance.qrCode = undefined;
    this.instances.set(id, instance);
    this.connectedSince.set(id, Date.now());
    this.retryCount.delete(id);
    this.preconditionCloseCount.delete(id);
    this.consecutiveAckTimeouts.delete(id);
    await this.syncInstanceToDB(instance);
    /* Write-through extra no DB caso sync silencioso falhe parcialmente. */
    try {
      const pool = getPool();
      await pool.execute(
        `UPDATE whatsapp_instances
         SET status = 'connected',
             phone = COALESCE(?, phone),
             last_connected_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [instance.phone || null, id],
      );
    } catch (e: any) {
      logger.warn(`markInstanceConnected DB write-through failed for ${id}: ${e?.message || e}`);
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
      const ownerType = this.instanceOwnerTypes.get(instance.id) || "admin";
      const ownerActorId = this.instanceOwnerActors.get(instance.id) || ownerUserId;
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
           owner_type = COALESCE(owner_type, ?),
           owner_actor_id = COALESCE(owner_actor_id, ?),
           last_connected_at = CASE WHEN ? = 'connected' THEN NOW() ELSE last_connected_at END,
           updated_at = NOW() WHERE id = ?`,
          [instance.name, instance.phone || null, instance.status, ownerUserId, brandId, ownerType, ownerActorId, instance.status, instance.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO whatsapp_instances (id, name, phone, status, created_by, brand_id, owner_type, owner_actor_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [instance.id, instance.name, instance.phone || null, instance.status, ownerUserId, brandId, ownerType, ownerActorId]
        );
      }
    } catch (err: any) {
      logger.error(`DB sync error for ${instance.id}: ${err.message}`);
    }
  }

  // ==================== INSTANCE LIFECYCLE ====================
  async createInstance(
    name: string,
    ownerUserId?: string,
    brandId?: string | null,
    ownerMeta?: { ownerType?: "admin" | "affiliate"; ownerActorId?: string },
  ): Promise<WhatsAppInstance> {
    const id = uuidv4();
    const ownerType = ownerMeta?.ownerType === "affiliate" ? "affiliate" : "admin";
    const ownerActorId = ownerMeta?.ownerActorId || ownerUserId || null;
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
    this.instanceOwnerTypes.set(id, ownerType);
    this.instanceOwnerActors.set(id, ownerActorId);
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);
    logger.info(
      `Instance created: ${name} (${id}) ownerUserId=${ownerUserId || "(none)"} brandId=${brandId || "(none)"} ownerType=${ownerType} ownerActorId=${ownerActorId || "(none)"}`,
    );
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

  isPairingActive(id: string): boolean {
    return this.pairingSessions.has(id);
  }

  getPairingError(id: string): string | null {
    return this.pairingErrors.get(id) || null;
  }

  clearPairingError(id: string): void {
    this.pairingErrors.delete(id);
  }

  /** Código Baileys: 8 caracteres alfanuméricos (ex: ABNF6HHJ). */
  normalizePairingCodeValue(code: string): string {
    return String(code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  /** Normaliza E.164 para pairing — BR mobile ganha o 9 quando faltar. */
  normalizePairingPhoneNumber(phoneNumber: string): string {
    let digits = String(phoneNumber || "").replace(/\D/g, "");
    if (!digits) return digits;

    /* 55 + DDD + 9 duplicado + 8 dígitos (13) → remove 9 extra após DDD */
    const dupMobile = digits.match(/^55(\d{2})9(\d{9})$/);
    if (dupMobile && dupMobile[2].startsWith("9")) {
      digits = `55${dupMobile[1]}9${dupMobile[2].slice(1)}`;
    }

    /* Local BR sem +55: 11 dígitos com 9 duplicado → corrige antes de prefixar */
    const localDup = digits.match(/^(\d{2})9(\d{9})$/);
    if (localDup && localDup[2].startsWith("9")) {
      digits = `55${localDup[1]}9${localDup[2].slice(1)}`;
    } else if (/^\d{10,11}$/.test(digits) && !digits.startsWith("55")) {
      const local = digits;
      if (local.length === 10) {
        const legacy = local.match(/^(\d{2})(\d{8})$/);
        if (legacy) {
          digits = legacy[2].startsWith("99")
            ? `55${legacy[1]}${legacy[2]}`
            : `55${legacy[1]}9${legacy[2]}`;
        }
      } else if (local.length === 11) {
        const modern = local.match(/^(\d{2})9(\d{8})$/);
        if (modern) digits = `55${modern[1]}9${modern[2]}`;
      }
    }

    /* Só promove legado 8 dígitos (sem 9 móvel) ao formato 11 — nunca duplica 9. */
    const legacyEight = digits.match(/^55(\d{2})(\d{8})$/);
    if (legacyEight && !legacyEight[2].startsWith("99")) {
      const variants = this.brazilianVariants(digits);
      const modern = variants.find((v) => /^55\d{2}9\d{8}$/.test(v));
      if (modern) return modern;
    }
    return digits;
  }

  private clearPairingSessionGuard(id: string): void {
    this.pairingSessions.delete(id);
    this.pairingCodeIssued.delete(id);
    const timer = this.pairingSessionTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.pairingSessionTimers.delete(id);
    }
    /* Pairing pausa reconnects globais — retoma offline com creds. */
    if (this.pairingSessions.size === 0) {
      setTimeout(() => this.resumeOfflineSessionsAfterPairing(), 2500);
    }
  }

  /** Após pairing, reativa sessões que ficaram offline sem timer de reconnect. */
  private resumeOfflineSessionsAfterPairing(): void {
    if (this.pairingSessions.size > 0) return;
    let n = 0;
    for (const [instId, inst] of this.instances) {
      if (this.pairingSessions.has(instId)) continue;
      if (inst.status === "connected" && this.isSocketAlive(this.sockets.get(instId))) continue;
      if (this.reconnectTimers.has(instId) || this.connectPromises.has(instId)) continue;
      const credsPath = path.join(config.authDir, instId, "creds.json");
      if (!fs.existsSync(credsPath)) continue;
      n += 1;
      const delay = 1500 + n * 2000;
      setTimeout(() => {
        void this.ensureStableConnection(instId).catch(() => {});
      }, delay);
    }
    if (n > 0) {
      logger.info(`Retomando ${n} sessão(ões) offline após fim do pairing.`);
    }
  }

  private armPairingSessionGuard(id: string): void {
    this.clearPairingSessionGuard(id);
    this.pairingErrors.delete(id);
    this.pairingSessions.add(id);
    this.pauseReconnectForPairing(id);
    const timer = setTimeout(() => {
      if (!this.pairingSessions.has(id)) return;
      logger.warn(`Pairing session TTL expired for ${id} — releasing guard and cleaning socket.`);
      this.pairingErrors.set(
        id,
        "O código expirou. Gere um novo código e digite no WhatsApp em até 2 minutos.",
      );
      this.clearPairingSessionGuard(id);
      this.cleanupSocket(id).catch(() => {});
      const instance = this.instances.get(id);
      if (instance && instance.status !== "connected") {
        instance.status = "disconnected";
        instance.qrCode = undefined;
        this.instances.set(id, instance);
        this.syncInstanceToDB(instance).catch(() => {});
      }
    }, InstanceManager.PAIRING_SESSION_TTL_MS);
    this.pairingSessionTimers.set(id, timer);
  }

  /** Socket morreu antes do vínculo — código no celular deixa de valer. */
  private failPairingSession(id: string, reason: string, statusCode?: number): void {
    if (!this.pairingSessions.has(id)) return;
    const msg =
      statusCode === 428 || statusCode === DisconnectReason.connectionClosed
        ? "A conexão com o WhatsApp caiu antes de vincular. Gere um novo código e tente de novo."
        : reason;
    logger.warn(`Pairing failed for ${id}: ${msg} (status=${statusCode ?? "-"})`);
    this.pairingErrors.set(id, msg);
    this.clearPairingSessionGuard(id);
    const instance = this.instances.get(id);
    if (instance && instance.status !== "connected") {
      instance.status = "disconnected";
      instance.qrCode = undefined;
      this.instances.set(id, instance);
      this.syncInstanceToDB(instance).catch(() => {});
    }
  }

  /** Encerra socket, timers, auth e estado antes de um novo pairing ou QR. */
  async resetSessionForPairing(id: string, opts?: { keepGuard?: boolean }): Promise<void> {
    if (!opts?.keepGuard) this.clearPairingSessionGuard(id);
    const pendingConnect = this.connectPromises.get(id);
    this.connectPromises.delete(id);
    if (pendingConnect) {
      await Promise.race([
        pendingConnect.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    }

    this.intentionalDisconnects.add(id);
    const timer = this.reconnectTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(id);
    }

    await this.cleanupSocket(id);
    this.intentionalDisconnects.delete(id);

    this.retryCount.delete(id);
    this.preconditionCloseCount.delete(id);
    this.consecutiveAckTimeouts.delete(id);
    this.rejectPendingAcksForInstance(id, "pairing-reset");

    const authPath = path.join(config.authDir, id);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
    fs.mkdirSync(authPath, { recursive: true });

    const instance = (await this.ensureInstanceLoaded(id)) || this.instances.get(id);
    if (instance) {
      instance.status = "disconnected";
      instance.qrCode = undefined;
      instance.phone = undefined;
      this.instances.set(id, instance);
      await this.syncInstanceToDB(instance);
    }
  }

  private async connectInstanceInternal(id: string): Promise<string | null> {
    const instance = (await this.ensureInstanceLoaded(id)) || this.instances.get(id);
    if (!instance) throw new Error("Instance not found");

    if (this.pairingSessions.has(id)) {
      logger.info(`Instance ${instance.name} is waiting for pairing code. Skipping QR/reconnect flow.`);
      return null;
    }

    const existingSock = this.sockets.get(id);
    if (instance.status === "connected" && this.isSocketAlive(existingSock)) {
      logger.info(`Instance ${instance.name} is already connected. Skipping reconnect.`);
      return null;
    }

    // Avoid replacing a live connect flow unless we lost the socket reference
    if (instance.status === "connecting" && this.isSocketAlive(existingSock)) {
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

    instance.status = "connecting";
    this.instances.set(id, instance);
    await this.syncInstanceToDB(instance);

    return new Promise((resolve, reject) => {
      let resolved = false;

      /* Mesmo fingerprint do pairing (Ubuntu/Chrome). "Lead System"/Desktop
         gerava 428 e sessões instáveis após pair. */
      const sock = this.makeStableSocket(state);
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

          if (this.intentionalDisconnects.has(id) || this.pairingSessions.has(id)) {
            logger.info(`Intentional disconnect or pairing in progress for ${instance.name}. Skipping reconnect.`);
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          // Handle specific disconnect reasons
          if (statusCode === DisconnectReason.loggedOut) {
            if (this.pairingSessions.has(id)) {
              logger.info(`Instance ${instance.name} logged out during pairing — skipping QR auto-restart.`);
              this.retryCount.delete(id);
              this.preconditionCloseCount.delete(id);
              if (!resolved) { resolved = true; resolve(null); }
              return;
            }
            /* WhatsApp invalidou a sessao (401). Auth files nao valem mais. */
            logger.warn(`Instance ${instance.name} logged out (401). Cleaning auth + auto-restart pra novo pareamento.`);
            this.retryCount.delete(id);
            this.preconditionCloseCount.delete(id);
            const authPath = path.join(config.authDir, id);
            if (fs.existsSync(authPath)) {
              try { fs.rmSync(authPath, { recursive: true }); } catch (e: any) {
                logger.warn(`Failed to clean auth for ${instance.name}: ${e.message}`);
              }
            }

            this.notifySessionInvalidated(id, instance).catch((e: any) => {
              logger.warn(`Failed to send session-invalidated notification: ${e.message}`);
            });

            /* NÃO auto-start QR/connect após 401 — evita loop 428 e spam.
               Usuário reconecta pelo painel (código). */
            if (!resolved) { resolved = true; resolve(null); }
            return;
          }

          if (statusCode === 403) {
            logger.warn(`Instance ${instance.name} forbidden by WhatsApp (403). Stopping reconnects.`);
            this.retryCount.set(id, 9999);
            this.preconditionCloseCount.delete(id);
            const existingTimer403 = this.reconnectTimers.get(id);
            if (existingTimer403) {
              clearTimeout(existingTimer403);
              this.reconnectTimers.delete(id);
            }
            await this.invalidateAuthState(id, instance);
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

          /* 515 restartRequired — reconectar rápido sem penalidade alta. */
          if (statusCode === DisconnectReason.restartRequired) {
            logger.info(`Instance ${instance.name} restartRequired (515) — reconnect imediato.`);
            const existingTimer515 = this.reconnectTimers.get(id);
            if (existingTimer515) clearTimeout(existingTimer515);
            const t515 = setTimeout(async () => {
              this.reconnectTimers.delete(id);
              if (this.pairingSessions.has(id)) return;
              try { await this.connectInstance(id); } catch (err: any) {
                logger.error(`Reconnect 515 failed for ${instance.name}: ${err.message}`);
              }
            }, 1500);
            this.reconnectTimers.set(id, t515);
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
          /* 503 = WA temporariamente indisponível — backoff maior. */
          if (statusCode === 503 || statusCode === DisconnectReason.timedOut) {
            delay = Math.max(delay, 20_000);
          }
          if (statusCode === 428) {
            delay = Math.max(delay, 15_000);
          }
          const nextRetry = retries + 1;
          this.retryCount.set(id, nextRetry);

          if (nextRetry > InstanceManager.MAX_RETRIES_BEFORE_COOLDOWN) {
            delay = InstanceManager.COOLDOWN_DELAY;
            logger.warn(
              `Instance ${instance.name} still offline after ${nextRetry} attempts. Entering cooldown (${delay / 1000}s) and continuing retries.`
            );
          } else {
            logger.info(`Scheduling reconnect for ${instance.name} in ${delay / 1000}s (attempt ${nextRetry}, status=${statusCode})`);
          }

          // Clear any existing timer
          const existingTimer = this.reconnectTimers.get(id);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(async () => {
            this.reconnectTimers.delete(id);
            if (this.pairingSessions.has(id)) {
              logger.info(`Reconnect adiado para ${instance.name} — pairing desta sessão.`);
              return;
            }
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
          await this.markInstanceConnected(id, instance, sock);
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

  async connectWithPairingCode(id: string, phoneNumber: string): Promise<PairingCodeResult> {
    const pending = this.pairingLocks.get(id);
    if (pending) return pending;

    const task = this.connectWithPairingCodeInternal(id, phoneNumber)
      .finally(() => {
        this.pairingLocks.delete(id);
      });
    this.pairingLocks.set(id, task);
    return task;
  }

  /**
   * Socket de sessão já autenticada (reconnect / restore).
   * NÃO usar no fluxo de geração de código — ver makePairingSocket (intocado).
   */
  private makeStableSocket(state: any) {
    const socketLogger = pino({ level: "silent" }) as any;
    return makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
      },
      printQRInTerminal: false,
      logger: socketLogger,
      browser: Browsers.ubuntu("Chrome"),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: true,
      retryRequestDelayMs: 500,
      markOnlineOnConnect: false,
      qrTimeout: 60000,
      syncFullHistory: false,
    });
  }

  /** Socket exclusivo do pareamento por código — NÃO alterar sem teste manual. */
  private makePairingSocket(state: any) {
    /* Ubuntu/Chrome = default Baileys e plataforma WEB_BROWSER.
       macOS("Desktop") gera companion_platform Desktop/DARWIN e o WhatsApp
       encerra com 428 antes do vínculo — erro no celular:
       "Não foi possível conectar o dispositivo". */
    const socketLogger = pino({ level: "silent" }) as any;
    return makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
      },
      printQRInTerminal: false,
      logger: socketLogger,
      browser: Browsers.ubuntu("Chrome"),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: true,
      retryRequestDelayMs: 500,
      markOnlineOnConnect: false,
      qrTimeout: 120000,
      syncFullHistory: false,
    });
  }

  private pauseReconnectForPairing(id: string): void {
    /* Parear uma nova sessão não pode interferir nas demais. Antes, qualquer
       pairing cancelava todos os timers de reconnect do processo. */
    const timer = this.reconnectTimers.get(id);
    if (!timer) return;
    clearTimeout(timer);
    this.reconnectTimers.delete(id);
    logger.info(`Reconnect pausado apenas para ${id} — pairing desta sessão em andamento.`);
  }

  /** Escolhe o E.164 que o WhatsApp reconhece antes de gerar o código. */
  private async resolvePairingPhoneForRequest(sock: WASocket, cleanPhone: string): Promise<string> {
    const normalized = this.normalizePairingPhoneNumber(cleanPhone);
    const variants = [...new Set([normalized, ...this.brazilianVariants(normalized)])];
    const probeMs = 2_500;
    for (const variant of variants) {
      try {
        const results = await Promise.race([
          sock.onWhatsApp(variant),
          new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), probeMs)),
        ]);
        if (!results) {
          logger.warn(`onWhatsApp probe timeout (${probeMs}ms) for ${variant}`);
          continue;
        }
        const hit = results?.[0];
        if (hit?.exists) {
          const digits = String(variant).replace(/\D/g, "");
          logger.info(`Pairing phone resolved via onWhatsApp: ${digits}`);
          return digits;
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (/connection closed|connection failure|logged out/i.test(msg)) {
          logger.warn(`onWhatsApp skipped (socket unstable) — using normalized phone`);
          return normalized;
        }
        logger.warn(`onWhatsApp probe failed for ${variant}: ${msg}`);
      }
    }
    logger.info(`Pairing phone fallback normalize: ${normalized}`);
    return normalized;
  }

  private async bootstrapPairingSocket(
    id: string,
    instance: WhatsAppInstance,
    authPath: string,
  ): Promise<WASocket> {
    await this.cleanupSocket(id);

    let { state, saveCreds } = await useMultiFileAuthState(authPath);
    if (state.creds.registered) {
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
      fs.mkdirSync(authPath, { recursive: true });
      ({ state, saveCreds } = await useMultiFileAuthState(authPath));
    }

    const sock = this.makePairingSocket(state);
    this.sockets.set(id, sock);
    sock.ev.on("creds.update", saveCreds);
    /* NÃO reconectar em registered=true sozinho.
       No fluxo por código, companion_finish marca registered cedo demais —
       o pair-success (account + device JID) ainda não chegou. Matar o socket
       nesse momento gera 401 no celular e no post-reconnect. */
    sock.ev.on("creds.update", (creds) => {
      if (!this.pairingSessions.has(id) || instance.status === "connected") return;
      if (!creds.registered) return;
      if (this.isPairingAuthReady(creds)) {
        logger.info(
          `Pairing multi-device ready for ${instance.name} (account/device) — waiting restart or fallback reconnect.`,
        );
        return;
      }
      logger.info(
        `Pairing companion_finish for ${instance.name} (registered early) — keeping socket open for pair-success.`,
      );
    });
    /* Fallback se o WA não emitir restartRequired após pair-success completo. */
    sock.ev.on("creds.update", (creds) => {
      if (!this.pairingSessions.has(id) || !creds.registered) return;
      if (!this.isPairingAuthReady(creds)) return;
      setTimeout(() => {
        if (instance.status === "connected" || !this.pairingSessions.has(id)) return;
        if (this.pairingReconnecting.has(id)) return;
        logger.info(`Pairing fallback reconnect for ${instance.name} (creds ready, no open yet).`);
        void this.completePairingReconnect(id, instance);
      }, 12_000);
    });
    this.bindPairingSessionHandlers(id, instance, sock);
    return sock;
  }

  /** Credenciais completas pós pair-success (não basta registered do companion_finish). */
  private isPairingAuthReady(creds: any): boolean {
    if (!creds?.registered) return false;
    const meId = String(creds.me?.id || "");
    const hasDevice = meId.includes(":");
    const hasAccount = Boolean(creds.account);
    return hasAccount || hasDevice;
  }

  private async waitForPairingCredsReady(authPath: string, timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const credsPath = path.join(authPath, "creds.json");
        if (fs.existsSync(credsPath)) {
          const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
          if (this.isPairingAuthReady(creds)) return true;
        }
      } catch {
        /* arquivo ainda sendo escrito */
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    return false;
  }

  /** Após o usuário digitar o código, WhatsApp envia restartRequired — reconecta com creds salvas. */
  private async completePairingReconnect(id: string, instance: WhatsAppInstance): Promise<void> {
    if (this.pairingReconnecting.has(id)) return;
    this.pairingReconnecting.add(id);
    const authPath = path.join(config.authDir, id);
    try {
      /* Esperar pair-success gravar account/device — NÃO fechar o socket antes disso. */
      const liveBefore = this.sockets.get(id) as any;
      const socketStillOpen = Boolean(
        liveBefore?.ws?.isOpen === true || liveBefore?.ws?.readyState === 1,
      );
      const ready = await this.waitForPairingCredsReady(authPath, socketStillOpen ? 25_000 : 8_000);
      if (!ready) {
        const liveAfter = this.sockets.get(id) as any;
        const stillOpen = Boolean(
          liveAfter?.ws?.isOpen === true || liveAfter?.ws?.readyState === 1,
        );
        if (stillOpen && this.pairingSessions.has(id)) {
          logger.info(
            `completePairingReconnect: pairing incompleto para ${instance.name} — socket ainda aberto, aguardando pair-success.`,
          );
          return;
        }
        logger.warn(
          `completePairingReconnect: pairing incompleto para ${instance.name} (sem account/device).`,
        );
        this.failPairingSession(
          id,
          "O WhatsApp não concluiu o vínculo a tempo. Gere um novo código e tente de novo.",
        );
        return;
      }

      /* Fluxo de pairing validado em produção — NÃO trocar por connectInstance/handoff. */
      logger.info(`Pairing creds complete for ${instance.name} — reconnecting with saved multi-device auth.`);
      await this.cleanupSocket(id);
      await new Promise((r) => setTimeout(r, 1200));

      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      if (!this.isPairingAuthReady(state.creds)) {
        logger.warn(`completePairingReconnect: creds lost readiness for ${instance.name}`);
        this.failPairingSession(id, "Credenciais incompletas após o código. Gere um novo código.");
        return;
      }

      const sock = this.makePairingSocket(state);
      this.sockets.set(id, sock);
      sock.ev.on("creds.update", saveCreds);
      instance.status = "connecting";
      this.instances.set(id, instance);

      let settled = false;
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "open" && !settled) {
          settled = true;
          this.clearPairingSessionGuard(id);
          this.pairingErrors.delete(id);
          await this.markInstanceConnected(id, instance, sock);
          logger.info(`Instance connected after pairing reconnect: ${instance.name} (${instance.phone})`);
          this.bindPostPairingRuntimeHandlers(id, instance, sock);
        }
        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          if (instance.status === "connected") {
            /* Sessão já vinculada: reconecta pelo caminho estável (não mexer no pair). */
            logger.warn(`Post-pairing session closed for ${instance.name}: status=${statusCode}`);
            instance.status = "disconnected";
            this.instances.set(id, instance);
            await this.syncInstanceToDB(instance);
            if (
              statusCode !== DisconnectReason.loggedOut
              && statusCode !== 401
              && statusCode !== DisconnectReason.connectionReplaced
            ) {
              const delay = statusCode === 503 ? 20_000 : 5_000;
              const existing = this.reconnectTimers.get(id);
              if (existing) clearTimeout(existing);
              const t = setTimeout(() => {
                this.reconnectTimers.delete(id);
                void this.ensureStableConnection(id).catch(() => {});
              }, delay);
              this.reconnectTimers.set(id, t);
            }
            return;
          }
          if (statusCode === DisconnectReason.restartRequired && !settled) {
            logger.info(`Post-pairing restartRequired again for ${instance.name} — retrying once.`);
            setTimeout(() => {
              if (instance.status !== "connected") {
                this.pairingReconnecting.delete(id);
                void this.completePairingReconnect(id, instance);
              }
            }, 1500);
            return;
          }
          if (!settled) {
            settled = true;
            logger.warn(`Post-pairing reconnect closed for ${instance.name}: status=${statusCode}`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
              this.failPairingSession(
                id,
                "O WhatsApp recusou a sessão após o código. Gere um novo código e tente de novo.",
                statusCode,
              );
            } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 428) {
              setTimeout(() => {
                if (instance.status !== "connected" && this.pairingSessions.has(id)) {
                  this.pairingReconnecting.delete(id);
                  void this.completePairingReconnect(id, instance);
                }
              }, 2000);
            }
          }
        }
      });

      setTimeout(() => {
        if (settled || instance.status === "connected") return;
        logger.warn(`Post-pairing reconnect timeout for ${instance.name}`);
        this.failPairingSession(
          id,
          "Tempo esgotado ao finalizar a conexão. Gere um novo código.",
        );
      }, 45_000);
    } catch (err: any) {
      logger.error(`completePairingReconnect failed for ${instance.name}: ${err?.message || err}`);
      this.failPairingSession(
        id,
        "Falha ao finalizar a conexão com o WhatsApp. Gere um novo código.",
      );
    } finally {
      this.pairingReconnecting.delete(id);
    }
  }

  /** Handlers de mensagem/ack após vínculo por código (não altera o handshake de pair). */
  private bindPostPairingRuntimeHandlers(id: string, instance: WhatsAppInstance, sock: WASocket): void {
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) {
          for (const handler of this.globalMessageHandlers) {
            try { handler(id, msg); } catch { /* ignore */ }
          }
          continue;
        }
        instance.messagesReceived++;
        this.instances.set(id, instance);
        const handler = this.messageHandlers.get(id);
        if (handler) handler(msg);
        for (const gHandler of this.globalMessageHandlers) {
          try { gHandler(id, msg); } catch { /* ignore */ }
        }
      }
    });
    sock.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        if (u.update?.status && u.update.status >= 2 && u.key.id) {
          const pending = this.pendingAcks.get(u.key.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingAcks.delete(u.key.id);
            this.consecutiveAckTimeouts.delete(pending.instanceId);
            pending.resolve(true);
          }
        }
      }
    });
  }

  private async connectWithPairingCodeInternal(id: string, phoneNumber: string): Promise<PairingCodeResult> {
    const instance = (await this.ensureInstanceLoaded(id)) || this.instances.get(id);
    if (!instance) throw new Error("Instance not found");

    if (instance.status === "connected" && this.sockets.get(id)) {
      throw new Error("Instancia ja esta conectada");
    }

    const cleanPhone = this.normalizePairingPhoneNumber(phoneNumber);
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      throw new Error("Numero de telefone invalido");
    }

    this.armPairingSessionGuard(id);
    await this.resetSessionForPairing(id, { keepGuard: true });

    const authPath = path.join(config.authDir, id);

    instance.status = "connecting";
    instance.qrCode = undefined;
    this.instances.set(id, instance);

    let sock = await this.bootstrapPairingSocket(id, instance, authPath);

    try {
      /* Baileys: aguardar open ou qr antes de requestPairingCode.
         Nunca regerar código após o primeiro ter sido emitido (invalida no celular). */
      const result = await new Promise<PairingCodeResult>((resolve, reject) => {
        let settled = false;
        let inFlight = false;
        let codeIssued = false;
        let attempts = 0;
        let socketRebuilds = 0;
        let resolvedPhone = cleanPhone;
        const maxAttempts = 6;
        const maxSocketRebuilds = 3;
        let fallbackTimer: NodeJS.Timeout | null = null;
        let onPairingReady: ((update: {
          connection?: string;
          qr?: string;
          lastDisconnect?: { error?: unknown };
        }) => void) | null = null;
        let requestDebounce: NodeJS.Timeout | null = null;

        const scheduleRequestCode = (delayMs = 1500) => {
          if (settled || codeIssued) return;
          if (requestDebounce) clearTimeout(requestDebounce);
          requestDebounce = setTimeout(() => {
            requestDebounce = null;
            if (!settled) requestCode().catch(() => {});
          }, delayMs);
        };

        const detachReady = () => {
          if (onPairingReady) {
            sock.ev.off("connection.update", onPairingReady);
            onPairingReady = null;
          }
        };

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (requestDebounce) clearTimeout(requestDebounce);
          detachReady();
          fn();
        };

        const attachReady = () => {
          detachReady();
          onPairingReady = async (update) => {
            if (codeIssued) return;
            logger.info(
              `Pairing connection.update [${instance.name}]: connection=${update.connection || "-"} qr=${update.qr ? "yes" : "no"}`,
            );

            if (update.connection === "close") {
              const boom = update.lastDisconnect?.error as Boom | undefined;
              const statusCode = (boom as Boom | undefined)?.output?.statusCode;
              if (!settled && !codeIssued && (attempts < maxAttempts || socketRebuilds < maxSocketRebuilds)) {
                inFlight = false;
                const needsRebuild =
                  statusCode === DisconnectReason.loggedOut
                  || statusCode === DisconnectReason.connectionClosed
                  || statusCode === DisconnectReason.connectionLost;
                if (needsRebuild && socketRebuilds < maxSocketRebuilds) {
                  socketRebuilds += 1;
                  logger.info(
                    `Pairing socket rebuild ${socketRebuilds}/${maxSocketRebuilds} for ${instance.name} (status=${statusCode})`,
                  );
                  setTimeout(() => {
                    if (settled) return;
                    this.bootstrapPairingSocket(id, instance, authPath)
                      .then((nextSock) => {
                        if (settled) return;
                        sock = nextSock;
                        attachReady();
                        scheduleRequestCode(2000);
                      })
                      .catch((err: any) => {
                        logger.warn(`Pairing socket rebuild failed: ${err?.message || err}`);
                        scheduleRequestCode(2500);
                      });
                  }, 800);
                  return;
                }
                scheduleRequestCode(2000);
                return;
              }
              if (!codeIssued) {
                finish(() => reject(new Error(boom?.message || "Conexao fechada ao gerar codigo")));
              }
              return;
            }
            if (update.qr) {
              if (requestDebounce) clearTimeout(requestDebounce);
              requestDebounce = null;
              void requestCode();
              return;
            }
            if (update.connection === "connecting" || update.connection === "open") {
              scheduleRequestCode(1200);
            }
          };
          sock.ev.on("connection.update", onPairingReady);
        };

        const requestCode = async () => {
          if (settled || inFlight || codeIssued || attempts >= maxAttempts) return;
          inFlight = true;
          attempts += 1;
          try {
            const fallbackPhone = this.normalizePairingPhoneNumber(cleanPhone);
            resolvedPhone = await Promise.race([
              this.resolvePairingPhoneForRequest(sock, cleanPhone),
              new Promise<string>((resolve) => {
                setTimeout(() => resolve(fallbackPhone), 6_000);
              }),
            ]);
            logger.info(`Pairing requestPairingCode phone for ${instance.name}: ${resolvedPhone}`);
            const pairingCode = await Promise.race([
              sock.requestPairingCode(resolvedPhone),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("requestPairingCode timeout")), 30_000);
              }),
            ]);
            codeIssued = true;
            this.pairingCodeIssued.add(id);
            this.pairingErrors.delete(id);
            finish(() => resolve({ code: pairingCode, phone: resolvedPhone }));
          } catch (err: any) {
            inFlight = false;
            const message = String(err?.message || "Falha ao gerar codigo de pareamento");
            logger.warn(`Pairing attempt ${attempts}/${maxAttempts} failed for ${instance.name}: ${message}`);
            if (attempts >= maxAttempts && socketRebuilds >= maxSocketRebuilds) {
              finish(() => reject(new Error(message)));
              return;
            }
            const unstable = /connection closed|connection failure|logged out|timed out/i.test(message);
            if (unstable && socketRebuilds < maxSocketRebuilds) {
              socketRebuilds += 1;
              logger.info(`Pairing rebuild after error for ${instance.name} (${socketRebuilds}/${maxSocketRebuilds})`);
              try {
                sock = await this.bootstrapPairingSocket(id, instance, authPath);
                attachReady();
              } catch (rebuildErr: any) {
                logger.warn(`Pairing rebuild failed: ${rebuildErr?.message || rebuildErr}`);
              }
            }
            scheduleRequestCode(3000);
          }
        };

        const timer = setTimeout(() => {
          if (!codeIssued) {
            finish(() => reject(new Error("Timeout ao gerar codigo de pareamento")));
          }
        }, 90000);

        fallbackTimer = setTimeout(() => {
          if (!settled && !codeIssued) {
            logger.info(`Pairing fallback for ${instance.name} — requesting code on timer.`);
            scheduleRequestCode(500);
          }
        }, 10000);

        attachReady();
      });

      const normalizedCode = this.normalizePairingCodeValue(result.code);
      if (normalizedCode.length !== 8) {
        throw new Error(`Codigo de pareamento invalido (${normalizedCode.length}/8 caracteres)`);
      }
      logger.info(`Pairing code generated for ${instance.name} (+${result.phone.slice(0, 4)}…${result.phone.slice(-4)})`);
      return { code: normalizedCode, phone: result.phone };
    } catch (err: any) {
      logger.error(`Pairing code request failed for ${instance.name}: ${err?.message || err}`);
      this.clearPairingSessionGuard(id);
      await this.cleanupSocket(id);
      instance.status = "disconnected";
      this.instances.set(id, instance);
      await this.syncInstanceToDB(instance);
      const raw = String(err?.message || "");
      const friendly = /connection failure|connection closed|timeout/i.test(raw)
        ? "Nao foi possivel falar com o WhatsApp agora. Aguarde alguns segundos e tente gerar o codigo de novo."
        : raw || "Falha ao gerar codigo de pareamento. Verifique o numero.";
      throw new Error(friendly);
    }
  }

  private bindPairingSessionHandlers(id: string, instance: WhatsAppInstance, sock: WASocket): void {
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        const creds = sock.authState?.creds as any;
        const fullyPaired = this.isPairingAuthReady(creds);
        if (this.pairingSessions.has(id) && !fullyPaired) {
          logger.info(`Pairing socket open (awaiting code / pair-success) for ${instance.name}.`);
          return;
        }
        this.clearPairingSessionGuard(id);
        this.pairingErrors.delete(id);
        await this.markInstanceConnected(id, instance, sock);
        logger.info(`Instance connected via pairing code: ${instance.name} (${instance.phone})`);
      }

      if (connection === "close") {
        const live = this.instances.get(id);
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        if (this.pairingSessions.has(id) && live?.status !== "connected") {
          const creds = sock.authState?.creds as any;
          const fullyPaired = this.isPairingAuthReady(creds);
          const registeredEarly = Boolean(creds?.registered);

          if (
            statusCode === DisconnectReason.restartRequired
            || (fullyPaired && (statusCode === DisconnectReason.connectionClosed || statusCode === 428))
          ) {
            logger.info(
              `Pairing restart for ${instance.name} (status=${statusCode}, fullyPaired=${fullyPaired}) — completing auth reconnect.`,
            );
            void this.completePairingReconnect(id, instance);
            return;
          }

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            /* 401 no meio do companion_finish (sem account) = código aceito mas sessão incompleta se matamos cedo.
               Se ainda não tem account, falha; se tem, tenta reconnect. */
            if (fullyPaired) {
              logger.info(`Pairing 401 with full creds for ${instance.name} — trying reconnect.`);
              void this.completePairingReconnect(id, instance);
              return;
            }
            logger.warn(`Pairing logged out for ${instance.name} (pre-link). status=${statusCode}`);
            this.failPairingSession(
              id,
              "Sessão encerrada pelo WhatsApp. Gere um novo código.",
              statusCode,
            );
            return;
          }

          /* Código gerado: só reconecta se pair-success já completou (account/device).
             Se só houve companion_finish (registered early), o handshake falhou — novo código. */
          if (this.pairingCodeIssued.has(id)) {
            if (fullyPaired) {
              logger.info(
                `Pairing socket closed with full creds for ${instance.name} (status=${statusCode}) — reconnecting.`,
              );
              void this.completePairingReconnect(id, instance);
              return;
            }
            logger.warn(
              `Pairing socket closed for ${instance.name} before pair-success. status=${statusCode} registeredEarly=${registeredEarly}`,
            );
            this.failPairingSession(
              id,
              registeredEarly
                ? "O WhatsApp aceitou o código mas não finalizou o vínculo. Gere um novo código e tente de novo."
                : "A conexão caiu antes de concluir o vínculo. Gere um novo código.",
              statusCode,
            );
            await this.cleanupSocket(id).catch(() => {});
            return;
          }
          logger.warn(`Pairing socket closed for ${instance.name} before code issued. status=${statusCode}`);
          return;
        }
        if (live?.status === "connected") {
          this.clearPairingSessionGuard(id);
          instance.status = "disconnected";
          instance.qrCode = undefined;
          this.instances.set(id, instance);
          await this.syncInstanceToDB(instance);
          this.connectedSince.delete(id);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) {
          for (const handler of this.globalMessageHandlers) {
            try { handler(id, msg); } catch (e) {}
          }
          continue;
        }
        instance.messagesReceived++;
        this.instances.set(id, instance);
        const handler = this.messageHandlers.get(id);
        if (handler) handler(msg);
        for (const gHandler of this.globalMessageHandlers) {
          try { gHandler(id, msg); } catch (e) {}
        }
      }
    });

    sock.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        if (u.update?.status && u.update.status >= 2 && u.key.id) {
          const pending = this.pendingAcks.get(u.key.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingAcks.delete(u.key.id);
            this.consecutiveAckTimeouts.delete(pending.instanceId);
            pending.resolve(true);
          }
        }
      }
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
    if (this.pairingSessions.has(instanceId)) return;

    const now = Date.now();
    const last = this.zombieRecoveryAt.get(instanceId) || 0;
    if (now - last < InstanceManager.ZOMBIE_COOLDOWN_MS) {
      logger.warn(
        `ZOMBIE skipped for ${instance.name} — cooldown ${Math.ceil((InstanceManager.ZOMBIE_COOLDOWN_MS - (now - last)) / 1000)}s restantes.`,
      );
      this.consecutiveAckTimeouts.delete(instanceId);
      return;
    }

    const upSince = this.connectedSince.get(instanceId);
    if (upSince && now - upSince < InstanceManager.ZOMBIE_MIN_UPTIME_MS) {
      logger.warn(`ZOMBIE skipped for ${instance.name} — sessão subiu há pouco (<${InstanceManager.ZOMBIE_MIN_UPTIME_MS / 1000}s).`);
      this.consecutiveAckTimeouts.delete(instanceId);
      return;
    }

    const sock = this.sockets.get(instanceId);
    if (!sock) return;

    /* Se o socket ainda responde (user presente / ws open), NÃO derruba a sessão.
       ACK timeout em massa costuma ser carga/WA lento, não socket morto. */
    if (this.isSocketAlive(sock) && instance.status === "connected") {
      logger.warn(
        `ZOMBIE soft-reset counters for ${instance.name} — socket ainda vivo; evita reconnect agressivo (401).`,
      );
      this.consecutiveAckTimeouts.delete(instanceId);
      this.zombieRecoveryAt.set(instanceId, now);
      return;
    }

    this.zombieRecoveryAt.set(instanceId, now);
    logger.warn(`ZOMBIE RECOVERY: Forcing reconnect for ${instance.name} (${instanceId})`);
    this.rejectPendingAcksForInstance(instanceId, "zombie_recovery");
    await this.cleanupSocket(instanceId);
    instance.status = "disconnected";
    this.instances.set(instanceId, instance);
    await this.syncInstanceToDB(instance);
    setTimeout(() => this.safeConnect(instanceId), 5000);
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
          const jid = hit.jid || `${variant}@s.whatsapp.net`;
          return { exists: true, jid, triedVariants: variants };
        }
      } catch (err: any) {
        logger.warn(`onWhatsApp probe failed for ${variant}: ${err?.message || err}`);
      }
    }
    return { exists: false, triedVariants: variants };
  }

  async resolvePhoneJid(instanceId: string, phone: string): Promise<string | null> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return null;
    const resolved = await this.resolveWhatsAppTarget(sock, digits);
    return resolved.exists && resolved.jid ? resolved.jid : null;
  }

  /**
   * Gate Saúde/Elegibilidade — obrigatório antes de qualquer envio 1:1.
   * Retorna false se negado; pode reescrever o texto (rodapé 1ª mensagem).
   */
  private async applySendEligibility(
    instanceId: string,
    target: { phone?: string; jid?: string },
    message?: string,
    purposeHint?: WaSendPurpose
  ): Promise<{ allowed: boolean; message?: string; phone: string }> {
    const ctx = getWaSendContext();
    const ownerUserId = this.instanceOwners.get(instanceId) || ctx.userId || null;
    const brandId = this.instanceBrands.get(instanceId) || ctx.brandId || null;
    const decision = await whatsappSendEligibility.assertCanSend({
      phone: target.phone,
      jid: target.jid,
      instanceId,
      userId: ownerUserId,
      brandId,
      purpose: purposeHint || ctx.purpose,
      source: ctx.source,
      content: message ?? ctx.content,
      brandName: ctx.brandName,
      contactOrigin: ctx.contactOrigin,
      skipIdentifyFooter: ctx.skipIdentifyFooter,
      skipRateLimits: ctx.skipRateLimits,
    });
    if (!decision.ok) {
      logger.warn(
        `[wa_eligibility] deny instance=${instanceId} code=${decision.code} purpose=${decision.purpose}: ${decision.reason}`
      );
      return { allowed: false, phone: decision.phone };
    }
    return {
      allowed: true,
      phone: decision.phone,
      message: "messageOut" in decision ? decision.messageOut : message,
    };
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
      const gate = await this.applySendEligibility(instanceId, { phone: digits }, message);
      if (!gate.allowed) return false;
      const textOut = gate.message ?? message;

      const resolved = await this.resolveWhatsAppTarget(sock, digits);
      if (!resolved.exists || !resolved.jid) {
        logger.warn(`Number ${phone} not on WhatsApp (tried: ${resolved.triedVariants.join(", ")})`);
        return false;
      }
      const result: any = await sock.sendMessage(resolved.jid, { text: textOut });
      const messageId: string | undefined = result?.key?.id;

      /* HONESTIDADE: so retorna true se o WhatsApp confirmar SERVER_ACK em ate 5s.
         Se nao tem messageId (raro - Baileys nao retornou key) ou nao recebe ack,
         consideramos a msg perdida e retornamos false pra quem chamou marcar como failed. */
      let ackOk = true;
      if (messageId) {
        ackOk = await this.waitForAck(messageId, instanceId);
        if (!ackOk) {
          logger.warn(`Message to ${phone} sent locally but NO WhatsApp ack in ${InstanceManager.DEFAULT_ACK_TIMEOUT_MS}ms (instance=${instance.name}, mid=${messageId})`);
          await whatsappSendEligibility.markFailed({
            phone: digits,
            instanceId,
            code: "no_ack",
          });
          return false;
        }
      } else {
        logger.warn(`Message to ${phone} sent but Baileys did not return messageId — cannot confirm ack`);
      }

      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      await whatsappSendEligibility.markSent({
        phone: digits,
        instanceId,
        content: textOut,
      });
      logger.info(`Message sent from ${instance.name} to ${phone} (jid=${resolved.jid})${messageId ? ` mid=${messageId}` : ''}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message: ${error.message}`);
      await whatsappSendEligibility.markFailed({
        phone: phone.replace(/\D/g, ""),
        instanceId,
        code: "exception",
      });
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
      const phoneHint = phoneFromJid(targetJid) || phoneFromJid(jid);
      const isGroup = targetJid.endsWith("@g.us");
      const gate = await this.applySendEligibility(
        instanceId,
        { phone: phoneHint || undefined, jid: targetJid },
        message,
        isGroup ? "service" : getWaSendContext().purpose || "human_reply"
      );
      if (!gate.allowed) return false;
      const textOut = gate.message ?? message;

      const result: any = await sock.sendMessage(targetJid, { text: textOut });
      const messageId: string | undefined = result?.key?.id;

      let ackOk = true;
      if (messageId) {
        ackOk = await this.waitForAck(messageId, instanceId);
        if (!ackOk) {
          logger.warn(`Message to ${targetJid} sent locally but NO WhatsApp ack in ${InstanceManager.DEFAULT_ACK_TIMEOUT_MS}ms (instance=${instance.name}, mid=${messageId})`);
          if (phoneHint) {
            await whatsappSendEligibility.markFailed({ phone: phoneHint, instanceId, code: "no_ack" });
          }
          return false;
        }
      } else {
        logger.warn(`Message to ${targetJid} sent but Baileys did not return messageId — cannot confirm ack`);
      }

      instance.messagessSent++;
      this.instances.set(instanceId, instance);
      if (phoneHint) {
        await whatsappSendEligibility.markSent({ phone: phoneHint, instanceId, content: textOut });
      }
      logger.info(`Message sent from ${instance.name} to ${targetJid}${messageId ? ` mid=${messageId}` : ''}`);
      return true;
    } catch (error: any) {
      logger.error(`Error sending message by JID: ${error.message}`);
      return false;
    }
  }

  async fetchContactName(instanceId: string, jid: string): Promise<string | null> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") return null;

    try {
      const status = await sock.fetchStatus(jid);
      if (status && (status as any).status?.setAt) {
        // fetchStatus returns "about" text, not name — try business profile instead
      }
    } catch {}

    try {
      const biz = await (sock as any).getBusinessProfile(jid);
      if (biz?.profile?.name) return String(biz.profile.name).trim();
      if (biz?.name) return String(biz.name).trim();
    } catch {}

    try {
      const store = (sock as any).store;
      const contact = store?.contacts?.[jid];
      if (contact) {
        const name = contact.notify || contact.name || contact.pushName;
        if (name) return String(name).trim();
      }
    } catch {}

    return null;
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
      const phoneHint = phoneFromJid(targetJid) || phoneFromJid(jid);
      const gate = await this.applySendEligibility(
        instanceId,
        { phone: phoneHint || undefined, jid: targetJid },
        input.caption || "[media]"
      );
      if (!gate.allowed) return false;
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

  /**
   * WhatsApp exige nós binários extras (biz/interactive/native_flow + bot em 1:1)
   * para renderizar InteractiveMessage.NativeFlowMessage. Sem isso o relay “sai”
   * localmente mas o servidor não confirma (NO ACK) e o destino não recebe botões.
   *
   * Estrutura alinhada ao tráfego do cliente oficial / helpers estáveis (v=9 name=mixed
   * para quick_reply + single_select genéricos).
   */
  private buildNativeFlowAdditionalNodes(
    targetJid: string,
    flowName: string = "mixed"
  ): Array<{ tag: string; attrs: Record<string, string>; content?: any[] }> {
    const nodes: Array<{ tag: string; attrs: Record<string, string>; content?: any[] }> = [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [
              {
                tag: "native_flow",
                attrs: { name: flowName, v: "9" },
              },
            ],
          },
        ],
      },
    ];

    // Contato 1:1 precisa do marcador de bot de negócio para o client habilitar o flow.
    if (!isJidGroup(targetJid)) {
      nodes.push({
        tag: "bot",
        attrs: { biz_bot: "1" },
      });
    }

    return nodes;
  }

  private async sendProtoMessageByJid(
    instanceId: string,
    jid: string,
    content: proto.IMessage,
    options?: {
      additionalNodes?: Array<{ tag: string; attrs: Record<string, string>; content?: any[] }>;
      label?: string;
      /** Se true, deriva additionalNodes a partir do conteúdo normalizado (native flow). */
      autoNativeFlowNodes?: boolean;
    }
  ): Promise<boolean> {
    const sock = this.sockets.get(instanceId);
    const instance = this.instances.get(instanceId);
    if (!sock || !instance || instance.status !== "connected") {
      throw new Error("Instance not connected");
    }

    const targetJid = await this.resolveSendTargetJid(sock, jid);
    const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
    if (!userJid) throw new Error("Socket user not available");

    const messageId = generateMessageIDV2(userJid);
    const fullMsg = generateWAMessageFromContent(targetJid, content, {
      userJid,
      messageId,
    });
    if (!fullMsg.message || !fullMsg.key?.id) {
      throw new Error("Failed to build WhatsApp message");
    }

    let additionalNodes = [...(options?.additionalNodes || [])];
    if (options?.autoNativeFlowNodes) {
      const normalized = normalizeMessageContent(fullMsg.message) as proto.IMessage | null | undefined;
      const hasNativeFlow = Boolean(
        (normalized as any)?.interactiveMessage?.nativeFlowMessage ||
          (fullMsg.message as any)?.interactiveMessage?.nativeFlowMessage
      );
      if (hasNativeFlow) {
        additionalNodes = [
          ...additionalNodes,
          ...this.buildNativeFlowAdditionalNodes(targetJid, "mixed"),
        ];
      }
    }

    await sock.relayMessage(targetJid, fullMsg.message, {
      messageId: fullMsg.key.id,
      ...(additionalNodes.length ? { additionalNodes } : {}),
    });

    let ackOk = true;
    ackOk = await this.waitForAck(fullMsg.key.id, instanceId);
    if (!ackOk) {
      logger.warn(
        `Proto message${options?.label ? ` (${options.label})` : ""} to ${targetJid} sent locally but NO WhatsApp ack in ${InstanceManager.DEFAULT_ACK_TIMEOUT_MS}ms (instance=${instance.name}, mid=${fullMsg.key.id}, nodes=${additionalNodes.map((n) => n.tag).join("+") || "none"})`
      );
      return false;
    }

    instance.messagessSent++;
    this.instances.set(instanceId, instance);
    return true;
  }

  async sendButtonsByJid(
    instanceId: string,
    jid: string,
    input: {
      body: string;
      footer?: string;
      buttons: Array<{ id: string; text: string }>;
      deliveryMode?: InteractiveDeliveryMode;
    }
  ): Promise<InteractiveSendResult> {
    const deliveryMode: InteractiveDeliveryMode = input.deliveryMode || "auto";
    const phoneHint = phoneFromJid(jid);
    const gate = await this.applySendEligibility(
      instanceId,
      { phone: phoneHint || undefined, jid },
      String(input.body || "")
    );
    if (!gate.allowed) {
      return { ok: false, mode: "native", error: "eligibility_denied" };
    }
    if (gate.message) input = { ...input, body: gate.message };

    const normalizedButtons = (input.buttons || [])
      .map((button, index) => ({
        id: String(button.id || `btn_${index + 1}`).trim(),
        text: String(button.text || "").trim(),
      }))
      .filter((button) => button.id && button.text)
      .slice(0, 3);

    if (!String(input.body || "").trim()) {
      return { ok: false, mode: "native", error: "body_required" };
    }
    if (normalizedButtons.length < 1) {
      return { ok: false, mode: "native", error: "buttons_required" };
    }

    const fallbackText = [
      String(input.body).trim(),
      "",
      ...normalizedButtons.map((button, index) => `${index + 1}) ${button.text}`),
      "",
      "Responda com o numero da opcao escolhida.",
    ]
      .join("\n")
      .trim();

    const footerText = input.footer ? String(input.footer).trim() : "";
    // NÃO usar viewOnceMessage: com nativeFlow o WA renderiza botões cinza/desativados.
    // Formato estável: interactiveMessage na raiz + nós biz/bot no relay.
    const buttonsPayload = {
      interactiveMessage: {
        body: { text: String(input.body).trim() },
        ...(footerText ? { footer: { text: footerText } } : {}),
        nativeFlowMessage: {
          buttons: normalizedButtons.map((button) => ({
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: button.text,
              id: button.id,
            }),
          })),
        },
      },
    } as proto.IMessage;

    try {
      if (deliveryMode !== "text_only") {
        const sent = await this.sendProtoMessageByJid(instanceId, jid, buttonsPayload, {
          autoNativeFlowNodes: true,
          label: "buttons-native-flow",
        });
        if (!sent) {
          if (deliveryMode === "native_only") {
            return { ok: false, mode: "native", error: "native_send_failed_no_ack" };
          }
          throw new Error("native_send_failed_no_ack");
        }
        logger.info(`Native-flow buttons sent from instance ${instanceId} to ${jid}`);
        if (phoneHint) {
          await whatsappSendEligibility.markSent({
            phone: phoneHint,
            instanceId,
            content: String(input.body || ""),
          });
        }
        return { ok: true, mode: "native_flow" };
      }
    } catch (error: any) {
      const nativeError = String(error?.message || "unknown_native_buttons_error");
      logger.error(`Error sending buttons by JID: ${nativeError}`);
      if (deliveryMode === "native_only") {
        return { ok: false, mode: "native", error: nativeError };
      }

      try {
        const sentFallback = await this.sendMessageByJid(instanceId, jid, fallbackText);
        if (!sentFallback) {
          return { ok: false, mode: "text_fallback", error: "fallback_send_failed", nativeError };
        }
        logger.warn(`Buttons fallback text sent from instance ${instanceId} to ${jid}`);
        return { ok: true, mode: "text_fallback", nativeError };
      } catch (fallbackError: any) {
        return {
          ok: false,
          mode: "text_fallback",
          error: String(fallbackError?.message || "unknown_fallback_error"),
          nativeError,
        };
      }
    }

    try {
      const sentTextOnly = await this.sendMessageByJid(instanceId, jid, fallbackText);
      if (!sentTextOnly) {
        return { ok: false, mode: "text_fallback", error: "text_only_send_failed" };
      }
      logger.info(`Text-only buttons sent from instance ${instanceId} to ${jid}`);
      return { ok: true, mode: "text_fallback" };
    } catch (error: any) {
      return { ok: false, mode: "text_fallback", error: String(error?.message || "unknown_text_only_error") };
    }
  }

  async sendListByJid(
    instanceId: string,
    jid: string,
    input: {
      title: string;
      description: string;
      buttonText: string;
      footer?: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
      deliveryMode?: InteractiveDeliveryMode;
    }
  ): Promise<InteractiveSendResult> {
    const deliveryMode: InteractiveDeliveryMode = input.deliveryMode || "auto";
    const phoneHint = phoneFromJid(jid);
    const gate = await this.applySendEligibility(
      instanceId,
      { phone: phoneHint || undefined, jid },
      String(input.description || input.title || "")
    );
    if (!gate.allowed) {
      return { ok: false, mode: "native", error: "eligibility_denied" };
    }
    if (gate.message) input = { ...input, description: gate.message };

    const normalizedSections = (input.sections || [])
      .map((section) => ({
        title: section.title ? String(section.title).trim() : undefined,
        rows: (section.rows || [])
          .map((row, index) => ({
            id: String(row.id || `row_${index + 1}`).trim(),
            title: String(row.title || "").trim(),
            description: row.description ? String(row.description).trim() : undefined,
          }))
          .filter((row) => row.id && row.title),
      }))
      .filter((section) => section.rows.length > 0);

    const flatRows = normalizedSections.flatMap((section) => section.rows).slice(0, 10);
    if (!String(input.title || "").trim()) {
      return { ok: false, mode: "native", error: "title_required" };
    }
    if (!String(input.description || "").trim()) {
      return { ok: false, mode: "native", error: "description_required" };
    }
    if (!String(input.buttonText || "").trim()) {
      return { ok: false, mode: "native", error: "button_text_required" };
    }
    if (flatRows.length < 1) {
      return { ok: false, mode: "native", error: "rows_required" };
    }

    const fallbackText = [
      `*${String(input.title).trim()}*`,
      String(input.description).trim(),
      "",
      ...normalizedSections.flatMap((section) => [
        section.title ? `*${section.title}*` : null,
        ...section.rows.map((row, index) =>
          row.description
            ? `${index + 1}) ${row.title} — ${row.description}`
            : `${index + 1}) ${row.title}`
        ),
      ].filter(Boolean) as string[]),
      "",
      "Responda com o numero da opcao escolhida.",
    ]
      .join("\n")
      .trim();

    const listFooter = input.footer ? String(input.footer).trim() : "";
    const listTitle = String(input.title).trim();
    // Mesmo padrão dos botões: interactiveMessage na raiz (sem viewOnce).
    const listPayload = {
      interactiveMessage: {
        ...(listTitle
          ? {
              header: {
                title: listTitle,
                hasMediaAttachment: false,
              },
            }
          : {}),
        body: { text: String(input.description).trim() },
        ...(listFooter ? { footer: { text: listFooter } } : {}),
        nativeFlowMessage: {
          buttons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: String(input.buttonText).trim(),
                sections: normalizedSections.map((section) => ({
                  title: section.title || "",
                  rows: section.rows.map((row) => ({
                    id: row.id,
                    title: row.title,
                    description: row.description || "",
                  })),
                })),
              }),
            },
          ],
        },
      },
    } as proto.IMessage;

    try {
      if (deliveryMode !== "text_only") {
        const sent = await this.sendProtoMessageByJid(instanceId, jid, listPayload, {
          autoNativeFlowNodes: true,
          label: "list-native-flow",
        });
        if (!sent) {
          if (deliveryMode === "native_only") {
            return { ok: false, mode: "native", error: "native_send_failed_no_ack" };
          }
          throw new Error("native_send_failed_no_ack");
        }
        logger.info(`Native-flow list sent from instance ${instanceId} to ${jid}`);
        return { ok: true, mode: "native_flow" };
      }
    } catch (error: any) {
      const nativeError = String(error?.message || "unknown_native_list_error");
      logger.error(`Error sending list by JID: ${nativeError}`);
      if (deliveryMode === "native_only") {
        return { ok: false, mode: "native", error: nativeError };
      }

      try {
        const sentFallback = await this.sendMessageByJid(instanceId, jid, fallbackText);
        if (!sentFallback) {
          return { ok: false, mode: "text_fallback", error: "fallback_send_failed", nativeError };
        }
        logger.warn(`List fallback text sent from instance ${instanceId} to ${jid}`);
        return { ok: true, mode: "text_fallback", nativeError };
      } catch (fallbackError: any) {
        return {
          ok: false,
          mode: "text_fallback",
          error: String(fallbackError?.message || "unknown_fallback_error"),
          nativeError,
        };
      }
    }

    try {
      const sentTextOnly = await this.sendMessageByJid(instanceId, jid, fallbackText);
      if (!sentTextOnly) {
        return { ok: false, mode: "text_fallback", error: "text_only_send_failed" };
      }
      logger.info(`Text-only list sent from instance ${instanceId} to ${jid}`);
      return { ok: true, mode: "text_fallback" };
    } catch (error: any) {
      return { ok: false, mode: "text_fallback", error: String(error?.message || "unknown_text_only_error") };
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

  getInstanceOwnerType(id: string): "admin" | "affiliate" {
    return this.instanceOwnerTypes.get(id) || "admin";
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

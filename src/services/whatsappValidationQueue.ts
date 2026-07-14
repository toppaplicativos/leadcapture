/**
 * Fila de validação WhatsApp assíncrona.
 * Captura NÃO valida na hora; enfileira e processa em background com rate limit.
 * Só valida leads ainda NÃO validados; já validados recebem tag "validado".
 */
import { logger } from "../utils/logger";

export type ValidationQueueItem = {
  leadId: string;
  userId: string;
  brandId: string | null;
  enqueuedAt: number;
};

type QueueHandlers = {
  getLead: (leadId: string, userId: string, brandId: string | null) => Promise<any | null>;
  updateValidation: (
    leadId: string,
    payload: {
      hasWhatsApp: boolean;
      checkedAt: string;
      instanceId: string;
      normalizedPhone?: string;
      jid?: string | null;
      status: "valid" | "invalid";
    },
    userId: string,
    brandId: string | null
  ) => Promise<any>;
  ensureValidatedTag: (leadId: string, userId: string, brandId: string | null) => Promise<void>;
  checkNumber: (instanceId: string, phone: string) => Promise<{
    exists: boolean;
    normalizedPhone?: string;
    jid?: string | null;
  }>;
  resolveInstance: (userId: string) => Promise<string | null>;
};

const queue: ValidationQueueItem[] = [];
const inQueue = new Set<string>();
let processing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let handlers: QueueHandlers | null = null;

const TICK_MS = 2_500;
const BATCH_PER_TICK = 3;
const MAX_QUEUE = 5_000;

function itemKey(userId: string, leadId: string) {
  return `${userId}:${leadId}`;
}

export function configureWhatsAppValidationQueue(h: QueueHandlers): void {
  handlers = h;
}

export function enqueueWhatsAppValidation(
  userId: string,
  brandId: string | null | undefined,
  leadIds: Array<string | number>
): number {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  let added = 0;
  const bid = brandId ? String(brandId) : null;
  for (const raw of leadIds || []) {
    const leadId = String(raw || "").trim();
    if (!leadId) continue;
    const key = itemKey(uid, leadId);
    if (inQueue.has(key)) continue;
    if (queue.length >= MAX_QUEUE) {
      logger.warn(`[WaValidationQueue] full (${MAX_QUEUE}) — dropping further enqueues`);
      break;
    }
    inQueue.add(key);
    queue.push({ leadId, userId: uid, brandId: bid, enqueuedAt: Date.now() });
    added++;
  }
  if (added > 0) {
    logger.info(`[WaValidationQueue] +${added} (size=${queue.length}) user=${uid.slice(0, 8)}`);
  }
  return added;
}

export function getWhatsAppValidationQueueStats() {
  return { size: queue.length, processing };
}

function normalizePhone(phone: unknown): string {
  return String(phone || "").replace(/\D/g, "");
}

export function isLeadAlreadyWhatsAppValidated(lead: any): boolean {
  if (!lead) return true;
  const details =
    typeof lead.source_details === "string"
      ? (() => {
          try {
            return JSON.parse(lead.source_details);
          } catch {
            return {};
          }
        })()
      : lead.source_details || {};
  const v = details?.whatsapp_validation || {};
  if (v.has_whatsapp === true || v.has_whatsapp === false) return true;
  if (v.status === "valid" || v.status === "invalid") return true;
  if (v.checked_at) return true;
  if (lead.has_whatsapp === true || lead.has_whatsapp === false) return true;
  if (lead.has_whatsapp === 0 || lead.has_whatsapp === 1) return true;
  if (lead.whatsapp_valid === true || lead.whatsapp_valid === false) return true;
  if (lead.whatsapp_valid === 0 || lead.whatsapp_valid === 1) return true;
  const st = String(lead.whatsapp_validation_status || "").toLowerCase();
  if (st === "valid" || st === "invalid") return true;
  if (lead.whatsapp_validated_at || lead.whatsapp_verified_at || lead.whatsapp_checked_at) return true;
  let tags: string[] = [];
  try {
    tags = Array.isArray(lead.tags)
      ? lead.tags.map(String)
      : typeof lead.tags === "string"
        ? JSON.parse(lead.tags || "[]")
        : [];
  } catch {
    tags = [];
  }
  if (
    tags.some((t) => {
      const x = String(t).toLowerCase();
      return x === "validado" || x === "whatsapp_validado" || x === "wa_validado";
    })
  ) {
    return true;
  }
  return false;
}

async function processOne(item: ValidationQueueItem): Promise<void> {
  const key = itemKey(item.userId, item.leadId);
  try {
    if (!handlers) return;
    const lead = await handlers.getLead(item.leadId, item.userId, item.brandId);
    if (!lead) return;
    if (isLeadAlreadyWhatsAppValidated(lead)) {
      await handlers.ensureValidatedTag(item.leadId, item.userId, item.brandId);
      return;
    }
    const phone = normalizePhone((lead as any).phone);
    if (!phone || phone.length < 8) return;

    const instanceId = await handlers.resolveInstance(item.userId);
    if (!instanceId) {
      if (queue.length < MAX_QUEUE) {
        queue.push({ ...item, enqueuedAt: Date.now() });
        inQueue.add(key);
      }
      return;
    }

    const check = await handlers.checkNumber(instanceId, phone);
    const checkedAt = new Date().toISOString();
    await handlers.updateValidation(
      item.leadId,
      {
        hasWhatsApp: check.exists,
        checkedAt,
        instanceId,
        normalizedPhone: check.normalizedPhone,
        jid: check.jid || undefined,
        status: check.exists ? "valid" : "invalid",
      },
      item.userId,
      item.brandId
    );
  } catch (err: any) {
    logger.warn(`[WaValidationQueue] lead=${item.leadId}: ${err?.message || err}`);
  } finally {
    inQueue.delete(key);
  }
}

async function tick(): Promise<void> {
  if (processing) return;
  if (!queue.length) return;
  if (!handlers) return;
  processing = true;
  try {
    for (let i = 0; i < BATCH_PER_TICK && queue.length; i++) {
      const item = queue.shift();
      if (!item) break;
      await processOne(item);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    }
  } finally {
    processing = false;
  }
}

export function startWhatsAppValidationQueue(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  logger.info("[WaValidationQueue] started");
}

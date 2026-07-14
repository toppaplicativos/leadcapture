/**
 * Delivery confirmation OTP via WhatsApp (Lead Capture Mob).
 */
import { createHash, randomInt } from "crypto";
import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import { getInstanceManagerRef } from "./whatsappHealth";

function hashOtp(code: string, deliveryId: string): string {
  return createHash("sha256").update(`${deliveryId}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 999999));
}

async function resolveWhatsAppInstance(
  ownerUserId: string,
  brandId: string
): Promise<string | null> {
  // Prefer logistics-tagged instance, else any connected brand instance
  const preferred = await queryOne<any>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ? AND brand_id = ?
       AND (status = 'connected' OR status = 'open')
     ORDER BY
       CASE WHEN LOWER(COALESCE(name,'')) LIKE '%logist%' OR LOWER(COALESCE(name,'')) LIKE '%entrega%' THEN 0 ELSE 1 END,
       updated_at DESC NULLS LAST
     LIMIT 1`,
    [ownerUserId, brandId]
  ).catch(() => null);
  if (preferred?.id) return String(preferred.id);

  const any = await queryOne<any>(
    `SELECT id FROM whatsapp_instances
     WHERE created_by = ?
       AND (status = 'connected' OR status = 'open')
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [ownerUserId]
  ).catch(() => null);
  return any?.id ? String(any.id) : null;
}

export async function issueDeliveryOtp(input: {
  deliveryId: string;
  ownerUserId: string;
  brandId: string;
  customerPhone: string;
  customerName?: string | null;
  ttlSeconds?: number;
}): Promise<{ ok: boolean; expires_at: string; sent_via: "whatsapp" | "stored"; masked_phone: string }> {
  const phone = String(input.customerPhone || "").replace(/\D/g, "");
  if (phone.length < 10) throw new Error("Telefone do cliente inválido para OTP");

  const code = generateCode();
  const ttl = Math.max(60, Math.min(input.ttlSeconds || 300, 900));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const otpHash = hashOtp(code, input.deliveryId);

  await update(
    `UPDATE mob_deliveries
     SET delivery_otp_hash = ?, delivery_otp_expires_at = ?, delivery_otp_attempts = 0, updated_at = NOW()
     WHERE id = ?`,
    [otpHash, expiresAt, input.deliveryId]
  );

  const masked = phone.length >= 4 ? `***${phone.slice(-4)}` : "****";
  const name = String(input.customerName || "cliente").split(" ")[0];
  const message =
    `🔐 *Lead Capture Mob*\n` +
    `Olá ${name}! Seu código de confirmação de entrega é:\n\n` +
    `*${code}*\n\n` +
    `Válido por ${Math.round(ttl / 60)} min. Não compartilhe com estranhos — apenas com o entregador no local.`;

  let sentVia: "whatsapp" | "stored" = "stored";
  try {
    const im = getInstanceManagerRef();
    const instanceId = await resolveWhatsAppInstance(input.ownerUserId, input.brandId);
    if (im && instanceId && typeof (im as any).sendMessage === "function") {
      const ok = await (im as any).sendMessage(instanceId, phone, message).catch((e: any) => {
        logger.warn({ err: e?.message }, "mob OTP WA send failed");
        return false;
      });
      if (ok) sentVia = "whatsapp";
    }
  } catch (e: any) {
    logger.warn({ err: e?.message }, "mob OTP send error");
  }

  // In non-prod, log code for smoke tests
  if (process.env.NODE_ENV !== "production") {
    logger.info({ deliveryId: input.deliveryId, code }, "mob OTP (dev)");
  }

  return { ok: true, expires_at: expiresAt, sent_via: sentVia, masked_phone: masked };
}

export async function verifyDeliveryOtp(input: {
  deliveryId: string;
  code: string;
  maxAttempts?: number;
}): Promise<{ ok: boolean }> {
  const row = await queryOne<any>(
    `SELECT delivery_otp_hash, delivery_otp_expires_at, delivery_otp_attempts
     FROM mob_deliveries WHERE id = ? LIMIT 1`,
    [input.deliveryId]
  );
  if (!row?.delivery_otp_hash) throw new Error("Nenhum OTP ativo. Solicite um novo código.");
  if (row.delivery_otp_expires_at && new Date(row.delivery_otp_expires_at) < new Date()) {
    throw new Error("OTP expirado. Solicite um novo código.");
  }

  const max = Math.max(3, Math.min(input.maxAttempts || 5, 10));
  const attempts = Number(row.delivery_otp_attempts || 0);
  if (attempts >= max) throw new Error("OTP bloqueado por excesso de tentativas");

  const code = String(input.code || "").replace(/\D/g, "");
  const expected = String(row.delivery_otp_hash);
  const got = hashOtp(code, input.deliveryId);

  if (got !== expected) {
    await update(
      `UPDATE mob_deliveries SET delivery_otp_attempts = delivery_otp_attempts + 1, updated_at = NOW() WHERE id = ?`,
      [input.deliveryId]
    );
    throw new Error(`OTP inválido. Tentativa ${attempts + 1} de ${max}.`);
  }

  await update(
    `UPDATE mob_deliveries
     SET delivery_otp_hash = NULL, delivery_otp_expires_at = NULL, delivery_otp_attempts = 0,
         delivery_otp_verified_at = NOW(), updated_at = NOW()
     WHERE id = ?`,
    [input.deliveryId]
  );
  return { ok: true };
}

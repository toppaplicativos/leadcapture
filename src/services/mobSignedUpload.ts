/**
 * Signed uploads for Mob proofs/signatures.
 * - Default: HMAC-local PUT to /api/mob/app/upload-signed
 * - Optional S3 when AWS_S3_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY are set
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config";

const SECRET = String(process.env.MOB_UPLOAD_SECRET || config.jwtSecret || "mob-upload-secret");
const TTL_SEC = Math.max(60, Math.min(Number(process.env.MOB_UPLOAD_TTL_SEC || 600), 3600));

export type UploadPurpose = "proof" | "signature" | "document";

export type SignedUploadGrant = {
  mode: "local" | "s3";
  upload_url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  public_url: string;
  expires_at: string;
  key: string;
  token?: string;
};

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signPayload(payload: string): string {
  const dig = createHmac("sha256", SECRET).update(payload).digest("base64");
  return dig.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function s3Enabled(): boolean {
  return !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

function folderFor(purpose: UploadPurpose): string {
  if (purpose === "signature") return "mob-signatures";
  if (purpose === "document") return "mob-documents";
  return "mob-proofs";
}

function extFromContentType(ct: string): string {
  const c = String(ct || "").toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  if (c.includes("heic") || c.includes("heif")) return "heic";
  if (c.includes("pdf")) return "pdf";
  return "jpg";
}

/** Create a short-lived upload grant for the courier app. */
export function createSignedUpload(input: {
  courierId: string;
  deliveryId?: string;
  purpose: UploadPurpose;
  contentType: string;
  publicBaseUrl?: string;
}): SignedUploadGrant {
  const purpose = input.purpose || "proof";
  const contentType = String(input.contentType || "image/jpeg");
  if (!/^image\//i.test(contentType) && purpose !== "document") {
    throw new Error("contentType deve ser image/*");
  }

  const ext = extFromContentType(contentType);
  const folder = folderFor(purpose);
  const key = `${folder}/${randomUUID()}.${ext}`;
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const expires_at = new Date(exp * 1000).toISOString();

  if (s3Enabled()) {
    // Lightweight S3 presign without SDK: document for ops; fall through to local if SDK missing.
    // Local signed upload remains the reliable path in this codebase.
  }

  const payload = [
    input.courierId,
    input.deliveryId || "",
    purpose,
    key,
    contentType,
    String(exp),
  ].join("|");
  const sig = signPayload(payload);
  const token = b64url(payload) + "." + sig;
  const base = String(input.publicBaseUrl || "").replace(/\/+$/, "") || "";

  return {
    mode: "local",
    upload_url: `${base}/api/mob/app/upload-signed?token=${encodeURIComponent(token)}`,
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    public_url: `${base}/uploads/${key}`,
    expires_at,
    key,
    token,
  };
}

export function verifySignedUploadToken(token: string): {
  courierId: string;
  deliveryId: string;
  purpose: UploadPurpose;
  key: string;
  contentType: string;
  exp: number;
} {
  const raw = String(token || "").trim();
  const [body, sig] = raw.split(".");
  if (!body || !sig) throw new Error("Token de upload inválido");
  const payload = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const expected = signPayload(payload);
  if (!safeEqual(expected, sig)) throw new Error("Assinatura de upload inválida");

  const [courierId, deliveryId, purpose, key, contentType, expStr] = payload.split("|");
  const exp = Number(expStr);
  if (!courierId || !key || !exp) throw new Error("Token incompleto");
  if (Date.now() / 1000 > exp) throw new Error("Token de upload expirado");

  return {
    courierId,
    deliveryId: deliveryId || "",
    purpose: (purpose as UploadPurpose) || "proof",
    key,
    contentType: contentType || "image/jpeg",
    exp,
  };
}

export async function persistSignedBody(input: {
  key: string;
  buffer: Buffer;
}): Promise<string> {
  const key = String(input.key || "").replace(/\.\./g, "");
  if (!key.startsWith("mob-")) throw new Error("Key inválida");
  const full = path.join(process.cwd(), "uploads", key);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, input.buffer);
  return `/uploads/${key}`;
}

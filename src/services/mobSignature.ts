/**
 * Persist delivery signature (PNG data URL) to disk.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export function saveSignatureDataUrl(dataUrl: string): string {
  const raw = String(dataUrl || "").trim();
  const m = raw.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) throw new Error("Assinatura inválida (use image/png base64)");

  const ext = m[1].toLowerCase() === "png" ? "png" : m[1].toLowerCase() === "webp" ? "webp" : "jpg";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 200) throw new Error("Assinatura muito pequena — peça ao cliente assinar novamente");
  if (buf.length > 2_500_000) throw new Error("Assinatura muito grande");

  const dir = path.join(process.cwd(), "uploads", "mob-signatures");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/mob-signatures/${name}`;
}

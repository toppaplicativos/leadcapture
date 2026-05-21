import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";

const router = Router();

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");
const CACHE_ROOT = path.join(UPLOADS_ROOT, "_img-cache");
if (!fs.existsSync(CACHE_ROOT)) fs.mkdirSync(CACHE_ROOT, { recursive: true });

const ALLOWED_WIDTHS = [80, 160, 240, 320, 480, 640, 800, 1024, 1280, 1600, 1920];
const ALLOWED_FORMATS = new Set(["webp", "avif", "jpeg"]);

function clampWidth(input: unknown): number {
  const n = Math.max(1, Math.min(2400, Number(input) || 0));
  if (!n) return 640;
  /* Snap to nearest allowed bucket so cache keys stay limited */
  let best = ALLOWED_WIDTHS[0];
  let bestDiff = Math.abs(best - n);
  for (const w of ALLOWED_WIDTHS) {
    const d = Math.abs(w - n);
    if (d < bestDiff) {
      best = w;
      bestDiff = d;
    }
  }
  return best;
}

function clampQuality(input: unknown): number {
  const n = Math.round(Number(input) || 0);
  if (!n) return 78;
  return Math.max(40, Math.min(95, n));
}

function pickFormat(input: unknown, accept: string): "webp" | "avif" | "jpeg" {
  const raw = String(input || "").trim().toLowerCase();
  if (ALLOWED_FORMATS.has(raw)) return raw as any;
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "jpeg";
}

function resolveSource(src: string): string | null {
  if (!src) return null;
  /* Only allow same-origin /uploads/... paths to prevent SSRF and arbitrary fetching */
  const trimmed = src.trim();
  const u = trimmed.startsWith("/uploads/") ? trimmed : null;
  if (!u) return null;
  const decoded = decodeURIComponent(u.replace(/^\/uploads\//, ""));
  if (decoded.includes("..")) return null;
  const full = path.join(UPLOADS_ROOT, decoded);
  /* Guard: resolved path must stay inside UPLOADS_ROOT */
  const resolved = path.resolve(full);
  if (!resolved.startsWith(UPLOADS_ROOT)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

function cacheKey(source: string, width: number, quality: number, format: string): string {
  const stat = fs.statSync(source);
  const hash = crypto
    .createHash("sha1")
    .update(`${source}|${stat.size}|${stat.mtimeMs}|${width}|${quality}|${format}`)
    .digest("hex");
  return path.join(CACHE_ROOT, `${hash}.${format}`);
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const srcParam = String(req.query.src || req.query.u || "");
    const source = resolveSource(srcParam);
    if (!source) {
      res.status(400).json({ error: "Invalid src — must be a /uploads/* path" });
      return;
    }

    const width = clampWidth(req.query.w);
    const quality = clampQuality(req.query.q);
    const accept = String(req.headers["accept"] || "");
    const format = pickFormat(req.query.fm || req.query.format, accept);
    const cachedPath = cacheKey(source, width, quality, format);

    const ext = path.extname(source).toLowerCase();
    /* Skip processing for non-raster (gif animated, svg) — stream the original */
    if (ext === ".gif" || ext === ".svg") {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.setHeader("Content-Type", ext === ".svg" ? "image/svg+xml" : "image/gif");
      fs.createReadStream(source).pipe(res);
      return;
    }

    const mime =
      format === "avif" ? "image/avif" : format === "jpeg" ? "image/jpeg" : "image/webp";
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.setHeader("Content-Type", mime);
    res.setHeader("Vary", "Accept");

    if (fs.existsSync(cachedPath)) {
      fs.createReadStream(cachedPath).pipe(res);
      return;
    }

    let pipeline = sharp(source, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: "inside" });

    if (format === "avif") pipeline = pipeline.avif({ quality, effort: 4 });
    else if (format === "jpeg") pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
    else pipeline = pipeline.webp({ quality, effort: 4 });

    const buffer = await pipeline.toBuffer();
    /* Write cache asynchronously — don't block the response */
    fs.writeFile(cachedPath, buffer, () => {});
    res.end(buffer);
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || "Image processing failed" });
    } else {
      res.end();
    }
  }
});

export default router;

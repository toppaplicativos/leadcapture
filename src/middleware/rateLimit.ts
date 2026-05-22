/**
 * Rate-limit middleware (Fase 15.4)
 *
 * In-memory sliding-window limiter keyed by (userId + bucket). Cheap, no
 * external dependency. Acceptable for single-PM2-instance deploys.
 * Swap for Redis if you ever run multiple workers.
 *
 * Purpose: defense against API-driven exfiltration of leads/customers by
 * a logged-in operator who tries to scrape their own panel for a competitor.
 * Not a DDoS shield (use Nginx / Cloudflare for that).
 */
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

interface Bucket {
  /** Sliding window of request timestamps (ms since epoch), pruned on each hit. */
  hits: number[];
  /** Last warning timestamp — throttle anomaly logs so we don't spam. */
  lastWarn: number;
}

const buckets = new Map<string, Bucket>();

/* GC: every 5 min, drop buckets whose last hit was > 10 min ago. */
const GC_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_TTL_MS = 10 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - BUCKET_TTL_MS;
  for (const [key, bucket] of buckets) {
    const last = bucket.hits[bucket.hits.length - 1] || 0;
    if (last < cutoff) buckets.delete(key);
  }
}, GC_INTERVAL_MS).unref();

export interface RateLimitOptions {
  /** Window length in ms. Default: 60_000 (1 minute). */
  windowMs?: number;
  /** Max requests allowed per window per key. Default: 200. */
  max?: number;
  /** Bucket identifier — appears in logs and prefixes the key. Default: route path. */
  name?: string;
  /** Custom key extractor. Default: req.user.userId, falling back to req.ip. */
  keyFn?: (req: Request) => string;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = Math.max(1000, Number(options.windowMs) || 60_000);
  const max = Math.max(1, Number(options.max) || 200);
  const name = options.name || "default";

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = String((req as any).user?.userId || "").trim();
    const ip = String(req.ip || "").trim();
    const key = options.keyFn
      ? options.keyFn(req)
      : `${name}:${userId || `ip:${ip || "unknown"}`}`;

    const now = Date.now();
    const cutoff = now - windowMs;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [], lastWarn: 0 };
      buckets.set(key, bucket);
    }
    /* Prune old hits in-place */
    while (bucket.hits.length && bucket.hits[0] < cutoff) bucket.hits.shift();

    if (bucket.hits.length >= max) {
      const retryAfterSec = Math.ceil((bucket.hits[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      /* Throttle anomaly log to once per 30s per key — avoid log flood */
      if (now - bucket.lastWarn > 30_000) {
        bucket.lastWarn = now;
        logger.warn(
          `[rate-limit] HIT name=${name} user=${userId || "anon"} ip=${ip} count=${bucket.hits.length} window=${windowMs}ms`
        );
      }
      return res.status(429).json({
        error: "Muitas requisições. Aguarde alguns segundos e tente novamente.",
        retry_after_seconds: retryAfterSec,
      });
    }

    bucket.hits.push(now);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.hits.length)));
    next();
  };
}

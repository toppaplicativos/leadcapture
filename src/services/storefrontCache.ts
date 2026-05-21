import { queryOne } from "../config/database";
import { logger } from "../utils/logger";

/**
 * In-memory cache for the public catalog response (GET /api/storefront/public/stores/:slug/catalog).
 * Extracted as a shared module so any service/route that mutates brand or storefront state can
 * invalidate it — avoiding stale 5-minute waits when a seller edits Design or brand info.
 */

interface CachedEntry {
  data: any;
  expires: number;
}

const cache = new Map<string, CachedEntry>();
const CATALOG_CACHE_TTL_MS = 300_000; /* 5 minutes */

export function getCatalogCacheEntry(slug: string): CachedEntry | null {
  const key = String(slug || "").trim();
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCatalogCacheEntry(slug: string, data: any): void {
  const key = String(slug || "").trim();
  if (!key) return;
  cache.set(key, { data, expires: Date.now() + CATALOG_CACHE_TTL_MS });
}

export function invalidateCatalogCacheBySlug(slug: string | null | undefined): void {
  const key = String(slug || "").trim();
  if (!key) return;
  if (cache.delete(key)) {
    logger.info(`[catalog-cache] invalidated by slug: ${key}`);
  }
}

/** Invalidate all stores that belong to a given brand_id (a brand can have multiple stores). */
export async function invalidateCatalogCacheByBrand(brandId: string | null | undefined): Promise<void> {
  const id = String(brandId || "").trim();
  if (!id) return;
  try {
    const rows = await queryOne<any>(`SELECT slug FROM storefront_stores WHERE brand_id = ? LIMIT 1`, [id]);
    /* If the brand has multiple stores, fetch them all */
    const allRows = rows ? [rows] : [];
    /* Try a multi-row pull too for completeness */
    try {
      const { query } = await import("../config/database");
      const multi = await query<any[]>(`SELECT slug FROM storefront_stores WHERE brand_id = ?`, [id]);
      if (Array.isArray(multi)) {
        for (const r of multi) {
          if (r?.slug && !allRows.find((x) => x.slug === r.slug)) allRows.push(r);
        }
      }
    } catch { /* fall back to single */ }
    for (const r of allRows) {
      if (r?.slug) invalidateCatalogCacheBySlug(r.slug);
    }
  } catch (e: any) {
    logger.warn(`[catalog-cache] failed to invalidate by brand ${id}: ${e?.message || e}`);
  }
}

/** Clear all cached entries (useful after schema migrations or bulk updates). */
export function clearCatalogCache(): void {
  cache.clear();
  logger.info("[catalog-cache] full clear");
}

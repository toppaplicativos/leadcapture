/**
 * Cache em memória (TTL + LRU) para geocode, place search e location autocomplete.
 * Compartilhado entre usuários no mesmo processo — o resultado do Places API
 * é o mesmo para a mesma célula geográfica + query; o status "capturado"
 * continua sendo resolvido por usuário no endpoint.
 *
 * Objetivo: sustentar dezenas/centenas de buscas/s sem martelar RapidAPI/Mapbox
 * e sem saturar o pool de DB com trabalho repetido.
 */

type Entry<T> = { value: T; expires: number; staleUntil: number };

export class TtlLruCache<T> {
  private map = new Map<string, Entry<T>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxSize: number,
    private readonly defaultTtlMs: number,
    /** Quanto tempo após o TTL ainda servimos o valor em fallback (429 etc.) */
    private readonly staleGraceMs: number = 30 * 60_000
  ) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    if (e.expires <= Date.now()) {
      // Não apaga — fica disponível via getStale até staleUntil
      this.misses++;
      return undefined;
    }
    // LRU touch
    this.map.delete(key);
    this.map.set(key, e);
    this.hits++;
    return e.value;
  }

  /** Valor expirado mas ainda dentro da graça (útil em rate-limit RapidAPI). */
  getStale(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.staleUntil <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.map.has(key)) this.map.delete(key);
    const ttl = Math.max(1_000, ttlMs ?? this.defaultTtlMs);
    const now = Date.now();
    this.map.set(key, {
      value,
      expires: now + ttl,
      staleUntil: now + ttl + this.staleGraceMs,
    });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Dedup de promises in-flight (mesmo key = 1 chamada externa). */
  private inflight = new Map<string, Promise<T>>();

  async getOrLoad(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<{ value: T; cached: boolean }> {
    const hit = this.get(key);
    if (hit !== undefined) return { value: hit, cached: true };

    const flying = this.inflight.get(key);
    if (flying) {
      const value = await flying;
      return { value, cached: true };
    }

    const work = (async () => {
      const value = await loader();
      this.set(key, value, ttlMs);
      return value;
    })();

    this.inflight.set(key, work);
    try {
      const value = await work;
      return { value, cached: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  stats() {
    return {
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate:
        this.hits + this.misses > 0
          ? Math.round((this.hits / (this.hits + this.misses)) * 1000) / 10
          : 0,
    };
  }

  clear(): void {
    this.map.clear();
    this.inflight.clear();
  }
}

/** Normaliza texto de busca pra chave estável. */
export function normalizeSearchKey(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Célula geo ~110m (3 casas) — bom tradeoff cache vs precisão do radar. */
export function geoCell(lat: number, lng: number, precision = 3): string {
  return `${Number(lat).toFixed(precision)},${Number(lng).toFixed(precision)}`;
}

/** Raio bucketizado (evita chave diferente a cada 1m no slider). */
export function radiusBucket(meters: number): number {
  const m = Math.max(100, Math.floor(Number(meters) || 3000));
  if (m <= 500) return 500;
  if (m <= 1000) return 1000;
  if (m <= 2000) return 2000;
  if (m <= 3000) return 3000;
  if (m <= 5000) return 5000;
  if (m <= 10000) return 10000;
  if (m <= 15000) return 15000;
  if (m <= 25000) return 25000;
  return 50000;
}

// ── Caches globais do processo ──────────────────────────────────────────────
/** Geocode cidade/endereço → lat/lng (1h, stale 24h) */
export const geocodeCache = new TtlLruCache<{
  latitude: number;
  longitude: number;
  label: string;
  source: string;
} | null>(2_000, 60 * 60_000, 24 * 60 * 60_000);

/** Autocomplete de locais (15 min, stale 2h) */
export const locationSearchCache = new TtlLruCache<
  Array<{
    id: string;
    label: string;
    shortLabel: string;
    latitude: number;
    longitude: number;
    source: string;
  }>
>(1_500, 15 * 60_000, 2 * 60 * 60_000);

/**
 * Resultado bruto do Places API por célula (query+geo+raio+profile).
 * Compartilhado entre tenants — 5 min fresh, 45 min stale (salva o radar no 429).
 */
export const placesApiCache = new TtlLruCache<any[]>(4_000, 5 * 60_000, 45 * 60_000);

/** Resposta montada do radar por usuário (inclui captureStatus) — 90s / stale 15min */
export const radarResponseCache = new TtlLruCache<any>(3_000, 90_000, 15 * 60_000);

/** Cooldown global RapidAPI quando todas as keys batem 429 */
let _rapidCooldownUntil = 0;

export function markRapidApiCooldowned(ms = 45_000): void {
  _rapidCooldownUntil = Math.max(_rapidCooldownUntil, Date.now() + ms);
}

export function isRapidApiCooledDown(): boolean {
  return Date.now() < _rapidCooldownUntil;
}

export function rapidCooldownRemainingMs(): number {
  return Math.max(0, _rapidCooldownUntil - Date.now());
}

/** Busca cache de Places em células vizinhas (quando o centro se moveu pouco). */
export function findNearbyPlacesCache(
  query: string,
  lat: number,
  lng: number,
  radius: number,
  maxResults: number,
  profile: string,
  strict: boolean
): any[] | undefined {
  const base = placesApiCacheKey({
    query,
    lat,
    lng,
    radius,
    maxResults,
    profile,
    strict,
  });
  const fresh = placesApiCache.get(base);
  if (fresh) return fresh;
  const stale = placesApiCache.getStale(base);
  if (stale) return stale;

  // Células adjacentes ±0.01° (~1km)
  const deltas = [0, 0.01, -0.01, 0.02, -0.02];
  for (const dLat of deltas) {
    for (const dLng of deltas) {
      if (dLat === 0 && dLng === 0) continue;
      const k = placesApiCacheKey({
        query,
        lat: lat + dLat,
        lng: lng + dLng,
        radius,
        maxResults,
        profile,
        strict,
      });
      const hit = placesApiCache.get(k) || placesApiCache.getStale(k);
      if (hit && hit.length) return hit;
    }
  }
  return undefined;
}

export function placesApiCacheKey(opts: {
  query: string;
  lat?: number;
  lng?: number;
  radius?: number;
  maxResults?: number;
  profile?: string;
  strict?: boolean;
}): string {
  const q = normalizeSearchKey(opts.query);
  const lat = typeof opts.lat === "number" && Number.isFinite(opts.lat) ? opts.lat : null;
  const lng = typeof opts.lng === "number" && Number.isFinite(opts.lng) ? opts.lng : null;
  const cell = lat !== null && lng !== null ? geoCell(lat, lng, 3) : "nocoords";
  const r = radiusBucket(opts.radius || 3000);
  const max = Math.min(60, Math.max(1, Math.floor(opts.maxResults || 20)));
  const profile = opts.profile || "full";
  const strict = opts.strict ? "1" : "0";
  return `p:${q}|${cell}|r${r}|m${max}|${profile}|s${strict}`;
}

export function placesCacheStats() {
  return {
    geocode: geocodeCache.stats(),
    locationSearch: locationSearchCache.stats(),
    placesApi: placesApiCache.stats(),
    radarResponse: radarResponseCache.stats(),
  };
}

import axios from "axios";
import { GooglePlaceV2, PlaceSearchRequest } from "../types";
import { logger } from "../utils/logger";
import { IntegrationScope, integrationService } from "./integrations";

const SEARCH_PAGE_SIZE = 20;
const MAX_SEARCH_LIMIT = 100;
const MAX_SEARCH_PAGES = 8;
const ENRICH_DETAILS_LIMIT = 24;
const ENRICH_BATCH_SIZE = 4;

type PlacesPageResult = {
  places: GooglePlaceV2[];
  nextPageToken?: string;
};

type SearchProvider = "rapid" | "official";
type SearchProviderPreference = "rapid_first" | "official_first" | "rapid_only" | "official_only";
type SearchFieldProfile = "full" | "radar";

type RapidProviderConfig = {
  /** Lista de chaves disponiveis — alternamos entre elas e fazemos fallback em 429. */
  keys: string[];
  host: string;
  baseUrl: string;
  timeout: number;
};

/** Index round-robin em memoria — distribui carga entre as keys configuradas. */
let _rapidKeyCursor = 0;

type GoogleOfficialProviderConfig = {
  key: string;
  timeout: number;
};

export class GooglePlacesService {
  private toScope(input?: IntegrationScope): IntegrationScope {
    return {
      accountId: String(input?.accountId || "").trim() || undefined,
      userId: String(input?.userId || "").trim() || undefined,
      brandId: String(input?.brandId || "").trim() || undefined,
    };
  }

  private async getRapidProvider(scope?: IntegrationScope): Promise<RapidProviderConfig | null> {
    const resolved = await integrationService.getProvider("rapidapi", this.toScope(scope));
    const primaryKey = String(resolved.key || "").trim();
    const host = String(resolved.config.host || "").trim();
    const baseUrl = String(resolved.config.baseUrl || "").trim();
    const timeout = Math.max(500, Math.floor(Number(resolved.config.timeout || 15000)));

    /* Coleta chaves: a primaria + alternativas (config.keysAlt: string[] OU env
       RAPIDAPI_KEY_ALT, RAPIDAPI_KEY_ALT_2...). Round-robin distribui carga e
       fallback automatico em 429. */
    const altFromConfig = Array.isArray((resolved.config as any).keysAlt)
      ? (resolved.config as any).keysAlt.map((k: any) => String(k || "").trim()).filter(Boolean)
      : [];
    const altFromEnv = [
      process.env.RAPIDAPI_KEY_ALT,
      process.env.RAPIDAPI_KEY_ALT_2,
      process.env.RAPIDAPI_KEY_ALT_3,
    ].map((k) => String(k || "").trim()).filter(Boolean);

    const keys = Array.from(new Set([primaryKey, ...altFromConfig, ...altFromEnv].filter(Boolean)));
    if (!keys.length || !host || !baseUrl) return null;
    return { keys, host, baseUrl: baseUrl.replace(/\/+$/, ""), timeout };
  }

  /** Retorna a key da rotacao atual + rotaciona o cursor. */
  private pickRapidKey(rapid: RapidProviderConfig): string {
    const key = rapid.keys[_rapidKeyCursor % rapid.keys.length];
    _rapidKeyCursor = (_rapidKeyCursor + 1) % rapid.keys.length;
    return key;
  }

  /** Tenta um axios call com cada key disponivel ate sucesso ou exaustar.
      Em 429 (rate limit), avanca pra proxima key automaticamente. */
  private async tryRapidWithFallback<T>(
    rapid: RapidProviderConfig,
    callFn: (key: string) => Promise<T>,
  ): Promise<T> {
    let lastErr: any = null;
    const tried = new Set<string>();
    /* Comeca pela key da rotacao atual, depois tenta as outras se 429 */
    for (let i = 0; i < rapid.keys.length; i++) {
      const key = this.pickRapidKey(rapid);
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        return await callFn(key);
      } catch (err: any) {
        lastErr = err;
        const status = err?.response?.status;
        /* 429 = rate limit, 403 = quota exceeded — tenta a proxima key */
        if (status !== 429 && status !== 403) throw err;
        logger.warn(`RapidAPI key ${key.slice(0, 8)}… returned ${status} — tentando proxima chave`);
      }
    }
    throw lastErr;
  }

  private async getGoogleOfficialProvider(scope?: IntegrationScope): Promise<GoogleOfficialProviderConfig | null> {
    const resolved = await integrationService.getProvider("google_places", this.toScope(scope));
    const key = String(resolved.key || "").trim();
    const timeout = Math.max(500, Math.floor(Number(resolved.config.timeout || 15000)));
    if (!key) return null;
    return { key, timeout };
  }

  private buildTextQuery(params: {
    query: string;
    location?: string;
  }): string {
    return params.location ? `${params.query} em ${params.location}` : params.query;
  }

  /* Converte um circulo geografico (centro + raio em metros) em bounding box (lat/lng SW + NE).
     Necessario porque o locationRestriction do Google Places Text Search v1 SO aceita
     rectangle, nao circle. A box eh ligeiramente maior que o circulo (escolhemos sqrt(2)
     pra cobrir o circulo inscrito) — filtragem geografica fina fica no client. */
  private circleToRectangle(lat: number, lng: number, radiusMeters: number): {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  } {
    const R = 6378137; // Raio da Terra em metros
    const dLat = (radiusMeters / R) * (180 / Math.PI);
    const dLng = (radiusMeters / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    return {
      low: { latitude: lat - dLat, longitude: lng - dLng },
      high: { latitude: lat + dLat, longitude: lng + dLng },
    };
  }

  private getPlacesFieldMask(profile: SearchFieldProfile = "full", withPrefix = true): string {
    const prefix = withPrefix ? "places." : "";
    if (profile === "radar") {
      return [
        `${prefix}id`,
        `${prefix}displayName`,
        `${prefix}formattedAddress`,
        `${prefix}nationalPhoneNumber`,
        `${prefix}internationalPhoneNumber`,
        `${prefix}rating`,
        `${prefix}userRatingCount`,
        `${prefix}types`,
        `${prefix}location`,
        `${prefix}googleMapsUri`,
      ].join(",");
    }

    return [
      `${prefix}id`,
      `${prefix}displayName`,
      `${prefix}formattedAddress`,
      `${prefix}shortFormattedAddress`,
      `${prefix}addressComponents`,
      `${prefix}nationalPhoneNumber`,
      `${prefix}internationalPhoneNumber`,
      `${prefix}websiteUri`,
      `${prefix}rating`,
      `${prefix}userRatingCount`,
      `${prefix}types`,
      `${prefix}location`,
      `${prefix}businessStatus`,
      `${prefix}googleMapsUri`,
    ].join(",");
  }

  private sanitizeMaxResults(value?: number): number {
    const parsed = Number(value || SEARCH_PAGE_SIZE);
    if (!Number.isFinite(parsed)) return SEARCH_PAGE_SIZE;
    return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(parsed)));
  }

  private needsDetails(place: GooglePlaceV2): boolean {
    const hasAddress = Boolean(place.formattedAddress || place.shortFormattedAddress);
    const hasLocation = Boolean(place.location?.latitude && place.location?.longitude);
    return !hasAddress || !hasLocation;
  }

  private mergePlace(base: GooglePlaceV2, incoming?: GooglePlaceV2 | null): GooglePlaceV2 {
    if (!incoming) return base;
    return {
      ...base,
      ...incoming,
      displayName: incoming.displayName || base.displayName,
      location: incoming.location || base.location,
      addressComponents: incoming.addressComponents || base.addressComponents,
      formattedAddress: incoming.formattedAddress || base.formattedAddress,
      shortFormattedAddress: incoming.shortFormattedAddress || base.shortFormattedAddress,
    };
  }

  private async resolveProviderChain(preference: SearchProviderPreference, scope?: IntegrationScope): Promise<SearchProvider[]> {
    const desired: SearchProvider[] =
      preference === "official_first"
        ? ["official", "rapid"]
        : preference === "rapid_only"
        ? ["rapid"]
        : preference === "official_only"
        ? ["official"]
        : ["rapid", "official"];

    const chain: SearchProvider[] = [];

    for (const provider of desired) {
      if (provider === "official") {
        const google = await this.getGoogleOfficialProvider(scope);
        if (!google) {
          logger.warn("Google Places official provider skipped: GOOGLE_PLACES_API_KEY not configured.");
          continue;
        }
        chain.push(provider);
        continue;
      }

      const rapid = await this.getRapidProvider(scope);
      if (!rapid) {
        logger.warn("Google Places RapidAPI provider skipped: RAPIDAPI_KEY/RAPIDAPI_HOST not configured.");
        continue;
      }
      chain.push(provider);
    }

    return chain;
  }

  private async searchTextRapidApiPage(params: {
    query: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    maxResults: number;
    languageCode?: string;
    pageToken?: string;
    fieldProfile?: SearchFieldProfile;
    accountId?: string;
    userId?: string;
    brandId?: string;
    strictLocation?: boolean;
  }): Promise<PlacesPageResult> {
    const rapid = await this.getRapidProvider(this.toScope(params));
    if (!rapid) {
      throw new Error("RAPIDAPI_KEY_NOT_CONFIGURED");
    }

    const textQuery = this.buildTextQuery(params);
    const body: PlaceSearchRequest = {
      textQuery,
      maxResultCount: Math.min(params.maxResults, SEARCH_PAGE_SIZE),
      languageCode: params.languageCode || "pt-BR",
    };
    if (params.pageToken) body.pageToken = params.pageToken;

    // Add location scope when coordinates are provided.
    // - strictLocation=true (radar/panfleteiro): locationRestriction com rectangle (HARD limit)
    //   IMPORTANTE: locationRestriction so aceita rectangle, NAO aceita circle (limitacao da API).
    //   Convertemos o circulo (lat/lng + radius) em bounding box quadrada.
    // - strictLocation=false (text search normal): locationBias.circle eh apenas uma dica
    // Sem strictLocation o Google retorna os top N da cidade inteira ignorando o centro.
    if (
      typeof params.latitude === "number" &&
      typeof params.longitude === "number" &&
      Number.isFinite(params.latitude) &&
      Number.isFinite(params.longitude)
    ) {
      const radiusMeters = params.radius && Number.isFinite(params.radius)
        ? Math.max(1, Math.min(50000, params.radius))
        : 3000;
      if (params.strictLocation) {
        body.locationRestriction = {
          rectangle: this.circleToRectangle(params.latitude, params.longitude, radiusMeters),
        };
      } else {
        body.locationBias = {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: radiusMeters,
          },
        };
      }
    }

    logger.info(
      `Google Places V2 search: "${textQuery}" (max: ${body.maxResultCount})${params.pageToken ? " [next page]" : ""}`
    );

    const response = await this.tryRapidWithFallback(rapid, (key) =>
      axios.post(
        `${rapid.baseUrl}/v1/places:searchText`,
        body,
        {
          timeout: rapid.timeout,
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-key": key,
            "x-rapidapi-host": rapid.host,
            "X-Goog-FieldMask": this.getPlacesFieldMask(params.fieldProfile || "full", true),
          },
        }
      )
    );

    return {
      places: response.data?.places || [],
      nextPageToken: response.data?.nextPageToken || response.data?.next_page_token || undefined,
    };
  }

  private async searchTextGoogleOfficialPage(params: {
    query: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    maxResults: number;
    languageCode?: string;
    pageToken?: string;
    fieldProfile?: SearchFieldProfile;
    accountId?: string;
    userId?: string;
    brandId?: string;
    strictLocation?: boolean;
  }): Promise<PlacesPageResult> {
    const google = await this.getGoogleOfficialProvider(this.toScope(params));
    if (!google) {
      throw new Error("GOOGLE_PLACES_API_KEY_NOT_CONFIGURED");
    }

    const textQuery = this.buildTextQuery(params);
    const body: PlaceSearchRequest = {
      textQuery,
      maxResultCount: Math.min(params.maxResults, SEARCH_PAGE_SIZE),
      languageCode: params.languageCode || "pt-BR",
    };
    if (params.pageToken) body.pageToken = params.pageToken;

    if (
      typeof params.latitude === "number" &&
      typeof params.longitude === "number" &&
      Number.isFinite(params.latitude) &&
      Number.isFinite(params.longitude)
    ) {
      const radiusMeters = params.radius && Number.isFinite(params.radius)
        ? Math.max(1, Math.min(50000, params.radius))
        : 3000;
      if (params.strictLocation) {
        body.locationRestriction = {
          rectangle: this.circleToRectangle(params.latitude, params.longitude, radiusMeters),
        };
      } else {
        body.locationBias = {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: radiusMeters,
          },
        };
      }
    }

    logger.info(
      `Google Places official fallback: "${textQuery}" (max: ${body.maxResultCount})${
        params.pageToken ? " [next page]" : ""
      }`
    );

    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      body,
      {
        timeout: google.timeout,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": google.key,
          "X-Goog-FieldMask": this.getPlacesFieldMask(params.fieldProfile || "full", true),
        },
      }
    );

    return {
      places: response.data?.places || [],
      nextPageToken: response.data?.nextPageToken || response.data?.next_page_token || undefined,
    };
  }

  /**
   * Search for businesses using the new RapidAPI Google Places V2
   * Primary endpoint for lead capture
   */
  async searchText(params: {
    query: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    maxResults?: number;
    languageCode?: string;
    providerPreference?: SearchProviderPreference;
    includeDetails?: boolean;
    fieldProfile?: SearchFieldProfile;
    accountId?: string;
    userId?: string;
    brandId?: string;
    /* strictLocation=true usa locationRestriction (HARD limit ao raio) em vez de
       locationBias (apenas uma dica). Essencial pro modo radar/panfleteiro —
       sem isso o Google retorna os top N da cidade INTEIRA ignorando o centro. */
    strictLocation?: boolean;
  }): Promise<GooglePlaceV2[]> {
    try {
      const target = this.sanitizeMaxResults(params.maxResults);
      const placeById = new Map<string, GooglePlaceV2>();
      const scope = this.toScope(params);
      const providerChain = await this.resolveProviderChain(params.providerPreference || "rapid_first", scope);
      if (providerChain.length === 0) {
        throw new Error("No Google Places provider is configured");
      }
      const includeDetails = params.includeDetails !== false;
      const fieldProfile = params.fieldProfile || "full";
      let providerIndex = 0;
      let provider = providerChain[providerIndex];
      let nextPageToken: string | undefined;
      let page = 0;

      while (placeById.size < target && page < MAX_SEARCH_PAGES) {
        const remaining = target - placeById.size;
        const pageSize = Math.min(SEARCH_PAGE_SIZE, remaining);

        let pageResult: PlacesPageResult;
        try {
          if (provider === "rapid") {
            pageResult = await this.searchTextRapidApiPage({
              ...params,
              maxResults: pageSize,
              pageToken: nextPageToken,
              fieldProfile,
            });
          } else {
            pageResult = await this.searchTextGoogleOfficialPage({
              ...params,
              maxResults: pageSize,
              pageToken: nextPageToken,
              fieldProfile,
            });
          }
        } catch (providerError: any) {
          const message =
            providerError?.response?.data?.error?.message ||
            providerError?.response?.data?.message ||
            providerError?.message ||
            "Unknown provider error";

          await integrationService.logEvent(
            provider === "rapid" ? "rapidapi" : "google_places",
            "error",
            `Google Places search failed: ${message}`,
            scope,
            {
              action: "searchText",
              provider,
              status_code: providerError?.response?.status,
            }
          );

          if (providerIndex < providerChain.length - 1) {
            const nextProvider = providerChain[providerIndex + 1];
            logger.warn(
              `Google Places provider "${provider}" unavailable, switching to "${nextProvider}": ${
                providerError.response?.status || providerError.message
              }`
            );
            providerIndex += 1;
            provider = providerChain[providerIndex];
            nextPageToken = undefined;
            continue;
          }
          throw providerError;
        }

        let uniqueAdded = 0;
        for (const place of pageResult.places || []) {
          const placeId = String(place?.id || "");
          if (!placeId) continue;
          if (placeById.has(placeId)) continue;
          placeById.set(placeId, place);
          uniqueAdded++;
          if (placeById.size >= target) break;
        }

        page++;
        nextPageToken = pageResult.nextPageToken;
        if (!nextPageToken) break;
        if (uniqueAdded === 0) break;
      }

      let places = Array.from(placeById.values()).slice(0, target);

      if (includeDetails) {
        const needsDetailIndexes = places
          .map((place, index) => ({ place, index }))
          .filter(({ place }) => this.needsDetails(place))
          .slice(0, ENRICH_DETAILS_LIMIT);

        for (let i = 0; i < needsDetailIndexes.length; i += ENRICH_BATCH_SIZE) {
          const chunk = needsDetailIndexes.slice(i, i + ENRICH_BATCH_SIZE);
          const detailsChunk = await Promise.all(
            chunk.map(async ({ place }) => {
              const placeId = String(place?.id || "");
              if (!placeId) return null;
              return this.getPlaceDetails(placeId, scope);
            })
          );

          chunk.forEach(({ index }, chunkIndex) => {
            const details = detailsChunk[chunkIndex];
            places[index] = this.mergePlace(places[index], details);
          });
        }
      }

      logger.info(
        `Google Places search complete [provider=${provider}; profile=${fieldProfile}; details=${
          includeDetails ? "on" : "off"
        }]: requested ${target}, returned ${places.length}`
      );
      return places;
    } catch (error: any) {
      const details =
        error.response?.data?.error?.message ||
        error.response?.data?.error_message ||
        error.message;
      logger.error(`Google Places search error: ${details}`);
      throw new Error(`Google Places search failed: ${details}`);
    }
  }

  /**
   * Get detailed info for a single place by ID
   */
  async getPlaceDetails(placeId: string, scope?: IntegrationScope): Promise<GooglePlaceV2 | null> {
    try {
      const google = await this.getGoogleOfficialProvider(scope);
      if (google?.key) {
        const official = await axios.get(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          {
            timeout: google.timeout,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": google.key,
              "X-Goog-FieldMask": this.getPlacesFieldMask("full", false),
            },
          }
        );
        if (official.data?.id) {
          return official.data as GooglePlaceV2;
        }
      }

      const rapidProvider = await this.getRapidProvider(scope);
      if (!rapidProvider) return null;

      const rapid = await this.tryRapidWithFallback(rapidProvider, (key) =>
        axios.get(
          `${rapidProvider.baseUrl}/maps/places/${encodeURIComponent(placeId)}`,
          {
            timeout: rapidProvider.timeout,
            headers: {
              "Content-Type": "application/json",
              "x-rapidapi-key": key,
              "x-rapidapi-host": rapidProvider.host,
              "X-Goog-FieldMask": this.getPlacesFieldMask("full", false),
            },
          }
        )
      );

      return (rapid.data as GooglePlaceV2) || null;
    } catch (error: any) {
      logger.error(`Google Places V2 details error: ${error.message}`);
      return null;
    }
  }

  /**
   * Search and return results formatted for the legacy Lead interface
   * (backward compatible with existing UI)
   */
  async searchForLeads(params: {
    query: string;
    location: string;
    radius?: number;
    maxResults?: number;
    accountId?: string;
    userId?: string;
    brandId?: string;
  }): Promise<any[]> {
    const places = await this.searchText(params);

    return places.map((place) => ({
      id: place.id,
      name: place.displayName?.text || "Unknown",
      phone: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
      address: place.formattedAddress || "",
      rating: place.rating || 0,
      reviews: place.userRatingCount || 0,
      category: place.types?.[0] || "",
      placeId: place.id,
      website: place.websiteUri || "",
      googleMapsUri: place.googleMapsUri || "",
      businessStatus: place.businessStatus || "",
      location: place.location || null,
    }));
  }
}

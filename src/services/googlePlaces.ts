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
  key: string;
  host: string;
  baseUrl: string;
  timeout: number;
};

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
    const key = String(resolved.key || "").trim();
    const host = String(resolved.config.host || "").trim();
    const baseUrl = String(resolved.config.baseUrl || "").trim();
    const timeout = Math.max(500, Math.floor(Number(resolved.config.timeout || 15000)));

    if (!key || !host || !baseUrl) return null;
    return { key, host, baseUrl: baseUrl.replace(/\/+$/, ""), timeout };
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

    // Add locationBias when coordinates are provided (radar mode)
    if (
      typeof params.latitude === "number" &&
      typeof params.longitude === "number" &&
      Number.isFinite(params.latitude) &&
      Number.isFinite(params.longitude)
    ) {
      body.locationBias = {
        circle: {
          center: { latitude: params.latitude, longitude: params.longitude },
          radius: params.radius && Number.isFinite(params.radius) ? params.radius : 3000,
        },
      };
    }

    logger.info(
      `Google Places V2 search: "${textQuery}" (max: ${body.maxResultCount})${params.pageToken ? " [next page]" : ""}`
    );

    const response = await axios.post(
      `${rapid.baseUrl}/v1/places:searchText`,
      body,
      {
        timeout: rapid.timeout,
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-key": rapid.key,
          "x-rapidapi-host": rapid.host,
          "X-Goog-FieldMask": this.getPlacesFieldMask(params.fieldProfile || "full", true),
        },
      }
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
      body.locationBias = {
        circle: {
          center: { latitude: params.latitude, longitude: params.longitude },
          radius: params.radius && Number.isFinite(params.radius) ? params.radius : 3000,
        },
      };
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

      const rapid = await axios.get(
        `${rapidProvider.baseUrl}/maps/places/${encodeURIComponent(placeId)}`,
        {
          timeout: rapidProvider.timeout,
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-key": rapidProvider.key,
            "x-rapidapi-host": rapidProvider.host,
            "X-Goog-FieldMask": this.getPlacesFieldMask("full", false),
          },
        }
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

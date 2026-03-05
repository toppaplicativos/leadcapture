import axios from "axios";
import { config } from "../config";
import { GooglePlaceV2, PlaceSearchRequest } from "../types";
import { logger } from "../utils/logger";

const RAPIDAPI_BASE = "https://google-map-places-new-v2.p.rapidapi.com";

const rapidApiHeaders = {
  "x-rapidapi-key": config.rapidApi.key,
  "x-rapidapi-host": config.rapidApi.host,
  "Content-Type": "application/json",
};

export class GooglePlacesService {
  private buildTextQuery(params: {
    query: string;
    location?: string;
  }): string {
    return params.location ? `${params.query} em ${params.location}` : params.query;
  }

  private async searchTextRapidApi(params: {
    query: string;
    location?: string;
    maxResults?: number;
    languageCode?: string;
  }): Promise<GooglePlaceV2[]> {
    const textQuery = this.buildTextQuery(params);
    const body: PlaceSearchRequest = {
      textQuery,
      maxResultCount: Math.min(params.maxResults || 20, 20),
      languageCode: params.languageCode || "pt-BR",
    };

    logger.info(`Google Places V2 search: "${textQuery}" (max: ${body.maxResultCount})`);

    const response = await axios.post(
      `${RAPIDAPI_BASE}/v1/places:searchText`,
      body,
      {
        timeout: 15000,
        headers: {
          ...rapidApiHeaders,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.nationalPhoneNumber",
            "places.internationalPhoneNumber",
            "places.websiteUri",
            "places.rating",
            "places.userRatingCount",
            "places.types",
            "places.location",
            "places.businessStatus",
            "places.googleMapsUri",
          ].join(","),
        },
      }
    );

    return response.data?.places || [];
  }

  private async searchTextGoogleOfficial(params: {
    query: string;
    location?: string;
    maxResults?: number;
    languageCode?: string;
  }): Promise<GooglePlaceV2[]> {
    if (!config.googlePlacesApiKey) {
      throw new Error("Google Places API key not configured");
    }

    const textQuery = this.buildTextQuery(params);
    const body: PlaceSearchRequest = {
      textQuery,
      maxResultCount: Math.min(params.maxResults || 20, 20),
      languageCode: params.languageCode || "pt-BR",
    };

    logger.info(`Google Places official fallback: "${textQuery}" (max: ${body.maxResultCount})`);

    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      body,
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.googlePlacesApiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.nationalPhoneNumber",
            "places.internationalPhoneNumber",
            "places.websiteUri",
            "places.rating",
            "places.userRatingCount",
            "places.types",
            "places.location",
            "places.businessStatus",
            "places.googleMapsUri",
          ].join(","),
        },
      }
    );

    return response.data?.places || [];
  }

  /**
   * Search for businesses using the new RapidAPI Google Places V2
   * Primary endpoint for lead capture
   */
  async searchText(params: {
    query: string;
    location?: string;
    radius?: number;
    maxResults?: number;
    languageCode?: string;
  }): Promise<GooglePlaceV2[]> {
    try {
      let places: GooglePlaceV2[] = [];
      try {
        places = await this.searchTextRapidApi(params);
        logger.info(`Google Places V2: found ${places.length} results`);
      } catch (rapidError: any) {
        logger.warn(
          `Google Places V2 unavailable, using official fallback: ${
            rapidError.response?.status || rapidError.message
          }`
        );
        places = await this.searchTextGoogleOfficial(params);
        logger.info(`Google Places official fallback: found ${places.length} results`);
      }

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
  async getPlaceDetails(placeId: string): Promise<GooglePlaceV2 | null> {
    try {
      const response = await axios.get(
        `${RAPIDAPI_BASE}/maps/places/${placeId}`,
        {
          headers: {
            ...rapidApiHeaders,
            "X-Goog-FieldMask": [
              "id",
              "displayName",
              "formattedAddress",
              "nationalPhoneNumber",
              "internationalPhoneNumber",
              "websiteUri",
              "rating",
              "userRatingCount",
              "types",
              "location",
              "businessStatus",
              "googleMapsUri",
              "currentOpeningHours",
              "reviews",
            ].join(","),
          },
        }
      );

      return response.data || null;
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

// ============ USERS ============
export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: "admin" | "manager" | "operator";
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateDTO {
  email: string;
  password: string;
  name: string;
  role?: "admin" | "manager" | "operator";
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

// ============ COMPANY ============
export interface Company {
  id: number;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  logo_url?: string;
  settings?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// ============ CUSTOMERS (LEADS) ============
export interface Customer {
  id: number;
  company_id?: number;
  google_place_id?: string;
  name: string;
  trade_name?: string;
  phone?: string;
  phone_secondary?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  subcategory?: string;
  google_rating?: number;
  google_reviews_count?: number;
  google_maps_uri?: string;
  business_status?: string;
  tags?: string;
  notes?: string;
  status: "new" | "contacted" | "replied" | "negotiating" | "converted" | "lost" | "inactive";
  source: "google_places" | "manual" | "import" | "referral" | "website";
  assigned_to?: string | number;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerCreateDTO {
  company_id?: number;
  google_place_id?: string;
  name: string;
  trade_name?: string;
  phone?: string;
  phone_secondary?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  subcategory?: string;
  google_rating?: number;
  google_reviews_count?: number;
  google_maps_uri?: string;
  business_status?: string;
  tags?: string;
  notes?: string;
  status?: string;
  source?: string;
  assigned_to?: string | number;
}

// ============ KNOWLEDGE BASE ============
export interface KnowledgeBase {
  id: number;
  company_id?: number;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeBaseCreateDTO {
  company_id?: number;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  active?: boolean;
}

// ============ WHATSAPP ============
export interface WhatsAppInstance {
  id: string;
  name: string;
  phone?: string;
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  qrCode?: string;
  socket?: any;
  createdAt: Date;
  messagessSent: number;
  messagesReceived: number;
  dbId?: number;
}

export interface WhatsAppSession {
  id: number;
  instance_id: number;
  session_data: string;
  created_at: Date;
  updated_at: Date;
}

// ============ LEADS (Google Places Search Results) ============
export interface Lead {
  id: string;
  name: string;
  phone: string;
  address?: string;
  rating?: number;
  category?: string;
  placeId?: string;
  city?: string;
  state?: string;
  website?: string;
  status: "new" | "contacted" | "replied" | "converted" | "failed";
  instanceId?: string;
  messagesSent: string[];
  messagesReceived: string[];
  lastContactAt?: Date;
  createdAt: Date;
}

// ============ SEARCH / CAMPAIGNS ============
export interface SearchParams {
  query: string;
  location: string;
  radius?: number;
  maxResults?: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  prompt: string;
  category: string;
}

export interface CampaignConfig {
  instanceId: string;
  leads: Lead[];
  messageTemplate: MessageTemplate;
  delayBetweenMessages: number;
  maxMessagesPerDay: number;
}

// ============ PRODUCTS ============
export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  promoPrice?: number;
  unit: string;
  features: string[];
  image?: string;
  is_active: boolean;
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
}

export interface PriceTable {
  id: string;
  name: string;
  description?: string;
  products: ProductPriceEntry[];
  validFrom?: Date;
  validUntil?: Date;
  is_active: boolean;
  active?: boolean;
  createdAt: Date;
}

export interface ProductPriceEntry {
  productId: string;
  customPrice?: number;
  customPromoPrice?: number;
  includeInCampaign: boolean;
}

// ============ GOOGLE PLACES V2 (RapidAPI) ============
export interface GooglePlaceV2 {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  location?: { latitude: number; longitude: number };
  businessStatus?: string;
  googleMapsUri?: string;
}

export interface PlaceSearchRequest {
  textQuery: string;
  maxResultCount?: number;
  languageCode?: string;
  locationBias?: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
}

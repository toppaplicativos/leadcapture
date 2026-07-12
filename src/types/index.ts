// ============ USERS ============
/** See src/config/identity.ts for canonical model. */
export type UserRole =
  | "org"
  | "manager"
  | "operator"
  | "affiliate"
  | "consumer"
  | "admin"
  | "platform";

export type AccountKind = "org" | "staff" | "affiliate" | "consumer" | "platform";

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole | string;
  account_kind?: AccountKind | string;
  is_super_admin?: boolean;
  is_active: boolean;
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateDTO {
  email: string;
  password: string;
  name: string;
  role?: UserRole | string;
  accountKind?: AccountKind | string;
}

export interface UserLoginDTO {
  email: string;
  password: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  account_kind?: string;
  is_super_admin?: boolean;
  brand_id?: string;
  credential_type?: string;
  owner_user_id?: string;
  credential_id?: string;
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
  /** Extra structured data to merge into source_details (eg. catalog product context). */
  extra_source_details?: Record<string, any>;
}

// ============ KNOWLEDGE BASE ============
export interface KnowledgeBase {
  id: number;
  user_id: string;
  company_id?: string;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface KnowledgeBaseCreateDTO {
  company_id?: string;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  active?: boolean;
}

export type AIAgentTone = "formal" | "casual" | "friendly" | "professional";

export interface AIAgentProfile {
  user_id: string;
  company_id?: string;
  agent_name: string;
  tone: AIAgentTone;
  language: string;
  include_emojis: boolean;
  max_length: number;
  objective?: string;
  business_context?: string;
  communication_rules?: string;
  training_notes?: string;
  forbidden_terms: string[];
  preferred_terms: string[];
  created_at?: Date;
  updated_at?: Date;
}

export interface AIAgentProfileUpdateDTO {
  company_id?: string;
  agent_name?: string;
  tone?: AIAgentTone;
  language?: string;
  include_emojis?: boolean;
  max_length?: number;
  objective?: string;
  business_context?: string;
  communication_rules?: string;
  training_notes?: string;
  forbidden_terms?: string[];
  preferred_terms?: string[];
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
/**
 * OfferEntity-style product (Fase 0 da arquitetura universal).
 * Campos novos têm defaults — instâncias antigas continuam funcionando.
 */
export type OfferType =
  | "physical_product"
  | "digital_product"
  | "service"
  | "vehicle"
  | "real_estate"
  | "subscription"
  | "consortium"
  | "food"
  | "custom_quote"
  | "appointment"
  | "course"
  | "event"
  | "bundle"
  | "physical"; /* legacy alias for physical_product */

export type OfferCtaType =
  | "buy"           /* adiciona ao carrinho */
  | "quote"         /* abre formulário de orçamento */
  | "whatsapp"      /* abre deeplink WhatsApp */
  | "schedule"      /* abre agendamento */
  | "simulate"      /* simulador (consórcio, financiamento) */
  | "visit"         /* solicitar visita (imóvel) */
  | "subscribe"     /* assinar */
  | "custom";       /* CTA livre configurado via metadata */

export interface Product {
  id: string;
  name: string;
  subtitle?: string;
  description: string;
  category: string;
  price: number;
  promoPrice?: number;
  unit: string;
  features: string[];
  image?: string;
  imageUrl?: string;
  images?: string[];
  galleryImages?: string[];
  metadata?: Record<string, any>;
  is_active: boolean;
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
  /* OfferEntity fields (Fase 0) */
  type?: OfferType;
  cta_type?: OfferCtaType;
  pipeline_id?: string | null;
  attributes?: Record<string, any>;
  seo?: Record<string, any>;
  media?: Record<string, any>;
  /* Service config (Fase 5) — populated when type ∈ {service, appointment} */
  service_config?: ServiceConfig;
  /* Configurator (Fase 4) — populated when product has configurable groups */
  configurator?: ConfiguratorConfig;
  /* Bundle items (Fase 11) — populated when type = bundle */
  bundle_items?: BundleItem[];
  /* Inventory (Fase 12)
   *   stock_quantity: null = unlimited (default for services, configurators, digital)
   *                   >= 0 = tracked, decremented atomically on order via productStockService
   *   stock_status: denormalized for fast catalog filtering — kept in sync by service layer
   *   stock_threshold_low: when qty <= threshold, status flips to low_stock (default 5) */
  stock_quantity?: number | null;
  stock_status?: "in_stock" | "low_stock" | "out_of_stock" | "unlimited";
  stock_threshold_low?: number;
  /* Reviews (Fase 14) — denormalized aggregates so catalog/agent reads stay 1 SELECT */
  reviews_avg?: number;       // 0 when no reviews
  reviews_count?: number;     // 0 when no reviews
}

export interface ServiceWeekdayHours {
  /** 0=Sun, 1=Mon … 6=Sat */
  weekday: number;
  /** "HH:MM" (24h) */
  start: string;
  /** "HH:MM" (24h, exclusive) */
  end: string;
}

export interface ServiceConfig {
  duration_minutes?: number;        /* default 60 */
  buffer_minutes?: number;          /* gap after each booking, default 0 */
  max_per_slot?: number;            /* parallel capacity, default 1 */
  weekday_hours?: ServiceWeekdayHours[];
  requires_address?: boolean;       /* home service vs in-shop */
  advance_notice_hours?: number;    /* min hours from now until earliest bookable slot, default 1 */
  max_advance_days?: number;        /* how far in the future a customer can book, default 30 */
}

/* ── Configurator (Fase 4) ── */
export interface ConfiguratorOption {
  id: string;                        /* short stable id, eg. "small" */
  name: string;                      /* "Pequena" */
  price_delta?: number;              /* additive to base price; default 0; can be negative */
  description?: string;
  image_url?: string;
  is_active?: boolean;
  position?: number;
}

export interface ConfiguratorGroup {
  id: string;                        /* short stable id, eg. "size" */
  name: string;                      /* "Tamanho" */
  required?: boolean;
  min_select?: number;               /* default 0 (or 1 if required) */
  max_select?: number;               /* default 1 */
  position?: number;
  options: ConfiguratorOption[];
}

export interface ConfiguratorConfig {
  enabled?: boolean;                 /* allow toggle without dropping the data */
  groups?: ConfiguratorGroup[];
}

/* ── Bundle (Fase 11) — products grouped together at a fixed price ── */
export interface BundleItem {
  product_id: string;                /* source-catalog product id */
  quantity: number;                  /* how many of this product the bundle contains */
  optional?: boolean;                /* reserved for future "pick X of N" bundles */
  note?: string;                     /* free-form note shown to the customer */
}

export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  coverImage?: string;
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
  shortFormattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
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
  pageToken?: string;
  /* Dica suave - resultados podem cair fora do circulo */
  locationBias?: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
  /* HARD limit - resultados garantidos dentro do rectangle (radar mode).
     Google Places Text Search v1 NAO aceita circle em locationRestriction, apenas rectangle. */
  locationRestriction?: {
    rectangle: {
      low: { latitude: number; longitude: number };
      high: { latitude: number; longitude: number };
    };
  };
}

import { createHash, randomUUID } from "crypto";
import { resolve4, resolveCname, resolveTxt } from "dns/promises";
import QRCode from "qrcode";
import { config } from "../config";
import { getPool, query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import { InventoryService } from "./inventory";
import { ProductsService } from "./products";
import { offerCatalogService } from "./offerCatalog";

type StoreStatus = "draft" | "active" | "archived";
type OrderStatus =
  | "novo"
  | "confirmando_pagamento"
  | "aprovado"
  | "em_preparacao"
  | "saiu_para_entrega"
  | "entregue"
  | "cancelado";
type DeliveryStatus = "aguardando_confirmacao" | "confirmado" | "expirado" | "cancelado";

type StoreRow = {
  id: string;
  owner_user_id: string;
  brand_id: string | null;
  slug: string;
  name: string;
  status: StoreStatus;
  template_id: string;
  brand_json: string | null;
  theme_json: string | null;
  settings_json: string | null;
  primary_domain: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateRow = {
  template_id: string;
  name: string;
  description: string | null;
  sections_json: string | null;
  style_json: string | null;
};

type TimelineActorType = "system" | "admin" | "customer" | "courier";
type DeliveryConfirmVia = "qr" | "token" | "admin";

type OrderRow = {
  id: string;
  order_number: string;
  store_id: string;
  status: OrderStatus;
  currency: string;
  subtotal: number | string;
  shipping: number | string;
  discount: number | string;
  total: number | string;
  payment_method: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address_json: string | null;
  items_json: string | null;
  delivery_token: string | null;
  delivery_status: DeliveryStatus | null;
  delivery_qr_data_url: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  courier_route_url: string | null;
  delivered_at: string | null;
  delivery_confirmed_by: string | null;
  delivery_confirmed_via: DeliveryConfirmVia | null;
  notes: string | null;
  source: "site" | "whatsapp" | "admin";
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function sanitizeDomain(value: string): string {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return cleaned.split("/")[0].split(":")[0];
}

function normalizeBrandId(value?: string | null): string {
  return String(value || "").trim();
}

function domainCandidates(host: string): string[] {
  const normalized = sanitizeDomain(host);
  if (!normalized) return [];
  const set = new Set([normalized]);
  if (normalized.startsWith("www.")) set.add(normalized.slice(4));
  else set.add(`www.${normalized}`);
  return Array.from(set);
}

function buildDomainVerificationToken(storeId: string, domain: string): string {
  return createHash("sha256")
    .update(`${config.jwtSecret}:${storeId}:${sanitizeDomain(domain)}`)
    .digest("hex")
    .slice(0, 24);
}

function normalizePublicHost(value: string): string | null {
  const host = sanitizeDomain(value);
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

export function defaultMarketingWhatsAppSettings(): Record<string, any> {
  return {
    enabled: false,
    show_in_hero: true,
    show_fab: false,
    fab_position: "bottom-right",
    prefilled_message: "Olá! Vim pelo catálogo e gostaria de mais informações.",
    show_on_pages: "all",
    button: {
      shape: "circle",
      size: "md",
      color_preset: "whatsapp",
      bg_color: "#25D366",
      text_color: "#FFFFFF",
      border_color: "#25D366",
      effect: "shadow",
      content: "icon",
      label: "Chamar no WhatsApp",
    },
  };
}

export function defaultStoreSettings(): Record<string, any> {
  return {
    checkout: { collect_email: true, collect_address: true },
    notifications: { admin: true, whatsapp: null, email: null, webhook_url: null },
    logistics: {
      default_eta_minutes: 40,
      token_prefix: "DEL",
      confirm_base_url: null,
      require_delivery_token: true,
      shipping_mode: "delivery",
      delivery_fee: null,
      delivery_radius_km: 40,
      free_shipping_above: null,
      delivery_time_text: null,
      frete_texto: null,
      expedition_phone: null,
      cep_provider: "auto",
      origin: {
        cep: null,
        address: null,
        city: null,
        state: null,
        lat: null,
        lng: null,
      },
      tiers: [
        {
          id: "short",
          label: "Curta distância",
          mode: "fixed",
          from_km: 0,
          to_km: 5,
          fixed_fee: 12,
          eta_minutes: 60,
        },
        {
          id: "medium",
          label: "Média distância",
          mode: "per_km",
          from_km: 5,
          to_km: 15,
          base_fee: 10,
          price_per_km: 2.5,
          eta_minutes: 120,
        },
        {
          id: "long",
          label: "Longa distância",
          mode: "per_km",
          from_km: 15,
          to_km: 40,
          base_fee: 15,
          price_per_km: 3.2,
          eta_minutes: 180,
        },
      ],
    },
    automation: {
      order_flow: {
        active: false,
        version: "1.0.0",
        name: "Fluxo Completo de Pedido + Logistica + QR/Token",
        semi_configured: true,
        statuses: [
          "novo",
          "confirmando_pagamento",
          "aprovado",
          "em_preparacao",
          "saiu_para_entrega",
          "entregue",
          "cancelado",
        ],
        phases: [
          "order_created",
          "payment_confirmed",
          "preparation",
          "out_for_delivery",
          "delivery_confirmation",
          "post_sale",
        ],
      },
    },
    seo: { auto_index: true },
    design: {
      categories_carousel: {
        enabled: true,
        shape: "rounded",
      },
    },
    marketing: {
      whatsapp: defaultMarketingWhatsAppSettings(),
      announcement_bar: { enabled: true, text: "", link_url: null, dismissible: true },
      trust_strip: { enabled: true, items: [] },
      conversion: {
        show_best_sellers: true,
        best_sellers_title: "Mais vendidos",
        best_sellers_limit: 8,
        show_product_badges: true,
        sticky_atc: true,
        show_pdp_trust: true,
        cart_drawer: true,
        cart_upsell: true,
        urgency_low_stock: true,
        promo_ends_at: null,
        promo_label: "Oferta por tempo limitado",
      },
      /** Card instalar app no catálogo — identidade da marca, não LeadCapture */
      pwa_install: {
        enabled: true,
        title: "",
        subtitle: "Peça e acompanhe na tela inicial — mais rápido, sem abrir o navegador.",
        benefit_1: "Abre mais rápido que pelo navegador",
        benefit_2: "Atalho fixo na tela inicial do celular",
        benefit_3: "Receba avisos importantes do pedido",
        benefit_4: "Experiência de app, com a cara da loja",
        cta_label: "Instalar app",
        dismiss_label: "Agora não",
      },
      widgets: [],
      popups: [],
    },
  };
}

const WA_SHAPES = new Set(["circle", "rounded", "pill"]);
const WA_SIZES = new Set(["sm", "md", "lg"]);
const WA_COLOR_PRESETS = new Set(["whatsapp", "brand", "dark", "soft", "outline", "custom"]);
const WA_EFFECTS = new Set(["none", "shadow", "pulse", "glow"]);
const WA_CONTENTS = new Set(["icon", "icon_text", "text"]);

function isHexColor(v: unknown): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(v || "").trim());
}

function sanitizeWhatsAppButton(raw: any, legacy: any): Record<string, any> {
  const src = raw && typeof raw === "object" ? raw : {};
  // Migração legada button_style → button
  const legacyStyle = String(legacy?.button_style || "").trim();
  let shape = String(src.shape || "");
  let size = String(src.size || "");
  let colorPreset = String(src.color_preset || "");
  let effect = String(src.effect || "");
  let content = String(src.content || "");

  if (!WA_SHAPES.has(shape) || !WA_COLOR_PRESETS.has(colorPreset)) {
    if (legacyStyle === "soft") colorPreset = colorPreset || "soft";
    else if (legacyStyle === "outline") colorPreset = colorPreset || "outline";
    else if (legacyStyle === "brand") colorPreset = colorPreset || "brand";
    else if (legacyStyle === "dark") colorPreset = colorPreset || "dark";
    else if (legacyStyle === "pulse") {
      colorPreset = colorPreset || "whatsapp";
      effect = effect || "pulse";
      shape = shape || "circle";
      content = content || "icon";
    } else if (legacyStyle === "gradient") {
      colorPreset = colorPreset || "whatsapp";
      effect = effect || "glow";
    }
    if (legacy?.fab_size === "lg") size = size || "lg";
    if (legacy?.fab_show_label === false) {
      content = content || "icon";
      shape = shape || "circle";
    } else if (legacy?.fab_show_label === true || legacyStyle) {
      content = content || "icon_text";
      shape = shape || "pill";
    }
  }

  shape = WA_SHAPES.has(shape) ? shape : "circle";
  size = WA_SIZES.has(size) ? size : "md";
  colorPreset = WA_COLOR_PRESETS.has(colorPreset) ? colorPreset : "whatsapp";
  effect = WA_EFFECTS.has(effect) ? effect : "shadow";
  content = WA_CONTENTS.has(content) ? content : "icon";
  if (shape === "circle") content = "icon";

  return {
    shape,
    size,
    color_preset: colorPreset,
    bg_color: isHexColor(src.bg_color) ? String(src.bg_color) : "#25D366",
    text_color: isHexColor(src.text_color) ? String(src.text_color) : "#FFFFFF",
    border_color: isHexColor(src.border_color) ? String(src.border_color) : "#25D366",
    effect,
    content,
    label: String(src.label || "Chamar no WhatsApp").trim().slice(0, 40) || "Chamar no WhatsApp",
  };
}

export function sanitizePublicMarketingSettings(settings: Record<string, any> | null | undefined): Record<string, any> {
  const marketing = (settings || {}).marketing || {};
  const whatsapp = marketing.whatsapp || {};
  const bar = marketing.announcement_bar || {};
  const strip = marketing.trust_strip || {};
  const conv = marketing.conversion || {};
  const stripItems = Array.isArray(strip.items)
    ? strip.items
        .map((it: any, i: number) => ({
          id: String(it?.id || `t${i}`),
          label: String(it?.label || "").trim().slice(0, 48),
        }))
        .filter((it: any) => it.label)
    : [];
  return {
    whatsapp: {
      enabled: whatsapp.enabled === true,
      show_in_hero: whatsapp.show_in_hero !== false,
      show_fab: whatsapp.show_fab === true,
      fab_position: whatsapp.fab_position === "bottom-left" ? "bottom-left" : "bottom-right",
      prefilled_message: String(whatsapp.prefilled_message || "").trim().slice(0, 500),
      show_on_pages: ["all", "home_only", "product_only"].includes(String(whatsapp.show_on_pages || ""))
        ? String(whatsapp.show_on_pages)
        : "all",
      button: sanitizeWhatsAppButton(whatsapp.button, whatsapp),
    },
    announcement_bar: {
      enabled: bar.enabled !== false,
      text: String(bar.text || "").trim().slice(0, 160),
      link_url: bar.link_url ? String(bar.link_url).trim().slice(0, 500) : null,
      dismissible: bar.dismissible !== false,
    },
    trust_strip: {
      enabled: strip.enabled !== false,
      items: stripItems,
    },
    conversion: {
      show_best_sellers: conv.show_best_sellers !== false,
      best_sellers_title: String(conv.best_sellers_title || "Mais vendidos").trim().slice(0, 60),
      best_sellers_limit: Math.min(12, Math.max(4, Number(conv.best_sellers_limit) || 8)),
      show_product_badges: conv.show_product_badges !== false,
      sticky_atc: conv.sticky_atc !== false,
      show_pdp_trust: conv.show_pdp_trust !== false,
      cart_drawer: conv.cart_drawer !== false,
      cart_upsell: conv.cart_upsell !== false,
      urgency_low_stock: conv.urgency_low_stock !== false,
      promo_ends_at: conv.promo_ends_at ? String(conv.promo_ends_at) : null,
      promo_label: String(conv.promo_label || "Oferta por tempo limitado").trim().slice(0, 80),
    },
    pwa_install: (() => {
      const p = marketing.pwa_install || {};
      return {
        enabled: p.enabled !== false,
        title: String(p.title || "").trim().slice(0, 80),
        subtitle: String(
          p.subtitle ||
            "Peça e acompanhe na tela inicial — mais rápido, sem abrir o navegador.",
        )
          .trim()
          .slice(0, 180),
        benefit_1: String(p.benefit_1 || "Abre mais rápido que pelo navegador").trim().slice(0, 90),
        benefit_2: String(p.benefit_2 || "Atalho fixo na tela inicial do celular").trim().slice(0, 90),
        benefit_3: String(p.benefit_3 || "Receba avisos importantes do pedido").trim().slice(0, 90),
        benefit_4: String(p.benefit_4 || "Experiência de app, com a cara da loja").trim().slice(0, 90),
        cta_label: String(p.cta_label || "Instalar app").trim().slice(0, 40),
        dismiss_label: String(p.dismiss_label || "Agora não").trim().slice(0, 40),
      };
    })(),
  };
}

export function sanitizePublicDesignSettings(settings: Record<string, any> | null | undefined): Record<string, any> {
  const carousel = ((settings || {}).design || {}).categories_carousel || {};
  return {
    categories_carousel: {
      enabled: carousel.enabled !== false,
      shape: carousel.shape === "round" ? "round" : "rounded",
    },
  };
}

function mergeStoreSettings(input: Record<string, any> | null | undefined): Record<string, any> {
  const base = defaultStoreSettings();
  const next = input || {};
  return {
    ...base,
    ...next,
    checkout: {
      ...base.checkout,
      ...(next.checkout || {}),
    },
    notifications: {
      ...base.notifications,
      ...(next.notifications || {}),
    },
    logistics: {
      ...base.logistics,
      ...(next.logistics || {}),
      origin: {
        ...(base.logistics?.origin || {}),
        ...((next.logistics || {}).origin || {}),
      },
      tiers: Array.isArray((next.logistics || {}).tiers)
        ? (next.logistics || {}).tiers
        : base.logistics.tiers,
    },
    automation: {
      ...base.automation,
      ...(next.automation || {}),
      order_flow: {
        ...base.automation.order_flow,
        ...((next.automation || {}).order_flow || {}),
      },
    },
    seo: {
      ...base.seo,
      ...(next.seo || {}),
    },
    design: {
      ...base.design,
      ...(next.design || {}),
      categories_carousel: {
        ...base.design.categories_carousel,
        ...((next.design || {}).categories_carousel || {}),
      },
    },
    marketing: {
      ...base.marketing,
      ...(next.marketing || {}),
      whatsapp: {
        ...base.marketing.whatsapp,
        ...((next.marketing || {}).whatsapp || {}),
      },
      announcement_bar: {
        ...base.marketing.announcement_bar,
        ...((next.marketing || {}).announcement_bar || {}),
      },
      /** Preview do catálogo (afiliado → cliente) — separado do programa de afiliados */
      catalog_share: {
        ...((base.marketing as any)?.catalog_share || {}),
        ...((next.marketing || {}).catalog_share || {}),
      },
      pwa_install: {
        ...((base.marketing as any)?.pwa_install || {}),
        ...((next.marketing || {}).pwa_install || {}),
      },
      widgets: Array.isArray((next.marketing || {}).widgets) ? (next.marketing || {}).widgets : base.marketing.widgets,
      popups: Array.isArray((next.marketing || {}).popups) ? (next.marketing || {}).popups : base.marketing.popups,
    },
  };
}

function mergeStoreSettingsWithPatch(
  currentSettings: Record<string, any> | null | undefined,
  patchSettings: Record<string, any> | null | undefined
): Record<string, any> {
  const current = mergeStoreSettings(currentSettings || {});
  const patch = patchSettings || {};
  const patchLogistics = patch.logistics || {};
  const currentLogistics = current.logistics || {};
  return mergeStoreSettings({
    ...current,
    ...patch,
    checkout: {
      ...(current.checkout || {}),
      ...(patch.checkout || {}),
    },
    notifications: {
      ...(current.notifications || {}),
      ...(patch.notifications || {}),
    },
    logistics: {
      ...currentLogistics,
      ...patchLogistics,
      origin: {
        ...(currentLogistics.origin || {}),
        ...(patchLogistics.origin || {}),
      },
      // tiers: se o patch manda array, substitui; senão mantém o atual
      tiers: Array.isArray(patchLogistics.tiers)
        ? patchLogistics.tiers
        : currentLogistics.tiers,
    },
    automation: {
      ...(current.automation || {}),
      ...(patch.automation || {}),
      order_flow: {
        ...((current.automation || {}).order_flow || {}),
        ...((patch.automation || {}).order_flow || {}),
      },
    },
    seo: {
      ...(current.seo || {}),
      ...(patch.seo || {}),
    },
    design: {
      ...(current.design || {}),
      ...(patch.design || {}),
      categories_carousel: {
        ...((current.design || {}).categories_carousel || {}),
        ...((patch.design || {}).categories_carousel || {}),
      },
    },
    marketing: {
      ...(current.marketing || {}),
      ...(patch.marketing || {}),
      whatsapp: {
        ...((current.marketing || {}).whatsapp || {}),
        ...((patch.marketing || {}).whatsapp || {}),
      },
      announcement_bar: {
        ...((current.marketing || {}).announcement_bar || {}),
        ...((patch.marketing || {}).announcement_bar || {}),
      },
      catalog_share: {
        ...((current.marketing || {}).catalog_share || {}),
        ...((patch.marketing || {}).catalog_share || {}),
      },
      pwa_install: {
        ...((current.marketing || {}).pwa_install || {}),
        ...((patch.marketing || {}).pwa_install || {}),
      },
      widgets: patch.marketing?.widgets !== undefined
        ? (Array.isArray(patch.marketing.widgets) ? patch.marketing.widgets : [])
        : (current.marketing?.widgets || []),
      popups: patch.marketing?.popups !== undefined
        ? (Array.isArray(patch.marketing.popups) ? patch.marketing.popups : [])
        : (current.marketing?.popups || []),
    },
  });
}

function toSqlDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function formatMoneyBr(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `R$ ${amount.toFixed(2).replace(".", ",")}`;
}

export class StorefrontService {
  static _syncThrottle = new Map<string, number>();
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private productsService = new ProductsService();
  private inventoryService = new InventoryService();

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const row = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return Number(row?.total || 0) > 0;
  }

  private async ensureColumn(tableName: string, columnName: string, definition: string): Promise<void> {
    const exists = await this.columnExists(tableName, columnName);
    if (exists) return;
    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private mapStore(row: StoreRow) {
    return {
      id: row.id,
      owner_user_id: row.owner_user_id,
      brand_id: normalizeBrandId(row.brand_id || "") || null,
      slug: row.slug,
      name: row.name,
      status: row.status,
      template_id: row.template_id,
      brand: parseJson(row.brand_json, {}),
      theme: parseJson(row.theme_json, {}),
      settings: mergeStoreSettings(parseJson(row.settings_json, {})),
      primary_domain: row.primary_domain || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapTemplate(row: TemplateRow) {
    return {
      template_id: row.template_id,
      name: row.name,
      description: row.description || "",
      sections: parseJson<string[]>(row.sections_json, []),
      style: parseJson<Record<string, any>>(row.style_json, {}),
    };
  }

  private parseObjectJson(value: unknown): Record<string, any> {
    return parseJson<Record<string, any>>(value, {});
  }

  private toIsoNow(): string {
    return new Date().toISOString();
  }

  private async synchronizeStoreBrandIdentity(store: StoreRow): Promise<void> {
    const brandId = normalizeBrandId(store.brand_id);
    const userId = String(store.owner_user_id || "").trim();
    if (!brandId || !userId) return;

    const brandUnit = await queryOne<any>(
      `SELECT id, name, slug, logo_url, cover_image, slogan, primary_color, secondary_color, site_url, sales_page_url,
              instagram_url, facebook_url, twitter_url, tiktok_url, whatsapp_phone, domain, status, theme_json
       FROM brand_units
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [brandId, userId]
    );
    if (!brandUnit) return;

    const currentBrand = this.parseObjectJson(store.brand_json);
    const currentTheme = this.parseObjectJson(store.theme_json);
    const brandThemeData = this.parseObjectJson(brandUnit.theme_json);
    const brandLogoUrl =
      String(
        brandUnit.logo_url ||
          brandThemeData.logo_url ||
          brandThemeData.logoUrl ||
          brandThemeData.logo ||
          ""
      ).trim() || null;
    const brandCoverImage =
      String(
        brandUnit.cover_image ||
          brandThemeData.cover_image ||
          brandThemeData.cover_image_url ||
          brandThemeData.hero_image ||
          currentBrand.cover_image ||
          currentBrand.cover_image_url ||
          currentTheme.cover_image ||
          currentTheme.cover_image_url ||
          currentTheme.hero_image ||
          ""
      ).trim() || null;
    const brandDescription =
      String(brandThemeData.description || brandUnit.slogan || "").trim() ||
      currentBrand.description ||
      currentBrand.slogan ||
      null;
    const brandAddress =
      String(brandThemeData.address || "").trim() || currentBrand.address || null;

    const nextBrand = {
      ...currentBrand,
      id: String(brandUnit.id || brandId),
      name: String(brandUnit.name || currentBrand.name || store.name || "").trim() || store.name,
      slug: String(brandUnit.slug || currentBrand.slug || "").trim() || toSlug(String(brandUnit.name || store.name || "")),
      logo_url: brandLogoUrl,
      slogan: String(brandUnit.slogan || "").trim() || currentBrand.slogan || null,
      description: brandDescription,
      cover_image: brandCoverImage,
      address: brandAddress,
      primary_color: String(brandUnit.primary_color || "").trim() || currentBrand.primary_color || null,
      secondary_color: String(brandUnit.secondary_color || "").trim() || currentBrand.secondary_color || null,
      site_url: String(brandUnit.site_url || "").trim() || currentBrand.site_url || null,
      sales_page_url: String(brandUnit.sales_page_url || "").trim() || currentBrand.sales_page_url || null,
      instagram_url: String(brandUnit.instagram_url || "").trim() || currentBrand.instagram_url || null,
      facebook_url: String(brandUnit.facebook_url || "").trim() || currentBrand.facebook_url || null,
      twitter_url: String(brandUnit.twitter_url || "").trim() || currentBrand.twitter_url || null,
      tiktok_url: String(brandUnit.tiktok_url || "").trim() || currentBrand.tiktok_url || null,
      whatsapp_phone: String(brandUnit.whatsapp_phone || "").replace(/\D/g, "") || currentBrand.whatsapp_phone || null,
      domain: String(brandUnit.domain || "").trim() || currentBrand.domain || null,
      status: String(brandUnit.status || currentBrand.status || "active").trim() || "active",
      synced_at: this.toIsoNow(),
    } as Record<string, any>;

    const nextTheme = {
      ...currentTheme,
      logo_url: brandLogoUrl,
      logo: brandLogoUrl,
      cover_image: brandCoverImage,
      cover_image_url: brandCoverImage,
      hero_image: brandCoverImage,
      primary_color:
        String(brandUnit.primary_color || "").trim() ||
        String(currentTheme.primary_color || currentTheme.primary || "").trim() ||
        null,
      secondary_color:
        String(brandUnit.secondary_color || "").trim() ||
        String(currentTheme.secondary_color || currentTheme.secondary || "").trim() ||
        null,
    } as Record<string, any>;

    const beforeBrand = JSON.stringify(this.parseObjectJson(store.brand_json));
    const afterBrand = JSON.stringify(nextBrand);
    const beforeTheme = JSON.stringify(this.parseObjectJson(store.theme_json));
    const afterTheme = JSON.stringify(nextTheme);
    if (beforeBrand === afterBrand && beforeTheme === afterTheme) return;

    await update(
      `UPDATE storefront_stores
       SET brand_json = ?, theme_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [afterBrand, afterTheme, store.id]
    );
  }

  private async synchronizeStoreProductsFromCatalog(store: StoreRow): Promise<void> {
    const brandId = normalizeBrandId(store.brand_id);
    const userId = String(store.owner_user_id || "").trim();
    if (!brandId || !userId) return;

    const catalogProducts = await this.productsService.getActiveProducts(userId, brandId);
    const existingRows = (await query<any[]>(
      `SELECT id, slug, name, description, category, price, compare_at_price, images_json, metadata_json, is_active, position
       FROM storefront_products
       WHERE store_id = ?`,
      [store.id]
    )) as any[];

    const bySourceId = new Map<string, any>();
    for (const row of existingRows || []) {
      const metadata = this.parseObjectJson(row.metadata_json);
      const sourceProductId = String(metadata.source_product_id || "").trim();
      if (sourceProductId) {
        bySourceId.set(sourceProductId, { ...row, metadata });
      }
    }

    const activeSourceIds = new Set<string>();

    const resolveUniqueSlug = (rawBase: string, keepId?: string): string => {
      const base = toSlug(rawBase) || `produto-${Date.now()}`;
      let candidate = base;
      let attempt = 1;
      while (true) {
        const owner = (existingRows || []).find((item) => toSlug(String(item.slug || "")) === candidate);
        if (!owner || (keepId && String(owner.id) === keepId)) {
          return candidate;
        }
        attempt += 1;
        candidate = `${base}-${attempt}`;
      }
    };

    /* Batch-fetch variants for all active products (Fase 1) */
    const variantsByProduct = await offerCatalogService.getVariantsByProductIds(
      catalogProducts.map((p) => String(p.id || "")).filter(Boolean)
    );

    for (let index = 0; index < catalogProducts.length; index += 1) {
      const product = catalogProducts[index];
      const sourceProductId = String(product.id || "").trim();
      if (!sourceProductId) continue;
      activeSourceIds.add(sourceProductId);

      const mapped = bySourceId.get(sourceProductId);
      const images = Array.isArray(product.images)
        ? product.images.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      const imageUrl = String(images[0] || product.imageUrl || product.image || "").trim();
      const productVariants = variantsByProduct.get(sourceProductId) || [];
      /* Forward OfferEntity foundation fields into storefront so frontend + public catalog can use them */
      const offerType = String((product as any).type || "physical_product");
      const ctaType = String((product as any).cta_type || "buy");
      const subtitle = String((product as any).subtitle || "").trim();
      const offerAttributes = (product as any).attributes || {};
      const offerSeo = (product as any).seo || {};
      const offerMedia = (product as any).media || {};
      const offerServiceConfig = (product as any).service_config || {};
      const offerConfigurator = (product as any).configurator || {};
      const offerBundleItems = Array.isArray((product as any).bundle_items) ? (product as any).bundle_items : [];
      const sourceMetadata = (product as any).metadata || {};
      const pipelineId = String((product as any).pipeline_id || "").trim() || null;
      /* Inventory (Fase 12) — null = unlimited (default); the public catalog reads
       * stock_status to render Esgotado/Restam X badges without recomputing. */
      const stockQuantity = (product as any).stock_quantity === null || (product as any).stock_quantity === undefined
        ? null
        : Number((product as any).stock_quantity);
      const stockStatus = String((product as any).stock_status || (stockQuantity === null ? "unlimited" : "in_stock"));
      const stockThresholdLow = Number((product as any).stock_threshold_low ?? 5);
      /* Reviews (Fase 14) — denormalized aggregates so public catalog renders
       * stars without a JOIN. Source of truth is reviewsService.recomputeProductAggregates. */
      const reviewsAvg = Number((product as any).reviews_avg ?? 0);
      const reviewsCount = Number((product as any).reviews_count ?? 0);

      const mergedMetadata = {
        ...(mapped?.metadata || {}),
        ...sourceMetadata,
        source: "products_catalog",
        source_product_id: sourceProductId,
        source_brand_id: brandId,
        source_synced_at: this.toIsoNow(),
        /* OfferEntity foundation (Fase 0) */
        offer_type: offerType,
        cta_type: ctaType,
        subtitle: subtitle || undefined,
        attributes: offerAttributes,
        seo: offerSeo,
        media: offerMedia,
        pipeline_id: pipelineId,
        /* Service config (Fase 5) */
        service_config: offerServiceConfig,
        /* Configurator (Fase 4) */
        configurator: offerConfigurator,
        /* Bundle items (Fase 11) — stored with source-catalog product IDs */
        bundle_items: offerBundleItems,
        /* Inventory (Fase 12) */
        stock_quantity: stockQuantity,
        stock_status: stockStatus,
        stock_threshold_low: stockThresholdLow,
        /* Reviews (Fase 14) */
        reviews_avg: reviewsAvg,
        reviews_count: reviewsCount,
      };

      const targetSlug = resolveUniqueSlug(String(product.name || sourceProductId), mapped?.id);
      const targetName = String(product.name || "").trim() || `Produto ${sourceProductId.slice(0, 6)}`;
      const targetDescription = String(product.description || "").trim() || null;
      const targetCategory = String(product.category || "").trim() || null;
      const regularPrice = toNumber(product.price, 0);
      const promoRaw = Number((product as any).promoPrice);
      const hasPromo = Number.isFinite(promoRaw) && promoRaw > 0 && promoRaw < regularPrice;
      const targetPrice = hasPromo ? promoRaw : regularPrice;
      const targetComparePrice = hasPromo ? regularPrice : null;

      const variantsJson = JSON.stringify(productVariants);

      if (mapped) {
        const currentImages = parseJson<string[]>(mapped.images_json, []);
        const currentMetadata = this.parseObjectJson(mapped.metadata_json);
        const currentVariants = parseJson<any[]>(mapped.variants_json, []);
        const hasChanged =
          String(mapped.slug || "") !== targetSlug ||
          String(mapped.name || "") !== targetName ||
          String(mapped.description || "") !== String(targetDescription || "") ||
          String(mapped.category || "") !== String(targetCategory || "") ||
          Number(mapped.price || 0) !== targetPrice ||
          Number(mapped.compare_at_price || 0) !== Number(targetComparePrice || 0) ||
          JSON.stringify(currentImages) !== JSON.stringify(images) ||
          JSON.stringify(currentMetadata) !== JSON.stringify(mergedMetadata) ||
          JSON.stringify(currentVariants) !== variantsJson ||
          Number(mapped.is_active || 0) !== 1 ||
          Number(mapped.position || 0) !== index;

        if (hasChanged) {
          await update(
            `UPDATE storefront_products
             SET slug = ?, name = ?, description = ?, category = ?, price = ?, compare_at_price = ?,
                 currency = 'BRL', images_json = ?, variants_json = ?, metadata_json = ?, is_active = 1, position = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              targetSlug,
              targetName,
              targetDescription,
              targetCategory,
              targetPrice,
              targetComparePrice,
              JSON.stringify(images),
              variantsJson,
              JSON.stringify(mergedMetadata),
              index,
              mapped.id,
            ]
          );
        }
      } else {
        await query(
          `INSERT INTO storefront_products
           (id, store_id, slug, name, description, category, price, compare_at_price, currency, images_json, variants_json, metadata_json, is_active, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?, TRUE, ?)`,
          [
            randomUUID(),
            store.id,
            targetSlug,
            targetName,
            targetDescription,
            targetCategory,
            targetPrice,
            targetComparePrice,
            JSON.stringify(images),
            variantsJson,
            JSON.stringify(mergedMetadata),
            index,
          ]
        );
      }
    }

    for (const row of existingRows || []) {
      const metadata = this.parseObjectJson(row.metadata_json);
      const sourceProductId = String(metadata.source_product_id || "").trim();
      if (!sourceProductId) continue;
      if (activeSourceIds.has(sourceProductId)) continue;

      if (Number(row.is_active || 0) !== 0) {
        await update(
          `UPDATE storefront_products
           SET is_active = FALSE, updated_at = NOW()
           WHERE id = ?`,
          [row.id]
        );
      }
    }
  }

  async synchronizeBrandStructure(userId: string, brandId?: string | null, options?: { syncProducts?: boolean }) {
    await this.ensureSchema();
    const normalizedBrandId = normalizeBrandId(brandId);
    if (!normalizedBrandId) return null;

    const store = await this.ensureSingleStoreForBrand(userId, normalizedBrandId);
    if (!store) return null;

    const storeRow = await this.getOwnedStoreRow(userId, String(store.id), normalizedBrandId);
    if (!storeRow) return store;

    await this.synchronizeStoreBrandIdentity(storeRow);
    if (options?.syncProducts !== false) {
      await this.synchronizeStoreProductsFromCatalog(storeRow);
    }

    if (storeRow.status === "draft") {
      await update(
        `UPDATE storefront_stores SET status = 'active', updated_at = NOW() WHERE id = ? AND status = 'draft'`,
        [storeRow.id]
      );
    }

    const refreshed = await this.getOwnedStoreRow(userId, String(store.id), normalizedBrandId);
    return refreshed ? this.mapStore(refreshed) : store;
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;

    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS storefront_templates (
          template_id VARCHAR(80) PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          description TEXT NULL,
          sections_json JSON NULL,
          style_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_stores (
          id VARCHAR(36) PRIMARY KEY,
          owner_user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL DEFAULT '',
          slug VARCHAR(140) NOT NULL,
          name VARCHAR(180) NOT NULL,
          status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
          template_id VARCHAR(80) NOT NULL,
          brand_json JSON NULL,
          theme_json JSON NULL,
          settings_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_slug (slug),
          KEY idx_storefront_owner (owner_user_id),
          KEY idx_storefront_owner_brand (owner_user_id, brand_id),
          KEY idx_storefront_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_domains (
          id VARCHAR(36) PRIMARY KEY,
          store_id VARCHAR(36) NOT NULL,
          domain VARCHAR(255) NOT NULL,
          is_primary TINYINT(1) NOT NULL DEFAULT 0,
          verification_status ENUM('pending','verified','failed') NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_domain (domain),
          KEY idx_storefront_domain_store (store_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_products (
          id VARCHAR(36) PRIMARY KEY,
          store_id VARCHAR(36) NOT NULL,
          slug VARCHAR(160) NOT NULL,
          name VARCHAR(180) NOT NULL,
          description TEXT NULL,
          category VARCHAR(120) NULL,
          price DECIMAL(12,2) NOT NULL DEFAULT 0,
          compare_at_price DECIMAL(12,2) NULL,
          currency CHAR(3) NOT NULL DEFAULT 'BRL',
          images_json JSON NULL,
          variants_json JSON NULL,
          metadata_json JSON NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          position INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_product_slug (store_id, slug),
          KEY idx_storefront_product_store (store_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_pages (
          id VARCHAR(36) PRIMARY KEY,
          store_id VARCHAR(36) NOT NULL,
          slug VARCHAR(160) NOT NULL,
          title VARCHAR(180) NOT NULL,
          page_type ENUM('home','about','products','product','custom','ai_generated') NOT NULL DEFAULT 'custom',
          sections_json JSON NULL,
          seo_json JSON NULL,
          is_published TINYINT(1) NOT NULL DEFAULT 1,
          created_by_ai TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_page_slug (store_id, slug),
          KEY idx_storefront_page_store (store_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_orders (
          id VARCHAR(36) PRIMARY KEY,
          order_number VARCHAR(40) NOT NULL,
          store_id VARCHAR(36) NOT NULL,
          status ENUM('novo','confirmando_pagamento','aprovado','em_preparacao','saiu_para_entrega','entregue','cancelado') NOT NULL DEFAULT 'novo',
          currency CHAR(3) NOT NULL DEFAULT 'BRL',
          subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
          shipping DECIMAL(12,2) NOT NULL DEFAULT 0,
          discount DECIMAL(12,2) NOT NULL DEFAULT 0,
          total DECIMAL(12,2) NOT NULL DEFAULT 0,
          payment_method VARCHAR(40) NULL,
          customer_name VARCHAR(180) NOT NULL,
          customer_phone VARCHAR(40) NOT NULL,
          customer_email VARCHAR(190) NULL,
          customer_address_json JSON NULL,
          items_json JSON NULL,
          delivery_token VARCHAR(80) NULL,
          delivery_status ENUM('aguardando_confirmacao','confirmado','expirado','cancelado') NULL,
          delivery_qr_data_url LONGTEXT NULL,
          courier_name VARCHAR(140) NULL,
          courier_phone VARCHAR(40) NULL,
          courier_route_url TEXT NULL,
          delivered_at TIMESTAMP NULL,
          delivery_confirmed_by VARCHAR(140) NULL,
          delivery_confirmed_via ENUM('qr','token','admin') NULL,
          notes TEXT NULL,
          source ENUM('site','whatsapp','admin') NOT NULL DEFAULT 'site',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_order_number (order_number),
          KEY idx_storefront_order_store (store_id),
          KEY idx_storefront_order_status (store_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_order_notifications (
          id VARCHAR(36) PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          store_id VARCHAR(36) NOT NULL,
          channel ENUM('admin','whatsapp','email') NOT NULL,
          target VARCHAR(255) NULL,
          status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
          payload_json JSON NULL,
          last_error TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_storefront_notif_order (order_id),
          KEY idx_storefront_notif_store (store_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_order_timeline (
          id VARCHAR(36) PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          store_id VARCHAR(36) NOT NULL,
          event_type VARCHAR(80) NOT NULL,
          status_before VARCHAR(80) NULL,
          status_after VARCHAR(80) NULL,
          actor_type ENUM('system','admin','customer','courier') NOT NULL DEFAULT 'system',
          actor_name VARCHAR(140) NULL,
          payload_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_storefront_timeline_order (order_id, created_at),
          KEY idx_storefront_timeline_store (store_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_delivery_tokens (
          id VARCHAR(36) PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          store_id VARCHAR(36) NOT NULL,
          token VARCHAR(80) NOT NULL,
          expires_at TIMESTAMP NULL,
          used_at TIMESTAMP NULL,
          used_via ENUM('qr','token','admin') NULL,
          used_by VARCHAR(140) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_storefront_delivery_token (token),
          KEY idx_storefront_delivery_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_post_sale_queue (
          id VARCHAR(36) PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          store_id VARCHAR(36) NOT NULL,
          stage ENUM('2h_checkin','24h_review') NOT NULL,
          run_at TIMESTAMP NOT NULL,
          status ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
          payload_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_storefront_post_sale_run (status, run_at),
          KEY idx_storefront_post_sale_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.ensureColumn("storefront_orders", "payment_method", "VARCHAR(40) NULL");
      await this.ensureColumn("storefront_stores", "brand_id", "VARCHAR(36) NOT NULL DEFAULT ''");
      await this.ensureColumn("storefront_orders", "delivery_token", "VARCHAR(80) NULL");
      await this.ensureColumn(
        "storefront_orders",
        "delivery_status",
        "ENUM('aguardando_confirmacao','confirmado','expirado','cancelado') NULL"
      );
      await this.ensureColumn("storefront_orders", "delivery_qr_data_url", "LONGTEXT NULL");
      await this.ensureColumn("storefront_orders", "courier_name", "VARCHAR(140) NULL");
      await this.ensureColumn("storefront_orders", "courier_phone", "VARCHAR(40) NULL");
      await this.ensureColumn("storefront_orders", "courier_route_url", "TEXT NULL");
      await this.ensureColumn("storefront_orders", "delivered_at", "TIMESTAMP NULL");
      await this.ensureColumn("storefront_orders", "delivery_confirmed_by", "VARCHAR(140) NULL");
      await this.ensureColumn(
        "storefront_orders",
        "delivery_confirmed_via",
        "ENUM('qr','token','admin') NULL"
      );

      await query(`
        CREATE TABLE IF NOT EXISTS storefront_customers (
          id VARCHAR(36) PRIMARY KEY,
          store_id VARCHAR(36) NOT NULL,
          name VARCHAR(180) NOT NULL,
          email VARCHAR(190) NULL,
          phone VARCHAR(40) NULL,
          address_json JSON NULL,
          notes TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_sf_customer_store (store_id),
          KEY idx_sf_customer_phone (store_id, phone),
          KEY idx_sf_customer_email (store_id, email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await this.ensureColumn("storefront_orders", "customer_id", "VARCHAR(36) NULL");

      await query(`
        ALTER TABLE storefront_orders
        MODIFY COLUMN status ENUM('novo','confirmando_pagamento','aprovado','em_preparacao','saiu_para_entrega','entregue','cancelado') NOT NULL DEFAULT 'novo'
      `);

      await this.seedTemplates();
      this.schemaReady = true;
    })().finally(() => {
      this.schemaPromise = null;
    });

    await this.schemaPromise;
  }

  private async seedTemplates(): Promise<void> {
    const templates = [
      {
        template_id: "modern_minimal",
        name: "Modern Minimal",
        description: "Visual clean com foco em produto e conversao.",
        sections: ["hero", "featured", "products_grid", "cta", "footer"],
        style: { palette: { background: "#f8fafc", surface: "#ffffff", primary: "#0f172a", accent: "#0ea5e9" } },
      },
      {
        template_id: "dark_premium",
        name: "Dark Premium",
        description: "Layout escuro com destaque de marca para ticket alto.",
        sections: ["hero", "social_proof", "products_grid", "faq", "cta", "footer"],
        style: { palette: { background: "#020617", surface: "#0f172a", primary: "#f8fafc", accent: "#22d3ee" } },
      },
      {
        template_id: "creator_brand",
        name: "Creator Brand",
        description: "Storytelling e imagem em primeiro plano para creators.",
        sections: ["hero", "about", "benefits", "products_grid", "testimonials", "cta", "footer"],
        style: { palette: { background: "#fff7ed", surface: "#ffffff", primary: "#7c2d12", accent: "#ea580c" } },
      },
    ];

    for (const tpl of templates) {
      await query(
        `INSERT INTO storefront_templates (template_id, name, description, sections_json, style_json)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           description = VALUES(description),
           sections_json = VALUES(sections_json),
           style_json = VALUES(style_json)`,
        [tpl.template_id, tpl.name, tpl.description, JSON.stringify(tpl.sections), JSON.stringify(tpl.style)]
      );
    }
  }
  private buildOwnedBrandScope(brandId?: string | null, tableAlias = "s"): { sql: string; params: any[] } {
    const normalized = normalizeBrandId(brandId);
    if (!normalized) {
      return { sql: ` AND (${tableAlias}.brand_id = '' OR ${tableAlias}.brand_id IS NULL)`, params: [] };
    }
    return { sql: ` AND ${tableAlias}.brand_id = ?`, params: [normalized] };
  }

  private async getOwnedStoreRow(userId: string, storeId: string, brandId?: string | null): Promise<StoreRow | null> {
    await this.ensureSchema();
    const scope = this.buildOwnedBrandScope(brandId, "s");
    return (
      (await queryOne<StoreRow>(
        `SELECT s.*, d.domain AS primary_domain
         FROM storefront_stores s
         LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
         WHERE s.id = ? AND s.owner_user_id = ?${scope.sql}
         LIMIT 1`,
        [storeId, userId, ...scope.params]
      )) || null
    );
  }

  private async resolveBrandSeed(userId: string, brandId?: string | null): Promise<{
    name: string;
    slugBase: string;
    brand: Record<string, any>;
  }> {
    const normalizedBrand = normalizeBrandId(brandId);
    if (normalizedBrand) {
      const brandUnit = await queryOne<any>(
        `SELECT id, name, slug, logo_url, slogan, primary_color, secondary_color
         FROM brand_units
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [normalizedBrand, userId]
      );

      if (brandUnit) {
        const name = String(brandUnit.name || "").trim() || "Loja da Marca";
        const slugBase = toSlug(String(brandUnit.slug || "").trim() || name) || `store-${normalizedBrand.slice(0, 8)}`;
        return {
          name,
          slugBase,
          brand: {
            id: String(brandUnit.id || normalizedBrand),
            name,
            slug: String(brandUnit.slug || "").trim() || slugBase,
            logo_url: String(brandUnit.logo_url || "").trim() || undefined,
            slogan: String(brandUnit.slogan || "").trim() || undefined,
            primary_color: String(brandUnit.primary_color || "").trim() || undefined,
            secondary_color: String(brandUnit.secondary_color || "").trim() || undefined,
          },
        };
      }
    }

    const fallbackName = "Loja Principal";
    return {
      name: fallbackName,
      slugBase: toSlug(`${fallbackName}-${userId.slice(0, 6)}`) || `store-${Date.now()}`,
      brand: { name: fallbackName },
    };
  }

  private async makeUniqueStoreSlug(baseInput: string): Promise<string> {
    const base = toSlug(baseInput) || `store-${Date.now()}`;
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const exists = await queryOne<{ id: string }>(`SELECT id FROM storefront_stores WHERE slug = ? LIMIT 1`, [candidate]);
      if (!exists) return candidate;
    }
    return `${base}-${Date.now().toString().slice(-6)}`;
  }

  private async ensureSingleStoreForBrand(userId: string, brandId?: string | null) {
    await this.ensureSchema();
    const scope = this.buildOwnedBrandScope(brandId, "s");
    const existing = await queryOne<StoreRow>(
      `SELECT s.*, d.domain AS primary_domain
       FROM storefront_stores s
      LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
       WHERE s.owner_user_id = ?${scope.sql}
       ORDER BY (s.status = 'active') DESC, s.updated_at DESC
       LIMIT 1`,
      [userId, ...scope.params]
    );

    if (existing) return this.mapStore(existing);

    const seed = await this.resolveBrandSeed(userId, brandId);
    const uniqueSlug = await this.makeUniqueStoreSlug(seed.slugBase);

    return this.createStore(
      userId,
      {
        name: seed.name,
        slug: uniqueSlug,
        status: "active",
        template_id: "modern_minimal",
        brand: seed.brand,
      },
      brandId
    );
  }

  async listTemplates() {
    await this.ensureSchema();
    const rows = await query<TemplateRow[]>(`SELECT * FROM storefront_templates ORDER BY template_id ASC`);
    return rows.map((row) => this.mapTemplate(row));
  }

  async listStores(userId: string, brandId?: string | null) {
    if (normalizeBrandId(brandId)) {
      await this.synchronizeBrandStructure(userId, brandId, { syncProducts: true });
    }
    const primaryStore = await this.ensureSingleStoreForBrand(userId, brandId);
    return primaryStore ? [primaryStore] : [];
  }

  async getStoreById(userId: string, storeId: string, brandId?: string | null) {
    if (normalizeBrandId(brandId)) {
      await this.synchronizeBrandStructure(userId, brandId, { syncProducts: true });
    }
    const row = await this.getOwnedStoreRow(userId, storeId, brandId);
    return row ? this.mapStore(row) : null;
  }

  async createStore(
    userId: string,
    payload: Partial<{
      name: string;
      slug: string;
      status: StoreStatus;
      template_id: string;
      brand: Record<string, any>;
      theme: Record<string, any>;
      settings: Record<string, any>;
      custom_domain: string;
    }>,
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const scope = this.buildOwnedBrandScope(brandId, "s");
    const existing = await queryOne<StoreRow>(
      `SELECT s.*, d.domain AS primary_domain
       FROM storefront_stores s
      LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
       WHERE s.owner_user_id = ?${scope.sql}
       ORDER BY (s.status = 'active') DESC, s.updated_at DESC
       LIMIT 1`,
      [userId, ...scope.params]
    );

    if (existing) {
      const patch: Record<string, any> = {};
      if (payload.name !== undefined) patch.name = payload.name;
      if (payload.slug !== undefined) patch.slug = payload.slug;
      if (payload.status !== undefined) patch.status = payload.status;
      if (payload.template_id !== undefined) patch.template_id = payload.template_id;
      if (payload.brand !== undefined) patch.brand = payload.brand;
      if (payload.theme !== undefined) patch.theme = payload.theme;
      if (payload.settings !== undefined) patch.settings = payload.settings;

      if (Object.keys(patch).length > 0) {
        const updated = await this.updateStore(userId, existing.id, patch, brandId);
        if (updated) return updated;
      }

      return this.mapStore(existing);
    }

    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Store name is required");

    const slug = toSlug(payload.slug || name);
    if (!slug) throw new Error("Store slug is invalid");

    const slugInUse = await queryOne<{ id: string }>(`SELECT id FROM storefront_stores WHERE slug = ? LIMIT 1`, [slug]);
    if (slugInUse) throw new Error("Store slug already in use");

    const templateId = String(payload.template_id || "modern_minimal").trim();
    const template = await queryOne<{ template_id: string }>(
      `SELECT template_id FROM storefront_templates WHERE template_id = ? LIMIT 1`,
      [templateId]
    );
    if (!template) throw new Error("Template not found");

    const id = randomUUID();
    await query(
      `INSERT INTO storefront_stores
       (id, owner_user_id, brand_id, slug, name, status, template_id, brand_json, theme_json, settings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        normalizeBrandId(brandId),
        slug,
        name,
        payload.status || "draft",
        templateId,
        JSON.stringify(payload.brand || { name }),
        JSON.stringify(payload.theme || {}),
        JSON.stringify(mergeStoreSettings(payload.settings || {})),
      ]
    );

    await this.ensureDefaultPagesForStore(id);
    if (payload.custom_domain) {
      await this.upsertDomain(userId, id, payload.custom_domain, true, brandId);
    }

    const created = await this.getOwnedStoreRow(userId, id, brandId);
    if (!created) throw new Error("Failed to create store");
    return this.mapStore(created);
  }

  async updateStore(
    userId: string,
    storeId: string,
    payload: Partial<{
      name: string;
      slug: string;
      status: StoreStatus;
      template_id: string;
      brand: Record<string, any>;
      theme: Record<string, any>;
      settings: Record<string, any>;
    }>,
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const existing = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!existing) return null;

    const fields: string[] = [];
    const params: any[] = [];

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Store name is required");
      fields.push("name = ?");
      params.push(name);
    }

    if (payload.slug !== undefined) {
      const slug = toSlug(payload.slug);
      if (!slug) throw new Error("Store slug is invalid");
      const inUse = await queryOne<{ id: string }>(
        `SELECT id FROM storefront_stores WHERE slug = ? AND id <> ? LIMIT 1`,
        [slug, storeId]
      );
      if (inUse) throw new Error("Store slug already in use");
      fields.push("slug = ?");
      params.push(slug);
    }

    if (payload.status !== undefined) {
      fields.push("status = ?");
      params.push(payload.status);
    }

    if (payload.template_id !== undefined) {
      const templateId = String(payload.template_id || "").trim();
      const template = await queryOne<{ template_id: string }>(
        `SELECT template_id FROM storefront_templates WHERE template_id = ? LIMIT 1`,
        [templateId]
      );
      if (!template) throw new Error("Template not found");
      fields.push("template_id = ?");
      params.push(templateId);
    }

    if (payload.brand !== undefined) {
      fields.push("brand_json = ?");
      params.push(JSON.stringify(payload.brand || {}));
    }

    if (payload.theme !== undefined) {
      fields.push("theme_json = ?");
      params.push(JSON.stringify(payload.theme || {}));
    }

    if (payload.settings !== undefined) {
      fields.push("settings_json = ?");
      const currentSettings = parseJson(existing.settings_json, {});
      params.push(JSON.stringify(mergeStoreSettingsWithPatch(currentSettings, payload.settings || {})));
    }

    if (fields.length > 0) {
      const normalizedBrand = normalizeBrandId(brandId);
      const brandSql = normalizedBrand ? " AND brand_id = ?" : " AND (brand_id = '' OR brand_id IS NULL)";
      params.push(storeId, userId);
      if (normalizedBrand) params.push(normalizedBrand);
      await update(`UPDATE storefront_stores SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ? AND owner_user_id = ?${brandSql}`, params);
    }

    const updated = await this.getOwnedStoreRow(userId, storeId, brandId);
    return updated ? this.mapStore(updated) : null;
  }

  async upsertDomain(userId: string, storeId: string, domainInput: string, makePrimary = true, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const domain = sanitizeDomain(domainInput);
    if (!domain) throw new Error("Custom domain is invalid");

    const external = await queryOne<{ store_id: string }>(
      `SELECT store_id FROM storefront_domains WHERE domain = ? AND store_id <> ? LIMIT 1`,
      [domain, storeId]
    );
    if (external) throw new Error("Domain already linked to another store");

    if (makePrimary) {
      await update(`UPDATE storefront_domains SET is_primary = FALSE WHERE store_id = ?`, [storeId]);
    }

    const current = await queryOne<{ id: string }>(
      `SELECT id FROM storefront_domains WHERE store_id = ? AND domain = ? LIMIT 1`,
      [storeId, domain]
    );

    if (current) {
      await update(
        `UPDATE storefront_domains SET is_primary = ?, verification_status = 'pending', updated_at = NOW() WHERE id = ?`,
        [makePrimary ? 1 : 0, current.id]
      );
    } else {
      await query(
        `INSERT INTO storefront_domains (id, store_id, domain, is_primary, verification_status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [randomUUID(), storeId, domain, makePrimary ? 1 : 0]
      );
    }

    return queryOne(`SELECT * FROM storefront_domains WHERE store_id = ? AND domain = ? LIMIT 1`, [storeId, domain]);
  }

  async listDomains(userId: string, storeId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");
    return query(`SELECT * FROM storefront_domains WHERE store_id = ? ORDER BY is_primary DESC, domain ASC`, [storeId]);
  }

  async setPrimaryDomain(userId: string, storeId: string, domainInput: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const domain = sanitizeDomain(domainInput);
    if (!domain) throw new Error("Custom domain is invalid");

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM storefront_domains WHERE store_id = ? AND domain = ? LIMIT 1`,
      [storeId, domain]
    );
    if (!existing) throw new Error("Domain not found");

    await update(`UPDATE storefront_domains SET is_primary = FALSE WHERE store_id = ?`, [storeId]);
    await update(`UPDATE storefront_domains SET is_primary = TRUE, updated_at = NOW() WHERE id = ?`, [existing.id]);

    return queryOne(`SELECT * FROM storefront_domains WHERE id = ? LIMIT 1`, [existing.id]);
  }

  async deleteDomain(userId: string, storeId: string, domainInput: string, brandId?: string | null): Promise<boolean> {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const domain = sanitizeDomain(domainInput);
    if (!domain) throw new Error("Custom domain is invalid");

    const existing = await queryOne<{ id: string; is_primary: number }>(
      `SELECT id, is_primary FROM storefront_domains WHERE store_id = ? AND domain = ? LIMIT 1`,
      [storeId, domain]
    );
    if (!existing) throw new Error("Domain not found");

    const affected = await update(`DELETE FROM storefront_domains WHERE id = ?`, [existing.id]);
    if (affected > 0 && Number(existing.is_primary || 0) === 1) {
      const fallback = await queryOne<{ id: string }>(
        `SELECT id FROM storefront_domains WHERE store_id = ? ORDER BY updated_at DESC, domain ASC LIMIT 1`,
        [storeId]
      );
      if (fallback) {
        await update(`UPDATE storefront_domains SET is_primary = TRUE, updated_at = NOW() WHERE id = ?`, [fallback.id]);
      }
    }

    return affected > 0;
  }

  async getDomainInstructions(userId: string, storeId: string, domainInput: string, publicHostInput?: string | null, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const domain = sanitizeDomain(domainInput);
    if (!domain) throw new Error("Custom domain is invalid");

    const verificationToken = buildDomainVerificationToken(storeId, domain);
    const verificationHost = `_leadcapture-verify.${domain}`;
    const verificationValue = `leadcapture-verification=${verificationToken}`;
    const publicHost = normalizePublicHost(String(publicHostInput || ""));
    const serverIp = String(process.env.VPS_PUBLIC_IP || "187.127.5.179").trim();

    const isWww = domain.startsWith("www.");
    /* Para subdomínios (www.x.com): CNAME pra plataforma.
     * Para apex/raiz (x.com): A record com IP. ALIAS/ANAME funcionam mas
     * variam por provedor — recomendamos "A" porque é universal. */
    const connection = isWww
      ? {
          type: "CNAME",
          host: "www",
          value: publicHost || "app.leadcapture.online",
          note: `Crie um registro CNAME com host "www" apontando para ${publicHost || "app.leadcapture.online"}.`,
        }
      : {
          type: "A",
          host: "@",
          value: serverIp,
          alt_type: "ALIAS",
          alt_value: publicHost || "app.leadcapture.online",
          note: `Crie um registro A com host "@" (raiz) apontando para o IP ${serverIp}. Se o seu provedor pedir um campo "TTL", deixe automático ou 3600. Se aparecer também a opção ALIAS ou ANAME, prefira A — funciona em todos os registradores (Hostinger, Registro.br, GoDaddy, etc).`,
        };

    return {
      domain,
      server_ip: serverIp,
      verification: {
        type: "TXT",
        host: verificationHost,
        value: verificationValue,
      },
      connection,
      expected_origin: `https://${domain}`,
      verification_token: verificationToken,
    };
  }

  async verifyDomainOwnership(userId: string, storeId: string, domainInput: string, publicHostInput?: string | null, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const domain = sanitizeDomain(domainInput);
    if (!domain) throw new Error("Custom domain is invalid");

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM storefront_domains WHERE store_id = ? AND domain = ? LIMIT 1`,
      [storeId, domain]
    );
    if (!existing) throw new Error("Domain not found");

    const instructions = await this.getDomainInstructions(userId, storeId, domain, publicHostInput, brandId);
    let txtVerified = false;
    let cnameVerified = false;
    let aResolved = false;
    let txtRecords: string[] = [];
    let cnameRecords: string[] = [];
    let aRecords: string[] = [];

    try {
      const txt = await resolveTxt(instructions.verification.host);
      txtRecords = txt.map((entry) => entry.join(""));
      txtVerified = txtRecords.includes(instructions.verification.value);
    } catch {}

    try {
      const cname = await resolveCname(domain);
      cnameRecords = cname.map((item) => sanitizeDomain(item));
      const cnameTarget = (instructions.connection as any).value
        ? normalizePublicHost(String((instructions.connection as any).value))
        : null;
      cnameVerified = !!cnameTarget && cnameRecords.includes(cnameTarget);
    } catch {}

    try {
      const a = await resolve4(domain);
      aRecords = Array.isArray(a) ? a : [];
      aResolved = aRecords.length > 0;
    } catch {}

    /* O A record bate com o IP do servidor? Útil pra UI dar feedback claro
     * "DNS apontando" vs "DNS pendente" sem confundir o usuário. */
    const expectedIp = (instructions as any).server_ip as string | undefined;
    const aPointsToServer = !!expectedIp && aRecords.includes(expectedIp);

    const verified = txtVerified;
    await update(
      `UPDATE storefront_domains SET verification_status = ?, updated_at = NOW() WHERE id = ?`,
      [verified ? "verified" : "failed", existing.id]
    );

    return {
      domain,
      verified,
      verification_status: verified ? "verified" : "failed",
      checks: {
        txt_verified: txtVerified,
        cname_verified: cnameVerified,
        a_resolved: aResolved,
        a_points_to_server: aPointsToServer,
        expected_ip: expectedIp || null,
        txt_records: txtRecords,
        cname_records: cnameRecords,
        a_records: aRecords,
      },
      instructions,
    };
  }

  async upsertProduct(userId: string, storeId: string, payload: Record<string, any>, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const productId = String(payload.product_id || "").trim();
    const currency = String(payload.currency || "BRL").toUpperCase().slice(0, 3);

    if (!productId) {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Product name is required");
      const slug = toSlug(payload.slug || name);
      if (!slug) throw new Error("Product slug is invalid");

      const used = await queryOne<{ id: string }>(
        `SELECT id FROM storefront_products WHERE store_id = ? AND slug = ? LIMIT 1`,
        [storeId, slug]
      );
      if (used) throw new Error("Product slug already in use for this store");

      const id = randomUUID();
      await query(
        `INSERT INTO storefront_products
         (id, store_id, slug, name, description, category, price, compare_at_price, currency, images_json, variants_json, metadata_json, is_active, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          storeId,
          slug,
          name,
          payload.description || null,
          payload.category || null,
          toNumber(payload.price, 0),
          payload.compare_at_price == null ? null : toNumber(payload.compare_at_price, 0),
          currency,
          JSON.stringify(payload.images || []),
          JSON.stringify(payload.variants || []),
          JSON.stringify(payload.metadata || {}),
          payload.is_active === false ? 0 : 1,
          Number(payload.position || 0),
        ]
      );
      return queryOne(`SELECT * FROM storefront_products WHERE id = ? LIMIT 1`, [id]);
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT p.id FROM storefront_products p INNER JOIN storefront_stores s ON s.id = p.store_id
       WHERE p.id = ? AND p.store_id = ? AND s.owner_user_id = ? LIMIT 1`,
      [productId, storeId, userId]
    );
    if (!existing) throw new Error("Product not found");

    const fields: string[] = [];
    const params: any[] = [];

    if (payload.name !== undefined) {
      fields.push("name = ?");
      params.push(String(payload.name || "").trim());
    }
    if (payload.slug !== undefined) {
      const slug = toSlug(payload.slug);
      if (!slug) throw new Error("Product slug is invalid");
      fields.push("slug = ?");
      params.push(slug);
    }
    if (payload.description !== undefined) {
      fields.push("description = ?");
      params.push(payload.description || null);
    }
    if (payload.category !== undefined) {
      fields.push("category = ?");
      params.push(payload.category || null);
    }
    if (payload.price !== undefined) {
      fields.push("price = ?");
      params.push(toNumber(payload.price, 0));
    }
    if (payload.compare_at_price !== undefined) {
      fields.push("compare_at_price = ?");
      params.push(payload.compare_at_price == null ? null : toNumber(payload.compare_at_price, 0));
    }
    if (payload.currency !== undefined) {
      fields.push("currency = ?");
      params.push(currency);
    }
    if (payload.images !== undefined) {
      fields.push("images_json = ?");
      params.push(JSON.stringify(payload.images || []));
    }
    if (payload.variants !== undefined) {
      fields.push("variants_json = ?");
      params.push(JSON.stringify(payload.variants || []));
    }
    if (payload.metadata !== undefined) {
      fields.push("metadata_json = ?");
      params.push(JSON.stringify(payload.metadata || {}));
    }
    if (payload.is_active !== undefined) {
      fields.push("is_active = ?");
      params.push(payload.is_active ? 1 : 0);
    }
    if (payload.position !== undefined) {
      fields.push("position = ?");
      params.push(Number(payload.position || 0));
    }

    if (fields.length > 0) {
      params.push(productId);
      await update(`UPDATE storefront_products SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`, params);
    }

    return queryOne(`SELECT * FROM storefront_products WHERE id = ? LIMIT 1`, [productId]);
  }

  async listProducts(userId: string, storeId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");
    await this.synchronizeStoreProductsFromCatalog(store);
    return query(`SELECT * FROM storefront_products WHERE store_id = ? ORDER BY position ASC, created_at DESC`, [storeId]);
  }
  async upsertPage(userId: string, storeId: string, payload: Record<string, any>, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const pageId = String(payload.page_id || "").trim();
    if (!pageId) {
      const title = String(payload.title || "").trim();
      if (!title) throw new Error("Page title is required");
      const slug = toSlug(payload.slug || title);
      if (!slug) throw new Error("Page slug is invalid");

      const used = await queryOne<{ id: string }>(
        `SELECT id FROM storefront_pages WHERE store_id = ? AND slug = ? LIMIT 1`,
        [storeId, slug]
      );
      if (used) throw new Error("Page slug already in use for this store");

      const id = randomUUID();
      await query(
        `INSERT INTO storefront_pages
         (id, store_id, slug, title, page_type, sections_json, seo_json, is_published, created_by_ai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          storeId,
          slug,
          title,
          payload.page_type || "custom",
          JSON.stringify(payload.sections || []),
          JSON.stringify(payload.seo || {}),
          payload.is_published === false ? 0 : 1,
          payload.created_by_ai ? 1 : 0,
        ]
      );
      return queryOne(`SELECT * FROM storefront_pages WHERE id = ? LIMIT 1`, [id]);
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT p.id FROM storefront_pages p INNER JOIN storefront_stores s ON s.id = p.store_id
       WHERE p.id = ? AND p.store_id = ? AND s.owner_user_id = ? LIMIT 1`,
      [pageId, storeId, userId]
    );
    if (!existing) throw new Error("Page not found");

    const fields: string[] = [];
    const params: any[] = [];

    if (payload.title !== undefined) {
      const title = String(payload.title || "").trim();
      if (!title) throw new Error("Page title is required");
      fields.push("title = ?");
      params.push(title);
    }
    if (payload.slug !== undefined) {
      const slug = toSlug(payload.slug);
      if (!slug) throw new Error("Page slug is invalid");
      fields.push("slug = ?");
      params.push(slug);
    }
    if (payload.page_type !== undefined) {
      fields.push("page_type = ?");
      params.push(payload.page_type);
    }
    if (payload.sections !== undefined) {
      fields.push("sections_json = ?");
      params.push(JSON.stringify(payload.sections || []));
    }
    if (payload.seo !== undefined) {
      fields.push("seo_json = ?");
      params.push(JSON.stringify(payload.seo || {}));
    }
    if (payload.is_published !== undefined) {
      fields.push("is_published = ?");
      params.push(payload.is_published ? 1 : 0);
    }
    if (payload.created_by_ai !== undefined) {
      fields.push("created_by_ai = ?");
      params.push(payload.created_by_ai ? 1 : 0);
    }

    if (fields.length > 0) {
      params.push(pageId);
      await update(`UPDATE storefront_pages SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`, params);
    }

    return queryOne(`SELECT * FROM storefront_pages WHERE id = ? LIMIT 1`, [pageId]);
  }

  async listPages(userId: string, storeId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");
    return query(`SELECT * FROM storefront_pages WHERE store_id = ? ORDER BY created_at ASC`, [storeId]);
  }

  private extractStoreSettings(store: { settings?: unknown; settings_json?: unknown }): Record<string, any> {
    const source = store.settings !== undefined ? store.settings : store.settings_json;
    return mergeStoreSettings(parseJson(source, {}));
  }

  private async getStoreByIdRaw(storeId: string): Promise<StoreRow | null> {
    return (
      (await queryOne<StoreRow>(
        `SELECT s.*, d.domain AS primary_domain
         FROM storefront_stores s
         LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
         WHERE s.id = ?
         LIMIT 1`,
        [storeId]
      )) || null
    );
  }

  private async getOrderRow(storeId: string, orderId: string): Promise<OrderRow | null> {
    return (
      (await queryOne<OrderRow>(`SELECT * FROM storefront_orders WHERE id = ? AND store_id = ? LIMIT 1`, [orderId, storeId])) ||
      null
    );
  }

  private async appendOrderTimeline(input: {
    orderId: string;
    storeId: string;
    eventType: string;
    statusBefore?: string | null;
    statusAfter?: string | null;
    actorType?: TimelineActorType;
    actorName?: string | null;
    payload?: Record<string, any>;
  }): Promise<void> {
    await query(
      `INSERT INTO storefront_order_timeline
       (id, order_id, store_id, event_type, status_before, status_after, actor_type, actor_name, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.orderId,
        input.storeId,
        input.eventType,
        input.statusBefore || null,
        input.statusAfter || null,
        input.actorType || "system",
        input.actorName || null,
        JSON.stringify(input.payload || {}),
      ]
    );
  }

  private buildDeliveryAddress(addressInput: unknown): string | null {
    const address = parseJson<Record<string, any>>(addressInput, {});
    const street = String(address.rua || address.street || address.logradouro || "").trim();
    const number = String(address.numero || address.number || "").trim();
    const district = String(address.bairro || address.district || "").trim();
    const city = String(address.cidade || address.city || "").trim();
    const state = String(address.estado || address.state || "").trim();
    const zip = String(address.cep || address.zip || "").trim();

    const line = [street, number].filter(Boolean).join(", ");
    const full = [line, district, city, state, zip].filter(Boolean).join(", ").trim();
    return full || null;
  }

  private buildGoogleMapsRoute(addressInput: unknown): string | null {
    const destination = this.buildDeliveryAddress(addressInput);
    if (!destination) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  private resolveConfirmBaseUrl(store: { primary_domain?: string | null }, settings: Record<string, any>): string {
    const candidate = String(
      settings?.logistics?.confirm_base_url ||
        process.env.STOREFRONT_CONFIRM_BASE_URL ||
        process.env.APP_BASE_URL ||
        process.env.PUBLIC_BASE_URL ||
        ""
    ).trim();

    if (candidate) {
      if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, "");
      return `https://${sanitizeDomain(candidate)}`;
    }

    const domain = sanitizeDomain(String(store.primary_domain || ""));
    if (domain) return `https://${domain}`;
    return "https://app.seusistema.com";
  }

  private buildConfirmUrl(store: { primary_domain?: string | null }, settings: Record<string, any>, token: string): string {
    const base = this.resolveConfirmBaseUrl(store, settings);
    return `${base}/api/storefront/public/delivery/confirm?token=${encodeURIComponent(token)}`;
  }

  private async generateDeliveryToken(orderNumber: string, tokenPrefixInput: string): Promise<string> {
    const prefix = String(tokenPrefixInput || "DEL")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 8) || "DEL";
    const orderRef = String(orderNumber || "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(-6) || "ORDER";

    for (let i = 0; i < 12; i += 1) {
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const token = `${prefix}-${orderRef}-${suffix}`;
      const exists =
        (await queryOne<{ id: string }>(`SELECT id FROM storefront_delivery_tokens WHERE token = ? LIMIT 1`, [token])) ||
        (await queryOne<{ id: string }>(`SELECT id FROM storefront_orders WHERE delivery_token = ? LIMIT 1`, [token]));
      if (!exists) return token;
    }

    throw new Error("Failed to generate unique delivery token");
  }

  private async createNotification(input: {
    orderId: string;
    storeId: string;
    channel: "admin" | "whatsapp" | "email";
    target?: string | null;
    payload: Record<string, any>;
  }): Promise<void> {
    await query(
      `INSERT INTO storefront_order_notifications
       (id, order_id, store_id, channel, target, status, payload_json)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [randomUUID(), input.orderId, input.storeId, input.channel, input.target || null, JSON.stringify(input.payload)]
    );
  }

  private async queueCustomerMessage(
    order: OrderRow,
    stage: string,
    message: string,
    payload?: Record<string, any>
  ): Promise<void> {
    const target = String(order.customer_phone || "").trim();
    if (!target) return;
    await this.createNotification({
      orderId: order.id,
      storeId: order.store_id,
      channel: "whatsapp",
      target,
      payload: {
        event: "customer.status_update",
        stage,
        message,
        order_id: order.id,
        order_number: order.order_number,
        ...payload,
      },
    });
  }

  private async queuePostSale(order: OrderRow): Promise<void> {
    const stages: Array<{ stage: "2h_checkin" | "24h_review"; delayHours: number }> = [
      { stage: "2h_checkin", delayHours: 2 },
      { stage: "24h_review", delayHours: 24 },
    ];

    for (const item of stages) {
      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM storefront_post_sale_queue WHERE order_id = ? AND stage = ? LIMIT 1`,
        [order.id, item.stage]
      );
      if (exists) continue;

      const runAt = new Date(Date.now() + item.delayHours * 60 * 60 * 1000);
      await query(
        `INSERT INTO storefront_post_sale_queue (id, order_id, store_id, stage, run_at, status, payload_json)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [
          randomUUID(),
          order.id,
          order.store_id,
          item.stage,
          toSqlDateTime(runAt),
          JSON.stringify({
            stage: item.stage,
            queued_at: new Date().toISOString(),
            order_number: order.order_number,
          }),
        ]
      );
    }
  }

  private async transitionOrderStatus(
    order: OrderRow,
    status: OrderStatus,
    input: {
      eventType: string;
      actorType?: TimelineActorType;
      actorName?: string | null;
      payload?: Record<string, any>;
      extraFields?: Record<string, any>;
    }
  ): Promise<OrderRow> {
    const extraFields = input.extraFields || {};
    const keys = Object.keys(extraFields);

    if (order.status === status && keys.length === 0) {
      return order;
    }

    const sets = ["status = ?", "updated_at = NOW()"];
    const params: any[] = [status];

    for (const key of keys) {
      sets.push(`${key} = ?`);
      params.push(extraFields[key]);
    }

    params.push(order.id, order.store_id);
    await update(`UPDATE storefront_orders SET ${sets.join(", ")} WHERE id = ? AND store_id = ?`, params);

    const updated = await this.getOrderRow(order.store_id, order.id);
    if (!updated) throw new Error("Order not found");

    await this.appendOrderTimeline({
      orderId: order.id,
      storeId: order.store_id,
      eventType: input.eventType,
      statusBefore: order.status,
      statusAfter: status,
      actorType: input.actorType || "system",
      actorName: input.actorName || null,
      payload: input.payload || {},
    });

    return updated;
  }

  async listOrders(
    userId: string,
    storeId: string,
    options?: { status?: string; limit?: number; offset?: number },
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const where: string[] = ["store_id = ?"];
    const params: any[] = [storeId];
    if (options?.status) {
      where.push("status = ?");
      params.push(options.status);
    }

    const safeLimit = Math.max(1, Math.min(Number.parseInt(String(options?.limit ?? 100), 10) || 100, 200));
    const safeOffset = Math.max(0, Number.parseInt(String(options?.offset ?? 0), 10) || 0);

    return query<OrderRow[]>(
      `SELECT * FROM storefront_orders WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
  }

  async listOrderTimeline(userId: string, storeId: string, orderId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) throw new Error("Order not found");

    return query(
      `SELECT * FROM storefront_order_timeline WHERE store_id = ? AND order_id = ? ORDER BY created_at ASC`,
      [storeId, orderId]
    );
  }

  async getOrderFlowAutomation(userId: string, storeId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const settings = this.extractStoreSettings({ settings_json: store.settings_json });
    return {
      order_flow: settings.automation?.order_flow || defaultStoreSettings().automation.order_flow,
      logistics: settings.logistics || defaultStoreSettings().logistics,
      notifications: settings.notifications || defaultStoreSettings().notifications,
    };
  }

  async updateOrderFlowAutomation(
    userId: string,
    storeId: string,
    payload: Partial<{
      active: boolean;
      logistics: Record<string, any>;
      notifications: Record<string, any>;
    }>,
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const currentSettings = this.extractStoreSettings({ settings_json: store.settings_json });
    const patch: Record<string, any> = {
      logistics: payload.logistics || {},
      notifications: payload.notifications || {},
      automation: {
        order_flow: {},
      },
    };

    if (payload.active !== undefined) {
      patch.automation.order_flow.active = !!payload.active;
    }

    const merged = mergeStoreSettingsWithPatch(currentSettings, patch);
    await update(`UPDATE storefront_stores SET settings_json = ?, updated_at = NOW() WHERE id = ? AND owner_user_id = ?`, [
      JSON.stringify(merged),
      storeId,
      userId,
    ]);

    return {
      order_flow: merged.automation?.order_flow || defaultStoreSettings().automation.order_flow,
      logistics: merged.logistics || defaultStoreSettings().logistics,
      notifications: merged.notifications || defaultStoreSettings().notifications,
    };
  }

  async dispatchPostSaleQueue(userId: string, storeId: string, limit = 30, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const rows = await query<
      Array<{
        id: string;
        order_id: string;
        store_id: string;
        stage: "2h_checkin" | "24h_review";
        payload_json: string | null;
        customer_name: string;
        customer_phone: string;
        order_number: string;
      }>
    >(
      `SELECT q.id, q.order_id, q.store_id, q.stage, q.payload_json, o.customer_name, o.customer_phone, o.order_number
       FROM storefront_post_sale_queue q
       INNER JOIN storefront_orders o ON o.id = q.order_id
       WHERE q.store_id = ? AND q.status = 'pending' AND q.run_at <= NOW()
       ORDER BY q.run_at ASC
       LIMIT ?`,
      [storeId, Math.max(1, Math.min(Number(limit || 30), 200))]
    );

    let sent = 0;
    let failed = 0;
    for (const item of rows) {
      try {
        const order = (await this.getOrderRow(item.store_id, item.order_id)) as OrderRow;
        if (!order) {
          failed += 1;
          await update(
            `UPDATE storefront_post_sale_queue SET status = 'failed', payload_json = ?, updated_at = NOW() WHERE id = ?`,
            [JSON.stringify({ error: "order_not_found" }), item.id]
          );
          continue;
        }

        const message =
          item.stage === "2h_checkin"
            ? "Seu pedido chegou tudo certo? Se precisar de algo, estou aqui."
            : "Pode avaliar sua experiencia? Sua opiniao ajuda muito nossa loja.";

        await this.queueCustomerMessage(order, item.stage, message, {
          post_sale_stage: item.stage,
          order_number: item.order_number,
        });

        await update(`UPDATE storefront_post_sale_queue SET status = 'sent', updated_at = NOW() WHERE id = ?`, [item.id]);
        sent += 1;
      } catch (error: any) {
        failed += 1;
        await update(
          `UPDATE storefront_post_sale_queue SET status = 'failed', payload_json = ?, updated_at = NOW() WHERE id = ?`,
          [JSON.stringify({ error: String(error?.message || "dispatch_failed") }), item.id]
        );
      }
    }

    return { total: rows.length, sent, failed };
  }

  async confirmOrderPayment(userId: string, storeId: string, orderId: string, actorName?: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) throw new Error("Order not found");

    const updated = await this.transitionOrderStatus(order, "aprovado", {
      eventType: "payment.confirmed",
      actorType: "admin",
      actorName: actorName || null,
      payload: { order_number: order.order_number },
    });

    await this.queueCustomerMessage(
      updated,
      "payment_confirmed",
      `Pagamento confirmado para o pedido #${updated.order_number}. Seu pedido esta sendo preparado.`
    );

    return updated;
  }

  async startOrderPreparation(userId: string, storeId: string, orderId: string, actorName?: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) throw new Error("Order not found");

    const updated = await this.transitionOrderStatus(order, "em_preparacao", {
      eventType: "order.preparation_started",
      actorType: "admin",
      actorName: actorName || null,
      payload: { order_number: order.order_number },
    });

    await this.queueCustomerMessage(
      updated,
      "preparation_started",
      `Estamos preparando seu pedido #${updated.order_number}.`
    );

    return updated;
  }

  async sendOrderOutForDelivery(
    userId: string,
    storeId: string,
    orderId: string,
    payload?: {
      courier_name?: string;
      courier_phone?: string;
      eta_minutes?: number;
    },
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) throw new Error("Order not found");

    const settings = this.extractStoreSettings({ settings_json: store.settings_json });
    const etaMinutes = Math.max(5, Math.min(Number(payload?.eta_minutes || settings.logistics?.default_eta_minutes || 40), 240));
    const courierName = String(payload?.courier_name || order.courier_name || "").trim() || null;
    const courierPhone = String(payload?.courier_phone || order.courier_phone || "").trim() || null;

    const token = await this.generateDeliveryToken(order.order_number, String(settings.logistics?.token_prefix || "DEL"));
    const confirmUrl = this.buildConfirmUrl(store, settings, token);
    const qrDataUrl = await QRCode.toDataURL(confirmUrl, { width: 320, margin: 1 });
    const routeUrl = this.buildGoogleMapsRoute(order.customer_address_json);

    await update(
      `UPDATE storefront_delivery_tokens
       SET used_at = NOW(), used_via = 'admin', used_by = 'system:rotated', updated_at = NOW()
       WHERE order_id = ? AND used_at IS NULL`,
      [order.id]
    );

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await query(
      `INSERT INTO storefront_delivery_tokens
       (id, order_id, store_id, token, expires_at, used_at, used_via, used_by)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      [randomUUID(), order.id, order.store_id, token, toSqlDateTime(expiresAt)]
    );

    const updated = await this.transitionOrderStatus(order, "saiu_para_entrega", {
      eventType: "delivery.out_for_delivery",
      actorType: "admin",
      payload: {
        order_number: order.order_number,
        courier_name: courierName,
        courier_phone: courierPhone,
        eta_minutes: etaMinutes,
      },
      extraFields: {
        delivery_token: token,
        delivery_status: "aguardando_confirmacao",
        delivery_qr_data_url: qrDataUrl,
        courier_name: courierName,
        courier_phone: courierPhone,
        courier_route_url: routeUrl,
      },
    });

    await this.queueCustomerMessage(
      updated,
      "out_for_delivery",
      `Seu pedido #${updated.order_number} saiu para entrega. Previsao: ${etaMinutes} minutos.`,
      {
        delivery_token: token,
        confirm_url: confirmUrl,
        courier_name: courierName,
        courier_phone: courierPhone,
        courier_route_url: routeUrl,
        delivery_qr_data_url: qrDataUrl,
      }
    );

    return {
      order: updated,
      delivery: {
        token,
        confirm_url: confirmUrl,
        qr_data_url: qrDataUrl,
        route_url: routeUrl,
        eta_minutes: etaMinutes,
        courier_name: courierName,
        courier_phone: courierPhone,
      },
    };
  }

  private async completeDelivery(order: OrderRow, input: { via: DeliveryConfirmVia; confirmedBy?: string | null }) {
    if (order.status === "entregue") {
      return order;
    }

    const updated = await this.transitionOrderStatus(order, "entregue", {
      eventType: "delivery.confirmed",
      actorType: input.via === "admin" ? "admin" : "courier",
      actorName: input.confirmedBy || null,
      payload: { via: input.via },
      extraFields: {
        delivery_status: "confirmado",
        delivered_at: toSqlDateTime(new Date()),
        delivery_confirmed_by: input.confirmedBy || "cliente",
        delivery_confirmed_via: input.via,
      },
    });

    await this.queueCustomerMessage(
      updated,
      "delivery_confirmed",
      `Entrega confirmada do pedido #${updated.order_number}. Obrigado pela compra!`
    );
    await this.queuePostSale(updated);
    return updated;
  }

  async confirmOrderDeliveryByAdmin(
    userId: string,
    storeId: string,
    orderId: string,
    actorName?: string,
    brandId?: string | null
  ) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) throw new Error("Order not found");

    if (order.delivery_token) {
      await update(
        `UPDATE storefront_delivery_tokens
         SET used_at = IFNULL(used_at, NOW()), used_via = IFNULL(used_via, 'admin'), used_by = IFNULL(used_by, ?), updated_at = NOW()
         WHERE token = ?`,
        [actorName || "admin", order.delivery_token]
      );
    }

    return this.completeDelivery(order, { via: "admin", confirmedBy: actorName || "admin" });
  }

  async confirmOrderDeliveryByToken(tokenInput: string, via: DeliveryConfirmVia = "token", actorName?: string) {
    await this.ensureSchema();
    const token = String(tokenInput || "").trim().toUpperCase();
    if (!token) throw new Error("delivery token is required");

    const tokenRow =
      (await queryOne<{
        id: string;
        order_id: string;
        store_id: string;
        token: string;
        expires_at: string | null;
        used_at: string | null;
      }>(`SELECT id, order_id, store_id, token, expires_at, used_at FROM storefront_delivery_tokens WHERE token = ? LIMIT 1`, [token])) ||
      null;

    let order: OrderRow | null = null;
    if (tokenRow) {
      order = await this.getOrderRow(tokenRow.store_id, tokenRow.order_id);
    }
    if (!order) {
      order =
        (await queryOne<OrderRow>(`SELECT * FROM storefront_orders WHERE delivery_token = ? LIMIT 1`, [token])) || null;
    }
    if (!order) throw new Error("Delivery token not found");

    if (tokenRow?.expires_at && !tokenRow.used_at) {
      const expires = new Date(tokenRow.expires_at);
      if (Number.isFinite(expires.getTime()) && expires.getTime() < Date.now()) {
        await update(`UPDATE storefront_orders SET delivery_status = 'expirado', updated_at = NOW() WHERE id = ?`, [order.id]);
        await update(`UPDATE storefront_delivery_tokens SET used_via = 'admin', used_by = 'expired', updated_at = NOW() WHERE id = ?`, [
          tokenRow.id,
        ]);
        throw new Error("Delivery token expired");
      }
    }

    if (tokenRow && tokenRow.used_at) {
      const latest = await this.getOrderRow(order.store_id, order.id);
      if (!latest) throw new Error("Order not found");
      return { order: latest, already_confirmed: true };
    }

    if (tokenRow) {
      await update(
        `UPDATE storefront_delivery_tokens SET used_at = NOW(), used_via = ?, used_by = ?, updated_at = NOW() WHERE id = ?`,
        [via, actorName || "token_validation", tokenRow.id]
      );
    } else {
      await query(
        `INSERT INTO storefront_delivery_tokens
         (id, order_id, store_id, token, expires_at, used_at, used_via, used_by)
         VALUES (?, ?, ?, ?, NULL, NOW(), ?, ?)`,
        [randomUUID(), order.id, order.store_id, token, via, actorName || "token_validation"]
      );
    }

    const completed = await this.completeDelivery(order, {
      via: via === "admin" ? "admin" : via === "qr" ? "qr" : "token",
      confirmedBy: actorName || "cliente",
    });

    return { order: completed, already_confirmed: false };
  }

  async updateOrderStatus(userId: string, storeId: string, orderId: string, status: OrderStatus, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");

    const order = await this.getOrderRow(storeId, orderId);
    if (!order) return null;

    if (status === "aprovado") return this.confirmOrderPayment(userId, storeId, orderId, undefined, brandId);
    if (status === "em_preparacao") return this.startOrderPreparation(userId, storeId, orderId, undefined, brandId);
    if (status === "saiu_para_entrega") {
      const result = await this.sendOrderOutForDelivery(userId, storeId, orderId, undefined, brandId);
      return result.order;
    }
    if (status === "entregue") return this.confirmOrderDeliveryByAdmin(userId, storeId, orderId, undefined, brandId);

    const updated = await this.transitionOrderStatus(order, status, {
      eventType: "order.status_updated",
      actorType: "admin",
      payload: { status },
    });

    return updated;
  }

  async listOrderNotifications(userId: string, storeId: string, orderId: string, brandId?: string | null) {
    await this.ensureSchema();
    const store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) throw new Error("Store not found");
    return query(
      `SELECT * FROM storefront_order_notifications WHERE store_id = ? AND order_id = ? ORDER BY created_at ASC`,
      [storeId, orderId]
    );
  }

  async resolvePublicStore(input: { slug?: string; host?: string | null }) {
    await this.ensureSchema();
    const host = String(input.host || "").trim();
    let store: StoreRow | null = null;

    if (host) {
      const domains = domainCandidates(host);
      if (domains.length > 0) {
        const placeholders = domains.map(() => "?").join(",");
        store =
          (await queryOne<StoreRow>(
            `SELECT s.*, d.domain AS primary_domain
             FROM storefront_domains d
             INNER JOIN storefront_stores s ON s.id = d.store_id
             WHERE d.domain IN (${placeholders})
               AND (
                 s.status = 'active'
                 OR EXISTS (
                   SELECT 1
                   FROM storefront_pages hp
                   WHERE hp.store_id = s.id
                     AND hp.is_published = TRUE
                     AND (hp.page_type = 'home' OR hp.slug = 'home')
                 )
               )
             ORDER BY d.is_primary DESC
             LIMIT 1`,
            domains
          )) || null;
      }
    }

    if (!store && input.slug) {
      const slug = toSlug(input.slug);
      if (slug) {
        store =
          (await queryOne<StoreRow>(
            `SELECT s.*, d.domain AS primary_domain
             FROM storefront_stores s
             LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
             WHERE s.slug = ?
               AND (
                 s.status = 'active'
                 OR EXISTS (
                   SELECT 1
                   FROM storefront_pages hp
                   WHERE hp.store_id = s.id
                     AND hp.is_published = TRUE
                     AND (hp.page_type = 'home' OR hp.slug = 'home')
                 )
               )
             LIMIT 1`,
            [slug]
          )) || null;

        if (!store) {
          store =
            (await queryOne<StoreRow>(
              `SELECT s.*, d.domain AS primary_domain
               FROM storefront_pages p
               INNER JOIN storefront_stores s ON s.id = p.store_id
               LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
               WHERE p.slug = ?
                 AND p.is_published = TRUE
                 AND (p.page_type = 'home' OR p.slug = 'home')
                 AND (
                   s.status = 'active'
                   OR EXISTS (
                     SELECT 1
                     FROM storefront_pages hp
                     WHERE hp.store_id = s.id
                       AND hp.is_published = TRUE
                       AND (hp.page_type = 'home' OR hp.slug = 'home')
                   )
                 )
               LIMIT 1`,
              [slug]
            )) || null;
        }
      }
    }

    if (!store) return null;

    /*
     * Public catalog must never wait on product sync.
     * Sync is heavy (full catalog + per-product writes). Run it in the background
     * at most once every 5 minutes; serve whatever is already in storefront_products.
     * Admin mutations already trigger explicit sync/invalidation.
     */
    const syncKey = `sync_${store.id}`;
    const lastSync = StorefrontService._syncThrottle.get(syncKey) || 0;
    if (Date.now() - lastSync > 300_000) {
      StorefrontService._syncThrottle.set(syncKey, Date.now());
      const storeSnapshot = { ...store };
      void (async () => {
        try {
          await this.synchronizeStoreBrandIdentity(storeSnapshot);
          await this.synchronizeStoreProductsFromCatalog(storeSnapshot);
        } catch (err: any) {
          logger.warn(
            `[storefront] background public sync failed for ${storeSnapshot.id}: ${err?.message || err}`
          );
          /* Allow retry sooner after failure */
          StorefrontService._syncThrottle.set(syncKey, Date.now() - 240_000);
        }
      })();
    }

    const [template, products, pages, domains] = await Promise.all([
      queryOne<TemplateRow>(`SELECT * FROM storefront_templates WHERE template_id = ? LIMIT 1`, [store.template_id]),
      query(`SELECT * FROM storefront_products WHERE store_id = ? AND is_active = TRUE ORDER BY position ASC, created_at DESC`, [store.id]),
      query(`SELECT * FROM storefront_pages WHERE store_id = ? AND is_published = TRUE ORDER BY created_at ASC`, [store.id]),
      query(`SELECT domain FROM storefront_domains WHERE store_id = ? ORDER BY is_primary DESC`, [store.id]),
    ]);

    return {
      store: this.mapStore(store),
      template: template ? this.mapTemplate(template) : null,
      products,
      pages,
      domains: (domains as Array<{ domain: string }>).map((row) => row.domain),
    };
  }

  async getPublicProduct(storeSlug: string, productSlug: string) {
    await this.ensureSchema();
    const slug = toSlug(storeSlug);
    const product = toSlug(productSlug);
    if (!slug || !product) return null;

    let store =
      (await queryOne<StoreRow>(
        `SELECT s.*, d.domain AS primary_domain
         FROM storefront_stores s
         LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
         WHERE s.slug = ?
           AND (
             s.status = 'active'
             OR EXISTS (
               SELECT 1
               FROM storefront_pages hp
               WHERE hp.store_id = s.id
                 AND hp.is_published = TRUE
                 AND (hp.page_type = 'home' OR hp.slug = 'home')
             )
           )
         LIMIT 1`,
        [slug]
      )) || null;
    if (!store) return null;

    await this.synchronizeStoreBrandIdentity(store);
    await this.synchronizeStoreProductsFromCatalog(store);

    const refreshedStore = await queryOne<StoreRow>(
      `SELECT s.*, d.domain AS primary_domain
       FROM storefront_stores s
       LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
       WHERE s.id = ?
       LIMIT 1`,
      [store.id]
    );
    if (refreshedStore) {
      store = refreshedStore;
    }

    return queryOne(
      `SELECT p.*
       FROM storefront_products p
       WHERE p.store_id = ?
         AND p.slug = ?
         AND p.is_active = TRUE
       LIMIT 1`,
      [store.id, product]
    );
  }

  async getPublicPage(storeSlug: string, pageSlug: string) {
    await this.ensureSchema();
    const slug = toSlug(storeSlug);
    const page = toSlug(pageSlug);
    if (!slug || !page) return null;

    let store =
      (await queryOne<StoreRow>(
        `SELECT s.*, d.domain AS primary_domain
         FROM storefront_stores s
         LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
         WHERE s.slug = ?
           AND (
             s.status = 'active'
             OR EXISTS (
               SELECT 1
               FROM storefront_pages hp
               WHERE hp.store_id = s.id
                 AND hp.is_published = TRUE
                 AND (hp.page_type = 'home' OR hp.slug = 'home')
             )
           )
         LIMIT 1`,
        [slug]
      )) || null;
    if (!store) return null;

    await this.synchronizeStoreBrandIdentity(store);
    await this.synchronizeStoreProductsFromCatalog(store);

    const refreshedStore = await queryOne<StoreRow>(
      `SELECT s.*, d.domain AS primary_domain
       FROM storefront_stores s
       LEFT JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
       WHERE s.id = ?
       LIMIT 1`,
      [store.id]
    );
    if (refreshedStore) {
      store = refreshedStore;
    }

    return queryOne(
      `SELECT p.*
       FROM storefront_pages p
       WHERE p.store_id = ?
         AND p.slug = ?
         AND p.is_published = TRUE
       LIMIT 1`,
      [store.id, page]
    );
  }

  /** Find existing customer by phone (preferred) or email, or create a new record */
  private async findOrCreateCustomer(
    storeId: string,
    data: { name: string; phone: string; email?: string | null; address?: Record<string, any> }
  ): Promise<string> {
    const phone = String(data.phone || "").replace(/\D/g, "");
    const email = String(data.email || "").trim().toLowerCase() || null;

    // Try match by phone first (most reliable for this domain)
    let existing: any = null;
    if (phone) {
      existing = await queryOne<any>(
        `SELECT id FROM storefront_customers WHERE store_id = ? AND phone = ? LIMIT 1`,
        [storeId, phone]
      );
    }
    if (!existing && email) {
      existing = await queryOne<any>(
        `SELECT id FROM storefront_customers WHERE store_id = ? AND email = ? LIMIT 1`,
        [storeId, email]
      );
    }

    if (existing) {
      // Update name / address on returning customer
      await update(
        `UPDATE storefront_customers SET name = ?, email = COALESCE(?, email), address_json = ?, updated_at = NOW() WHERE id = ?`,
        [data.name, email, JSON.stringify(data.address || {}), existing.id]
      );
      return String(existing.id);
    }

    const id = randomUUID();
    await query(
      `INSERT INTO storefront_customers (id, store_id, name, email, phone, address_json) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, storeId, data.name, email, phone, JSON.stringify(data.address || {})]
    );
    return id;
  }

  async createPublicOrder(
    storeSlug: string,
    payload: {
      items: Array<{ product_id: string; quantity: number }>;
      customer: { name: string; phone: string; email?: string; address?: Record<string, any> };
      payment_method?: string;
      notes?: string;
    }
  ) {
    await this.ensureSchema();
    const storeBundle = await this.resolvePublicStore({ slug: storeSlug });
    if (!storeBundle) throw new Error("Store not found");

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) throw new Error("Order requires at least one product");

    const productIds = Array.from(new Set(items.map((i) => String(i.product_id || "").trim()).filter(Boolean)));
    if (productIds.length === 0) throw new Error("Order products are invalid");

    const placeholders = productIds.map(() => "?").join(",");
    const products = (await query<any[]>(
      `SELECT * FROM storefront_products WHERE store_id = ? AND is_active = TRUE AND id IN (${placeholders})`,
      [storeBundle.store.id, ...productIds]
    )) as any[];
    const map = new Map(products.map((p) => [String(p.id), p]));

    const normalizedItems = items.map((item) => {
      const productId = String(item.product_id || "").trim();
      const quantity = Math.max(1, Math.min(99, Number(item.quantity || 1)));
      const product = map.get(productId);
      if (!product) throw new Error(`Product not available: ${productId}`);

      const price = toNumber(product.price, 0);
      return {
        product_id: product.id,
        product_slug: product.slug,
        name: product.name,
        unit_price: price,
        quantity,
        line_total: Number((price * quantity).toFixed(2)),
      };
    });

    const subtotal = Number(normalizedItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0).toFixed(2));
    const total = subtotal;

    const customerName = String(payload.customer?.name || "").trim();
    const customerPhone = String(payload.customer?.phone || "").trim();
    if (!customerName || !customerPhone) throw new Error("Customer name and phone are required");

    const orderId = randomUUID();
    const orderNumber = this.generateOrderNumber();
    const customerEmail = String(payload.customer?.email || "").trim() || null;
    const paymentMethod = String(payload.payment_method || "").trim().toLowerCase() || null;
    const inventoryUserId = String(storeBundle.store.owner_user_id || "").trim();
    const inventoryBrandId = normalizeBrandId(storeBundle.store.brand_id || "") || null;

    for (const item of normalizedItems) {
      const stock = await this.inventoryService.getProductStock(inventoryUserId, inventoryBrandId, String(item.product_id));
      const available = Number(stock?.stock_available || 0);
      if (available < Number(item.quantity || 0)) {
        throw new Error(
          `Estoque insuficiente para ${item.name}. Disponível: ${available}, Solicitado: ${Number(item.quantity || 0)}`
        );
      }
    }

    const customerId = await this.findOrCreateCustomer(storeBundle.store.id, {
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
      address: payload.customer?.address,
    });

    const reservedItems: Array<{ product_id: string; quantity: number }> = [];
    try {
      for (const item of normalizedItems) {
        await this.inventoryService.reserveStock(
          inventoryUserId,
          inventoryBrandId,
          String(item.product_id),
          Number(item.quantity || 0),
          orderId
        );
        reservedItems.push({ product_id: String(item.product_id), quantity: Number(item.quantity || 0) });
      }

      await query(
        `INSERT INTO storefront_orders
         (id, order_number, store_id, customer_id, status, currency, subtotal, shipping, discount, total, payment_method, customer_name, customer_phone, customer_email, customer_address_json, items_json, notes, source)
         VALUES (?, ?, ?, ?, 'novo', 'BRL', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'site')`,
        [
          orderId,
          orderNumber,
          storeBundle.store.id,
          customerId,
          subtotal,
          total,
          paymentMethod,
          customerName,
          customerPhone,
          customerEmail,
          JSON.stringify(payload.customer?.address || {}),
          JSON.stringify(normalizedItems),
          String(payload.notes || "").trim() || null,
        ]
      );
    } catch (error) {
      for (const item of reservedItems) {
        await this.inventoryService
          .releaseStock(inventoryUserId, inventoryBrandId, item.product_id, item.quantity, orderId)
          .catch(() => undefined);
      }
      throw error;
    }

    await this.appendOrderTimeline({
      orderId,
      storeId: storeBundle.store.id,
      eventType: "order.created",
      statusBefore: null,
      statusAfter: "novo",
      actorType: "customer",
      actorName: customerName,
      payload: {
        order_number: orderNumber,
        payment_method: paymentMethod,
        total,
        items: normalizedItems,
      },
    });

    const notifications = await this.createOrderNotifications(storeBundle.store, {
      order_id: orderId,
      order_number: orderNumber,
      customer_name: customerName,
      customer_phone: customerPhone,
      payment_method: paymentMethod,
      total,
      items: normalizedItems,
    });

    let order = await queryOne<OrderRow>(`SELECT * FROM storefront_orders WHERE id = ? LIMIT 1`, [orderId]);
    if (!order) throw new Error("Failed to persist order");

    const settings = this.extractStoreSettings({ settings: storeBundle.store.settings });
    const automationActive = !!settings.automation?.order_flow?.active;
    if (automationActive) {
      order = await this.transitionOrderStatus(order, "confirmando_pagamento", {
        eventType: "order.processing_started",
        actorType: "system",
        payload: { reason: "order_flow_active" },
      });

      await this.queueCustomerMessage(
        order,
        "order_received",
        `Pedido recebido com sucesso. Pedido #${order.order_number} no total de ${formatMoneyBr(
          toNumber(order.total, 0)
        )}. Estamos processando seu pedido.`
      );
    }

    return {
      order,
      notifications,
      store: {
        id: storeBundle.store.id,
        slug: storeBundle.store.slug,
        name: storeBundle.store.name,
      },
    };
  }

  async exportStoreAdminBundle(userId: string, storeId: string, brandId?: string | null) {
    await this.ensureSchema();
    let store = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (!store) return null;

    await this.synchronizeStoreBrandIdentity(store);
    await this.synchronizeStoreProductsFromCatalog(store);

    const refreshedStore = await this.getOwnedStoreRow(userId, storeId, brandId);
    if (refreshedStore) {
      store = refreshedStore;
    }

    const [template, domains, products, pages] = await Promise.all([
      queryOne<TemplateRow>(`SELECT * FROM storefront_templates WHERE template_id = ? LIMIT 1`, [store.template_id]),
      query(`SELECT * FROM storefront_domains WHERE store_id = ? ORDER BY is_primary DESC`, [store.id]),
      query(`SELECT * FROM storefront_products WHERE store_id = ? ORDER BY position ASC, created_at DESC`, [store.id]),
      query(`SELECT * FROM storefront_pages WHERE store_id = ? ORDER BY created_at ASC`, [store.id]),
    ]);

    return {
      store: this.mapStore(store),
      template: template ? this.mapTemplate(template) : null,
      domains,
      products,
      pages,
    };
  }

  async markDomainVerified(storeId: string, domainInput: string): Promise<boolean> {
    await this.ensureSchema();
    const domain = sanitizeDomain(domainInput);
    if (!domain) return false;

    const affected = await update(
      `UPDATE storefront_domains SET verification_status = 'verified', updated_at = NOW() WHERE store_id = ? AND domain = ?`,
      [storeId, domain]
    );

    return affected > 0;
  }

  async transactionalHealthCheck(): Promise<boolean> {
    await this.ensureSchema();
    const pool = getPool();
    const [rows] = await pool.query<any[]>("SELECT 1 AS ok");
    return Array.isArray(rows) && rows.length > 0;
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const y = now.getUTCFullYear().toString().slice(-2);
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `SF${y}${m}${d}${Math.floor(Math.random() * 9000) + 1000}`;
  }

  private async createOrderNotifications(store: any, payload: Record<string, any>) {
    const settings = this.extractStoreSettings(store);
    const notifications = settings.notifications || {};
    const queue: Array<{ channel: "admin" | "whatsapp" | "email"; target: string | null }> = [];

    if (notifications.admin !== false) queue.push({ channel: "admin", target: "panel" });

    const whatsapp = String(notifications.whatsapp || "").trim();
    if (whatsapp) queue.push({ channel: "whatsapp", target: whatsapp });

    const email = String(notifications.email || "").trim();
    if (email) queue.push({ channel: "email", target: email });

    for (const item of queue) {
      await this.createNotification({
        orderId: payload.order_id,
        storeId: store.id,
        channel: item.channel,
        target: item.target,
        payload,
      });
    }

    const webhookUrl = String(notifications.webhook_url || "").trim();
    if (webhookUrl) {
      logger.info(
        {
          module: "storefront",
          event: "order.created",
          store_id: store.id,
          order_id: payload.order_id,
          webhook_url: webhookUrl,
        },
        "Storefront webhook pending dispatch"
      );
    }

    return query(`SELECT * FROM storefront_order_notifications WHERE order_id = ? ORDER BY created_at ASC`, [payload.order_id]);
  }

  private async ensureDefaultPagesForStore(storeId: string): Promise<void> {
    const defaults = [
      {
        slug: "home",
        title: "Home",
        page_type: "home",
        sections: [
          {
            type: "hero",
            content: {
              headline: "Sua marca com loja online pronta para vender",
              subheadline: "Template dinamico, pedidos no site e estrutura preparada para escalar.",
              cta: "Comprar agora",
            },
          },
          { type: "products_grid", content: { title: "Produtos em destaque" } },
          { type: "cta", content: { title: "Fale conosco para ofertas personalizadas", action: "Pedir pelo site" } },
        ],
      },
      {
        slug: "sobre",
        title: "Sobre",
        page_type: "about",
        sections: [
          { type: "story", content: { title: "Nossa historia", body: "Conte aqui a historia da sua marca, missao e valores." } },
          { type: "values", content: { items: ["Qualidade", "Atendimento", "Entrega"] } },
        ],
      },
      {
        slug: "produtos",
        title: "Produtos",
        page_type: "products",
        sections: [{ type: "catalog", content: { title: "Catalogo", filters: ["categoria", "preco", "novidades"] } }],
      },
    ];

    for (const page of defaults) {
      await query(
        `INSERT IGNORE INTO storefront_pages
         (id, store_id, slug, title, page_type, sections_json, seo_json, is_published, created_by_ai)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, FALSE)`,
        [randomUUID(), storeId, page.slug, page.title, page.page_type, JSON.stringify(page.sections), JSON.stringify({ title: page.title })]
      );
    }
  }
}

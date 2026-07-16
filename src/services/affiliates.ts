import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { couponsService } from "./coupons";
import {
  calculateCommissionAmount,
  couponDiscountPercent,
  normalizeCommissionMode,
  resolveCommissionConfig,
  type CommissionMode,
} from "./affiliateCommission";

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export type AffiliateProgramConfig = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  is_enabled: boolean;
  default_commission_pct: number;
  default_commission_mode: CommissionMode | string;
  default_commission_value: number;
  commission_rules: string | null;
  cookie_days: number;
  min_withdrawal: number;
  payment_days: number;
  terms_html: string | null;
  training_html: string | null;
  content_version: number;
  app_subdomain: string | null;
  share_title: string | null;
  share_description: string | null;
  share_image_url: string | null;
  promotion_tone: string | null;
  accept_new_affiliates: boolean;
  auto_approve_affiliates: boolean;
  created_at: string;
  updated_at: string;
};

export type AffiliateProfile = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  credential_id: string;
  affiliate_user_id: string;
  code: string;
  coupon_code: string;
  display_name: string;
  phone: string | null;
  document: string | null;
  pix_key: string | null;
  region: string | null;
  social_instagram: string | null;
  social_whatsapp: string | null;
  status: string;
  commission_pct: number | null;
  commission_mode: CommissionMode | string | null;
  commission_value: number | null;
  total_clicks: number;
  total_sales: number;
  total_commission: number;
  rank_position: number | null;
  created_at: string;
  updated_at: string;
};

async function initializeAffiliateSchema(): Promise<void> {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_app_credentials (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      email VARCHAR(190) NOT NULL,
      credential_type VARCHAR(40) NOT NULL DEFAULT 'afiliado',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_affiliate_access_brand_email (brand_id, email),
      UNIQUE KEY uq_affiliate_access_brand_user (brand_id, affiliate_user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_config (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      default_commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
      cookie_days INT NOT NULL DEFAULT 30,
      min_withdrawal DECIMAL(12,2) NOT NULL DEFAULT 50.00,
      payment_days INT NOT NULL DEFAULT 15,
      terms_html TEXT,
      training_html TEXT,
      app_subdomain VARCHAR(120),
      accept_new_affiliates BOOLEAN NOT NULL DEFAULT TRUE,
      auto_approve_affiliates BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_affiliate_program_brand (brand_id)
    )
  `);

  await query(
    `ALTER TABLE affiliate_program_config ADD COLUMN accept_new_affiliates BOOLEAN NOT NULL DEFAULT TRUE`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_program_config ADD COLUMN auto_approve_affiliates BOOLEAN NOT NULL DEFAULT TRUE`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_program_config ADD COLUMN default_commission_mode VARCHAR(30) NOT NULL DEFAULT 'percentage'`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_program_config ADD COLUMN default_commission_value DECIMAL(12,4) NOT NULL DEFAULT 10.0000`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_program_config ADD COLUMN commission_rules TEXT NULL`
  ).catch(() => undefined);
  await query(
    `UPDATE affiliate_program_config
     SET default_commission_value = default_commission_pct
     WHERE default_commission_value IS NULL OR default_commission_value = 0`
  ).catch(() => undefined);

  await query(
    `ALTER TABLE affiliates ADD COLUMN commission_mode VARCHAR(30) NULL`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliates ADD COLUMN commission_value DECIMAL(12,4) NULL`
  ).catch(() => undefined);
  await query(`
    CREATE TABLE IF NOT EXISTS affiliates (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      credential_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      code VARCHAR(60) NOT NULL,
      coupon_code VARCHAR(40) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      phone VARCHAR(30),
      document VARCHAR(30),
      pix_key VARCHAR(120),
      region VARCHAR(120),
      social_instagram VARCHAR(120),
      social_whatsapp VARCHAR(30),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      commission_pct DECIMAL(5,2),
      total_clicks INT NOT NULL DEFAULT 0,
      total_sales INT NOT NULL DEFAULT 0,
      total_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      rank_position INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_affiliate_brand_code (brand_id, code),
      UNIQUE KEY uq_affiliate_brand_coupon (brand_id, coupon_code),
      UNIQUE KEY uq_affiliate_credential (credential_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      ip_hash VARCHAR(64),
      user_agent VARCHAR(255),
      referrer VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(
    `ALTER TABLE affiliate_clicks ADD COLUMN link_type VARCHAR(20) NOT NULL DEFAULT 'catalog'`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_clicks ADD COLUMN product_id VARCHAR(60) NULL`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_clicks ADD COLUMN product_slug VARCHAR(160) NULL`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_clicks ADD COLUMN landing_path VARCHAR(500) NULL`
  ).catch(() => undefined);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_sales (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      order_id VARCHAR(36),
      customer_name VARCHAR(120),
      order_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      order_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      commission_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(
    `ALTER TABLE affiliate_sales ADD COLUMN commission_mode VARCHAR(30) NULL`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_sales ADD COLUMN commission_basis JSON NULL`
  ).catch(() => undefined);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_payouts (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      pix_key VARCHAR(120),
      status VARCHAR(30) NOT NULL DEFAULT 'requested',
      notes TEXT,
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_leads (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      customer_name VARCHAR(120) NOT NULL,
      phone VARCHAR(30),
      email VARCHAR(160),
      source_type VARCHAR(30) NOT NULL DEFAULT 'capture',
      cta_type VARCHAR(30),
      product_name VARCHAR(160),
      product_id VARCHAR(60),
      order_id VARCHAR(36),
      message TEXT,
      affiliate_status VARCHAR(30) NOT NULL DEFAULT 'new',
      affiliate_notes TEXT,
      internal_ref_id VARCHAR(64),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_aff_lead_affiliate (affiliate_id, created_at DESC),
      INDEX idx_aff_lead_phone (affiliate_id, phone)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_materials (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      title VARCHAR(160) NOT NULL,
      type VARCHAR(30) NOT NULL DEFAULT 'image',
      media_url VARCHAR(500),
      copy_text TEXT,
      region VARCHAR(120),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE affiliate_materials ADD COLUMN gallery_item_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_materials ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'promo'`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_materials ADD COLUMN channel VARCHAR(30) NOT NULL DEFAULT 'geral'`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_materials ADD COLUMN product_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_materials ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => undefined);

  await query(`ALTER TABLE affiliate_program_config ADD COLUMN content_version INT NOT NULL DEFAULT 1`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_config ADD COLUMN share_title VARCHAR(160) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_config ADD COLUMN share_description VARCHAR(320) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_config ADD COLUMN share_image_url VARCHAR(500) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_config ADD COLUMN promotion_tone TEXT NULL`).catch(() => undefined);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_learning_modules (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      slug VARCHAR(60) NOT NULL,
      title VARCHAR(160) NOT NULL,
      icon VARCHAR(40) NOT NULL DEFAULT 'book',
      module_type VARCHAR(40) NOT NULL DEFAULT 'programa',
      content_html TEXT,
      media_url VARCHAR(500),
      gallery_item_id VARCHAR(36),
      sort_order INT NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      is_required BOOLEAN NOT NULL DEFAULT FALSE,
      region VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_learning_brand_slug (brand_id, slug)
    )
  `);

  schemaReady = true;
}

async function ensureAffiliateSchema(): Promise<void> {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = initializeAffiliateSchema().finally(() => {
      if (!schemaReady) schemaPromise = null;
    });
  }
  await schemaPromise;
}

const DEFAULT_LEARNING_MODULES = [
  { slug: "programa", title: "O que é o programa", icon: "handshake", module_type: "programa", sort_order: 1, content_html: "<p>Conheça o programa de afiliados da marca e como você pode ganhar comissão indicando clientes.</p>" },
  { slug: "como-funciona", title: "Como funciona", icon: "zap", module_type: "como_funciona", sort_order: 2, content_html: "<p>Compartilhe seu link ou cupom exclusivo. Quando o cliente compra pelo seu link, a venda é atribuída a você automaticamente.</p>" },
  { slug: "produtos", title: "Sobre os produtos", icon: "package", module_type: "produtos", sort_order: 3, content_html: "<p>Conheça os produtos disponíveis no catálogo e os principais diferenciais para divulgar.</p>" },
  { slug: "entrega", title: "Entrega e pós-venda", icon: "truck", module_type: "entrega", sort_order: 4, content_html: "<p>Entenda prazos de entrega, política de trocas e como acompanhar pedidos dos seus indicados.</p>" },
  { slug: "comissao", title: "Comissões e saques", icon: "wallet", module_type: "comissao", sort_order: 5, content_html: "<p>Veja como sua comissão é calculada, quando é liberada e como solicitar saque.</p>" },
  { slug: "faq", title: "Perguntas frequentes", icon: "help", module_type: "faq", sort_order: 6, content_html: "<p><strong>Preciso pagar para ser afiliado?</strong><br/>Não, o cadastro é gratuito.</p>" },
] as const;

function slugifyCode(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

function couponFromCode(code: string): string {
  return String(code || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 20);
}

export class AffiliatesService {
  async ensureSchema(): Promise<void> {
    await ensureAffiliateSchema();
  }

  /** Host raiz da plataforma para parceiros (todas as orgs). */
  static readonly PLATFORM_PARTNERS_HOST = "parceiros.leadcapture.online";

  /**
   * Subdomínio PWA por marca.
   * - parceiros.leadcapture.online = padrão da plataforma (válido para todas).
   * - parceiros.alhopronto.online só para a org alhopronto.
   * - Outro host custom = domínio próprio da org, se configurado.
   */
  sanitizeAppSubdomain(raw: string | null | undefined, brandSlug?: string | null): string | null {
    let host = String(raw || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (!host) return null;
    // remove path se colaram URL completa
    host = host.split("/")[0] || "";
    if (!host) return null;

    const slug = String(brandSlug || "")
      .trim()
      .toLowerCase();
    const isAlhoLegacy =
      host === "parceiros.alhopronto.online" ||
      host === "afiliados.alhopronto.online" ||
      host.endsWith(".alhopronto.online");
    if (isAlhoLegacy && slug !== "alhopronto") {
      return null;
    }
    return host;
  }

  async resolveBrandSlug(brandId: string): Promise<string | null> {
    const brand = await queryOne<{ slug: string | null; name: string | null }>(
      `SELECT slug, name FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId],
    );
    if (!brand) return null;
    const slug = String(brand.slug || "").trim();
    if (slug) return slug;
    const fromName = String(brand.name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return fromName || null;
  }

  /** Domínio custom verificado da loja (se houver) — só para exibição se for host de parceiros. */
  async resolveBrandPartnersHost(brandId: string): Promise<string | null> {
    const brand = await queryOne<{ domain: string | null; slug: string | null }>(
      `SELECT domain, slug FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId],
    ).catch(() => null);
    const brandDomain = this.sanitizeAppSubdomain(brand?.domain, brand?.slug);
    if (brandDomain && (brandDomain.startsWith("parceiros.") || brandDomain.startsWith("afiliados."))) {
      return brandDomain;
    }

    const storeDom = await queryOne<{ domain: string | null }>(
      `SELECT d.domain
       FROM storefront_stores s
       INNER JOIN storefront_domains d ON d.store_id = s.id AND d.is_primary = TRUE
       WHERE s.brand_id = ?
         AND (
           d.verification_status IS NULL
           OR d.verification_status IN ('active', 'verified', 'pending')
         )
       ORDER BY d.is_primary DESC
       LIMIT 1`,
      [brandId],
    ).catch(() => null);

    // Domínio de catálogo (ex. loja.cliente.com) NÃO é host de parceiros por padrão —
    // só usamos se for explicitamente parceiros.* / afiliados.*
    const storeHost = this.sanitizeAppSubdomain(storeDom?.domain, brand?.slug);
    if (storeHost && (storeHost.startsWith("parceiros.") || storeHost.startsWith("afiliados."))) {
      return storeHost;
    }
    return null;
  }

  async buildPartnersPublicUrls(ownerUserId: string, brandId: string, config?: AffiliateProgramConfig | null) {
    const brandSlug = await this.resolveBrandSlug(brandId);
    const cfg = config || (await this.getOrCreateProgramConfig(ownerUserId, brandId));
    const fromConfig = this.sanitizeAppSubdomain(cfg.app_subdomain, brandSlug);
    const fromBrand = !fromConfig ? await this.resolveBrandPartnersHost(brandId) : null;
    // Host custom da org (não confundir com o raiz da plataforma)
    const platformHost = AffiliatesService.PLATFORM_PARTNERS_HOST;
    let orgHost = fromConfig || fromBrand;
    if (orgHost === platformHost || orgHost === "afiliados.leadcapture.online") {
      orgHost = null; // raiz da plataforma é o default, não “custom”
    }

    // Limpa legado errado no banco (alho em marca alheia) → usa raiz da plataforma
    if (cfg.app_subdomain && !fromConfig && String(cfg.app_subdomain).toLowerCase().includes("alhopronto")) {
      try {
        await query(
          `UPDATE affiliate_program_config
           SET app_subdomain = ?, updated_at = NOW()
           WHERE owner_user_id = ? AND brand_id = ?`,
          [platformHost, ownerUserId, brandId],
        );
      } catch {
        /* ignore */
      }
    }

    const appOrigin = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "https://app.leadcapture.online")
      .replace(/\/+$/, "");
    const pathUrl = brandSlug
      ? `${appOrigin}/central-afiliado/${encodeURIComponent(brandSlug)}`
      : `${appOrigin}/central-afiliado`;
    const customUrl = orgHost ? `https://${orgHost}` : null;
    const marketplaceUrl = `https://${platformHost}`;

    return {
      brand_slug: brandSlug,
      /** Host custom da org, se houver; senão o da plataforma */
      app_subdomain: orgHost || platformHost,
      custom_url: customUrl,
      path_url: pathUrl,
      /**
       * URL principal para afiliados:
       * 1) domínio próprio da org (parceiros.cliente.com)
       * 2) raiz da plataforma parceiros.leadcapture.online
       */
      public_url: customUrl || marketplaceUrl,
      marketplace_url: marketplaceUrl,
    };
  }

  async getOrCreateProgramConfig(ownerUserId: string, brandId: string): Promise<AffiliateProgramConfig> {
    await ensureAffiliateSchema();
    const existing = await queryOne<AffiliateProgramConfig>(
      `SELECT * FROM affiliate_program_config WHERE owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [ownerUserId, brandId]
    );
    if (existing) {
      // Sanitiza app_subdomain legado alheio ao devolver
      const slug = await this.resolveBrandSlug(brandId);
      const clean = this.sanitizeAppSubdomain(existing.app_subdomain, slug);
      if (existing.app_subdomain && !clean) {
        (existing as any).app_subdomain = null;
      } else if (clean) {
        (existing as any).app_subdomain = clean;
      }
      return existing;
    }

    const id = randomUUID();
    // Padrão da plataforma: parceiros.leadcapture.online (não alhopronto)
    await query(
      `INSERT INTO affiliate_program_config
       (id, owner_user_id, brand_id, is_enabled, default_commission_pct, cookie_days, min_withdrawal, payment_days, app_subdomain, accept_new_affiliates, auto_approve_affiliates)
       VALUES (?, ?, ?, TRUE, 10, 30, 50, 15, ?, TRUE, TRUE)`,
      [id, ownerUserId, brandId, AffiliatesService.PLATFORM_PARTNERS_HOST]
    );

    const created = (await queryOne<AffiliateProgramConfig>(
      `SELECT * FROM affiliate_program_config WHERE id = ? LIMIT 1`,
      [id]
    ))!;
    await this.seedDefaultLearningModules(ownerUserId, brandId);

    // Default is_enabled=TRUE ⇒ programa principal já nasce no mercado de afiliados
    try {
      const { affiliateProgramsService } = await import("./affiliatePrograms");
      await affiliateProgramsService.syncMarketplaceFromBrandConfig(ownerUserId, brandId);
    } catch (err: any) {
      console.error("[affiliates] sync marketplace on create config:", err?.message || err);
    }

    return created;
  }

  async bumpContentVersion(ownerUserId: string, brandId: string): Promise<number> {
    await ensureAffiliateSchema();
    await this.getOrCreateProgramConfig(ownerUserId, brandId);
    await query(
      `UPDATE affiliate_program_config
       SET content_version = COALESCE(content_version, 0) + 1, updated_at = NOW()
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    const row = await queryOne<any>(
      `SELECT content_version FROM affiliate_program_config WHERE owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [ownerUserId, brandId]
    );
    return Number(row?.content_version || 1);
  }

  async seedDefaultLearningModules(ownerUserId: string, brandId: string): Promise<void> {
    await ensureAffiliateSchema();
    const existing = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_learning_modules WHERE brand_id = ?`,
      [brandId]
    );
    if (Number(existing?.total || 0) > 0) return;

    for (const mod of DEFAULT_LEARNING_MODULES) {
      await query(
        `INSERT INTO affiliate_learning_modules
         (id, owner_user_id, brand_id, slug, title, icon, module_type, content_html, sort_order, is_published, is_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)`,
        [
          randomUUID(),
          ownerUserId,
          brandId,
          mod.slug,
          mod.title,
          mod.icon,
          mod.module_type,
          mod.content_html,
          mod.sort_order,
          mod.slug === "programa" || mod.slug === "como-funciona",
        ]
      );
    }
  }

  async updateProgramConfig(
    ownerUserId: string,
    brandId: string,
    payload: Partial<{
      is_enabled: boolean;
      default_commission_pct: number;
      default_commission_mode: string;
      default_commission_value: number;
      commission_rules: string;
      cookie_days: number;
      min_withdrawal: number;
      payment_days: number;
      terms_html: string;
      training_html: string;
      app_subdomain: string;
      share_title: string;
      share_description: string;
      share_image_url: string;
      promotion_tone: string;
      accept_new_affiliates: boolean;
      auto_approve_affiliates: boolean;
    }>
  ): Promise<AffiliateProgramConfig> {
    await this.getOrCreateProgramConfig(ownerUserId, brandId);
    const fields: string[] = [];
    const values: any[] = [];

    const normalized = { ...payload } as Record<string, unknown>;
    if (normalized.default_commission_mode !== undefined) {
      normalized.default_commission_mode = normalizeCommissionMode(normalized.default_commission_mode);
    }
    if (normalized.default_commission_value !== undefined && normalized.default_commission_pct === undefined) {
      const mode = normalizeCommissionMode(normalized.default_commission_mode || "percentage");
      if (mode === "percentage") {
        normalized.default_commission_pct = Number(normalized.default_commission_value);
      }
    }
    if (normalized.default_commission_pct !== undefined && normalized.default_commission_value === undefined) {
      normalized.default_commission_value = Number(normalized.default_commission_pct);
    }

    if (normalized.app_subdomain !== undefined) {
      const slug = await this.resolveBrandSlug(brandId);
      normalized.app_subdomain = this.sanitizeAppSubdomain(
        normalized.app_subdomain as string | null,
        slug,
      );
    }

    for (const [key, value] of Object.entries(normalized)) {
      if (value === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (fields.length > 0) {
      const bumpsContent = ["terms_html", "training_html", "commission_rules"].some((k) => k in normalized);
      if (bumpsContent) fields.push("content_version = COALESCE(content_version, 0) + 1");
      fields.push("updated_at = NOW()");
      values.push(ownerUserId, brandId);
      await query(
        `UPDATE affiliate_program_config SET ${fields.join(", ")} WHERE owner_user_id = ? AND brand_id = ?`,
        values
      );
    }

    // Sincroniza campanhas/programas no mercado de afiliados
    try {
      const { affiliateProgramsService } = await import("./affiliatePrograms");
      await affiliateProgramsService.syncMarketplaceFromBrandConfig(ownerUserId, brandId);
    } catch (err: any) {
      console.error("[affiliates] syncMarketplaceFromBrandConfig:", err?.message || err);
    }

    return (await queryOne<AffiliateProgramConfig>(
      `SELECT * FROM affiliate_program_config WHERE owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [ownerUserId, brandId]
    ))!;
  }

  async listAffiliates(ownerUserId: string, brandId: string) {
    await ensureAffiliateSchema();
    return query<any[]>(
      `SELECT a.*, u.email, u.name AS user_name, c.is_active AS credential_active
       FROM affiliates a
       INNER JOIN affiliate_app_credentials c ON c.id = a.credential_id
       INNER JOIN users u ON u.id = a.affiliate_user_id
       WHERE a.owner_user_id = ? AND a.brand_id = ?
       ORDER BY a.created_at DESC`,
      [ownerUserId, brandId]
    );
  }

  async getAffiliateByCredential(credentialId: string, brandId: string) {
    await ensureAffiliateSchema();
    return queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE credential_id = ? AND brand_id = ? LIMIT 1`,
      [credentialId, brandId]
    );
  }

  async createAffiliateAccount(input: {
    ownerUserId: string;
    brandId: string;
    email: string;
    passwordHash: string;
    name: string;
    phone?: string | null;
    region?: string | null;
    codeHint?: string | null;
    autoApprove: boolean;
  }): Promise<{
    credentialId: string;
    affiliateUserId: string;
    affiliate: AffiliateProfile;
    isActive: boolean;
  }> {
    await ensureAffiliateSchema();

    const email = String(input.email || "").trim().toLowerCase();
    const name = String(input.name || "").trim() || "Afiliado";

    const existingCred = await queryOne<any>(
      `SELECT c.id, c.is_active, a.status
       FROM affiliate_app_credentials c
       LEFT JOIN affiliates a ON a.credential_id = c.id
       WHERE c.brand_id = ? AND LOWER(c.email) = LOWER(?)
       LIMIT 1`,
      [input.brandId, email]
    );
    if (existingCred) {
      if (String(existingCred.status || "") === "pending" || !existingCred.is_active) {
        throw new Error("Cadastro já enviado e aguarda aprovação da marca. Tente fazer login depois.");
      }
      throw new Error("Este e-mail já está cadastrado nesta marca. Faça login.");
    }

    let affiliateUser = await queryOne<any>(
      `SELECT id, email, role, account_kind, COALESCE(is_super_admin, false) AS is_super_admin
       FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email]
    );

    let affiliateUserId = String(affiliateUser?.id || "").trim();
    if (!affiliateUserId) {
      affiliateUserId = randomUUID();
      await query(
        `INSERT INTO users (id, email, password_hash, name, phone, role, account_kind, is_active)
         VALUES (?, ?, ?, ?, ?, 'affiliate', 'affiliate', TRUE)`,
        [affiliateUserId, email, input.passwordHash, name, input.phone || null]
      );
    } else {
      // Never demote org owners / platform masters into pure affiliate identity
      const { UsersService } = await import("./users");
      const us = new UsersService();
      if (await us.isProtectedPrincipal(affiliateUserId)) {
        throw new Error(
          "Este e-mail já pertence a uma Organização ou ao Admin Master. Use outro e-mail para afiliado.",
        );
      }
      await query(
        `UPDATE users
         SET password_hash = ?, name = ?, phone = ?, role = 'affiliate', account_kind = 'affiliate', is_active = TRUE, updated_at = NOW()
         WHERE id = ?`,
        [input.passwordHash, name, input.phone || null, affiliateUserId]
      );
    }

    const credentialId = randomUUID();
    const isActive = !!input.autoApprove;
    await query(
      `INSERT INTO affiliate_app_credentials
       (id, owner_user_id, affiliate_user_id, brand_id, email, credential_type, is_active)
       VALUES (?, ?, ?, ?, ?, 'afiliado', ?)`,
      [credentialId, input.ownerUserId, affiliateUserId, input.brandId, email, isActive]
    );

    const affiliate = await this.createAffiliateProfile({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      credentialId,
      affiliateUserId,
      displayName: name,
      phone: input.phone || null,
      codeHint: input.codeHint || null,
      status: input.autoApprove ? "active" : "pending",
    });

    if (input.region) {
      await this.updateProfile(String(affiliate.id), { region: input.region });
    }

    const refreshed = await queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE id = ? LIMIT 1`,
      [affiliate.id]
    );
    const profile = refreshed || affiliate;

    try {
      const { emailTriggers } = await import("./emailTriggers");
      emailTriggers.welcomeAffiliate({
        userId: input.ownerUserId,
        brandId: input.brandId,
        affiliate_name: name,
        affiliate_email: email,
        commission_rate: String((profile as any)?.commission_rate || (profile as any)?.commission_percent || "—"),
        program_name: "Programa de parceiros",
      });
      if (input.autoApprove) {
        emailTriggers.affiliateApproved({
          userId: input.ownerUserId,
          brandId: input.brandId,
          affiliate_name: name,
          affiliate_email: email,
        });
      }
    } catch {
      /* non-blocking */
    }

    if (isActive) {
      await this.syncAffiliateCoupon(profile, input.ownerUserId);
    }

    return {
      credentialId,
      affiliateUserId,
      affiliate: profile,
      isActive,
    };
  }

  /** Cria/atualiza cupom real na tabela coupons — necessário para o checkout validar. */
  async syncAffiliateCoupon(affiliate: AffiliateProfile, ownerUserId: string): Promise<void> {
    await ensureAffiliateSchema();
    const config = await this.getOrCreateProgramConfig(ownerUserId, String(affiliate.brand_id));
    const commission = resolveCommissionConfig({ affiliate, program: config });
    const pct = couponDiscountPercent({
      mode: commission.mode,
      value: commission.value,
      fallbackPct: Number(config.default_commission_pct ?? 10),
    });
    const code = String(affiliate.coupon_code || "").trim().toUpperCase();
    if (!code || pct <= 0) return;

    const metadata = {
      source: "affiliate_program",
      affiliate_id: affiliate.id,
      affiliate_code: affiliate.code,
      affiliate_name: affiliate.display_name,
    };
    const description = `Cupom do afiliado ${affiliate.display_name}`;
    const isActive = String(affiliate.status || "") === "active";

    const existing = await couponsService.getByCode(code, String(affiliate.brand_id));
    if (existing) {
      await couponsService.update(existing.id, {
        description,
        discount_type: "percentage",
        discount_value: pct,
        active: isActive,
        metadata,
      });
      return;
    }

    try {
      await couponsService.create({
        brand_id: String(affiliate.brand_id),
        code,
        description,
        discount_type: "percentage",
        discount_value: pct,
        applies_to: "all",
        active: isActive,
        metadata,
      });
    } catch (error: any) {
      const msg = String(error?.message || "");
      if (msg.includes("já existe cupom")) {
        const dup = await couponsService.getByCode(code, String(affiliate.brand_id));
        if (dup) {
          await couponsService.update(dup.id, {
            description,
            discount_type: "percentage",
            discount_value: pct,
            active: isActive,
            metadata,
          });
        }
      } else {
        throw error;
      }
    }
  }

  async recordSale(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    orderId: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    orderTotal: number;
    orderItems?: Array<{ product_id?: string; quantity?: number }>;
  }): Promise<void> {
    await ensureAffiliateSchema();
    const affiliate = await queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? AND status = 'active' LIMIT 1`,
      [input.affiliateId, input.brandId]
    );
    if (!affiliate) return;

    const config = await this.getOrCreateProgramConfig(input.ownerUserId, input.brandId);

    // Comissão do programa multi em que o afiliado está inscrito (R$/kg etc.)
    let programRow: any = null;
    try {
      programRow = await queryOne<any>(
        `SELECT p.commission_mode, p.commission_value
         FROM affiliate_program_enrollments e
         INNER JOIN affiliate_programs p ON p.id = e.program_id
         WHERE e.affiliate_id = ? AND e.brand_id = ?
           AND e.status IN ('active', 'onboarding')
         ORDER BY CASE WHEN e.status = 'active' THEN 0 ELSE 1 END,
                  e.updated_at DESC, e.created_at DESC,
                  CASE WHEN p.is_default THEN 1 ELSE 0 END
         LIMIT 1`,
        [input.affiliateId, input.brandId],
      );
    } catch {
      programRow = null;
    }

    const commissionCfg = resolveCommissionConfig({
      affiliate,
      program: programRow
        ? {
            commission_mode: programRow.commission_mode,
            commission_value: programRow.commission_value,
            default_commission_mode: config.default_commission_mode,
            default_commission_value: config.default_commission_value,
            default_commission_pct: config.default_commission_pct,
          }
        : {
            default_commission_mode: config.default_commission_mode,
            default_commission_value: config.default_commission_value,
            default_commission_pct: config.default_commission_pct,
          },
    });

    const productIds = (input.orderItems || [])
      .map((item) => String(item.product_id || "").trim())
      .filter(Boolean);
    const unitByProduct = new Map<string, string>();
    if (productIds.length > 0) {
      const placeholders = productIds.map(() => "?").join(", ");
      const rows = await query<any[]>(
        `SELECT id, COALESCE(unit, 'unidade') AS unit FROM products WHERE id IN (${placeholders})`,
        productIds
      );
      for (const row of rows || []) {
        unitByProduct.set(String(row.id), String(row.unit || "unidade"));
      }
    }

    const items = (input.orderItems || []).map((item) => ({
      quantity: Math.max(0, Number(item.quantity || 0)),
      unit: unitByProduct.get(String(item.product_id || "")) || "unidade",
    }));

    const { amount: commission, basis } = calculateCommissionAmount({
      mode: commissionCfg.mode,
      value: commissionCfg.value,
      orderTotal: input.orderTotal,
      items,
    });

    const existing = await queryOne<any>(
      `SELECT id FROM affiliate_sales WHERE order_id = ? LIMIT 1`,
      [input.orderId]
    );
    if (existing) return;

    await query(
      `INSERT INTO affiliate_sales
       (id, owner_user_id, brand_id, affiliate_id, order_id, customer_name, order_total,
        commission_amount, commission_mode, commission_basis, order_status, commission_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
      [
        randomUUID(),
        input.ownerUserId,
        input.brandId,
        input.affiliateId,
        input.orderId,
        input.customerName || null,
        input.orderTotal,
        commission,
        commissionCfg.mode,
        JSON.stringify({ ...basis, source: commissionCfg.source }),
      ]
    );
    await query(
      `UPDATE affiliates
       SET total_sales = total_sales + 1,
           total_commission = total_commission + ?,
           updated_at = NOW()
       WHERE id = ?`,
      [commission, input.affiliateId]
    );

    await this.recordAffiliateLead({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      customerName: input.customerName || "Cliente",
      phone: input.customerPhone || undefined,
      email: input.customerEmail || undefined,
      sourceType: "checkout",
      orderId: input.orderId,
      affiliateStatus: "converted",
    }).catch(() => undefined);

    void this.emitAffiliateFinanceEvent("affiliate.commission.generated", {
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      amount: commission,
      entityId: input.orderId,
    });
  }

  private async emitAffiliateFinanceEvent(
    eventKey: string,
    ctx: { brandId: string; affiliateId: string; amount: number; entityId?: string; deepLink?: string }
  ) {
    try {
      const affiliate = await queryOne<{ affiliate_user_id: string }>(
        `SELECT affiliate_user_id FROM affiliates WHERE id = ? LIMIT 1`,
        [ctx.affiliateId]
      );
      const userId = String(affiliate?.affiliate_user_id || "").trim();
      if (!userId) return;
      const amountLabel = Number(ctx.amount || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const { emitPlatformEventToUser } = await import("./notificationHub");
      await emitPlatformEventToUser(eventKey, userId, {
        organization_id: ctx.brandId,
        role: "affiliate",
        entity_type: "affiliate_sale",
        entity_id: ctx.entityId || ctx.affiliateId,
        deep_link: ctx.deepLink || "/financeiro",
        template_vars: {
          amount: amountLabel,
          brand_id: ctx.brandId,
        },
      });
    } catch {
      /* não bloquear venda */
    }
  }

  async approveAffiliate(affiliateId: string, ownerUserId: string): Promise<void> {
    await ensureAffiliateSchema();
    const row = await queryOne<any>(
      `SELECT a.id, a.credential_id FROM affiliates a
       WHERE a.id = ? AND a.owner_user_id = ? LIMIT 1`,
      [affiliateId, ownerUserId]
    );
    if (!row) throw new Error("Afiliado não encontrado");

    await query(
      `UPDATE affiliates SET status = 'active', updated_at = NOW() WHERE id = ?`,
      [affiliateId]
    );
    await query(
      `UPDATE affiliate_app_credentials SET is_active = TRUE, updated_at = NOW() WHERE id = ?`,
      [String(row.credential_id)]
    );

    const affiliate = await queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE id = ? LIMIT 1`,
      [affiliateId]
    );
    if (affiliate) await this.syncAffiliateCoupon(affiliate, ownerUserId);
  }

  async createAffiliateProfile(input: {
    ownerUserId: string;
    brandId: string;
    credentialId: string;
    affiliateUserId: string;
    displayName: string;
    phone?: string | null;
    codeHint?: string | null;
    status?: string;
  }): Promise<AffiliateProfile> {
    await ensureAffiliateSchema();
    const config = await this.getOrCreateProgramConfig(input.ownerUserId, input.brandId);

    let baseCode = slugifyCode(input.codeHint || input.displayName || "afiliado");
    if (!baseCode) baseCode = "afiliado";
    let code = baseCode;
    let suffix = 1;
    while (await queryOne(`SELECT id FROM affiliates WHERE brand_id = ? AND code = ? LIMIT 1`, [input.brandId, code])) {
      code = `${baseCode}${suffix}`;
      suffix += 1;
    }

    let coupon = couponFromCode(code);
    let couponSuffix = 1;
    while (await queryOne(`SELECT id FROM affiliates WHERE brand_id = ? AND coupon_code = ? LIMIT 1`, [input.brandId, coupon])) {
      coupon = `${couponFromCode(code)}${couponSuffix}`;
      couponSuffix += 1;
    }

    const id = randomUUID();
    await query(
      `INSERT INTO affiliates
       (id, owner_user_id, brand_id, credential_id, affiliate_user_id, code, coupon_code, display_name, phone, commission_pct, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.ownerUserId,
        input.brandId,
        input.credentialId,
        input.affiliateUserId,
        code,
        coupon,
        input.displayName,
        input.phone || null,
        config.default_commission_pct,
        input.status || "active",
      ]
    );

    return (await queryOne<AffiliateProfile>(`SELECT * FROM affiliates WHERE id = ? LIMIT 1`, [id]))!;
  }

  async getDashboardStats(affiliateId: string, brandId: string) {
    await ensureAffiliateSchema();
    const affiliate = await queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? LIMIT 1`,
      [affiliateId, brandId]
    );
    if (!affiliate) return null;

    const pending = await queryOne<any>(
      `SELECT COALESCE(SUM(commission_amount), 0) AS total
       FROM affiliate_sales
       WHERE affiliate_id = ? AND commission_status = 'pending'`,
      [affiliateId]
    );
    const approved = await queryOne<any>(
      `SELECT COALESCE(SUM(commission_amount), 0) AS total
       FROM affiliate_sales
       WHERE affiliate_id = ? AND commission_status = 'approved'`,
      [affiliateId]
    );
    const paid = await queryOne<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM affiliate_payouts
       WHERE affiliate_id = ? AND status = 'paid'`,
      [affiliateId]
    );
    const conversions = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_sales WHERE affiliate_id = ?`,
      [affiliateId]
    );
    const inProgress = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_sales WHERE affiliate_id = ? AND order_status IN ('pending', 'processing')`,
      [affiliateId]
    );

    const rank = await queryOne<any>(
      `SELECT COUNT(*) + 1 AS position
       FROM affiliates
       WHERE brand_id = ? AND total_commission > ?`,
      [brandId, affiliate.total_commission || 0]
    );

    return {
      affiliate,
      total_sold: Number(affiliate.total_commission || 0) > 0
        ? await queryOne<any>(
            `SELECT COALESCE(SUM(order_total), 0) AS total FROM affiliate_sales WHERE affiliate_id = ?`,
            [affiliateId]
          ).then((r) => Number(r?.total || 0))
        : 0,
      commission_accumulated: Number(affiliate.total_commission || 0),
      commission_available: Math.max(0, Number(approved?.total || 0) - Number(paid?.total || 0)),
      commission_pending: Number(pending?.total || 0),
      clicks: Number(affiliate.total_clicks || 0),
      conversions: Number(conversions?.total || 0),
      orders_in_progress: Number(inProgress?.total || 0),
      rank: Number(rank?.position || 0),
    };
  }

  async listSales(affiliateId: string, page = 1, limit = 50, programId?: string) {
    await ensureAffiliateSchema();
    const offset = (page - 1) * limit;
    const clauses = ["affiliate_id = ?"];
    const params: any[] = [affiliateId];
    if (programId) {
      clauses.push("program_id = ?");
      params.push(programId);
    }
    const rows = await query<any[]>(
      `SELECT * FROM affiliate_sales WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_sales WHERE ${clauses.join(" AND ")}`,
      params
    );
    return { sales: rows, total: Number(total?.total || 0), page, limit, program_id: programId || null };
  }

  async listPayouts(affiliateId: string) {
    await ensureAffiliateSchema();
    return query<any[]>(
      `SELECT * FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY created_at DESC`,
      [affiliateId]
    );
  }

  async requestPayout(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    amount: number;
    pixKey: string;
  }) {
    await ensureAffiliateSchema();
    const config = await this.getOrCreateProgramConfig(input.ownerUserId, input.brandId);
    if (input.amount < Number(config.min_withdrawal)) {
      throw new Error(`Valor mínimo para saque: R$ ${Number(config.min_withdrawal).toFixed(2)}`);
    }

    const approved = await queryOne<any>(
      `SELECT COALESCE(SUM(commission_amount), 0) AS total
       FROM affiliate_sales WHERE affiliate_id = ? AND commission_status = 'approved'`,
      [input.affiliateId]
    );
    const paid = await queryOne<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM affiliate_payouts WHERE affiliate_id = ? AND status IN ('requested', 'processing', 'paid')`,
      [input.affiliateId]
    );
    const available = Number(approved?.total || 0) - Number(paid?.total || 0);
    if (input.amount > available) {
      throw new Error("Saldo disponível insuficiente para este saque");
    }

    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_payouts
       (id, owner_user_id, brand_id, affiliate_id, amount, pix_key, status)
       VALUES (?, ?, ?, ?, ?, ?, 'requested')`,
      [id, input.ownerUserId, input.brandId, input.affiliateId, input.amount, input.pixKey]
    );

    void this.emitAffiliateFinanceEvent("affiliate.payout.pending", {
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      amount: input.amount,
      entityId: id,
      deepLink: "/financeiro",
    });

    return id;
  }

  async updateProfile(affiliateId: string, payload: Partial<{
    display_name: string;
    phone: string;
    document: string;
    pix_key: string;
    region: string;
    social_instagram: string;
    social_whatsapp: string;
  }>) {
    await ensureAffiliateSchema();
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (fields.length > 0) {
      fields.push("updated_at = NOW()");
      values.push(affiliateId);
      await query(`UPDATE affiliates SET ${fields.join(", ")} WHERE id = ?`, values);
    }
    return queryOne<AffiliateProfile>(`SELECT * FROM affiliates WHERE id = ? LIMIT 1`, [affiliateId]);
  }

  async listMaterials(
    ownerUserId: string,
    brandId: string,
    opts?: { region?: string; publishedOnly?: boolean; channel?: string; category?: string; programId?: string }
  ) {
    await ensureAffiliateSchema();
    const region = String(opts?.region || "").trim();
    const clauses = ["owner_user_id = ?", "brand_id = ?", "is_active = TRUE"];
    const params: any[] = [ownerUserId, brandId];

    if (opts?.programId) {
      clauses.push("(program_id IS NULL OR program_id = ?)");
      params.push(String(opts.programId).trim());
    }

    if (opts?.publishedOnly) clauses.push("is_published = TRUE");
    if (opts?.channel) {
      clauses.push("(channel = ? OR channel = 'geral')");
      params.push(String(opts.channel).trim());
    }
    if (opts?.category) {
      clauses.push("category = ?");
      params.push(String(opts.category).trim());
    }
    if (region) {
      clauses.push("(region IS NULL OR region = '' OR LOWER(region) = LOWER(?))");
      params.push(region);
    }

    return query<any[]>(
      `SELECT * FROM affiliate_materials
       WHERE ${clauses.join(" AND ")}
       ORDER BY sort_order ASC, created_at DESC`,
      params
    );
  }

  /**
   * Biblioteca unificada do afiliado: pastas da galeria da marca
   * (posts, produtos, logos, campanhas, uploads, IA) + materiais
   * dedicados do programa de afiliados.
   */
  async listMaterialsLibrary(
    ownerUserId: string,
    brandId: string,
    opts?: { region?: string; programId?: string; folder?: string; type?: string; q?: string }
  ) {
    await ensureAffiliateSchema();
    const folderFilter = String(opts?.folder || "all").trim() || "all";
    const typeFilter = String(opts?.type || "").trim().toLowerCase();
    const q = String(opts?.q || "").trim().toLowerCase();

    const dedicated = await this.listMaterials(ownerUserId, brandId, {
      region: opts?.region,
      publishedOnly: true,
      programId: opts?.programId,
    });

    type LibItem = {
      id: string;
      title: string;
      type: "image" | "video";
      media_url: string;
      thumbnail_url: string | null;
      folder: string;
      folder_label: string;
      category: string | null;
      channel: string | null;
      product_id: string | null;
      product_name: string | null;
      source: string;
      copy_text: string | null;
      created_at: string | null;
      /** id real em affiliate_materials (para legenda IA) */
      material_id: string | null;
    };

    const FOLDER_META: Record<string, { label: string; icon: string; sort: number }> = {
      programa: { label: "Programa", icon: "sparkles", sort: 10 },
      posts: { label: "Posts", icon: "camera", sort: 20 },
      produtos: { label: "Produtos", icon: "package", sort: 30 },
      marca: { label: "Marca & logo", icon: "award", sort: 40 },
      campanhas: { label: "Campanhas", icon: "megaphone", sort: 50 },
      ia: { label: "Criativos IA", icon: "wand", sort: 60 },
      uploads: { label: "Uploads", icon: "folder", sort: 70 },
      publicidade: { label: "Publicidade", icon: "image", sort: 80 },
      outros: { label: "Outros", icon: "layers", sort: 90 },
    };

    const items: LibItem[] = [];

    for (const m of dedicated || []) {
      const url = String(m.media_url || "").trim();
      if (!url) continue;
      const t = String(m.type || "image").toLowerCase() === "video" ? "video" : "image";
      items.push({
        id: `mat:${m.id}`,
        title: String(m.title || "Material"),
        type: t,
        media_url: url,
        thumbnail_url: t === "image" ? url : null,
        folder: "programa",
        folder_label: FOLDER_META.programa.label,
        category: m.category ? String(m.category) : null,
        channel: m.channel ? String(m.channel) : null,
        product_id: m.product_id ? String(m.product_id) : null,
        product_name: null,
        source: "affiliate_material",
        copy_text: m.copy_text ? String(m.copy_text) : null,
        created_at: m.created_at ? String(m.created_at) : null,
        material_id: String(m.id),
      });
    }

    // Logo / capa da marca
    try {
      const brand = await queryOne<any>(
        `SELECT name, logo_url, cover_image FROM brand_units WHERE id = ? LIMIT 1`,
        [brandId],
      );
      const logo = String(brand?.logo_url || "").trim();
      const cover = String(brand?.cover_image || "").trim();
      if (logo) {
        items.push({
          id: `brand:logo:${brandId}`,
          title: `${brand?.name || "Marca"} · Logo`,
          type: "image",
          media_url: logo,
          thumbnail_url: logo,
          folder: "marca",
          folder_label: FOLDER_META.marca.label,
          category: "logo",
          channel: "geral",
          product_id: null,
          product_name: null,
          source: "brand",
          copy_text: null,
          created_at: null,
          material_id: null,
        });
      }
      if (cover) {
        items.push({
          id: `brand:cover:${brandId}`,
          title: `${brand?.name || "Marca"} · Capa`,
          type: "image",
          media_url: cover,
          thumbnail_url: cover,
          folder: "marca",
          folder_label: FOLDER_META.marca.label,
          category: "cover",
          channel: "geral",
          product_id: null,
          product_name: null,
          source: "brand",
          copy_text: null,
          created_at: null,
          material_id: null,
        });
      }
    } catch {
      /* brand opcional */
    }

    // Galeria unificada da marca (posts, produtos, campanhas, uploads, IA…)
    try {
      const { GalleryService } = await import("./gallery");
      const gallery = new GalleryService();
      const { items: galleryItems } = await gallery.listItems(ownerUserId, brandId, {
        limit: 500,
        sort: "created_at",
      });
      for (const g of galleryItems || []) {
        const url = String(g.url || "").trim();
        if (!url) continue;
        const rawFolder = String(g.folder || "outros").toLowerCase();
        // pub-* = subpastas de publicidade; brand/logo → marca
        let folder = "outros";
        if (
          rawFolder === "uploads" || rawFolder === "ia" || rawFolder === "campanhas"
          || rawFolder === "posts" || rawFolder === "produtos" || rawFolder === "publicidade"
        ) {
          folder = rawFolder;
        } else if (rawFolder.startsWith("pub-") || rawFolder === "ads") {
          folder = "publicidade";
        } else if (rawFolder === "marca" || rawFolder === "logo" || rawFolder === "brand") {
          folder = "marca";
        }
        const meta = FOLDER_META[folder] || FOLDER_META.outros;
        items.push({
          id: `gal:${g.id}`,
          title: String(g.name || meta.label),
          type: g.type === "video" ? "video" : "image",
          media_url: url,
          thumbnail_url: g.thumbnailUrl || (g.type === "image" ? url : null),
          folder,
          folder_label: meta.label,
          category: g.type || null,
          channel: g.metadata?.postChannel || null,
          product_id: g.metadata?.productId ? String(g.metadata.productId) : null,
          product_name: g.metadata?.productName ? String(g.metadata.productName) : null,
          source: String(g.source || g.origin || "gallery"),
          copy_text: null,
          created_at: g.createdAt || null,
          material_id: null,
        });
      }
    } catch (err: any) {
      console.error("[affiliates] materials library gallery:", err?.message || err);
    }

    // Dedup por URL (mantém o primeiro — prioriza programa)
    const seenUrl = new Set<string>();
    const unique: LibItem[] = [];
    for (const it of items) {
      const key = it.media_url.split("?")[0];
      if (seenUrl.has(key)) continue;
      seenUrl.add(key);
      unique.push(it);
    }

    let filtered = unique;
    if (folderFilter && folderFilter !== "all") {
      filtered = filtered.filter((i) => i.folder === folderFilter);
    }
    if (typeFilter === "image" || typeFilter === "video") {
      filtered = filtered.filter((i) => i.type === typeFilter);
    }
    if (q) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(q)
          || (i.product_name || "").toLowerCase().includes(q)
          || (i.category || "").toLowerCase().includes(q)
          || i.folder_label.toLowerCase().includes(q),
      );
    }

    const counts: Record<string, number> = { all: unique.length };
    for (const it of unique) {
      counts[it.folder] = (counts[it.folder] || 0) + 1;
    }

    const folders = [
      { slug: "all", label: "Todos", icon: "layout-grid", count: counts.all || 0, sort: 0 },
      ...Object.entries(FOLDER_META)
        .map(([slug, meta]) => ({
          slug,
          label: meta.label,
          icon: meta.icon,
          count: counts[slug] || 0,
          sort: meta.sort,
        }))
        .filter((f) => f.count > 0 || f.slug === "programa")
        .sort((a, b) => a.sort - b.sort),
    ];

    return {
      folders,
      items: filtered,
      total: filtered.length,
      total_all: unique.length,
    };
  }

  async createMaterial(
    ownerUserId: string,
    brandId: string,
    payload: {
      title: string;
      type?: string;
      media_url?: string | null;
      copy_text?: string | null;
      region?: string | null;
      gallery_item_id?: string | null;
      category?: string | null;
      channel?: string | null;
      product_id?: string | null;
      program_id?: string | null;
      sort_order?: number;
      is_published?: boolean;
    }
  ) {
    await ensureAffiliateSchema();
    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_materials
       (id, owner_user_id, brand_id, title, type, media_url, copy_text, region,
        gallery_item_id, category, channel, product_id, program_id, is_active, is_published, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
      [
        id,
        ownerUserId,
        brandId,
        String(payload.title || "").trim(),
        String(payload.type || "image").trim(),
        String(payload.media_url || "").trim() || null,
        String(payload.copy_text || "").trim() || null,
        String(payload.region || "").trim() || null,
        String(payload.gallery_item_id || "").trim() || null,
        String(payload.category || "promo").trim(),
        String(payload.channel || "geral").trim(),
        String(payload.product_id || "").trim() || null,
        String(payload.program_id || "").trim() || null,
        payload.is_published !== false,
        Number(payload.sort_order) || 0,
      ]
    );
    await this.bumpContentVersion(ownerUserId, brandId);
    return queryOne<any>(`SELECT * FROM affiliate_materials WHERE id = ? LIMIT 1`, [id]);
  }

  async updateMaterial(
    ownerUserId: string,
    materialId: string,
    payload: Partial<{
      title: string;
      type: string;
      media_url: string | null;
      copy_text: string | null;
      region: string | null;
      gallery_item_id: string | null;
      category: string;
      channel: string;
      product_id: string | null;
      program_id: string | null;
      sort_order: number;
      is_published: boolean;
    }>
  ) {
    await ensureAffiliateSchema();
    const row = await queryOne<any>(
      `SELECT brand_id FROM affiliate_materials WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [materialId, ownerUserId]
    );
    if (!row) throw new Error("Material não encontrado");

    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      fields.push(`${key} = ?`);
      values.push(value);
    }
    if (!fields.length) return queryOne<any>(`SELECT * FROM affiliate_materials WHERE id = ? LIMIT 1`, [materialId]);

    fields.push("updated_at = NOW()");
    values.push(materialId, ownerUserId);
    await query(
      `UPDATE affiliate_materials SET ${fields.join(", ")} WHERE id = ? AND owner_user_id = ?`,
      values
    );
    await this.bumpContentVersion(ownerUserId, String(row.brand_id));
    return queryOne<any>(`SELECT * FROM affiliate_materials WHERE id = ? LIMIT 1`, [materialId]);
  }

  async deactivateMaterial(ownerUserId: string, materialId: string): Promise<void> {
    await ensureAffiliateSchema();
    const row = await queryOne<any>(
      `SELECT brand_id FROM affiliate_materials WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [materialId, ownerUserId]
    );
    if (!row) throw new Error("Material não encontrado");
    await query(
      `UPDATE affiliate_materials SET is_active = FALSE, updated_at = NOW() WHERE id = ? AND owner_user_id = ?`,
      [materialId, ownerUserId]
    );
    await this.bumpContentVersion(ownerUserId, String(row.brand_id));
  }

  async listLearningModules(ownerUserId: string, brandId: string, publishedOnly = false) {
    await ensureAffiliateSchema();
    await this.seedDefaultLearningModules(ownerUserId, brandId);
    const clauses = ["owner_user_id = ?", "brand_id = ?"];
    const params: any[] = [ownerUserId, brandId];
    if (publishedOnly) clauses.push("is_published = TRUE");
    return query<any[]>(
      `SELECT * FROM affiliate_learning_modules
       WHERE ${clauses.join(" AND ")}
       ORDER BY sort_order ASC, created_at ASC`,
      params
    );
  }

  async upsertLearningModule(
    ownerUserId: string,
    brandId: string,
    payload: {
      id?: string;
      slug?: string;
      title: string;
      icon?: string;
      module_type?: string;
      content_html?: string | null;
      media_url?: string | null;
      gallery_item_id?: string | null;
      sort_order?: number;
      is_published?: boolean;
      is_required?: boolean;
      region?: string | null;
    }
  ) {
    await ensureAffiliateSchema();
    const title = String(payload.title || "").trim();
    if (!title) throw new Error("Título obrigatório");

    if (payload.id) {
      const fields: string[] = [];
      const values: any[] = [];
      const map: Record<string, unknown> = {
        title,
        icon: payload.icon,
        module_type: payload.module_type,
        content_html: payload.content_html,
        media_url: payload.media_url,
        gallery_item_id: payload.gallery_item_id,
        sort_order: payload.sort_order,
        is_published: payload.is_published,
        is_required: payload.is_required,
        region: payload.region,
      };
      for (const [key, value] of Object.entries(map)) {
        if (value === undefined) continue;
        fields.push(`${key} = ?`);
        values.push(value);
      }
      if (fields.length) {
        fields.push("updated_at = NOW()");
        values.push(payload.id, ownerUserId, brandId);
        await query(
          `UPDATE affiliate_learning_modules SET ${fields.join(", ")}
           WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
          values
        );
      }
      await this.bumpContentVersion(ownerUserId, brandId);
      return queryOne<any>(`SELECT * FROM affiliate_learning_modules WHERE id = ? LIMIT 1`, [payload.id]);
    }

    const slug = String(payload.slug || slugifyCode(title) || "modulo").trim();
    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_learning_modules
       (id, owner_user_id, brand_id, slug, title, icon, module_type, content_html, media_url,
        gallery_item_id, sort_order, is_published, is_required, region)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerUserId,
        brandId,
        slug,
        title,
        String(payload.icon || "book").trim(),
        String(payload.module_type || "programa").trim(),
        String(payload.content_html || "").trim() || null,
        String(payload.media_url || "").trim() || null,
        String(payload.gallery_item_id || "").trim() || null,
        Number(payload.sort_order) || 0,
        !!payload.is_published,
        !!payload.is_required,
        String(payload.region || "").trim() || null,
      ]
    );
    await this.bumpContentVersion(ownerUserId, brandId);
    return queryOne<any>(`SELECT * FROM affiliate_learning_modules WHERE id = ? LIMIT 1`, [id]);
  }

  async getAffiliateContentBundle(
    ownerUserId: string,
    brandId: string,
    opts?: { region?: string; channel?: string }
  ) {
    await ensureAffiliateSchema();
    const config = await this.getOrCreateProgramConfig(ownerUserId, brandId);
    const materials = await this.listMaterials(ownerUserId, brandId, {
      region: opts?.region,
      publishedOnly: true,
      channel: opts?.channel,
    });
    const modules = await this.listLearningModules(ownerUserId, brandId, true);
    return {
      materials,
      learning: {
        modules,
        terms_html: config.terms_html,
        training_html: config.training_html,
      },
      meta: {
        content_version: Number(config.content_version || 1),
        updated_at: config.updated_at,
      },
    };
  }

  async trackClick(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    ipHash?: string;
    userAgent?: string;
    referrer?: string;
    linkType?: string;
    productId?: string | null;
    productSlug?: string | null;
    landingPath?: string | null;
  }) {
    await ensureAffiliateSchema();
    const linkType = String(input.linkType || "catalog").trim().toLowerCase() || "catalog";
    await query(
      `INSERT INTO affiliate_clicks
       (id, owner_user_id, brand_id, affiliate_id, ip_hash, user_agent, referrer,
        link_type, product_id, product_slug, landing_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.ownerUserId,
        input.brandId,
        input.affiliateId,
        input.ipHash || null,
        input.userAgent || null,
        input.referrer || null,
        linkType,
        input.productId || null,
        input.productSlug || null,
        input.landingPath || null,
      ]
    );
    await query(
      `UPDATE affiliates SET total_clicks = total_clicks + 1, updated_at = NOW() WHERE id = ?`,
      [input.affiliateId]
    );
  }

  async getAffiliateLinkAnalytics(affiliateId: string, brandId: string, days = 30, programId?: string) {
    await ensureAffiliateSchema();
    // Garante colunas multi-programa (program_id) em clicks/sales
    await query(`ALTER TABLE affiliate_clicks ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);
    await query(`ALTER TABLE affiliate_sales ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);

    const periodDays = Math.min(Math.max(Number(days) || 30, 7), 90);
    // PostgreSQL: CURRENT_TIMESTAMP - (N * INTERVAL '1 day') — DATE_SUB/INTERVAL ? não funciona
    const sinceExpr = `(CURRENT_TIMESTAMP - (? * INTERVAL '1 day'))`;

    const affiliate = await queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? LIMIT 1`,
      [affiliateId, brandId]
    );
    if (!affiliate) return null;

    const clickClauses = ["affiliate_id = ?"];
    const clickParams: any[] = [affiliateId];
    const salesClauses = ["affiliate_id = ?"];
    const salesParams: any[] = [affiliateId];
    const pid = String(programId || "").trim();
    if (pid) {
      clickClauses.push("program_id = ?");
      clickParams.push(pid);
      salesClauses.push("program_id = ?");
      salesParams.push(pid);
    }

    const empty = {
      affiliate,
      period_days: periodDays,
      clicks_total: Number(affiliate.total_clicks || 0),
      clicks_period: 0,
      conversions_total: Number(affiliate.total_sales || 0),
      conversions_period: 0,
      conversion_rate: 0,
      commission_period: 0,
      series: [] as Array<{ day: string; clicks: number }>,
      by_type: [] as Array<{ link_type: string; clicks: number }>,
      top_products: [] as Array<{
        product_id: string | null;
        product_slug: string | null;
        product_name: string | null;
        clicks: number;
      }>,
    };

    try {
      const series = await query<any[]>(
        `SELECT (created_at)::date AS day, COUNT(*)::int AS clicks
         FROM affiliate_clicks
         WHERE ${clickClauses.join(" AND ")} AND created_at >= ${sinceExpr}
         GROUP BY (created_at)::date
         ORDER BY day ASC`,
        [...clickParams, Math.max(0, periodDays - 1)]
      );

      const byType = await query<any[]>(
        `SELECT COALESCE(link_type, 'catalog') AS link_type, COUNT(*)::int AS clicks
         FROM affiliate_clicks
         WHERE ${clickClauses.join(" AND ")} AND created_at >= ${sinceExpr}
         GROUP BY COALESCE(link_type, 'catalog')
         ORDER BY clicks DESC`,
        [...clickParams, periodDays]
      );

      const topProducts = await query<any[]>(
        `SELECT
           c.product_id,
           c.product_slug,
           COUNT(*)::int AS clicks,
           MAX(p.name) AS product_name
         FROM affiliate_clicks c
         LEFT JOIN products p ON p.id = c.product_id
         WHERE c.affiliate_id = ?
           ${pid ? "AND c.program_id = ?" : ""}
           AND c.created_at >= ${sinceExpr}
           AND (c.product_id IS NOT NULL OR c.product_slug IS NOT NULL)
         GROUP BY c.product_id, c.product_slug
         ORDER BY clicks DESC
         LIMIT 8`,
        pid ? [affiliateId, pid, periodDays] : [affiliateId, periodDays]
      );

      const periodClicks = await queryOne<any>(
        `SELECT COUNT(*)::int AS total
         FROM affiliate_clicks
         WHERE ${clickClauses.join(" AND ")} AND created_at >= ${sinceExpr}`,
        [...clickParams, periodDays]
      );

      const conversions = await queryOne<any>(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(commission_amount), 0) AS commission
         FROM affiliate_sales
         WHERE ${salesClauses.join(" AND ")}
           AND created_at >= ${sinceExpr}`,
        [...salesParams, periodDays]
      );

      const clicksPeriod = Number(periodClicks?.total || 0);
      const conversionsPeriod = Number(conversions?.total || 0);

      return {
        affiliate,
        period_days: periodDays,
        clicks_total: Number(affiliate.total_clicks || 0),
        clicks_period: clicksPeriod,
        conversions_total: Number(affiliate.total_sales || 0),
        conversions_period: conversionsPeriod,
        conversion_rate: clicksPeriod > 0 ? conversionsPeriod / clicksPeriod : 0,
        commission_period: Number(conversions?.commission || 0),
        series: (series || []).map((row) => ({
          day: row.day ? String(row.day).slice(0, 10) : "",
          clicks: Number(row.clicks || 0),
        })),
        by_type: (byType || []).map((row) => ({
          link_type: String(row.link_type || "catalog"),
          clicks: Number(row.clicks || 0),
        })),
        top_products: (topProducts || []).map((row) => ({
          product_id: row.product_id ? String(row.product_id) : null,
          product_slug: row.product_slug ? String(row.product_slug) : null,
          product_name: row.product_name ? String(row.product_name) : null,
          clicks: Number(row.clicks || 0),
        })),
      };
    } catch (err: any) {
      // Não derruba a Central de Links se a tabela de cliques estiver vazia/incompleta
      console.error("[affiliates] getAffiliateLinkAnalytics:", err?.message || err);
      return empty;
    }
  }

  private normalizeLeadPhone(phone?: string | null): string | null {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  async resolveAffiliateAttribution(
    brandId: string,
    opts: { affiliateId?: string; affiliateRef?: string; couponCode?: string }
  ): Promise<AffiliateProfile | null> {
    await ensureAffiliateSchema();
    const directId = String(opts.affiliateId || "").trim();
    if (directId) {
      const byId = await queryOne<AffiliateProfile>(
        `SELECT * FROM affiliates WHERE id = ? AND brand_id = ? AND status = 'active' LIMIT 1`,
        [directId, brandId]
      );
      if (byId) return byId;
    }
    const ref = String(opts.affiliateRef || "").trim();
    if (ref) {
      const byCode = await this.resolveAffiliateByCode(brandId, ref);
      if (byCode) return byCode;
    }
    const coupon = String(opts.couponCode || "").trim().toUpperCase();
    if (coupon) {
      const byCoupon = await queryOne<AffiliateProfile>(
        `SELECT * FROM affiliates WHERE brand_id = ? AND UPPER(coupon_code) = ? AND status = 'active' LIMIT 1`,
        [brandId, coupon]
      );
      if (byCoupon) return byCoupon;
    }
    return null;
  }

  async recordAffiliateLead(input: {
    ownerUserId: string;
    brandId: string;
    affiliateId: string;
    customerName: string;
    phone?: string | null;
    email?: string | null;
    sourceType: "capture" | "checkout" | "booking";
    ctaType?: string | null;
    productName?: string | null;
    productId?: string | null;
    orderId?: string | null;
    message?: string | null;
    internalRefId?: string | null;
    affiliateStatus?: string;
  }): Promise<string> {
    await ensureAffiliateSchema();
    const phone = this.normalizeLeadPhone(input.phone);
    const email = String(input.email || "").trim().toLowerCase() || null;
    const name = String(input.customerName || "").trim() || "Contato";
    const sourceType = String(input.sourceType || "capture").trim().toLowerCase();
    const status = String(input.affiliateStatus || (sourceType === "checkout" ? "converted" : "new")).trim().toLowerCase();

    if (phone) {
      const existing = await queryOne<{ id: string; affiliate_status: string }>(
        `SELECT id, affiliate_status FROM affiliate_leads
         WHERE affiliate_id = ? AND phone = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [input.affiliateId, phone]
      );
      if (existing) {
        const nextStatus =
          sourceType === "checkout"
            ? "converted"
            : existing.affiliate_status === "converted"
              ? "converted"
              : status;
        await query(
          `UPDATE affiliate_leads SET
             customer_name = ?,
             email = COALESCE(?, email),
             source_type = ?,
             cta_type = COALESCE(?, cta_type),
             product_name = COALESCE(?, product_name),
             product_id = COALESCE(?, product_id),
             order_id = COALESCE(?, order_id),
             message = COALESCE(?, message),
             internal_ref_id = COALESCE(?, internal_ref_id),
             affiliate_status = ?,
             updated_at = NOW()
           WHERE id = ?`,
          [
            name,
            email,
            sourceType,
            input.ctaType || null,
            input.productName || null,
            input.productId || null,
            input.orderId || null,
            input.message || null,
            input.internalRefId || null,
            nextStatus,
            existing.id,
          ]
        );
        void this.emitLeadAssignedNotification({
          affiliateId: input.affiliateId,
          brandId: input.brandId,
          leadId: existing.id,
          customerName: name,
          productName: input.productName,
          isUpdate: true,
        });
        return existing.id;
      }
    }

    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_leads
       (id, owner_user_id, brand_id, affiliate_id, customer_name, phone, email,
        source_type, cta_type, product_name, product_id, order_id, message,
        affiliate_status, internal_ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.ownerUserId,
        input.brandId,
        input.affiliateId,
        name,
        phone,
        email,
        sourceType,
        input.ctaType || null,
        input.productName || null,
        input.productId || null,
        input.orderId || null,
        input.message || null,
        status,
        input.internalRefId || null,
      ]
    );

    void this.emitLeadAssignedNotification({
      affiliateId: input.affiliateId,
      brandId: input.brandId,
      leadId: id,
      customerName: name,
      productName: input.productName,
      isUpdate: false,
    });

    return id;
  }

  private async emitLeadAssignedNotification(input: {
    affiliateId: string;
    brandId: string;
    leadId: string;
    customerName: string;
    productName?: string | null;
    isUpdate: boolean;
  }): Promise<void> {
    if (input.isUpdate) return;
    try {
      const affiliate = await queryOne<{ affiliate_user_id: string }>(
        `SELECT affiliate_user_id FROM affiliates WHERE id = ? LIMIT 1`,
        [input.affiliateId],
      );
      const userId = String(affiliate?.affiliate_user_id || "").trim();
      if (!userId) return;

      const { emitPlatformEventToUser } = await import("./notificationHub");
      const productSuffix = input.productName ? ` — ${input.productName}` : "";
      await emitPlatformEventToUser("affiliate.lead.assigned", userId, {
        organization_id: input.brandId,
        role: "affiliate",
        entity_type: "affiliate_lead",
        entity_id: input.leadId,
        deep_link: "/contatos",
        template_vars: {
          customer_name: input.customerName,
          product_suffix: productSuffix,
          brand_id: input.brandId,
        },
      });
    } catch {
      /* notificação não deve bloquear captura */
    }
  }

  async listAffiliateLeads(
    affiliateId: string,
    brandId: string,
    opts?: { status?: string; page?: number; limit?: number }
  ) {
    await ensureAffiliateSchema();
    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const clauses = ["affiliate_id = ?", "brand_id = ?"];
    const params: any[] = [affiliateId, brandId];
    const status = String(opts?.status || "").trim().toLowerCase();
    if (status && status !== "all") {
      clauses.push("affiliate_status = ?");
      params.push(status);
    }

    const totalRow = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_leads WHERE ${clauses.join(" AND ")}`,
      params
    );
    const rows = await query<any[]>(
      `SELECT id, customer_name, phone, email, source_type, cta_type, product_name,
              order_id, message, affiliate_status, affiliate_notes, created_at, updated_at
       FROM affiliate_leads
       WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const stats = await queryOne<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN affiliate_status = 'new' THEN 1 ELSE 0 END) AS new_count,
         SUM(CASE WHEN affiliate_status = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
         SUM(CASE WHEN affiliate_status = 'negotiating' THEN 1 ELSE 0 END) AS negotiating_count,
         SUM(CASE WHEN affiliate_status = 'converted' THEN 1 ELSE 0 END) AS converted_count,
         SUM(CASE WHEN affiliate_status = 'lost' THEN 1 ELSE 0 END) AS lost_count
       FROM affiliate_leads
       WHERE affiliate_id = ? AND brand_id = ?`,
      [affiliateId, brandId]
    );

    return {
      leads: (rows || []).map((row) => ({
        id: row.id,
        name: row.customer_name,
        phone: row.phone,
        email: row.email,
        source_type: row.source_type,
        cta_type: row.cta_type,
        product_name: row.product_name,
        has_order: !!row.order_id,
        message: row.message,
        status: row.affiliate_status,
        notes: row.affiliate_notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      page,
      limit,
      total: Number(totalRow?.total || 0),
      stats: {
        total: Number(stats?.total || 0),
        new: Number(stats?.new_count || 0),
        contacted: Number(stats?.contacted_count || 0),
        negotiating: Number(stats?.negotiating_count || 0),
        converted: Number(stats?.converted_count || 0),
        lost: Number(stats?.lost_count || 0),
      },
    };
  }

  async updateAffiliateLead(
    leadId: string,
    affiliateId: string,
    brandId: string,
    patch: { status?: string; notes?: string }
  ) {
    await ensureAffiliateSchema();
    const row = await queryOne<any>(
      `SELECT id FROM affiliate_leads WHERE id = ? AND affiliate_id = ? AND brand_id = ? LIMIT 1`,
      [leadId, affiliateId, brandId]
    );
    if (!row) throw new Error("Lead não encontrado");

    const allowedStatuses = new Set(["new", "contacted", "negotiating", "converted", "lost"]);
    const status = String(patch.status || "").trim().toLowerCase();
    const notes = patch.notes !== undefined ? String(patch.notes || "").trim() : undefined;

    const sets: string[] = ["updated_at = NOW()"];
    const params: any[] = [];
    if (status && allowedStatuses.has(status)) {
      sets.push("affiliate_status = ?");
      params.push(status);
    }
    if (notes !== undefined) {
      sets.push("affiliate_notes = ?");
      params.push(notes || null);
    }
    if (sets.length === 1) return row;

    params.push(leadId, affiliateId, brandId);
    await query(
      `UPDATE affiliate_leads SET ${sets.join(", ")} WHERE id = ? AND affiliate_id = ? AND brand_id = ?`,
      params
    );
    return queryOne<any>(
      `SELECT id, customer_name, phone, email, source_type, cta_type, product_name,
              order_id, message, affiliate_status, affiliate_notes, created_at, updated_at
       FROM affiliate_leads WHERE id = ? LIMIT 1`,
      [leadId]
    );
  }

  async resolveAffiliateByCode(brandId: string, code: string) {
    await ensureAffiliateSchema();
    return queryOne<AffiliateProfile>(
      `SELECT * FROM affiliates WHERE brand_id = ? AND LOWER(code) = LOWER(?) AND status = 'active' LIMIT 1`,
      [brandId, code]
    );
  }

  /**
   * Número público de WhatsApp do afiliado (catálogo / botões da loja).
   * Prioridade:
   * 1) Sessão WhatsApp da atribuição que iniciou o atendimento (prospect assignment aberta)
   * 2) Qualquer instância conectada do afiliado
   * 3) social_whatsapp / phone do perfil do afiliado
   * (fallback da loja fica no frontend/storefront)
   */
  async resolvePublicWhatsAppContact(affiliate: {
    id: string;
    affiliate_user_id?: string | null;
    phone?: string | null;
    social_whatsapp?: string | null;
    brand_id?: string | null;
    owner_user_id?: string | null;
  }): Promise<{
    phone: string | null;
    source: "assignment" | "instance" | "profile" | null;
    instance_id?: string | null;
  }> {
    const digits = (raw?: string | null) => {
      const d = String(raw || "").replace(/\D/g, "");
      return d.length >= 10 ? d : "";
    };

    const affiliateId = String(affiliate.id || "").trim();
    const affiliateUserId = String(affiliate.affiliate_user_id || "").trim();
    const brandId = String(affiliate.brand_id || "").trim();
    const ownerUserId = String(affiliate.owner_user_id || "").trim();

    // 1) Sessão que já iniciou atendimento (assignment aberta com instância conectada)
    if (affiliateId) {
      try {
        const assignment = await queryOne<{
          instance_id: string | null;
          instance_phone: string | null;
          instance_status: string | null;
        }>(
          `SELECT pa.instance_id,
                  wi.phone AS instance_phone,
                  wi.status AS instance_status
           FROM prospect_assignments pa
           LEFT JOIN whatsapp_instances wi ON wi.id = pa.instance_id
           WHERE pa.affiliate_id = ?
             AND pa.conversion_status = 'open'
             AND pa.assignment_status NOT IN ('lost', 'recycled')
             AND pa.instance_id IS NOT NULL
             AND wi.status = 'connected'
             AND wi.phone IS NOT NULL AND TRIM(wi.phone) <> ''
           ORDER BY COALESCE(pa.last_interaction_at, pa.updated_at, pa.created_at) DESC
           LIMIT 1`,
          [affiliateId]
        );
        const assignmentPhone = digits(assignment?.instance_phone);
        if (assignmentPhone) {
          return {
            phone: assignmentPhone,
            source: "assignment",
            instance_id: assignment?.instance_id ? String(assignment.instance_id) : null,
          };
        }
      } catch {
        // tabela pode não existir em ambientes antigos
      }
    }

    // 2) Qualquer número ativo (instância conectada) do afiliado
    if (affiliateUserId && ownerUserId) {
      try {
        const params: unknown[] = [ownerUserId, affiliateUserId];
        let brandClause = "";
        if (brandId) {
          brandClause = " AND wi.brand_id = ?";
          params.push(brandId);
        }
        const instance = await queryOne<{ id: string; phone: string | null }>(
          `SELECT wi.id, wi.phone
           FROM whatsapp_instances wi
           WHERE wi.created_by = ?
             AND wi.owner_type = 'affiliate'
             AND wi.owner_actor_id = ?
             AND wi.status = 'connected'
             AND wi.phone IS NOT NULL AND TRIM(wi.phone) <> ''
             ${brandClause}
           ORDER BY wi.last_connected_at DESC, wi.updated_at DESC, wi.created_at DESC
           LIMIT 1`,
          params
        );
        const instancePhone = digits(instance?.phone);
        if (instancePhone) {
          return {
            phone: instancePhone,
            source: "instance",
            instance_id: instance?.id ? String(instance.id) : null,
          };
        }
      } catch {
        // schema legado
      }
    }

    // 3) Perfil do afiliado (social_whatsapp preferencial, depois phone)
    const profilePhone = digits(affiliate.social_whatsapp) || digits(affiliate.phone);
    if (profilePhone) {
      return { phone: profilePhone, source: "profile", instance_id: null };
    }

    return { phone: null, source: null, instance_id: null };
  }

  async getProgramStats(ownerUserId: string, brandId: string) {
    await ensureAffiliateSchema();
    const config = await this.getOrCreateProgramConfig(ownerUserId, brandId);

    const affiliateAgg = await queryOne<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         COALESCE(SUM(total_clicks), 0) AS clicks,
         COALESCE(SUM(total_sales), 0) AS sales,
         COALESCE(SUM(total_commission), 0) AS commission_total
       FROM affiliates
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );

    const salesAgg = await queryOne<any>(
      `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(commission_amount), 0) AS commission_all,
         COALESCE(SUM(CASE WHEN commission_status = 'pending' THEN commission_amount ELSE 0 END), 0) AS commission_pending,
         COALESCE(SUM(CASE WHEN commission_status = 'approved' THEN commission_amount ELSE 0 END), 0) AS commission_approved,
         COALESCE(SUM(CASE WHEN commission_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count
       FROM affiliate_sales
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );

    const payoutsAgg = await queryOne<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END), 0) AS requested,
         COALESCE(SUM(CASE WHEN status = 'requested' THEN amount ELSE 0 END), 0) AS requested_amount
       FROM affiliate_payouts
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );

    const materialsCount = await queryOne<any>(
      `SELECT COUNT(*) AS total
       FROM affiliate_materials
       WHERE owner_user_id = ? AND brand_id = ? AND is_active = TRUE`,
      [ownerUserId, brandId]
    );

    const topAffiliates = await query<any[]>(
      `SELECT id, display_name, code, coupon_code, status, total_clicks, total_sales, total_commission
       FROM affiliates
       WHERE owner_user_id = ? AND brand_id = ?
       ORDER BY total_commission DESC, total_sales DESC
       LIMIT 5`,
      [ownerUserId, brandId]
    );

    return {
      program: config,
      affiliates_total: Number(affiliateAgg?.total || 0),
      affiliates_pending: Number(affiliateAgg?.pending || 0),
      affiliates_active: Number(affiliateAgg?.active || 0),
      total_clicks: Number(affiliateAgg?.clicks || 0),
      total_sales: Number(affiliateAgg?.sales || 0),
      commission_total: Number(affiliateAgg?.commission_total || 0),
      sales_count: Number(salesAgg?.total_sales || 0),
      commission_pending: Number(salesAgg?.commission_pending || 0),
      commission_approved: Number(salesAgg?.commission_approved || 0),
      commissions_pending_count: Number(salesAgg?.pending_count || 0),
      payouts_requested: Number(payoutsAgg?.requested || 0),
      payouts_requested_amount: Number(payoutsAgg?.requested_amount || 0),
      materials_count: Number(materialsCount?.total || 0),
      top_affiliates: topAffiliates,
    };
  }

  async listBrandSales(ownerUserId: string, brandId: string, limit = 50) {
    await ensureAffiliateSchema();
    return query<any[]>(
      `SELECT s.*, a.display_name, a.code, a.coupon_code
       FROM affiliate_sales s
       INNER JOIN affiliates a ON a.id = s.affiliate_id
       WHERE s.owner_user_id = ? AND s.brand_id = ?
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [ownerUserId, brandId, limit]
    );
  }

  async approveSaleCommission(saleId: string, ownerUserId: string): Promise<void> {
    await ensureAffiliateSchema();
    const row = await queryOne<any>(
      `SELECT id, commission_status, commission_amount, brand_id, affiliate_id
       FROM affiliate_sales WHERE id = ? AND owner_user_id = ? LIMIT 1`,
      [saleId, ownerUserId]
    );
    if (!row) throw new Error("Venda não encontrada");
    if (String(row.commission_status) === "approved") return;

    await query(
      `UPDATE affiliate_sales SET commission_status = 'approved', updated_at = NOW() WHERE id = ?`,
      [saleId]
    );

    void this.emitAffiliateFinanceEvent("affiliate.commission.approved", {
      brandId: String(row.brand_id),
      affiliateId: String(row.affiliate_id),
      amount: Number(row.commission_amount || 0),
      entityId: String(row.id),
    });
  }

  async approvePendingCommissionsForPaidOrders(ownerUserId: string, brandId: string): Promise<number> {
    await ensureAffiliateSchema();
    const rows = await query<any[]>(
      `SELECT s.id
       FROM affiliate_sales s
       WHERE s.owner_user_id = ? AND s.brand_id = ?
         AND s.commission_status = 'pending'
         AND s.order_status IN ('paid', 'pago', 'entregue', 'delivered', 'em_preparacao', 'em_entrega')`,
      [ownerUserId, brandId]
    );
    for (const row of rows) {
      await this.approveSaleCommission(String(row.id), ownerUserId);
    }
    return rows.length;
  }

  async syncOrderCommissionStatus(orderId: string, businessStatus: string): Promise<void> {
    await ensureAffiliateSchema();
    const sale = await queryOne<any>(
      `SELECT id, commission_status, order_status FROM affiliate_sales WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (!sale) return;

    const paidLike = ["pago", "paid", "em_preparacao", "em_entrega", "entregue", "delivered"].includes(
      String(businessStatus || "").toLowerCase()
    );
    const cancelled = ["cancelado", "cancelled", "canceled"].includes(String(businessStatus || "").toLowerCase());

    if (cancelled) {
      await query(
        `UPDATE affiliate_sales SET order_status = 'cancelled', commission_status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [sale.id]
      );
      return;
    }

    const orderStatus = paidLike ? "paid" : "pending";
    const commissionStatus = paidLike && String(sale.commission_status) === "pending" ? "approved" : sale.commission_status;

    await query(
      `UPDATE affiliate_sales SET order_status = ?, commission_status = ?, updated_at = NOW() WHERE id = ?`,
      [orderStatus, commissionStatus, sale.id]
    );
  }
}

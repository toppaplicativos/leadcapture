/**
 * Clube de Clientes Assinantes — configuração por organização (brand)
 * e membros com vínculo permanente ao afiliado indicador (comissões).
 */
import { randomUUID } from "crypto";
import { getPool, query, queryOne } from "../config/database";
import { logger } from "../utils/logger";

export type ClubDiscountType = "percentage" | "fixed";
export type ClubBillingFrequency = "none" | "monthly" | "quarterly" | "yearly";
export type ClubMemberStatus = "active" | "paused" | "cancelled";

export interface ClubBenefitItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

export interface ClubBannerConfig {
  title: string;
  subtitle: string;
  cta_label: string;
  highlight: string;
}

export interface ClubDiscountConfig {
  enabled: boolean;
  type: ClubDiscountType;
  value: number;
  max_cap: number | null;
  min_subtotal: number | null;
}

export interface ClubShippingConfig {
  free_shipping: boolean;
  free_shipping_above: number | null;
  discount_type: "percentage" | "fixed" | "free" | null;
  discount_value: number | null;
  note: string;
}

export interface ClubFrequencyConfig {
  billing: ClubBillingFrequency;
  membership_fee: number | null;
  renewal_reminder_days: number;
  label: string;
}

export interface ClubAffiliateConfig {
  track_referral: boolean;
  /** Atribui compras futuras do membro ao afiliado indicador */
  attribute_lifetime: boolean;
  /** Bônus percentual extra de comissão em compras do clube (ex: 2 = +2pp) */
  commission_boost_pct: number | null;
  note: string;
}

export interface ClubFormFieldsConfig {
  require_email: boolean;
  require_cpf: boolean;
  require_address: boolean;
}

export interface SubscriberClubConfig {
  id: string;
  brand_id: string;
  enabled: boolean;
  name: string;
  tagline: string;
  description: string;
  banner: ClubBannerConfig;
  benefits: ClubBenefitItem[];
  discount: ClubDiscountConfig;
  shipping: ClubShippingConfig;
  frequency: ClubFrequencyConfig;
  guarantees: ClubBenefitItem[];
  special_conditions: ClubBenefitItem[];
  affiliate: ClubAffiliateConfig;
  form_fields: ClubFormFieldsConfig;
  created_at: string;
  updated_at: string;
}

export interface ClubMember {
  id: string;
  brand_id: string;
  name: string;
  phone: string;
  phone_digits: string;
  email: string | null;
  cpf: string | null;
  address: string | null;
  affiliate_id: string | null;
  affiliate_ref: string | null;
  affiliate_name: string | null;
  status: ClubMemberStatus;
  source: string | null;
  notes: string | null;
  joined_at: string;
  cancelled_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PublicClubView {
  enabled: boolean;
  name: string;
  tagline: string;
  description: string;
  banner: ClubBannerConfig;
  benefits: ClubBenefitItem[];
  discount: Pick<ClubDiscountConfig, "enabled" | "type" | "value" | "max_cap" | "min_subtotal">;
  shipping: {
    free_shipping: boolean;
    free_shipping_above: number | null;
    note: string;
  };
  frequency: {
    billing: ClubBillingFrequency;
    membership_fee: number | null;
    label: string;
  };
  guarantees: ClubBenefitItem[];
  special_conditions: ClubBenefitItem[];
  form_fields: ClubFormFieldsConfig;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** null / undefined / "" → null; else non-negative number */
function optionalMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  return Math.max(0, toNumber(v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function digitsOnly(v: unknown): string {
  return String(v || "").replace(/\D/g, "");
}

function parseJsonArray(raw: unknown): ClubBenefitItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item: any, i: number) => ({
        id: String(item?.id || `item_${i}`),
        title: String(item?.title || "").trim(),
        description: item?.description != null ? String(item.description) : undefined,
        icon: item?.icon != null ? String(item.icon) : undefined,
      }))
      .filter((x) => x.title);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseJsonArray(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject<T extends Record<string, any>>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...fallback, ...(raw as object) } as T;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return { ...fallback, ...parsed } as T;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function newItemId(prefix = "b"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultClubConfig(brandId: string): SubscriberClubConfig {
  const now = new Date().toISOString();
  return {
    id: "",
    brand_id: brandId,
    enabled: false,
    name: "Clube de Assinantes",
    tagline: "Vantagens exclusivas para quem faz parte",
    description:
      "Entre no clube e garanta descontos, frete especial, garantias estendidas e condições pensadas para clientes fiéis.",
    banner: {
      title: "Entre no Clube e economize em toda compra",
      subtitle: "Descontos exclusivos, frete especial e benefícios só para assinantes.",
      cta_label: "Quero fazer parte",
      highlight: "Exclusivo",
    },
    benefits: [
      { id: newItemId(), title: "Desconto em todas as compras", description: "Preço de membro em todo o catálogo" },
      { id: newItemId(), title: "Frete especial", description: "Condições privilegiadas de entrega" },
      { id: newItemId(), title: "Atendimento prioritário", description: "Fila preferencial no suporte" },
    ],
    discount: {
      enabled: true,
      type: "percentage",
      value: 10,
      max_cap: null,
      min_subtotal: null,
    },
    shipping: {
      free_shipping: false,
      free_shipping_above: 150,
      discount_type: "percentage",
      discount_value: 50,
      note: "Frete com desconto para membros do clube",
    },
    frequency: {
      billing: "none",
      membership_fee: null,
      renewal_reminder_days: 7,
      label: "Sem mensalidade — benefícios em cada compra",
    },
    guarantees: [
      { id: newItemId("g"), title: "Satisfação garantida", description: "Troca facilitada para membros" },
      { id: newItemId("g"), title: "Qualidade assegurada", description: "Produtos com garantia estendida" },
    ],
    special_conditions: [
      { id: newItemId("c"), title: "Ofertas antecipadas", description: "Acesso a promoções antes do público" },
    ],
    affiliate: {
      track_referral: true,
      attribute_lifetime: true,
      commission_boost_pct: null,
      note: "Compras do membro geram comissão para o afiliado que indicou o cadastro no clube.",
    },
    form_fields: {
      require_email: true,
      require_cpf: false,
      require_address: false,
    },
    created_at: now,
    updated_at: now,
  };
}

function sanitizeBanner(raw: unknown): ClubBannerConfig {
  const d = defaultClubConfig("").banner;
  const o = parseJsonObject(raw, d);
  return {
    title: String(o.title || d.title).trim() || d.title,
    subtitle: String(o.subtitle || d.subtitle).trim() || d.subtitle,
    cta_label: String(o.cta_label || d.cta_label).trim() || d.cta_label,
    highlight: String(o.highlight || d.highlight).trim() || d.highlight,
  };
}

function sanitizeDiscount(raw: unknown): ClubDiscountConfig {
  const d = defaultClubConfig("").discount;
  const o = parseJsonObject(raw, d) as unknown as Record<string, unknown>;
  return {
    enabled: o.enabled !== false,
    type: o.type === "fixed" ? "fixed" : "percentage",
    value: Math.max(0, toNumber(o.value, d.value)),
    max_cap: optionalMoney(o.max_cap),
    min_subtotal: optionalMoney(o.min_subtotal),
  };
}

function sanitizeShipping(raw: unknown): ClubShippingConfig {
  const d = defaultClubConfig("").shipping;
  const o = parseJsonObject(raw, d) as unknown as Record<string, unknown>;
  const dt = o.discount_type;
  return {
    free_shipping: o.free_shipping === true,
    free_shipping_above: optionalMoney(o.free_shipping_above),
    discount_type:
      dt === "percentage" || dt === "fixed" || dt === "free" ? dt : null,
    discount_value: optionalMoney(o.discount_value),
    note: String(o.note || d.note || "").trim(),
  };
}

function sanitizeFrequency(raw: unknown): ClubFrequencyConfig {
  const d = defaultClubConfig("").frequency;
  const o = parseJsonObject(raw, d) as unknown as Record<string, unknown>;
  const billing = ["none", "monthly", "quarterly", "yearly"].includes(String(o.billing))
    ? (String(o.billing) as ClubBillingFrequency)
    : "none";
  return {
    billing,
    membership_fee: optionalMoney(o.membership_fee),
    renewal_reminder_days: Math.max(0, Math.min(90, toNumber(o.renewal_reminder_days, 7))),
    label: String(o.label || d.label).trim() || d.label,
  };
}

function sanitizeAffiliate(raw: unknown): ClubAffiliateConfig {
  const d = defaultClubConfig("").affiliate;
  const o = parseJsonObject(raw, d) as unknown as Record<string, unknown>;
  const boost = optionalMoney(o.commission_boost_pct);
  return {
    track_referral: o.track_referral !== false,
    attribute_lifetime: o.attribute_lifetime !== false,
    commission_boost_pct: boost == null ? null : Math.min(50, boost),
    note: String(o.note || d.note || "").trim(),
  };
}

function sanitizeFormFields(raw: unknown): ClubFormFieldsConfig {
  const d = defaultClubConfig("").form_fields;
  const o = parseJsonObject(raw, d);
  return {
    require_email: o.require_email !== false,
    require_cpf: o.require_cpf === true,
    require_address: o.require_address === true,
  };
}

class SubscriberClubService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) {
      await this.schemaPromise;
      return;
    }

    this.schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS subscriber_club_config (
          id VARCHAR(36) PRIMARY KEY,
          brand_id VARCHAR(36) NOT NULL UNIQUE,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          name VARCHAR(120) NOT NULL DEFAULT 'Clube de Assinantes',
          tagline VARCHAR(255) NULL,
          description TEXT NULL,
          banner_json JSONB NOT NULL DEFAULT '{}',
          benefits_json JSONB NOT NULL DEFAULT '[]',
          discount_json JSONB NOT NULL DEFAULT '{}',
          shipping_json JSONB NOT NULL DEFAULT '{}',
          frequency_json JSONB NOT NULL DEFAULT '{}',
          guarantees_json JSONB NOT NULL DEFAULT '[]',
          special_conditions_json JSONB NOT NULL DEFAULT '[]',
          affiliate_json JSONB NOT NULL DEFAULT '{}',
          form_fields_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS subscriber_club_members (
          id VARCHAR(36) PRIMARY KEY,
          brand_id VARCHAR(36) NOT NULL,
          name VARCHAR(180) NOT NULL,
          phone VARCHAR(40) NOT NULL,
          phone_digits VARCHAR(20) NOT NULL,
          email VARCHAR(180) NULL,
          cpf VARCHAR(20) NULL,
          address TEXT NULL,
          affiliate_id VARCHAR(36) NULL,
          affiliate_ref VARCHAR(80) NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          source VARCHAR(60) NULL,
          notes TEXT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          cancelled_at TIMESTAMP NULL,
          metadata_json JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_brand_phone
         ON subscriber_club_members (brand_id, phone_digits)`
      ).catch(() => {});
      await query(
        `CREATE INDEX IF NOT EXISTS idx_club_members_brand_status
         ON subscriber_club_members (brand_id, status, joined_at DESC)`
      ).catch(() => {});
      await query(
        `CREATE INDEX IF NOT EXISTS idx_club_members_affiliate
         ON subscriber_club_members (brand_id, affiliate_id)
         WHERE affiliate_id IS NOT NULL`
      ).catch(() => {});

      this.schemaReady = true;
    })()
      .catch((err) => {
        logger.error(err, "[subscriberClub.ensureSchema]");
        throw err;
      })
      .finally(() => {
        this.schemaPromise = null;
      });

    await this.schemaPromise;
  }

  private mapConfigRow(row: any): SubscriberClubConfig {
    const brandId = String(row.brand_id || "");
    const defaults = defaultClubConfig(brandId);
    return {
      id: String(row.id || ""),
      brand_id: brandId,
      enabled: row.enabled === true || row.enabled === 1 || row.enabled === "t",
      name: String(row.name || defaults.name).trim() || defaults.name,
      tagline: String(row.tagline || defaults.tagline || "").trim(),
      description: String(row.description || defaults.description || "").trim(),
      banner: sanitizeBanner(row.banner_json),
      benefits: parseJsonArray(row.benefits_json).length
        ? parseJsonArray(row.benefits_json)
        : defaults.benefits,
      discount: sanitizeDiscount(row.discount_json),
      shipping: sanitizeShipping(row.shipping_json),
      frequency: sanitizeFrequency(row.frequency_json),
      guarantees: parseJsonArray(row.guarantees_json),
      special_conditions: parseJsonArray(row.special_conditions_json),
      affiliate: sanitizeAffiliate(row.affiliate_json),
      form_fields: sanitizeFormFields(row.form_fields_json),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : defaults.created_at,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : defaults.updated_at,
    };
  }

  private mapMemberRow(row: any): ClubMember {
    return {
      id: String(row.id),
      brand_id: String(row.brand_id),
      name: String(row.name || ""),
      phone: String(row.phone || ""),
      phone_digits: String(row.phone_digits || digitsOnly(row.phone)),
      email: row.email != null ? String(row.email) : null,
      cpf: row.cpf != null ? String(row.cpf) : null,
      address: row.address != null ? String(row.address) : null,
      affiliate_id: row.affiliate_id != null ? String(row.affiliate_id) : null,
      affiliate_ref: row.affiliate_ref != null ? String(row.affiliate_ref) : null,
      affiliate_name: row.affiliate_name != null ? String(row.affiliate_name) : null,
      status: (["active", "paused", "cancelled"].includes(String(row.status))
        ? String(row.status)
        : "active") as ClubMemberStatus,
      source: row.source != null ? String(row.source) : null,
      notes: row.notes != null ? String(row.notes) : null,
      joined_at: row.joined_at ? new Date(row.joined_at).toISOString() : new Date().toISOString(),
      cancelled_at: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
      metadata: parseJsonObject(row.metadata_json, {}),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  toPublicView(config: SubscriberClubConfig): PublicClubView {
    return {
      enabled: config.enabled,
      name: config.name,
      tagline: config.tagline,
      description: config.description,
      banner: config.banner,
      benefits: config.benefits,
      discount: {
        enabled: config.discount.enabled,
        type: config.discount.type,
        value: config.discount.value,
        max_cap: config.discount.max_cap,
        min_subtotal: config.discount.min_subtotal,
      },
      shipping: {
        free_shipping: config.shipping.free_shipping,
        free_shipping_above: config.shipping.free_shipping_above,
        note: config.shipping.note,
      },
      frequency: {
        billing: config.frequency.billing,
        membership_fee: config.frequency.membership_fee,
        label: config.frequency.label,
      },
      guarantees: config.guarantees,
      special_conditions: config.special_conditions,
      form_fields: config.form_fields,
    };
  }

  async getConfig(brandId: string): Promise<SubscriberClubConfig> {
    await this.ensureSchema();
    const id = String(brandId || "").trim();
    if (!id) return defaultClubConfig("");
    const row = await queryOne<any>(
      `SELECT * FROM subscriber_club_config WHERE brand_id = ? LIMIT 1`,
      [id]
    );
    if (!row) return defaultClubConfig(id);
    return this.mapConfigRow(row);
  }

  async upsertConfig(
    brandId: string,
    patch: Partial<SubscriberClubConfig> & Record<string, any>
  ): Promise<SubscriberClubConfig> {
    await this.ensureSchema();
    const id = String(brandId || "").trim();
    if (!id) throw new Error("brand_id obrigatório");

    const current = await this.getConfig(id);
    const next: SubscriberClubConfig = {
      ...current,
      brand_id: id,
      enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
      name: patch.name !== undefined ? String(patch.name || "").trim() || current.name : current.name,
      tagline: patch.tagline !== undefined ? String(patch.tagline || "").trim() : current.tagline,
      description:
        patch.description !== undefined ? String(patch.description || "").trim() : current.description,
      banner: patch.banner !== undefined ? sanitizeBanner(patch.banner) : current.banner,
      benefits:
        patch.benefits !== undefined
          ? parseJsonArray(patch.benefits)
          : current.benefits,
      discount: patch.discount !== undefined ? sanitizeDiscount(patch.discount) : current.discount,
      shipping: patch.shipping !== undefined ? sanitizeShipping(patch.shipping) : current.shipping,
      frequency: patch.frequency !== undefined ? sanitizeFrequency(patch.frequency) : current.frequency,
      guarantees:
        patch.guarantees !== undefined ? parseJsonArray(patch.guarantees) : current.guarantees,
      special_conditions:
        patch.special_conditions !== undefined
          ? parseJsonArray(patch.special_conditions)
          : current.special_conditions,
      affiliate: patch.affiliate !== undefined ? sanitizeAffiliate(patch.affiliate) : current.affiliate,
      form_fields:
        patch.form_fields !== undefined ? sanitizeFormFields(patch.form_fields) : current.form_fields,
      updated_at: new Date().toISOString(),
    };

    if (!next.id) {
      next.id = randomUUID();
      await query(
        `INSERT INTO subscriber_club_config (
          id, brand_id, enabled, name, tagline, description,
          banner_json, benefits_json, discount_json, shipping_json, frequency_json,
          guarantees_json, special_conditions_json, affiliate_json, form_fields_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          next.id,
          id,
          next.enabled,
          next.name,
          next.tagline || null,
          next.description || null,
          JSON.stringify(next.banner),
          JSON.stringify(next.benefits),
          JSON.stringify(next.discount),
          JSON.stringify(next.shipping),
          JSON.stringify(next.frequency),
          JSON.stringify(next.guarantees),
          JSON.stringify(next.special_conditions),
          JSON.stringify(next.affiliate),
          JSON.stringify(next.form_fields),
        ]
      );
    } else {
      await query(
        `UPDATE subscriber_club_config SET
          enabled = ?, name = ?, tagline = ?, description = ?,
          banner_json = ?::jsonb, benefits_json = ?::jsonb, discount_json = ?::jsonb,
          shipping_json = ?::jsonb, frequency_json = ?::jsonb,
          guarantees_json = ?::jsonb, special_conditions_json = ?::jsonb,
          affiliate_json = ?::jsonb, form_fields_json = ?::jsonb,
          updated_at = CURRENT_TIMESTAMP
         WHERE brand_id = ?`,
        [
          next.enabled,
          next.name,
          next.tagline || null,
          next.description || null,
          JSON.stringify(next.banner),
          JSON.stringify(next.benefits),
          JSON.stringify(next.discount),
          JSON.stringify(next.shipping),
          JSON.stringify(next.frequency),
          JSON.stringify(next.guarantees),
          JSON.stringify(next.special_conditions),
          JSON.stringify(next.affiliate),
          JSON.stringify(next.form_fields),
          id,
        ]
      );
    }

    return this.getConfig(id);
  }

  async listMembers(
    brandId: string,
    opts?: { status?: string; search?: string; limit?: number; offset?: number }
  ): Promise<{ members: ClubMember[]; total: number }> {
    await this.ensureSchema();
    const id = String(brandId || "").trim();
    if (!id) return { members: [], total: 0 };

    const limit = Math.min(200, Math.max(1, Number(opts?.limit) || 50));
    const offset = Math.max(0, Number(opts?.offset) || 0);
    const status = String(opts?.status || "").trim();
    const search = String(opts?.search || "").trim();

    const where: string[] = ["m.brand_id = ?"];
    const args: any[] = [id];

    if (status && status !== "all") {
      where.push("m.status = ?");
      args.push(status);
    }
    if (search) {
      where.push(
        `(m.name ILIKE ? OR m.phone ILIKE ? OR m.email ILIKE ? OR m.phone_digits ILIKE ?)`
      );
      const like = `%${search}%`;
      args.push(like, like, like, `%${digitsOnly(search)}%`);
    }

    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<any>(
      `SELECT COUNT(*)::int AS n FROM subscriber_club_members m WHERE ${whereSql}`,
      args
    );
    const total = Number(totalRow?.n || 0);

    const rows = await query<any[]>(
      `SELECT m.*, a.display_name AS affiliate_name
         FROM subscriber_club_members m
         LEFT JOIN affiliates a ON a.id = m.affiliate_id
        WHERE ${whereSql}
        ORDER BY m.joined_at DESC
        LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    return {
      members: (rows || []).map((r) => this.mapMemberRow(r)),
      total,
    };
  }

  async getMemberStats(brandId: string): Promise<{
    total: number;
    active: number;
    with_affiliate: number;
    joined_7d: number;
  }> {
    await this.ensureSchema();
    const id = String(brandId || "").trim();
    if (!id) return { total: 0, active: 0, with_affiliate: 0, joined_7d: 0 };

    const row = await queryOne<any>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE affiliate_id IS NOT NULL)::int AS with_affiliate,
         COUNT(*) FILTER (WHERE joined_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS joined_7d
       FROM subscriber_club_members
       WHERE brand_id = ?`,
      [id]
    );
    return {
      total: Number(row?.total || 0),
      active: Number(row?.active || 0),
      with_affiliate: Number(row?.with_affiliate || 0),
      joined_7d: Number(row?.joined_7d || 0),
    };
  }

  async findActiveMemberByPhone(brandId: string, phone: string): Promise<ClubMember | null> {
    await this.ensureSchema();
    const digits = digitsOnly(phone);
    if (!brandId || digits.length < 10) return null;
    const row = await queryOne<any>(
      `SELECT m.*, a.display_name AS affiliate_name
         FROM subscriber_club_members m
         LEFT JOIN affiliates a ON a.id = m.affiliate_id
        WHERE m.brand_id = ? AND m.phone_digits = ? AND m.status = 'active'
        LIMIT 1`,
      [brandId, digits]
    );
    return row ? this.mapMemberRow(row) : null;
  }

  async joinPublic(input: {
    brandId: string;
    name: string;
    phone: string;
    email?: string | null;
    cpf?: string | null;
    address?: string | null;
    affiliateId?: string | null;
    affiliateRef?: string | null;
    source?: string | null;
    /** casa | comerciante | distribuidor | supermercado (+ aliases) */
    memberType?: string | null;
    /** Dados do estabelecimento / empresa (B2B) */
    restaurant?: Record<string, unknown> | null;
    business?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ member: ClubMember; created: boolean }> {
    await this.ensureSchema();
    const brandId = String(input.brandId || "").trim();
    if (!brandId) throw new Error("Organização inválida");

    const config = await this.getConfig(brandId);
    if (!config.enabled) throw new Error("O clube de assinantes não está habilitado.");

    const name = String(input.name || "").trim();
    const phone = String(input.phone || "").trim();
    const phoneDigits = digitsOnly(phone);
    if (!name) throw new Error("Nome é obrigatório");
    if (phoneDigits.length < 10) throw new Error("Telefone inválido");

    const email = input.email != null ? String(input.email).trim() : "";
    const cpf = input.cpf != null ? digitsOnly(input.cpf) : "";
    const address = input.address != null ? String(input.address).trim() : "";

    if (config.form_fields.require_email && !email) throw new Error("E-mail é obrigatório");
    if (config.form_fields.require_cpf && cpf.length < 11) throw new Error("CPF é obrigatório");
    if (config.form_fields.require_address && !address) throw new Error("Endereço é obrigatório");

    let affiliateId: string | null = null;
    let affiliateRef: string | null = null;

    if (config.affiliate.track_referral) {
      affiliateRef = input.affiliateRef ? String(input.affiliateRef).trim() || null : null;
      affiliateId = input.affiliateId ? String(input.affiliateId).trim() || null : null;

      if (!affiliateId && affiliateRef) {
        try {
          const { AffiliatesService } = await import("./affiliates");
          const affSvc = new AffiliatesService();
          const byCode = await affSvc.resolveAffiliateByCode(brandId, affiliateRef);
          if (byCode) affiliateId = String(byCode.id);
        } catch (e: any) {
          logger.warn(`[subscriberClub] affiliate resolve skipped: ${e?.message || e}`);
        }
      }

      if (affiliateId) {
        const exists = await queryOne<any>(
          `SELECT id FROM affiliates WHERE id = ? AND brand_id = ? AND status = 'active' LIMIT 1`,
          [affiliateId, brandId]
        );
        if (!exists) {
          affiliateId = null;
        }
      }
    }

    const existing = await queryOne<any>(
      `SELECT * FROM subscriber_club_members WHERE brand_id = ? AND phone_digits = ? LIMIT 1`,
      [brandId, phoneDigits]
    );

    const {
      normalizeClubMemberType,
      buildClubBusinessMeta,
      clubMemberClientTypeLabel,
    } = await import("./clubMemberTypes");

    const memberType = normalizeClubMemberType(input.memberType || "casa");
    const businessFromBody =
      input.business && typeof input.business === "object" ? input.business : null;

    const meta: Record<string, unknown> = {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      member_type: memberType,
      client_type_label: clubMemberClientTypeLabel(memberType),
    };

    const built = buildClubBusinessMeta(memberType, businessFromBody, input.restaurant);
    meta.client_type_label = built.client_type_label;
    if (built.business) meta.business = built.business;
    if (built.restaurant) meta.restaurant = built.restaurant;

    const metaJson = JSON.stringify(meta);

    if (existing) {
      const status = String(existing.status || "active");
      const prevMeta = parseJsonObject(existing.metadata_json, {});
      const mergedMeta = { ...prevMeta, ...meta };
      if (status === "active") {
        /* Atualiza metadata/tipo se o membro voltar pelo fluxo restaurante */
        await query(
          `UPDATE subscriber_club_members SET
            name = ?, email = COALESCE(?, email), address = COALESCE(?, address),
            affiliate_id = COALESCE(?, affiliate_id),
            affiliate_ref = COALESCE(?, affiliate_ref),
            metadata_json = ?::jsonb,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            name,
            email || null,
            address || null,
            affiliateId,
            affiliateRef,
            JSON.stringify(mergedMeta),
            existing.id,
          ]
        ).catch(() => undefined);
        const refreshed = await this.findActiveMemberByPhone(brandId, phoneDigits);
        return { member: refreshed || this.mapMemberRow(existing), created: false };
      }
      /* Reativa membro pausado/cancelado e atualiza dados */
      await query(
        `UPDATE subscriber_club_members SET
          name = ?, phone = ?, email = ?, cpf = ?, address = ?,
          affiliate_id = COALESCE(?, affiliate_id),
          affiliate_ref = COALESCE(?, affiliate_ref),
          metadata_json = ?::jsonb,
          status = 'active', cancelled_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name,
          phone,
          email || null,
          cpf || null,
          address || null,
          affiliateId,
          affiliateRef,
          metaJson,
          existing.id,
        ]
      );
      const refreshed = await this.findActiveMemberByPhone(brandId, phoneDigits);
      return { member: refreshed || this.mapMemberRow(existing), created: false };
    }

    const memberId = randomUUID();
    await query(
      `INSERT INTO subscriber_club_members (
        id, brand_id, name, phone, phone_digits, email, cpf, address,
        affiliate_id, affiliate_ref, status, source, joined_at, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, ?::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        memberId,
        brandId,
        name,
        phone,
        phoneDigits,
        email || null,
        cpf || null,
        address || null,
        affiliateId,
        affiliateRef,
        input.source || "catalog",
        metaJson,
      ]
    );

    const member = await this.findActiveMemberByPhone(brandId, phoneDigits);
    if (!member) throw new Error("Falha ao cadastrar membro");
    return { member, created: true };
  }

  async updateMemberStatus(
    brandId: string,
    memberId: string,
    status: ClubMemberStatus
  ): Promise<ClubMember | null> {
    await this.ensureSchema();
    if (!["active", "paused", "cancelled"].includes(status)) {
      throw new Error("Status inválido");
    }
    const cancelledAt = status === "cancelled" ? new Date().toISOString() : null;
    await query(
      `UPDATE subscriber_club_members SET
        status = ?, cancelled_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND brand_id = ?`,
      [status, cancelledAt, memberId, brandId]
    );
    const row = await queryOne<any>(
      `SELECT m.*, a.display_name AS affiliate_name
         FROM subscriber_club_members m
         LEFT JOIN affiliates a ON a.id = m.affiliate_id
        WHERE m.id = ? AND m.brand_id = ? LIMIT 1`,
      [memberId, brandId]
    );
    return row ? this.mapMemberRow(row) : null;
  }

  /**
   * Resolve se deve aplicar frete do clube (membro real ou simulação forçada)
   * e devolve o quote ajustado + metadados para o simulador do afiliado/admin.
   */
  async applyClubToFreightQuote(opts: {
    brandId: string;
    quote: {
      ok: boolean;
      fee: number | null;
      free_shipping: boolean;
      copy?: string | null;
      distance_km?: number | null;
      [key: string]: any;
    };
    cartTotal?: number | null;
    customerPhone?: string | null;
    forceAsMember?: boolean;
  }): Promise<{
    quote: typeof opts.quote;
    club: {
      club_applied: boolean;
      club_label: string | null;
      club_name: string | null;
      member_matched: boolean;
      forced: boolean;
      enabled: boolean;
    } | null;
  }> {
    const brandId = String(opts.brandId || "").trim();
    if (!brandId || !opts.quote?.ok) {
      return { quote: opts.quote, club: null };
    }

    const config = await this.getConfig(brandId);
    if (!config.enabled) {
      return {
        quote: opts.quote,
        club: {
          club_applied: false,
          club_label: null,
          club_name: config.name,
          member_matched: false,
          forced: false,
          enabled: false,
        },
      };
    }

    let memberMatched = false;
    if (opts.customerPhone) {
      const member = await this.findActiveMemberByPhone(brandId, opts.customerPhone);
      memberMatched = !!member;
    }

    const force = opts.forceAsMember === true;
    if (!memberMatched && !force) {
      return {
        quote: opts.quote,
        club: {
          club_applied: false,
          club_label: null,
          club_name: config.name,
          member_matched: false,
          forced: false,
          enabled: true,
        },
      };
    }

    const applied = this.applyShippingBenefits(config, opts.quote, opts.cartTotal ?? null);
    if (!applied.club_applied) {
      return {
        quote: opts.quote,
        club: {
          club_applied: false,
          club_label: null,
          club_name: config.name,
          member_matched: memberMatched,
          forced: force && !memberMatched,
          enabled: true,
        },
      };
    }

    const next = {
      ...opts.quote,
      fee: applied.fee,
      free_shipping: applied.free_shipping,
      copy: applied.copy,
    };

    return {
      quote: next,
      club: {
        club_applied: true,
        club_label: applied.club_label
          ? force && !memberMatched
            ? `${applied.club_label} (simulado)`
            : applied.club_label
          : null,
        club_name: config.name,
        member_matched: memberMatched,
        forced: force && !memberMatched,
        enabled: true,
      },
    };
  }

  /**
   * Aplica frete especial do clube sobre um quote já calculado.
   * Não altera distância/ETA — só fee / free_shipping / copy.
   */
  applyShippingBenefits(
    config: SubscriberClubConfig,
    quote: {
      ok: boolean;
      fee: number | null;
      free_shipping: boolean;
      copy?: string | null;
      distance_km?: number | null;
    },
    cartTotal?: number | null
  ): {
    fee: number | null;
    free_shipping: boolean;
    copy: string | null;
    club_applied: boolean;
    club_label: string | null;
  } {
    if (!config.enabled || !quote.ok) {
      return {
        fee: quote.fee,
        free_shipping: quote.free_shipping,
        copy: quote.copy || null,
        club_applied: false,
        club_label: null,
      };
    }

    const ship = config.shipping;
    let fee = quote.fee != null && Number.isFinite(Number(quote.fee)) ? Number(quote.fee) : null;
    let free = quote.free_shipping === true;
    let applied = false;
    let label: string | null = null;
    const cart = cartTotal != null && Number.isFinite(Number(cartTotal)) ? Number(cartTotal) : null;

    if (ship.free_shipping || ship.discount_type === "free") {
      fee = 0;
      free = true;
      applied = true;
      label = "Frete grátis (clube)";
    } else if (
      ship.free_shipping_above != null &&
      cart != null &&
      cart >= Number(ship.free_shipping_above)
    ) {
      fee = 0;
      free = true;
      applied = true;
      label = `Frete grátis clube (pedido ≥ R$ ${Number(ship.free_shipping_above).toFixed(0)})`;
    } else if (fee != null && fee > 0 && ship.discount_type === "percentage" && ship.discount_value != null) {
      const pct = Math.min(100, Math.max(0, Number(ship.discount_value)));
      fee = round2(fee * (1 - pct / 100));
      if (fee <= 0) {
        fee = 0;
        free = true;
      }
      applied = true;
      label = `${pct}% off no frete (clube)`;
    } else if (fee != null && fee > 0 && ship.discount_type === "fixed" && ship.discount_value != null) {
      const off = Math.max(0, Number(ship.discount_value));
      fee = round2(Math.max(0, fee - off));
      if (fee <= 0) {
        fee = 0;
        free = true;
      }
      applied = true;
      label = `R$ ${off.toFixed(2)} off no frete (clube)`;
    }

    let copy = quote.copy || null;
    if (applied) {
      const note = ship.note ? ` · ${ship.note}` : "";
      if (free) {
        copy = `Frete grátis para membros do ${config.name}${note}`;
      } else if (fee != null) {
        copy = `Frete especial do ${config.name}: R$ ${fee.toFixed(2).replace(".", ",")}${note}`;
      }
    }

    return { fee, free_shipping: free, copy, club_applied: applied, club_label: label };
  }

  /** Calcula desconto do clube para um subtotal. */
  computeDiscount(config: SubscriberClubConfig, subtotal: number): {
    eligible: boolean;
    discount_amount: number;
    reason?: string;
  } {
    if (!config.enabled || !config.discount.enabled) {
      return { eligible: false, discount_amount: 0, reason: "Clube sem desconto ativo" };
    }
    const sub = Math.max(0, toNumber(subtotal));
    if (config.discount.min_subtotal != null && sub < config.discount.min_subtotal) {
      return {
        eligible: false,
        discount_amount: 0,
        reason: `Pedido mínimo de R$ ${config.discount.min_subtotal.toFixed(2)}`,
      };
    }
    let amount = 0;
    if (config.discount.type === "fixed") {
      amount = Math.min(config.discount.value, sub);
    } else {
      amount = sub * (config.discount.value / 100);
      if (config.discount.max_cap != null) {
        amount = Math.min(amount, config.discount.max_cap);
      }
    }
    amount = round2(Math.max(0, Math.min(amount, sub)));
    return { eligible: amount > 0, discount_amount: amount };
  }

  /**
   * Resolve afiliado para comissão em pedido: prioriza membro do clube
   * (lifetime) e depois ref/id da sessão.
   */
  async resolveOrderAffiliate(input: {
    brandId: string;
    customerPhone?: string | null;
    affiliateId?: string | null;
    affiliateRef?: string | null;
  }): Promise<{
    affiliateId: string | null;
    source: "club_member" | "session" | null;
    memberId: string | null;
    commissionBoostPct: number | null;
  }> {
    const brandId = String(input.brandId || "").trim();
    if (!brandId) {
      return { affiliateId: null, source: null, memberId: null, commissionBoostPct: null };
    }

    const config = await this.getConfig(brandId);
    if (!config.enabled) {
      return { affiliateId: null, source: null, memberId: null, commissionBoostPct: null };
    }

    if (config.affiliate.attribute_lifetime && input.customerPhone) {
      const member = await this.findActiveMemberByPhone(brandId, input.customerPhone);
      if (member?.affiliate_id) {
        return {
          affiliateId: member.affiliate_id,
          source: "club_member",
          memberId: member.id,
          commissionBoostPct: config.affiliate.commission_boost_pct,
        };
      }
      if (member) {
        return {
          affiliateId: null,
          source: "club_member",
          memberId: member.id,
          commissionBoostPct: config.affiliate.commission_boost_pct,
        };
      }
    }

    let affiliateId = input.affiliateId ? String(input.affiliateId).trim() : "";
    const affiliateRef = input.affiliateRef ? String(input.affiliateRef).trim() : "";
    if (!affiliateId && affiliateRef) {
      try {
        const { AffiliatesService } = await import("./affiliates");
        const affSvc = new AffiliatesService();
        const byCode = await affSvc.resolveAffiliateByCode(brandId, affiliateRef);
        if (byCode) affiliateId = String(byCode.id);
      } catch {
        /* ignore */
      }
    }

    return {
      affiliateId: affiliateId || null,
      source: affiliateId ? "session" : null,
      memberId: null,
      commissionBoostPct: null,
    };
  }
}

export const subscriberClubService = new SubscriberClubService();

/**
 * Domínios adicionais de rastreio de afiliados (sites institucionais, blogs, landing).
 * Qualquer organização pode cadastrar hosts externos que usam o pixel/tracker LC.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";

export type TrackingDomainRow = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  domain: string;
  label: string;
  path_template: string;
  store_handoff_url: string | null;
  is_active: boolean | number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

let schemaReady = false;

export function normalizeTrackingHost(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");
}

export function buildAffiliateSupportUrl(input: {
  domain: string;
  pathTemplate?: string | null;
  code: string;
  couponCode?: string | null;
}): string {
  const host = normalizeTrackingHost(input.domain);
  if (!host) return "";
  const code = String(input.code || "").trim();
  const coupon = String(input.couponCode || "").trim().toUpperCase();
  let path = String(input.pathTemplate || "/?ref={{code}}&cupom={{coupon}}").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path
    .replace(/\{\{\s*code\s*\}\}/gi, encodeURIComponent(code))
    .replace(/\{\{\s*ref\s*\}\}/gi, encodeURIComponent(code))
    .replace(/\{\{\s*coupon\s*\}\}/gi, encodeURIComponent(coupon))
    .replace(/\{\{\s*cupom\s*\}\}/gi, encodeURIComponent(coupon));
  // Remove só cupom VAZIO (ex.: &cupom= no fim). Não tocar em &cupom=VALOR.
  if (!coupon) {
    path = path
      .replace(/([?&])cupom=(?=&|$)/gi, "$1")
      .replace(/[?&]$/, "")
      .replace(/\?&/, "?");
  }
  if (!path.includes("?") && code) {
    path = `/?ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`;
  }
  return `https://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

export class AffiliateTrackingDomainsService {
  async ensureSchema(): Promise<void> {
    if (schemaReady) return;

    // Postgres: UNIQUE sem KEY; MySQL legado usava UNIQUE KEY — ambos aceitam UNIQUE(...)
    await query(`
      CREATE TABLE IF NOT EXISTS affiliate_tracking_domains (
        id VARCHAR(36) PRIMARY KEY,
        owner_user_id VARCHAR(36) NOT NULL,
        brand_id VARCHAR(36) NOT NULL,
        domain VARCHAR(190) NOT NULL,
        label VARCHAR(120) NOT NULL,
        path_template VARCHAR(500) NOT NULL DEFAULT '/?ref={{code}}&cupom={{coupon}}',
        store_handoff_url VARCHAR(500) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Vários paths no mesmo host (home, landing restaurantes, etc.)
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_aff_track_domain_path
       ON affiliate_tracking_domains (brand_id, domain, path_template)`
    ).catch(async () => {
      await query(
        `ALTER TABLE affiliate_tracking_domains
         ADD UNIQUE KEY uq_aff_track_domain_path (brand_id, domain, path_template)`
      ).catch(() => undefined);
    });

    await query(
      `ALTER TABLE affiliate_clicks ADD COLUMN source_domain VARCHAR(190) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE affiliate_clicks ADD COLUMN source_host VARCHAR(190) NULL`
    ).catch(() => undefined);

    schemaReady = true;
  }

  async list(ownerUserId: string, brandId: string, opts?: { activeOnly?: boolean }): Promise<TrackingDomainRow[]> {
    await this.ensureSchema();
    const activeOnly = !!opts?.activeOnly;
    const rows = await query<TrackingDomainRow[]>(
      `SELECT * FROM affiliate_tracking_domains
       WHERE brand_id = ? AND owner_user_id = ?
       ${activeOnly ? "AND is_active = TRUE" : ""}
       ORDER BY sort_order ASC, label ASC`,
      [brandId, ownerUserId]
    );
    return Array.isArray(rows) ? rows : [];
  }

  async listActiveByBrand(brandId: string): Promise<TrackingDomainRow[]> {
    await this.ensureSchema();
    const rows = await query<TrackingDomainRow[]>(
      `SELECT * FROM affiliate_tracking_domains
       WHERE brand_id = ? AND is_active = TRUE
       ORDER BY sort_order ASC, label ASC`,
      [brandId]
    );
    return Array.isArray(rows) ? rows : [];
  }

  async isAllowedHost(brandId: string, hostRaw: string): Promise<boolean> {
    const host = normalizeTrackingHost(hostRaw);
    if (!host) return false;

    // Domínio primário da loja (storefront) sempre permitido
    const store = await queryOne<{ domain: string | null }>(
      `SELECT d.domain
       FROM storefront_stores s
       LEFT JOIN storefront_domains d
         ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
       WHERE s.brand_id = ? AND s.status = 'active'
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [brandId]
    ).catch(() => null);
    if (store?.domain && normalizeTrackingHost(store.domain) === host) return true;

    await this.ensureSchema();
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM affiliate_tracking_domains
       WHERE brand_id = ? AND is_active = TRUE AND domain = ?
       LIMIT 1`,
      [brandId, host]
    );
    return !!row?.id;
  }

  async create(
    ownerUserId: string,
    brandId: string,
    input: {
      domain: string;
      label?: string;
      path_template?: string;
      store_handoff_url?: string | null;
      is_active?: boolean;
      sort_order?: number;
    }
  ): Promise<TrackingDomainRow> {
    await this.ensureSchema();
    const domain = normalizeTrackingHost(input.domain);
    if (!domain || domain.length < 3) {
      throw new Error("Domínio inválido. Use o host sem https:// (ex.: alhopronto.com)");
    }
    const label = String(input.label || domain).trim().slice(0, 120) || domain;
    const pathTemplate =
      String(input.path_template || "/?ref={{code}}&cupom={{coupon}}").trim().slice(0, 500) ||
      "/?ref={{code}}&cupom={{coupon}}";
    const handoff = input.store_handoff_url
      ? String(input.store_handoff_url).trim().slice(0, 500) || null
      : null;
    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_tracking_domains
       (id, owner_user_id, brand_id, domain, label, path_template, store_handoff_url, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerUserId,
        brandId,
        domain,
        label,
        pathTemplate,
        handoff,
        input.is_active === false ? false : true,
        Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
      ]
    );
    const row = await queryOne<TrackingDomainRow>(
      `SELECT * FROM affiliate_tracking_domains WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) throw new Error("Falha ao criar domínio de rastreio");
    return row;
  }

  async update(
    ownerUserId: string,
    brandId: string,
    id: string,
    input: Partial<{
      domain: string;
      label: string;
      path_template: string;
      store_handoff_url: string | null;
      is_active: boolean;
      sort_order: number;
    }>
  ): Promise<TrackingDomainRow> {
    await this.ensureSchema();
    const existing = await queryOne<TrackingDomainRow>(
      `SELECT * FROM affiliate_tracking_domains WHERE id = ? AND brand_id = ? AND owner_user_id = ? LIMIT 1`,
      [id, brandId, ownerUserId]
    );
    if (!existing) throw new Error("Domínio não encontrado");

    const domain =
      input.domain !== undefined ? normalizeTrackingHost(input.domain) : existing.domain;
    if (!domain) throw new Error("Domínio inválido");

    await query(
      `UPDATE affiliate_tracking_domains
       SET domain = ?,
           label = ?,
           path_template = ?,
           store_handoff_url = ?,
           is_active = ?,
           sort_order = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        domain,
        input.label !== undefined ? String(input.label).trim().slice(0, 120) : existing.label,
        input.path_template !== undefined
          ? String(input.path_template).trim().slice(0, 500)
          : existing.path_template,
        input.store_handoff_url !== undefined
          ? input.store_handoff_url
            ? String(input.store_handoff_url).trim().slice(0, 500)
            : null
          : existing.store_handoff_url,
        input.is_active !== undefined ? !!input.is_active : !!existing.is_active,
        input.sort_order !== undefined ? Number(input.sort_order) || 0 : existing.sort_order,
        id,
      ]
    );

    const row = await queryOne<TrackingDomainRow>(
      `SELECT * FROM affiliate_tracking_domains WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) throw new Error("Falha ao atualizar domínio");
    return row;
  }

  async remove(ownerUserId: string, brandId: string, id: string): Promise<void> {
    await this.ensureSchema();
    await query(
      `DELETE FROM affiliate_tracking_domains WHERE id = ? AND brand_id = ? AND owner_user_id = ?`,
      [id, brandId, ownerUserId]
    );
  }

  /** Links prontos para o afiliado (um por domínio cadastrado). */
  buildAffiliateDomainLinks(input: {
    domains: TrackingDomainRow[];
    code: string;
    couponCode?: string | null;
  }): Array<{
    id: string;
    domain: string;
    label: string;
    url: string;
    path_template: string;
    store_handoff_url: string | null;
    /** URL limpa da página (sem query) — útil para preview OG em ferramentas internas */
    preview_base_url: string;
  }> {
    const code = String(input.code || "").trim();
    const coupon = String(input.couponCode || "").trim().toUpperCase() || null;
    return (input.domains || [])
      .filter((d) => d && (d.is_active === true || d.is_active === 1))
      .map((d) => {
        const url = buildAffiliateSupportUrl({
          domain: d.domain,
          pathTemplate: d.path_template,
          code,
          couponCode: coupon,
        });
        let previewBase = "";
        try {
          const u = new URL(url);
          u.search = "";
          u.hash = "";
          previewBase = u.toString();
        } catch {
          previewBase = `https://${normalizeTrackingHost(d.domain)}/`;
        }
        return {
          id: String(d.id),
          domain: String(d.domain),
          label: String(d.label || d.domain),
          url,
          path_template: String(d.path_template || ""),
          store_handoff_url: d.store_handoff_url ? String(d.store_handoff_url) : null,
          preview_base_url: previewBase,
        };
      })
      .filter((d) => !!d.url);
  }
}

export const affiliateTrackingDomainsService = new AffiliateTrackingDomainsService();

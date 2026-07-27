import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { AffiliatesService } from "../services/affiliates";
import { queryOne } from "../config/database";
import {
  affiliateTrackingDomainsService,
  normalizeTrackingHost,
} from "../services/affiliateTrackingDomains";

const router = Router();
const affiliatesService = new AffiliatesService();

/** CORS liberado para pixel/tracker em sites de terceiros (domínios cadastrados pela org). */
router.use((req, res, next) => {
  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

router.post("/:code", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Código inválido" });

    await affiliatesService.ensureSchema();
    await affiliateTrackingDomainsService.ensureSchema();

    const affiliate = await queryOne<any>(
      `SELECT a.*, b.slug AS brand_slug, s.slug AS store_slug, d.domain AS primary_domain
       FROM affiliates a
       INNER JOIN brand_units b ON b.id = a.brand_id
       LEFT JOIN storefront_stores s ON s.brand_id = a.brand_id AND s.status = 'active'
       LEFT JOIN storefront_domains d
         ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
       WHERE LOWER(a.code) = LOWER(?) AND a.status = 'active'
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [code]
    );

    if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

    await affiliatesService.syncAffiliateCoupon(affiliate, String(affiliate.owner_user_id));

    const config = await affiliatesService.getOrCreateProgramConfig(
      String(affiliate.owner_user_id),
      String(affiliate.brand_id)
    );
    if (!config.is_enabled) {
      return res.status(403).json({ error: "Programa de afiliados desativado" });
    }

    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;

    const body = (req.body || {}) as Record<string, unknown>;
    const linkType = String(body.link_type || "catalog").trim().toLowerCase() || "catalog";
    let productId = String(body.product_id || "").trim() || null;
    const productSlug = String(body.product_slug || "").trim() || null;
    const landingPath = String(body.landing_path || "").trim().slice(0, 500) || null;
    const sourceHost = normalizeTrackingHost(
      String(body.source_host || body.source_domain || req.headers.origin || "").trim()
    );
    const sourceDomain = sourceHost || null;

    // Se o clique veio de host externo, só aceita se estiver cadastrado (ou for a loja)
    if (sourceHost) {
      const allowed = await affiliateTrackingDomainsService.isAllowedHost(
        String(affiliate.brand_id),
        sourceHost
      );
      // Não bloqueia lojas path-based (sem primary domain) com origin do app SaaS
      const isSaaSOrigin =
        sourceHost.includes("leadcapture") ||
        sourceHost.includes("alhopronto.online") ||
        sourceHost.includes("localhost") ||
        sourceHost.includes("127.0.0.1");
      if (!allowed && !isSaaSOrigin) {
        // Soft-allow: ainda rastreia, mas marca como external_unlisted
        // (orgs em onboarding não ficam bloqueadas se esquecerem de cadastrar)
      }
    }

    if (!productId && productSlug) {
      const productRow = await queryOne<{ id: string }>(
        `SELECT id FROM products
         WHERE brand_id = ? AND (slug = ? OR id = ?)
         LIMIT 1`,
        [String(affiliate.brand_id), productSlug, productSlug]
      );
      if (productRow?.id) productId = String(productRow.id);
    }

    const effectiveLinkType =
      sourceHost && linkType === "catalog" ? "support_site" : linkType;

    await affiliatesService.trackClick({
      ownerUserId: String(affiliate.owner_user_id),
      brandId: String(affiliate.brand_id),
      affiliateId: String(affiliate.id),
      ipHash: ipHash || undefined,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 255),
      referrer: String(req.headers.referer || "").slice(0, 500),
      linkType: effectiveLinkType,
      productId,
      productSlug,
      landingPath,
      sourceDomain,
      sourceHost: sourceHost || null,
    });

    const storeSlug = String(affiliate.store_slug || affiliate.brand_slug || "alhopronto").trim();
    const primaryDomain = String(affiliate.primary_domain || "").trim();
    const coupon = String(affiliate.coupon_code || "").trim();
    const affiliateQuery = `ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`;
    const redirectUrl = primaryDomain
      ? `https://${primaryDomain}/?${affiliateQuery}`
      : `/catalogo/${encodeURIComponent(storeSlug)}?${affiliateQuery}`;

    // Handoff da loja a partir do domínio de suporte (se cadastrado)
    let storeHandoffUrl: string | null = redirectUrl.startsWith("http") ? redirectUrl : null;
    if (sourceHost) {
      const domains = await affiliateTrackingDomainsService.listActiveByBrand(String(affiliate.brand_id));
      const match = domains.find((d) => normalizeTrackingHost(d.domain) === sourceHost);
      if (match?.store_handoff_url) {
        const base = String(match.store_handoff_url).replace(/\/$/, "");
        const sep = base.includes("?") ? "&" : "?";
        storeHandoffUrl = `${base}${sep}${affiliateQuery}`;
      }
    }

    const contact = await affiliatesService.resolvePublicWhatsAppContact({
      id: String(affiliate.id),
      affiliate_user_id: affiliate.affiliate_user_id,
      phone: affiliate.phone,
      social_whatsapp: affiliate.social_whatsapp,
      brand_id: affiliate.brand_id,
      owner_user_id: affiliate.owner_user_id,
    });

    // Fallback final: WhatsApp da loja (studio / brand_units.whatsapp_phone)
    let storeWhatsapp: string | null = null;
    try {
      const brandRow = await queryOne<{ whatsapp_phone: string | null }>(
        `SELECT whatsapp_phone FROM brand_units WHERE id = ? LIMIT 1`,
        [String(affiliate.brand_id)]
      );
      const digits = String(brandRow?.whatsapp_phone || "").replace(/\D/g, "");
      storeWhatsapp = digits.length >= 10 ? digits : null;
    } catch {
      storeWhatsapp = null;
    }

    const whatsappPhone = contact.phone || storeWhatsapp || null;
    const whatsappSource = contact.phone
      ? contact.source
      : storeWhatsapp
        ? "store"
        : null;

    res.json({
      success: true,
      affiliate_id: affiliate.id,
      code: affiliate.code,
      display_name: String(affiliate.display_name || affiliate.code || "").trim(),
      coupon_code: coupon,
      cookie_days: config.cookie_days,
      store_slug: storeSlug,
      primary_domain: primaryDomain || null,
      store_handoff_url: storeHandoffUrl,
      source_host: sourceHost || null,
      whatsapp_phone: whatsappPhone,
      whatsapp_source: whatsappSource,
      whatsapp_instance_id: contact.instance_id || null,
      redirect_url: redirectUrl,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao processar link" });
  }
});

/** GET — só resolve contato WhatsApp do afiliado (sem recontar clique). */
router.get("/:code/whatsapp", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Código inválido" });

    await affiliatesService.ensureSchema();

    const affiliate = await queryOne<any>(
      `SELECT a.*
       FROM affiliates a
       WHERE LOWER(a.code) = LOWER(?) AND a.status = 'active'
       LIMIT 1`,
      [code]
    );
    if (!affiliate) return res.status(404).json({ error: "Afiliado não encontrado" });

    const contact = await affiliatesService.resolvePublicWhatsAppContact({
      id: String(affiliate.id),
      affiliate_user_id: affiliate.affiliate_user_id,
      phone: affiliate.phone,
      social_whatsapp: affiliate.social_whatsapp,
      brand_id: affiliate.brand_id,
      owner_user_id: affiliate.owner_user_id,
    });

    let storeWhatsapp: string | null = null;
    try {
      const brandRow = await queryOne<{ whatsapp_phone: string | null }>(
        `SELECT whatsapp_phone FROM brand_units WHERE id = ? LIMIT 1`,
        [String(affiliate.brand_id)]
      );
      const digits = String(brandRow?.whatsapp_phone || "").replace(/\D/g, "");
      storeWhatsapp = digits.length >= 10 ? digits : null;
    } catch {
      storeWhatsapp = null;
    }

    const whatsappPhone = contact.phone || storeWhatsapp || null;
    res.json({
      success: true,
      affiliate_id: affiliate.id,
      code: affiliate.code,
      whatsapp_phone: whatsappPhone,
      whatsapp_source: contact.phone ? contact.source : storeWhatsapp ? "store" : null,
      whatsapp_instance_id: contact.instance_id || null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao resolver WhatsApp" });
  }
});

export default router;

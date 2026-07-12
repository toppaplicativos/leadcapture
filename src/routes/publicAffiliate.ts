import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { AffiliatesService } from "../services/affiliates";
import { queryOne } from "../config/database";

const router = Router();
const affiliatesService = new AffiliatesService();

router.post("/:code", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code || "").trim();
    if (!code) return res.status(400).json({ error: "Código inválido" });

    await affiliatesService.ensureSchema();

    const affiliate = await queryOne<any>(
      `SELECT a.*, b.slug AS brand_slug, s.slug AS store_slug
       FROM affiliates a
       INNER JOIN brand_units b ON b.id = a.brand_id
       LEFT JOIN storefront_stores s ON s.brand_id = a.brand_id AND s.status = 'active'
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

    if (!productId && productSlug) {
      const productRow = await queryOne<{ id: string }>(
        `SELECT id FROM products
         WHERE brand_id = ? AND (slug = ? OR id = ?)
         LIMIT 1`,
        [String(affiliate.brand_id), productSlug, productSlug]
      );
      if (productRow?.id) productId = String(productRow.id);
    }

    await affiliatesService.trackClick({
      ownerUserId: String(affiliate.owner_user_id),
      brandId: String(affiliate.brand_id),
      affiliateId: String(affiliate.id),
      ipHash: ipHash || undefined,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 255),
      referrer: String(req.headers.referer || "").slice(0, 500),
      linkType,
      productId,
      productSlug,
      landingPath,
    });

    const storeSlug = String(affiliate.store_slug || affiliate.brand_slug || "alhopronto").trim();
    const coupon = String(affiliate.coupon_code || "").trim();

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
      whatsapp_phone: whatsappPhone,
      whatsapp_source: whatsappSource,
      whatsapp_instance_id: contact.instance_id || null,
      redirect_url: `/catalogo/${encodeURIComponent(storeSlug)}?ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`,
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
import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { AuthRequest } from "../middleware/auth";
import { query, queryOne } from "../config/database";
import { AffiliatesService } from "../services/affiliates";
import { affiliateProductLearningService } from "../services/affiliateProductLearning";
import { CreativeStudioService } from "../services/creativeStudio";
import { generateAffiliateSharePack } from "../services/affiliateShareStudio";
import { affiliateProgramsService } from "../services/affiliatePrograms";
import {
  formatCommissionDescription,
  formatCommissionShort,
  resolveCommissionConfig,
  type CommissionConfig,
} from "../services/affiliateCommission";
import { affiliateDistributionService } from "../services/affiliateDistribution";
import { affiliateCrmService } from "../services/affiliateCrm";
import { CommerceService } from "../services/commerce";
import { getHealthSnapshot } from "../services/whatsappHealth";
import { aiRouter } from "../services/aiRouter";
import { runAffiliateAttendanceAssist } from "../services/affiliateAttendanceAssist";
import { buildAffiliatePublicLinks } from "../services/storefrontPageMeta";
import { buildAffiliateSharePack } from "../services/affiliateSharePack";
import {
  applyCadenceAfterProgress,
  completeAttendanceTask,
  ensureAttendanceTasksSchema,
  getNextPendingTask,
  listDueAttendanceTasks,
  resolveCadence,
  type AttendanceTasksMode,
} from "../services/attendanceCadence";
import {
  actionLabel as multiChannelActionLabel,
  defaultChannelForAction,
  ensureManualActionsChannelSchema,
  isInitiatingAction,
  normalizeChannel,
  summarizeAttemptsByChannel,
  type ContactChannel,
} from "../services/affiliateContactChannel";
import { recordCaptureFeedback, type CaptureFeedbackEvent } from "../services/captureFeedback";
import { resolveOpportunityTaxonomy } from "../services/nicheTaxonomy";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const avatarDir = path.join(__dirname, "../../uploads/affiliate-avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
      cb(null, `${randomUUID()}${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Envie uma imagem JPG, PNG ou WEBP"));
  },
});

const router = Router();
const affiliatesService = new AffiliatesService();
const creativeStudio = new CreativeStudioService();
const affiliateCommerceService = new CommerceService();

const MATERIAL_PURPOSE_GUIDE: Record<string, string> = {
  instagram_feed:
    "Legenda para post no feed do Instagram. 2-4 frases curtas, tom autêntico, CTA claro. Inclua cupom e link do catálogo. Termine com 5-8 hashtags relevantes em português.",
  instagram_story:
    "Texto para story do Instagram. Máximo 220 caracteres, direto, 1-2 emojis no máximo, CTA para responder ou acessar o link.",
  instagram_reels:
    "Legenda para Reels. Gancho na primeira linha, benefício, CTA para comentar ou clicar no link. Até 400 caracteres.",
  whatsapp_status:
    "Mensagem para status do WhatsApp. Tom conversacional, mencione cupom e link. Máximo 300 caracteres.",
  whatsapp_broadcast:
    "Mensagem para lista de transmissão no WhatsApp. Convite amigável, cupom, link e motivo para comprar agora. Máximo 450 caracteres.",
};

type AffiliateContext = {
  ownerUserId: string;
  brandId: string;
  affiliateUserId: string;
  credentialId: string;
};

async function requireAffiliateCredential(req: AuthRequest, res: Response): Promise<AffiliateContext | null> {
  const credentialType = String(req.user?.credential_type || "").trim().toLowerCase();
  const ownerUserId = String(req.user?.owner_user_id || "").trim();
  const brandId = String(req.user?.brand_id || "").trim();
  const affiliateUserId = String(req.user?.userId || "").trim();
  const credentialId = String(req.user?.credential_id || "").trim();

  if (credentialType !== "afiliado") {
    res.status(403).json({ error: "Credencial inválida para Central do Afiliado" });
    return null;
  }
  if (!ownerUserId || !brandId || !affiliateUserId) {
    res.status(403).json({ error: "Token de afiliado incompleto" });
    return null;
  }

  return { ownerUserId, brandId, affiliateUserId, credentialId };
}

async function getAffiliateProfile(ctx: AffiliateContext) {
  let row: any = null;
  if (ctx.credentialId) {
    row = await queryOne<any>(
      `SELECT a.*, c.email AS credential_email, u.email AS user_email
       FROM affiliates a
       LEFT JOIN affiliate_app_credentials c ON c.id = a.credential_id
       LEFT JOIN users u ON u.id = a.affiliate_user_id
       WHERE a.credential_id = ? AND a.brand_id = ?
       LIMIT 1`,
      [ctx.credentialId, ctx.brandId]
    ).catch(async () =>
      queryOne<any>(
        `SELECT * FROM affiliates WHERE credential_id = ? AND brand_id = ? LIMIT 1`,
        [ctx.credentialId, ctx.brandId]
      )
    );
  }
  if (!row) {
    row = await queryOne<any>(
      `SELECT a.*, c.email AS credential_email, u.email AS user_email
       FROM affiliates a
       LEFT JOIN affiliate_app_credentials c ON c.id = a.credential_id
       LEFT JOIN users u ON u.id = a.affiliate_user_id
       WHERE a.affiliate_user_id = ? AND a.brand_id = ?
       LIMIT 1`,
      [ctx.affiliateUserId, ctx.brandId]
    ).catch(async () =>
      queryOne<any>(
        `SELECT * FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
        [ctx.affiliateUserId, ctx.brandId]
      )
    );
  }
  if (!row) return null;
  return {
    ...row,
    email: String(row.credential_email || row.user_email || row.email || "").trim() || null,
  };
}

/** Comissão da inscrição/programa multi (R$/kg etc.) — não o mock 10% da config legada */
async function resolveBrandCommissionDisplay(
  ctx: AffiliateContext,
  affiliate: any,
): Promise<{
  commission: CommissionConfig;
  rules: string | null;
  program_name: string | null;
  program_id: string | null;
  config: any;
}> {
  const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
  let programRow: any = null;
  try {
    await affiliateProgramsService.ensureSchema();
    if (affiliate?.id) {
      // Preferir inscrição mais recente (ex.: R$/kg), não o programa default legado (10%)
      programRow = await queryOne<any>(
        `SELECT p.id, p.name, p.commission_mode, p.commission_value, p.commission_rules, p.is_default, e.status AS enrollment_status
         FROM affiliate_program_enrollments e
         INNER JOIN affiliate_programs p ON p.id = e.program_id
         WHERE e.affiliate_id = ? AND e.brand_id = ?
           AND e.status IN ('active', 'onboarding')
         ORDER BY CASE WHEN e.status = 'active' THEN 0 ELSE 1 END,
                  e.updated_at DESC,
                  e.created_at DESC,
                  CASE WHEN p.is_default THEN 1 ELSE 0 END
         LIMIT 1`,
        [affiliate.id, ctx.brandId],
      );
    }
    if (!programRow) {
      programRow = await queryOne<any>(
        `SELECT id, name, commission_mode, commission_value, commission_rules, is_default
         FROM affiliate_programs
         WHERE brand_id = ? AND status = 'active'
         ORDER BY is_default DESC, sort_order ASC, created_at ASC
         LIMIT 1`,
        [ctx.brandId],
      );
    }
  } catch {
    programRow = null;
  }

  const commission = resolveCommissionConfig({
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

  return {
    commission,
    rules: String(programRow?.commission_rules || config.commission_rules || "").trim() || null,
    program_name: programRow?.name ? String(programRow.name) : null,
    program_id: programRow?.id ? String(programRow.id) : null,
    config,
  };
}

router.get("/me", async (req: AuthRequest, res: Response) => {
  const ctx = await requireAffiliateCredential(req, res);
  if (!ctx) return;

  const brand = await queryOne<any>(
    `SELECT b.id, b.slug, b.name, b.logo_url, b.primary_color, b.secondary_color, b.slogan, b.voice_json,
            d.domain AS primary_domain
     FROM brand_units b
     LEFT JOIN storefront_stores s ON s.brand_id = b.id AND s.status = 'active'
     LEFT JOIN storefront_domains d
       ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
     WHERE b.id = ?
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [ctx.brandId]
  );
  if (!brand) return res.status(403).json({ error: "Marca não encontrada" });

  const affiliate = await getAffiliateProfile(ctx);
  const { commission, rules, program_name, program_id, config } = await resolveBrandCommissionDisplay(ctx, affiliate);

  res.json({
    success: true,
    user: {
      id: ctx.affiliateUserId,
      email: String(req.user?.email || "").trim() || null,
      role: "affiliate",
      credential_type: "afiliado",
      owner_user_id: ctx.ownerUserId,
      brand_id: ctx.brandId,
    },
    brand: {
      id: String(brand.id),
      slug: String(brand.slug || "").trim() || null,
      name: String(brand.name || "").trim() || null,
      logo_url: String(brand.logo_url || "").trim() || null,
      primary_color: String(brand.primary_color || "").trim() || null,
      secondary_color: String(brand.secondary_color || "").trim() || null,
      slogan: String(brand.slogan || "").trim() || null,
      primary_domain: String(brand.primary_domain || "").trim() || null,
    },
    affiliate,
    program: config,
    active_program: program_id
      ? { id: program_id, name: program_name, commission_mode: commission.mode, commission_value: commission.value }
      : null,
    commission: {
      mode: commission.mode,
      value: commission.value,
      source: commission.source,
      label: formatCommissionShort(commission.mode, commission.value),
      description: formatCommissionDescription(commission.mode, commission.value),
      rules,
      program_name,
    },
  });
});

router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const stats = await affiliatesService.getDashboardStats(String(affiliate.id), ctx.brandId);
    const { commission, rules, program_name } = await resolveBrandCommissionDisplay(ctx, affiliate);
    res.json({
      success: true,
      ...stats,
      commission: {
        mode: commission.mode,
        value: commission.value,
        source: commission.source,
        label: formatCommissionShort(commission.mode, commission.value),
        description: formatCommissionDescription(commission.mode, commission.value),
        rules,
        program_name,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar dashboard" });
  }
});

router.get("/sales", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const programId = String(req.query.program_id || "").trim() || undefined;
    const data = await affiliatesService.listSales(String(affiliate.id), page, limit, programId);
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar vendas" });
  }
});

router.get("/links", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const brand = await queryOne<any>(
      `SELECT slug, name FROM brand_units WHERE id = ? LIMIT 1`,
      [ctx.brandId]
    );
    let storeSlug = String(brand?.slug || "").trim();
    let primaryDomain = "";
    try {
      const store = await queryOne<any>(
        `SELECT s.slug, d.domain AS primary_domain
         FROM storefront_stores s
         LEFT JOIN storefront_domains d
           ON d.store_id = s.id AND d.is_primary = TRUE AND d.verification_status = 'verified'
         WHERE s.brand_id = ? AND s.status = 'active'
         ORDER BY s.updated_at DESC
         LIMIT 1`,
        [ctx.brandId]
      );
      if (store?.slug) storeSlug = String(store.slug).trim();
      if (store?.primary_domain) primaryDomain = String(store.primary_domain).trim();
    } catch {
      /* storefront opcional */
    }

    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const programId = String(req.query.program_id || "").trim() || undefined;

    let linkCtx: any = { enrollment: null, program_id: null, enrollments: [] };
    try {
      linkCtx = await affiliateProgramsService.resolveEnrollmentContext(
        ctx.affiliateUserId,
        ctx.brandId,
        programId
      );
    } catch (enrollErr: any) {
      console.error("[affiliate-app/links] enrollment context:", enrollErr?.message || enrollErr);
    }

    const enrollment = linkCtx.enrollment;
    const activeProgramId = linkCtx.program_id || undefined;

    const code = String(
      enrollment?.resources_unlocked
        ? (enrollment.enrollment_code || enrollment.legacy_code || affiliate.code || "")
        : (enrollment?.legacy_code || affiliate.code || "")
    ).trim();
    const coupon = String(
      enrollment?.resources_unlocked
        ? (enrollment.coupon_code || enrollment.legacy_coupon || affiliate.coupon_code || "")
        : (enrollment?.legacy_coupon || affiliate.coupon_code || "")
    ).trim().toUpperCase();

    let analytics: any = null;
    try {
      analytics = await affiliatesService.getAffiliateLinkAnalytics(
        String(affiliate.id),
        ctx.brandId,
        days,
        activeProgramId
      );
    } catch (anErr: any) {
      console.error("[affiliate-app/links] analytics:", anErr?.message || anErr);
    }

    let products: any[] = [];
    try {
      products = await affiliateProductLearningService.listCatalog(ctx.ownerUserId, ctx.brandId);
      if (activeProgramId) {
        const offerProductIds = await affiliateProgramsService.listProgramProductIds(activeProgramId);
        if (offerProductIds.length) {
          const idSet = new Set(offerProductIds);
          products = products.filter((p: any) => idSet.has(String(p.id)));
        }
      }
    } catch (prodErr: any) {
      console.error("[affiliate-app/links] products:", prodErr?.message || prodErr);
      products = [];
    }

    const productClickMap = new Map<string, number>();
    for (const row of analytics?.top_products || []) {
      const key = String(row.product_id || row.product_slug || "");
      if (key) productClickMap.set(key, Number(row.clicks || 0));
    }

    const requestOrigin = `${req.protocol}://${req.get("host") || ""}`.replace(/\/+$/, "");
    const publicLinks = buildAffiliatePublicLinks({
      code,
      couponCode: coupon,
      storeSlug,
      primaryDomain: primaryDomain || null,
      fallbackOrigin: requestOrigin,
    });

    let catalogPack: any = null;
    let shortPack: any = null;
    try {
      catalogPack = await buildAffiliateSharePack({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateUserId: ctx.affiliateUserId,
        kind: "catalog",
        requestOrigin,
        code,
        couponCode: coupon,
        affiliateDisplayName: affiliate.display_name || null,
      });
      shortPack = await buildAffiliateSharePack({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateUserId: ctx.affiliateUserId,
        kind: "short",
        requestOrigin,
        code,
        couponCode: coupon,
        affiliateDisplayName: affiliate.display_name || null,
      });
    } catch (packErr: any) {
      console.error("[affiliate-app/links] share pack:", packErr?.message || packErr);
    }

    res.json({
      success: true,
      code,
      coupon_code: coupon,
      store_slug: storeSlug,
      primary_domain: primaryDomain || null,
      brand_name: brand?.name ? String(brand.name) : null,
      program_id: activeProgramId || null,
      program_name: enrollment?.program_name || null,
      resources_unlocked: !!enrollment?.resources_unlocked,
      enrollment_status: enrollment?.status || null,
      enrollments: linkCtx.enrollments || [],
      links: {
        short_path: publicLinks.short_path,
        catalog_path: publicLinks.catalog_path,
        short_url: publicLinks.short_url,
        catalog_url: publicLinks.catalog_url,
        origin: publicLinks.origin,
      },
      /** Preview OG + mensagem estruturada (WhatsApp visual) */
      share: {
        catalog: catalogPack,
        short: shortPack,
      },
      stats: {
        clicks_total: analytics?.clicks_total || 0,
        clicks_period: analytics?.clicks_period || 0,
        conversions_total: analytics?.conversions_total || 0,
        conversions_period: analytics?.conversions_period || 0,
        conversion_rate: analytics?.conversion_rate || 0,
        commission_period: analytics?.commission_period || 0,
        period_days: analytics?.period_days || days,
      },
      products: products.map((p: any) => {
        const productUrl = publicLinks.product_url(String(p.slug || p.id || ""));
        return {
          ...p,
          clicks: productClickMap.get(String(p.id)) || productClickMap.get(String(p.slug || "")) || 0,
          product_url: productUrl,
        };
      }),
    });
  } catch (e: any) {
    console.error("[affiliate-app/links]", e?.message || e);
    res.status(500).json({ error: e.message || "Falha ao carregar links" });
  }
});

/**
 * Pacote de compartilhamento estruturado (título, descrição, imagem, URL, mensagem).
 * kind=catalog|product|short · product_id opcional
 */
router.get("/share-pack", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const kindRaw = String(req.query.kind || "catalog").trim().toLowerCase();
    const kind = (kindRaw === "product" || kindRaw === "short" ? kindRaw : "catalog") as
      | "catalog"
      | "product"
      | "short";
    const productId = String(req.query.product_id || "").trim() || null;
    const requestOrigin = `${req.protocol}://${req.get("host") || ""}`.replace(/\/+$/, "");

    let code = String(affiliate.code || "").trim();
    let coupon = String(affiliate.coupon_code || "").trim().toUpperCase() || null;
    try {
      const linkCtx = await affiliateProgramsService.resolveEnrollmentContext(
        ctx.affiliateUserId,
        ctx.brandId,
        String(req.query.program_id || "").trim() || undefined,
      );
      const en = linkCtx.enrollment;
      if (en?.resources_unlocked) {
        code = String(en.enrollment_code || en.legacy_code || code).trim();
        coupon = String(en.coupon_code || en.legacy_coupon || coupon || "").trim().toUpperCase() || null;
      }
    } catch {
      /* keep profile codes */
    }

    const pack = await buildAffiliateSharePack({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateUserId: ctx.affiliateUserId,
      kind,
      productId,
      requestOrigin,
      code,
      couponCode: coupon,
      affiliateDisplayName: affiliate.display_name || null,
    });

    res.json({ success: true, pack });
  } catch (e: any) {
    console.error("[affiliate-app/share-pack]", e?.message || e);
    res.status(500).json({ error: e.message || "Falha ao montar pacote de compartilhamento" });
  }
});

router.get("/links/analytics", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const programId = String(req.query.program_id || "").trim() || undefined;
    let resolvedProgramId: string | undefined = programId;
    try {
      const linkCtx = await affiliateProgramsService.resolveEnrollmentContext(
        ctx.affiliateUserId,
        ctx.brandId,
        programId
      );
      resolvedProgramId = linkCtx.program_id || programId || undefined;
    } catch {
      /* usa program_id da query se houver */
    }

    const analytics = await affiliatesService.getAffiliateLinkAnalytics(
      String(affiliate.id),
      ctx.brandId,
      days,
      resolvedProgramId
    );
    if (!analytics) return res.status(404).json({ error: "Afiliado não encontrado" });

    const typeLabels: Record<string, string> = {
      catalog: "Catálogo",
      product: "Produto",
      short: "Link curto",
      coupon: "Cupom",
    };

    res.json({
      success: true,
      period_days: analytics.period_days,
      clicks_total: analytics.clicks_total,
      clicks_period: analytics.clicks_period,
      conversions_total: analytics.conversions_total,
      conversions_period: analytics.conversions_period,
      conversion_rate: analytics.conversion_rate,
      commission_period: analytics.commission_period,
      series: analytics.series || [],
      top_products: analytics.top_products || [],
      by_type: (analytics.by_type || []).map((row: any) => ({
        ...row,
        label: typeLabels[row.link_type] || row.link_type,
      })),
      funnel: {
        clicks: analytics.clicks_period,
        conversions: analytics.conversions_period,
        commission: analytics.commission_period,
      },
    });
  } catch (e: any) {
    console.error("[affiliate-app/links/analytics]", e?.message || e);
    res.status(500).json({ error: e.message || "Falha ao carregar análise" });
  }
});

function normalizeAffiliatePixKey(raw: unknown): string {
  return String(raw || "").trim().slice(0, 120);
}

function validateAffiliatePixKey(pixKey: string): string | null {
  if (!pixKey) return "Chave Pix obrigatória";
  if (pixKey.length < 3) return "Chave Pix inválida";
  return null;
}

router.get("/payment-settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
    const pixKey = normalizeAffiliatePixKey(affiliate.pix_key);
    res.json({
      success: true,
      pix_key: pixKey,
      has_pix: Boolean(pixKey),
      min_withdrawal: Number(config.min_withdrawal || 0),
      payment_days: Number(config.payment_days || 15),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar pagamentos" });
  }
});

router.put("/payment-settings", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const pixKey = normalizeAffiliatePixKey(req.body?.pix_key);
    const pixErr = validateAffiliatePixKey(pixKey);
    if (pixErr) return res.status(400).json({ error: pixErr });

    const updated = await affiliatesService.updateProfile(String(affiliate.id), { pix_key: pixKey });
    res.json({
      success: true,
      pix_key: normalizeAffiliatePixKey(updated?.pix_key),
      has_pix: Boolean(updated?.pix_key),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao salvar chave Pix" });
  }
});

router.get("/commissions", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const stats = await affiliatesService.getDashboardStats(String(affiliate.id), ctx.brandId);
    const payouts = await affiliatesService.listPayouts(String(affiliate.id));
    const pixKey = normalizeAffiliatePixKey(affiliate.pix_key);
    res.json({
      success: true,
      pending: stats?.commission_pending || 0,
      approved: stats?.commission_available || 0,
      accumulated: stats?.commission_accumulated || 0,
      pix_key: pixKey,
      has_pix: Boolean(pixKey),
      payouts,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar comissões" });
  }
});

router.post("/payouts", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const amount = Number(req.body?.amount || 0);
    const pixKey = normalizeAffiliatePixKey(req.body?.pix_key || affiliate.pix_key);
    if (!amount || amount <= 0) return res.status(400).json({ error: "Valor inválido" });
    const pixErr = validateAffiliatePixKey(pixKey);
    if (pixErr) return res.status(400).json({ error: pixErr });

    const payoutId = await affiliatesService.requestPayout({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateId: String(affiliate.id),
      amount,
      pixKey,
    });
    res.status(201).json({ success: true, payout_id: payoutId });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao solicitar saque" });
  }
});

router.get("/materials", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    const region = String(req.query.region || affiliate?.region || "").trim() || undefined;
    const channel = String(req.query.channel || "").trim() || undefined;
    const programId = String(req.query.program_id || "").trim() || undefined;
    const materials = await affiliatesService.listMaterials(ctx.ownerUserId, ctx.brandId, {
      region,
      publishedOnly: true,
      channel,
      programId,
    });
    res.json({ success: true, materials, program_id: programId || null });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar materiais" });
  }
});

/** Biblioteca unificada: pastas (posts, produtos, marca, programa…) + itens mídia */
router.get("/materials/library", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    const region = String(req.query.region || affiliate?.region || "").trim() || undefined;
    const programId = String(req.query.program_id || "").trim() || undefined;
    const folder = String(req.query.folder || "all").trim() || "all";
    const type = String(req.query.type || "").trim() || undefined;
    const q = String(req.query.q || "").trim() || undefined;

    const library = await affiliatesService.listMaterialsLibrary(ctx.ownerUserId, ctx.brandId, {
      region,
      programId,
      folder,
      type,
      q,
    });

    res.json({
      success: true,
      brand_id: ctx.brandId,
      program_id: programId || null,
      ...library,
    });
  } catch (e: any) {
    console.error("[affiliate-app/materials/library]", e?.message || e);
    res.status(500).json({ error: e.message || "Falha ao carregar biblioteca de materiais" });
  }
});

router.post("/share/generate", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const kit = String(req.body?.kit || "catalog").trim();
    const destination = String(req.body?.destination || "instagram_feed").trim();
    const productId = String(req.body?.product_id || "").trim() || undefined;
    const materialId = String(req.body?.material_id || "").trim() || undefined;

    const brand = await queryOne<any>(
      `SELECT name, slug, slogan FROM brand_units WHERE id = ? LIMIT 1`,
      [ctx.brandId]
    );
    const brandSlug = String(brand?.slug || "").trim();
    const code = String(affiliate.code || "").trim();
    const coupon = String(affiliate.coupon_code || "").trim();
    const catalogPath = code && brandSlug
      ? `/catalogo/${encodeURIComponent(brandSlug)}?ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`
      : "";
    const programPath = brandSlug ? `/central-afiliado/${encodeURIComponent(brandSlug)}` : "";

    let productName: string | undefined;
    let productPrice: string | undefined;
    if (productId) {
      const product = await queryOne<any>(
        `SELECT name, price, promotional_price FROM products WHERE id = ? AND brand_id = ? LIMIT 1`,
        [productId, ctx.brandId]
      );
      if (product) {
        productName = String(product.name || "").trim();
        const price = Number(product.promotional_price ?? product.price ?? 0);
        productPrice = price > 0
          ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : undefined;
      }
    }

    let materialTitle: string | undefined;
    if (materialId) {
      const materials = await affiliatesService.listMaterials(ctx.ownerUserId, ctx.brandId, { publishedOnly: true });
      const material = materials.find((m: any) => String(m.id) === materialId);
      materialTitle = material ? String(material.title || "").trim() : undefined;
    }

    const { commission } = await resolveBrandCommissionDisplay(ctx, affiliate);

    const pack = await generateAffiliateSharePack({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      kit,
      destination,
      affiliateName: String(affiliate.display_name || "").trim() || "parceiro",
      coupon,
      code,
      catalogPath,
      programPath,
      productName,
      productPrice,
      materialTitle,
      commissionLabel: formatCommissionShort(commission.mode, commission.value),
    });

    res.json({ success: true, pack, destination, kit });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao gerar kit de divulgação" });
  }
});

router.post("/materials/:materialId/generate-caption", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const materialId = String(req.params.materialId || "").trim();
    const purpose = String(req.body?.purpose || "instagram_feed").trim();
    const purposeGuide = MATERIAL_PURPOSE_GUIDE[purpose] || MATERIAL_PURPOSE_GUIDE.instagram_feed;

    const materials = await affiliatesService.listMaterials(ctx.ownerUserId, ctx.brandId, {
      publishedOnly: true,
    });
    const material = materials.find((m: any) => String(m.id) === materialId);
    if (!material) return res.status(404).json({ error: "Material não encontrado" });

    const brand = await queryOne<any>(
      `SELECT name, slug, slogan FROM brand_units WHERE id = ? LIMIT 1`,
      [ctx.brandId]
    );
    const brandName = String(brand?.name || "").trim() || "a loja";
    const affiliateName = String(affiliate.display_name || affiliate.name || "").trim() || "parceiro";
    const coupon = String(affiliate.coupon_code || "").trim();
    const code = String(affiliate.code || "").trim();
    const catalogPath = code
      ? `/catalogo/${encodeURIComponent(String(brand?.slug || "").trim())}?ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`
      : "";
    const catalogHint = catalogPath ? `Link do catálogo (caminho relativo): ${catalogPath}` : "";

    const prompt = [
      "Você escreve textos de divulgação para afiliados de e-commerce no Brasil.",
      purposeGuide,
      `Marca: ${brandName}`,
      affiliateName ? `Nome do afiliado: ${affiliateName}` : "",
      coupon ? `Cupom de desconto: ${coupon}` : "",
      catalogHint,
      `Material: ${String(material.title || "").trim()}`,
      material.category ? `Tipo de peça: ${String(material.category)}` : "",
      material.channel ? `Canal sugerido: ${String(material.channel)}` : "",
      "Não invente preços nem promoções que não foram informadas.",
      "Responda apenas com o texto final pronto para copiar, sem explicações.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await creativeStudio.generateText(ctx.ownerUserId, {
      prompt,
      maxCharacters: purpose === "instagram_story" ? 240 : purpose === "whatsapp_status" ? 320 : 900,
    }, ctx.brandId);

    const caption = String(result?.text || "").trim();
    if (!caption) return res.status(500).json({ error: "Não foi possível gerar a legenda" });

    res.json({ success: true, caption, purpose });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao gerar legenda" });
  }
});

router.get("/content", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    const region = String(req.query.region || affiliate?.region || "").trim() || undefined;
    const channel = String(req.query.channel || "").trim() || undefined;
    const bundle = await affiliatesService.getAffiliateContentBundle(ctx.ownerUserId, ctx.brandId, {
      region,
      channel,
    });
    const { commission, rules, config } = await resolveBrandCommissionDisplay(ctx, affiliate);
    res.json({
      success: true,
      ...bundle,
      training: {
        terms_html: config.terms_html,
        training_html: config.training_html,
        commission_rules: rules || config.commission_rules,
        default_commission_pct: config.default_commission_pct,
        commission: {
          mode: commission.mode,
          value: commission.value,
          source: commission.source,
          label: formatCommissionShort(commission.mode, commission.value),
          description: formatCommissionDescription(commission.mode, commission.value),
        },
        payment_days: config.payment_days,
        min_withdrawal: config.min_withdrawal,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar conteúdo" });
  }
});

router.get("/products", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const products = await affiliateProductLearningService.listCatalog(ctx.ownerUserId, ctx.brandId);
    res.json({ success: true, products });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar produtos" });
  }
});

router.get("/orders", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const orders = await query<any[]>(
      `SELECT o.*,
              (SELECT COUNT(*) FROM commerce_order_items oi WHERE oi.order_id = o.id) AS items_count
       FROM commerce_orders o
       WHERE o.brand_id = ? AND UPPER(COALESCE(o.cupom_codigo, '')) = UPPER(?)
       ORDER BY o.data_criacao DESC, o.created_at DESC
       LIMIT 100`,
      [ctx.brandId, String(affiliate.coupon_code || "")]
    ).catch(() => []);

    const summary = {
      total: orders.length,
      open: orders.filter((o) => !["entregue", "cancelado", "estornado", "abandonado"].includes(String(o.status_pedido))).length,
      awaiting_payment: orders.filter((o) => ["criado", "aguardando_pagamento"].includes(String(o.status_pedido))).length,
      completed: orders.filter((o) => String(o.status_pedido) === "entregue").length,
      revenue: orders.filter((o) => !["cancelado", "estornado", "abandonado"].includes(String(o.status_pedido))).reduce((sum, o) => sum + Number(o.valor_total || 0), 0),
    };
    res.json({ success: true, orders, summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar pedidos" });
  }
});

router.post("/orders", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!String(payload.customer_name || "").trim()) return res.status(400).json({ error: "Informe o nome do cliente" });
    if (!String(payload.customer_phone || "").replace(/\D/g, "")) return res.status(400).json({ error: "Informe o WhatsApp do cliente" });
    if (!items.length) return res.status(400).json({ error: "Adicione pelo menos um produto" });

    const origin = `${req.protocol}://${req.get("host")}`;
    const created = await affiliateCommerceService.createOrder(ctx.ownerUserId, ctx.brandId, {
      lead_id: payload.lead_id ? String(payload.lead_id) : undefined,
      origem: "whatsapp",
      forma_pagamento: String(payload.payment_method || "pix"),
      customer_name: String(payload.customer_name).trim(),
      customer_email: String(payload.customer_email || "").trim() || undefined,
      customer_phone: String(payload.customer_phone).trim(),
      cupom_codigo: String(affiliate.coupon_code || "").trim() || undefined,
      checkout_base_url: origin,
      itens: items.map((item: any) => ({ product_id: String(item.product_id || ""), quantidade: Math.max(1, Number(item.quantity || 1)) })),
    });
    res.status(201).json({ success: true, ...created });
  } catch (e: any) {
    const status = e?.code === "INSUFFICIENT_STOCK" ? 409 : 400;
    res.status(status).json({ error: e.message || "Falha ao criar pedido", shortages: e?.shortages || undefined });
  }
});

router.get("/products/:productId/guide", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const guide = await affiliateProductLearningService.getGuide(
      ctx.ownerUserId,
      ctx.brandId,
      String(req.params.productId)
    );
    if (!guide) {
      return res.status(404).json({ error: "Guia ainda não disponível para este produto", has_guide: false });
    }
    res.json({ success: true, guide: guide.structure, generated_at: guide.generated_at });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar guia" });
  }
});

router.get("/learning", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const modules = await affiliatesService.listLearningModules(ctx.ownerUserId, ctx.brandId, true);
    res.json({ success: true, modules });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar aprendizado" });
  }
});

router.put("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const updated = await affiliatesService.updateProfile(String(affiliate.id), {
      display_name: req.body?.display_name,
      phone: req.body?.phone,
      document: req.body?.document,
      pix_key: req.body?.pix_key,
      region: req.body?.region,
      city: req.body?.city,
      bio: req.body?.bio,
      avatar_url: req.body?.avatar_url,
      social_instagram: req.body?.social_instagram,
      social_whatsapp: req.body?.social_whatsapp,
    });
    const enriched = updated
      ? { ...updated, email: affiliate.email || null }
      : updated;
    res.json({ success: true, affiliate: enriched });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar perfil" });
  }
});

router.post("/profile/avatar", (req: AuthRequest, res: Response) => {
  avatarUpload.single("avatar")(req as any, res as any, async (err: any) => {
    try {
      if (err) {
        return res.status(400).json({ error: err.message || "Upload inválido" });
      }
      const ctx = await requireAffiliateCredential(req, res);
      if (!ctx) return;
      const affiliate = await getAffiliateProfile(ctx);
      if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.filename) return res.status(400).json({ error: "Arquivo de imagem obrigatório" });

      const avatarUrl = `/uploads/affiliate-avatars/${file.filename}`;
      const updated = await affiliatesService.updateProfile(String(affiliate.id), {
        avatar_url: avatarUrl,
      });
      res.json({
        success: true,
        avatar_url: avatarUrl,
        affiliate: updated ? { ...updated, email: affiliate.email || null } : updated,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Falha ao enviar foto" });
    }
  });
});

router.patch("/profile/password", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const currentPassword = String(req.body?.current_password || "");
    const newPassword = String(req.body?.new_password || "");
    if (!currentPassword) return res.status(400).json({ error: "Informe sua senha atual" });
    if (newPassword.length < 8) return res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres" });
    if (currentPassword === newPassword) return res.status(400).json({ error: "Escolha uma senha diferente da atual" });

    const user = await queryOne<any>("SELECT id, password_hash FROM users WHERE id = ? LIMIT 1", [ctx.affiliateUserId]);
    if (!user?.password_hash) return res.status(404).json({ error: "Conta não encontrada" });
    const valid = await bcrypt.compare(currentPassword, String(user.password_hash));
    if (!valid) return res.status(400).json({ error: "Senha atual incorreta" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, ctx.affiliateUserId]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Falha ao alterar senha" });
  }
});

router.get("/training", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    const { commission, rules, config } = await resolveBrandCommissionDisplay(ctx, affiliate);
    res.json({
      success: true,
      terms_html: config.terms_html,
      training_html: config.training_html,
      commission_rules: rules || config.commission_rules,
      default_commission_pct: config.default_commission_pct,
      commission: {
        mode: commission.mode,
        value: commission.value,
        source: commission.source,
        label: formatCommissionShort(commission.mode, commission.value),
        description: formatCommissionDescription(commission.mode, commission.value),
      },
      payment_days: config.payment_days,
      min_withdrawal: config.min_withdrawal,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar treinamento" });
  }
});

router.get("/programs/enrollments", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const enrollments = await affiliateProgramsService.listAffiliateEnrollments(
      ctx.affiliateUserId,
      ctx.brandId
    );
    res.json({ success: true, enrollments });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar inscrições" });
  }
});

router.get("/programs/marketplace", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const opportunities = await affiliateProgramsService.listMarketplaceForAffiliate({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateUserId: ctx.affiliateUserId,
      credentialId: ctx.credentialId,
    });
    res.json({ success: true, opportunities });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar oportunidades" });
  }
});

router.post("/programs/:programId/apply", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const result = await affiliateProgramsService.applyToProgram({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      programId: String(req.params.programId || "").trim(),
      affiliateUserId: ctx.affiliateUserId,
      credentialId: ctx.credentialId,
      note: String(req.body?.note || "").trim() || undefined,
    });
    res.status(201).json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao candidatar-se" });
  }
});

router.get("/programs/enrollments/:enrollmentId/onboarding", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const onboarding = await affiliateProgramsService.getEnrollmentOnboarding(
      String(req.params.enrollmentId || "").trim(),
      ctx.affiliateUserId
    );
    if (!onboarding) return res.status(404).json({ error: "Inscrição não encontrada" });
    res.json({ success: true, ...onboarding });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar o que falta concluir" });
  }
});

/** KPIs leves de atendimento (hoje / fila / follow-up) */
router.get("/opportunities/digest", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const digest = await affiliateCrmService.getAttendanceDigest(String(affiliate.id), ctx.brandId);

    /* Alerta soft de follow-up (não spam — dedupe no ensureAlert) */
    if (Number(digest.followup_due || 0) > 0) {
      try {
        await affiliateDistributionService.ensureAlert({
          ownerUserId: ctx.ownerUserId,
          brandId: ctx.brandId,
          affiliateId: String(affiliate.id),
          affiliateUserId: ctx.affiliateUserId,
          alertType: "followup_due",
          severity: "warning",
          title: `${digest.followup_due} follow-up${digest.followup_due > 1 ? "s" : ""} pendente${digest.followup_due > 1 ? "s" : ""}`,
          body: "Há contatos esperando retorno. Abra Meus contatos → Fila.",
          actionPath: "/oportunidades?tab=meus",
        });
      } catch {
        /* não bloqueia digest */
      }
    }

    res.json({ success: true, ...digest });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar resumo de atendimento" });
  }
});

/** Linha do tempo operacional recente do afiliado, cruzando todos os contatos. */
router.get("/opportunities/activity", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 100);

    await ensureManualActionsChannelSchema();

    const rows = await query<any[]>(
      `SELECT a.id, a.ref_type, a.ref_id, a.action, a.message_text, a.note, a.created_at,
              a.channel, a.duration_sec,
              COALESCE(pa.prospect_name, al.customer_name, 'Contato') AS contact_name,
              COALESCE(pa.prospect_phone, al.phone) AS phone,
              COALESCE(pa.assignment_status, al.affiliate_status) AS contact_status,
              pa.current_stage AS assignment_stage,
              CASE WHEN pa.id IS NOT NULL OR al.id IS NOT NULL THEN 1 ELSE 0 END AS contact_exists
         FROM affiliate_manual_actions a
         LEFT JOIN prospect_assignments pa
           ON a.ref_type = 'assignment' AND pa.id = a.ref_id AND pa.affiliate_id = a.affiliate_id
         LEFT JOIN affiliate_leads al
           ON a.ref_type = 'affiliate_lead' AND al.id = a.ref_id AND al.affiliate_id = a.affiliate_id
        WHERE a.affiliate_id = ? AND a.brand_id = ?
        ORDER BY a.created_at DESC
        LIMIT ?`,
      [String(affiliate.id), ctx.brandId, limit],
    ).catch(() => []);

    const closedStatuses = new Set([
      "lost", "converted", "recycled", "dismiss", "channel_unavailable", "not_matching",
    ]);

    res.json({
      success: true,
      activities: (rows || []).map((row) => {
        const contactStatus = String(row.contact_status || row.assignment_stage || "").toLowerCase() || null;
        const exists = Number(row.contact_exists) === 1;
        const removed = !exists;
        const archived = exists && contactStatus ? closedStatuses.has(contactStatus) : false;
        const action = String(row.action || "note");
        const channel = normalizeChannel(row.channel, action);
        return {
          id: String(row.id),
          ref_type: String(row.ref_type),
          ref_id: String(row.ref_id),
          contact_name: String(row.contact_name || "Contato"),
          phone: row.phone ? String(row.phone) : null,
          contact_status: contactStatus,
          contact_exists: exists,
          contact_removed: removed,
          contact_archived: archived && !removed,
          action,
          channel,
          duration_sec: row.duration_sec != null ? Number(row.duration_sec) : null,
          label: multiChannelActionLabel(action, channel),
          message: row.message_text ? String(row.message_text) : null,
          note: row.note ? String(row.note) : null,
          at: row.created_at ? new Date(row.created_at).toISOString() : null,
        };
      }),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar histórico operacional" });
  }
});

router.get("/opportunities", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const segment = String(req.query.segment || "all").trim() as any;
    const page = Math.max(1, Number(req.query.page) || 1);
    /* Cap 500 — payloads gigantes derrubam mobile (Failed to fetch / timeout) */
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const includeClosedRaw = String(req.query.include_closed ?? "").trim().toLowerCase();
    const includeClosed =
      includeClosedRaw === "0" || includeClosedRaw === "false"
        ? false
        : includeClosedRaw === "1" || includeClosedRaw === "true"
          ? true
          : segment === "closed" || segment === "lost" || segment === "all";
    try {
      const data = await affiliateCrmService.listOpportunitiesWithStats(
        String(affiliate.id),
        ctx.brandId,
        { segment, page, limit, includeClosed },
      );
      const opportunities = await enrichContactOverrides(String(affiliate.id), ctx.brandId, data.opportunities || []);
      const allOpen = await enrichContactOverrides(String(affiliate.id), ctx.brandId, data.all_open || []);
      const allClosed = await enrichContactOverrides(String(affiliate.id), ctx.brandId, data.all_closed || []);
      return res.json({ success: true, ...data, opportunities, all_open: allOpen, all_closed: allClosed });
    } catch (inner: any) {
      console.warn("[affiliate] opportunities withStats failed:", inner?.message || inner);
      // Fallback mínimo: só abertos, sem closed
      try {
        const data = await affiliateCrmService.listOpportunities(String(affiliate.id), ctx.brandId, {
          segment: segment === "inbox" || segment === "fila" ? "all" : segment,
          page: 1,
          limit: Math.min(limit, 200),
        });
        const open = await enrichContactOverrides(String(affiliate.id), ctx.brandId, data.opportunities || []);
        return res.json({
          success: true,
          stats: {
            total_open: open.length,
            phase_inbox: open.filter((i: any) =>
              i.operational_phase === "new" || i.operational_phase === "to_contact",
            ).length,
            phase_new: open.filter((i: any) => i.operational_phase === "new").length,
            phase_to_contact: open.filter((i: any) => i.operational_phase === "to_contact").length,
            phase_contacted: open.filter((i: any) => i.operational_phase === "contacted").length,
            phase_engaged: open.filter((i: any) => i.operational_phase === "engaged").length,
            phase_closed: 0,
            followup_due: open.filter((i: any) => i.followup_due).length,
          },
          opportunities: open,
          all_open: open,
          all_closed: [],
          facets: data.facets || { niches: [], regions: [], channels: { total: open.length } },
          total: open.length,
          page: 1,
          limit,
          segment,
          warning: String(inner?.message || "stats_degraded"),
        });
      } catch (fallbackErr: any) {
        return res.status(500).json({
          error: fallbackErr?.message || inner?.message || "Falha ao listar oportunidades",
        });
      }
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar oportunidades" });
  }
});

async function ensureAffiliateContactOverridesSchema() {
  await query(`CREATE TABLE IF NOT EXISTS affiliate_contact_overrides (
    id TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, brand_id TEXT NOT NULL,
    ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, source_phone TEXT,
    contact_phone TEXT, responsible_name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (affiliate_id, brand_id, ref_type, ref_id)
  )`);
}

async function enrichContactOverrides(affiliateId: string, brandId: string, items: any[]) {
  if (!items.length) return items;
  await ensureAffiliateContactOverridesSchema();
  const rows = await query<any[]>(
    `SELECT ref_type, ref_id, source_phone, contact_phone, responsible_name
     FROM affiliate_contact_overrides WHERE affiliate_id = ? AND brand_id = ?`,
    [affiliateId, brandId],
  );
  const byRef = new Map(rows.map((row) => [`${row.ref_type}:${row.ref_id}`, row]));
  return items.map((item) => {
    const override = byRef.get(`${item.ref_type}:${item.ref_id}`);
    const sourcePhone = override?.source_phone || item.source_phone || item.phone || null;
    const contactPhone = override?.contact_phone || item.contact_phone || item.phone || null;
    return {
      ...item,
      name: override?.responsible_name || item.name,
      responsible_name: override?.responsible_name || item.responsible_name || item.name,
      source_phone: sourcePhone,
      contact_phone: contactPhone,
      phone: contactPhone,
      channels: { ...(item.channels || {}), phone: contactPhone },
    };
  });
}

/** Pool aberto de oportunidades (ainda não assumidas) */
router.get("/opportunities/pool", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 150);

    // Pool primeiro; elegibilidade não pode derrubar a listagem
    let pool: any = {
      items: [],
      open_pool_enabled: true,
      claim_ttl_minutes: 90,
      total: 0,
      facets: { niches: [], regions: [], channels: { total: 0 } },
    };
    try {
      pool = await affiliateDistributionService.listOpenPoolForAffiliate({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateId: String(affiliate.id),
        limit,
      });
    } catch (poolErr: any) {
      console.warn("[affiliate] pool list failed:", poolErr?.message || poolErr);
      return res.status(200).json({
        success: true,
        items: [],
        open_pool_enabled: true,
        claim_ttl_minutes: 90,
        total: 0,
        can_claim: false,
        claim_blockers: ["Não foi possível carregar o pool agora. Tente de novo."],
        error_soft: String(poolErr?.message || "pool_failed"),
      });
    }

    let eligibility: any = {
      can_claim: true,
      claim_blockers: [] as string[],
      registered_whatsapp_ok: false,
      registered_whatsapp: null,
      whatsapp_status: null,
    };
    try {
      eligibility = await affiliateDistributionService.syncAffiliateDistributionStatus({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateId: String(affiliate.id),
        affiliateUserId: ctx.affiliateUserId,
      });
    } catch (eligErr: any) {
      console.warn("[affiliate] eligibility failed (pool still returned):", eligErr?.message || eligErr);
    }

    res.json({
      success: true,
      ...pool,
      can_claim: eligibility.can_claim !== false,
      claim_blockers: eligibility.claim_blockers || [],
      registered_whatsapp_ok: !!eligibility.registered_whatsapp_ok,
      registered_whatsapp: eligibility.registered_whatsapp || null,
      whatsapp_status: eligibility.whatsapp_status,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar oportunidades disponíveis" });
  }
});

/** Afiliado assume atendimento exclusivo */
router.post("/opportunities/pool/:queueId/claim", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const result = await affiliateDistributionService.claimQueueItemForAffiliate({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateId: String(affiliate.id),
      affiliateUserId: ctx.affiliateUserId,
      queueId: String(req.params.queueId),
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    const msg = e?.message || "Falha ao assumir oportunidade";
    const status = /já foi assumida|já está em atendimento/i.test(msg) ? 409 : 400;
    res.status(status).json({ error: msg });
  }
});

async function resolveAffiliateOpportunity(ctx: AffiliateContext, affiliateId: string, refType: string, refId: string) {
  if (refType === "assignment") {
    const row = await queryOne<any>(
      `SELECT pa.*, bu.name AS brand_name
       FROM prospect_assignments pa
       INNER JOIN brand_units bu ON bu.id = pa.brand_id
       WHERE pa.id = ? AND pa.affiliate_id = ? AND pa.brand_id = ? LIMIT 1`,
      [refId, affiliateId, ctx.brandId],
    );
    if (!row) return null;
    let metadata: Record<string, any> = {};
    try { metadata = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json || "{}") : (row.metadata_json || {}); } catch { metadata = {}; }
    const override = await getContactOverride(affiliateId, ctx.brandId, refType, refId);
    return {
      ref_type: "assignment",
      ref_id: refId,
      prospect_id: row.prospect_id ? String(row.prospect_id) : null,
      name: override?.responsible_name || row.prospect_name,
      phone: override?.contact_phone || row.prospect_phone,
      source_phone: override?.source_phone || row.prospect_phone,
      contact_phone: override?.contact_phone || row.prospect_phone,
      responsible_name: override?.responsible_name || row.prospect_name,
      city: row.prospect_city,
      region: row.prospect_region,
      brand_name: row.brand_name,
      status: row.current_stage,
      notes: row.notes,
      niche: metadata.niche || metadata.keyword || metadata.segment || metadata.category || null,
      product_name: metadata.product_name || null,
      source: row.source || "distribution",
      received_at: row.assigned_at || null,
      assigned_at: row.assigned_at || null,
      last_interaction_at: row.last_interaction_at || null,
      next_followup_at: row.next_followup_at || null,
    };
  }
  if (refType === "affiliate_lead") {
    const row = await queryOne<any>(
      `SELECT al.*, bu.name AS brand_name
       FROM affiliate_leads al
       INNER JOIN brand_units bu ON bu.id = al.brand_id
       WHERE al.id = ? AND al.affiliate_id = ? AND al.brand_id = ? LIMIT 1`,
      [refId, affiliateId, ctx.brandId],
    );
    if (!row) return null;
    const override = await getContactOverride(affiliateId, ctx.brandId, refType, refId);
    return {
      ref_type: "affiliate_lead",
      ref_id: refId,
      name: override?.responsible_name || row.customer_name,
      phone: override?.contact_phone || row.phone,
      source_phone: override?.source_phone || row.phone,
      contact_phone: override?.contact_phone || row.phone,
      responsible_name: override?.responsible_name || row.customer_name,
      city: null,
      region: null,
      brand_name: row.brand_name,
      status: row.affiliate_status,
      notes: row.affiliate_notes,
      niche: row.cta_type || row.source_type || null,
      product_name: row.product_name || null,
      incoming_message: row.message || null,
      source: "own_link",
      received_at: row.created_at || null,
      assigned_at: row.created_at || null,
      last_interaction_at: row.updated_at || null,
      next_followup_at: null,
    };
  }
  return null;
}

async function getContactOverride(affiliateId: string, brandId: string, refType: string, refId: string) {
  await ensureAffiliateContactOverridesSchema();
  return queryOne<any>(
    `SELECT source_phone, contact_phone, responsible_name FROM affiliate_contact_overrides
     WHERE affiliate_id = ? AND brand_id = ? AND ref_type = ? AND ref_id = ? LIMIT 1`,
    [affiliateId, brandId, refType, refId],
  );
}

router.patch("/opportunities/:refType/:refId/contact", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const refType = String(req.params.refType || "");
    const refId = String(req.params.refId || "");
    const item = await resolveAffiliateOpportunity(ctx, String(affiliate.id), refType, refId);
    if (!item) return res.status(404).json({ error: "Contato não encontrado nesta fila" });
    const responsibleName = String(req.body?.responsible_name || "").trim().slice(0, 160) || null;
    const contactPhone = String(req.body?.contact_phone || "").trim().slice(0, 40) || null;
    if (contactPhone && contactPhone.replace(/\D/g, "").length < 8) {
      return res.status(400).json({ error: "Informe um telefone válido" });
    }
    await ensureAffiliateContactOverridesSchema();
    const sourcePhone = item.source_phone || item.phone || null;
    await query(
      `INSERT INTO affiliate_contact_overrides
       (id, affiliate_id, brand_id, ref_type, ref_id, source_phone, contact_phone, responsible_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (affiliate_id, brand_id, ref_type, ref_id) DO UPDATE SET
         contact_phone = EXCLUDED.contact_phone, responsible_name = EXCLUDED.responsible_name,
         updated_at = CURRENT_TIMESTAMP`,
      [randomUUID(), String(affiliate.id), ctx.brandId, refType, refId, sourcePhone, contactPhone, responsibleName],
    );
    await recordAffiliateManualAction({
      ctx, affiliateId: String(affiliate.id), refType, refId,
      action: "contact_updated", channel: "phone",
      note: "Contato operacional atualizado; número de origem preservado",
      meta: { source_phone: sourcePhone, contact_phone: contactPhone, responsible_name: responsibleName },
    });
    res.json({ success: true, source_phone: sourcePhone, contact_phone: contactPhone, responsible_name: responsibleName });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar contato" });
  }
});

async function recordAffiliateManualAction(input: {
  ctx: AffiliateContext;
  affiliateId: string;
  refType: string;
  refId: string;
  action: string;
  message?: string | null;
  note?: string | null;
  channel?: string | null;
  durationSec?: number | null;
  meta?: Record<string, unknown> | null;
}) {
  await ensureManualActionsChannelSchema();
  const channel = normalizeChannel(input.channel, input.action);
  const duration =
    input.durationSec != null && Number.isFinite(Number(input.durationSec))
      ? Math.max(0, Math.min(3600 * 4, Math.round(Number(input.durationSec))))
      : null;
  const metaJson = input.meta && Object.keys(input.meta).length
    ? JSON.stringify(input.meta).slice(0, 4000)
    : null;
  await query(
    `INSERT INTO affiliate_manual_actions
     (id, owner_user_id, brand_id, affiliate_id, ref_type, ref_id, action, message_text, note, channel, duration_sec, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.ctx.ownerUserId,
      input.ctx.brandId,
      input.affiliateId,
      input.refType,
      input.refId,
      input.action,
      input.message || null,
      input.note || null,
      channel,
      duration,
      metaJson,
    ],
  );
}

/** Timeline de ações manuais do afiliado neste contato */
router.get("/opportunities/:refType/:refId/history", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const refType = String(req.params.refType || "").trim();
    const refId = String(req.params.refId || "").trim();
    const item = await resolveAffiliateOpportunity(ctx, String(affiliate.id), refType, refId);
    if (!item) return res.status(404).json({ error: "Contato não encontrado nesta fila" });

    await ensureManualActionsChannelSchema();

    const rows = await query<any[]>(
      `SELECT action, message_text, note, created_at, channel, duration_sec
       FROM affiliate_manual_actions
       WHERE affiliate_id = ? AND brand_id = ? AND ref_type = ? AND ref_id = ?
       ORDER BY created_at DESC
       LIMIT 40`,
      [String(affiliate.id), ctx.brandId, refType, refId],
    ).catch(() => []);

    type TimelineEvent = {
      action: string
      label: string
      message: string | null
      note: string | null
      at: string | null
      source: "action" | "meta"
      channel?: ContactChannel
      duration_sec?: number | null
    }

    const events: TimelineEvent[] = (rows || []).map((r) => {
      const action = String(r.action || "");
      const channel = normalizeChannel(r.channel, action);
      return {
        action,
        label: multiChannelActionLabel(action, channel),
        message: r.message_text ? String(r.message_text).slice(0, 400) : null,
        note: r.note ? String(r.note).slice(0, 400) : null,
        at: r.created_at ? String(r.created_at) : null,
        source: "action" as const,
        channel,
        duration_sec: r.duration_sec != null ? Number(r.duration_sec) : null,
      };
    });

    const channel_summary = summarizeAttemptsByChannel(
      (rows || []).map((r) => ({
        action: r.action,
        channel: r.channel,
        created_at: r.created_at,
      })),
    );

    /* Eventos sintéticos a partir do próprio registro */
    const synthetic: TimelineEvent[] = [];
    if (item.received_at || item.assigned_at) {
      synthetic.push({
        action: "received",
        label: item.source === "own_link" ? "Recebido pelo seu link" : "Atribuído a você",
        message: null,
        note: null,
        at: String(item.received_at || item.assigned_at || ""),
        source: "meta",
      });
    }
    if (item.last_interaction_at && !events.some((e) => e.at === String(item.last_interaction_at))) {
      synthetic.push({
        action: "interaction",
        label: "Última interação",
        message: null,
        note: item.notes ? String(item.notes).slice(0, 200) : null,
        at: String(item.last_interaction_at),
        source: "meta",
      });
    }

    const merged = [...events, ...synthetic]
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
      .slice(0, 50);

    res.json({
      success: true,
      ref_type: refType,
      ref_id: refId,
      events: merged,
      channel_summary,
      notes: item.notes || null,
      status: item.status || null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar histórico" });
  }
});

router.post("/opportunities/:refType/:refId/assist", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const item = await resolveAffiliateOpportunity(ctx, String(affiliate.id), String(req.params.refType), String(req.params.refId));
    if (!item) return res.status(404).json({ error: "Contato não encontrado nesta fila" });
    if (!String(item.phone || "").replace(/\D/g, "")) return res.status(400).json({ error: "Este contato não possui WhatsApp" });

    const intent = String(req.body?.intent || "primeiro_contato").trim();
    const instruction = String(req.body?.instruction || "").trim().slice(0, 600);
    const firstName = String(item.name || "").trim().split(/\s+/)[0] || "tudo bem";

    // Contexto comercial da MARCA (cliente final) — nunca do programa de afiliados
    const brandRow = await queryOne<any>(
      `SELECT name, slogan FROM brand_units WHERE id = ? LIMIT 1`,
      [ctx.brandId],
    ).catch(() => null);
    const brandName = String(brandRow?.name || item.brand_name || "").trim() || "a marca";
    const brandSlogan = String(brandRow?.slogan || "").trim();
    const productRows = await query<any[]>(
      `SELECT name FROM products
       WHERE brand_id = ? AND COALESCE(active, TRUE) = TRUE
       ORDER BY name ASC
       LIMIT 5`,
      [ctx.brandId],
    ).catch(() => []);
    const catalogNames = (productRows || [])
      .map((p) => String(p.name || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const leadProduct = String(item.product_name || "").trim();
    const looksLikeProgram =
      /seja\s+parceiro|programa\s+de\s+afiliad|afiliad[oa]s?|ganhe\s+comiss|comiss[aã]o/i.test(
        leadProduct,
      );
    const productLine =
      (leadProduct && !looksLikeProgram ? leadProduct : "")
      || (catalogNames.length ? catalogNames.join(", ") : "")
      || brandSlogan
      || "produtos e soluções da marca";

    const isOptIn =
      /optin|opt-in|autoriza|consentimento|lgpd/i.test(intent)
      || /optin|opt-in|autoriza|consentimento|lgpd/i.test(instruction);

    const prompt = isOptIn
      ? `Você é o copiloto comercial de um afiliado da marca "${brandName}" (empresa real que vende ao cliente final).
Crie UMA mensagem curta de WhatsApp pedindo OPT-IN / autorização LGPD antes de enviar material comercial.
Destinatário (primeiro nome): ${firstName}.
Cidade/região do lead: ${item.city || item.region || "não informada"}.
Nicho/segmento do lead (se houver): ${item.niche || "não informado"}.
Produto/serviço da MARCA (oferta ao cliente final — NUNCA o nome do programa de afiliados): ${productLine}.
${brandSlogan ? `Slogan da marca: ${brandSlogan}.` : ""}
Instrução do afiliado: ${instruction || "nenhuma"}.

Regras:
- Identifique a marca "${brandName}" e o produto/serviço real dela (${productLine}).
- NÃO mencione "programa de afiliados", comissão, ser parceiro, ganhar com indicação, ou recrutamento.
- Peça autorização para enviar apresentação comercial; se não autorizar, diga que remove o contato.
- Tom humano, respeitoso, sem pressão. Responda SOMENTE com a mensagem pronta.`
      : `Você é o copiloto comercial de um afiliado da marca "${brandName}" (venda ao cliente final).
Crie UMA mensagem de WhatsApp humana, curta, respeitosa e personalizada para ${firstName}.
Objetivo: ${intent}. Nicho/contexto: ${item.niche || "não informado"}. Cidade: ${item.city || item.region || "não informada"}.
Produto/serviço da marca (NÃO use nome de programa de afiliados): ${productLine}.
Histórico/observação: ${item.incoming_message || item.notes || "sem histórico"}.
Instrução do afiliado: ${instruction || "nenhuma"}.
Não invente preço, promoção ou benefício. Não fale de comissão ou programa de parceiros.
Se for primeiro contato, identifique a marca e dê uma saída educada. Termine com uma pergunta simples. Responda somente com a mensagem pronta.`;

    const generated = await aiRouter.generateText(prompt, { userId: ctx.ownerUserId, brandId: ctx.brandId }, {
      temperature: 0.55, functionKey: "text.affiliate.manual_assist",
    });
    const message = String(generated.text || "").trim().replace(/^['\"]|['\"]$/g, "");
    await recordAffiliateManualAction({ ctx, affiliateId: String(affiliate.id), refType: item.ref_type, refId: item.ref_id, action: "ai_draft", message });
    res.json({
      success: true,
      message,
      context: {
        ...item,
        brand_name: brandName,
        product_line: productLine,
        catalog_products: catalogNames,
      },
      provider: generated.provider,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao preparar mensagem" });
  }
});

router.patch("/opportunities/:refType/:refId/progress", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const refType = String(req.params.refType || "");
    const refId = String(req.params.refId || "");
    const item = await resolveAffiliateOpportunity(ctx, String(affiliate.id), refType, refId);
    if (!item) return res.status(404).json({ error: "Contato não encontrado nesta fila" });
    const action = String(req.body?.action || "").trim();
    const message = String(req.body?.message || "").trim().slice(0, 4000) || null;
    const note = String(req.body?.note || "").trim().slice(0, 2000) || null;
    const reason = String(req.body?.reason || "").trim().slice(0, 120) || null;
    const taskId = String(req.body?.task_id || "").trim() || null;
    const followupDaysBody =
      req.body?.followup_days != null && Number.isFinite(Number(req.body.followup_days))
        ? Number(req.body.followup_days)
        : null;
    const durationSecBody =
      req.body?.duration_sec != null && Number.isFinite(Number(req.body.duration_sec))
        ? Number(req.body.duration_sec)
        : null;
    const channel = normalizeChannel(
      req.body?.channel || defaultChannelForAction(action),
      action,
    );

    await ensureAttendanceTasksSchema();
    await ensureManualActionsChannelSchema();

    const effect = resolveCadence(action, {
      followupDaysOverride:
        action === "waiting" || action === "callback_requested" ? followupDaysBody : null,
    });
    if (!effect) return res.status(400).json({ error: "Etapa inválida" });

    /* Conclui a tarefa específica do modal (idempotente se já done). */
    if (taskId && action !== "note") {
      await completeAttendanceTask({
        affiliateId: String(affiliate.id),
        brandId: ctx.brandId,
        taskId,
      }).catch(() => undefined);
    }

    const defaultNotes: Record<string, string> = {
      not_matching: "Não correspondente (nicho errado, número mudou ou contato inválido)",
      channel_unavailable: "Canal indisponível ao tentar contato",
      auto_reply: "Resposta automática (bot) — mensagem entregue, sem conversa humana",
      lost: "Sem interesse — excluído da fila",
      dismiss: "Oculto pelo afiliado",
    };

    const noteParts = [
      note || defaultNotes[action] || null,
      reason && reason !== action ? `motivo: ${reason}` : null,
      effect.archive ? `fase: ${effect.phase}` : null,
    ].filter(Boolean);
    const combinedNote = noteParts.length ? noteParts.join(" · ").slice(0, 2000) : null;

    /* ── Persistência unificada (assignment + lead) via cadência ── */
    if (refType === "assignment") {
      const stage =
        action === "note"
          ? String(item.status || "assigned_to_affiliate")
          : effect.assignmentStage;
      const assignmentStatus =
        action === "note"
          ? "active"
          : effect.assignmentStatus;

      const sets = [
        "current_stage = ?",
        "assignment_status = ?",
        "last_interaction_at = CURRENT_TIMESTAMP",
      ];
      const params: any[] = [stage, assignmentStatus];

      if (action !== "note") {
        if (effect.followupDays != null && !effect.archive) {
          sets.push(`next_followup_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 day')`);
          params.push(effect.followupDays);
        } else if (effect.clearFollowup || effect.archive) {
          sets.push("next_followup_at = NULL");
        }
        if (effect.archive) {
          sets.push("removed_reason = ?");
          params.push(String(reason || action).slice(0, 80));
        }
      }

      if (combinedNote) {
        sets.push("notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || E'\\n' || ? END");
        params.push(combinedNote, combinedNote);
      }

      params.push(refId, affiliate.id, ctx.brandId);
      await query(
        `UPDATE prospect_assignments SET ${sets.join(", ")}
         WHERE id = ? AND affiliate_id = ? AND brand_id = ?`,
        params,
      );
    } else {
      const status =
        action === "note"
          ? String(item.status || "new")
          : effect.leadStatus;

      const sets = ["affiliate_status = ?", "updated_at = CURRENT_TIMESTAMP"];
      const params: any[] = [status];

      if (action !== "note") {
        if (effect.followupDays != null && !effect.archive) {
          sets.push(`next_followup_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 day')`);
          params.push(effect.followupDays);
        } else if (effect.clearFollowup || effect.archive) {
          sets.push("next_followup_at = NULL");
        }
        if (effect.archive) {
          sets.push("removed_reason = ?");
          params.push(String(reason || action).slice(0, 80));
        }
      }

      if (combinedNote) {
        sets.push(
          "affiliate_notes = CASE WHEN affiliate_notes IS NULL OR affiliate_notes = '' THEN ? ELSE affiliate_notes || E'\\n' || ? END",
        );
        params.push(combinedNote, combinedNote);
      }
      params.push(refId, affiliate.id, ctx.brandId);
      await query(
        `UPDATE affiliate_leads SET ${sets.join(", ")}
         WHERE id = ? AND affiliate_id = ? AND brand_id = ?`,
        params,
      );
    }

    /* Anti-loop: mesmo resultado em <10 min no mesmo canal → não duplica activity */
    const isRepeatable = isInitiatingAction(action) || action === "note";
    if (!isRepeatable) {
      const last = await queryOne<any>(
        `SELECT action, channel, created_at FROM affiliate_manual_actions
         WHERE affiliate_id = ? AND brand_id = ? AND ref_type = ? AND ref_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [String(affiliate.id), ctx.brandId, refType, refId],
      ).catch(() => null);
      const lastChannel = normalizeChannel(last?.channel, last?.action);
      if (
        last
        && String(last.action) === action
        && lastChannel === channel
        && last.created_at
        && Date.now() - new Date(last.created_at).getTime() < 10 * 60 * 1000
      ) {
        const existingNext = await getNextPendingTask({
          affiliateId: String(affiliate.id),
          brandId: ctx.brandId,
          refType,
          refId,
        });
        return res.json({
          success: true,
          action,
          reason: reason || null,
          removed_from_queue: effect.archive,
          phase: effect.phase,
          instruction: effect.instruction,
          toast: "Resultado já registrado · sem alteração",
          template_id: effect.templateId,
          duplicate_skipped: true,
          next_task: existingNext
            ? {
                id: existingNext.id,
                task_type: existingNext.task_type,
                due_at: existingNext.due_at,
                instruction: existingNext.instruction,
                template_id: existingNext.template_id,
                is_due: new Date(existingNext.due_at).getTime() <= Date.now(),
              }
            : null,
        });
      }
    }

    const cadence = await applyCadenceAfterProgress({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateId: String(affiliate.id),
      refType,
      refId,
      action,
      followupDaysOverride:
        action === "waiting" || action === "callback_requested" ? followupDaysBody : null,
    });

    await recordAffiliateManualAction({
      ctx,
      affiliateId: String(affiliate.id),
      refType,
      refId,
      action,
      message,
      note: combinedNote,
      channel,
      durationSec: durationSecBody,
      meta: { channel },
    });

    /**
     * Negativos de rede: não correspondente / canal morto.
     * Sai da fila de TODOS os afiliados e não reaparece no pool.
     */
    if (
      action === "not_matching"
      || action === "channel_unavailable"
    ) {
      try {
        await affiliateDistributionService.suppressProspectFromNetwork({
          ownerUserId: ctx.ownerUserId,
          brandId: ctx.brandId,
          reason: action,
          prospectId: (item as any).prospect_id || null,
          phone: (item as any).source_phone || (item as any).phone || null,
          affiliateId: String(affiliate.id),
          sourceRefType: refType,
          sourceRefId: refId,
          note: combinedNote,
        });
      } catch (supErr: any) {
        console.warn("[affiliate] network suppress failed:", supErr?.message || supErr);
      }
    }

    /* Aprendizado: captação → resultado (positivo/negativo). Ligação conta como "sent". */
    const feedbackAction: CaptureFeedbackEvent | null =
      action === "called"
        ? "sent"
        : (
          [
            "not_matching",
            "channel_unavailable",
            "lost",
            "replied",
            "negotiating",
            "sent",
            "convert",
          ] as CaptureFeedbackEvent[]
        ).includes(action as CaptureFeedbackEvent)
          ? (action as CaptureFeedbackEvent)
          : null;
    if (feedbackAction) {
      const tax = resolveOpportunityTaxonomy({
        metadata: {
          niche: (item as any).niche,
          keyword: (item as any).niche,
          category: (item as any).niche,
        },
      });
      void recordCaptureFeedback({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateId: String(affiliate.id),
        event: feedbackAction,
        search_query: tax.search_query || (item as any).niche || null,
        place_type: tax.place_type,
        vertical: tax.vertical,
        niche: tax.niche || (item as any).niche || null,
        prospect_name: (item as any).name || null,
        ref_type: refType,
        ref_id: refId,
        reason: reason || action,
        note: combinedNote,
      });
    }

    const nextDue = cadence.next_task
      ? new Date(cadence.next_task.due_at).getTime() <= Date.now()
      : false;

    res.json({
      success: true,
      action,
      channel,
      reason: reason || null,
      removed_from_queue: effect.archive,
      phase: effect.phase,
      instruction: effect.instruction,
      toast: effect.toast,
      template_id: effect.templateId,
      duplicate_skipped: false,
      next_task: cadence.next_task
        ? {
            id: cadence.next_task.id,
            task_type: cadence.next_task.task_type,
            due_at: cadence.next_task.due_at,
            instruction: cadence.next_task.instruction,
            template_id: cadence.next_task.template_id,
            is_due: nextDue,
          }
        : null,
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao avançar contato" });
  }
});

/**
 * Lista tarefas de atendimento (cadência).
 * mode=due | upcoming | done | all
 * mode=bundle: devolve due + upcoming + done numa chamada (evita flicker no app)
 */
router.get("/attendance/tasks", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const modeRaw = String(req.query.mode || "due").toLowerCase();
    const horizon = Math.min(Math.max(Number(req.query.horizon_days) || 14, 0), 30);
    const affiliateId = String(affiliate.id);
    const brandId = ctx.brandId;
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    if (modeRaw === "bundle") {
      const [due, upcoming, done] = await Promise.all([
        listDueAttendanceTasks({ affiliateId, brandId, mode: "due", limit: 100 }),
        listDueAttendanceTasks({ affiliateId, brandId, mode: "upcoming", horizonDays: horizon, limit: 100 }),
        listDueAttendanceTasks({ affiliateId, brandId, mode: "done", limit: 80 }),
      ]);
      const overdue = due.filter((t) => new Date(t.due_at).getTime() < todayStart.getTime());
      const dueToday = due.filter((t) => {
        const ts = new Date(t.due_at).getTime();
        return ts >= todayStart.getTime() && ts <= now;
      });
      const doneToday = done.filter((t) => {
        const at = t.completed_at || t.due_at;
        const ts = new Date(at).getTime();
        return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
      });
      return res.json({
        success: true,
        mode: "bundle",
        tasks: due,
        due,
        upcoming,
        done,
        summary: {
          total: due.length,
          overdue: overdue.length,
          due_today: dueToday.length,
          due_now: due.length,
          upcoming_count: upcoming.length,
          done_count: done.length,
          done_today: doneToday.length,
        },
      });
    }

    const mode: AttendanceTasksMode =
      modeRaw === "upcoming" || modeRaw === "all" || modeRaw === "done" ? modeRaw : "due";
    const tasks = await listDueAttendanceTasks({
      affiliateId,
      brandId,
      mode,
      horizonDays: horizon,
      limit: 100,
    });
    const overdue = mode === "due" || mode === "all"
      ? tasks.filter((t) => t.status === "pending" && new Date(t.due_at).getTime() < todayStart.getTime())
      : [];
    const dueToday = mode === "due" || mode === "all"
      ? tasks.filter((t) => {
          if (t.status !== "pending") return false;
          const ts = new Date(t.due_at).getTime();
          return ts >= todayStart.getTime() && ts <= now;
        })
      : [];
    let upcomingCount = 0;
    if (mode === "due") {
      const upcoming = await listDueAttendanceTasks({
        affiliateId,
        brandId,
        mode: "upcoming",
        horizonDays: horizon,
        limit: 100,
      });
      upcomingCount = upcoming.length;
    } else if (mode === "upcoming") {
      upcomingCount = tasks.length;
    }
    res.json({
      success: true,
      mode,
      tasks,
      summary: {
        total: tasks.length,
        overdue: overdue.length,
        due_today: dueToday.length,
        due_now: mode === "due" ? tasks.length : tasks.filter((t) => new Date(t.due_at).getTime() <= now).length,
        upcoming_count: upcomingCount,
        done_count: mode === "done" ? tasks.length : 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar tarefas" });
  }
});

/** Recusar / ocultar oportunidade do pool aberto (só para este afiliado). */
router.post("/opportunities/pool/:queueId/skip", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const queueId = String(req.params.queueId || "").trim();
    if (!queueId) return res.status(400).json({ error: "queueId obrigatório" });
    const reason = String(req.body?.reason || "skipped").trim().slice(0, 80) || "skipped";
    const note = String(req.body?.note || "").trim().slice(0, 500) || null;

    await query(`CREATE TABLE IF NOT EXISTS affiliate_pool_skips (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      queue_id VARCHAR(36) NOT NULL,
      reason VARCHAR(80) NULL,
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (affiliate_id, brand_id, queue_id)
    )`);

    await query(
      `INSERT INTO affiliate_pool_skips
         (id, owner_user_id, brand_id, affiliate_id, queue_id, reason, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (affiliate_id, brand_id, queue_id) DO UPDATE SET
         reason = EXCLUDED.reason,
         note = EXCLUDED.note,
         created_at = CURRENT_TIMESTAMP`,
      [randomUUID(), ctx.ownerUserId, ctx.brandId, affiliate.id, queueId, reason, note],
    ).catch(async () => {
      /* MySQL-style fallback without ON CONFLICT */
      await query(
        `INSERT IGNORE INTO affiliate_pool_skips
           (id, owner_user_id, brand_id, affiliate_id, queue_id, reason, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), ctx.ownerUserId, ctx.brandId, affiliate.id, queueId, reason, note],
      );
    });

    await recordAffiliateManualAction({
      ctx,
      affiliateId: String(affiliate.id),
      refType: "pool",
      refId: queueId,
      action: "pool_skip",
      note: [reason, note].filter(Boolean).join(" · ") || null,
    });

    /* Feedback negativo para aprendizado da captação */
    try {
      const qRow = await queryOne<any>(
        `SELECT q.prospect_name, q.metadata_json, c.category, c.subcategory
         FROM lead_distribution_queue q
         LEFT JOIN customers c ON c.id = q.prospect_id
         WHERE q.id = ? AND q.brand_id = ? LIMIT 1`,
        [queueId, ctx.brandId],
      );
      let meta: Record<string, any> = {};
      try {
        meta = typeof qRow?.metadata_json === "string"
          ? JSON.parse(qRow.metadata_json || "{}")
          : (qRow?.metadata_json || {});
      } catch {
        meta = {};
      }
      const tax = resolveOpportunityTaxonomy({
        metadata: meta,
        customerCategory: qRow?.category,
        customerSubcategory: qRow?.subcategory,
      });
      await recordCaptureFeedback({
        ownerUserId: ctx.ownerUserId,
        brandId: ctx.brandId,
        affiliateId: String(affiliate.id),
        event: reason === "not_matching" || reason === "channel_unavailable"
          ? (reason as CaptureFeedbackEvent)
          : "pool_skip",
        search_query: tax.search_query,
        place_type: tax.place_type,
        vertical: tax.vertical,
        niche: tax.niche,
        prospect_name: qRow?.prospect_name || null,
        ref_type: "pool",
        ref_id: queueId,
        reason,
        note,
      });
    } catch {
      /* não bloqueia skip */
    }

    res.json({ success: true, skipped: true, queue_id: queueId });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao recusar oportunidade" });
  }
});

router.get("/customers", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const status = String(req.query.status || "").trim() || undefined;
    const [data, stats] = await Promise.all([
      affiliateCrmService.listCustomers(String(affiliate.id), ctx.brandId, { page, limit, status }),
      affiliateCrmService.getCustomerStats(String(affiliate.id), ctx.brandId),
    ]);
    res.json({ success: true, stats, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar clientes" });
  }
});

router.get("/leads", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const status = String(req.query.status || "").trim() || undefined;
    const data = await affiliatesService.listAffiliateLeads(String(affiliate.id), ctx.brandId, {
      page,
      limit,
      status,
    });
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar leads" });
  }
});

router.patch("/leads/:leadId", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const updated = await affiliatesService.updateAffiliateLead(
      String(req.params.leadId || "").trim(),
      String(affiliate.id),
      ctx.brandId,
      {
        status: req.body?.status,
        notes: req.body?.notes,
      }
    );
    if (!updated) return res.status(404).json({ error: "Lead não encontrado" });

    res.json({
      success: true,
      lead: {
        id: updated.id,
        name: updated.customer_name,
        phone: updated.phone,
        email: updated.email,
        source_type: updated.source_type,
        cta_type: updated.cta_type,
        product_name: updated.product_name,
        has_order: !!updated.order_id,
        message: updated.message,
        status: updated.affiliate_status,
        notes: updated.affiliate_notes,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar lead" });
  }
});

router.get("/distribution/status", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const snapshot = await affiliateDistributionService.syncAffiliateDistributionStatus({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateId: String(affiliate.id),
      affiliateUserId: ctx.affiliateUserId,
    });
    res.json({ success: true, ...snapshot });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar status de distribuição" });
  }
});

/**
 * Simulador de frete no Atendimento do afiliado.
 * Usa logistics da loja da marca (faixas km + CEP real).
 */
router.post("/freight/quote", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const store = await queryOne<any>(
      `SELECT id, settings_json, brand_id FROM storefront_stores
       WHERE brand_id = ? AND owner_user_id = ?
       ORDER BY (status = 'active') DESC, updated_at DESC LIMIT 1`,
      [ctx.brandId, ctx.ownerUserId],
    ).catch(() => null);

    let logistics: Record<string, any> = {};
    if (store?.settings_json) {
      try {
        const s = typeof store.settings_json === "string"
          ? JSON.parse(store.settings_json)
          : store.settings_json;
        logistics = s?.logistics || {};
      } catch {
        logistics = {};
      }
    }

    const { quoteFreight, isFreightPolicyConfigured } = await import("../services/freightCalculator");
    const quote = await quoteFreight({
      logistics,
      destination: {
        cep: req.body?.cep,
        address: req.body?.address,
        city: req.body?.city,
        state: req.body?.state,
      },
      cartTotal: req.body?.cart_total != null ? Number(req.body.cart_total) : null,
      userId: ctx.ownerUserId,
      brandId: ctx.brandId,
    });

    res.json({
      success: true,
      quote,
      store_id: store?.id || null,
      configured: isFreightPolicyConfigured(logistics),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao calcular frete" });
  }
});

router.get("/freight/cep/:cep", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const { resolveCepOrAddress } = await import("../services/freightCalculator");
    const place = await resolveCepOrAddress(
      { cep: String(req.params.cep || "") },
      { provider: "auto", userId: ctx.ownerUserId, brandId: ctx.brandId },
    );
    if (!place) return res.status(404).json({ error: "CEP não encontrado" });
    res.json({ success: true, place });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao consultar CEP" });
  }
});

/** Aceite explícito de termos a partir do Ao Vivo / elegibilidade */
router.post("/distribution/accept-terms", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const accepted = req.body?.accepted === true || req.body?.terms_accepted === true;
    const snapshot = await affiliateDistributionService.acceptTermsForAffiliate({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateId: String(affiliate.id),
      affiliateUserId: ctx.affiliateUserId,
      accepted,
    });
    res.json({ success: true, accepted: true, ...snapshot });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar aceite dos termos" });
  }
});

/**
 * Copiloto de atendimento — gera resposta alinhada ao treinamento da marca
 * a partir de texto colado e/ou print da conversa + produtos para conversão.
 */
router.post("/attendance/assist", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const body = req.body || {};
    const conversation = String(body.conversation || body.text || body.message || "").trim();
    const instruction = String(body.instruction || body.hint || "").trim();
    const productId = body.product_id ? String(body.product_id).trim() : null;

    let image: { base64: string; mimeType: string } | null = null;
    const img = body.image || body.screenshot;
    if (img && typeof img === "object") {
      const base64 = String(img.base64 || img.data || "").trim();
      const mimeType = String(img.mimeType || img.mime_type || img.type || "image/jpeg").trim();
      if (base64) image = { base64, mimeType };
    } else if (typeof body.image_base64 === "string" && body.image_base64.trim()) {
      image = {
        base64: body.image_base64.trim(),
        mimeType: String(body.image_mime || body.mime_type || "image/jpeg"),
      };
    }

    if (!conversation && !image) {
      return res.status(400).json({ error: "Cole a conversa ou envie um print da pergunta do cliente" });
    }

    const result = await runAffiliateAttendanceAssist({
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateUserId: ctx.affiliateUserId,
      conversation,
      instruction,
      image,
      productId,
    });

    res.json({
      success: true,
      reply: result.reply,
      customer_question_summary: result.customer_question_summary,
      notes_for_affiliate: result.notes_for_affiliate,
      extracted_text: result.extracted_text,
      products: result.products,
      training_used: result.training_used,
      knowledge_used: result.knowledge_used,
      catalog_used: result.catalog_used,
      provider: result.provider,
      affiliate: {
        code: affiliate.code,
        coupon_code: affiliate.coupon_code,
      },
    });
  } catch (e: any) {
    const msg = e?.message || "Falha ao gerar resposta de atendimento";
    const status = /cole a conversa|imagem inválida|muito grande|não foi possível ler/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

router.get("/assistant-control", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    // Sessões do afiliado: owner_actor_id (created_by costuma ser o dono da marca, não o afiliado).
    const affWhere = `(
      (owner_type = 'affiliate' AND owner_actor_id = ?)
      OR (owner_actor_id = ? AND COALESCE(owner_type, '') IN ('affiliate', ''))
      OR (created_by = ? AND owner_type = 'affiliate')
    )`;
    const affJoinWhere = `(
      (i.owner_type = 'affiliate' AND i.owner_actor_id = ?)
      OR (i.owner_actor_id = ? AND COALESCE(i.owner_type, '') IN ('affiliate', ''))
      OR (i.created_by = ? AND i.owner_type = 'affiliate')
    )`;
    const affParams = [ctx.affiliateUserId, ctx.affiliateUserId, ctx.affiliateUserId];

    const [control, globalState, instanceStats, conversationStats, campaignStats, health] = await Promise.all([
      queryOne<any>(
        `SELECT assistant_enabled AS enabled, updated_at FROM affiliates
         WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
        [ctx.affiliateUserId, ctx.brandId]
      ).catch(() => null),
      queryOne<any>(
        `SELECT auto_reply_enabled, reason FROM ai_global_settings WHERE brand_id = ? LIMIT 1`,
        [ctx.brandId]
      ).catch(() => null),
      queryOne<any>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('connected', 'open') THEN 1 ELSE 0 END) AS connected
         FROM whatsapp_instances
         WHERE (brand_id = ? OR brand_id IS NULL OR brand_id = '')
           AND ${affWhere}`,
        [ctx.brandId, ...affParams]
      ).catch(() => null),
      queryOne<any>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN c.ai_mode = 'autonomous' THEN 1 ELSE 0 END) AS autonomous,
                SUM(CASE WHEN c.unread_count > 0 THEN 1 ELSE 0 END) AS waiting
         FROM whatsapp_conversations c
         JOIN whatsapp_instances i ON i.id = c.instance_id
         WHERE (i.brand_id = ? OR i.brand_id IS NULL OR i.brand_id = '')
           AND ${affJoinWhere}
           AND c.status = 'open'`,
        [ctx.brandId, ...affParams]
      ).catch(() => null),
      queryOne<any>(
        `SELECT COUNT(*) AS campaigns
         FROM campaign_history ch
         JOIN whatsapp_instances i ON i.id = ch.instance_id
         WHERE (i.brand_id = ? OR i.brand_id IS NULL OR i.brand_id = '')
           AND ${affJoinWhere}
           AND ch.status IN ('active','running','scheduled','paused')`,
        [ctx.brandId, ...affParams]
      ).catch(() => null),
      getHealthSnapshot({
        brandId: ctx.brandId,
        isAffiliate: true,
        ownerActorId: ctx.affiliateUserId,
      }).catch(() => null),
    ]);

    const affiliateEnabled = control ? Boolean(control.enabled) : true;
    const organizationEnabled = globalState ? Boolean(globalState.auto_reply_enabled) : false;

    // Runtime health > DB status (evita fantasma / subcontagem)
    const healthConnected = Number(health?.summary?.connected || 0);
    const healthTotal = Number(health?.summary?.total || 0);
    const dbConnected = Number(instanceStats?.connected || 0);
    const dbTotal = Number(instanceStats?.total || 0);
    const connected = Math.max(healthConnected, dbConnected);
    const total = Math.max(healthTotal, dbTotal, connected);
    const perConnection = 40;
    const dailyCapacity = connected * perConnection;

    res.json({
      success: true,
      assistant: {
        affiliate_enabled: affiliateEnabled,
        organization_enabled: organizationEnabled,
        effective_enabled: affiliateEnabled && organizationEnabled,
        organization_reason: globalState?.reason || null,
        updated_at: control?.updated_at || null,
      },
      connections: {
        total,
        connected,
        daily_capacity: dailyCapacity,
        capacity_per_connection: perConnection,
      },
      conversations: {
        total: Number(conversationStats?.total || 0),
        autonomous: Number(conversationStats?.autonomous || 0),
        waiting: Number(conversationStats?.waiting || 0),
      },
      campaigns: {
        active: Number(campaignStats?.campaigns || 0),
        queued: 0,
        sent_today: 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar controle do assistente" });
  }
});

router.patch("/assistant-control", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Informe se o assistente deve ficar ativo" });
    await query(`ALTER TABLE affiliates ADD COLUMN assistant_enabled BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => undefined);
    await query(
      `UPDATE affiliates SET assistant_enabled = ?, updated_at = NOW()
       WHERE affiliate_user_id = ? AND brand_id = ?`,
      [req.body.enabled, ctx.affiliateUserId, ctx.brandId]
    );
    res.json({ success: true, affiliate_enabled: req.body.enabled });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar o assistente" });
  }
});

router.get("/distribution/assignments", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const activity = await affiliateDistributionService.listSentActivityForAffiliate(
      String(affiliate.id),
      ctx.brandId,
      limit
    );
    res.json({ success: true, assignments: activity, activity });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar oportunidades" });
  }
});

router.get("/distribution/alerts", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const alerts = await affiliateDistributionService.listAlerts(ctx.affiliateUserId, ctx.brandId);
    res.json({ success: true, alerts });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar alertas" });
  }
});

router.post("/distribution/assignments/:assignmentId/convert", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    const assignmentId = String(req.params.assignmentId || "").trim();
    const result = await affiliateDistributionService.convertAssignment({
      assignmentId,
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateUserId: ctx.affiliateUserId,
      orderId: String(req.body?.order_id || "").trim() || null,
      orderTotal: Number(req.body?.order_total) || 0,
      notes: String(req.body?.notes || "").trim() || null,
    });
    let next_task = null as any;
    if (affiliate) {
      try {
        const cadence = await applyCadenceAfterProgress({
          ownerUserId: ctx.ownerUserId,
          brandId: ctx.brandId,
          affiliateId: String(affiliate.id),
          refType: "assignment",
          refId: assignmentId,
          action: "convert",
        });
        next_task = cadence.next_task;
      } catch {
        /* cadência opcional */
      }
    }
    res.json({ success: true, ...result, next_task, toast: "Cliente registrado · pós-venda em 2 dias" });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao registrar conversão" });
  }
});

router.post("/distribution/alerts/:alertId/read", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    await affiliateDistributionService.markAlertRead(
      String(req.params.alertId || "").trim(),
      ctx.affiliateUserId,
      ctx.brandId
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao marcar alerta" });
  }
});

router.post("/programs/enrollments/:enrollmentId/complete", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;

    const itemType = String(req.body?.item_type || "step").trim() as "step" | "training";
    const itemId = String(req.body?.item_id || "").trim();
    if (!itemId) return res.status(400).json({ error: "item_id obrigatório" });

    const onboarding = await affiliateProgramsService.completeOnboardingItem({
      enrollmentId: String(req.params.enrollmentId || "").trim(),
      affiliateUserId: ctx.affiliateUserId,
      itemType,
      itemId,
      payload: req.body?.payload,
    });
    res.json({ success: true, ...onboarding });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao concluir etapa" });
  }
});

export default router;

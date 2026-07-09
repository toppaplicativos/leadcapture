import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { queryOne } from "../config/database";
import { AffiliatesService } from "../services/affiliates";
import { affiliateProductLearningService } from "../services/affiliateProductLearning";
import { CreativeStudioService } from "../services/creativeStudio";
import { generateAffiliateSharePack } from "../services/affiliateShareStudio";
import { affiliateProgramsService } from "../services/affiliatePrograms";
import {
  formatCommissionDescription,
  formatCommissionShort,
  resolveCommissionConfig,
} from "../services/affiliateCommission";
import { affiliateDistributionService } from "../services/affiliateDistribution";
import { affiliateCrmService } from "../services/affiliateCrm";

const router = Router();
const affiliatesService = new AffiliatesService();
const creativeStudio = new CreativeStudioService();

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
  await affiliatesService.ensureSchema();
  if (ctx.credentialId) {
    const byCred = await affiliatesService.getAffiliateByCredential(ctx.credentialId, ctx.brandId);
    if (byCred) return byCred;
  }
  return queryOne<any>(
    `SELECT * FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
    [ctx.affiliateUserId, ctx.brandId]
  );
}

router.get("/me", async (req: AuthRequest, res: Response) => {
  const ctx = await requireAffiliateCredential(req, res);
  if (!ctx) return;

  const brand = await queryOne<any>(
    `SELECT id, slug, name, logo_url, primary_color, secondary_color, slogan, voice_json
     FROM brand_units WHERE id = ? LIMIT 1`,
    [ctx.brandId]
  );
  if (!brand) return res.status(403).json({ error: "Marca não encontrada" });

  const affiliate = await getAffiliateProfile(ctx);
  const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
  const commission = resolveCommissionConfig({ affiliate, program: config });

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
    },
    affiliate,
    program: config,
    commission: {
      mode: commission.mode,
      value: commission.value,
      source: commission.source,
      label: formatCommissionShort(commission.mode, commission.value),
      description: formatCommissionDescription(commission.mode, commission.value),
      rules: config.commission_rules || null,
    },
  });
});

router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });
    const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
    const stats = await affiliatesService.getDashboardStats(String(affiliate.id), ctx.brandId);
    const commission = resolveCommissionConfig({ affiliate, program: config });
    res.json({
      success: true,
      ...stats,
      commission: {
        mode: commission.mode,
        value: commission.value,
        source: commission.source,
        label: formatCommissionShort(commission.mode, commission.value),
        description: formatCommissionDescription(commission.mode, commission.value),
        rules: config.commission_rules || null,
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
      `SELECT slug FROM brand_units WHERE id = ? LIMIT 1`,
      [ctx.brandId]
    );
    const store = await queryOne<any>(
      `SELECT slug FROM storefront_stores WHERE brand_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
      [ctx.brandId]
    );
    const storeSlug = String(store?.slug || brand?.slug || "").trim();
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const programId = String(req.query.program_id || "").trim() || undefined;

    const linkCtx = await affiliateProgramsService.resolveEnrollmentContext(
      ctx.affiliateUserId,
      ctx.brandId,
      programId
    );
    const enrollment = linkCtx.enrollment;
    const activeProgramId = linkCtx.program_id || undefined;

    const code = String(
      enrollment?.resources_unlocked ? enrollment.enrollment_code : enrollment?.legacy_code || affiliate.code || ""
    ).trim();
    const coupon = String(
      enrollment?.resources_unlocked ? enrollment.coupon_code : enrollment?.legacy_coupon || affiliate.coupon_code || ""
    ).trim().toUpperCase();

    const analytics = await affiliatesService.getAffiliateLinkAnalytics(
      String(affiliate.id),
      ctx.brandId,
      days,
      activeProgramId
    );
    let products = await affiliateProductLearningService.listCatalog(ctx.ownerUserId, ctx.brandId);
    if (activeProgramId) {
      const offerProductIds = await affiliateProgramsService.listProgramProductIds(activeProgramId);
      if (offerProductIds.length) {
        const idSet = new Set(offerProductIds);
        products = products.filter((p: any) => idSet.has(String(p.id)));
      }
    }

    const productClickMap = new Map<string, number>();
    for (const row of analytics?.top_products || []) {
      const key = String(row.product_id || row.product_slug || "");
      if (key) productClickMap.set(key, Number(row.clicks || 0));
    }

    const catalogPath = storeSlug
      ? `/catalogo/${encodeURIComponent(storeSlug)}?ref=${encodeURIComponent(code)}${coupon ? `&cupom=${encodeURIComponent(coupon)}` : ""}`
      : "";

    res.json({
      success: true,
      code,
      coupon_code: coupon,
      store_slug: storeSlug,
      program_id: activeProgramId || null,
      program_name: enrollment?.program_name || null,
      resources_unlocked: !!enrollment?.resources_unlocked,
      enrollment_status: enrollment?.status || null,
      enrollments: linkCtx.enrollments || [],
      links: {
        short_path: code ? `/afiliado/${encodeURIComponent(code)}` : "",
        catalog_path: catalogPath,
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
      products: products.map((p: any) => ({
        ...p,
        clicks: productClickMap.get(String(p.id)) || productClickMap.get(String(p.slug || "")) || 0,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar links" });
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
    const linkCtx = await affiliateProgramsService.resolveEnrollmentContext(
      ctx.affiliateUserId,
      ctx.brandId,
      programId
    );
    const analytics = await affiliatesService.getAffiliateLinkAnalytics(
      String(affiliate.id),
      ctx.brandId,
      days,
      linkCtx.program_id || undefined
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
      ...analytics,
      by_type: analytics.by_type.map((row) => ({
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

    const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
    const commission = resolveCommissionConfig({ affiliate, program: config });

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
    const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
    const commission = resolveCommissionConfig({ affiliate, program: config });
    res.json({
      success: true,
      ...bundle,
      training: {
        terms_html: config.terms_html,
        training_html: config.training_html,
        commission_rules: config.commission_rules,
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
      social_instagram: req.body?.social_instagram,
      social_whatsapp: req.body?.social_whatsapp,
    });
    res.json({ success: true, affiliate: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar perfil" });
  }
});

router.get("/training", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const config = await affiliatesService.getOrCreateProgramConfig(ctx.ownerUserId, ctx.brandId);
    const affiliate = await getAffiliateProfile(ctx);
    const commission = resolveCommissionConfig({ affiliate, program: config });
    res.json({
      success: true,
      terms_html: config.terms_html,
      training_html: config.training_html,
      commission_rules: config.commission_rules,
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
    res.status(500).json({ error: e.message || "Falha ao carregar onboarding" });
  }
});

router.get("/opportunities", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const segment = String(req.query.segment || "all").trim() as any;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const [data, stats] = await Promise.all([
      affiliateCrmService.listOpportunities(String(affiliate.id), ctx.brandId, { segment, page, limit }),
      affiliateCrmService.getOpportunityStats(String(affiliate.id), ctx.brandId),
    ]);
    res.json({ success: true, stats, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar oportunidades" });
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

router.get("/distribution/assignments", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await requireAffiliateCredential(req, res);
    if (!ctx) return;
    const affiliate = await getAffiliateProfile(ctx);
    if (!affiliate) return res.status(404).json({ error: "Perfil de afiliado não encontrado" });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const assignments = await affiliateDistributionService.listAssignmentsForAffiliate(
      String(affiliate.id),
      ctx.brandId,
      limit
    );
    res.json({ success: true, assignments });
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
    const result = await affiliateDistributionService.convertAssignment({
      assignmentId: String(req.params.assignmentId || "").trim(),
      ownerUserId: ctx.ownerUserId,
      brandId: ctx.brandId,
      affiliateUserId: ctx.affiliateUserId,
      orderId: String(req.body?.order_id || "").trim() || null,
      orderTotal: Number(req.body?.order_total) || 0,
      notes: String(req.body?.notes || "").trim() || null,
    });
    res.json({ success: true, ...result });
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
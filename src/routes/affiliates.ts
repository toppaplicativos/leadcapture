import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { AuthRequest } from "../middleware/auth";
import { requireRole } from "../middleware/auth";
import { query, queryOne } from "../config/database";
import { AffiliatesService } from "../services/affiliates";
import { affiliateProductLearningService } from "../services/affiliateProductLearning";
import { affiliateDistributionService } from "../services/affiliateDistribution";

const router = Router();
const affiliatesService = new AffiliatesService();

function resolveBrandId(req: AuthRequest): string {
  return String(
    req.headers["x-brand-id"] ||
      req.body?.brand_id ||
      req.query?.brand_id ||
      ""
  ).trim();
}

router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const stats = await affiliatesService.getProgramStats(ownerUserId, brandId);
    res.json({ success: true, stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar estatísticas" });
  }
});

router.get("/sales", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
    const sales = await affiliatesService.listBrandSales(ownerUserId, brandId, limit);
    res.json({ success: true, sales });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar vendas" });
  }
});

router.patch("/sales/:id/approve", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    await affiliatesService.approveSaleCommission(String(req.params.id), ownerUserId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao aprovar comissão" });
  }
});

router.post("/sales/approve-paid", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const count = await affiliatesService.approvePendingCommissionsForPaidOrders(ownerUserId, brandId);
    res.json({ success: true, approved: count });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao aprovar comissões" });
  }
});

router.get("/program", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const config = await affiliatesService.getOrCreateProgramConfig(ownerUserId, brandId);
    const affiliates = await affiliatesService.listAffiliates(ownerUserId, brandId);
    res.json({ success: true, program: config, affiliates, total: affiliates.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar programa" });
  }
});

router.put("/program", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const config = await affiliatesService.updateProgramConfig(ownerUserId, brandId, {
      is_enabled: req.body?.is_enabled,
      default_commission_pct: req.body?.default_commission_pct,
      default_commission_mode: req.body?.default_commission_mode,
      default_commission_value: req.body?.default_commission_value,
      commission_rules: req.body?.commission_rules,
      cookie_days: req.body?.cookie_days,
      min_withdrawal: req.body?.min_withdrawal,
      payment_days: req.body?.payment_days,
      terms_html: req.body?.terms_html,
      training_html: req.body?.training_html,
      app_subdomain: req.body?.app_subdomain,
      share_title: req.body?.share_title,
      share_description: req.body?.share_description,
      share_image_url: req.body?.share_image_url,
      promotion_tone: req.body?.promotion_tone,
      accept_new_affiliates: req.body?.accept_new_affiliates,
      auto_approve_affiliates: req.body?.auto_approve_affiliates,
    });
    res.json({ success: true, program: config });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar programa" });
  }
});

router.get("/materials", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const materials = await affiliatesService.listMaterials(ownerUserId, brandId);
    res.json({ success: true, materials });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar materiais" });
  }
});

router.post("/materials", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Título obrigatório" });

    const mediaUrl = String(req.body?.media_url || "").trim();
    const materialType = String(req.body?.type || "image").trim();
    if (materialType !== "copy" && !mediaUrl) {
      return res.status(400).json({ error: "Envie um arquivo, escolha da galeria ou informe URL da mídia" });
    }

    const material = await affiliatesService.createMaterial(ownerUserId, brandId, {
      title,
      type: req.body?.type,
      media_url: req.body?.media_url,
      copy_text: req.body?.copy_text,
      region: req.body?.region,
      gallery_item_id: req.body?.gallery_item_id,
      category: req.body?.category,
      channel: req.body?.channel,
      product_id: req.body?.product_id,
      program_id: req.body?.program_id,
      sort_order: req.body?.sort_order,
      is_published: req.body?.is_published,
    });
    res.status(201).json({ success: true, id: material?.id, material });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao criar material" });
  }
});

router.post("/materials/from-gallery", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "items obrigatório" });

    const created = [];
    for (const item of items) {
      const title = String(item?.title || item?.name || "Material da galeria").trim();
      const material = await affiliatesService.createMaterial(ownerUserId, brandId, {
        title,
        type: String(item?.type || "image").trim(),
        media_url: String(item?.url || item?.media_url || "").trim() || null,
        gallery_item_id: String(item?.id || item?.gallery_item_id || "").trim() || null,
        category: String(item?.category || "promo").trim(),
        channel: String(item?.channel || "geral").trim(),
        copy_text: String(item?.copy_text || "").trim() || null,
        is_published: item?.is_published !== false,
      });
      if (material) created.push(material);
    }
    res.status(201).json({ success: true, materials: created, count: created.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao importar da galeria" });
  }
});

router.patch("/materials/:id", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const material = await affiliatesService.updateMaterial(ownerUserId, String(req.params.id), {
      title: req.body?.title,
      type: req.body?.type,
      media_url: req.body?.media_url,
      copy_text: req.body?.copy_text,
      region: req.body?.region,
      gallery_item_id: req.body?.gallery_item_id,
      category: req.body?.category,
      channel: req.body?.channel,
      product_id: req.body?.product_id,
      program_id: req.body?.program_id,
      sort_order: req.body?.sort_order,
      is_published: req.body?.is_published,
    });
    res.json({ success: true, material });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar material" });
  }
});

router.delete("/materials/:id", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    await affiliatesService.deactivateMaterial(ownerUserId, String(req.params.id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao remover material" });
  }
});

router.get("/products", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const products = await affiliateProductLearningService.listCatalog(ownerUserId, brandId);
    res.json({ success: true, products });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar produtos" });
  }
});

router.post("/products/:productId/generate-guide", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const force = !!req.body?.force;
    const guide = await affiliateProductLearningService.generateGuide(
      ownerUserId,
      brandId,
      String(req.params.productId),
      { force }
    );
    res.json({ success: true, guide });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao gerar guia com IA" });
  }
});

router.get("/learning-modules", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const modules = await affiliatesService.listLearningModules(ownerUserId, brandId, false);
    res.json({ success: true, modules });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar módulos" });
  }
});

router.put("/learning-modules", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const module = await affiliatesService.upsertLearningModule(ownerUserId, brandId, {
      id: req.body?.id,
      slug: req.body?.slug,
      title: req.body?.title,
      icon: req.body?.icon,
      module_type: req.body?.module_type,
      content_html: req.body?.content_html,
      media_url: req.body?.media_url,
      gallery_item_id: req.body?.gallery_item_id,
      sort_order: req.body?.sort_order,
      is_published: req.body?.is_published,
      is_required: req.body?.is_required,
      region: req.body?.region,
    });
    res.json({ success: true, module });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar módulo" });
  }
});

router.get("/payouts", async (req: AuthRequest, res: Response) => {
  try {
    await affiliatesService.ensureSchema();
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const rows = await query<any[]>(
      `SELECT p.*, a.display_name, a.code, a.coupon_code
       FROM affiliate_payouts p
       INNER JOIN affiliates a ON a.id = p.affiliate_id
       WHERE p.owner_user_id = ? AND p.brand_id = ?
       ORDER BY p.created_at DESC`,
      [ownerUserId, brandId]
    );
    res.json({ success: true, payouts: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar saques" });
  }
});

router.patch("/payouts/:id", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!status) return res.status(400).json({ error: "status obrigatório" });

    await query(
      `UPDATE affiliate_payouts
       SET status = ?, notes = ?, paid_at = CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [status, String(req.body?.notes || "").trim() || null, status, String(req.params.id), ownerUserId]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar saque" });
  }
});

router.patch("/:id/status", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const status = String(req.body?.status || "").trim();
    await query(
      `UPDATE affiliates SET status = ?, updated_at = NOW() WHERE id = ? AND owner_user_id = ?`,
      [status, String(req.params.id), ownerUserId]
    );
    if (status === "active") {
      await affiliatesService.approveAffiliate(String(req.params.id), ownerUserId);
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar afiliado" });
  }
});

router.patch("/:id/approve", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    await affiliatesService.approveAffiliate(String(req.params.id), ownerUserId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao aprovar afiliado" });
  }
});

router.patch("/:id/commission", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const affiliateId = String(req.params.id || "").trim();
    const hasMode = req.body?.commission_mode !== undefined && req.body?.commission_mode !== null;
    const hasValue = req.body?.commission_value !== undefined && req.body?.commission_value !== null;

    if (hasMode || hasValue) {
      const { normalizeCommissionMode } = await import("../services/affiliateCommission");
      const mode = normalizeCommissionMode(req.body?.commission_mode || "percentage");
      const value = Number(req.body?.commission_value);
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: "Valor de comissão inválido" });
      }
      if (mode === "percentage" && value > 100) {
        return res.status(400).json({ error: "Percentual deve ser entre 0 e 100" });
      }
      await query(
        `UPDATE affiliates
         SET commission_mode = ?, commission_value = ?,
             commission_pct = CASE WHEN ? = 'percentage' THEN ? ELSE commission_pct END,
             updated_at = NOW()
         WHERE id = ? AND owner_user_id = ?`,
        [mode, value, mode, value, affiliateId, ownerUserId]
      );
      return res.json({ success: true, commission_mode: mode, commission_value: value });
    }

    const pct = Number(req.body?.commission_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: "Comissão inválida (0-100)" });
    }
    await query(
      `UPDATE affiliates
       SET commission_pct = ?, commission_mode = 'percentage', commission_value = ?, updated_at = NOW()
       WHERE id = ? AND owner_user_id = ?`,
      [pct, pct, affiliateId, ownerUserId]
    );
    res.json({ success: true, commission_mode: "percentage", commission_value: pct });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao atualizar comissão" });
  }
});

router.get("/distribution/overview", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const overview = await affiliateDistributionService.getDistributionOverview(ownerUserId, brandId);
    res.json({ success: true, ...overview });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar distribuição" });
  }
});

router.get("/distribution/queue", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const queue = await affiliateDistributionService.listQueueForAdmin(ownerUserId, brandId);
    const rules = await affiliateDistributionService.getOrCreateRules(ownerUserId, brandId);
    res.json({ success: true, queue, rules });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar fila" });
  }
});

router.put("/distribution/rules", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const rules = await affiliateDistributionService.updateRules(ownerUserId, brandId, {
      is_enabled: req.body?.is_enabled,
      max_daily_per_affiliate: req.body?.max_daily_per_affiliate,
      auto_enqueue_capture: req.body?.auto_enqueue_capture,
      auto_send_initial_message: req.body?.auto_send_initial_message,
      initial_message_template: req.body?.initial_message_template,
      followup_enabled: req.body?.followup_enabled,
      followup_delays_hours_json: req.body?.followup_delays_hours_json,
      followup_message_template: req.body?.followup_message_template,
      require_whatsapp_connected: req.body?.require_whatsapp_connected,
      require_training_complete: req.body?.require_training_complete,
      require_terms_accepted: req.body?.require_terms_accepted,
      require_pix_key: req.body?.require_pix_key,
      allowed_regions_json: req.body?.allowed_regions_json,
      program_id: String(req.body?.program_id || "").trim() || null,
    });
    res.json({ success: true, rules });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao salvar regras" });
  }
});

router.post("/distribution/queue", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const prospectId = String(req.body?.prospect_id || req.body?.customer_id || "").trim();
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    if (!prospectId) return res.status(400).json({ error: "prospect_id obrigatório" });

    const result = await affiliateDistributionService.enqueueProspect({
      ownerUserId,
      brandId,
      prospectId,
      source: String(req.body?.source || "manual_admin").trim(),
      programId: String(req.body?.program_id || "").trim() || null,
      priorityScore: Number(req.body?.priority_score) || 50,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao enfileirar prospect" });
  }
});

router.post("/distribution/assignments/:id/convert", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    const result = await affiliateDistributionService.convertAssignment({
      assignmentId: String(req.params.id || "").trim(),
      ownerUserId,
      brandId,
      orderId: String(req.body?.order_id || "").trim() || null,
      orderTotal: Number(req.body?.order_total) || 0,
      notes: String(req.body?.notes || "").trim() || null,
    });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao converter atribuição" });
  }
});

router.post("/distribution/process", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });
    await affiliateDistributionService.refreshAllDistributionStatuses(ownerUserId, brandId);
    const processed = await affiliateDistributionService.processQueue(
      ownerUserId,
      brandId,
      Math.min(Number(req.body?.max_items) || 10, 50)
    );
    res.json({ success: true, processed });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao processar fila" });
  }
});

export default router;
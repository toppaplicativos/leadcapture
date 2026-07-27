/**
 * Clube de Assinantes
 *   Admin:  /api/subscriber-club/*
 *   Public: montado em /api/storefront/public/stores/:slug/club*
 */
import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { subscriberClubService } from "../services/subscriberClub";
import { logger } from "../utils/logger";
import { queryOne } from "../config/database";

const router = Router();

router.use(authMiddleware);
router.use(requireBrandContext);

router.get("/config", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "").trim();
    if (!brandId) return res.status(400).json({ error: "Contexto de organização ausente" });
    const config = await subscriberClubService.getConfig(brandId);
    const stats = await subscriberClubService.getMemberStats(brandId);
    res.json({ success: true, config, stats });
  } catch (e: any) {
    logger.error(e, "[subscriberClub.getConfig]");
    res.status(500).json({ error: e.message || "Erro ao carregar clube" });
  }
});

router.put("/config", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "").trim();
    if (!brandId) return res.status(400).json({ error: "Contexto de organização ausente" });
    const config = await subscriberClubService.upsertConfig(brandId, req.body || {});
    const stats = await subscriberClubService.getMemberStats(brandId);
    res.json({ success: true, config, stats });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("obrigatório") || msg.includes("inválid")) {
      return res.status(400).json({ error: msg });
    }
    logger.error(e, "[subscriberClub.putConfig]");
    res.status(500).json({ error: msg || "Erro ao salvar clube" });
  }
});

router.get("/members", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "").trim();
    if (!brandId) return res.status(400).json({ error: "Contexto de organização ausente" });
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const result = await subscriberClubService.listMembers(brandId, {
      status,
      search,
      limit,
      offset,
    });
    res.json({
      success: true,
      members: result.members,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit) || 1,
    });
  } catch (e: any) {
    logger.error(e, "[subscriberClub.listMembers]");
    res.status(500).json({ error: e.message || "Erro ao listar membros" });
  }
});

router.patch("/members/:id/status", async (req: BrandRequest, res: Response) => {
  try {
    const brandId = String(req.brandId || "").trim();
    if (!brandId) return res.status(400).json({ error: "Contexto de organização ausente" });
    const status = String(req.body?.status || "").trim() as "active" | "paused" | "cancelled";
    if (!["active", "paused", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Status inválido" });
    }
    const member = await subscriberClubService.updateMemberStatus(
      brandId,
      String(req.params.id),
      status
    );
    if (!member) return res.status(404).json({ error: "Membro não encontrado" });
    res.json({ success: true, member });
  } catch (e: any) {
    logger.error(e, "[subscriberClub.updateMemberStatus]");
    res.status(500).json({ error: e.message || "Erro ao atualizar membro" });
  }
});

export default router;

/* ── Public helpers (storefront) ── */

async function resolveBrandIdFromSlug(slug: string): Promise<string | null> {
  const row = await queryOne<any>(
    `SELECT brand_id FROM storefront_stores
      WHERE LOWER(slug) = LOWER(?) AND status = 'active'
      LIMIT 1`,
    [slug]
  );
  const brandId = row?.brand_id != null ? String(row.brand_id).trim() : "";
  return brandId || null;
}

export async function handlePublicClubGet(req: any, res: Response) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Slug obrigatório" });
    const brandId = await resolveBrandIdFromSlug(slug);
    if (!brandId) return res.status(404).json({ error: "Loja não encontrada" });

    const config = await subscriberClubService.getConfig(brandId);
    if (!config.enabled) {
      return res.json({ success: true, club: { enabled: false } });
    }
    res.json({ success: true, club: subscriberClubService.toPublicView(config) });
  } catch (e: any) {
    logger.error(e, "[subscriberClub.publicGet]");
    res.status(500).json({ error: e.message || "Erro ao carregar clube" });
  }
}

export async function handlePublicClubJoin(req: any, res: Response) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Slug obrigatório" });
    const brandId = await resolveBrandIdFromSlug(slug);
    if (!brandId) return res.status(404).json({ error: "Loja não encontrada" });

    const body = req.body || {};
    const result = await subscriberClubService.joinPublic({
      brandId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      cpf: body.cpf,
      address: body.address,
      affiliateId: body.affiliate_id,
      affiliateRef: body.affiliate_ref || body.affiliate_code || body.ref,
      source: body.source || "catalog",
      memberType: body.member_type || body.tipo || body.type,
      restaurant: body.restaurant || body.estabelecimento || null,
      business: body.business || body.empresa || body.estabelecimento || null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
    });

    /* E-mail de boas-vindas (fire-and-forget) em novo cadastro com e-mail */
    if (result.created && result.member.email) {
      try {
        const config = await subscriberClubService.getConfig(brandId);
        const benefits = (config.benefits || [])
          .filter((b) => b.title)
          .slice(0, 5)
          .map((b) => b.title)
          .join(", ");
        let discount_label = "Benefícios exclusivos em cada compra";
        if (config.discount.enabled) {
          discount_label =
            config.discount.type === "fixed"
              ? `R$ ${Number(config.discount.value).toFixed(2)} de desconto`
              : `${config.discount.value}% de desconto`;
        }
        const { emailTriggers } = await import("../services/emailTriggers");
        await emailTriggers.welcomeClubMember({
          brandId,
          customer_name: result.member.name,
          customer_email: result.member.email,
          club_name: config.name,
          benefits_summary: benefits || config.tagline || "Vantagens exclusivas",
          discount_label,
          shipping_note: config.shipping.note || (config.shipping.free_shipping ? "Frete especial" : ""),
        });
      } catch (mailErr: any) {
        logger.warn(`[subscriberClub] welcome email skipped: ${mailErr?.message || mailErr}`);
      }
    }

    const { normalizeClubMemberType, clubMemberWelcomeMessage, clubMemberClientTypeLabel } =
      await import("../services/clubMemberTypes");
    const memberType = normalizeClubMemberType(
      (result.member.metadata as any)?.member_type || body.member_type || "casa"
    );
    res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      member: {
        id: result.member.id,
        name: result.member.name,
        phone: result.member.phone,
        status: result.member.status,
        joined_at: result.member.joined_at,
        member_type: memberType,
        client_type_label:
          (result.member.metadata as any)?.client_type_label ||
          clubMemberClientTypeLabel(memberType),
        metadata: result.member.metadata || {},
      },
      message: clubMemberWelcomeMessage(memberType, result.created),
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (
      msg.includes("obrigatório") ||
      msg.includes("inválid") ||
      msg.includes("não está habilitado") ||
      msg.includes("CPF") ||
      msg.includes("E-mail") ||
      msg.includes("Telefone") ||
      msg.includes("Endereço") ||
      msg.includes("Nome")
    ) {
      return res.status(400).json({ error: msg });
    }
    logger.error(e, "[subscriberClub.publicJoin]");
    res.status(500).json({ error: msg || "Erro ao entrar no clube" });
  }
}

export async function handlePublicClubLookup(req: any, res: Response) {
  try {
    const slug = String(req.params.slug || "").trim();
    const phone = String(req.query.phone || req.body?.phone || "").trim();
    if (!slug) return res.status(400).json({ error: "Slug obrigatório" });
    if (!phone) return res.status(400).json({ error: "Telefone obrigatório" });

    const brandId = await resolveBrandIdFromSlug(slug);
    if (!brandId) return res.status(404).json({ error: "Loja não encontrada" });

    const config = await subscriberClubService.getConfig(brandId);
    if (!config.enabled) {
      return res.json({ success: true, member: null, benefits: null });
    }

    const member = await subscriberClubService.findActiveMemberByPhone(brandId, phone);
    if (!member) {
      return res.json({ success: true, member: null, benefits: null });
    }

    const subtotal = Number(req.query.subtotal || req.body?.subtotal || 0);
    const discount = subscriberClubService.computeDiscount(config, subtotal);

    res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        status: member.status,
      },
      benefits: {
        discount,
        shipping: {
          free_shipping: config.shipping.free_shipping,
          free_shipping_above: config.shipping.free_shipping_above,
          note: config.shipping.note,
        },
        club_name: config.name,
      },
    });
  } catch (e: any) {
    logger.error(e, "[subscriberClub.publicLookup]");
    res.status(500).json({ error: e.message || "Erro ao consultar membro" });
  }
}

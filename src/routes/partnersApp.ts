import { Router, Response } from "express";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/auth";
import { queryOne } from "../config/database";
import { config } from "../config";
import { affiliateGlobalService } from "../services/affiliateGlobal";
import { affiliateProgramsService } from "../services/affiliatePrograms";
import { AffiliatesService } from "../services/affiliates";
import { formatCommissionShort } from "../services/affiliateCommission";

const affiliatesService = new AffiliatesService();

function signBrandAffiliateToken(input: {
  affiliateUserId: string;
  email: string;
  ownerUserId: string;
  brandId: string;
  credentialId: string;
}): string {
  return jwt.sign(
    {
      userId: input.affiliateUserId,
      email: input.email,
      role: "affiliate",
      credential_type: "afiliado",
      owner_user_id: input.ownerUserId,
      brand_id: input.brandId,
      credential_id: input.credentialId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

const router = Router();

async function requirePartnersGlobal(req: AuthRequest, res: Response): Promise<string | null> {
  const credentialType = String(req.user?.credential_type || "").trim().toLowerCase();
  const affiliateUserId = String(req.user?.userId || "").trim();

  if (credentialType !== "parceiro") {
    res.status(403).json({ error: "Credencial inválida para LeadCapture Parceiros" });
    return null;
  }
  if (!affiliateUserId) {
    res.status(403).json({ error: "Token de parceiro incompleto" });
    return null;
  }
  return affiliateUserId;
}

router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const profile = await affiliateGlobalService.getOrCreateGlobalProfile(affiliateUserId);
    res.json({
      success: true,
      profile,
      user: {
        id: affiliateUserId,
        email: String(req.user?.email || "").trim() || profile.email,
        name: profile.display_name,
        role: "affiliate",
        credential_type: "parceiro",
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar perfil" });
  }
});

router.patch("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const profile = await affiliateGlobalService.updateGlobalProfile(affiliateUserId, {
      display_name: req.body?.display_name,
      phone: req.body?.phone,
      document: req.body?.document,
      pix_key: req.body?.pix_key,
      force_pix_sync: req.body?.force_pix_sync === true,
    });
    res.json({ success: true, profile });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar perfil" });
  }
});

router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const dashboard = await affiliateGlobalService.getGlobalDashboard(affiliateUserId);
    res.json({ success: true, ...dashboard });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar dashboard" });
  }
});

router.get("/memberships", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const memberships = await affiliateGlobalService.listMemberships(affiliateUserId);
    res.json({ success: true, memberships });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar programas" });
  }
});

router.get("/alerts", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const limit = Number(req.query.limit) || 50;
    const alerts = await affiliateGlobalService.listGlobalAlerts(affiliateUserId, limit);
    res.json({ success: true, alerts });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar alertas" });
  }
});

router.post("/alerts/read-all", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;
    await affiliateGlobalService.markAllGlobalAlertsRead(affiliateUserId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao marcar alertas" });
  }
});

router.post("/alerts/:alertId/read", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;
    const alertId = String(req.params.alertId || "").trim();
    if (!alertId) return res.status(400).json({ error: "alertId obrigatório" });
    await affiliateGlobalService.markGlobalAlertRead(alertId, affiliateUserId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao marcar alerta" });
  }
});

router.get("/marketplace", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const q = String(req.query.q || "").trim();
    const opportunities = await affiliateGlobalService.listGlobalMarketplace({
      affiliateUserId,
      q: q || undefined,
      limit: Number(req.query.limit) || 50,
    });

    res.json({
      success: true,
      opportunities: opportunities.map((op) => ({
        ...op,
        commission_label: formatCommissionShort(
          String(op.commission_mode || "percentage") as any,
          Number(op.commission_value || 0)
        ),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar oportunidades" });
  }
});

router.post("/invites/:code/accept", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const inviteCode = String(req.params.code || "").trim();
    const profile = await affiliateGlobalService.getOrCreateGlobalProfile(affiliateUserId);

    const result = await affiliateGlobalService.acceptInvitation({
      affiliateUserId,
      email: profile.email,
      displayName: profile.display_name,
      phone: profile.phone,
      inviteCode,
    });

    res.json({ success: true, ...result });
  } catch (e: any) {
    const status = /já|válido apenas|não encontrado|expirou|limite/i.test(String(e.message || "")) ? 409 : 400;
    res.status(status).json({ error: e.message || "Falha ao aceitar convite" });
  }
});

router.get("/programs/:programRef", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const program = await affiliateGlobalService.getProgramDetailForPartner({
      affiliateUserId,
      programRef: String(req.params.programRef || "").trim(),
    });

    res.json({
      success: true,
      program: {
        ...program,
        commission_label: formatCommissionShort(
          String(program.commission_mode || "percentage") as any,
          Number(program.commission_value || 0)
        ),
      },
    });
  } catch (e: any) {
    const status = /não encontrado|indisponível/i.test(String(e.message || "")) ? 404 : 400;
    res.status(status).json({ error: e.message || "Falha ao carregar programa" });
  }
});

router.post("/programs/:programId/apply", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const programId = String(req.params.programId || "").trim();
    const profile = await affiliateGlobalService.getOrCreateGlobalProfile(affiliateUserId);
    const note = String(req.body?.note || "").trim() || undefined;
    const acceptedTerms = req.body?.accepted_terms === true || req.body?.acceptedTerms === true;

    const result = await affiliateGlobalService.applyToProgramGlobal({
      affiliateUserId,
      email: profile.email,
      displayName: profile.display_name,
      phone: profile.phone,
      programId,
      note,
      acceptedTerms,
    });

    res.json({
      success: true,
      auto_approved: result.auto_approved,
      application: result.application,
      enrollment: result.enrollment,
    });
  } catch (e: any) {
    const status = /já|não|indisponível/i.test(String(e.message || "")) ? 409 : 400;
    res.status(status).json({ error: e.message || "Falha na candidatura" });
  }
});

router.get("/onboarding/:enrollmentId", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const enrollmentId = String(req.params.enrollmentId || "").trim();
    const data = await affiliateProgramsService.getEnrollmentOnboarding(enrollmentId, affiliateUserId);
    if (!data) return res.status(404).json({ error: "Inscrição não encontrada" });
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar o que falta concluir" });
  }
});

router.post("/brands/:brandId/enter", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const brandId = String(req.params.brandId || "").trim();
    const credential = await queryOne<any>(
      `SELECT c.*, b.slug AS brand_slug, b.name AS brand_name
       FROM affiliate_app_credentials c
       INNER JOIN brand_units b ON b.id = c.brand_id
       WHERE c.affiliate_user_id = ? AND c.brand_id = ? AND c.credential_type = 'afiliado'
       LIMIT 1`,
      [affiliateUserId, brandId]
    );
    if (!credential) {
      return res.status(404).json({ error: "Você ainda não está vinculado a esta organização" });
    }

    let affiliate = await affiliatesService.getAffiliateByCredential(String(credential.id), brandId);
    if (String(affiliate?.status || "") === "pending" || !credential.is_active) {
      return res.status(403).json({ error: "Cadastro aguardando aprovação desta organização" });
    }

    // Propaga PIX global se a marca ainda não tem chave
    try {
      const globalProfile = await affiliateGlobalService.getOrCreateGlobalProfile(affiliateUserId);
      const globalPix = String(globalProfile.pix_key || "").trim();
      if (globalPix && !String(affiliate?.pix_key || "").trim() && affiliate?.id) {
        await affiliatesService.updateProfile(String(affiliate.id), { pix_key: globalPix });
        affiliate = await affiliatesService.getAffiliateByCredential(String(credential.id), brandId);
      }
    } catch {
      /* não bloquear entrada no programa */
    }

    const email = String(req.user?.email || credential.email || "").trim();
    const token = signBrandAffiliateToken({
      affiliateUserId,
      email,
      ownerUserId: String(credential.owner_user_id),
      brandId,
      credentialId: String(credential.id),
    });

    res.json({
      success: true,
      token,
      brand_id: brandId,
      brand_slug: String(credential.brand_slug || "").trim() || null,
      brand_name: String(credential.brand_name || "").trim() || null,
      affiliate,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao abrir organização" });
  }
});

router.post("/onboarding/:enrollmentId/complete", async (req: AuthRequest, res: Response) => {
  try {
    const affiliateUserId = await requirePartnersGlobal(req, res);
    if (!affiliateUserId) return;

    const enrollmentId = String(req.params.enrollmentId || "").trim();
    const itemType = String(req.body?.item_type || "").trim();
    const itemId = String(req.body?.item_id || "").trim();
    const payload = req.body?.payload;

    const result = await affiliateProgramsService.completeOnboardingItem({
      enrollmentId,
      affiliateUserId,
      itemType: itemType as any,
      itemId,
      payload,
    });

    await affiliateGlobalService.syncMemberships(affiliateUserId);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao concluir etapa" });
  }
});

export default router;
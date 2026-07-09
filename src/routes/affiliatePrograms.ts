import { Router, Response } from "express";
import { AuthRequest, requireRole } from "../middleware/auth";
import { affiliateProgramsService } from "../services/affiliatePrograms";
import { affiliateGlobalService } from "../services/affiliateGlobal";

const router = Router();

function resolveBrandId(req: AuthRequest): string {
  return String(req.headers["x-brand-id"] || req.body?.brand_id || req.query?.brand_id || "").trim();
}

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const includeDraft = String(req.query.include_draft || "").trim() === "1";
    const programs = await affiliateProgramsService.listPrograms(ownerUserId, brandId, {
      includeDraft,
      status: String(req.query.status || "").trim() || undefined,
    });
    res.json({ success: true, programs });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar programas" });
  }
});

router.get("/applications/list", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const applications = await affiliateProgramsService.listApplications(
      ownerUserId,
      brandId,
      String(req.query.program_id || "").trim() || undefined
    );
    res.json({ success: true, applications });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar candidaturas" });
  }
});

router.patch("/enrollments/:enrollmentId", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const status = String(req.body?.status || "").trim() as "active" | "suspended" | "revoked" | "onboarding";
    if (!["active", "suspended", "revoked", "onboarding"].includes(status)) {
      return res.status(400).json({ error: "status inválido" });
    }
    const enrollment = await affiliateProgramsService.updateEnrollmentStatus(
      ownerUserId,
      brandId,
      String(req.params.enrollmentId || "").trim(),
      status
    );
    res.json({ success: true, enrollment });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar inscrição" });
  }
});

router.post("/:programId/steps/:stepId/reorder", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const direction = String(req.body?.direction || "").trim() as "up" | "down";
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ error: "direction deve ser up ou down" });
    }
    const bundle = await affiliateProgramsService.reorderStep(
      ownerUserId,
      brandId,
      String(req.params.programId || "").trim(),
      String(req.params.stepId || "").trim(),
      direction
    );
    res.json({ success: true, ...bundle });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao reordenar etapa" });
  }
});

router.get("/enrollments/list", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const enrollments = await affiliateProgramsService.listEnrollments(
      ownerUserId,
      brandId,
      String(req.query.program_id || "").trim() || undefined
    );
    res.json({ success: true, enrollments });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar inscrições" });
  }
});

router.post("/sync-legacy", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const program = await affiliateProgramsService.syncLegacyDefaultProgram(ownerUserId, brandId);
    res.json({ success: true, program });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha na sincronização" });
  }
});

router.post("/", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    if (!ownerUserId || !brandId) return res.status(400).json({ error: "brand_id obrigatório" });

    const bundle = await affiliateProgramsService.createProgram(ownerUserId, brandId, req.body || {});
    res.status(201).json({ success: true, ...bundle });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao criar programa" });
  }
});

router.patch("/applications/:applicationId", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const decision = String(req.body?.decision || "").trim() as "approved" | "rejected";
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ error: "decision deve ser approved ou rejected" });
    }
    const application = await affiliateProgramsService.reviewApplication(
      ownerUserId,
      brandId,
      String(req.params.applicationId),
      decision,
      String(req.body?.admin_note || "").trim() || undefined,
      String(req.user?.userId || "").trim()
    );
    res.json({ success: true, application });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao analisar candidatura" });
  }
});

router.get("/:programId/invitations", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const invitations = await affiliateGlobalService.listProgramInvitations({
      ownerUserId,
      brandId,
      programId,
    });
    res.json({ success: true, invitations });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao listar convites" });
  }
});

router.post("/:programId/invitations", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const created = await affiliateGlobalService.createProgramInvitation({
      ownerUserId,
      brandId,
      programId,
      createdBy: ownerUserId,
      email: req.body?.email,
      label: req.body?.label,
      maxUses: req.body?.max_uses != null ? Number(req.body.max_uses) : null,
      expiresInDays: req.body?.expires_in_days != null ? Number(req.body.expires_in_days) : null,
    });
    res.status(201).json({ success: true, ...created });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao criar convite" });
  }
});

router.patch("/invitations/:invitationId/revoke", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const invitation = await affiliateGlobalService.revokeInvitation({
      ownerUserId,
      brandId,
      invitationId: String(req.params.invitationId || "").trim(),
    });
    res.json({ success: true, invitation });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao revogar convite" });
  }
});

router.get("/:programId", async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    if (!ownerUserId || !brandId || !programId) return res.status(400).json({ error: "Parâmetros inválidos" });

    const bundle = await affiliateProgramsService.getProgramBundle(ownerUserId, brandId, programId);
    if (!bundle) return res.status(404).json({ error: "Programa não encontrado" });
    res.json({ success: true, ...bundle });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Falha ao carregar programa" });
  }
});

router.put("/:programId", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const bundle = await affiliateProgramsService.updateProgram(ownerUserId, brandId, programId, req.body || {});
    res.json({ success: true, ...bundle });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao atualizar programa" });
  }
});

router.post("/:programId/steps", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const step = await affiliateProgramsService.upsertStep(ownerUserId, brandId, programId, req.body || {});
    res.json({ success: true, step });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar etapa" });
  }
});

router.delete("/:programId/steps/:stepId", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    await affiliateProgramsService.deleteStep(ownerUserId, brandId, String(req.params.programId), String(req.params.stepId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao remover etapa" });
  }
});

router.post("/:programId/trainings", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const training = await affiliateProgramsService.upsertTraining(ownerUserId, brandId, programId, req.body || {});
    res.json({ success: true, training });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar treinamento" });
  }
});

router.delete("/:programId/trainings/:trainingId", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    await affiliateProgramsService.deleteTraining(ownerUserId, brandId, String(req.params.programId), String(req.params.trainingId));
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao remover treinamento" });
  }
});

router.post("/:programId/offers", requireRole(["admin", "operator"]), async (req: AuthRequest, res: Response) => {
  try {
    const ownerUserId = String(req.user?.userId || "").trim();
    const brandId = resolveBrandId(req);
    const programId = String(req.params.programId || "").trim();
    const offer = await affiliateProgramsService.upsertOffer(ownerUserId, brandId, programId, req.body || {});
    res.json({ success: true, offer });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Falha ao salvar oferta" });
  }
});

export default router;
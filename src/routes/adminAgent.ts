import { Router, type Response } from "express";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { adminAgentOrchestrator } from "../services/adminAgent/orchestrator";
import { SQUADS, SKILLS } from "../services/adminAgent/squads";
import { logger } from "../utils/logger";
import type { ChatMessage } from "../services/adminAgent/types";

const router = Router();
router.use(requireBrandContext);

router.get("/squads", (_req: BrandRequest, res: Response) => {
  res.json({
    success: true,
    squads: Object.values(SQUADS),
    skills: Object.values(SKILLS),
  });
});

router.post("/chat", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const message = String(req.body?.message || "").trim();
    const directSkill = String(req.body?.directSkill || "").trim();
    const hasEvent = req.body?.componentEvent && typeof req.body.componentEvent === "object";
    if (!message && !directSkill && !hasEvent) {
      return res.status(400).json({ error: "message_required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "message_too_long" });
    }

    const rawHistory: ChatMessage[] = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const turn = await adminAgentOrchestrator.chat(message, history, {
      userId,
      brandId: req.brandId || null,
      currentPath: String(req.body?.currentPath || "").trim() || undefined,
      directSkill: directSkill || undefined,
      skillContext: req.body?.skillContext && typeof req.body.skillContext === "object"
        ? req.body.skillContext
        : undefined,
      componentEvent: req.body?.componentEvent && typeof req.body.componentEvent === "object"
        ? req.body.componentEvent
        : undefined,
    });

    res.json({ success: true, turn });
  } catch (error: any) {
    logger.error({ err: error?.message }, "admin agent chat error");
    res.status(500).json({
      error: error?.message?.includes("API Key") ? "ai_not_configured" : "internal",
      message: error?.message || "Falha ao processar mensagem.",
    });
  }
});

export default router;
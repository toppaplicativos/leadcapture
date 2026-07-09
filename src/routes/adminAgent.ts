import { Router, type Response } from "express";
import { BrandRequest, requireBrandContext } from "../middleware/brandContext";
import { adminAgentOrchestrator } from "../services/adminAgent/orchestrator";
import { extractBrandMemoryWithLLM, mergeMemoryFromTurn } from "../services/adminAgent/memory";
import { buildPastSessionContext, searchSessions } from "../services/adminAgent/sessionSearch";
import { messagesToChatHistory, scheduleSessionSummaryRefresh } from "../services/adminAgent/sessionSummary";
import { adminAgentSessionStore, EMPTY_MEMORY } from "../services/adminAgent/sessionStore";
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

router.get("/memory", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const brandMemory = await adminAgentSessionStore.loadBrandMemory(userId, req.brandId);
    res.json({ success: true, brandMemory });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.patch("/memory", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const current = await adminAgentSessionStore.loadBrandMemory(userId, req.brandId);
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const facts = Array.isArray(body.facts)
      ? body.facts.map((f: unknown) => String(f || "").trim().slice(0, 180)).filter(Boolean).slice(0, 24)
      : current.facts;

    const preferences = body.preferences && typeof body.preferences === "object"
      ? Object.fromEntries(
        Object.entries(body.preferences as Record<string, unknown>)
          .map(([k, v]) => [String(k).trim().slice(0, 40), String(v || "").trim().slice(0, 120)])
          .filter(([k, v]) => k && v),
      )
      : current.preferences;

    const last_topics = Array.isArray(body.last_topics)
      ? body.last_topics.map((t: unknown) => String(t || "").trim()).filter(Boolean).slice(0, 8)
      : current.last_topics;

    const brandMemory = {
      facts,
      preferences,
      last_topics,
      turn_count: Math.max(current.turn_count, 1),
    };
    await adminAgentSessionStore.saveBrandMemory(userId, req.brandId, brandMemory);
    res.json({ success: true, brandMemory });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.delete("/memory", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    await adminAgentSessionStore.clearBrandMemory(userId, req.brandId);
    res.json({ success: true, brandMemory: { ...EMPTY_MEMORY } });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.get("/sessions/active", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });

    const brandMemory = await adminAgentSessionStore.loadBrandMemory(userId, req.brandId);
    const session = await adminAgentSessionStore.getActiveSession(userId, req.brandId);
    if (!session) {
      res.json({
        success: true,
        session: null,
        messages: [],
        memory: { ...EMPTY_MEMORY },
        brandMemory,
      });
      return;
    }

    const messages = await adminAgentSessionStore.getMessages(session.id, userId, req.brandId);
    const memory = await adminAgentSessionStore.loadMemory(session.id, userId, req.brandId);

    res.json({ success: true, session, messages, memory, brandMemory });
  } catch (error: any) {
    logger.error({ err: error?.message }, "admin agent sessions/active error");
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.get("/sessions", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessions = await adminAgentSessionStore.listSessions(userId, req.brandId, 30);
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.get("/sessions/search", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, results: [], query: q });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
    const hits = await searchSessions(userId, req.brandId, q, { limit });
    res.json({
      success: true,
      query: q,
      results: hits.map((h) => ({
        session: h.session,
        score: h.score,
        snippet: h.snippet,
        matchSource: h.matchSource,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.post("/sessions", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const session = await adminAgentSessionStore.createSession(userId, req.brandId, {
      title: String(req.body?.title || "").trim() || undefined,
      currentPath: String(req.body?.currentPath || "").trim() || undefined,
      activate: true,
    });
    res.json({ success: true, session, messages: [], memory: { ...EMPTY_MEMORY } });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.patch("/sessions/:sessionId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = String(req.params.sessionId || "").trim();
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "title_required" });
    const session = await adminAgentSessionStore.renameSession(sessionId, userId, req.brandId, title);
    if (!session) return res.status(404).json({ error: "session_not_found" });
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.delete("/sessions/:sessionId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = String(req.params.sessionId || "").trim();
    const ok = await adminAgentSessionStore.deleteSession(sessionId, userId, req.brandId);
    if (!ok) return res.status(404).json({ error: "session_not_found" });
    const sessions = await adminAgentSessionStore.listSessions(userId, req.brandId, 30);
    const active = await adminAgentSessionStore.getActiveSession(userId, req.brandId);
    res.json({ success: true, sessions, activeSession: active });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.post("/sessions/:sessionId/pin", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = String(req.params.sessionId || "").trim();
    const session = await adminAgentSessionStore.togglePinSession(sessionId, userId, req.brandId);
    if (!session) return res.status(404).json({ error: "session_not_found" });
    const sessions = await adminAgentSessionStore.listSessions(userId, req.brandId, 30);
    res.json({ success: true, session, sessions });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.post("/sessions/:sessionId/activate", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = String(req.params.sessionId || "").trim();
    const session = await adminAgentSessionStore.activateSession(sessionId, userId, req.brandId);
    if (!session) return res.status(404).json({ error: "session_not_found" });
    const messages = await adminAgentSessionStore.getMessages(session.id, userId, req.brandId);
    const memory = await adminAgentSessionStore.loadMemory(session.id, userId, req.brandId);
    const brandMemory = await adminAgentSessionStore.loadBrandMemory(userId, req.brandId);
    res.json({ success: true, session, messages, memory, brandMemory });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.get("/sessions/:sessionId/messages", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });
    const sessionId = String(req.params.sessionId || "").trim();
    const session = await adminAgentSessionStore.getSession(sessionId, userId, req.brandId);
    if (!session) return res.status(404).json({ error: "session_not_found" });
    const messages = await adminAgentSessionStore.getMessages(sessionId, userId, req.brandId);
    const memory = await adminAgentSessionStore.loadMemory(sessionId, userId, req.brandId);
    res.json({ success: true, session, messages, memory });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "failed" });
  }
});

router.post("/chat", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId || !req.brandId) return res.status(401).json({ error: "Unauthorized" });

    const message = String(req.body?.message || "").trim();
    const directSkill = String(req.body?.directSkill || "").trim();
    const hasEvent = req.body?.componentEvent && typeof req.body.componentEvent === "object";
    if (!message && !directSkill && !hasEvent) {
      return res.status(400).json({ error: "message_required" });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: "message_too_long" });
    }

    const currentPath = String(req.body?.currentPath || "").trim() || undefined;
    let sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) {
      const session = await adminAgentSessionStore.getOrCreateActiveSession(userId, req.brandId, currentPath);
      sessionId = session.id;
    } else {
      const existing = await adminAgentSessionStore.getSession(sessionId, userId, req.brandId);
      if (!existing) {
        const session = await adminAgentSessionStore.getOrCreateActiveSession(userId, req.brandId, currentPath);
        sessionId = session.id;
      }
    }

    const sessionRow = await adminAgentSessionStore.getSession(sessionId, userId, req.brandId);
    const sessionMemory = await adminAgentSessionStore.loadMemory(sessionId, userId, req.brandId);
    const brandMemory = await adminAgentSessionStore.loadBrandMemory(userId, req.brandId);

    const storedMessages = await adminAgentSessionStore.getMessages(sessionId, userId, req.brandId, 120);
    const sessionSummary = sessionRow?.summary || null;

    const pastSessionContext = message.length >= 4
      ? await buildPastSessionContext(userId, req.brandId, message, sessionId, 3)
      : null;

    const history: ChatMessage[] = messagesToChatHistory(storedMessages);

    const skillContext = req.body?.skillContext && typeof req.body.skillContext === "object"
      ? req.body.skillContext
      : undefined;

    const turn = await adminAgentOrchestrator.chat(message, history, {
      userId,
      brandId: req.brandId || null,
      currentPath,
      directSkill: directSkill || undefined,
      skillContext,
      componentEvent: req.body?.componentEvent && typeof req.body.componentEvent === "object"
        ? req.body.componentEvent
        : undefined,
      sessionId,
      sessionMemory,
      brandMemory,
      sessionSummary,
      pastSessionContext,
    });

    const userContent = message || (
      directSkill
        ? String(skillContext?.label || "Abrir ferramenta")
        : hasEvent
          ? String(req.body.componentEvent?.action || "Ação")
          : ""
    );

    const pendingContext = turn.nextSkill ? { nextSkill: turn.nextSkill } : undefined;
    sessionId = await adminAgentSessionStore.appendExchange(sessionId, userId, req.brandId, {
      userContent: userContent || undefined,
      turn,
      pendingContext,
      currentPath,
      titleHint: userContent || turn.message,
    });

    const updatedSessionMemory = mergeMemoryFromTurn(sessionMemory, userContent, turn);
    await adminAgentSessionStore.saveMemory(sessionId, userId, req.brandId, updatedSessionMemory);

    const updatedBrandMemory = await extractBrandMemoryWithLLM(
      userId,
      req.brandId,
      brandMemory,
      userContent,
      turn.message,
      turn,
    );
    await adminAgentSessionStore.saveBrandMemory(userId, req.brandId, updatedBrandMemory);

    const updatedSession = await adminAgentSessionStore.getSession(sessionId, userId, req.brandId);
    const allMessages = await adminAgentSessionStore.getMessages(sessionId, userId, req.brandId, 120);
    if (updatedSession) {
      scheduleSessionSummaryRefresh({
        userId,
        brandId: req.brandId,
        session: updatedSession,
        messages: allMessages,
      });
    }

    res.json({
      success: true,
      turn,
      sessionId,
      memory: updatedSessionMemory,
      brandMemory: updatedBrandMemory,
      sessionSummary: updatedSession?.summary || sessionSummary || null,
    });
  } catch (error: any) {
    logger.error({ err: error?.message, stack: error?.stack }, "admin agent chat error");
    const msg = String(error?.message || "Falha ao processar mensagem.");
    res.status(500).json({
      error: msg.includes("API Key") ? "ai_not_configured" : "internal",
      message: msg,
    });
  }
});

export default router;
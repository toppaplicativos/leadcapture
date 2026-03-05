import { Router, Request, Response } from "express";
import { KnowledgeBaseService } from "../services/knowledgeBase";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();
const kbService = new KnowledgeBaseService();

// GET /api/knowledge-base - List all entries
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { category, search, active, company_id } = req.query;
    const filters: any = {};
    filters.user_id = userId;
    if (category) filters.category = category;
    if (search) filters.search = search;
    if (active !== undefined) filters.active = active === "true";
    if (company_id) filters.company_id = String(company_id);

    const entries = await kbService.getAll(filters);
    res.json({ success: true, entries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/knowledge-base/:id - Get entry by ID
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const entry = await kbService.getById(parseInt(req.params.id as string), userId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true, entry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/knowledge-base - Create entry
router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }
    const entry = await kbService.create(userId, req.body);
    res.status(201).json({ success: true, entry });
  } catch (error: any) {
    logger.error(`Create KB entry error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/knowledge-base/:id - Update entry
router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const entry = await kbService.update(parseInt(req.params.id as string), userId, req.body);
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true, entry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/knowledge-base/:id - Delete entry
router.delete("/:id", authMiddleware, requireRole(["admin", "manager"]), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const success = await kbService.delete(parseInt(req.params.id as string), userId);
    if (!success) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true, message: "Entry deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/knowledge-base/search - Search for AI context
router.post("/search", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { query: searchQuery, company_id } = req.body;
    if (!searchQuery) return res.status(400).json({ error: "Query is required" });
    const context = await kbService.searchForContext(String(searchQuery), userId, company_id ? String(company_id) : undefined);
    res.json({ success: true, context });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;


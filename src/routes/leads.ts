import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { memoryEngine, LeadContextMemory } from "../services/memoryEngine";
import { getPool } from "../config/database";

const router = Router();

// ─── GET /api/leads/memory/by-phone/:phone ────────────────────────────────────
// Get contextual memory for a lead by phone number
router.get("/memory/by-phone/:phone", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const phone = String(req.params.phone || "");
    if (!phone) return res.status(400).json({ error: "Phone is required" });

    const result = await memoryEngine.getMemoryByPhone(userId, phone);
    if (!result) return res.status(404).json({ error: "Lead not found for this phone" });

    return res.json({ clientId: result.clientId, memory: result.memory });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/leads/memory/:clientId ─────────────────────────────────────────
// Get contextual memory for a specific client
router.get("/memory/:clientId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const clientId = String(req.params.clientId || "");

    // Verify ownership
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM clients WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
      [clientId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });

    const memory = await memoryEngine.getMemory(clientId);
    return res.json({ clientId, memory });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/leads/memory/:clientId ─────────────────────────────────────────
// Manually update / patch memory fields
router.put("/memory/:clientId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const clientId = String(req.params.clientId || "");
    const patch: Partial<LeadContextMemory> = req.body;

    if (!patch || typeof patch !== "object") {
      return res.status(400).json({ error: "Body must be a JSON object with memory fields" });
    }

    // Verify ownership
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM clients WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
      [clientId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });

    await memoryEngine.saveMemory(clientId, patch);
    const updated = await memoryEngine.getMemory(clientId);
    return res.json({ clientId, memory: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/leads/memory/:clientId ──────────────────────────────────────
// Reset (clear) memory for a lead
router.delete("/memory/:clientId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const clientId = String(req.params.clientId || "");

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM clients WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
      [clientId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });

    await memoryEngine.resetMemory(clientId);
    return res.json({ ok: true, message: "Memory reset successfully" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/leads/memory/:clientId/refresh ────────────────────────────────
// Trigger AI re-analysis with a provided message snippet
router.post("/memory/:clientId/refresh", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const clientId = String(req.params.clientId || "");
    const { message, direction = "inbound" } = req.body as {
      message: string;
      direction?: "inbound" | "outbound";
    };

    if (!message) return res.status(400).json({ error: "message is required" });

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT phone FROM clients WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
      [clientId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });

    await memoryEngine.updateMemoryFromMessage(userId, rows[0].phone, message, direction);
    const updated = await memoryEngine.getMemory(clientId);
    return res.json({ clientId, memory: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/leads/memory/:clientId/context ─────────────────────────────────
// Get memory formatted as a prompt context string (for AI injection preview)
router.get("/memory/:clientId/context", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const clientId = String(req.params.clientId || "");

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM clients WHERE id = ? AND user_id = ? AND is_active = TRUE LIMIT 1",
      [clientId, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });

    const memory = await memoryEngine.getMemory(clientId);
    if (!memory) return res.status(404).json({ error: "No memory found" });

    const context = memoryEngine.buildPromptContext(memory);
    return res.json({ clientId, context });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

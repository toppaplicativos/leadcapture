import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getPool } from "../config/database";

const router = Router();
router.use(authMiddleware);

type LeadCategory = {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function resolveUserId(req: AuthRequest): string | undefined {
  return (req.user as any)?.userId || (req.user as any)?.id;
}

// GET /api/lead-categories
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM lead_categories WHERE user_id = ? AND is_active = TRUE ORDER BY name ASC",
      [userId]
    );
    return res.json({ success: true, categories: rows as LeadCategory[] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/lead-categories
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, color = "#3b82f6", description } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ error: "name is required" });
    }
    const colorVal = String(color || "#3b82f6");
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colorVal)) {
      return res.status(400).json({ error: "Invalid color format (use #RGB or #RRGGBB)" });
    }

    const id = uuidv4();
    const pool = getPool();
    await pool.execute(
      "INSERT INTO lead_categories (id, user_id, name, color, description) VALUES (?, ?, ?, ?, ?)",
      [id, userId, String(name).trim(), colorVal, description ? String(description).trim() : null]
    );
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM lead_categories WHERE id = ? LIMIT 1", [id]
    );
    return res.json({ success: true, category: rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/lead-categories/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "");
    const { name, color, description } = req.body || {};

    if (color && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(color))) {
      return res.status(400).json({ error: "Invalid color format" });
    }

    const pool = getPool();
    const [existing] = await pool.query<any[]>(
      "SELECT id FROM lead_categories WHERE id = ? AND user_id = ? LIMIT 1", [id, userId]
    );
    if (!existing[0]) return res.status(404).json({ error: "Category not found" });

    const sets: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { sets.push("name = ?"); vals.push(String(name).trim()); }
    if (color !== undefined) { sets.push("color = ?"); vals.push(String(color)); }
    if (description !== undefined) { sets.push("description = ?"); vals.push(String(description).trim() || null); }

    if (sets.length > 0) {
      vals.push(id, userId);
      await pool.execute(`UPDATE lead_categories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, vals);
    }

    const [rows] = await pool.query<any[]>("SELECT * FROM lead_categories WHERE id = ? LIMIT 1", [id]);
    return res.json({ success: true, category: rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lead-categories/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "");
    const pool = getPool();
    const [result] = await pool.execute<any>(
      "UPDATE lead_categories SET is_active = FALSE WHERE id = ? AND user_id = ?", [id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Category not found" });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../config/database";
import { AuthRequest } from "../middleware/auth";
import { logger } from "../utils/logger";
import { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

// POST /api/sessions - Save/update WhatsApp session
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { instance_id, session_data, phone_number, company_id } = req.body;
    if (!instance_id) return res.status(400).json({ error: "instance_id e obrigatorio" });

    const [existing] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM whatsapp_sessions WHERE instance_id = ? AND user_id = ?",
      [instance_id, req.user!.userId]
    );

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE whatsapp_sessions SET session_data = ?, phone_number = ?, status = 'active', last_connected_at = NOW()
         WHERE instance_id = ? AND user_id = ?`,
        [session_data ? JSON.stringify(session_data) : null, phone_number || null, instance_id, req.user!.userId]
      );
      res.json({ success: true, message: "Sessao atualizada", id: (existing[0] as any).id });
    } else {
      const id = uuidv4();
      await pool.execute(
        `INSERT INTO whatsapp_sessions (id, instance_id, user_id, company_id, session_data, phone_number, status, last_connected_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
        [id, instance_id, req.user!.userId, company_id || null,
         session_data ? JSON.stringify(session_data) : null, phone_number || null]
      );
      res.status(201).json({ success: true, message: "Sessao criada", id });
    }
  } catch (error: any) {
    logger.error(error, "Erro ao salvar sessao");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sessions - List user's sessions
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, instance_id, phone_number, status, last_connected_at, created_at FROM whatsapp_sessions WHERE user_id = ? ORDER BY created_at DESC",
      [req.user!.userId]
    );
    res.json({ success: true, sessions: rows });
  } catch (error: any) {
    logger.error(error, "Erro ao listar sessoes");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sessions/:instanceId/restore - Restore session data
router.get("/:instanceId/restore", async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM whatsapp_sessions WHERE instance_id = ? AND user_id = ?",
      [req.params.instanceId, req.user!.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Sessao nao encontrada" });
    const session = rows[0] as any;
    if (typeof session.session_data === "string") {
      try { session.session_data = JSON.parse(session.session_data); } catch {}
    }
    res.json({ success: true, session });
  } catch (error: any) {
    logger.error(error, "Erro ao restaurar sessao");
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/sessions/:instanceId/status - Update session status
router.patch("/:instanceId/status", async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { status } = req.body;
    const validStatuses = ["active", "disconnected", "banned", "pending"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Status invalido" });

    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE whatsapp_sessions SET status = ? WHERE instance_id = ? AND user_id = ?",
      [status, req.params.instanceId, req.user!.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Sessao nao encontrada" });
    res.json({ success: true, message: "Status atualizado" });
  } catch (error: any) {
    logger.error(error, "Erro ao atualizar status da sessao");
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/sessions/:instanceId - Delete session
router.delete("/:instanceId", async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM whatsapp_sessions WHERE instance_id = ? AND user_id = ?",
      [req.params.instanceId, req.user!.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Sessao nao encontrada" });
    res.json({ success: true, message: "Sessao removida" });
  } catch (error: any) {
    logger.error(error, "Erro ao deletar sessao");
    res.status(500).json({ error: error.message });
  }
});

export default router;

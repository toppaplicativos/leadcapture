import { Router, Response } from "express";
import { getPool } from "../config/database";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { RowDataPacket } from "mysql2";

const router = Router();
router.use(authMiddleware);

// GET /api/inbox/conversations - List conversations with last message
router.get("/conversations", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const { instance_id, status, search, limit, offset } = req.query;
    
    let query = `
      SELECT c.*, 
        i.name as instance_name,
        i.phone as instance_phone
      FROM whatsapp_conversations c
      JOIN whatsapp_instances i ON c.instance_id = i.id
      WHERE i.created_by = ?
    `;
    const params: any[] = [userId];

    if (instance_id) {
      query += " AND c.instance_id = ?";
      params.push(instance_id);
    }
    if (status) {
      query += " AND c.status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND (c.contact_name LIKE ? OR c.contact_phone LIKE ? OR c.remote_jid LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY c.last_message_at DESC";
    
    const lim = Math.min(parseInt(limit as string) || 50, 200);
    const off = parseInt(offset as string) || 0;
    query += " LIMIT ? OFFSET ?";
    params.push(lim, off);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM whatsapp_conversations c
      JOIN whatsapp_instances i ON c.instance_id = i.id
      WHERE i.created_by = ?
    `;
    const countParams: any[] = [userId];
    if (instance_id) { countQuery += " AND c.instance_id = ?"; countParams.push(instance_id); }
    if (status) { countQuery += " AND c.status = ?"; countParams.push(status); }
    if (search) {
      countQuery += " AND (c.contact_name LIKE ? OR c.contact_phone LIKE ? OR c.remote_jid LIKE ?)";
      const s = `%${search}%`;
      countParams.push(s, s, s);
    }
    const [countRows] = await pool.execute<RowDataPacket[]>(countQuery, countParams);

    res.json({
      success: true,
      conversations: rows,
      total: (countRows[0] as any).total,
    });
  } catch (error: any) {
    logger.error(error, "Error listing conversations");
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inbox/conversations/:id/messages - Get messages for a conversation
router.get("/conversations/:id/messages", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const { limit, before_timestamp } = req.query;
    const lim = Math.min(parseInt(limit as string) || 50, 200);

    let query = `
      SELECT m.* FROM whatsapp_messages m
      JOIN whatsapp_conversations c ON c.id = m.conversation_id
      JOIN whatsapp_instances i ON i.id = c.instance_id
      WHERE m.conversation_id = ? AND i.created_by = ?
    `;
    const params: any[] = [req.params.id, userId];

    if (before_timestamp) {
      query += " AND m.message_timestamp < ?";
      params.push(before_timestamp);
    }

    query += " ORDER BY m.message_timestamp DESC LIMIT ?";
    params.push(lim);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // Return in chronological order
    res.json({
      success: true,
      messages: (rows as any[]).reverse(),
    });
  } catch (error: any) {
    logger.error(error, "Error listing messages");
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inbox/conversations/:id/send - Send a message in a conversation
router.post("/conversations/:id/send", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Get conversation details
    const [convRows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.*
       FROM whatsapp_conversations c
       JOIN whatsapp_instances i ON i.id = c.instance_id
       WHERE c.id = ? AND i.created_by = ?`,
      [req.params.id, userId]
    );
    if (!convRows[0]) return res.status(404).json({ error: "Conversation not found" });

    const conv = convRows[0] as any;

    // Get the instance manager from the app
    const instanceManager = req.app.get("instanceManager");
    if (!instanceManager) return res.status(500).json({ error: "Instance manager not available" });

    // Send via WhatsApp
    const sent = await instanceManager.sendMessageByJid(conv.instance_id, conv.remote_jid, message);
    if (!sent) return res.status(500).json({ error: "Failed to send message" });

    // Save to DB
    const msgId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Math.floor(Date.now() / 1000);
    await pool.execute(
      `INSERT INTO whatsapp_messages (id, conversation_id, instance_id, remote_jid, from_me, message_type, body, status, message_timestamp, created_at)
       VALUES (?, ?, ?, ?, 1, 'text', ?, 'sent', ?, NOW())`,
      [msgId, conv.id, conv.instance_id, conv.remote_jid, message, now]
    );

    // Update conversation
    await pool.execute(
      `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = NOW(), last_message_from_me = 1, updated_at = NOW() WHERE id = ?`,
      [message, conv.id]
    );

    res.json({
      success: true,
      message: {
        id: msgId,
        conversation_id: conv.id,
        from_me: true,
        body: message,
        message_type: "text",
        status: "sent",
        message_timestamp: now,
      },
    });
  } catch (error: any) {
    logger.error(error, "Error sending message");
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/inbox/conversations/:id - Update conversation (status, notes, tags)
router.patch("/conversations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const pool = getPool();
    const { status, notes, tags, pipeline_stage } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (status) { updates.push("status = ?"); params.push(status); }
    if (notes !== undefined) { updates.push("notes = ?"); params.push(notes); }
    if (tags !== undefined) { updates.push("tags = ?"); params.push(JSON.stringify(tags)); }
    if (pipeline_stage) { updates.push("pipeline_stage = ?"); params.push(pipeline_stage); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    updates.push("updated_at = NOW()");
    params.push(req.params.id, userId);

    const [result] = await pool.execute(
      `UPDATE whatsapp_conversations c
       JOIN whatsapp_instances i ON i.id = c.instance_id
       SET ${updates.join(", ")}
       WHERE c.id = ? AND i.created_by = ?`,
      params
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error(error, "Error updating conversation");
    res.status(500).json({ error: error.message });
  }
});

export default router;

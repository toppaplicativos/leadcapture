import { randomUUID } from "crypto";
import { Response, Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getPool } from "../config/database";
import { getNotificationService, NotificationPriority } from "../services/notifications";

const router = Router();
const notifications = getNotificationService();

router.use(authMiddleware);

type TicketStatus = "open" | "waiting_user" | "resolved";

function getUserId(req: AuthRequest): string | null {
  const userId = String(req.user?.userId || "").trim();
  return userId || null;
}

async function ensureSupportSchema() {
  const pool = getPool();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      store_id VARCHAR(64) NULL,
      subject VARCHAR(180) NOT NULL,
      priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
      status ENUM('open','waiting_user','resolved') NOT NULL DEFAULT 'open',
      last_message TEXT NULL,
      metadata_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_support_tickets_user (user_id),
      INDEX idx_support_tickets_status (status),
      INDEX idx_support_tickets_priority (priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ticket_id VARCHAR(64) NOT NULL,
      sender_type ENUM('user','support') NOT NULL,
      sender_id VARCHAR(64) NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_support_ticket_messages_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

router.get("/tickets", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ensureSupportSchema();

    const status = String(req.query.status || "").trim() as TicketStatus;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));

    const where: string[] = ["user_id = ?"];
    const params: any[] = [userId];

    if (status) {
      where.push("status = ?");
      params.push(status);
    }

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM support_tickets WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit]
    );

    return res.json({ success: true, tickets: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/tickets", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ensureSupportSchema();

    const subject = String(req.body?.subject || "").trim();
    const message = String(req.body?.message || "").trim();
    const priority = String(req.body?.priority || "medium").trim() as NotificationPriority;
    const storeId = req.body?.store_id ? String(req.body.store_id) : null;

    if (!subject) return res.status(400).json({ error: "subject is required" });
    if (!message) return res.status(400).json({ error: "message is required" });

    const ticketId = `tkt_${randomUUID()}`;
    const pool = getPool();

    await pool.execute(
      `INSERT INTO support_tickets (id, user_id, store_id, subject, priority, status, last_message, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      [ticketId, userId, storeId, subject, priority, message, JSON.stringify({})]
    );

    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, 'user', ?, ?)`,
      [ticketId, userId, message]
    );

    await notifications.createNotification({
      user_id: userId,
      type: "support",
      event: "support_ticket_opened",
      title: "Ticket criado",
      message: `Seu ticket \"${subject}\" foi criado com sucesso.`,
      priority: priority === "critical" ? "critical" : "medium",
      channels: ["in_app", "email"],
      store_id: storeId,
      metadata: {
        ticket_id: ticketId,
        status: "open",
      },
    });

    return res.status(201).json({ success: true, ticket_id: ticketId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/tickets/:id/messages", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ensureSupportSchema();

    const ticketId = String(req.params.id || "").trim();
    const message = String(req.body?.message || "").trim();
    const senderType = String(req.body?.sender_type || "user").trim().toLowerCase() === "support" ? "support" : "user";
    const status = String(req.body?.status || "").trim() as TicketStatus;

    if (!ticketId) return res.status(400).json({ error: "ticket id is required" });
    if (!message) return res.status(400).json({ error: "message is required" });

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM support_tickets WHERE id = ? AND user_id = ? LIMIT 1",
      [ticketId, userId]
    );

    const ticket = rows?.[0];
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_id, message)
       VALUES (?, ?, ?, ?)`,
      [ticketId, senderType, userId, message]
    );

    const nextStatus: TicketStatus = status || (senderType === "support" ? "waiting_user" : "open");

    await pool.execute(
      "UPDATE support_tickets SET status = ?, last_message = ?, updated_at = NOW() WHERE id = ?",
      [nextStatus, message, ticketId]
    );

    await notifications.createNotification({
      user_id: userId,
      type: "support",
      event: senderType === "support" ? "support_ticket_replied" : "support_ticket_updated",
      title: senderType === "support" ? "Nova resposta do suporte" : "Ticket atualizado",
      message: senderType === "support"
        ? `O suporte respondeu seu ticket \"${ticket.subject}\".`
        : `Seu ticket \"${ticket.subject}\" foi atualizado.`,
      priority: nextStatus === "resolved" ? "low" : "medium",
      channels: senderType === "support" ? ["in_app", "email", "whatsapp"] : ["in_app"],
      store_id: ticket.store_id ? String(ticket.store_id) : null,
      metadata: {
        ticket_id: ticketId,
        status: nextStatus,
        sender_type: senderType,
      },
    });

    return res.json({ success: true, status: nextStatus });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch("/tickets/:id/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ensureSupportSchema();

    const ticketId = String(req.params.id || "").trim();
    const status = String(req.body?.status || "").trim() as TicketStatus;

    if (!ticketId) return res.status(400).json({ error: "ticket id is required" });
    if (!["open", "waiting_user", "resolved"].includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }

    const pool = getPool();
    const [result] = await pool.execute<any>(
      "UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
      [status, ticketId, userId]
    );

    if (Number(result?.affectedRows || 0) === 0) return res.status(404).json({ error: "Ticket not found" });

    await notifications.createNotification({
      user_id: userId,
      type: "support",
      event: "support_ticket_status_changed",
      title: "Status do ticket atualizado",
      message: `Seu ticket foi atualizado para: ${status}.`,
      priority: status === "resolved" ? "low" : "medium",
      channels: ["in_app", "email"],
      metadata: {
        ticket_id: ticketId,
        status,
      },
    });

    return res.json({ success: true, status });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

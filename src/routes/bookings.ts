import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { query, queryOne, update } from "../config/database";
import { logger } from "../utils/logger";
import { bookingNotificationService } from "../services/bookingNotifications";

/**
 * Booking management (Fase 7).
 * Bookings are stored as customers (leads) with `source_details.booking = {...}`.
 * This route surfaces them as first-class records with confirm/cancel actions.
 *
 * Status transitions live inside source_details.booking.status:
 *   pending_confirmation → confirmed | rescheduled | cancelled | completed
 */

const router = Router();
router.use(authMiddleware, attachBrandContext);

type BookingStatus = "pending_confirmation" | "confirmed" | "rescheduled" | "cancelled" | "completed";

interface BookingView {
  customer_id: string | number;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  product_id?: string;
  product_name?: string;
  start_at: string;
  end_at: string;
  address?: string | null;
  message?: string | null;
  status: BookingStatus;
  created_at: string;
}

function parseSourceDetails(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try { return JSON.parse(String(value)) as Record<string, any>; } catch { return {}; }
}

function safeStatus(value: unknown): BookingStatus {
  const s = String(value || "pending_confirmation").toLowerCase();
  if (s === "confirmed" || s === "rescheduled" || s === "cancelled" || s === "completed") return s as BookingStatus;
  return "pending_confirmation";
}

/* GET /api/bookings?status=...&from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = req.brandId || null;
    const statusFilter = String(req.query.status || "").trim().toLowerCase();
    const fromDate = String(req.query.from || "").trim();
    const toDate = String(req.query.to || "").trim();

    /* Filter at SQL level by source_details containing a "booking" key (cheap LIKE) +
     * scope to current user and brand if available. Postgres-friendly: cast jsonb to text. */
    const conditions: string[] = [
      `owner_user_id = ? OR assigned_to = ?`,
      `CAST(source_details AS TEXT) LIKE ?`,
    ];
    const params: any[] = [userId, userId, '%"booking":%'];

    if (brandId) {
      conditions.push(`(brand_id = ? OR brand_id IS NULL OR brand_id = '')`);
      params.push(brandId);
    }

    const rows = (await query<any[]>(
      `SELECT id, name, phone, email, source_details, created_at
       FROM customers
       WHERE (${conditions.slice(0, 2).join(") AND (")})${conditions.length > 2 ? " AND " + conditions.slice(2).join(" AND ") : ""}
       ORDER BY created_at DESC
       LIMIT 500`,
      params
    )) as any[];

    const bookings: BookingView[] = [];
    for (const row of rows || []) {
      const sd = parseSourceDetails(row.source_details);
      const booking = sd?.booking;
      if (!booking || !booking.start_at) continue;
      const status = safeStatus(booking.status);
      if (statusFilter && status !== statusFilter) continue;
      const startIso = String(booking.start_at);
      if (fromDate && startIso.slice(0, 10) < fromDate) continue;
      if (toDate && startIso.slice(0, 10) > toDate) continue;
      bookings.push({
        customer_id: row.id,
        customer_name: row.name,
        customer_phone: row.phone || undefined,
        customer_email: row.email || undefined,
        product_id: booking.product_id || undefined,
        product_name: booking.product_name || sd.product_name || undefined,
        start_at: startIso,
        end_at: String(booking.end_at || ""),
        address: booking.address || sd.address || null,
        message: sd.message || null,
        status,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      });
    }

    /* Group counts by status to power the admin filter chips */
    const counts: Record<string, number> = {
      pending_confirmation: 0, confirmed: 0, rescheduled: 0, cancelled: 0, completed: 0,
    };
    for (const b of bookings) counts[b.status] = (counts[b.status] || 0) + 1;

    res.json({ success: true, bookings, counts });
  } catch (error: any) {
    logger.error(error, "Error listing bookings");
    res.status(500).json({ error: error.message || "Failed to list bookings" });
  }
});

/* PATCH /api/bookings/:customerId — body: { status: confirmed|cancelled|... } */
router.patch("/:customerId", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const customerId = String(req.params.customerId || "").trim();
    if (!customerId) return res.status(400).json({ error: "customerId required" });

    const nextStatus = safeStatus(req.body?.status);
    const notes = String(req.body?.notes || "").trim();

    /* Load current customer */
    const row = await queryOne<any>(
      `SELECT id, name, phone, email, brand_id, source_details, notes FROM customers WHERE id = ? AND (owner_user_id = ? OR assigned_to = ?) LIMIT 1`,
      [customerId, userId, userId]
    );
    if (!row) return res.status(404).json({ error: "Booking not found" });

    const sd = parseSourceDetails(row.source_details);
    if (!sd.booking) return res.status(400).json({ error: "Customer is not a booking" });
    const previousStatus = safeStatus(sd.booking.status);

    sd.booking.status = nextStatus;
    sd.booking.status_updated_at = new Date().toISOString();
    sd.booking.status_history = Array.isArray(sd.booking.status_history) ? sd.booking.status_history : [];
    sd.booking.status_history.push({ from: previousStatus, to: nextStatus, at: sd.booking.status_updated_at });

    /* Also mirror to the customer.status so the leads pipeline reflects the booking lifecycle */
    const customerStatusMap: Record<BookingStatus, string> = {
      pending_confirmation: "new",
      confirmed: "negotiating",
      rescheduled: "negotiating",
      cancelled: "lost",
      completed: "converted",
    };
    const newCustomerStatus = customerStatusMap[nextStatus];

    const noteAppend = notes
      ? `\n[${sd.booking.status_updated_at}] ${nextStatus.toUpperCase()}: ${notes}`
      : `\n[${sd.booking.status_updated_at}] Booking → ${nextStatus.toUpperCase()}`;
    const mergedNotes = String(row.notes || "") + noteAppend;

    await update(
      `UPDATE customers SET source_details = ?, status = ?, notes = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(sd), newCustomerStatus, mergedNotes, customerId]
    );

    /* Dispatch WhatsApp notification to the customer (Fase 7.5).
     * Fire-and-forget conceptually but we await so the result lands in the response — this lets the
     * admin UI show "Confirmado · WhatsApp enviado" instead of leaving the merchant guessing.
     * The notification service NEVER throws; worst case returns { delivered: false, skipped_reason }. */
    let notification: any = null;
    if (nextStatus !== previousStatus) {
      const instanceManager = req.app.get("instanceManager");
      const brandRow = await queryOne<any>(`SELECT name FROM brand_units WHERE id = ? LIMIT 1`, [row.brand_id]).catch(() => null);
      notification = await bookingNotificationService.dispatchStatusChange(
        {
          customerId,
          customerName: row.name,
          customerPhone: row.phone || "",
          brandId: row.brand_id || null,
          ownerUserId: userId,
          productName: sd.booking?.product_name || sd.product_name || null,
          startAt: String(sd.booking?.start_at || ""),
          endAt: String(sd.booking?.end_at || ""),
          address: sd.booking?.address || null,
          status: nextStatus,
          reason: notes || null,
          brandName: brandRow?.name || null,
        },
        instanceManager
      );
    }

    res.json({
      success: true,
      booking: {
        customer_id: customerId,
        status: nextStatus,
        previous_status: previousStatus,
      },
      notification,
    });
  } catch (error: any) {
    logger.error(error, "Error updating booking status");
    res.status(500).json({ error: error.message || "Failed to update booking" });
  }
});

export default router;

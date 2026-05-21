import { query } from "../config/database";
import { logger } from "../utils/logger";

/**
 * Generate available booking slots for a given service product on a given date.
 *
 * Reads service_config from the product, intersects with weekday_hours of the
 * requested date, subtracts already-confirmed bookings (stored as customers with
 * source_details.booking metadata), and returns the open slots.
 *
 * Intentionally simple: no calendar persistence yet — uses customer records as
 * the source of truth. Future iteration can promote to a dedicated bookings table.
 */

export interface ServiceWeekdayHours {
  weekday: number;
  start: string;
  end: string;
}

export interface ServiceConfig {
  duration_minutes?: number;
  buffer_minutes?: number;
  max_per_slot?: number;
  weekday_hours?: ServiceWeekdayHours[];
  requires_address?: boolean;
  advance_notice_hours?: number;
  max_advance_days?: number;
}

export interface SlotProposal {
  start: string;       /* ISO datetime */
  end: string;         /* ISO datetime */
  label: string;       /* "10:00 – 11:00" */
  capacity: number;    /* total slots */
  available: number;   /* slots still open */
}

function parseHHMM(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const h = Math.max(0, Math.min(23, Number(match[1])));
  const m = Math.max(0, Math.min(59, Number(match[2])));
  return { h, m };
}

function combineDateTime(date: Date, hhmm: { h: number; m: number }): Date {
  const d = new Date(date);
  d.setHours(hhmm.h, hhmm.m, 0, 0);
  return d;
}

export function generateSlotsForDay(
  date: Date,
  config: ServiceConfig,
  takenStartIsoCounts: Map<string, number>
): SlotProposal[] {
  const duration = Math.max(5, Number(config.duration_minutes || 60));
  const buffer = Math.max(0, Number(config.buffer_minutes || 0));
  const capacity = Math.max(1, Number(config.max_per_slot || 1));
  const advanceNoticeHours = Math.max(0, Number(config.advance_notice_hours || 1));
  const earliestFromNow = new Date(Date.now() + advanceNoticeHours * 60 * 60 * 1000);

  const weekday = date.getDay();
  const ranges = Array.isArray(config.weekday_hours)
    ? config.weekday_hours.filter((r) => Number(r.weekday) === weekday)
    : [];
  if (ranges.length === 0) return [];

  const slots: SlotProposal[] = [];
  for (const range of ranges) {
    const startTime = parseHHMM(range.start);
    const endTime = parseHHMM(range.end);
    if (!startTime || !endTime) continue;
    const rangeStart = combineDateTime(date, startTime);
    const rangeEnd = combineDateTime(date, endTime);

    let cursor = new Date(rangeStart);
    while (true) {
      const slotEnd = new Date(cursor.getTime() + duration * 60 * 1000);
      if (slotEnd > rangeEnd) break;
      /* Skip past + within advance notice window */
      if (cursor >= earliestFromNow) {
        const key = cursor.toISOString();
        const taken = takenStartIsoCounts.get(key) || 0;
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          label: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")} – ${String(slotEnd.getHours()).padStart(2, "0")}:${String(slotEnd.getMinutes()).padStart(2, "0")}`,
          capacity,
          available: Math.max(0, capacity - taken),
        });
      }
      cursor = new Date(slotEnd.getTime() + buffer * 60 * 1000);
    }
  }

  return slots;
}

/**
 * Count existing bookings per slot start time for a product on a date.
 * Stored as customers where source_details.booking.product_id matches and start_at matches.
 */
export async function loadBookedSlotsCount(productId: string, dateIsoYYYYMMDD: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!productId || !dateIsoYYYYMMDD) return counts;
  try {
    /* Simple LIKE-based filter on source_details JSON text. Pulls all bookings for the product;
     * we trim by date in JS since cross-DB JSON querying is finicky. Volume is small per request. */
    const rows = (await query<any[]>(
      `SELECT source_details FROM customers
       WHERE source = ? AND status <> ? AND CAST(source_details AS TEXT) LIKE ?`,
      ["website", "lost", `%"product_id":"${productId}"%`]
    )) as any[];
    for (const row of rows || []) {
      let sd: any = row.source_details;
      if (typeof sd === "string") {
        try { sd = JSON.parse(sd); } catch { sd = null; }
      }
      const startIso = String(sd?.booking?.start_at || "").trim();
      if (!startIso) continue;
      if (!startIso.startsWith(dateIsoYYYYMMDD)) continue;
      counts.set(startIso, (counts.get(startIso) || 0) + 1);
    }
  } catch (e: any) {
    logger.warn(`loadBookedSlotsCount failed: ${e?.message || e}`);
  }
  return counts;
}

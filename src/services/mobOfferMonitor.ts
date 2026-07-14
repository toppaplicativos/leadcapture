/**
 * Background worker helpers for sequential offer expiry + push.
 * Called from processExpiredOffers path in index.ts interval.
 */
import { query } from "../config/database";
import { logger } from "../utils/logger";
import { mobLogisticsService } from "./mobLogistics";
import { notifyDispatchResult } from "./mobPush";

export async function runMobOfferCycle(): Promise<{
  expired: number;
  redispatched: number;
  notified: number;
}> {
  const result = await mobLogisticsService.processExpiredOffers();
  let notified = 0;

  if (result.redispatched > 0) {
    // Find deliveries with fresh pending offers in the last few seconds
    const rows = await query<any[]>(
      `SELECT DISTINCT o.delivery_id, d.owner_user_id, d.brand_id, o.expires_at, b.name AS brand_name
       FROM mob_delivery_offers o
       INNER JOIN mob_deliveries d ON d.id = o.delivery_id
       LEFT JOIN brand_units b ON b.id = d.brand_id
       WHERE o.status = 'pending'
         AND o.offered_at >= NOW() - INTERVAL '15 seconds'
       LIMIT 30`
    ).catch(() => []);

    for (const row of rows || []) {
      const offered = await query<any[]>(
        `SELECT courier_id FROM mob_delivery_offers
         WHERE delivery_id = ? AND status = 'pending'`,
        [row.delivery_id]
      ).catch(() => []);
      const ids = (offered || []).map((r) => String(r.courier_id));
      if (!ids.length) continue;
      notifyDispatchResult({
        ownerUserId: String(row.owner_user_id),
        brandId: String(row.brand_id),
        deliveryId: String(row.delivery_id),
        offeredTo: ids,
        mode: "sequential",
        brandName: row.brand_name,
        expiresAt: row.expires_at,
      });
      notified++;
    }
  }

  if (result.expired || result.redispatched) {
    logger.info(
      `Mob offer cycle: expired=${result.expired} redispatched=${result.redispatched} notified=${notified}`
    );
  }
  return { ...result, notified };
}

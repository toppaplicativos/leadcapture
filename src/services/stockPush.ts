import { query } from "../config/database";
import { getPushNotificationService } from "./pushNotifications";
import { logger } from "../utils/logger";

type StockEvent = "low_stock" | "out_of_stock" | "order_ready_delivery" | "sync_failure";

const EVENT_PRIORITY: Record<StockEvent, "normal" | "high" | "critical"> = {
  low_stock: "high",
  out_of_stock: "critical",
  order_ready_delivery: "high",
  sync_failure: "critical",
};

/** Envia o alerta somente aos gestores ativos do estoque desta marca. */
export async function notifyStockManagers(input: {
  ownerUserId: string;
  brandId: string | null | undefined;
  eventKey: StockEvent;
  title: string;
  body: string;
  url?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const brandId = String(input.brandId || "").trim();
  if (!brandId) return;

  try {
    const managers = await query<any[]>(
      `SELECT DISTINCT s.manager_user_id, b.slug AS brand_slug, b.logo_url AS brand_logo
       FROM stock_app_credentials s
       LEFT JOIN brand_units b ON b.id = s.brand_id
       WHERE s.owner_user_id = ? AND s.brand_id = ? AND s.is_active = TRUE`,
      [input.ownerUserId, brandId],
    );
    if (!managers?.length) return;

    const push = getPushNotificationService();
    const brandSlug = String(managers[0]?.brand_slug || "").trim();
    const brandLogo = String(managers[0]?.brand_logo || "").trim();
    const requestedUrl = input.url || "/app-estoque";
    const resolvedUrl = brandSlug && requestedUrl.startsWith("/app-estoque?")
      ? `/app-estoque/${encodeURIComponent(brandSlug)}/painel${requestedUrl.slice("/app-estoque".length)}`
      : requestedUrl;
    await Promise.allSettled(managers.map((manager) => push.sendToUser({
      userId: String(manager.manager_user_id),
      appContext: "stock",
      eventKey: input.eventKey,
      title: input.title,
      body: input.body,
      priority: EVENT_PRIORITY[input.eventKey],
      url: resolvedUrl,
      metadata: {
        organization_id: brandId,
        ...(brandLogo ? { icon: brandLogo, logo: brandLogo } : {}),
        tag: `${input.eventKey}:${String(input.metadata?.product_id || input.metadata?.order_id || brandId)}`,
        requireInteraction: input.eventKey === "out_of_stock" || input.eventKey === "sync_failure",
        ...input.metadata,
      },
    })));
  } catch (error: any) {
    logger.warn({ err: error?.message, eventKey: input.eventKey, brandId }, "stock push dispatch failed");
  }
}

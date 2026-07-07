import { query, update } from "../config/database";
import { logger } from "../utils/logger";
import { instagramService } from "./instagram";
import { facebookService } from "./facebook";

type DuePost = { id: string; brand_id: string; scheduled_at?: string };

const BATCH_LIMIT = 5;

async function claimDuePosts(table: "instagram_posts" | "facebook_posts"): Promise<DuePost[]> {
  const due = await query<DuePost[]>(
    `SELECT id, brand_id, scheduled_at FROM ${table}
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC LIMIT ?`,
    [BATCH_LIMIT],
  );

  const claimed: DuePost[] = [];
  for (const row of due || []) {
    const affected = await update(
      `UPDATE ${table} SET status = 'publishing', updated_at = NOW() WHERE id = ? AND status = 'scheduled'`,
      [row.id],
    );
    if (affected > 0) claimed.push(row);
  }
  return claimed;
}

export async function processScheduledSocialPosts(): Promise<void> {
  const igDue = await claimDuePosts("instagram_posts");
  for (const row of igDue) {
    logger.info(`[SocialScheduler] Publicando post Instagram ${row.id} (brand ${row.brand_id})`);
    const result = await instagramService.publishPost(row.brand_id, row.id);
    if (result.ok) {
      logger.info(`[SocialScheduler] Instagram ${row.id} publicado`);
    } else {
      logger.warn(`[SocialScheduler] Instagram ${row.id} falhou: ${result.message}`);
    }
  }

  const fbDue = await claimDuePosts("facebook_posts");
  for (const row of fbDue) {
    logger.info(`[SocialScheduler] Publicando post Facebook ${row.id} (brand ${row.brand_id})`);
    const result = await facebookService.publishPost(row.brand_id, row.id);
    if (result.ok) {
      logger.info(`[SocialScheduler] Facebook ${row.id} publicado`);
    } else {
      logger.warn(`[SocialScheduler] Facebook ${row.id} falhou: ${result.message}`);
    }
  }
}
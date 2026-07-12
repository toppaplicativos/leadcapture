/**
 * Per-channel attendance config (Instagram / WhatsApp).
 * Inherits brand global training; stores channel-specific overrides.
 */

import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import {
  AttendanceChannel,
  clampChannelMaxChars,
  clampMaxBubbles,
  platformHardCap,
} from "./channelLimits";
import { logger } from "../utils/logger";

export type SalesMode = "off" | "assist" | "full";

export type ChannelAttendance = {
  id: string;
  brand_id: string;
  channel: AttendanceChannel;
  enabled: boolean;
  training_channel: string;
  persona_override: string;
  tone_override: string;
  max_chars: number;
  split_long_replies: boolean;
  max_bubbles: number;
  first_contact_override: string;
  channel_rules: string;
  actions_json: Record<string, any>;
  sales_mode: SalesMode;
  include_catalog: boolean;
  include_kb: boolean;
  include_skills: boolean;
  faq_json: Array<{ q: string; a: string }>;
  updated_at?: string;
};

export type ChannelAttendanceUpdate = Partial<
  Omit<ChannelAttendance, "id" | "brand_id" | "channel" | "updated_at">
>;

function parseFaq(value: unknown): Array<{ q: string; a: string }> {
  if (!value) return [];
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => ({
      q: String(item?.q || item?.question || "").trim(),
      a: String(item?.a || item?.answer || "").trim(),
    }))
    .filter((x) => x.q && x.a);
}

function parseActions(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function defaults(brandId: string, channel: AttendanceChannel): ChannelAttendance {
  return {
    id: "",
    brand_id: brandId,
    channel,
    enabled: true,
    training_channel: "",
    persona_override: "",
    tone_override: "",
    max_chars: clampChannelMaxChars(channel, undefined),
    split_long_replies: true,
    max_bubbles: 3,
    first_contact_override: "",
    channel_rules: "",
    actions_json: {},
    sales_mode: channel === "instagram" ? "assist" : "full",
    include_catalog: true,
    include_kb: true,
    include_skills: true,
    faq_json: [],
  };
}

function rowToAttendance(row: any, channel: AttendanceChannel): ChannelAttendance {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    channel,
    enabled: row.enabled !== false && row.enabled !== 0 && row.enabled !== "f",
    training_channel: String(row.training_channel || ""),
    persona_override: String(row.persona_override || ""),
    tone_override: String(row.tone_override || ""),
    max_chars: clampChannelMaxChars(channel, row.max_chars),
    split_long_replies: row.split_long_replies !== false && row.split_long_replies !== 0,
    max_bubbles: clampMaxBubbles(row.max_bubbles, 3),
    first_contact_override: String(row.first_contact_override || ""),
    channel_rules: String(row.channel_rules || ""),
    actions_json: parseActions(row.actions_json),
    sales_mode: (["off", "assist", "full"].includes(String(row.sales_mode))
      ? String(row.sales_mode)
      : "assist") as SalesMode,
    include_catalog: row.include_catalog !== false && row.include_catalog !== 0,
    include_kb: row.include_kb !== false && row.include_kb !== 0,
    include_skills: row.include_skills !== false && row.include_skills !== 0,
    faq_json: parseFaq(row.faq_json),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

let schemaReady = false;

export async function ensureChannelAttendanceSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS brand_channel_attendance (
      id VARCHAR(36) PRIMARY KEY,
      brand_id VARCHAR(36) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      training_channel TEXT,
      persona_override TEXT,
      tone_override TEXT,
      max_chars INT NOT NULL DEFAULT 900,
      split_long_replies BOOLEAN NOT NULL DEFAULT TRUE,
      max_bubbles INT NOT NULL DEFAULT 3,
      first_contact_override TEXT,
      channel_rules TEXT,
      actions_json JSONB,
      sales_mode VARCHAR(16) NOT NULL DEFAULT 'assist',
      include_catalog BOOLEAN NOT NULL DEFAULT TRUE,
      include_kb BOOLEAN NOT NULL DEFAULT TRUE,
      include_skills BOOLEAN NOT NULL DEFAULT TRUE,
      faq_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (brand_id, channel)
    )
  `).catch((e: any) => {
    logger.warn(`[channelAttendance] ensureSchema: ${e?.message || e}`);
  });
  schemaReady = true;
}

async function seedFromLegacy(
  brandId: string,
  channel: AttendanceChannel,
): Promise<ChannelAttendance | null> {
  if (channel === "instagram") {
    try {
      const { instagramService } = await import("./instagram");
      const ig = await instagramService.getAiSettings(brandId);
      const base = defaults(brandId, "instagram");
      return {
        ...base,
        persona_override: String(ig.persona || ""),
        tone_override: String(ig.tone || ""),
        max_chars: clampChannelMaxChars("instagram", ig.max_chars),
        channel_rules: String(ig.guidelines || ""),
        faq_json: Array.isArray(ig.faq) ? (ig.faq as any) : [],
        enabled: true,
      };
    } catch {
      return null;
    }
  }

  if (channel === "whatsapp") {
    try {
      const row = await queryOne<any>(
        `SELECT auto_reply_enabled FROM ai_global_settings WHERE brand_id = ? LIMIT 1`,
        [brandId],
      );
      const base = defaults(brandId, "whatsapp");
      return {
        ...base,
        enabled: row ? Boolean(row.auto_reply_enabled) : true,
      };
    } catch {
      return defaults(brandId, "whatsapp");
    }
  }
  return null;
}

export async function getChannelAttendance(
  brandId: string,
  channel: AttendanceChannel,
): Promise<ChannelAttendance> {
  await ensureChannelAttendanceSchema();
  const row = await queryOne<any>(
    `SELECT * FROM brand_channel_attendance WHERE brand_id = ? AND channel = ? LIMIT 1`,
    [brandId, channel],
  );
  if (row) return rowToAttendance(row, channel);

  const seeded = (await seedFromLegacy(brandId, channel)) || defaults(brandId, channel);
  // Persist seed so UI has a stable row
  const saved = await upsertChannelAttendance(brandId, channel, seeded);
  return saved;
}

export async function listChannelAttendance(brandId: string): Promise<{
  instagram: ChannelAttendance;
  whatsapp: ChannelAttendance;
  platform_caps: { instagram: number; whatsapp: number };
}> {
  const [instagram, whatsapp] = await Promise.all([
    getChannelAttendance(brandId, "instagram"),
    getChannelAttendance(brandId, "whatsapp"),
  ]);
  return {
    instagram,
    whatsapp,
    platform_caps: {
      instagram: platformHardCap("instagram"),
      whatsapp: platformHardCap("whatsapp"),
    },
  };
}

export async function upsertChannelAttendance(
  brandId: string,
  channel: AttendanceChannel,
  patch: ChannelAttendanceUpdate & Partial<ChannelAttendance>,
): Promise<ChannelAttendance> {
  await ensureChannelAttendanceSchema();
  const current = await queryOne<any>(
    `SELECT * FROM brand_channel_attendance WHERE brand_id = ? AND channel = ? LIMIT 1`,
    [brandId, channel],
  );
  const base = current
    ? rowToAttendance(current, channel)
    : (await seedFromLegacy(brandId, channel)) || defaults(brandId, channel);

  const next: ChannelAttendance = {
    ...base,
    ...patch,
    brand_id: brandId,
    channel,
    max_chars: clampChannelMaxChars(channel, patch.max_chars ?? base.max_chars),
    max_bubbles: clampMaxBubbles(patch.max_bubbles ?? base.max_bubbles, 3),
    sales_mode: (patch.sales_mode || base.sales_mode) as SalesMode,
    faq_json: patch.faq_json !== undefined ? parseFaq(patch.faq_json) : base.faq_json,
    actions_json:
      patch.actions_json !== undefined ? parseActions(patch.actions_json) : base.actions_json,
  };

  const id = current?.id || randomUUID();
  if (current) {
    await update(
      `UPDATE brand_channel_attendance SET
        enabled = ?, training_channel = ?, persona_override = ?, tone_override = ?,
        max_chars = ?, split_long_replies = ?, max_bubbles = ?,
        first_contact_override = ?, channel_rules = ?, actions_json = ?::jsonb,
        sales_mode = ?, include_catalog = ?, include_kb = ?, include_skills = ?,
        faq_json = ?::jsonb, updated_at = NOW()
       WHERE brand_id = ? AND channel = ?`,
      [
        next.enabled,
        next.training_channel,
        next.persona_override,
        next.tone_override,
        next.max_chars,
        next.split_long_replies,
        next.max_bubbles,
        next.first_contact_override,
        next.channel_rules,
        JSON.stringify(next.actions_json || {}),
        next.sales_mode,
        next.include_catalog,
        next.include_kb,
        next.include_skills,
        JSON.stringify(next.faq_json || []),
        brandId,
        channel,
      ],
    );
  } else {
    await insert(
      `INSERT INTO brand_channel_attendance (
        id, brand_id, channel, enabled, training_channel, persona_override, tone_override,
        max_chars, split_long_replies, max_bubbles, first_contact_override, channel_rules,
        actions_json, sales_mode, include_catalog, include_kb, include_skills, faq_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?::jsonb)`,
      [
        id,
        brandId,
        channel,
        next.enabled,
        next.training_channel,
        next.persona_override,
        next.tone_override,
        next.max_chars,
        next.split_long_replies,
        next.max_bubbles,
        next.first_contact_override,
        next.channel_rules,
        JSON.stringify(next.actions_json || {}),
        next.sales_mode,
        next.include_catalog,
        next.include_kb,
        next.include_skills,
        JSON.stringify(next.faq_json || []),
      ],
    );
  }

  // Write-through legacy IG settings (compat with InstagramAiTab)
  if (channel === "instagram") {
    try {
      const { instagramService } = await import("./instagram");
      await instagramService.saveAiSettings(brandId, {
        persona: next.persona_override,
        tone: next.tone_override || "caloroso e direto",
        max_chars: next.max_chars,
        guidelines: next.channel_rules,
        faq: next.faq_json,
      });
    } catch (e: any) {
      logger.warn(`[channelAttendance] IG write-through: ${e?.message || e}`);
    }
  }

  if (channel === "whatsapp") {
    try {
      await query(
        `INSERT INTO ai_global_settings (brand_id, auto_reply_enabled, updated_at)
         VALUES (?, ?, NOW())
         ON CONFLICT (brand_id) DO UPDATE SET auto_reply_enabled = EXCLUDED.auto_reply_enabled, updated_at = NOW()`,
        [brandId, next.enabled],
      ).catch(async () => {
        // table may use different PK — best effort update
        await update(
          `UPDATE ai_global_settings SET auto_reply_enabled = ?, updated_at = NOW() WHERE brand_id = ?`,
          [next.enabled, brandId],
        ).catch(() => undefined);
      });
    } catch {
      /* optional */
    }
  }

  return getChannelAttendance(brandId, channel);
}

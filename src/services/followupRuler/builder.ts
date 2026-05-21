/**
 * builder — cria as 8 campanhas (FU0..FU7) no banco a partir de um FollowupProfile.
 *
 * Porta direta de scripts/followup/builder.js, mas:
 *   - usa src/config/database (sem pg.Pool próprio)
 *   - sempre cria em status='draft' (sem activate)
 *   - idempotente por (user_id, brand_id, name LIKE 'FU%')
 */

import { randomUUID } from "crypto";
import { query } from "../../config/database";
import { logger } from "../../utils/logger";
import { buildSequence, FollowupProfile, FollowupStep } from "./templates";

const EXIT_TAGS = ["respondeu", "opt_out", "convertido"];

export interface CampaignRef {
  id: string;
  name: string;
  framework: string;
  delayDays: number;
}

export interface BuildResult {
  created: CampaignRef[];
  skipped: CampaignRef[];
  errors: Array<{ name: string; error: string }>;
}

function defaultSettings(): Record<string, any> {
  return {
    campaignMode: "relationship",
    campaignCore: { slug: "", instanceMode: "specific", poolInstanceIds: [], rotationMode: "balanced" },
    destination: { type: "lead_list", targetType: "group", targets: [] },
    scheduler: { scheduleMode: "immediate", timeZone: "America/Sao_Paulo", smartWindowStart: "08:00", smartWindowEnd: "18:00" },
    actionWindow: { enabled: true, start: "08:00", end: "18:00" },
    finalActions: { nextStatus: "contacted", addTags: ["contatado"] },
    triggers: { onNewLead: false, onStatusChange: false, onTagMatch: false, onOrderCreated: false },
    composer: { intentText: "", personalizedPerLead: true, useAutoVariations: true },
    antiBlock: {
      autoPauseByBlocks: 5,
      autoPauseByErrorRate: 20,
      autoPauseOnOffline: true,
      avoidNight: true,
      avoidSunday: true,
    },
    media: {
      imageFileName: null,
      imageCaption: null,
      imageUseTextAsCaption: false,
      videoFileName: null,
      videoCaption: null,
      videoUseTextAsCaption: false,
      audioFileName: null,
      audioVoiceNote: true,
      documentFileName: null,
      documentName: null,
      linkUrl: null,
    },
  };
}

function defaultSpeed(): Record<string, any> {
  return { mode: "normal", msgPerMinute: 2, pauseBetweenMsgSeconds: 20 };
}

function buildStepFilter(step: FollowupStep, profile: FollowupProfile): Record<string, any> {
  const isFirst = !step.sendAfterTag;
  return {
    statuses: isFirst ? (profile.initialStatuses || ["new"]) : ["new", "contacted"],
    hasWhatsapp: profile.requireWhatsApp === true,
    tagsInclude: step.sendAfterTag ? [step.sendAfterTag] : undefined,
    tagsExclude: [step.addTag, ...EXIT_TAGS],
  };
}

function mergeSettings(step: FollowupStep): { settings: Record<string, any>; speed: Record<string, any> } {
  const settings = defaultSettings();
  settings.campaignCore.slug = step.slug;
  settings.composer.intentText = step.aiPrompt;
  settings.composer.personalizedPerLead = true;
  settings.composer.useAutoVariations = true;
  settings.finalActions.addTags = Array.from(new Set(["contatado", step.addTag]));
  return { settings, speed: defaultSpeed() };
}

async function fetchExisting(userId: string, brandId: string): Promise<Map<string, string>> {
  try {
    const rows = await query<Array<{ id: string; name: string }>>(
      `SELECT id, name FROM campaign_history
       WHERE user_id = ? AND brand_id = ? AND name LIKE 'FU%'`,
      [userId, brandId]
    );
    return new Map((rows || []).map((r) => [r.name, r.id]));
  } catch {
    return new Map();
  }
}

async function insertCampaign(
  id: string,
  userId: string,
  brandId: string,
  instanceId: string | null,
  step: FollowupStep,
  filter: Record<string, any>,
  settings: Record<string, any>,
  speed: Record<string, any>
): Promise<void> {
  await query(
    `INSERT INTO campaign_history (
      id, user_id, brand_id, instance_id, name, message_template, ai_prompt, use_ai,
      filter_json, speed_json, campaign_mode, target_count, status, scheduled_at, settings,
      use_instance_rotation, rotation_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      brandId,
      instanceId,
      step.name,
      step.fallback,
      step.aiPrompt,
      true,
      JSON.stringify(filter),
      JSON.stringify(speed),
      "relationship",
      0,
      "draft",
      null,
      JSON.stringify(settings),
      false,
      "balanced",
    ]
  );
}

export async function createFollowupRulerFromProfile(profile: FollowupProfile): Promise<BuildResult> {
  const sequence = buildSequence(profile);
  const existingByName = await fetchExisting(profile.userId, profile.brandId);

  const result: BuildResult = { created: [], skipped: [], errors: [] };

  for (const step of sequence) {
    const existingId = existingByName.get(step.name);
    if (existingId) {
      result.skipped.push({ id: existingId, name: step.name, framework: step.framework, delayDays: step.delayDays });
      continue;
    }

    try {
      const id = randomUUID();
      const filter = buildStepFilter(step, profile);
      const merged = mergeSettings(step);
      await insertCampaign(id, profile.userId, profile.brandId, profile.instanceId, step, filter, merged.settings, merged.speed);
      result.created.push({ id, name: step.name, framework: step.framework, delayDays: step.delayDays });
    } catch (err: any) {
      logger.error(`[followupRuler] insert ${step.name} failed: ${err.message}`);
      result.errors.push({ name: step.name, error: err.message });
    }
  }

  return result;
}

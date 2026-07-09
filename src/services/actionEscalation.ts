/**
 * Motor de escalonamento de ações — lembretes, expiração e alertas ao gestor.
 */
import { query, queryOne } from "../config/database";
import { logger } from "../utils/logger";
import { getPlatformActionsService } from "./platformActions";
import { getNotificationPlatformService } from "./notificationPlatform";
import { emitPlatformEventToUser } from "./notificationHub";

const TICK_MS = 5 * 60_000;
let timer: NodeJS.Timeout | null = null;
let started = false;

type OpenAction = {
  id: string;
  organization_id: string;
  app_context: string;
  assigned_to_user_id: string;
  source_event_key: string;
  action_type: string;
  title: string;
  priority: string;
  status: string;
  due_at: string | null;
  created_at: string;
  sla_minutes: number | null;
  metadata_json: string | null;
};

function minutesSince(dateIso: string): number {
  return Math.floor((Date.now() - new Date(dateIso).getTime()) / 60_000);
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function processActionEscalations(): Promise<{ expired: number; reminded: number; escalated: number }> {
  const actions = getPlatformActionsService();
  const platform = getNotificationPlatformService();
  await actions.ensureSchema();
  await platform.ensureSchema();

  const expiredCount = await actions.expireOverdueActions();
  let reminded = 0;
  let escalated = 0;

  const openActions = await query<OpenAction[]>(
    `SELECT id, organization_id, app_context, assigned_to_user_id, source_event_key,
            action_type, title, priority, status, due_at, created_at, sla_minutes, metadata_json
     FROM platform_actions
     WHERE status IN ('open', 'in_progress', 'waiting', 'escalated')
     ORDER BY due_at ASC NULLS LAST
     LIMIT 200`,
  );

  const rules = await platform.listEscalationRules();
  const ruleMap = new Map(rules.filter((r) => r.is_active).map((r) => [`${r.event_key}:${r.action_type}`, r]));

  for (const action of openActions || []) {
    const rule = ruleMap.get(`${action.source_event_key}:${action.action_type}`);
    if (!rule) continue;

    const meta = parseMeta(action.metadata_json);
    const ageMin = minutesSince(action.created_at);
    const reminders = Number(meta.escalation_reminders || 0);

    if (rule.first_reminder_minutes && ageMin >= rule.first_reminder_minutes && reminders < 1) {
      await sendReminder(action, rule, 1);
      await platform.logActionEvent(action.id, "reminder", `Lembrete 1 após ${ageMin}min`, action.assigned_to_user_id);
      await updateActionMeta(action.id, { escalation_reminders: 1 });
      reminded++;
      continue;
    }

    if (rule.second_reminder_minutes && ageMin >= rule.second_reminder_minutes && reminders < 2) {
      await escalateToManager(action, rule);
      await actions.updateStatus(action.assigned_to_user_id, action.id, "escalated");
      await platform.logActionEvent(action.id, "escalated", `Escalonado ao gestor após ${ageMin}min`);
      await updateActionMeta(action.id, { escalation_reminders: 2, escalated_at: new Date().toISOString() });
      escalated++;
    }
  }

  if (expiredCount > 0 || reminded > 0 || escalated > 0) {
    logger.info(`[ActionEscalation] expired=${expiredCount} reminded=${reminded} escalated=${escalated}`);
  }

  return { expired: expiredCount, reminded, escalated };
}

async function updateActionMeta(actionId: string, patch: Record<string, unknown>): Promise<void> {
  const row = await queryOne<{ metadata_json: string | null }>(
    `SELECT metadata_json FROM platform_actions WHERE id = ? LIMIT 1`,
    [actionId],
  );
  const meta = parseMeta(row?.metadata_json);
  await query(
    `UPDATE platform_actions SET metadata_json = ?, updated_at = NOW() WHERE id = ?`,
    [JSON.stringify({ ...meta, ...patch }), actionId],
  );
}

async function sendReminder(
  action: OpenAction,
  rule: { first_reminder_minutes: number | null },
  level: number,
): Promise<void> {
  await emitPlatformEventToUser(action.source_event_key, action.assigned_to_user_id, {
    organization_id: action.organization_id,
    skip_action: true,
    priority_override: "urgent",
    template_vars: {
      action_title: action.title,
      reminder_level: String(level),
    },
    metadata: { escalation_reminder: true, action_id: action.id },
  });
}

async function escalateToManager(
  action: OpenAction,
  rule: { escalate_to_role: string | null; auto_reassign: boolean },
): Promise<void> {
  const managerId = await resolveManagerUserId(action.organization_id, rule.escalate_to_role);
  if (managerId) {
    await emitPlatformEventToUser("admin.support.sla_expired", managerId, {
      organization_id: action.organization_id,
      skip_action: false,
      priority_override: "critical",
      template_vars: {
        case_id: action.id.slice(-6),
        action_title: action.title,
      },
      entity_type: "platform_action",
      entity_id: action.id,
      metadata: { escalated_from: action.assigned_to_user_id },
    });
  }

  if (rule.auto_reassign) {
    const actions = getPlatformActionsService();
    await actions.updateStatus(action.assigned_to_user_id, action.id, "reassigned");
  }
}

async function resolveManagerUserId(organizationId: string, _role: string | null): Promise<string | null> {
  if (!organizationId) return null;
  const storeRow = await queryOne<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM storefront_stores WHERE brand_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  if (storeRow?.owner_user_id) return String(storeRow.owner_user_id);

  const programRow = await queryOne<{ owner_user_id: string }>(
    `SELECT owner_user_id FROM affiliate_program_config WHERE brand_id = ? LIMIT 1`,
    [organizationId],
  );
  return programRow?.owner_user_id ? String(programRow.owner_user_id) : null;
}

export function startActionEscalationMonitor(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    void processActionEscalations();
    timer = setInterval(() => { void processActionEscalations(); }, TICK_MS);
  }, 90_000);
  logger.info(`[ActionEscalation] monitor iniciado (tick=${TICK_MS}ms)`);
}

export function stopActionEscalationMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
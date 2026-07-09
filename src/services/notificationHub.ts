import { logger } from "../utils/logger";
import type { PushAppContext } from "../config/push-events";
import {
  mapActionPriority,
  renderTemplate,
  type NotificationEventType,
} from "../config/notification-events";
import { getNotificationService, type NotificationChannel } from "./notifications";
import { getPlatformActionsService } from "./platformActions";
import { getNotificationPlatformService } from "./notificationPlatform";

export type PlatformEventRecipient = {
  user_id: string;
  role?: string | null;
  organization_id?: string | null;
};

export type EmitPlatformEventInput = {
  event_key: string;
  recipients: PlatformEventRecipient[];
  template_vars?: Record<string, string | number | undefined | null>;
  entity_type?: string | null;
  entity_id?: string | null;
  organization_id?: string | null;
  deep_link?: string | null;
  priority_override?: "low" | "normal" | "high" | "urgent" | "critical";
  created_by?: string;
  skip_action?: boolean;
  metadata?: Record<string, unknown>;
};

export type EmitPlatformEventResult = {
  event_key: string;
  notifications: Array<{ notification_id: string; user_id: string; action_id?: string | null }>;
  skipped: number;
};

function mapPriorityToHub(
  p: "low" | "normal" | "high" | "urgent" | "critical",
): "low" | "medium" | "high" | "critical" {
  if (p === "critical") return "critical";
  if (p === "urgent" || p === "high") return "high";
  if (p === "low") return "low";
  return "medium";
}

function resolveDeepLink(
  template: string | undefined,
  vars: Record<string, string | number | undefined | null>,
  override?: string | null,
): string | null {
  if (override) return String(override).trim() || null;
  if (!template) return null;
  const rendered = renderTemplate(template, vars);
  return rendered || null;
}

async function resolveChannelsForUser(
  userId: string,
  eventKey: string,
  appContext: PushAppContext,
  defChannels: Array<"in_app" | "push">,
  eventConfig: Awaited<ReturnType<ReturnType<typeof getNotificationPlatformService>["resolveEventConfig"]>>,
): Promise<NotificationChannel[]> {
  const platform = getNotificationPlatformService();
  const out: NotificationChannel[] = [];

  const channels = defChannels.length ? defChannels : (["in_app", "push"] as const);
  for (const ch of channels) {
    if (ch === "push" && !eventConfig?.can_push) continue;
    const gate = await platform.shouldDeliverToUser(
      userId, eventKey, appContext, ch as "in_app" | "push", eventConfig!,
    );
    if (gate.ok) {
      out.push(ch === "push" ? "push" : "in_app");
    } else {
      await platform.logDelivery({
        user_id: userId,
        event_key: eventKey,
        status: "skipped",
        channel: ch,
        failure_reason: gate.reason,
      });
    }
  }

  if (!out.length) out.push("in_app");
  return out;
}

export async function emitPlatformEvent(input: EmitPlatformEventInput): Promise<EmitPlatformEventResult> {
  const { resolveCanonicalEventKey } = await import("../config/notification-events");
  const eventKey = resolveCanonicalEventKey(String(input.event_key || "").trim());
  const platform = getNotificationPlatformService();
  const definition = await platform.resolveEventConfig(eventKey);

  if (!definition) {
    logger.warn(`[NotificationHub] event_key desconhecido: ${eventKey}`);
    return { event_key: eventKey, notifications: [], skipped: input.recipients?.length || 0 };
  }

  const vars = input.template_vars || {};
  let title = renderTemplate(definition.title_template, vars);
  let body = renderTemplate(definition.body_template, vars);
  const ctaLabel = definition.cta_label ? renderTemplate(definition.cta_label, vars) : undefined;
  const deepLink = resolveDeepLink(definition.deep_link_template, vars, input.deep_link);
  const resolvedPriority = (input.priority_override || definition.default_priority) as
    "low" | "normal" | "high" | "urgent" | "critical";
  const priority = mapPriorityToHub(resolvedPriority);

  const notifications = getNotificationService();
  const actions = getPlatformActionsService();
  const results: EmitPlatformEventResult["notifications"] = [];
  let skipped = 0;

  for (const recipient of input.recipients || []) {
    const userId = String(recipient.user_id || "").trim();
    if (!userId) {
      skipped++;
      continue;
    }

    const orgId = String(
      input.organization_id || recipient.organization_id || vars.brand_id || "",
    ).trim() || null;

    try {
      const batch = await platform.evaluateBatching({
        user_id: userId,
        event_key: eventKey,
        group_key: definition.group_key,
        title,
        body,
        is_critical: definition.is_critical || resolvedPriority === "critical",
      });

      if (batch.suppressed) {
        skipped++;
        await platform.logDelivery({
          user_id: userId,
          event_key: eventKey,
          status: "skipped",
          channel: "push",
          failure_reason: "batched_summary_active",
          metadata: { batch_id: batch.batch_id, count: batch.body },
        });
        continue;
      }

      title = batch.title;
      body = batch.body;

      const channels = await resolveChannelsForUser(
        userId,
        eventKey,
        definition.app_target,
        definition.channels,
        definition,
      );

      const playSound = await platform.shouldPlaySound(
        userId,
        eventKey,
        definition.app_target,
        definition,
      );

      const notification = await notifications.createPlatformNotification({
        user_id: userId,
        event_key: eventKey,
        title,
        message: body,
        priority,
        channels,
        app_target: definition.app_target,
        brand_id: orgId,
        category: definition.category,
        event_type: definition.type as NotificationEventType,
        deep_link: deepLink,
        entity_type: input.entity_type || null,
        entity_id: input.entity_id || null,
        action_required: definition.action_required,
        cta_label: ctaLabel || null,
        sound_key: playSound ? definition.sound_key || null : null,
        group_key: definition.group_key || null,
        metadata: {
          ...(input.metadata || {}),
          app_context: definition.app_target,
          event_type: definition.type,
          category: definition.category,
          url: deepLink || undefined,
          cta_label: ctaLabel,
          sound_key: playSound ? definition.sound_key : undefined,
          play_sound: playSound,
          template_vars: vars,
        },
      });

      if (batch.batch_id) {
        await platform.linkBatchNotification(batch.batch_id, notification.notification_id);
      }

      for (const ch of channels) {
        await platform.logDelivery({
          notification_id: notification.notification_id,
          user_id: userId,
          event_key: eventKey,
          status: ch === "in_app" ? "delivered" : "sent",
          channel: ch,
        });
      }

      let actionId: string | null = null;

      if (!input.skip_action && definition.auto_action && definition.creates_action) {
        const rule = definition.auto_action;
        const actionTitle = renderTemplate(rule.title_template, vars);
        const actionDesc = rule.description_template
          ? renderTemplate(rule.description_template, vars)
          : body;

        const action = await actions.createAction({
          organization_id: orgId || userId,
          app_context: definition.app_target as PushAppContext,
          assigned_to_user_id: userId,
          assigned_to_role: recipient.role || null,
          created_by: input.created_by || "system",
          source_event_key: eventKey,
          source_notification_id: notification.notification_id,
          entity_type: input.entity_type || null,
          entity_id: input.entity_id || null,
          title: actionTitle || title,
          description: actionDesc,
          action_type: rule.action_type,
          priority: mapActionPriority(rule.priority || definition.default_priority),
          sla_minutes: rule.sla_minutes ?? null,
          metadata: { deep_link: deepLink, template_vars: vars },
        });
        actionId = action.id;

        await notifications.linkAction(notification.notification_id, actionId);
        await platform.logActionEvent(actionId, "created", "Ação criada automaticamente", userId, {
          event_key: eventKey,
          sla_minutes: rule.sla_minutes,
        });
      }

      results.push({
        notification_id: notification.notification_id,
        user_id: userId,
        action_id: actionId,
      });
    } catch (err: unknown) {
      skipped++;
      await platform.logDelivery({
        user_id: userId,
        event_key: eventKey,
        status: "failed",
        channel: "in_app",
        failure_reason: err instanceof Error ? err.message : String(err),
      });
      logger.warn({ err, eventKey, userId }, "[NotificationHub] falha ao emitir notificação");
    }
  }

  return { event_key: eventKey, notifications: results, skipped };
}

/** Atalho para um único destinatário. */
export async function emitPlatformEventToUser(
  eventKey: string,
  userId: string,
  opts: Omit<EmitPlatformEventInput, "event_key" | "recipients"> & {
    organization_id?: string | null;
    role?: string | null;
  } = {},
): Promise<EmitPlatformEventResult> {
  return emitPlatformEvent({
    event_key: eventKey,
    recipients: [{ user_id: userId, role: opts.role, organization_id: opts.organization_id }],
    template_vars: opts.template_vars,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id,
    organization_id: opts.organization_id,
    deep_link: opts.deep_link,
    priority_override: opts.priority_override,
    created_by: opts.created_by,
    skip_action: opts.skip_action,
    metadata: opts.metadata,
  });
}
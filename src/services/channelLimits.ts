/**
 * Platform hard caps for outbound messaging.
 * Single source of truth for UI + compose + send.
 */

export type AttendanceChannel = "instagram" | "whatsapp";

export const CHANNEL_HARD_CAPS = {
  instagram: {
    text: 1000,
    quickReplyPrompt: 640,
    buttonTitle: 20,
    quickReplyTitle: 20,
    defaultMaxChars: 900,
    defaultMaxBubbles: 3,
  },
  whatsapp: {
    text: 4096,
    defaultMaxChars: 800,
    defaultMaxBubbles: 3,
  },
} as const;

export function platformHardCap(channel: AttendanceChannel): number {
  return CHANNEL_HARD_CAPS[channel].text;
}

export function clampChannelMaxChars(channel: AttendanceChannel, value: unknown): number {
  const hard = platformHardCap(channel);
  const def =
    channel === "instagram"
      ? CHANNEL_HARD_CAPS.instagram.defaultMaxChars
      : CHANNEL_HARD_CAPS.whatsapp.defaultMaxChars;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(def, hard);
  return Math.max(50, Math.min(hard, Math.floor(n)));
}

export function clampMaxBubbles(value: unknown, fallback = 3): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(5, Math.floor(n)));
}

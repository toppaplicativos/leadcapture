/**
 * Pure builders for Instagram Messaging API interactive messages.
 * Docs:
 * - Quick Replies: POST /{ig-user-id}/messages with message.quick_replies
 * - Button template: message.attachment.payload.template_type = "button"
 * - Generic template: template_type = "generic" (postback | web_url buttons)
 *
 * Limits (Meta):
 * - Quick replies: max 13, title max 20 chars
 * - Button template: max 3 buttons, text required
 * - Buttons: type postback | web_url only
 */

export type IgQuickReply = {
  content_type: "text" | "user_phone_number" | "user_email";
  title: string;
  payload: string;
};

export type IgTemplateButton =
  | { type: "postback"; title: string; payload: string }
  | { type: "web_url"; title: string; url: string };

export type PipelineButton = {
  id?: string;
  label: string;
  /** If set → web_url button; else postback/quick_reply with payload */
  url?: string;
  payload?: string;
};

export function truncateTitle(title: string, max = 20): string {
  const t = String(title || "").trim();
  if (!t) return "Opção";
  return t.length > max ? t.slice(0, max) : t;
}

export function slugPayload(label: string, fallbackId?: string): string {
  const base = String(label || fallbackId || "option")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return base || "OPTION";
}

/** Build Meta quick_replies array from pipeline buttons (navigation-friendly). */
export function buildQuickReplies(buttons: PipelineButton[]): IgQuickReply[] {
  return buttons
    .filter((b) => String(b.label || "").trim())
    .slice(0, 13)
    .map((b, i) => ({
      content_type: "text" as const,
      title: truncateTitle(b.label, 20),
      payload: String(b.payload || slugPayload(b.label, b.id || `btn_${i + 1}`)).slice(0, 1000),
    }));
}

/** Build Meta button objects (max 3) — postback or web_url. */
export function buildTemplateButtons(buttons: PipelineButton[]): IgTemplateButton[] {
  return buttons
    .filter((b) => String(b.label || "").trim())
    .slice(0, 3)
    .map((b, i) => {
      const title = truncateTitle(b.label, 20);
      const url = String(b.url || "").trim();
      if (url && /^https?:\/\//i.test(url)) {
        return { type: "web_url" as const, title, url };
      }
      return {
        type: "postback" as const,
        title,
        payload: String(b.payload || slugPayload(b.label, b.id || `btn_${i + 1}`)).slice(0, 1000),
      };
    });
}

export type BuiltIgMessage =
  | { kind: "text"; message: { text: string } }
  | {
      kind: "quick_replies";
      message: { text: string; quick_replies: IgQuickReply[] };
    }
  | {
      kind: "button_template";
      message: {
        attachment: {
          type: "template";
          payload: {
            template_type: "button";
            text: string;
            buttons: IgTemplateButton[];
          };
        };
      };
    }
  | {
      kind: "generic_template";
      message: {
        attachment: {
          type: "template";
          payload: {
            template_type: "generic";
            elements: Array<{
              title: string;
              subtitle?: string;
              image_url?: string;
              default_action?: { type: "web_url"; url: string };
              buttons?: IgTemplateButton[];
            }>;
          };
        };
      };
    };

/**
 * Prefer mode for navigation buttons:
 * - any button has URL → button_template (web_url + postback mix, max 3)
 * - only labels, ≤13 → quick_replies (best for multi-option navigation)
 * - only labels, >13 → first 13 quick_replies
 */
export function buildInteractiveMessage(
  text: string,
  buttons: PipelineButton[],
  options?: { force?: "quick_replies" | "button_template" },
): BuiltIgMessage {
  const prompt = String(text || "Escolha uma opção:").slice(0, 640);
  const cleaned = buttons.filter((b) => String(b.label || "").trim());

  if (!cleaned.length) {
    return { kind: "text", message: { text: prompt } };
  }

  const hasUrl = cleaned.some((b) => b.url && /^https?:\/\//i.test(String(b.url)));
  const force = options?.force;

  if (force === "quick_replies" || (!force && !hasUrl)) {
    return {
      kind: "quick_replies",
      message: {
        text: prompt,
        quick_replies: buildQuickReplies(cleaned),
      },
    };
  }

  return {
    kind: "button_template",
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: prompt.slice(0, 640),
          buttons: buildTemplateButtons(cleaned),
        },
      },
    },
  };
}

/**
 * Extract interactive intent from automation mensagemSteps (pipeline blocks).
 * - botoes → quick replies / button template
 * - cta with url → single web_url button
 * - link → treated as web_url CTA if caption/url present
 */
export function extractButtonsFromMensagemSteps(
  steps: Array<Record<string, any>>,
): { text: string; buttons: PipelineButton[]; mode: "quick_replies" | "button_template" | "text" } {
  const list = Array.isArray(steps) ? steps : [];
  const textParts: string[] = [];
  const buttons: PipelineButton[] = [];
  let forceUrlTemplate = false;

  for (const step of list) {
    const tipo = String(step?.tipo || "");
    if (tipo === "texto" && step.caption) {
      textParts.push(String(step.caption));
    }
    if (tipo === "botoes" && Array.isArray(step.buttons)) {
      if (step.caption) textParts.push(String(step.caption));
      for (const b of step.buttons) {
        buttons.push({
          id: b.id,
          label: String(b.label || ""),
          payload: b.payload || undefined,
          url: b.url || undefined,
        });
      }
    }
    if (tipo === "cta") {
      forceUrlTemplate = true;
      buttons.push({
        id: step.id,
        label: String(step.ctaLabel || step.caption || "Abrir"),
        url: step.url || undefined,
        payload: step.payload || undefined,
      });
      if (step.caption && !step.ctaLabel) {
        /* caption already used as label */
      } else if (step.caption && step.ctaLabel) {
        textParts.push(String(step.caption));
      }
    }
    if (tipo === "link" && step.url) {
      forceUrlTemplate = true;
      buttons.push({
        id: step.id,
        label: String(step.caption || step.ctaLabel || "Abrir link").slice(0, 20),
        url: String(step.url),
      });
    }
  }

  const text = textParts.join("\n\n").trim() || "Escolha uma opção:";
  if (!buttons.length) {
    return { text, buttons: [], mode: "text" };
  }
  if (forceUrlTemplate || buttons.some((b) => b.url)) {
    return { text, buttons, mode: "button_template" };
  }
  return { text, buttons, mode: "quick_replies" };
}

export function buildMessageFromPipelineSteps(
  steps: Array<Record<string, any>>,
  fallbackText?: string,
): BuiltIgMessage {
  const extracted = extractButtonsFromMensagemSteps(steps);
  const text = extracted.text || fallbackText || "Escolha uma opção:";
  if (extracted.mode === "text") {
    return { kind: "text", message: { text: text.slice(0, 1000) } };
  }
  return buildInteractiveMessage(text, extracted.buttons, {
    force: extracted.mode === "button_template" ? "button_template" : "quick_replies",
  });
}

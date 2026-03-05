function asText(value: unknown): string {
  return String(value || "").trim();
}

function parseJsonSafe(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function formatOptions(options: unknown[]): string[] {
  return options
    .map((option) => {
      if (typeof option === "string") return option.trim();
      const asObject = option && typeof option === "object" ? (option as Record<string, unknown>) : null;
      return asText(asObject?.optionName);
    })
    .filter(Boolean);
}

export function unwrapMessageContent(message: any): any {
  let current = message || {};

  while (current) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
      continue;
    }
    if (current.editedMessage?.message) {
      current = current.editedMessage.message;
      continue;
    }
    break;
  }

  return current || {};
}

export function extractIncomingMessageData(message: any): { body: string; messageType: string } {
  const m = unwrapMessageContent(message || {});

  if (!m || typeof m !== "object") {
    return { body: "", messageType: "other" };
  }

  if (m.conversation) return { body: asText(m.conversation), messageType: "text" };
  if (m.extendedTextMessage?.text) return { body: asText(m.extendedTextMessage.text), messageType: "text" };
  if (m.imageMessage) return { body: asText(m.imageMessage.caption), messageType: "image" };
  if (m.videoMessage) return { body: asText(m.videoMessage.caption), messageType: "video" };
  if (m.audioMessage) return { body: "", messageType: "audio" };
  if (m.documentMessage) {
    return {
      body: asText(m.documentMessage.caption || m.documentMessage.fileName),
      messageType: "document",
    };
  }
  if (m.stickerMessage) return { body: "", messageType: "sticker" };
  if (m.locationMessage) return { body: "", messageType: "location" };
  if (m.contactMessage) return { body: "", messageType: "contact" };

  if (m.reactionMessage) {
    return {
      body: asText(m.reactionMessage.text),
      messageType: "reaction",
    };
  }

  if (m.templateButtonReplyMessage) {
    const text = asText(m.templateButtonReplyMessage.selectedDisplayText);
    const id = asText(m.templateButtonReplyMessage.selectedId);
    const summary = text || id || "resposta";
    return {
      body: `[button_reply] ${summary}${id && id !== summary ? ` (id:${id})` : ""}`,
      messageType: "text",
    };
  }

  if (m.buttonsResponseMessage) {
    const text = asText(m.buttonsResponseMessage.selectedDisplayText);
    const id = asText(m.buttonsResponseMessage.selectedButtonId);
    const summary = text || id || "resposta";
    return {
      body: `[button_reply] ${summary}${id && id !== summary ? ` (id:${id})` : ""}`,
      messageType: "text",
    };
  }

  if (m.listResponseMessage) {
    const rowId = asText(
      m.listResponseMessage.singleSelectReply?.selectedRowId ||
        m.listResponseMessage.singleSelectReply?.rowId
    );
    const title = asText(m.listResponseMessage.title || m.listResponseMessage.description);
    const summary = title || rowId || "resposta";
    return {
      body: `[list_reply] ${summary}${rowId && rowId !== summary ? ` (id:${rowId})` : ""}`,
      messageType: "text",
    };
  }

  if (m.interactiveResponseMessage?.nativeFlowResponseMessage) {
    const paramsJson = asText(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
    const params = paramsJson ? parseJsonSafe(paramsJson) : null;
    const selectedId = asText(
      params?.id || params?.selected_id || params?.selectedId || params?.row_id || params?.button_id
    );
    const selectedTitle = asText(params?.title || params?.text || params?.display_text || params?.description);
    const summary = selectedTitle || selectedId || paramsJson || "resposta";

    return {
      body: `[interactive_reply] ${summary}${selectedId && selectedId !== summary ? ` (id:${selectedId})` : ""}`,
      messageType: "text",
    };
  }

  const pollCreation = m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3;
  if (pollCreation) {
    const name = asText(pollCreation.name) || "Enquete";
    const options = formatOptions(Array.isArray(pollCreation.options) ? pollCreation.options : []);
    const optionsText = options.length ? `\n${options.map((option) => `- ${option}`).join("\n")}` : "";
    return {
      body: `[poll] ${name}${optionsText}`,
      messageType: "text",
    };
  }

  if (m.pollUpdateMessage) {
    const pollId = asText(m.pollUpdateMessage.pollCreationMessageKey?.id);
    return {
      body: `[poll_vote] ${pollId ? `poll_id:${pollId}` : "vote_received"}`,
      messageType: "text",
    };
  }

  return { body: "", messageType: "other" };
}

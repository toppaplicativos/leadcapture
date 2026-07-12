import { aiRouter } from "../aiRouter";
import { logger } from "../../utils/logger";
import { adminAgentSessionStore, type AdminAgentMessageRow, type AdminAgentSessionRow } from "./sessionStore";
import type { ChatMessage } from "./types";

const summaryJobs = new Map<string, Promise<void>>();

export const SUMMARY_MIN_MESSAGES = 18;
export const RECENT_CONTEXT_MESSAGES = 10;
const SUMMARY_REFRESH_DELTA = 6;

export function messagesToChatHistory(
  messages: AdminAgentMessageRow[],
  take = RECENT_CONTEXT_MESSAGES,
): ChatMessage[] {
  return messages
    .slice(-take)
    .map((m) => ({
      role: m.role,
      content: String(m.content || m.turn_json?.message || "").slice(0, 2000),
    }))
    .filter((m) => m.content.trim());
}

export async function maybeRefreshSessionSummary(opts: {
  userId: string;
  brandId: string;
  session: AdminAgentSessionRow;
  messages: AdminAgentMessageRow[];
}): Promise<string | null> {
  const { userId, brandId, session, messages } = opts;
  const count = messages.length;
  if (count < SUMMARY_MIN_MESSAGES) return session.summary || null;

  const covered = session.summary_message_count || 0;
  const olderCount = Math.max(0, count - RECENT_CONTEXT_MESSAGES);
  if (session.summary && olderCount < covered + SUMMARY_REFRESH_DELTA) {
    return session.summary;
  }

  const older = messages.slice(0, olderCount);
  if (!older.length) return session.summary || null;

  const transcript = older
    .map((m) => {
      const who = m.role === "user" ? "Usuário" : "Assistente";
      const text = String(m.content || m.turn_json?.message || "").trim().slice(0, 500);
      const skill = m.skill || m.turn_json?.skill;
      return skill ? `${who} [${skill}]: ${text}` : `${who}: ${text}`;
    })
    .join("\n");

  const prompt = `Você resume conversas do assistente admin LeadCapture (CRM, campanhas, WhatsApp, catálogo).

${session.summary ? `RESUMO ANTERIOR (atualize e funda com o novo trecho):\n${session.summary}\n\n` : ""}TRECHO DA CONVERSA:
${transcript}

Instruções:
- Português, máximo 12 linhas curtas
- Preserve pedidos, decisões, números, nomes, módulos/skills usados e pendências
- Ignore saudações vazias e repetições
- Retorne APENAS o resumo em texto plano`;

  try {
    const raw = await aiRouter.generateText(prompt, { userId, brandId }, {
      temperature: 0.15,
      functionKey: "text.admin.summary",
    });
    const summary = String(raw?.text || "").trim().slice(0, 3000);
    if (!summary) return session.summary || null;
    await adminAgentSessionStore.saveSessionSummary(session.id, userId, brandId, summary, olderCount);
    return summary;
  } catch (error: any) {
    logger.warn({ err: error?.message }, "admin agent session summary failed");
    return session.summary || null;
  }
}

/** Atualiza resumo em background — não bloqueia o turno do chat. */
export function scheduleSessionSummaryRefresh(opts: {
  userId: string;
  brandId: string;
  session: AdminAgentSessionRow;
  messages: AdminAgentMessageRow[];
}): void {
  const key = opts.session.id;
  if (summaryJobs.has(key)) return;

  const job = maybeRefreshSessionSummary(opts)
    .catch((error: any) => {
      logger.warn({ err: error?.message, sessionId: key }, "admin agent async summary failed");
    })
    .finally(() => {
      summaryJobs.delete(key);
    });

  summaryJobs.set(key, job.then(() => {}));
}
import { aiRouter } from "../aiRouter";
import { logger } from "../../utils/logger";
import {
  HUMANIZATION_INSTRUCTIONS,
  auditHumanization,
  HumanizationCheckResult,
} from "./skills/humanizationEngine";
import { validateAgainstBrand, BrandGuardConfig } from "./skills/brandProtection";
import { playbookForStage } from "./skills/salesReasoning";
import { ReasoningTrace } from "./types";

export interface ComposerInput {
  userId: string;
  brandId?: string | null;
  incomingMessage: string;
  conversationHistory: string[];
  catalogBlock: string;
  knowledgeBlock: string;
  brandIdentityBlock: string;
  memoryBlock: string;
  lastOutgoingMessages: string[];
  brandGuard: BrandGuardConfig;
  trace: ReasoningTrace;
  maxLength: number;
  includeEmojis: boolean;
  communicationRules: string;
  trainingNotes?: string;
  /* Fase 16.5 — tone hint from ResponseGate based on lead's recent register.
   *   "conciso"   = lead is being curt / dry → keep replies SHORTER than usual
   *   "amigavel"  = lead is warm → mirror warmth (but don't overdo it)
   *   "respeitoso" = lead is frustrated → no fluff, no emojis, acknowledge first
   *   "normal"    = no signal → default behavior */
  suggestedTone?: "normal" | "conciso" | "amigavel" | "respeitoso";
}

export interface ComposerOutput {
  text: string;
  retries: number;
  humanization: HumanizationCheckResult;
  brandIssues: string[];
}

export class Composer {
  async compose(input: ComposerInput): Promise<ComposerOutput> {
    /* If reasoner asked for escalation, bail early — escalation message will come from outer flow */
    if (input.trace.should_escalate) {
      return {
        text: "",
        retries: 0,
        humanization: { ok: true, issues: [], suggestions: [] },
        brandIssues: [],
      };
    }

    let text = await this.writeOnce(input);
    let humanization = auditHumanization(text, input.lastOutgoingMessages);
    let brandIssues = validateAgainstBrand(text, input.brandGuard);
    let retries = 0;

    /* One retry pass if quality issues detected — common when LLM autopilots on a stock phrase */
    if (!humanization.ok || brandIssues.length > 0) {
      logger.info(
        `Composer retry — humanization issues: ${humanization.issues.length} / brand issues: ${brandIssues.length}`
      );
      const fix = await this.writeOnce({
        ...input,
        trace: {
          ...input.trace,
          must_avoid: [
            ...input.trace.must_avoid,
            ...humanization.issues,
            ...brandIssues,
          ],
        },
      }, /* isRetry */ true, humanization.suggestions.concat(brandIssues));
      const fixAudit = auditHumanization(fix, input.lastOutgoingMessages);
      const fixBrand = validateAgainstBrand(fix, input.brandGuard);
      /* Keep retry only if it actually improved things */
      if (fixAudit.issues.length + fixBrand.length < humanization.issues.length + brandIssues.length) {
        text = fix;
        humanization = fixAudit;
        brandIssues = fixBrand;
      }
      retries = 1;
    }

    return { text, retries, humanization, brandIssues };
  }

  private async writeOnce(input: ComposerInput, isRetry = false, retryNotes: string[] = []): Promise<string> {
    const playbook = playbookForStage(input.trace.funnel_stage);
    const historyBlock = input.conversationHistory.length
      ? `HISTÓRICO COMPLETO DA CONVERSA:\n${input.conversationHistory.join("\n")}`
      : "";

    const lastOutgoingBlock = input.lastOutgoingMessages.length
      ? `SUAS ÚLTIMAS RESPOSTAS NESTA CONVERSA (PROIBIDO repetir estrutura/abertura/fechamento):\n${input.lastOutgoingMessages
          .map((m, i) => `R${i + 1}: ${m}`)
          .join("\n")}`
      : "";

    const reasoningBlock = [
      "ANÁLISE COGNITIVA DESTA MENSAGEM (use TODA esta informação ao compor):",
      `- emoção do cliente: ${input.trace.emotional_state}`,
      input.trace.frustration_signals.length ? `- sinais de frustração: ${input.trace.frustration_signals.join("; ")}` : "",
      input.trace.bot_interaction_detected
        ? `- ATENÇÃO: cliente parece ter interagido com automação anterior (${input.trace.bot_signals.join("; ")}). Eleve naturalidade e contextualização.`
        : "",
      `- intenção real: ${input.trace.real_intent}`,
      `- estágio do funil: ${input.trace.funnel_stage}`,
      input.trace.mentioned_products.length ? `- produtos mencionados: ${input.trace.mentioned_products.join(", ")}` : "",
      input.trace.objections_detected.length ? `- objeções a tratar: ${input.trace.objections_detected.join("; ")}` : "",
      input.trace.pending_facts_to_address.length ? `- DÚVIDAS PENDENTES que precisam ser respondidas: ${input.trace.pending_facts_to_address.join("; ")}` : "",
      `- estratégia desta resposta: ${input.trace.response_strategy}`,
      `- ajuste de tom: ${input.trace.tone_adjustment}`,
      input.trace.must_acknowledge.length ? `- DEVE reconhecer: ${input.trace.must_acknowledge.join("; ")}` : "",
      input.trace.must_avoid.length ? `- NÃO PODE fazer: ${input.trace.must_avoid.join("; ")}` : "",
    ].filter(Boolean).join("\n");

    const playbookBlock = [
      `PLAYBOOK PARA ESTE ESTÁGIO (${input.trace.funnel_stage}):`,
      `  meta: ${playbook.goal}`,
      `  faça: ${playbook.do.join(" / ")}`,
      `  evite: ${playbook.avoid.join(" / ")}`,
    ].join("\n");

    const retryBlock = isRetry
      ? `\n\nESTA É UMA REESCRITA. A versão anterior tinha estes problemas que VOCÊ DEVE EVITAR agora:\n${retryNotes.map((n) => `- ${n}`).join("\n")}\n`
      : "";

    /* Bloco anti-saudação: conversas com histórico NÃO podem abrir com cumprimento.
     * O guard (inboxReplyGuard) rejeita respostas com GREETING_OPENERS em conversas >= 4 msgs.
     * Tornar isso explícito no prompt previne o loop "gera → guard rejeita → nunca responde". */
    const antiGreetingBlock = input.conversationHistory.length >= 4
      ? `CONTEXTO CRÍTICO: Esta conversa já tem ${input.conversationHistory.length} mensagens. NÃO abra com saudação ("Oi", "Olá", "Bom dia", "Boa tarde" etc). Vá DIRETO ao ponto — responda ao que o cliente perguntou/disse sem preamble.`
      : "";

    const emojiRule = input.includeEmojis
      ? "Pode usar até 2 emojis se realmente agregarem — não use só por usar."
      : "Não use emojis.";

    /* Fase 16.5 — tone hint from ResponseGate. The lead's recent register tells
     * us how to write back. Each tone shifts the system prompt at the very top,
     * before the brand identity, so it overrides default brand chattiness when
     * the situation calls for it (e.g., lead is frustrated → no emojis, no fluff). */
    const toneInstructions = (() => {
      switch (input.suggestedTone) {
        case "conciso":
          return "TOM DESTE TURN: o cliente está respondendo SECO/CURTO. Sua resposta deve ser MAIS BREVE que o normal — máximo 1-2 frases. Direto ao ponto. SEM saudações longas, SEM repetir o que ele já sabe.";
        case "respeitoso":
          return "TOM DESTE TURN: o cliente parece FRUSTRADO. Reconheça o problema na PRIMEIRA frase ('Entendo, vou te ajudar com isso'). Zero emojis. Zero entusiasmo performático. Resolva.";
        case "amigavel":
          return "TOM DESTE TURN: o cliente está EM TOM CALOROSO/POSITIVO. Pode espelhar o calor — mas com elegância, sem forçar.";
        case "normal":
        default:
          return ""; // no extra instruction
      }
    })();

    const prompt = [
      input.brandIdentityBlock,
      toneInstructions,
      antiGreetingBlock,
      HUMANIZATION_INSTRUCTIONS,
      input.communicationRules ? `REGRAS DE COMUNICAÇÃO DA MARCA:\n${input.communicationRules}` : "",
      input.trainingNotes ? `TREINAMENTO INTERNO:\n${input.trainingNotes}` : "",
      "",
      input.memoryBlock,
      "",
      input.catalogBlock,
      "",
      input.knowledgeBlock,
      "",
      historyBlock,
      "",
      lastOutgoingBlock,
      "",
      reasoningBlock,
      "",
      playbookBlock,
      "",
      `MENSAGEM DO CLIENTE: "${input.incomingMessage}"`,
      "",
      `LIMITE: máximo ${input.maxLength} caracteres. ${emojiRule}`,
      "Escreva APENAS a resposta final para o cliente, em texto puro, sem markdown, sem prefixos como 'Resposta:' ou aspas externas.",
      retryBlock,
    ].filter(Boolean).join("\n");

    try {
      const result = await aiRouter.generateText(prompt, {
        userId: input.userId,
        brandId: input.brandId || undefined,
      }, { temperature: 0.7 });
      return String(result.text || "").trim();
    } catch (e: any) {
      logger.warn(`Composer write failed: ${e?.message || e}`);
      throw e;
    }
  }
}

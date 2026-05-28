import { aiRouter } from "../aiRouter";
import { logger } from "../../utils/logger";
import { CONTEXT_INTELLIGENCE_INSTRUCTIONS } from "./skills/contextIntelligence";
import { buildSalesPlaybookBlock } from "./skills/salesReasoning";
import { ReasoningTrace, ConversationMemory } from "./types";

export interface ReasonerInput {
  userId: string;
  brandId?: string | null;
  incomingMessage: string;
  conversationHistory: string[];
  catalogBlock: string;
  knowledgeBlock: string;
  skillsBlock?: string;
  brandIdentityBlock: string;
  memoryBlock: string;
  lastOutgoingMessages: string[];
}

const REASONER_OUTPUT_SCHEMA = `
{
  "emotional_state": "neutral|curious|interested|frustrated|angry|anxious|appreciative|skeptical|confused",
  "frustration_signals": ["sinal 1", "sinal 2"],
  "bot_interaction_detected": true|false,
  "bot_signals": ["sinal 1"],
  "surface_intent": "frase curta do que o cliente escreveu literalmente",
  "real_intent": "frase curta do que o cliente realmente quer",
  "funnel_stage": "awareness|consideration|decision|objection|post_purchase|support|noise",
  "mentioned_products": ["nome exato do produto do catálogo"],
  "objections_detected": ["objeção 1"],
  "pending_facts_to_address": ["pergunta ainda não respondida"],
  "facts_learned_this_turn": ["fato novo que o cliente revelou"],
  "response_strategy": "em 1 frase, qual é a próxima jogada da resposta",
  "tone_adjustment": "em 1 frase, ajuste fino de tom para este turn (ex: 'reduzir formalidade, mostrar empatia explícita')",
  "must_acknowledge": ["coisa que a resposta DEVE reconhecer"],
  "must_avoid": ["coisa que a resposta NÃO PODE fazer neste turn"],
  "risks": ["risco percebido"],
  "should_escalate": true|false,
  "escalation_reason": "razão ou null",
  "confidence": 0.0
}
`.trim();

export class Reasoner {
  async analyze(input: ReasonerInput): Promise<ReasoningTrace> {
    const historyBlock = input.conversationHistory.length
      ? `HISTÓRICO COMPLETO DESTA CONVERSA (mais antigo → mais novo):\n${input.conversationHistory.join("\n")}`
      : "HISTÓRICO COMPLETO: (primeira mensagem desta conversa)";

    const lastOutgoingBlock = input.lastOutgoingMessages.length
      ? `ÚLTIMAS RESPOSTAS QUE O AGENTE DEU (NÃO repetir padrão/abertura/fechamento):\n${input.lastOutgoingMessages
          .map((m, i) => `R${i + 1}: ${m}`)
          .join("\n")}`
      : "";

    const prompt = [
      "Você é um ANALISTA COGNITIVO silencioso. NÃO escreve para o cliente — apenas produz JSON estruturado para outro modelo usar.",
      "",
      input.brandIdentityBlock,
      "",
      CONTEXT_INTELLIGENCE_INSTRUCTIONS,
      "",
      buildSalesPlaybookBlock(),
      "",
      input.memoryBlock,
      "",
      historyBlock,
      "",
      lastOutgoingBlock,
      "",
      input.catalogBlock,
      "",
      input.knowledgeBlock,
      "",
      /* Skills: posicionadas antes da mensagem — Reasoner precisa saber qual skill
         disparou pra definir response_strategy como "executar skill X agora" e não
         "prometer verificar depois". */
      input.skillsBlock
        ? `HABILIDADES ESPECIFICAS ATIVAS PARA ESTA MENSAGEM:\n${input.skillsBlock}\nAO DEFINIR response_strategy: se uma habilidade acima se aplica, a estratégia DEVE ser executá-la e entregar o resultado nesta resposta — não "verificar", não "perguntar depois".`
        : "",
      "",
      `MENSAGEM ATUAL DO CLIENTE: "${input.incomingMessage}"`,
      "",
      "TAREFA: analise em profundidade conforme o PROTOCOLO DE LEITURA CONTEXTUAL TOTAL acima e retorne EXATAMENTE este JSON (sem markdown, sem comentário, sem texto antes/depois):",
      REASONER_OUTPUT_SCHEMA,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await aiRouter.generateJson<any>(prompt, {
        userId: input.userId,
        brandId: input.brandId || undefined,
      }, { temperature: 0.25 });

      return this.normalize(raw);
    } catch (e: any) {
      logger.warn(`Reasoner failed: ${e?.message || e}`);
      return this.fallback(input);
    }
  }

  /** When the LLM call fails, return a conservative trace so the composer still runs. */
  private fallback(input: ReasonerInput): ReasoningTrace {
    return {
      emotional_state: "neutral",
      frustration_signals: [],
      bot_interaction_detected: false,
      bot_signals: [],
      surface_intent: input.incomingMessage.slice(0, 100),
      real_intent: input.incomingMessage.slice(0, 100),
      funnel_stage: "awareness",
      mentioned_products: [],
      objections_detected: [],
      pending_facts_to_address: [],
      facts_learned_this_turn: [],
      response_strategy: "Responder de forma clara, direta e humana. Reasoner indisponível — operar conservadoramente.",
      tone_adjustment: "Manter tom natural padrão da marca.",
      must_acknowledge: [],
      must_avoid: ["respostas robóticas ou genéricas", "saudação de abertura se houver histórico"],
      risks: ["reasoner_offline"],
      should_escalate: false,
      escalation_reason: null,
      confidence: 0.6,
    };
  }

  private normalize(raw: any): ReasoningTrace {
    const arr = (v: any): string[] => Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
    const str = (v: any, fallback = ""): string => String(v || fallback).trim();
    const bool = (v: any): boolean => v === true || v === "true" || v === 1;
    const num = (v: any, fallback = 0.5): number => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
    };

    const validEmotions = ["neutral", "curious", "interested", "frustrated", "angry", "anxious", "appreciative", "skeptical", "confused"];
    const emo = str(raw?.emotional_state, "neutral");
    const emotional_state = (validEmotions.includes(emo) ? emo : "neutral") as ReasoningTrace["emotional_state"];

    const validStages = ["awareness", "consideration", "decision", "objection", "post_purchase", "support", "noise"];
    const stage = str(raw?.funnel_stage, "awareness");
    const funnel_stage = (validStages.includes(stage) ? stage : "awareness") as ReasoningTrace["funnel_stage"];

    return {
      emotional_state,
      frustration_signals: arr(raw?.frustration_signals),
      bot_interaction_detected: bool(raw?.bot_interaction_detected),
      bot_signals: arr(raw?.bot_signals),
      surface_intent: str(raw?.surface_intent),
      real_intent: str(raw?.real_intent, str(raw?.surface_intent)),
      funnel_stage,
      mentioned_products: arr(raw?.mentioned_products),
      objections_detected: arr(raw?.objections_detected),
      pending_facts_to_address: arr(raw?.pending_facts_to_address),
      facts_learned_this_turn: arr(raw?.facts_learned_this_turn),
      response_strategy: str(raw?.response_strategy, "Responder de forma clara e contextual."),
      tone_adjustment: str(raw?.tone_adjustment, "Tom natural padrão da marca."),
      must_acknowledge: arr(raw?.must_acknowledge),
      must_avoid: arr(raw?.must_avoid),
      risks: arr(raw?.risks),
      should_escalate: bool(raw?.should_escalate),
      escalation_reason: raw?.escalation_reason && String(raw.escalation_reason).trim() ? String(raw.escalation_reason).trim() : null,
      confidence: num(raw?.confidence, 0.6),
    };
  }
}

export function memoryDelta(traceA: ReasoningTrace, memoryBefore: ConversationMemory): string {
  /* Helper used by debug logging to see what's new this turn */
  const newProducts = traceA.mentioned_products.filter((p) => !memoryBefore.mentioned_products.includes(p));
  const newObjections = traceA.objections_detected.filter((o) => !memoryBefore.objections_history.includes(o));
  return JSON.stringify({ newProducts, newObjections, emotional: traceA.emotional_state, stage: traceA.funnel_stage });
}

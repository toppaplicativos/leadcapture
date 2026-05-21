/**
 * Type contracts for the cognitive agent pipeline.
 * Reasoner produces ReasoningTrace → Composer consumes it → MemoryExtractor updates ConversationMemory.
 */

export type FunnelStage =
  | "awareness"      /* Cliente apenas explorando */
  | "consideration"  /* Avaliando opções */
  | "decision"       /* Pronto para comprar, precisa empurrão final */
  | "objection"      /* Resistência ativa que precisa ser respondida */
  | "post_purchase"  /* Já comprou, suporte/relacionamento */
  | "support"        /* Dúvida operacional sem intenção comercial */
  | "noise";         /* Mensagem sem intenção clara */

export type EmotionalState =
  | "neutral"
  | "curious"
  | "interested"
  | "frustrated"
  | "angry"
  | "anxious"
  | "appreciative"
  | "skeptical"
  | "confused";

export interface ReasoningTrace {
  /* Análise emocional e contextual */
  emotional_state: EmotionalState;
  frustration_signals: string[];
  bot_interaction_detected: boolean;
  bot_signals: string[];

  /* Intenção em duas camadas */
  surface_intent: string;              /* O que escreveu */
  real_intent: string;                 /* O que realmente quer */

  /* Estado comercial */
  funnel_stage: FunnelStage;
  mentioned_products: string[];        /* Produtos do catálogo citados nesta msg */
  objections_detected: string[];

  /* Fatos */
  pending_facts_to_address: string[];  /* Coisas que o cliente perguntou e ainda não foram respondidas */
  facts_learned_this_turn: string[];   /* Novas informações que o cliente revelou */

  /* Estratégia de resposta */
  response_strategy: string;           /* Em 1 frase, qual é a próxima jogada */
  tone_adjustment: string;             /* Ajustes finos de tom específicos para este turn */
  must_acknowledge: string[];          /* Coisas que a resposta DEVE reconhecer */
  must_avoid: string[];                /* Coisas que a resposta NÃO PODE fazer */

  /* Risco e escalação */
  risks: string[];
  should_escalate: boolean;
  escalation_reason: string | null;

  /* Auto-avaliação */
  confidence: number;                  /* 0.0 - 1.0 */
}

export interface ConversationMemory {
  conversation_id: string;
  customer_name?: string | null;
  mentioned_products: string[];        /* Acumulado entre turns */
  preferences: Record<string, string>; /* Ex: { entrega: "rápida", cor: "azul" } */
  objections_history: string[];        /* Objeções já levantadas */
  facts_learned: string[];             /* Fatos que o cliente revelou */
  funnel_stage: FunnelStage;
  last_emotional_state: EmotionalState;
  frustration_score: number;           /* 0-10, acumula com sinais de frustração */
  bot_interaction_score: number;       /* 0-10, conta turns em que detectamos automação anterior */
  turn_count: number;
  updated_at: string;
}

export const EMPTY_MEMORY = (conversationId: string): ConversationMemory => ({
  conversation_id: conversationId,
  customer_name: null,
  mentioned_products: [],
  preferences: {},
  objections_history: [],
  facts_learned: [],
  funnel_stage: "awareness",
  last_emotional_state: "neutral",
  frustration_score: 0,
  bot_interaction_score: 0,
  turn_count: 0,
  updated_at: new Date().toISOString(),
});

export interface CognitiveInput {
  userId: string;
  brandId?: string | null;
  conversationId?: string | null;     /* Para persistir memória; opcional para evitar quebrar callers antigos */
  incomingMessage: string;
  conversationHistory: string[];      /* Linhas "Atendente|Lead: <texto>" */
  lastOutgoingMessages?: string[];    /* Últimas 3 respostas que o agente deu, para evitar repetição */
}

export interface CognitiveOutput {
  text: string;
  reasoning: ReasoningTrace | null;
  memory: ConversationMemory | null;
  shouldEscalate: boolean;
  escalationReason: string | null;
  knowledgeApplied: boolean;
  catalogApplied: boolean;
  latencyMs: {
    reasoner: number;
    composer: number;
    total: number;
  };
}

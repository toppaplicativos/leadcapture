/**
 * Régua de mensagens do fluxo de contatos (framework Reev — 8 campanhas).
 *
 * C1 Abertura    D+0   Grande Ideia + Problema 1
 * C2 Check-in    D+2   Contexto + Problema 2
 * C3 Consciência D+5   Implicação 1 + Futuro Positivo
 * C4 Prova       D+8   Implicação 2 + Prova Social
 * C5 Educação    D+12  Grande Ideia + Educação
 * C6 Caso real   D+16  Storytelling + Futuro Positivo
 * C7 Valor puro  D+20  Problema + Conteúdo
 * C8 Break-up    D+25  Grande Ideia + Escassez
 *
 * Lifecycle (cold path / sem resposta):
 *   new → [C1] → contacted+fu0 → [C2]+fu1 → … → +fu7 (fim)
 *
 * Saídas (qualquer hora):
 *   respondeu  → engaged (handoff humano / qualificação)
 *   opt_out    → lost
 *   convertido → converted
 */

export type ContactMessageStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ContactRulerTaskType =
  | "first_contact"
  | "followup_1"
  | "followup_2"
  | "followup_3"
  | "followup_4"
  | "followup_5"
  | "followup_6"
  | "followup_7";

export type ContactRulerStepDef = {
  /** Número da mensagem na jornada (C1=1 … C8=8) */
  step: ContactMessageStep;
  /** Tag de sistema após envio desta etapa */
  addTag: string;
  /** Tag pré-requisito (mensagem anterior) — null na abertura */
  sendAfterTag: string | null;
  /** Tipo de tarefa de atendimento */
  taskType: ContactRulerTaskType;
  /** Dias desde a abertura (absoluto) */
  delayDaysAbs: number;
  /** Dias desde a etapa anterior (relativo para agendar a próxima) */
  delayDaysFromPrev: number;
  code: string;
  title: string;
  framework: string;
  angle: string;
};

/** Tags de saída — excluem o lead de TODAS as FUs da régua. */
export const CONTACT_EXIT_TAGS = ["respondeu", "opt_out", "convertido"] as const;

export const CONTACT_MESSAGE_RULER: ContactRulerStepDef[] = [
  {
    step: 1,
    addTag: "fu0_enviada",
    sendAfterTag: null,
    taskType: "first_contact",
    delayDaysAbs: 0,
    delayDaysFromPrev: 0,
    code: "C1",
    title: "Abertura",
    framework: "Grande Ideia + Problema 1",
    angle: "Bate porta",
  },
  {
    step: 2,
    addTag: "fu1_enviada",
    sendAfterTag: "fu0_enviada",
    taskType: "followup_1",
    delayDaysAbs: 2,
    delayDaysFromPrev: 2,
    code: "C2",
    title: "Check-in",
    framework: "Contexto + Problema 2",
    angle: "Outro ângulo",
  },
  {
    step: 3,
    addTag: "fu2_enviada",
    sendAfterTag: "fu1_enviada",
    taskType: "followup_2",
    delayDaysAbs: 5,
    delayDaysFromPrev: 3,
    code: "C3",
    title: "Consciência",
    framework: "Implicação 1 + Futuro Positivo",
    angle: "Se não agir…",
  },
  {
    step: 4,
    addTag: "fu3_enviada",
    sendAfterTag: "fu2_enviada",
    taskType: "followup_3",
    delayDaysAbs: 8,
    delayDaysFromPrev: 3,
    code: "C4",
    title: "Prova",
    framework: "Implicação 2 + Prova Social",
    angle: "Números + casos",
  },
  {
    step: 5,
    addTag: "fu4_enviada",
    sendAfterTag: "fu3_enviada",
    taskType: "followup_4",
    delayDaysAbs: 12,
    delayDaysFromPrev: 4,
    code: "C5",
    title: "Educação",
    framework: "Grande Ideia + Educação",
    angle: "Ensina conceito",
  },
  {
    step: 6,
    addTag: "fu5_enviada",
    sendAfterTag: "fu4_enviada",
    taskType: "followup_5",
    delayDaysAbs: 16,
    delayDaysFromPrev: 4,
    code: "C6",
    title: "Caso real",
    framework: "Storytelling + Futuro Positivo",
    angle: "História de transformação",
  },
  {
    step: 7,
    addTag: "fu6_enviada",
    sendAfterTag: "fu5_enviada",
    taskType: "followup_6",
    delayDaysAbs: 20,
    delayDaysFromPrev: 4,
    code: "C7",
    title: "Valor puro",
    framework: "Problema + Conteúdo",
    angle: "Presente gratuito",
  },
  {
    step: 8,
    addTag: "fu7_enviada",
    sendAfterTag: "fu6_enviada",
    taskType: "followup_7",
    delayDaysAbs: 25,
    delayDaysFromPrev: 5,
    code: "C8",
    title: "Break-up",
    framework: "Grande Ideia + Escassez",
    angle: "Última chance",
  },
];

const BY_STEP = new Map(CONTACT_MESSAGE_RULER.map((s) => [s.step, s]));
const BY_TASK = new Map(CONTACT_MESSAGE_RULER.map((s) => [s.taskType, s]));

export function getRulerStep(step: number): ContactRulerStepDef | null {
  const n = Math.max(1, Math.min(8, Math.floor(Number(step) || 1))) as ContactMessageStep;
  return BY_STEP.get(n) || null;
}

export function getRulerStepByTask(taskType: string): ContactRulerStepDef | null {
  return BY_TASK.get(taskType as ContactRulerTaskType) || null;
}

/** Próxima etapa cold após concluir `completedStep` (1..8). null = fim da régua. */
export function nextColdStep(completedStep: number): ContactRulerStepDef | null {
  const n = Math.floor(Number(completedStep) || 0);
  if (n < 1) return BY_STEP.get(1) || null;
  if (n >= 8) return null;
  return BY_STEP.get((n + 1) as ContactMessageStep) || null;
}

/**
 * Inferência da etapa já concluída a partir de contagem de envios outbound.
 * 0 = ainda não enviou; 1..8 = última mensagem da régua cold enviada.
 */
export function completedStepFromOutboundCount(outboundCount: number): number {
  return Math.max(0, Math.min(8, Math.floor(Number(outboundCount) || 0)));
}

/** Etapa da mensagem a usar no compositor (próximo envio). */
export function nextMessageStepFromOutboundCount(outboundCount: number): ContactMessageStep {
  const completed = completedStepFromOutboundCount(outboundCount);
  if (completed >= 8) return 8;
  return Math.max(1, completed + 1) as ContactMessageStep;
}

export function taskTypeForMessageStep(step: number): ContactRulerTaskType {
  return getRulerStep(step)?.taskType || "first_contact";
}

export function messageStepForTaskType(taskType: string, templateId?: string | null): number {
  if (templateId === "optin") return 0;
  const hit = getRulerStepByTask(taskType);
  if (hit) return hit.step;
  if (taskType === "qualify") return 2;
  if (taskType === "proposal" || taskType === "close") return 3;
  if (taskType === "post_sale") return 3;
  return 1;
}

/** Labels amigáveis para UI / filas. */
export function rulerTaskLabel(taskType: string): string {
  const hit = getRulerStepByTask(taskType);
  if (hit) return `${hit.code} · ${hit.title}`;
  if (taskType === "qualify") return "Qualificar";
  if (taskType === "proposal") return "Proposta";
  if (taskType === "close") return "Fechar";
  if (taskType === "post_sale") return "Pós-venda";
  if (taskType === "note") return "Anotação";
  return taskType;
}

export function rulerStepLabel(step: number): string {
  if (step === 0) return "Opt-in";
  const hit = getRulerStep(step);
  return hit ? `${hit.code} · ${hit.title} (D+${hit.delayDaysAbs})` : `Mensagem ${step}`;
}

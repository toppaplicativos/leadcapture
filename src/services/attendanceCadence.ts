/**
 * Motor de cadência do atendimento manual do afiliado.
 * Cada ação de Resultado → fase + tarefa (due) + instrução de UI.
 *
 * Régua Reev (8 mensagens / C1–C8):
 *   new → [C1] → … → [C8] · cada etapa considera a anterior e o resultado.
 * Saídas a qualquer hora: replied · opt_out/lost · convert.
 *
 * Política de saída (confirmada):
 * - canal indisponível / não correspondente / lost / dismiss → arquivar (lost), sem block hard.
 */
import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import {
  getRulerStep,
  nextColdStep,
  rulerStepLabel,
  type ContactRulerTaskType,
} from "./contactMessageRuler";

export type AttendanceTaskType =
  | ContactRulerTaskType
  | "qualify"
  | "proposal"
  | "close"
  | "post_sale"
  | "note";

export type ProgressActionId =
  | "sent"
  | "followup"
  | "replied"
  | "negotiating"
  | "auto_reply"
  | "no_answer"
  | "waiting"
  | "channel_unavailable"
  | "not_matching"
  | "lost"
  | "dismiss"
  | "note"
  | "convert"
  | "post_sale_completed"
  /** Telefone: tentativa de ligação (paralelo a `sent`) */
  | "called"
  /** Caixa postal / recado */
  | "voicemail"
  /** Linha ocupada */
  | "busy"
  /** Pediu retorno (callback) */
  | "callback_requested";

export type CadenceEffect = {
  /** Fase operacional (UI) */
  phase: "to_contact" | "contacted" | "engaged" | "closed";
  /** Status em affiliate_leads.affiliate_status */
  leadStatus: string;
  /** current_stage em prospect_assignments */
  assignmentStage: string;
  /** assignment_status */
  assignmentStatus: "active" | "lost" | "converted";
  /** Remove da fila aberta (lost/dismiss/etc.) */
  archive: boolean;
  /** Dias até próxima tarefa (null = cancela follow-up aberto) */
  followupDays: number | null;
  clearFollowup: boolean;
  taskType: AttendanceTaskType | null;
  instruction: string;
  templateId: string | null;
  toast: string;
  /** Etapa cold concluída (1–8) quando aplicável */
  completedMessageStep?: number;
  /** Próxima etapa cold agendada (1–8) */
  nextMessageStep?: number | null;
  /** Tag de sistema da etapa concluída (fuN_enviada) */
  addTag?: string | null;
};

/** Ações que avançam a régua cold (sem resposta humana engajada). */
const COLD_PROGRESS_ACTIONS = new Set<ProgressActionId>([
  "sent",
  "followup",
  "no_answer",
  "auto_reply",
  "called",
  "voicemail",
  "busy",
]);

const EFFECTS: Record<ProgressActionId, CadenceEffect> = {
  sent: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 2,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Follow-up em 2 dias se não houver resposta humana",
    templateId: "followup",
    toast: "Enviado · follow-up em 2 dias",
  },
  followup: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 2,
    clearFollowup: false,
    taskType: "followup_2",
    instruction: "Novo follow-up se ainda não responder",
    templateId: "followup",
    toast: "Follow-up registrado · próxima checagem em 2 dias",
  },
  replied: {
    phase: "engaged",
    leadStatus: "negotiating",
    assignmentStage: "engaged",
    assignmentStatus: "active",
    archive: false,
    followupDays: 1,
    clearFollowup: false,
    taskType: "qualify",
    instruction: "Qualificar interesse e avançar a conversa",
    templateId: "followup",
    toast: "Respondeu · sai da régua cold · qualificar até amanhã",
    addTag: "respondeu",
  },
  negotiating: {
    phase: "engaged",
    leadStatus: "negotiating",
    assignmentStage: "proposal_sent",
    assignmentStatus: "active",
    archive: false,
    followupDays: 1,
    clearFollowup: false,
    taskType: "proposal",
    instruction: "Enviar proposta / link de produto e fechar",
    templateId: "proposta",
    toast: "Negociação · proposta/follow-up em 1 dia",
    addTag: "respondeu",
  },
  auto_reply: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 2,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Resposta foi bot — retomar com humano em 2 dias",
    templateId: "followup",
    toast: "Bot detectado · retomar em 2 dias",
  },
  no_answer: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 3,
    clearFollowup: false,
    taskType: "followup_2",
    instruction: "Próximo toque da régua — sem resposta no envio anterior",
    templateId: "followup",
    toast: "Sem resposta · próxima etapa da régua",
  },
  waiting: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 1,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Retomar contato amanhã (lembrete)",
    templateId: "followup",
    toast: "Lembrete amanhã",
  },
  channel_unavailable: {
    phase: "closed",
    leadStatus: "lost",
    assignmentStage: "lost",
    assignmentStatus: "lost",
    archive: true,
    followupDays: null,
    clearFollowup: true,
    taskType: null,
    instruction: "Canal indisponível — removido da rede (não volta a outros afiliados)",
    templateId: null,
    toast: "Removido da rede · canal indisponível",
  },
  not_matching: {
    phase: "closed",
    leadStatus: "lost",
    assignmentStage: "lost",
    assignmentStatus: "lost",
    archive: true,
    followupDays: null,
    clearFollowup: true,
    taskType: null,
    instruction: "Não correspondente — removido da rede (não volta a outros afiliados)",
    templateId: null,
    toast: "Removido da rede · não correspondente",
  },
  lost: {
    phase: "closed",
    leadStatus: "lost",
    assignmentStage: "lost",
    assignmentStatus: "lost",
    archive: true,
    followupDays: null,
    clearFollowup: true,
    taskType: null,
    instruction: "Sem interesse — excluído da sua fila",
    templateId: null,
    toast: "Excluído · sem interesse",
    addTag: "opt_out",
  },
  dismiss: {
    phase: "closed",
    leadStatus: "lost",
    assignmentStage: "lost",
    assignmentStatus: "lost",
    archive: true,
    followupDays: null,
    clearFollowup: true,
    taskType: null,
    instruction: "Oculto da sua fila (só para você)",
    templateId: null,
    toast: "Oculto da sua lista",
  },
  note: {
    phase: "to_contact",
    leadStatus: "new",
    assignmentStage: "assigned_to_affiliate",
    assignmentStatus: "active",
    archive: false,
    followupDays: null,
    clearFollowup: false,
    taskType: null,
    instruction: "Anotação salva",
    templateId: null,
    toast: "Anotação salva",
  },
  convert: {
    phase: "closed",
    leadStatus: "converted",
    assignmentStage: "converted",
    assignmentStatus: "converted",
    archive: true,
    followupDays: 2,
    clearFollowup: false,
    taskType: "post_sale",
    instruction: "Pós-venda: agradecer e oferecer próximo pedido",
    templateId: "followup",
    toast: "Cliente registrado · pós-venda em 2 dias",
    addTag: "convertido",
  },
  post_sale_completed: {
    phase: "closed",
    leadStatus: "converted",
    assignmentStage: "converted",
    assignmentStatus: "converted",
    archive: true,
    followupDays: null,
    clearFollowup: true,
    taskType: null,
    instruction: "Pós-venda concluído",
    templateId: null,
    toast: "Pós-venda concluído",
  },
  called: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 2,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Retomar (WA ou nova ligação) se não houver retorno em 2 dias",
    templateId: "followup",
    toast: "Ligação registrada · follow-up em 2 dias",
  },
  voicemail: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 2,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Deixou recado — retomar em 2 dias (WA ou telefone)",
    templateId: "followup",
    toast: "Caixa postal · retomar em 2 dias",
  },
  busy: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 1,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Linha ocupada — tentar de novo amanhã",
    templateId: "followup",
    toast: "Ocupado · nova tentativa amanhã",
  },
  callback_requested: {
    phase: "contacted",
    leadStatus: "contacted",
    assignmentStage: "awaiting_response",
    assignmentStatus: "active",
    archive: false,
    followupDays: 1,
    clearFollowup: false,
    taskType: "followup_1",
    instruction: "Retorno agendado — ligar ou mandar WA amanhã",
    templateId: "followup",
    toast: "Retorno agendado para amanhã",
  },
};

/**
 * Aplica a régua Reev C1–C8 sobre o efeito base.
 * `completedMessageStep` = última mensagem cold já enviada (0 se nenhuma).
 * Em ações de envio (`sent`/`followup`/`called`), a etapa concluída = completed + 1.
 */
function applyReevColdProgress(
  key: ProgressActionId,
  base: CadenceEffect,
  completedMessageStep: number,
): CadenceEffect {
  if (!COLD_PROGRESS_ACTIONS.has(key)) return { ...base };

  const isOutbound =
    key === "sent" || key === "followup" || key === "called";
  const justCompleted = isOutbound
    ? Math.min(8, Math.max(1, completedMessageStep + 1))
    : Math.max(0, Math.min(8, completedMessageStep));

  const completedDef = justCompleted > 0 ? getRulerStep(justCompleted) : null;
  const next = nextColdStep(justCompleted);

  if (!next) {
    return {
      ...base,
      followupDays: null,
      clearFollowup: true,
      taskType: null,
      instruction: "Régua completa (C8) — sem novos toques automáticos. Handoff ou arquivar.",
      templateId: null,
      toast: "Fim da régua · C8 concluído",
      completedMessageStep: justCompleted,
      nextMessageStep: null,
      addTag: completedDef?.addTag || null,
    };
  }

  const days =
    key === "busy" || key === "waiting"
      ? 1
      : next.delayDaysFromPrev;

  return {
    ...base,
    followupDays: days,
    clearFollowup: false,
    taskType: next.taskType,
    instruction: `${next.code} · ${next.title} (${next.framework}) em ${days} dia${days > 1 ? "s" : ""} se não houver resposta`,
    templateId: "followup",
    toast: `${completedDef ? `${completedDef.code} ok` : "Contato"} · próximo: ${rulerStepLabel(next.step)}`,
    completedMessageStep: justCompleted,
    nextMessageStep: next.step,
    addTag: completedDef?.addTag || null,
  };
}

export function resolveCadence(
  action: string,
  opts?: {
    followupDaysOverride?: number | null;
    /** Última etapa cold já enviada (0–8). Usado para avançar C1→C8. */
    completedMessageStep?: number | null;
  },
): CadenceEffect | null {
  const key = String(action || "").trim() as ProgressActionId;
  const base = EFFECTS[key];
  if (!base) return null;

  const completed = Math.max(0, Math.min(8, Number(opts?.completedMessageStep ?? 0) || 0));

  if (key === "waiting" || key === "callback_requested") {
    const next = nextColdStep(Math.max(0, completed));
    const days =
      opts?.followupDaysOverride != null
        ? Math.max(0, Math.min(30, Number(opts.followupDaysOverride)))
        : (base.followupDays ?? 1);
    return {
      ...base,
      followupDays: days,
      taskType: next?.taskType || base.taskType,
      instruction:
        days === 0
          ? `Retomar hoje${next ? ` · ${next.code} ${next.title}` : ""}`
          : `Retomar em ${days} dia${days > 1 ? "s" : ""}${next ? ` · ${next.code} ${next.title}` : ""}`,
      toast:
        days === 0
          ? "Lembrete para hoje"
          : `Lembrete em ${days} dia${days > 1 ? "s" : ""}`,
      completedMessageStep: completed,
      nextMessageStep: next?.step ?? null,
    };
  }

  if (COLD_PROGRESS_ACTIONS.has(key)) {
    return applyReevColdProgress(key, base, completed);
  }

  return {
    ...base,
    completedMessageStep: completed,
    nextMessageStep: null,
  };
}

export function instructionForPhase(
  phase: string,
  followupDue?: boolean,
  taskInstruction?: string | null,
): string {
  if (taskInstruction) return taskInstruction;
  if (followupDue) return "Follow-up pendente — reenviar ou avançar";
  if (phase === "new" || phase === "to_contact") {
    return "Primeiro contato — WhatsApp ou ligação";
  }
  if (phase === "contacted") return "Aguardar retorno ou fazer follow-up (WA / telefone)";
  if (phase === "engaged") return "Qualificar interesse e avançar";
  if (phase === "closed") return "Excluído";
  return "Continuar atendimento";
}

let tasksSchemaReady = false;

export async function ensureAttendanceTasksSchema(): Promise<void> {
  if (tasksSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_attendance_tasks (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      ref_type VARCHAR(32) NOT NULL,
      ref_id VARCHAR(36) NOT NULL,
      task_type VARCHAR(40) NOT NULL,
      instruction TEXT NULL,
      template_id VARCHAR(40) NULL,
      contact_channel VARCHAR(20) NULL,
      due_at TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_from_action VARCHAR(40) NULL,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_att_tasks_aff_due
     ON affiliate_attendance_tasks (affiliate_id, brand_id, status, due_at)`,
  ).catch(() => undefined);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_att_tasks_ref
     ON affiliate_attendance_tasks (ref_type, ref_id, status)`,
  ).catch(() => undefined);
  /* follow-up em affiliate_leads */
  await query(
    `ALTER TABLE affiliate_leads ADD COLUMN next_followup_at TIMESTAMP NULL`,
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_leads ADD COLUMN removed_reason VARCHAR(80) NULL`,
  ).catch(() => undefined);
  await query(
    `ALTER TABLE prospect_assignments ADD COLUMN removed_reason VARCHAR(80) NULL`,
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_attendance_tasks ADD COLUMN contact_channel VARCHAR(20) NULL`,
  ).catch(() => undefined);
  tasksSchemaReady = true;
}

export type AttendanceTaskRow = {
  id: string;
  ref_type: string;
  ref_id: string;
  task_type: string;
  instruction: string | null;
  template_id: string | null;
  due_at: string;
  status: string;
  created_from_action: string | null;
  contact_channel?: "whatsapp" | "phone" | "instagram" | "note" | "system" | null;
  contact_name?: string | null;
  completed_at?: string | null;
};

function normalizeTaskChannel(raw?: string | null): AttendanceTaskRow["contact_channel"] {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "whatsapp" || value === "phone" || value === "instagram" || value === "note" || value === "system") {
    return value;
  }
  return null;
}

function inferTaskChannel(row: any): AttendanceTaskRow["contact_channel"] {
  const explicit = normalizeTaskChannel(row?.contact_channel);
  if (explicit) return explicit;
  const fromAction = String(row?.created_from_action || "").trim().toLowerCase();
  if (fromAction === "called" || fromAction === "voicemail" || fromAction === "busy" || fromAction === "callback_requested") {
    return "phone";
  }
  const instruction = String(row?.instruction || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (
    /\b(contato|tentar|ligar|ligacao)\b.*\b(telefone|telefonico|ligar|ligacao)\b/.test(instruction)
    || /\b(telefone|telefonico|ligar|ligacao)\b.*\b(contato|tentar)\b/.test(instruction)
  ) {
    return "phone";
  }
  if (/^followup_|^first_contact$/.test(String(row?.task_type || ""))) return "whatsapp";
  return null;
}

export async function cancelOpenTasks(input: {
  affiliateId: string;
  brandId: string;
  refType: string;
  refId: string;
}): Promise<void> {
  await ensureAttendanceTasksSchema();
  await query(
    `UPDATE affiliate_attendance_tasks
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE affiliate_id = ? AND brand_id = ?
       AND ref_type = ? AND ref_id = ?
       AND status = 'pending'`,
    [input.affiliateId, input.brandId, input.refType, input.refId],
  );
}

export async function scheduleAttendanceTask(input: {
  ownerUserId: string;
  brandId: string;
  affiliateId: string;
  refType: string;
  refId: string;
  taskType: AttendanceTaskType;
  instruction: string;
  templateId?: string | null;
  dueDays: number;
  fromAction: string;
  contactChannel?: "whatsapp" | "phone" | "instagram" | "note" | "system" | null;
}): Promise<AttendanceTaskRow | null> {
  await ensureAttendanceTasksSchema();
  await cancelOpenTasks({
    affiliateId: input.affiliateId,
    brandId: input.brandId,
    refType: input.refType,
    refId: input.refId,
  });

  const id = randomUUID();
  const days = Math.max(0, Math.min(60, Number(input.dueDays) || 0));
  /* due_at = now + days (meio-dia local aproximado via SQL) */
  await query(
    `INSERT INTO affiliate_attendance_tasks
     (id, owner_user_id, brand_id, affiliate_id, ref_type, ref_id,
      task_type, instruction, template_id, contact_channel, due_at, status, created_from_action)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + (? * INTERVAL '1 day'), 'pending', ?)`,
    [
      id,
      input.ownerUserId,
      input.brandId,
      input.affiliateId,
      input.refType,
      input.refId,
      input.taskType,
      input.instruction,
      input.templateId || null,
      normalizeTaskChannel(input.contactChannel) || null,
      days,
      input.fromAction,
    ],
  );

  const row = await queryOne<any>(
    `SELECT * FROM affiliate_attendance_tasks WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!row) return null;
  return {
    id: String(row.id),
    ref_type: String(row.ref_type),
    ref_id: String(row.ref_id),
    task_type: String(row.task_type),
    instruction: row.instruction || null,
    template_id: row.template_id || null,
    due_at: String(row.due_at),
    status: String(row.status),
    created_from_action: row.created_from_action || null,
    contact_channel: inferTaskChannel(row),
  };
}

export async function completeAttendanceTask(input: {
  affiliateId: string;
  brandId: string;
  taskId: string;
}): Promise<void> {
  await ensureAttendanceTasksSchema();
  await query(
    `UPDATE affiliate_attendance_tasks
     SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND affiliate_id = ? AND brand_id = ? AND status = 'pending'`,
    [input.taskId, input.affiliateId, input.brandId],
  );
}

/** Marca todas as tarefas pendentes do contato como done (resultado registrado). */
export async function completeOpenTasks(input: {
  affiliateId: string;
  brandId: string;
  refType: string;
  refId: string;
}): Promise<void> {
  await ensureAttendanceTasksSchema();
  await query(
    `UPDATE affiliate_attendance_tasks
     SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE affiliate_id = ? AND brand_id = ?
       AND ref_type = ? AND ref_id = ?
       AND status = 'pending'`,
    [input.affiliateId, input.brandId, input.refType, input.refId],
  );
}

export type AttendanceTasksMode = "due" | "upcoming" | "all" | "done";

function mapTaskRow(row: any): AttendanceTaskRow {
  return {
    id: String(row.id),
    ref_type: String(row.ref_type),
    ref_id: String(row.ref_id),
    task_type: String(row.task_type),
    instruction: row.instruction || null,
    template_id: row.template_id || null,
    due_at: String(row.due_at),
    status: String(row.status),
    created_from_action: row.created_from_action || null,
    contact_channel: inferTaskChannel(row),
    contact_name: row.contact_name ? String(row.contact_name) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

/**
 * Lista tarefas.
 * - mode=due (default): pending executáveis (due_at <= now)
 * - mode=upcoming: pending futuras no horizonte
 * - mode=done: concluídas (status done), mais recentes primeiro
 * - mode=all: pending no horizonte
 */
export async function listDueAttendanceTasks(input: {
  affiliateId: string;
  brandId: string;
  /** @deprecated use mode; se mode=all/upcoming, limita futuras */
  horizonDays?: number;
  /** due | upcoming | all | done — default due */
  mode?: AttendanceTasksMode;
  limit?: number;
}): Promise<AttendanceTaskRow[]> {
  await ensureAttendanceTasksSchema();
  const mode: AttendanceTasksMode = input.mode || "due";
  const horizon = Math.max(0, Math.min(30, Number(input.horizonDays) ?? 14));
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);

  const params: any[] = [input.affiliateId, input.brandId];
  let statusClause = "AND t.status = 'pending'";
  let dueClause = "";
  let orderBy = "t.due_at ASC, t.created_at ASC NULLS LAST";

  if (mode === "done") {
    statusClause = "AND t.status = 'done'";
    dueClause = "";
    orderBy = "COALESCE(t.completed_at, t.updated_at, t.due_at) DESC NULLS LAST";
  } else if (mode === "due") {
    dueClause = "AND t.due_at <= CURRENT_TIMESTAMP";
  } else if (mode === "upcoming") {
    dueClause = "AND t.due_at > CURRENT_TIMESTAMP AND t.due_at <= CURRENT_TIMESTAMP + (? * INTERVAL '1 day')";
    params.push(horizon);
  } else {
    /* all pending no horizonte */
    dueClause = "AND t.due_at <= CURRENT_TIMESTAMP + (? * INTERVAL '1 day')";
    params.push(horizon);
  }
  params.push(limit);

  const rows = await query<any[]>(
    `SELECT t.*,
            COALESCE(al.customer_name, pa.prospect_name, '') AS contact_name
     FROM affiliate_attendance_tasks t
     LEFT JOIN affiliate_leads al
       ON t.ref_type = 'affiliate_lead' AND al.id = t.ref_id
     LEFT JOIN prospect_assignments pa
       ON t.ref_type = 'assignment' AND pa.id = t.ref_id
     WHERE t.affiliate_id = ? AND t.brand_id = ?
       ${statusClause}
       ${dueClause}
     ORDER BY ${orderBy}
     LIMIT ?`,
    params,
  ).catch(() => []);

  return (rows || []).map(mapTaskRow);
}

/** Próxima tarefa pending do contato (qualquer due_at). */
export async function getNextPendingTask(input: {
  affiliateId: string;
  brandId: string;
  refType: string;
  refId: string;
}): Promise<AttendanceTaskRow | null> {
  await ensureAttendanceTasksSchema();
  const row = await queryOne<any>(
    `SELECT t.*,
            COALESCE(al.customer_name, pa.prospect_name, '') AS contact_name
     FROM affiliate_attendance_tasks t
     LEFT JOIN affiliate_leads al
       ON t.ref_type = 'affiliate_lead' AND al.id = t.ref_id
     LEFT JOIN prospect_assignments pa
       ON t.ref_type = 'assignment' AND pa.id = t.ref_id
     WHERE t.affiliate_id = ? AND t.brand_id = ?
       AND t.ref_type = ? AND t.ref_id = ?
       AND t.status = 'pending'
     ORDER BY t.due_at ASC
     LIMIT 1`,
    [input.affiliateId, input.brandId, input.refType, input.refId],
  ).catch(() => null);
  return row ? mapTaskRow(row) : null;
}

/** Mapa ref_type:ref_id → próxima pending (batch para listas). */
export async function mapNextPendingTasks(input: {
  affiliateId: string;
  brandId: string;
  limit?: number;
}): Promise<Map<string, AttendanceTaskRow>> {
  await ensureAttendanceTasksSchema();
  const limit = Math.min(Math.max(Number(input.limit) || 300, 1), 500);
  const rows = await query<any[]>(
    `SELECT DISTINCT ON (t.ref_type, t.ref_id) t.*,
            COALESCE(al.customer_name, pa.prospect_name, '') AS contact_name
     FROM affiliate_attendance_tasks t
     LEFT JOIN affiliate_leads al
       ON t.ref_type = 'affiliate_lead' AND al.id = t.ref_id
     LEFT JOIN prospect_assignments pa
       ON t.ref_type = 'assignment' AND pa.id = t.ref_id
     WHERE t.affiliate_id = ? AND t.brand_id = ?
       AND t.status = 'pending'
     ORDER BY t.ref_type, t.ref_id, t.due_at ASC
     LIMIT ?`,
    [input.affiliateId, input.brandId, limit],
  ).catch(() => []);

  const map = new Map<string, AttendanceTaskRow>();
  for (const row of rows || []) {
    const key = `${row.ref_type}:${row.ref_id}`;
    map.set(key, mapTaskRow(row));
  }
  return map;
}

export async function countOverdueTasks(affiliateId: string, brandId: string): Promise<number> {
  await ensureAttendanceTasksSchema();
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM affiliate_attendance_tasks
     WHERE affiliate_id = ? AND brand_id = ?
       AND status = 'pending'
       AND due_at < CURRENT_TIMESTAMP`,
    [affiliateId, brandId],
  ).catch(() => null);
  return Number(row?.c || 0);
}

/** Aplica efeito de cadência + agenda tarefa; retorna resumo para a API. */
export async function applyCadenceAfterProgress(input: {
  ownerUserId: string;
  brandId: string;
  affiliateId: string;
  refType: string;
  refId: string;
  action: string;
  followupDaysOverride?: number | null;
  /** Última etapa cold já enviada (0–8) — alimenta régua C1–C8 */
  completedMessageStep?: number | null;
  effectOverride?: CadenceEffect | null;
  contactChannel?: "whatsapp" | "phone" | "instagram" | "note" | "system" | null;
}): Promise<{
  effect: CadenceEffect;
  next_task: AttendanceTaskRow | null;
}> {
  const effect = input.effectOverride || resolveCadence(input.action, {
    followupDaysOverride: input.followupDaysOverride,
    completedMessageStep: input.completedMessageStep,
  });
  if (!effect) {
    throw new Error("Ação inválida");
  }

  let nextTask: AttendanceTaskRow | null = null;

  /* Qualquer resultado (exceto nota) conclui tarefas abertas do contato.
     Assim a Fila de Tarefas reflete o que o afiliado realmente fechou. */
  if (input.action !== "note") {
    await completeOpenTasks({
      affiliateId: input.affiliateId,
      brandId: input.brandId,
      refType: input.refType,
      refId: input.refId,
    });
  } else if (effect.archive || effect.clearFollowup) {
    await cancelOpenTasks({
      affiliateId: input.affiliateId,
      brandId: input.brandId,
      refType: input.refType,
      refId: input.refId,
    });
  }

  if (effect.taskType && effect.followupDays != null && !effect.archive) {
    nextTask = await scheduleAttendanceTask({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      refType: input.refType,
      refId: input.refId,
      taskType: effect.taskType,
      instruction: effect.instruction,
      templateId: effect.templateId,
      dueDays: effect.followupDays,
      fromAction: input.action,
      contactChannel: input.contactChannel,
    });
  } else if (effect.taskType && effect.archive && input.action === "convert") {
    /* pós-venda mesmo após sair da prospecção */
    nextTask = await scheduleAttendanceTask({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      affiliateId: input.affiliateId,
      refType: input.refType,
      refId: input.refId,
      taskType: "post_sale",
      instruction: effect.instruction,
      templateId: effect.templateId,
      dueDays: effect.followupDays ?? 2,
      fromAction: input.action,
      contactChannel: input.contactChannel,
    });
  }

  return { effect, next_task: nextTask };
}

/**
 * Tipos canônicos do módulo Fluxos (jornadas multi-turno).
 * Compatível com o grafo legado em flow_automations (nodes_json / connections_json).
 */

export type FlowNodeType =
  | "trigger"
  | "condition"
  | "action"
  | "delay"
  | "wait"
  | "collect"
  | "destination"
  | "end";

export type FlowStatus = "draft" | "active" | "paused";

export type FlowExecutionStatus =
  | "running"
  | "waiting_user"
  | "waiting_time"
  | "waiting_agent"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type FlowSessionStatus =
  | "running"
  | "waiting_user"
  | "waiting_time"
  | "waiting_agent"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export interface FlowNode {
  id: string;
  type: FlowNodeType | string;
  subtype: string;
  label: string;
  data: Record<string, any>;
  /** Fase lógica opcional (organização / analytics) */
  phaseId?: string;
}

export interface FlowConnection {
  id: string;
  from: string;
  fromHandle: string;
  to: string;
}

export interface FlowPhase {
  id: string;
  name: string;
  description?: string;
  color?: string;
  order?: number;
}

/** Normaliza handles legados (templates usavam "default"). */
export function normalizeHandle(handle: string | null | undefined): string {
  const h = String(handle || "main").trim().toLowerCase();
  if (!h || h === "default" || h === "out" || h === "output") return "main";
  if (h === "true" || h === "sim") return "yes";
  if (h === "false" || h === "nao" || h === "não") return "no";
  return h;
}

export function connectionMatches(
  conn: FlowConnection,
  fromNodeId: string,
  resultHandle: string | null
): boolean {
  if (conn.from !== fromNodeId) return false;
  if (resultHandle === null) return false;
  const want = normalizeHandle(resultHandle);
  const have = normalizeHandle(conn.fromHandle);
  return have === want || have === "main";
}

export const WAIT_SUBTYPES = new Set([
  "wait_reply",
  "wait_user",
  "await_reply",
  "aguardar_resposta",
]);

export const COLLECT_SUBTYPES = new Set([
  "collect_text",
  "collect_name",
  "collect_email",
  "collect_phone",
  "collect_number",
  "collect_confirm",
  "input_text",
  "coleta_texto",
]);

export function isWaitNode(node: FlowNode): boolean {
  return node.type === "wait" || WAIT_SUBTYPES.has(String(node.subtype || ""));
}

export function isCollectNode(node: FlowNode): boolean {
  return node.type === "collect" || COLLECT_SUBTYPES.has(String(node.subtype || ""));
}

export function isHandoffNode(node: FlowNode): boolean {
  const s = String(node.subtype || "");
  return s === "handoff_agent" || s === "transfer_human" || s === "transferir_atendente";
}

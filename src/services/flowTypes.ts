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
  return normalizeHandle(conn.fromHandle) === normalizeHandle(resultHandle);
}

/** Exact match first; fallback to `main` when branch handle has no edge. */
export function resolveNextConnections(
  connections: FlowConnection[],
  fromNodeId: string,
  resultHandle: string | null
): FlowConnection[] {
  if (resultHandle === null) return [];
  const exact = connections.filter((c) => connectionMatches(c, fromNodeId, resultHandle));
  if (exact.length) return exact;
  const want = normalizeHandle(resultHandle);
  if (want !== "main") {
    return connections.filter((c) => connectionMatches(c, fromNodeId, "main"));
  }
  return [];
}

export const WAIT_SUBTYPES = new Set([
  "wait_reply",
  "wait_user",
  "await_reply",
  "aguardar_resposta",
  "wait_button",
  "wait_choice",
  "aguardar_botao",
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

export type InteractiveOption = { id: string; label: string };

/** Extract button/list options from node data or mensagemSteps. */
export function extractInteractiveOptions(data: Record<string, any> | undefined): InteractiveOption[] {
  if (!data) return [];
  const out: InteractiveOption[] = [];
  const push = (id: any, label: any) => {
    const i = String(id || "").trim();
    const l = String(label || id || "").trim();
    if (!i && !l) return;
    const finalId = i || l.toLowerCase().replace(/\s+/g, "_").slice(0, 40);
    if (out.some((o) => o.id === finalId)) return;
    out.push({ id: finalId, label: l || finalId });
  };

  if (Array.isArray(data.options)) {
    for (const opt of data.options) {
      if (typeof opt === "string") push(opt, opt);
      else if (opt && typeof opt === "object") push(opt.id || opt.payload || opt.value, opt.label || opt.text || opt.title);
    }
  }
  if (Array.isArray(data.buttons)) {
    for (const b of data.buttons) {
      if (b && typeof b === "object") push(b.id || b.payload, b.label || b.text);
    }
  }
  const steps = Array.isArray(data.mensagemSteps) ? data.mensagemSteps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    if (String(step.tipo) === "botoes" && Array.isArray(step.buttons)) {
      for (const b of step.buttons) {
        push(b?.id || b?.payload, b?.label || b?.text);
      }
    }
    if (String(step.tipo) === "lista" && Array.isArray(step.listSections)) {
      for (const sec of step.listSections) {
        for (const row of sec?.rows || []) {
          push(row?.id, row?.title || row?.label);
        }
      }
    }
  }
  return out.slice(0, 12);
}

export function parseInteractiveInbound(raw: string): {
  kind: "button" | "list" | "poll" | "interactive" | "text" | "number_choice";
  id: string | null;
  label: string;
  raw: string;
} {
  const text = String(raw || "").trim();
  const m = text.match(
    /^\[(button_reply|list_reply|interactive_reply|option_reply|poll_vote)\]\s*(.+?)(?:\s*\(id:([^)]+)\))?\s*$/i
  );
  if (m) {
    const kindRaw = m[1].toLowerCase();
    const kind =
      kindRaw.startsWith("poll")
        ? "poll"
        : kindRaw.startsWith("list")
        ? "list"
        : kindRaw.startsWith("interactive")
          ? "interactive"
          : "button";
    return {
      kind,
      label: String(m[2] || "").trim(),
      id: m[3] ? String(m[3]).trim() : null,
      raw: text,
    };
  }
  if (/^\d{1,2}$/.test(text)) {
    return { kind: "number_choice", id: text, label: text, raw: text };
  }
  return { kind: "text", id: null, label: text, raw: text };
}

/** Match inbound to option → handle id (or yes/no for confirm). */
export function matchInteractiveOption(
  inbound: ReturnType<typeof parseInteractiveInbound>,
  options: InteractiveOption[]
): { matched: InteractiveOption | null; handle: string } {
  if (!options.length) {
    return { matched: null, handle: "main" };
  }
  const byId = inbound.id
    ? options.find((o) => o.id.toLowerCase() === String(inbound.id).toLowerCase())
    : null;
  if (byId) return { matched: byId, handle: byId.id };

  const label = inbound.label.toLowerCase();
  const byLabel = options.find(
    (o) =>
      o.label.toLowerCase() === label ||
      o.id.toLowerCase() === label ||
      label.includes(o.label.toLowerCase())
  );
  if (byLabel) return { matched: byLabel, handle: byLabel.id };

  if (inbound.kind === "number_choice") {
    const idx = Number(inbound.id) - 1;
    if (idx >= 0 && idx < options.length) {
      return { matched: options[idx], handle: options[idx].id };
    }
  }

  return { matched: null, handle: "invalid" };
}

export function graphHasCycle(nodes: FlowNode[], connections: FlowConnection[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const c of connections) {
    if (!adj.has(c.from)) adj.set(c.from, []);
    adj.get(c.from)!.push(c.to);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adj.get(id) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

export function validateFlowGraph(
  nodes: FlowNode[],
  connections: FlowConnection[]
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!nodes.some((n) => n.type === "trigger")) errors.push("Falta bloco de início (trigger)");
  if (!nodes.some((n) => n.type === "end")) errors.push("Falta bloco de encerramento (end)");
  if (graphHasCycle(nodes, connections)) errors.push("Loop detectado no grafo");
  const ids = new Set(nodes.map((n) => n.id));
  for (const c of connections) {
    if (!ids.has(c.from) || !ids.has(c.to)) errors.push(`Conexão inválida ${c.from} → ${c.to}`);
  }
  for (const n of nodes) {
    if (n.type === "condition") {
      const outs = connections.filter((c) => c.from === n.id);
      const hasYes = outs.some((c) => normalizeHandle(c.fromHandle) === "yes");
      const hasNo = outs.some((c) => normalizeHandle(c.fromHandle) === "no");
      if (!hasYes && !hasNo && outs.length === 0) {
        errors.push(`Condição "${n.label || n.id}" sem saídas`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

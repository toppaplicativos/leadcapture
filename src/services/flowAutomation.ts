import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { getFlowTemplate, listFlowTemplates, resolveTemplateFromBrief, type FlowTemplate } from "./adminAgent/flowTemplates";
import { ensureFlowSchema } from "./flowSchema";
import { normalizeHandle } from "./flowTypes";

export type FlowSummary = {
  id: string;
  name: string;
  status: string;
  triggerSubtype: string;
  nodeCount: number;
  updatedAt?: string;
};

async function ensureTables(): Promise<void> {
  await ensureFlowSchema();
}

function parseNodes(row: any): any[] {
  const raw = row?.nodes_json;
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function listUserFlows(userId: string): Promise<FlowSummary[]> {
  await ensureTables();
  const pool = getPool();
  const [rows] = await pool.query<any[]>(
    "SELECT id, name, status, nodes_json, updated_at FROM flow_automations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30",
    [userId],
  );
  return (rows || []).map((row) => {
    const nodes = parseNodes(row);
    const trigger = nodes.find((n: any) => n.type === "trigger");
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      triggerSubtype: trigger?.subtype || "",
      nodeCount: nodes.length,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
  });
}

export async function createFlowFromTemplate(
  userId: string,
  templateId: string,
  opts?: { name?: string; activate?: boolean },
): Promise<{ flowId: string; template: FlowTemplate }> {
  const template = getFlowTemplate(templateId);
  if (!template) throw new Error("Template não encontrado");

  await ensureTables();
  const id = randomUUID();
  const pool = getPool();
  const status = opts?.activate ? "active" : "draft";
  const name = String(opts?.name || template.name).slice(0, 255);

  const connections = (template.connections || []).map((c) => ({
    ...c,
    fromHandle: normalizeHandle(c.fromHandle),
  }));
  await pool.execute(
    "INSERT INTO flow_automations (id, user_id, name, status, nodes_json, connections_json, published_version) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [id, userId, name, status, JSON.stringify(template.nodes), JSON.stringify(connections)],
  );

  return { flowId: id, template };
}

export function detectTemplateFromBrief(brief: string): FlowTemplate | null {
  return resolveTemplateFromBrief(brief);
}

export function getAvailableTemplates(): FlowTemplate[] {
  return listFlowTemplates();
}

export async function countFlowsByMode(userId: string): Promise<{ reactive: number; proactive: number; total: number }> {
  const flows = await listUserFlows(userId);
  let reactive = 0;
  let proactive = 0;
  for (const f of flows) {
    if (f.triggerSubtype === "message_received") reactive++;
    else if (["new_lead", "lead_status_change", "order_created"].includes(f.triggerSubtype)) proactive++;
  }
  return { reactive, proactive, total: flows.length };
}
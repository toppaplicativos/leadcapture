import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { getFlowTemplate, listFlowTemplates, resolveTemplateFromBrief, type FlowTemplate } from "./adminAgent/flowTemplates";

export type FlowSummary = {
  id: string;
  name: string;
  status: string;
  triggerSubtype: string;
  nodeCount: number;
  updatedAt?: string;
};

async function ensureTables(): Promise<void> {
  const pool = getPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flow_automations (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT 'Novo Fluxo',
      status ENUM('draft','active','paused') NOT NULL DEFAULT 'draft',
      nodes_json JSON NOT NULL,
      connections_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_flow_user (user_id),
      INDEX idx_flow_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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

  await pool.execute(
    "INSERT INTO flow_automations (id, user_id, name, status, nodes_json, connections_json) VALUES (?, ?, ?, ?, ?, ?)",
    [id, userId, name, status, JSON.stringify(template.nodes), JSON.stringify(template.connections)],
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
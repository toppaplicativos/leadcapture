import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getPool } from "../config/database";

const router = Router();
router.use(authMiddleware);

function resolveUserId(req: AuthRequest): string | undefined {
  return (req.user as any)?.userId || (req.user as any)?.id;
}

// Ensure table exists
async function ensureTable(): Promise<void> {
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

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flow_automation_executions (
      id VARCHAR(64) PRIMARY KEY,
      flow_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      trigger_subtype VARCHAR(80) NOT NULL,
      status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
      system_vars_json JSON NULL,
      context_json JSON NULL,
      node_outputs_json JSON NULL,
      node_output_schema_json JSON NULL,
      steps_output_json JSON NULL,
      steps_timeline_json JSON NULL,
      debug_log_json JSON NULL,
      last_node_id VARCHAR(64) NULL,
      error_message TEXT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_flow_exec_user (user_id),
      INDEX idx_flow_exec_flow (flow_id),
      INDEX idx_flow_exec_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try {
    await pool.execute("ALTER TABLE flow_automation_executions ADD COLUMN node_output_schema_json JSON NULL AFTER node_outputs_json");
  } catch {
    // already exists
  }
  try {
    await pool.execute("ALTER TABLE flow_automation_executions ADD COLUMN steps_timeline_json JSON NULL AFTER steps_output_json");
  } catch {
    // already exists
  }
}

let _tableReady = false;
async function ready() {
  if (_tableReady) return;
  await ensureTable();
  _tableReady = true;
}

function serializeFlow(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    nodes: typeof row.nodes_json === "string" ? JSON.parse(row.nodes_json) : (row.nodes_json ?? []),
    connections: typeof row.connections_json === "string" ? JSON.parse(row.connections_json) : (row.connections_json ?? []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJsonSafe(value: any, fallback: any) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeExecution(row: any) {
  return {
    id: row.id,
    flow_id: row.flow_id,
    user_id: row.user_id,
    trigger_subtype: row.trigger_subtype,
    status: row.status,
    system_vars: parseJsonSafe(row.system_vars_json, {}),
    context: parseJsonSafe(row.context_json, {}),
    node_outputs: parseJsonSafe(row.node_outputs_json, {}),
    node_output_schema: parseJsonSafe(row.node_output_schema_json, {}),
    steps_output: parseJsonSafe(row.steps_output_json, {}),
    steps_timeline: parseJsonSafe(row.steps_timeline_json, []),
    debug_log: parseJsonSafe(row.debug_log_json, []),
    last_node_id: row.last_node_id || null,
    error_message: row.error_message || null,
    started_at: row.started_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at,
  };
}

// GET /api/flows
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM flow_automations WHERE user_id = ? ORDER BY updated_at DESC",
      [userId]
    );
    return res.json({ success: true, flows: rows.map(serializeFlow) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flows/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [req.params.id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Flow not found" });
    return res.json({ success: true, flow: serializeFlow(rows[0]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flows/:id/executions
router.get("/:id/executions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "Flow id is required" });

    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const pool = getPool();

    const [exists] = await pool.query<any[]>(
      "SELECT id FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!exists[0]) return res.status(404).json({ error: "Flow not found" });

    const [rows] = await pool.query<any[]>(
      `SELECT *
       FROM flow_automation_executions
       WHERE flow_id = ? AND user_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
      [id, userId, limit]
    );

    return res.json({
      success: true,
      executions: rows.map(serializeExecution),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flows/executions/:executionId
router.get("/executions/:executionId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();

    const executionId = String(req.params.executionId || "").trim();
    if (!executionId) return res.status(400).json({ error: "Execution id is required" });

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM flow_automation_executions WHERE id = ? AND user_id = ? LIMIT 1",
      [executionId, userId]
    );

    if (!rows[0]) return res.status(404).json({ error: "Execution not found" });
    return res.json({ success: true, execution: serializeExecution(rows[0]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flows
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();

    const { name = "Novo Fluxo", status = "draft", nodes = [], connections = [] } = req.body || {};
    const id = uuidv4();
    const pool = getPool();

    await pool.execute(
      "INSERT INTO flow_automations (id, user_id, name, status, nodes_json, connections_json) VALUES (?, ?, ?, ?, ?, ?)",
      [id, userId, String(name).slice(0, 255), status, JSON.stringify(nodes), JSON.stringify(connections)]
    );

    const [rows] = await pool.query<any[]>("SELECT * FROM flow_automations WHERE id = ? LIMIT 1", [id]);
    return res.json({ success: true, flow: serializeFlow(rows[0]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/flows/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();

    const id = String(req.params.id || "");
    const pool = getPool();

    const [existing] = await pool.query<any[]>(
      "SELECT id FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!existing[0]) return res.status(404).json({ error: "Flow not found" });

    const { name, status, nodes, connections } = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];

    if (name      !== undefined) { sets.push("name = ?");             vals.push(String(name).slice(0, 255)); }
    if (status    !== undefined) { sets.push("status = ?");           vals.push(status); }
    if (nodes     !== undefined) { sets.push("nodes_json = ?");       vals.push(JSON.stringify(nodes)); }
    if (connections !== undefined) { sets.push("connections_json = ?"); vals.push(JSON.stringify(connections)); }

    if (sets.length > 0) {
      vals.push(id, userId);
      await pool.execute(`UPDATE flow_automations SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, vals);
    }

    const [rows] = await pool.query<any[]>("SELECT * FROM flow_automations WHERE id = ? LIMIT 1", [id]);
    return res.json({ success: true, flow: serializeFlow(rows[0]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/flows/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const pool = getPool();
    const [result] = await pool.execute<any>(
      "DELETE FROM flow_automations WHERE id = ? AND user_id = ?",
      [req.params.id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Flow not found" });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

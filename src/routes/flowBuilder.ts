import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { getPool } from "../config/database";
import { ensureFlowSchema } from "../services/flowSchema";
import { normalizeHandle, validateFlowGraph } from "../services/flowTypes";
import { FlowExecutorService } from "../services/flowExecutor";

const router = Router();
router.use(authMiddleware);

function resolveUserId(req: AuthRequest): string | undefined {
  return (req.user as any)?.userId || (req.user as any)?.id;
}

function resolveBrandId(req: AuthRequest): string | null {
  const h = String(req.headers["x-brand-id"] || "").trim();
  if (h) return h;
  const q = String((req.query as any)?.brand_id || "").trim();
  return q || null;
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

function normalizeConnections(connections: any[]): any[] {
  return (connections || []).map((c) => ({
    ...c,
    fromHandle: normalizeHandle(c?.fromHandle),
  }));
}

function serializeFlow(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    description: row.description || "",
    brand_id: row.brand_id || null,
    nodes: parseJsonSafe(row.nodes_json, []),
    connections: normalizeConnections(parseJsonSafe(row.connections_json, [])),
    phases: parseJsonSafe(row.phases_json, []),
    published_version: Number(row.published_version || 0),
    has_published: Number(row.published_version || 0) > 0,
    concurrency_policy: row.concurrency_policy || "single_waiting",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeExecution(row: any) {
  return {
    id: row.id,
    flow_id: row.flow_id,
    user_id: row.user_id,
    brand_id: row.brand_id || null,
    published_version: row.published_version ?? null,
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
    contact_key: row.contact_key || null,
    started_at: row.started_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at,
  };
}

function serializeSession(row: any) {
  return {
    id: row.id,
    flow_id: row.flow_id,
    execution_id: row.execution_id,
    contact_key: row.contact_key,
    channel: row.channel,
    status: row.status,
    current_node_id: row.current_node_id,
    waiting_node_id: row.waiting_node_id,
    published_version: row.published_version,
    context: parseJsonSafe(row.context_json, {}),
    attempts: row.attempts,
    expires_at: row.expires_at,
    last_inbound_at: row.last_inbound_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ready() {
  await ensureFlowSchema();
}

// GET /api/flows
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const brandId = resolveBrandId(req);
    const pool = getPool();

    let rows: any[];
    if (brandId) {
      [rows] = await pool.query<any[]>(
        `SELECT * FROM flow_automations
         WHERE user_id = ? AND (brand_id = ? OR brand_id IS NULL)
         ORDER BY updated_at DESC`,
        [userId, brandId]
      );
    } else {
      [rows] = await pool.query<any[]>(
        "SELECT * FROM flow_automations WHERE user_id = ? ORDER BY updated_at DESC",
        [userId]
      );
    }
    return res.json({ success: true, flows: rows.map(serializeFlow) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flows/:id/sessions
router.get("/:id/sessions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const id = String(req.params.id || "").trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
    const pool = getPool();

    const [exists] = await pool.query<any[]>(
      "SELECT id FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!exists[0]) return res.status(404).json({ error: "Flow not found" });

    const [rows] = await pool.query<any[]>(
      `SELECT * FROM flow_sessions
       WHERE flow_id = ? AND user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
      [id, userId, limit]
    );
    return res.json({ success: true, sessions: rows.map(serializeSession) });
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

// POST /api/flows
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();

    const brandId = resolveBrandId(req) || req.body?.brand_id || null;
    const {
      name = "Novo Fluxo",
      status = "draft",
      nodes = [],
      connections = [],
      phases = [],
      description = "",
    } = req.body || {};
    const id = uuidv4();
    const pool = getPool();
    const conns = normalizeConnections(connections);

    await pool.execute(
      `INSERT INTO flow_automations (
        id, user_id, brand_id, name, status, description,
        nodes_json, connections_json, phases_json, published_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        userId,
        brandId,
        String(name).slice(0, 255),
        status,
        String(description || "").slice(0, 2000),
        JSON.stringify(nodes),
        JSON.stringify(conns),
        JSON.stringify(phases || []),
      ]
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

    const { name, status, nodes, connections, phases, description, brand_id, concurrency_policy } =
      req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];

    if (name !== undefined) {
      sets.push("name = ?");
      vals.push(String(name).slice(0, 255));
    }
    if (status !== undefined) {
      sets.push("status = ?");
      vals.push(status);
    }
    if (description !== undefined) {
      sets.push("description = ?");
      vals.push(String(description).slice(0, 2000));
    }
    if (brand_id !== undefined) {
      sets.push("brand_id = ?");
      vals.push(brand_id || null);
    }
    if (concurrency_policy !== undefined) {
      sets.push("concurrency_policy = ?");
      vals.push(String(concurrency_policy).slice(0, 40));
    }
    if (nodes !== undefined) {
      sets.push("nodes_json = ?");
      vals.push(JSON.stringify(nodes));
    }
    if (connections !== undefined) {
      sets.push("connections_json = ?");
      vals.push(JSON.stringify(normalizeConnections(connections)));
    }
    if (phases !== undefined) {
      sets.push("phases_json = ?");
      vals.push(JSON.stringify(phases));
    }

    if (sets.length > 0) {
      vals.push(id, userId);
      await pool.execute(
        `UPDATE flow_automations SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        vals
      );
    }

    const [rows] = await pool.query<any[]>("SELECT * FROM flow_automations WHERE id = ? LIMIT 1", [id]);
    return res.json({ success: true, flow: serializeFlow(rows[0]) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flows/:id/start — inicia execução (teste manual / API)
router.post("/:id/start", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const id = String(req.params.id || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const message = String(req.body?.message || "").trim();
    const name = String(req.body?.name || "").trim();
    const brandId = resolveBrandId(req) || req.body?.brand_id || null;

    const result = await FlowExecutorService.get().startFlowById({
      flowId: id,
      userId,
      brandId,
      phone,
      message,
      name,
      triggerSubtype: String(req.body?.triggerSubtype || "manual"),
      source: "api_manual",
      requireActive: req.body?.requireActive !== false,
    });

    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ success: true, execution_id: result.executionId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/flows/:id/metrics — agregados simples de execuções
router.get("/:id/metrics", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const id = String(req.params.id || "").trim();
    const pool = getPool();

    const [exists] = await pool.query<any[]>(
      "SELECT id, phases_json FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!exists[0]) return res.status(404).json({ error: "Flow not found" });

    const [rows] = await pool.query<any[]>(
      `SELECT status, context_json, started_at, finished_at
       FROM flow_automation_executions
       WHERE flow_id = ? AND user_id = ?
       ORDER BY started_at DESC
       LIMIT 200`,
      [id, userId]
    );

    const byStatus: Record<string, number> = {};
    const phaseVisits: Record<string, number> = {};
    let completed = 0;
    let waiting = 0;
    let failed = 0;

    for (const row of rows) {
      const st = String(row.status || "unknown");
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (st === "completed") completed += 1;
      if (st === "waiting_user" || st === "waiting_agent") waiting += 1;
      if (st === "failed") failed += 1;

      const ctx = parseJsonSafe(row.context_json, {});
      const phases = ctx.__phases && typeof ctx.__phases === "object" ? ctx.__phases : {};
      for (const [phaseId, meta] of Object.entries(phases)) {
        const visits = Number((meta as any)?.visits || 1);
        phaseVisits[phaseId] = (phaseVisits[phaseId] || 0) + visits;
      }
    }

    const phases = parseJsonSafe(exists[0].phases_json, []);
    return res.json({
      success: true,
      metrics: {
        sample_size: rows.length,
        by_status: byStatus,
        completed,
        waiting,
        failed,
        phase_visits: phaseVisits,
        phases,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flows/:id/publish — snapshot rascunho → runtime
router.post("/:id/publish", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const id = String(req.params.id || "");
    const pool = getPool();

    const [rows] = await pool.query<any[]>(
      "SELECT * FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Flow not found" });

    const nodes = parseJsonSafe(rows[0].nodes_json, []);
    const connections = normalizeConnections(parseJsonSafe(rows[0].connections_json, []));
    const validation = validateFlowGraph(nodes, connections);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.errors[0] || "Fluxo inválido",
        errors: validation.errors,
      });
    }

    const nextVersion = Number(rows[0].published_version || 0) + 1;
    const activate = req.body?.activate !== false;

    await pool.execute(
      `UPDATE flow_automations SET
        published_nodes_json = ?,
        published_connections_json = ?,
        published_version = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        JSON.stringify(nodes),
        JSON.stringify(connections),
        nextVersion,
        activate ? "active" : rows[0].status,
        id,
        userId,
      ]
    );

    const [updated] = await pool.query<any[]>(
      "SELECT * FROM flow_automations WHERE id = ? LIMIT 1",
      [id]
    );
    return res.json({
      success: true,
      flow: serializeFlow(updated[0]),
      published_version: nextVersion,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/flows/:id/simulate — dry-run linear (sem envio real)
router.post("/:id/simulate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await ready();
    const id = String(req.params.id || "");
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT * FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Flow not found" });

    const nodes = parseJsonSafe(rows[0].nodes_json, []);
    const connections = normalizeConnections(parseJsonSafe(rows[0].connections_json, []));
    const trigger = nodes.find((n: any) => n.type === "trigger");
    if (!trigger) return res.status(400).json({ error: "Sem trigger" });

    const steps: Array<{ node_id: string; label: string; type: string; subtype: string }> = [];
    const visited = new Set<string>();
    let current: string | null = trigger.id;
    let guard = 0;
    while (current && guard++ < 50) {
      if (visited.has(current)) {
        steps.push({
          node_id: current,
          label: "LOOP DETECTADO",
          type: "error",
          subtype: "loop",
        });
        break;
      }
      visited.add(current);
      const node = nodes.find((n: any) => n.id === current);
      if (!node) break;
      steps.push({
        node_id: node.id,
        label: node.label || node.subtype,
        type: node.type,
        subtype: node.subtype,
      });
      if (node.type === "end" || isWaitLike(node)) break;
      const handle =
        node.type === "condition" ? "yes" : "main";
      const next = connections.find(
        (c: any) =>
          c.from === current &&
          (normalizeHandle(c.fromHandle) === handle || normalizeHandle(c.fromHandle) === "main")
      );
      current = next?.to || null;
    }

    return res.json({ success: true, steps, node_count: nodes.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

function isWaitLike(node: any): boolean {
  const t = String(node?.type || "");
  const s = String(node?.subtype || "");
  return (
    t === "wait" ||
    t === "collect" ||
    /wait_reply|collect_|input_|aguardar|coleta/i.test(s)
  );
}

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

import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { InstanceManager } from "../core/instanceManager";
import { logger } from "../utils/logger";
import { getNotificationService } from "./notifications";
import { ensureFlowSchema } from "./flowSchema";
import {
  extractInteractiveOptions,
  isCollectNode,
  isHandoffNode,
  isWaitNode,
  matchInteractiveOption,
  parseInteractiveInbound,
  resolveNextConnections,
  type FlowConnection as FConn,
  type FlowExecutionStatus as ExecutionStatus,
  type FlowNode as FNode,
} from "./flowTypes";

type NodeStepLog = {
  node_id: string;
  node_type: FNode["type"];
  node_subtype: string;
  output_handle: string | null;
  output: Record<string, any>;
  output_schema: Record<string, string>;
  at: string;
};

type NodeTimelineStep = {
  step_index: number;
  node_id: string;
  node_subtype: string;
  output_handle: string | null;
  output: Record<string, any>;
  output_schema: Record<string, string>;
  context_snapshot: Record<string, any>;
  at: string;
};

type ExecutionSnapshot = {
  execution_id: string;
  flow_id: string;
  user_id: string;
  trigger_subtype: string;
  system_vars: Record<string, any>;
  context: Record<string, any>;
  node_outputs: Record<string, Record<string, any>>;
  node_output_schema: Record<string, Record<string, string>>;
  steps_output: Record<string, NodeStepLog>;
  steps_timeline: NodeTimelineStep[];
  debug_log: string[];
  status: ExecutionStatus;
};

interface ExecContext {
  flowId: string;
  userId: string;
  brandId?: string | null;
  instanceId?: string;
  publishedVersion?: number;
  nodes: FNode[];
  connections: FConn[];
  sessionId?: string;
  execution: ExecutionSnapshot;
  /** When resuming, the inbound message that unlocked wait/collect */
  inboundMessage?: string;
}

export class FlowExecutorService {
  private static _inst: FlowExecutorService;
  private tableReady = false;

  constructor(private instanceManager: InstanceManager) {}

  private readonly notificationService = getNotificationService();

  static init(im: InstanceManager): FlowExecutorService {
    FlowExecutorService._inst = new FlowExecutorService(im);
    return FlowExecutorService._inst;
  }

  static get(): FlowExecutorService {
    if (!FlowExecutorService._inst) throw new Error("FlowExecutorService not initialized");
    return FlowExecutorService._inst;
  }

  /**
   * Contato já está em jornada estruturada — cognitivo/auto-reply deve ceder.
   */
  async hasActiveSessionForContact(
    userId: string,
    phone: string
  ): Promise<boolean> {
    const contactKey = this.normalizeContactKey(phone);
    if (!contactKey) return false;
    try {
      await this.ensureTables();
      const [rows] = await getPool().query<any[]>(
        `SELECT id FROM flow_sessions
         WHERE user_id = ?
           AND contact_key = ?
           AND status IN ('waiting_user','waiting_agent','running','paused')
         LIMIT 1`,
        [userId, contactKey]
      );
      return Boolean(rows[0]);
    } catch {
      return false;
    }
  }

  /**
   * Entrada principal para mensagens inbound: retoma sessão waiting_user
   * antes de disparar novos fluxos por gatilho.
   * claimed=true quando a jornada "tomou" o contato (resume ou fire com match).
   */
  async handleInboundMessage(input: {
    userId: string;
    brandId?: string | null;
    phone: string;
    message: string;
    instanceId?: string;
  }): Promise<{ resumed: boolean; fired: boolean; claimed: boolean; started: number }> {
    const contactKey = this.normalizeContactKey(input.phone);
    if (!contactKey) {
      return { resumed: false, fired: false, claimed: false, started: 0 };
    }

    const resumed = await this.resumeWaitingSession({
      userId: input.userId,
      brandId: input.brandId,
      contactKey,
      message: input.message,
      instanceId: input.instanceId,
    });

    if (resumed) {
      return { resumed: true, fired: false, claimed: true, started: 0 };
    }

    const started = await this.fire("message_received", input.userId, {
      phone: input.phone,
      message: input.message,
      brandId: input.brandId,
      instanceId: input.instanceId,
    });
    return {
      resumed: false,
      fired: started > 0,
      claimed: started > 0,
      started,
    };
  }

  /**
   * Inicia um fluxo específico (Automação / Campanha / teste manual).
   * Usa snapshot publicado; ignora filtro de palavra-chave do trigger.
   */
  async startFlowById(input: {
    flowId: string;
    userId: string;
    brandId?: string | null;
    phone?: string;
    message?: string;
    name?: string;
    instanceId?: string;
    triggerSubtype?: string;
    source?: string;
    requireActive?: boolean;
  }): Promise<{ ok: boolean; executionId?: string; error?: string }> {
    try {
      await this.ensureTables();
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM flow_automations WHERE id = ? AND user_id = ? LIMIT 1",
        [input.flowId, input.userId]
      );
      const row = rows[0];
      if (!row) return { ok: false, error: "Fluxo não encontrado" };

      if (input.requireActive !== false && row.status !== "active") {
        return { ok: false, error: "Fluxo não está ativo — publique e ative" };
      }

      const contactKey = this.normalizeContactKey(String(input.phone || ""));
      if (contactKey) {
        const busy = await this.hasActiveSessionForContact(input.userId, contactKey);
        if (busy) {
          return { ok: false, error: "Contato já possui sessão de fluxo ativa" };
        }
      }

      const { nodes, connections, version } = this.resolveRuntimeGraph(row);
      if (!nodes.length) return { ok: false, error: "Fluxo sem blocos publicados" };

      const startNode =
        nodes.find((n) => n.type === "trigger") || nodes[0];
      const triggerSubtype = String(
        input.triggerSubtype || startNode.subtype || input.source || "manual"
      );

      const triggerData: Record<string, any> = {
        phone: input.phone || "",
        message: input.message || "",
        name: input.name || "",
        brandId: input.brandId || row.brand_id,
        instanceId: input.instanceId,
        source: input.source || "start_flow",
      };

      const execution = this.createExecutionSnapshot({
        flowId: row.id,
        userId: input.userId,
        triggerSubtype,
        triggerData,
      });
      execution.context.source = input.source || "start_flow";
      execution.debug_log.push(
        `[${new Date().toISOString()}] startFlowById source=${input.source || "manual"}`
      );

      const ctx: ExecContext = {
        flowId: row.id,
        userId: input.userId,
        brandId: row.brand_id || input.brandId || null,
        publishedVersion: version,
        nodes,
        connections,
        instanceId: input.instanceId,
        execution,
      };

      await this.insertExecution(ctx.execution);
      if (!ctx.instanceId) ctx.instanceId = await this.resolveInstance(input.userId);

      this.runFrom(startNode.id, ctx)
        .then(async () => {
          if (
            ctx.execution.status === "waiting_user" ||
            ctx.execution.status === "waiting_agent"
          ) {
            await this.persistExecution(ctx.execution, null, false);
            return;
          }
          ctx.execution.status = "completed";
          ctx.execution.debug_log.push(
            `[${new Date().toISOString()}] Flow finished successfully`
          );
          await this.persistExecution(ctx.execution, null, true);
          await this.completeSessionsForExecution(ctx.execution.execution_id, "completed");
        })
        .catch(async (err: any) => {
          ctx.execution.status = "failed";
          await this.persistExecution(ctx.execution, String(err?.message || err), true);
          await this.completeSessionsForExecution(ctx.execution.execution_id, "failed");
          logger.error(`FlowExecutor.startFlowById error: ${err?.message || err}`);
        });

      return { ok: true, executionId: execution.execution_id };
    } catch (err: any) {
      logger.error(`FlowExecutor.startFlowById: ${err?.message || err}`);
      return { ok: false, error: String(err?.message || err) };
    }
  }

  async fire(
    triggerSubtype: string,
    userId: string,
    triggerData: Record<string, any>
  ): Promise<number> {
    let started = 0;
    try {
      await this.ensureTables();
      const pool = getPool();
      const brandId = triggerData.brandId ? String(triggerData.brandId) : null;
      const contactKey = this.normalizeContactKey(
        String(triggerData.phone || triggerData.contactKey || "")
      );

      // Concorrência: se já há sessão waiting para o contato, não inicia novo fluxo reativo
      if (contactKey && triggerSubtype === "message_received") {
        const [waiting] = await pool.query<any[]>(
          `SELECT id FROM flow_sessions
           WHERE user_id = ? AND contact_key = ? AND status = 'waiting_user'
           LIMIT 1`,
          [userId, contactKey]
        );
        if (waiting[0]) {
          logger.debug(`FlowExecutor.fire skip — session already waiting ${waiting[0].id}`);
          return 0;
        }
      }

      const [rows] = await pool.query<any[]>(
        "SELECT * FROM flow_automations WHERE user_id = ? AND status = 'active'",
        [userId]
      );

      for (const row of rows) {
        if (brandId && row.brand_id && String(row.brand_id) !== brandId) continue;

        const { nodes, connections, version } = this.resolveRuntimeGraph(row);
        const triggers = nodes.filter(
          (n) => n.type === "trigger" && n.subtype === triggerSubtype
        );

        for (const trigger of triggers) {
          // Keyword filter opcional no trigger
          if (triggerSubtype === "message_received") {
            const keywords = this.parseKeywords(trigger.data);
            if (keywords.length > 0) {
              const msg = String(triggerData.message || "").toLowerCase();
              const hit = keywords.some((k) => msg.includes(k.toLowerCase()));
              if (!hit) continue;
            }
          }

          const execution = this.createExecutionSnapshot({
            flowId: row.id,
            userId,
            triggerSubtype,
            triggerData,
          });

          const ctx: ExecContext = {
            flowId: row.id,
            userId,
            brandId: row.brand_id || brandId,
            publishedVersion: version,
            nodes,
            connections,
            instanceId: triggerData.instanceId
              ? String(triggerData.instanceId)
              : undefined,
            execution,
          };

          await this.insertExecution(ctx.execution);
          if (!ctx.instanceId) ctx.instanceId = await this.resolveInstance(userId);
          started += 1;

          this.runFrom(trigger.id, ctx)
            .then(async () => {
              if (ctx.execution.status === "waiting_user" || ctx.execution.status === "waiting_agent") {
                await this.persistExecution(ctx.execution, null, false);
                return;
              }
              ctx.execution.status = "completed";
              ctx.execution.debug_log.push(
                `[${new Date().toISOString()}] Flow finished successfully`
              );
              await this.persistExecution(ctx.execution, null, true);
              await this.completeSessionsForExecution(ctx.execution.execution_id, "completed");
            })
            .catch(async (err: any) => {
              ctx.execution.status = "failed";
              ctx.execution.debug_log.push(
                `[${new Date().toISOString()}] Flow failed: ${String(err?.message || err)}`
              );
              await this.persistExecution(ctx.execution, String(err?.message || err), true);
              await this.completeSessionsForExecution(ctx.execution.execution_id, "failed");
              logger.error(`FlowExecutor error in flow ${row.id}: ${err.message}`);
            });
        }
      }
    } catch (err: any) {
      logger.error(`FlowExecutor.fire error: ${err.message}`);
    }
    return started;
  }

  private resolveRuntimeGraph(row: any): {
    nodes: FNode[];
    connections: FConn[];
    version: number;
  } {
    const version = Number(row.published_version || 0);
    const usePublished =
      version > 0 && (row.published_nodes_json != null || row.published_connections_json != null);

    const nodesRaw = usePublished
      ? row.published_nodes_json ?? row.nodes_json
      : row.nodes_json;
    const connsRaw = usePublished
      ? row.published_connections_json ?? row.connections_json
      : row.connections_json;

    const nodes: FNode[] =
      typeof nodesRaw === "string" ? JSON.parse(nodesRaw) : nodesRaw ?? [];
    const connections: FConn[] =
      typeof connsRaw === "string" ? JSON.parse(connsRaw) : connsRaw ?? [];

    return { nodes, connections, version: usePublished ? version : 0 };
  }

  private parseKeywords(data: Record<string, any> | undefined): string[] {
    if (!data) return [];
    if (Array.isArray(data.keywords)) {
      return data.keywords.map((k: any) => String(k).trim()).filter(Boolean);
    }
    const raw = String(data.keyword || data.keywords || data.palavra_chave || "").trim();
    if (!raw) return [];
    return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }

  private normalizeContactKey(phone: string): string {
    return String(phone || "").replace(/\D/g, "").slice(-15);
  }

  private async resumeWaitingSession(input: {
    userId: string;
    brandId?: string | null;
    contactKey: string;
    message: string;
    instanceId?: string;
  }): Promise<boolean> {
    await this.ensureTables();
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM flow_sessions
       WHERE user_id = ? AND contact_key = ? AND status = 'waiting_user'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.userId, input.contactKey]
    );
    const session = rows[0];
    if (!session) return false;

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      await pool.execute(
        `UPDATE flow_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [session.id]
      );
      return false;
    }

    const nodes: FNode[] =
      typeof session.nodes_snapshot_json === "string"
        ? JSON.parse(session.nodes_snapshot_json)
        : session.nodes_snapshot_json ?? [];
    const connections: FConn[] =
      typeof session.connections_snapshot_json === "string"
        ? JSON.parse(session.connections_snapshot_json)
        : session.connections_snapshot_json ?? [];

    const waitingNodeId = String(session.waiting_node_id || session.current_node_id || "");
    const waitingNode = nodes.find((n) => n.id === waitingNodeId);
    if (!waitingNode) {
      await pool.execute(
        `UPDATE flow_sessions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [session.id]
      );
      return false;
    }

    const [execRows] = await pool.query<any[]>(
      `SELECT * FROM flow_automation_executions WHERE id = ? LIMIT 1`,
      [session.execution_id]
    );
    const execRow = execRows[0];
    if (!execRow) return false;

    const execution: ExecutionSnapshot = {
      execution_id: execRow.id,
      flow_id: execRow.flow_id,
      user_id: execRow.user_id,
      trigger_subtype: execRow.trigger_subtype,
      system_vars:
        typeof execRow.system_vars_json === "string"
          ? JSON.parse(execRow.system_vars_json)
          : execRow.system_vars_json || {},
      context:
        typeof execRow.context_json === "string"
          ? JSON.parse(execRow.context_json)
          : execRow.context_json || {},
      node_outputs:
        typeof execRow.node_outputs_json === "string"
          ? JSON.parse(execRow.node_outputs_json)
          : execRow.node_outputs_json || {},
      node_output_schema:
        typeof execRow.node_output_schema_json === "string"
          ? JSON.parse(execRow.node_output_schema_json)
          : execRow.node_output_schema_json || {},
      steps_output:
        typeof execRow.steps_output_json === "string"
          ? JSON.parse(execRow.steps_output_json)
          : execRow.steps_output_json || {},
      steps_timeline:
        typeof execRow.steps_timeline_json === "string"
          ? JSON.parse(execRow.steps_timeline_json)
          : execRow.steps_timeline_json || [],
      debug_log:
        typeof execRow.debug_log_json === "string"
          ? JSON.parse(execRow.debug_log_json)
          : execRow.debug_log_json || [],
      status: "running",
    };

    // Merge session context (more recent)
    const sessionCtx =
      typeof session.context_json === "string"
        ? JSON.parse(session.context_json)
        : session.context_json || {};
    execution.context = { ...execution.context, ...sessionCtx };
    execution.system_vars = {
      ...execution.system_vars,
      ...(typeof session.system_vars_json === "string"
        ? JSON.parse(session.system_vars_json)
        : session.system_vars_json || {}),
    };
    if (execution.system_vars.customer) {
      execution.system_vars.customer.phone =
        execution.system_vars.customer.phone || input.contactKey;
    }

    execution.debug_log.push(
      `[${new Date().toISOString()}] Resume session ${session.id} on node ${waitingNodeId}`
    );

    const ctx: ExecContext = {
      flowId: session.flow_id,
      userId: input.userId,
      brandId: session.brand_id || input.brandId,
      publishedVersion: Number(session.published_version || 0),
      nodes,
      connections,
      sessionId: session.id,
      instanceId: input.instanceId || session.instance_id || undefined,
      inboundMessage: input.message,
      execution,
    };

    await pool.execute(
      `UPDATE flow_sessions
       SET status = 'running', last_inbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [session.id]
    );
    await this.persistExecution(execution, null, false);

    // Process waiting node with inbound message, then continue
    this.continueAfterWait(waitingNode, ctx)
      .then(async () => {
        if (ctx.execution.status === "waiting_user" || ctx.execution.status === "waiting_agent") {
          await this.persistExecution(ctx.execution, null, false);
          return;
        }
        ctx.execution.status = "completed";
        ctx.execution.debug_log.push(`[${new Date().toISOString()}] Flow finished after resume`);
        await this.persistExecution(ctx.execution, null, true);
        await this.completeSessionsForExecution(ctx.execution.execution_id, "completed");
      })
      .catch(async (err: any) => {
        ctx.execution.status = "failed";
        await this.persistExecution(ctx.execution, String(err?.message || err), true);
        await this.completeSessionsForExecution(ctx.execution.execution_id, "failed");
        logger.error(`FlowExecutor resume error: ${err?.message || err}`);
      });

    return true;
  }

  private async continueAfterWait(node: FNode, ctx: ExecContext): Promise<void> {
    const result = await this.processWaitOrCollect(node, ctx, true);
    this.registerNodeOutput(node, result.output, result.handle, ctx);

    if (result.handle === null) return;

    const next = resolveNextConnections(ctx.connections, node.id, result.handle);
    for (const conn of next) {
      await this.runFrom(conn.to, ctx);
    }
  }

  private async runFrom(nodeId: string, ctx: ExecContext): Promise<void> {
    const node = ctx.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Loop guard
    const path = (ctx.execution.context.__path as string[]) || [];
    if (path.filter((id) => id === nodeId).length >= 3) {
      ctx.execution.debug_log.push(
        `[${new Date().toISOString()}] Loop guard stopped at ${nodeId}`
      );
      ctx.execution.status = "failed";
      throw new Error(`Loop detectado no nó ${nodeId}`);
    }
    ctx.execution.context.__path = [...path, nodeId];

    const result = await this.processNode(node, ctx);
    this.registerNodeOutput(node, result.output, result.handle, ctx);

    if (result.handle === null) return;

    const next = resolveNextConnections(ctx.connections, nodeId, result.handle);
    for (const conn of next) {
      await this.runFrom(conn.to, ctx);
    }
  }

  private async processNode(
    node: FNode,
    ctx: ExecContext
  ): Promise<{ handle: string | null; output: Record<string, any> }> {
    if (isWaitNode(node) || isCollectNode(node)) {
      return this.processWaitOrCollect(node, ctx, false);
    }

    if (isHandoffNode(node) || node.subtype === "handoff_agent") {
      return this.processHandoff(node, ctx);
    }

    switch (node.type) {
      case "trigger":
      case "destination":
        return { handle: "main", output: { ok: true } };

      case "delay": {
        const waitedMs = await this.handleDelay(node);
        return { handle: "main", output: { waited_ms: waitedMs } };
      }

      case "action": {
        const output = await this.handleAction(node, ctx);
        // Mensagem com botões/lista: pausa para resposta interativa
        if (
          (node.subtype === "send_message" || node.subtype === "send_template") &&
          this.shouldWaitAfterMessage(node.data || {})
        ) {
          await this.parkSession(node, ctx);
          ctx.execution.status = "waiting_user";
          ctx.execution.debug_log.push(
            `[${new Date().toISOString()}] Waiting interactive reply after ${node.id}`
          );
          return {
            handle: null,
            output: { ...output, waiting_interactive: true },
          };
        }
        return { handle: "main", output };
      }

      case "condition": {
        const out = this.evaluateCondition(node, ctx);
        return { handle: out, output: { result: out === "yes", branch: out } };
      }

      case "end":
        return { handle: null, output: { ended: true, reason: node.subtype || "end" } };

      default:
        if (node.subtype === "send_message" || node.subtype === "ai_message") {
          const output = await this.handleAction(node, ctx);
          return { handle: "main", output };
        }
        return { handle: "main", output: { ok: true } };
    }
  }

  private shouldWaitAfterMessage(data: Record<string, any>): boolean {
    if (data.wait_for_reply === false || data.waitForReply === false) return false;
    if (data.wait_for_reply === true || data.waitForReply === true) return true;
    return extractInteractiveOptions(data).length > 0;
  }

  private async processWaitOrCollect(
    node: FNode,
    ctx: ExecContext,
    hasInbound: boolean
  ): Promise<{ handle: string | null; output: Record<string, any> }> {
    const prompt = String(
      node.data?.prompt || node.data?.message || node.data?.pergunta || ""
    ).trim();
    const options = extractInteractiveOptions(node.data || {});
    const isButtonWait =
      String(node.subtype || "").includes("button") ||
      String(node.subtype || "").includes("choice") ||
      String(node.subtype || "").includes("botao") ||
      (node.type === "action" && options.length > 0);

    if (!hasInbound) {
      if (prompt || options.length) {
        await this.sendWhatsApp(ctx, this.interpolate(prompt || "Escolha uma opção:", ctx), {
          ...(node.data || {}),
          // force options onto data for send path
          options: options.length ? options : node.data?.options,
        });
      }
      await this.parkSession(node, ctx);
      ctx.execution.status = "waiting_user";
      ctx.execution.debug_log.push(
        `[${new Date().toISOString()}] Waiting user at node ${node.id} (${node.subtype})`
      );
      return {
        handle: null,
        output: { waiting: true, node_id: node.id, subtype: node.subtype, options },
      };
    }

    const raw = String(ctx.inboundMessage || "").trim();
    const variableName = String(
      node.data?.variable_name || node.data?.field || node.data?.campo || "user_reply"
    ).trim();
    const fieldType = String(node.data?.field_type || node.subtype || "text");
    const inbound = parseInteractiveInbound(raw);

    // Interactive / button path
    if (isButtonWait || options.length > 0 || inbound.kind !== "text") {
      const match = matchInteractiveOption(inbound, options);
      if (!match.matched && options.length > 0) {
        const attempts = Number(ctx.execution.context.__attempts?.[node.id] || 0) + 1;
        ctx.execution.context.__attempts = {
          ...(ctx.execution.context.__attempts || {}),
          [node.id]: attempts,
        };
        const maxAttempts = Number(node.data?.max_attempts ?? 3);
        await this.sendWhatsApp(
          ctx,
          String(node.data?.error_message || "Opção inválida. Escolha uma das opções."),
          node.data || {}
        );
        if (attempts >= maxAttempts) {
          return {
            handle: "invalid",
            output: { valid: false, value: raw, attempts, exhausted: true },
          };
        }
        await this.parkSession(node, ctx);
        ctx.execution.status = "waiting_user";
        return { handle: null, output: { valid: false, value: raw, attempts, re_waiting: true } };
      }

      const value = match.matched
        ? { id: match.matched.id, label: match.matched.label }
        : { id: inbound.id, label: inbound.label, raw };
      ctx.execution.context[variableName] = value;
      ctx.execution.context.last_choice = value;
      return {
        handle: match.handle === "invalid" ? "main" : match.handle,
        output: { valid: true, variable: variableName, value, interactive: inbound },
      };
    }

    const validation = this.validateCollectedValue(raw, fieldType, node.data || {});
    if (!validation.ok) {
      const attempts = Number(ctx.execution.context.__attempts?.[node.id] || 0) + 1;
      ctx.execution.context.__attempts = {
        ...(ctx.execution.context.__attempts || {}),
        [node.id]: attempts,
      };
      const maxAttempts = Number(node.data?.max_attempts ?? 3);
      const errMsg = String(
        node.data?.error_message || validation.error || "Resposta inválida. Tente novamente."
      );
      await this.sendWhatsApp(ctx, errMsg, node.data || {});

      if (attempts >= maxAttempts) {
        return {
          handle: "invalid",
          output: { valid: false, value: raw, attempts, exhausted: true },
        };
      }

      await this.parkSession(node, ctx);
      ctx.execution.status = "waiting_user";
      return {
        handle: null,
        output: { valid: false, value: raw, attempts, re_waiting: true },
      };
    }

    ctx.execution.context[variableName] = validation.value;
    if (ctx.execution.system_vars?.customer && variableName === "name") {
      ctx.execution.system_vars.customer.name = String(validation.value);
      ctx.execution.system_vars.customer.nome = String(validation.value);
    }
    if (ctx.execution.system_vars?.customer && variableName === "email") {
      (ctx.execution.system_vars.customer as any).email = String(validation.value);
    }

    // collect_confirm → yes/no branches
    if (String(fieldType).includes("confirm") || node.subtype === "collect_confirm") {
      const yes = validation.value === true || validation.value === "yes" || validation.value === "sim";
      return {
        handle: yes ? "yes" : "no",
        output: { valid: true, variable: variableName, value: validation.value, branch: yes ? "yes" : "no" },
      };
    }

    return {
      handle: "main",
      output: { valid: true, variable: variableName, value: validation.value },
    };
  }

  private validateCollectedValue(
    raw: string,
    fieldType: string,
    data: Record<string, any>
  ): { ok: boolean; value: any; error?: string } {
    const t = fieldType.toLowerCase();
    if (!raw && data.required !== false) {
      return { ok: false, value: raw, error: "Campo obrigatório." };
    }
    if (t.includes("email")) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
      return ok
        ? { ok: true, value: raw }
        : { ok: false, value: raw, error: "Informe um e-mail válido." };
    }
    if (t.includes("phone") || t.includes("telefone")) {
      const digits = raw.replace(/\D/g, "");
      const ok = digits.length >= 10 && digits.length <= 15;
      return ok
        ? { ok: true, value: digits }
        : { ok: false, value: raw, error: "Informe um telefone válido com DDD." };
    }
    if (t.includes("number") || t.includes("quantidade") || t.includes("number")) {
      const n = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) {
        return { ok: false, value: raw, error: "Informe um número válido." };
      }
      return { ok: true, value: n };
    }
    if (t.includes("confirm")) {
      const v = raw.toLowerCase();
      const yes = /^(s|sim|yes|ok|confirmo|1)$/i.test(v);
      const no = /^(n|nao|não|no|0)$/i.test(v);
      if (!yes && !no) {
        return { ok: false, value: raw, error: "Responda sim ou não." };
      }
      return { ok: true, value: yes };
    }
    return { ok: true, value: raw };
  }

  private async processHandoff(
    node: FNode,
    ctx: ExecContext
  ): Promise<{ handle: string | null; output: Record<string, any> }> {
    const summary = this.interpolate(
      String(node.data?.summary || "Cliente solicitou atendimento humano."),
      ctx
    );
    ctx.execution.context.handoff = {
      at: new Date().toISOString(),
      reason: node.data?.reason || "flow_handoff",
      summary,
      node_id: node.id,
    };
    ctx.execution.status = "waiting_agent";

    await this.sendWhatsApp(
      ctx,
      String(
        node.data?.user_message ||
          "Em instantes um atendente vai continuar seu atendimento. Obrigado!"
      ),
      node.data || {}
    );

    try {
      await this.notificationService.createNotification({
        user_id: ctx.userId,
        type: "support",
        event: "flow_handoff",
        title: "Fluxo: transferência humana",
        message: summary.slice(0, 400),
        priority: "high",
        channels: ["in_app"] as any,
        metadata: {
          flow_id: ctx.flowId,
          execution_id: ctx.execution.execution_id,
          contact: ctx.execution.system_vars?.customer?.phone,
        },
      });
    } catch {
      /* non-fatal */
    }

    if (ctx.sessionId) {
      const pool = getPool();
      await pool.execute(
        `UPDATE flow_sessions SET status = 'waiting_agent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [ctx.sessionId]
      );
    }

    return {
      handle: null,
      output: { handoff: true, summary },
    };
  }

  private async parkSession(node: FNode, ctx: ExecContext): Promise<void> {
    const pool = getPool();
    const contactKey = this.normalizeContactKey(
      String(ctx.execution.system_vars?.customer?.phone || "")
    );
    if (!contactKey) {
      logger.warn(`FlowExecutor parkSession: missing contact phone on flow ${ctx.flowId}`);
      return;
    }

    const timeoutMin = Number(node.data?.timeout_minutes ?? 1440);
    const expiresAt =
      Number.isFinite(timeoutMin) && timeoutMin > 0
        ? new Date(Date.now() + timeoutMin * 60_000)
        : null;

    const sessionId = ctx.sessionId || `fs_${randomUUID()}`;
    ctx.sessionId = sessionId;

    await pool.execute(
      `INSERT INTO flow_sessions (
        id, flow_id, execution_id, user_id, brand_id, contact_key, channel, status,
        published_version, current_node_id, waiting_node_id,
        context_json, system_vars_json, nodes_snapshot_json, connections_snapshot_json,
        instance_id, attempts, max_attempts, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'whatsapp', 'waiting_user', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        status = 'waiting_user',
        waiting_node_id = EXCLUDED.waiting_node_id,
        current_node_id = EXCLUDED.current_node_id,
        context_json = EXCLUDED.context_json,
        system_vars_json = EXCLUDED.system_vars_json,
        attempts = EXCLUDED.attempts,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP`,
      [
        sessionId,
        ctx.flowId,
        ctx.execution.execution_id,
        ctx.userId,
        ctx.brandId || null,
        contactKey,
        ctx.publishedVersion || 0,
        node.id,
        node.id,
        JSON.stringify(ctx.execution.context || {}),
        JSON.stringify(ctx.execution.system_vars || {}),
        JSON.stringify(ctx.nodes),
        JSON.stringify(ctx.connections),
        ctx.instanceId || null,
        Number(node.data?.max_attempts ?? 3),
        expiresAt,
      ]
    );
  }

  private async completeSessionsForExecution(
    executionId: string,
    status: string
  ): Promise<void> {
    try {
      await getPool().execute(
        `UPDATE flow_sessions
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE execution_id = ? AND status IN ('running','waiting_user','waiting_agent','paused')`,
        [status, executionId]
      );
    } catch {
      /* ignore */
    }
  }

  /** Prefer mensagemSteps (MessagePipelineComposer) then plain message. */
  private resolveMessageBody(data: Record<string, any>): string {
    const steps = Array.isArray(data.mensagemSteps) ? data.mensagemSteps : [];
    if (steps.length > 0) {
      const parts = steps
        .map((step: any) => {
          const tipo = String(step?.tipo || "");
          if (tipo === "texto" || tipo === "cta" || tipo === "link") {
            return String(step.caption || step.url || "").trim();
          }
          if (tipo === "botoes") {
            const labels = Array.isArray(step.buttons)
              ? step.buttons.map((b: any) => b?.label).filter(Boolean).join(" | ")
              : "";
            return [String(step.caption || "").trim(), labels].filter(Boolean).join("\n");
          }
          if (tipo === "lista") {
            return String(step.caption || step.listButtonText || "Lista").trim();
          }
          if (tipo === "imagem" || tipo === "video" || tipo === "audio" || tipo === "documento") {
            return [String(step.caption || "").trim(), String(step.url || "").trim()]
              .filter(Boolean)
              .join("\n");
          }
          return String(step.caption || step.url || "").trim();
        })
        .filter(Boolean);
      if (parts.length) return parts.join("\n\n");
    }
    return String(data.message || "").trim();
  }

  private async handleDelay(node: FNode): Promise<number> {
    const { subtype, data } = node;
    let ms = 0;
    if (subtype === "wait_minutes") ms = Math.min(Number(data.minutes ?? 1) * 60_000, 30_000);
    else if (subtype === "wait_hours") ms = Math.min(Number(data.hours ?? 1) * 3_600_000, 30_000);
    else if (subtype === "wait_days") ms = Math.min(Number(data.days ?? 1) * 86_400_000, 30_000);

    ms = Number.isFinite(ms) && ms > 0 ? ms : 0;
    if (!ms) return 0;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ms;
  }

  private async handleAction(node: FNode, ctx: ExecContext): Promise<Record<string, any>> {
    const { subtype, data } = node;

    switch (subtype) {
      case "send_message":
      case "send_template":
      case "ai_message": {
        const sourceText =
          subtype === "ai_message"
            ? String(data.ai_instrucao || data.ai_instruction || data.message || "").trim()
            : this.resolveMessageBody(data);

        const message = this.interpolate(sourceText, ctx);
        const sendResult = await this.sendWhatsApp(ctx, message, data);

        return {
          text: message,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
          steps: Array.isArray(data.mensagemSteps) ? data.mensagemSteps.length : 0,
        };
      }

      case "send_image": {
        const imageUrl = this.interpolate(String(data.imageUrl || data.image_url || "").trim(), ctx);
        const caption = this.interpolate(String(data.caption || "").trim(), ctx);
        const textForSend = [caption, imageUrl].filter(Boolean).join("\n");
        const sendResult = await this.sendWhatsApp(ctx, textForSend, data);
        return {
          image_url: imageUrl,
          caption,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
        };
      }

      case "ai_generate_image": {
        const seed = encodeURIComponent(
          this.interpolate(String(data.image_prompt || data.prompt || "imagem promocional"), ctx)
        );
        const imageUrl = `https://dummyimage.com/1024x1024/0f172a/e2e8f0.png&text=${seed}`;
        const caption = this.interpolate(String(data.image_caption || ""), ctx);
        const sendResult = await this.sendWhatsApp(ctx, [caption, imageUrl].filter(Boolean).join("\n"), data);
        return {
          image_url: imageUrl,
          caption,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
        };
      }

      case "ai_generate_video": {
        const seed = encodeURIComponent(
          this.interpolate(String(data.video_prompt || data.prompt || "video"), ctx)
        );
        const videoUrl = `https://example.invalid/video/${seed}.mp4`;
        const caption = this.interpolate(String(data.video_caption || ""), ctx);
        const sendResult = await this.sendWhatsApp(ctx, [caption, videoUrl].filter(Boolean).join("\n"), data);
        return {
          video_url: videoUrl,
          caption,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
        };
      }

      case "send_audio": {
        const audioUrl = this.interpolate(String(data.audioUrl || data.audio_url || "").trim(), ctx);
        const sendResult = await this.sendWhatsApp(ctx, audioUrl, data);
        return {
          audio_url: audioUrl,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
        };
      }

      case "change_status": {
        if (data.status && ctx.execution.system_vars?.customer?.id) {
          await this.updateLeadField(ctx, "status", String(data.status));
        }
        return { status: String(data.status || "") };
      }

      case "add_tag": {
        if (data.tag && ctx.execution.system_vars?.customer?.id) {
          await this.addTag(ctx, String(data.tag));
        }
        return { tag_added: String(data.tag || "") };
      }

      case "remove_tag": {
        if (data.tag && ctx.execution.system_vars?.customer?.id) {
          await this.removeTag(ctx, String(data.tag));
        }
        return { tag_removed: String(data.tag || "") };
      }

      case "update_score": {
        const delta = Number(data.delta ?? 0);
        if (delta !== 0 && ctx.execution.system_vars?.customer?.id) {
          const pool = getPool();
          await pool.execute(
            "UPDATE clients SET lead_score = GREATEST(0, LEAST(100, COALESCE(lead_score,0) + ?)) WHERE id = ? AND user_id = ?",
            [delta, ctx.execution.system_vars.customer.id, ctx.userId]
          );
        }
        return { score_delta: delta };
      }

      case "webhook": {
        return this.executeWebhook(node, ctx);
      }

      case "send_notification": {
        const type = String(data.notification_type || "system").trim().toLowerCase();
        const priority = String(data.priority || "medium").trim().toLowerCase();
        const title = this.interpolate(String(data.title || "Notificação"), ctx).slice(0, 190);
        const message = this.interpolate(String(data.message || ""), ctx);
        const event = String(data.event || "flow_notification").trim() || "flow_notification";
        const targetUser = String(data.target_user_id || ctx.userId).trim() || ctx.userId;

        const channels = String(data.channels_csv || "in_app")
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);

        const notification = await this.notificationService.createNotification({
          user_id: targetUser,
          type: ["system", "user", "support"].includes(type) ? (type as any) : "system",
          event,
          title,
          message,
          priority: ["low", "medium", "high", "critical"].includes(priority) ? (priority as any) : "medium",
          channels: channels as any,
          store_id: data.store_id ? this.interpolate(String(data.store_id), ctx) : undefined,
          metadata: {
            flow_id: ctx.flowId,
            execution_id: ctx.execution.execution_id,
            node_id: node.id,
            node_subtype: node.subtype,
          },
        });

        return {
          notification_id: notification.notification_id,
          target_user_id: targetUser,
          priority: notification.priority,
          channels: notification.channels,
        };
      }

      case "set_variable": {
        const variableName = String(data.variable_name || data.variable || "").trim();
        const rendered = this.interpolate(String(data.value_template || data.value || ""), ctx);
        let parsed: any = rendered;
        try {
          if (rendered.startsWith("{") || rendered.startsWith("[")) {
            parsed = JSON.parse(rendered);
          }
        } catch {
          parsed = rendered;
        }

        if (variableName) {
          ctx.execution.context[variableName] = parsed;
        }

        return { variable: variableName, value: parsed };
      }

      case "transform_data": {
        return this.transformData(node, ctx);
      }

      case "notify_team":
        logger.info(`FlowExecutor [notify_team]: user=${ctx.userId} msg="${data.message ?? ""}"`);
        return { notified: true, message: String(data.message || "") };

      default:
        logger.debug(`FlowExecutor: unhandled action subtype "${subtype}"`);
        return { ok: true, subtype };
    }
  }

  private evaluateCondition(node: FNode, ctx: ExecContext): string {
    const { subtype, data } = node;

    const system = ctx.execution.system_vars || {};
    const customer = system.customer || {};
    const order = system.order || {};

    switch (subtype) {
      case "score_check": {
        const score = Number(customer.lead_score ?? customer.score ?? 0);
        const threshold = Number(this.resolveValue(data.threshold, ctx) ?? 70);
        return score >= threshold ? "yes" : "no";
      }

      case "city_check": {
        const city = String(customer.city ?? "").toLowerCase();
        const expected = String(this.resolveValue(data.city, ctx) ?? "").toLowerCase();
        return city && expected && city === expected ? "yes" : "no";
      }

      case "tag_check": {
        const tags: string[] = Array.isArray(customer.tags)
          ? customer.tags.map((item: any) => String(item).toLowerCase())
          : [];
        const expected = String(this.resolveValue(data.tag, ctx) ?? "").toLowerCase();
        return expected && tags.some((tag) => tag.includes(expected)) ? "yes" : "no";
      }

      case "payment_check": {
        const method = String(order.payment_method || order.forma_pagamento || "");
        const expected = String(this.resolveValue(data.method, ctx) ?? "");
        return method === expected ? "yes" : "no";
      }

      case "value_check": {
        const val = Number(order.total ?? order.valor_total ?? 0);
        const threshold = Number(this.resolveValue(data.value, ctx) ?? 0);
        return val >= threshold ? "yes" : "no";
      }

      case "status_check": {
        const current = String(customer.status || "").toLowerCase();
        const expected = String(this.resolveValue(data.status, ctx) || "").toLowerCase();
        return current && expected && current === expected ? "yes" : "no";
      }

      case "custom_expr": {
        try {
          const expr = String(data.expr || "").trim();
          if (!expr) return "no";
          // eslint-disable-next-line no-new-func
          const fn = new Function("vars", "context", "node", `return !!(${expr});`);
          const ok = fn(system, ctx.execution.context, ctx.execution.node_outputs);
          return ok ? "yes" : "no";
        } catch {
          return "no";
        }
      }

      default:
        return "yes";
    }
  }

  private async sendWhatsApp(
    ctx: ExecContext,
    template: string,
    data: Record<string, any>
  ): Promise<{ sent: boolean; destination: string; transport: string }> {
    let message = this.interpolate(template, ctx);
    const options = extractInteractiveOptions(data);
    // Body for buttons: prefer plain text without "label1 | label2" dump when options exist
    if (options.length && !String(template || "").trim()) {
      message = "Escolha uma opção:";
    }
    if (!message.trim() && !options.length) {
      return { sent: false, destination: "", transport: "empty" };
    }

    const destType: string = String(data.wa_destino || "lead");
    if (destType === "grupo_especifico" && data.wa_grupo_jid) {
      if (!ctx.instanceId) return { sent: false, destination: "", transport: "missing_instance" };
      try {
        if (options.length && typeof (this.instanceManager as any).sendButtonsByJid === "function") {
          const r = await this.instanceManager.sendButtonsByJid(
            ctx.instanceId,
            String(data.wa_grupo_jid),
            {
              body: message || "Escolha:",
              buttons: options.slice(0, 3).map((o) => ({ id: o.id, text: o.label })),
            }
          );
          return {
            sent: !!r?.ok,
            destination: String(data.wa_grupo_jid),
            transport: r?.mode || "group_buttons",
          };
        }
        await this.instanceManager.sendMessageByJid(ctx.instanceId, String(data.wa_grupo_jid), message);
        return { sent: true, destination: String(data.wa_grupo_jid), transport: "group_jid" };
      } catch (err: any) {
        logger.warn(`FlowExecutor sendGroup: ${err.message}`);
        return { sent: false, destination: String(data.wa_grupo_jid), transport: "group_jid" };
      }
    }

    const phone = String(ctx.execution.system_vars?.customer?.phone || "").trim();
    if (!phone || !ctx.instanceId) {
      return { sent: false, destination: phone || "", transport: "missing_phone_or_instance" };
    }

    try {
      if (options.length && typeof (this.instanceManager as any).sendButtonsByJid === "function") {
        const jid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
        // Prefer caption-only body for buttons (avoid appending option labels twice)
        const bodyOnly = this.interpolate(
          String(
            data.prompt ||
              (Array.isArray(data.mensagemSteps)
                ? data.mensagemSteps.find((s: any) => s?.tipo === "botoes" || s?.tipo === "texto")?.caption
                : "") ||
              message
          ),
          ctx
        );
        const r = await this.instanceManager.sendButtonsByJid(ctx.instanceId, jid, {
          body: (bodyOnly || message || "Escolha:").split("\n")[0] || "Escolha:",
          buttons: options.slice(0, 3).map((o) => ({ id: o.id, text: o.label.slice(0, 20) })),
        });
        return { sent: !!r?.ok, destination: phone, transport: r?.mode || "buttons" };
      }
      const sent = await this.instanceManager.sendMessage(ctx.instanceId, phone, message);
      return { sent: !!sent, destination: phone, transport: "lead_phone" };
    } catch (err: any) {
      logger.warn(`FlowExecutor sendMessage: ${err.message}`);
      return { sent: false, destination: phone, transport: "lead_phone" };
    }
  }

  private async executeWebhook(node: FNode, ctx: ExecContext): Promise<Record<string, any>> {
    const data = node.data || {};
    const method = String(data.method || "POST").toUpperCase();
    const url = this.interpolate(String(data.url || "").trim(), ctx);

    if (!url) {
      return {
        response: {
          ok: false,
          status: 0,
          body: null,
          error: "Webhook URL is empty",
        },
      };
    }

    const headersRaw = this.interpolate(String(data.headers || "{}"), ctx);
    const bodyRaw = this.interpolate(String(data.body || "{}"), ctx);

    let headers: Record<string, string> = {};
    let parsedBody: any = undefined;

    try {
      headers = JSON.parse(headersRaw || "{}");
    } catch {
      headers = {};
    }

    try {
      parsedBody = JSON.parse(bodyRaw || "{}");
    } catch {
      parsedBody = bodyRaw;
    }

    try {
      const response = await (globalThis as any).fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(parsedBody),
      });

      let body: any = null;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }

      return {
        response: {
          ok: response.ok,
          status: response.status,
          body,
          headers: {},
        },
      };
    } catch (err: any) {
      return {
        response: {
          ok: false,
          status: 0,
          body: null,
          error: String(err?.message || err),
        },
      };
    }
  }

  private transformData(node: FNode, ctx: ExecContext): Record<string, any> {
    const data = node.data || {};
    const op = String(data.operation || "concat").trim().toLowerCase();

    const inputA = this.resolveValue(data.input_a ?? data.input ?? "", ctx);
    const inputB = this.resolveValue(data.input_b ?? "", ctx);

    let result: any = null;

    if (op === "concat") {
      const separator = String(data.separator ?? "");
      result = `${String(inputA ?? "")}${separator}${String(inputB ?? "")}`;
    } else if (op === "format_currency") {
      const value = Number(inputA ?? 0);
      result = Number.isFinite(value)
        ? value.toLocaleString("pt-BR", { style: "currency", currency: String(data.currency || "BRL") })
        : String(inputA ?? "");
    } else if (op === "format_date") {
      const date = new Date(String(inputA || ""));
      result = Number.isNaN(date.getTime()) ? String(inputA || "") : date.toLocaleString("pt-BR");
    } else if (op === "build_json") {
      const template = this.interpolate(String(data.template_json || "{}"), ctx);
      try {
        result = JSON.parse(template);
      } catch {
        result = { raw: template };
      }
    } else if (op === "extract_field") {
      const path = String(data.path || "").trim();
      result = this.getValueByPath(inputA, path);
    } else {
      result = inputA;
    }

    const targetVar = String(data.target_var || "").trim();
    if (targetVar) {
      ctx.execution.context[targetVar] = result;
    }

    return { result, operation: op, target_var: targetVar || undefined };
  }

  private createExecutionSnapshot(input: {
    flowId: string;
    userId: string;
    triggerSubtype: string;
    triggerData: Record<string, any>;
  }): ExecutionSnapshot {
    const executionId = `exec_${randomUUID()}`;
    const systemVars = this.buildSystemVars(input.triggerSubtype, input.triggerData);

    return {
      execution_id: executionId,
      flow_id: input.flowId,
      user_id: input.userId,
      trigger_subtype: input.triggerSubtype,
      system_vars: systemVars,
      context: {
        trigger: {
          subtype: input.triggerSubtype,
          at: new Date().toISOString(),
        },
      },
      node_outputs: {},
      node_output_schema: {},
      steps_output: {},
      steps_timeline: [],
      debug_log: [`[${new Date().toISOString()}] Flow execution started`],
      status: "running",
    };
  }

  private buildSystemVars(triggerSubtype: string, triggerData: Record<string, any>): Record<string, any> {
    const customer = {
      id: triggerData.clientId || triggerData.customerId || triggerData.leadId || null,
      nome: triggerData.name || triggerData.nome || "",
      name: triggerData.name || triggerData.nome || "",
      phone: triggerData.phone || "",
      endereco: triggerData.address || triggerData.endereco || "",
      city: triggerData.city || "",
      status: triggerData.status || "",
      tags: Array.isArray(triggerData.tags) ? triggerData.tags : [],
      lead_score: Number(triggerData.lead_score ?? triggerData.score ?? 0),
    };

    const orderRaw = triggerData.order || {};
    const order = {
      id: triggerData.orderId || orderRaw.id || null,
      total: Number(triggerData.orderTotal ?? orderRaw.total ?? orderRaw.valor_total ?? 0),
      payment_method: triggerData.paymentMethod || orderRaw.payment_method || orderRaw.forma_pagamento || "",
      raw: orderRaw,
    };

    const store = {
      nome: triggerData.storeName || triggerData.store_nome || "",
      id: triggerData.storeId || null,
    };

    return {
      trigger_subtype: triggerSubtype,
      raw: triggerData,
      customer,
      order,
      store,
      now_iso: new Date().toISOString(),
    };
  }

  private registerNodeOutput(
    node: FNode,
    output: Record<string, any>,
    handle: string | null,
    ctx: ExecContext
  ): void {
    const normalizedOutput = output && typeof output === "object" ? output : { value: output };
    const schema = this.inferOutputSchema(normalizedOutput);

    // Métricas leves por fase (organization / analytics)
    const phaseId = String((node as any).phaseId || node.data?.phaseId || "").trim();
    if (phaseId) {
      const phases = (ctx.execution.context.__phases =
        ctx.execution.context.__phases && typeof ctx.execution.context.__phases === "object"
          ? ctx.execution.context.__phases
          : {});
      const prev = phases[phaseId] || { visits: 0, nodes: [] as string[] };
      phases[phaseId] = {
        visits: Number(prev.visits || 0) + 1,
        last_node_id: node.id,
        last_at: new Date().toISOString(),
        nodes: Array.from(new Set([...(prev.nodes || []), node.id])).slice(-40),
      };
      ctx.execution.context.flow_current_phase = phaseId;
    }

    ctx.execution.node_outputs[node.id] = normalizedOutput;
    ctx.execution.node_output_schema[node.id] = schema;

    const step: NodeStepLog = {
      node_id: node.id,
      node_type: node.type,
      node_subtype: node.subtype,
      output_handle: handle,
      output: normalizedOutput,
      output_schema: schema,
      at: new Date().toISOString(),
    };

    ctx.execution.steps_output[node.id] = step;

    const timelineStep: NodeTimelineStep = {
      step_index: ctx.execution.steps_timeline.length + 1,
      node_id: node.id,
      node_subtype: node.subtype,
      output_handle: handle,
      output: normalizedOutput,
      output_schema: schema,
      context_snapshot: this.cloneJson(ctx.execution.context),
      at: step.at,
    };
    ctx.execution.steps_timeline.push(timelineStep);

    const outputKey = String(node.data?.output_key || "").trim();
    if (outputKey) {
      if (Object.prototype.hasOwnProperty.call(normalizedOutput, outputKey)) {
        ctx.execution.context[outputKey] = normalizedOutput[outputKey];
      } else {
        const values = Object.values(normalizedOutput);
        ctx.execution.context[outputKey] = values.length <= 1 ? values[0] : normalizedOutput;
      }
    }

    ctx.execution.debug_log.push(
      `[${step.at}] Node ${node.id} (${node.subtype}) => ${JSON.stringify(normalizedOutput).slice(0, 700)}`
    );

    void this.persistExecution(ctx.execution, null, false);
  }

  private resolveValue(value: any, ctx: ExecContext): any {
    if (typeof value === "string") {
      return this.interpolate(value, ctx);
    }
    return value;
  }

  private interpolate(template: string, ctx: ExecContext): string {
    const source = String(template || "");
    return source.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_full, expression) => {
      const path = String(expression || "").trim();
      if (!path) return "";
      const value = this.resolveTemplatePath(path, ctx);
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });
  }

  private resolveTemplatePath(path: string, ctx: ExecContext): any {
    const execution = ctx.execution;

    if (path.startsWith("node_")) {
      const [nodeAlias, ...rest] = path.split(".");
      const nodeOutput = execution.node_outputs[nodeAlias] || execution.node_outputs[nodeAlias.replace(/^node_/, "")];
      if (!nodeOutput) return undefined;
      return rest.length ? this.getValueByPath(nodeOutput, rest.join(".")) : nodeOutput;
    }

    const root: Record<string, any> = {
      system: execution.system_vars,
      context: execution.context,
      node: execution.node_outputs,
      node_outputs: execution.node_outputs,
      execution: {
        id: execution.execution_id,
        flow_id: execution.flow_id,
        trigger_subtype: execution.trigger_subtype,
      },
      customer: execution.system_vars.customer,
      order: execution.system_vars.order,
      store: execution.system_vars.store,
      ...execution.context,
      ...execution.system_vars,
    };

    return this.getValueByPath(root, path);
  }

  private getValueByPath(source: any, path: string): any {
    if (!path) return source;
    const keys = path.split(".").filter(Boolean);
    let current = source;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  private cloneJson<T>(value: T): T {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  private inferOutputSchema(value: any, basePath = ""): Record<string, string> {
    const schema: Record<string, string> = {};

    const setType = (path: string, type: string) => {
      if (!path) return;
      schema[path] = type;
    };

    const walk = (current: any, currentPath: string) => {
      if (current === null) {
        setType(currentPath, "null");
        return;
      }

      if (Array.isArray(current)) {
        setType(currentPath, "array");
        return;
      }

      const t = typeof current;
      if (t === "string") {
        setType(currentPath, "string");
        return;
      }
      if (t === "number") {
        setType(currentPath, "number");
        return;
      }
      if (t === "boolean") {
        setType(currentPath, "boolean");
        return;
      }
      if (t !== "object") {
        setType(currentPath, "unknown");
        return;
      }

      if (!currentPath) {
        setType("$", "object");
      } else {
        setType(currentPath, "object");
      }

      for (const [key, val] of Object.entries(current)) {
        const childPath = currentPath ? `${currentPath}.${key}` : key;
        walk(val, childPath);
      }
    };

    walk(value, basePath);
    return schema;
  }

  private async resolveInstance(userId: string): Promise<string | undefined> {
    try {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        "SELECT id FROM whatsapp_instances WHERE created_by = ? LIMIT 1",
        [userId]
      );
      return rows[0]?.id;
    } catch {
      return undefined;
    }
  }

  private async updateLeadField(ctx: ExecContext, field: string, value: string): Promise<void> {
    const allowed = ["status", "source", "notes"];
    if (!allowed.includes(field)) return;
    const leadId = ctx.execution.system_vars?.customer?.id;
    if (!leadId) return;

    const pool = getPool();
    await pool.execute(
      `UPDATE clients SET ${field} = ? WHERE id = ? AND user_id = ?`,
      [value, leadId, ctx.userId]
    );
  }

  private async addTag(ctx: ExecContext, tag: string): Promise<void> {
    const leadId = ctx.execution.system_vars?.customer?.id;
    if (!leadId) return;

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT tags FROM clients WHERE id = ? AND user_id = ? LIMIT 1",
      [leadId, ctx.userId]
    );
    if (!rows[0]) return;

    const tags: string[] = this.parseTags(rows[0].tags);
    if (!tags.includes(tag)) {
      tags.push(tag);
      await pool.execute(
        "UPDATE clients SET tags = ? WHERE id = ? AND user_id = ?",
        [JSON.stringify(tags), leadId, ctx.userId]
      );
    }
  }

  private async removeTag(ctx: ExecContext, tag: string): Promise<void> {
    const leadId = ctx.execution.system_vars?.customer?.id;
    if (!leadId) return;

    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      "SELECT tags FROM clients WHERE id = ? AND user_id = ? LIMIT 1",
      [leadId, ctx.userId]
    );
    if (!rows[0]) return;

    const tags = this.parseTags(rows[0].tags).filter((t) => t !== tag);
    await pool.execute(
      "UPDATE clients SET tags = ? WHERE id = ? AND user_id = ?",
      [JSON.stringify(tags), leadId, ctx.userId]
    );
  }

  private parseTags(raw: any): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item).trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  private async ensureTables(): Promise<void> {
    if (this.tableReady) return;
    await ensureFlowSchema();
    this.tableReady = true;
  }

  private async insertExecution(snapshot: ExecutionSnapshot): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO flow_automation_executions (
        id, flow_id, user_id, trigger_subtype, status,
        system_vars_json, context_json, node_outputs_json, node_output_schema_json,
        steps_output_json, steps_timeline_json, debug_log_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.execution_id,
        snapshot.flow_id,
        snapshot.user_id,
        snapshot.trigger_subtype,
        snapshot.status,
        JSON.stringify(snapshot.system_vars || {}),
        JSON.stringify(snapshot.context || {}),
        JSON.stringify(snapshot.node_outputs || {}),
        JSON.stringify(snapshot.node_output_schema || {}),
        JSON.stringify(snapshot.steps_output || {}),
        JSON.stringify(snapshot.steps_timeline || []),
        JSON.stringify(snapshot.debug_log || []),
      ]
    );
  }

  private async persistExecution(
    snapshot: ExecutionSnapshot,
    errorMessage: string | null,
    finalize: boolean
  ): Promise<void> {
    try {
      const pool = getPool();
      const stepKeys = Object.keys(snapshot.steps_output || {});
      const lastNodeId = stepKeys.length ? stepKeys[stepKeys.length - 1] : null;

      await pool.execute(
        `UPDATE flow_automation_executions
         SET status = ?,
             system_vars_json = ?,
             context_json = ?,
             node_outputs_json = ?,
           node_output_schema_json = ?,
             steps_output_json = ?,
           steps_timeline_json = ?,
             debug_log_json = ?,
             last_node_id = ?,
             error_message = ?,
             finished_at = CASE WHEN ? = 1 THEN NOW() ELSE finished_at END
         WHERE id = ?`,
        [
          snapshot.status,
          JSON.stringify(snapshot.system_vars || {}),
          JSON.stringify(snapshot.context || {}),
          JSON.stringify(snapshot.node_outputs || {}),
          JSON.stringify(snapshot.node_output_schema || {}),
          JSON.stringify(snapshot.steps_output || {}),
          JSON.stringify(snapshot.steps_timeline || []),
          JSON.stringify(snapshot.debug_log || []),
          lastNodeId,
          errorMessage,
          finalize ? 1 : 0,
          snapshot.execution_id,
        ]
      );
    } catch (err: any) {
      logger.warn(`FlowExecutor.persistExecution failed: ${err.message}`);
    }
  }
}

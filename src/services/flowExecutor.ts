import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { InstanceManager } from "../core/instanceManager";
import { logger } from "../utils/logger";
import { getNotificationService } from "./notifications";

interface FNode {
  id: string;
  type: "trigger" | "condition" | "action" | "delay" | "destination" | "end";
  subtype: string;
  label: string;
  data: Record<string, any>;
}

interface FConn {
  id: string;
  from: string;
  fromHandle: string;
  to: string;
}

type ExecutionStatus = "running" | "completed" | "failed";

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
  instanceId?: string;
  execution: ExecutionSnapshot;
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

  async fire(
    triggerSubtype: string,
    userId: string,
    triggerData: Record<string, any>
  ): Promise<void> {
    try {
      await this.ensureTables();
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        "SELECT * FROM flow_automations WHERE user_id = ? AND status = 'active'",
        [userId]
      );

      for (const row of rows) {
        const nodes: FNode[] = typeof row.nodes_json === "string"
          ? JSON.parse(row.nodes_json)
          : (row.nodes_json ?? []);

        const connections: FConn[] = typeof row.connections_json === "string"
          ? JSON.parse(row.connections_json)
          : (row.connections_json ?? []);

        const triggers = nodes.filter((n) => n.type === "trigger" && n.subtype === triggerSubtype);

        for (const trigger of triggers) {
          const execution = this.createExecutionSnapshot({
            flowId: row.id,
            userId,
            triggerSubtype,
            triggerData,
          });

          const ctx: ExecContext = {
            flowId: row.id,
            userId,
            execution,
          };

          await this.insertExecution(ctx.execution);
          ctx.instanceId = await this.resolveInstance(userId);

          this.runFrom(trigger.id, nodes, connections, ctx)
            .then(async () => {
              ctx.execution.status = "completed";
              ctx.execution.debug_log.push(`[${new Date().toISOString()}] Flow finished successfully`);
              await this.persistExecution(ctx.execution, null, true);
            })
            .catch(async (err: any) => {
              ctx.execution.status = "failed";
              ctx.execution.debug_log.push(
                `[${new Date().toISOString()}] Flow failed: ${String(err?.message || err)}`
              );
              await this.persistExecution(ctx.execution, String(err?.message || err), true);
              logger.error(`FlowExecutor error in flow ${row.id}: ${err.message}`);
            });
        }
      }
    } catch (err: any) {
      logger.error(`FlowExecutor.fire error: ${err.message}`);
    }
  }

  private async runFrom(
    nodeId: string,
    nodes: FNode[],
    conns: FConn[],
    ctx: ExecContext
  ): Promise<void> {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const result = await this.processNode(node, ctx);
    this.registerNodeOutput(node, result.output, result.handle, ctx);

    if (result.handle === null) return;

    const next = conns.filter(
      (c) => c.from === nodeId && (c.fromHandle === result.handle || c.fromHandle === "main")
    );
    for (const conn of next) {
      await this.runFrom(conn.to, nodes, conns, ctx);
    }
  }

  private async processNode(
    node: FNode,
    ctx: ExecContext
  ): Promise<{ handle: string | null; output: Record<string, any> }> {
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
        return { handle: "main", output };
      }

      case "condition": {
        const out = this.evaluateCondition(node, ctx);
        return { handle: out, output: { result: out === "yes", branch: out } };
      }

      case "end":
        return { handle: null, output: { ended: true, reason: node.subtype || "end" } };

      default:
        return { handle: "main", output: { ok: true } };
    }
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
            ? String(data.ai_instrucao || data.message || "").trim()
            : String(data.message || "").trim();

        const message = this.interpolate(sourceText, ctx);
        const sendResult = await this.sendWhatsApp(ctx, message, data);

        return {
          text: message,
          delivered: sendResult.sent,
          destination: sendResult.destination,
          transport: sendResult.transport,
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
    const message = this.interpolate(template, ctx);
    if (!message.trim()) return { sent: false, destination: "", transport: "empty" };

    const destType: string = String(data.wa_destino || "lead");
    if (destType === "grupo_especifico" && data.wa_grupo_jid) {
      if (!ctx.instanceId) return { sent: false, destination: "", transport: "missing_instance" };
      try {
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
    const pool = getPool();

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
      // column already exists
    }
    try {
      await pool.execute("ALTER TABLE flow_automation_executions ADD COLUMN steps_timeline_json JSON NULL AFTER steps_output_json");
    } catch {
      // column already exists
    }

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

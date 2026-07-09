import { query, queryOne } from "../config/database";

export type OpportunitySegment =
  | "all"
  | "contact"
  | "prospect"
  | "lead"
  | "hot"
  | "followup"
  | "lost";

export type PipelineType = "contact" | "prospect" | "lead";
export type Temperature = "cold" | "warm" | "hot";

const LEAD_STAGES = new Set([
  "engaged",
  "needs_human_attention",
  "proposal_sent",
]);

const PROSPECT_STAGES = new Set([
  "assigned_to_affiliate",
  "initial_message_sent",
  "awaiting_response",
]);

function normalizePhone(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "");
}

function classifyLeadPipeline(status: string): PipelineType {
  const s = String(status || "").toLowerCase();
  if (s === "contacted" || s === "negotiating") return "lead";
  return "contact";
}

function classifyLeadTemperature(status: string): Temperature {
  const s = String(status || "").toLowerCase();
  if (s === "negotiating") return "hot";
  if (s === "contacted") return "warm";
  return "cold";
}

function classifyAssignmentPipeline(stage: string): PipelineType {
  const s = String(stage || "").toLowerCase();
  if (LEAD_STAGES.has(s)) return "lead";
  return "prospect";
}

function classifyAssignmentTemperature(stage: string): Temperature {
  const s = String(stage || "").toLowerCase();
  if (s === "needs_human_attention" || s === "engaged") return "hot";
  if (s === "awaiting_response" || s === "proposal_sent") return "warm";
  return "cold";
}

function mapLeadStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "Novo contato",
    contacted: "Contatado",
    negotiating: "Em negociação",
    lost: "Perdido",
  };
  return labels[String(status || "").toLowerCase()] || status;
}

function mapStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    assigned_to_affiliate: "Atribuído a você",
    initial_message_sent: "Mensagem inicial enviada",
    awaiting_response: "Aguardando resposta",
    engaged: "Em conversa",
    needs_human_attention: "Intervenção recomendada",
    proposal_sent: "Proposta enviada",
    lost: "Perdido",
  };
  return labels[String(stage || "").toLowerCase()] || stage;
}

function mapSourceType(sourceType: string): string {
  const labels: Record<string, string> = {
    capture: "Seu link / formulário",
    booking: "Agendamento",
    checkout: "Checkout",
    distribution: "Organização",
    panfleteiro_capture: "Panfleteiro",
  };
  return labels[String(sourceType || "").toLowerCase()] || sourceType;
}

function isFollowupDue(nextFollowupAt?: string | null): boolean {
  if (!nextFollowupAt) return false;
  const due = new Date(nextFollowupAt).getTime();
  if (Number.isNaN(due)) return false;
  return due <= Date.now() + 24 * 60 * 60 * 1000;
}

export class AffiliateCrmService {
  async listOpportunities(
    affiliateId: string,
    brandId: string,
    opts?: {
      segment?: OpportunitySegment;
      page?: number;
      limit?: number;
      includeLost?: boolean;
    }
  ) {
    const segment = (opts?.segment || "all") as OpportunitySegment;
    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 100);
    const onlyLost = segment === "lost";
    const includeLost = onlyLost || !!opts?.includeLost;

    const leadClauses = ["affiliate_id = ?", "brand_id = ?"];
    const leadParams: any[] = [affiliateId, brandId];
    if (onlyLost) {
      leadClauses.push("affiliate_status = 'lost'");
    } else {
      leadClauses.push("affiliate_status NOT IN ('converted', 'lost')");
      leadClauses.push("(order_id IS NULL OR order_id = '')");
    }

    const leadRows = await query<any[]>(
      `SELECT id, customer_name, phone, email, source_type, cta_type, product_name,
              message, affiliate_status, affiliate_notes, created_at, updated_at
       FROM affiliate_leads
       WHERE ${leadClauses.join(" AND ")}
       ORDER BY updated_at DESC`,
      leadParams
    );

    const assignmentClauses = [
      "affiliate_id = ?",
      "brand_id = ?",
    ];
    const assignmentParams: any[] = [affiliateId, brandId];
    if (onlyLost) {
      assignmentClauses.push("assignment_status = 'lost'");
    } else {
      assignmentClauses.push("conversion_status != 'converted'");
      assignmentClauses.push("assignment_status NOT IN ('converted', 'lost', 'recycled')");
    }

    const assignmentRows = await query<any[]>(
      `SELECT id, prospect_id, prospect_name, prospect_phone, prospect_city, prospect_region,
              source, assignment_status, current_stage, conversion_status,
              assigned_at, last_interaction_at, next_followup_at, notes, followup_count
       FROM prospect_assignments
       WHERE ${assignmentClauses.join(" AND ")}
       ORDER BY assigned_at DESC`,
      assignmentParams
    );

    const items = [
      ...(leadRows || []).map((row) => {
        const pipelineType = classifyLeadPipeline(row.affiliate_status);
        const temperature = classifyLeadTemperature(row.affiliate_status);
        return {
          id: `lead:${row.id}`,
          ref_type: "affiliate_lead" as const,
          ref_id: String(row.id),
          name: String(row.customer_name || "Sem nome"),
          phone: row.phone ? String(row.phone) : null,
          email: row.email ? String(row.email) : null,
          pipeline_type: pipelineType,
          commercial_status: mapLeadStatusLabel(row.affiliate_status),
          status_code: String(row.affiliate_status || "new"),
          temperature,
          source: "own_link" as const,
          source_label: mapSourceType(row.source_type),
          campaign_name: null,
          program_name: null,
          city: null,
          region: null,
          product_name: row.product_name ? String(row.product_name) : null,
          message: row.message ? String(row.message) : null,
          notes: row.affiliate_notes ? String(row.affiliate_notes) : null,
          last_interaction_at: row.updated_at ? String(row.updated_at) : null,
          next_followup_at: null,
          next_action:
            row.affiliate_status === "new"
              ? "Enviar primeira mensagem"
              : row.affiliate_status === "contacted"
                ? "Aguardar resposta ou follow-up"
                : "Avançar negociação",
          received_at: row.created_at ? String(row.created_at) : String(row.updated_at || ""),
          followup_due: false,
          cta_type: row.cta_type ? String(row.cta_type) : null,
        };
      }),
      ...(assignmentRows || []).map((row) => {
        const stage = String(row.current_stage || "assigned_to_affiliate");
        const pipelineType = classifyAssignmentPipeline(stage);
        const temperature = classifyAssignmentTemperature(stage);
        const followupDue = isFollowupDue(row.next_followup_at);
        return {
          id: `assignment:${row.id}`,
          ref_type: "assignment" as const,
          ref_id: String(row.id),
          name: String(row.prospect_name || "Prospect"),
          phone: row.prospect_phone ? String(row.prospect_phone) : null,
          email: null,
          pipeline_type: pipelineType,
          commercial_status: mapStageLabel(stage),
          status_code: stage,
          temperature,
          source: "organization" as const,
          source_label: mapSourceType(row.source || "distribution"),
          campaign_name: null,
          program_name: null,
          city: row.prospect_city ? String(row.prospect_city) : null,
          region: row.prospect_region ? String(row.prospect_region) : null,
          product_name: null,
          message: row.notes ? String(row.notes) : null,
          notes: row.notes ? String(row.notes) : null,
          last_interaction_at: row.last_interaction_at ? String(row.last_interaction_at) : null,
          next_followup_at: row.next_followup_at ? String(row.next_followup_at) : null,
          next_action: followupDue
            ? "Follow-up vencido — intervir agora"
            : stage === "needs_human_attention"
              ? "Intervir no atendimento"
              : "Acompanhar régua de abordagem",
          received_at: row.assigned_at ? String(row.assigned_at) : "",
          followup_due: followupDue,
          followup_count: Number(row.followup_count || 0),
          cta_type: null,
        };
      }),
    ];

    const filtered = items.filter((item) => {
      if (segment === "all") return true;
      if (segment === "contact") return item.pipeline_type === "contact";
      if (segment === "prospect") return item.pipeline_type === "prospect";
      if (segment === "lead") return item.pipeline_type === "lead";
      if (segment === "hot") return item.temperature === "hot";
      if (segment === "followup") return item.followup_due;
      if (segment === "lost") {
        return item.status_code === "lost" || item.commercial_status === "Perdido";
      }
      return true;
    });

    filtered.sort((a, b) => {
      const ta = new Date(a.last_interaction_at || a.received_at || 0).getTime();
      const tb = new Date(b.last_interaction_at || b.received_at || 0).getTime();
      return tb - ta;
    });

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    return {
      opportunities: pageItems,
      page,
      limit,
      total,
      segment,
    };
  }

  async getOpportunityStats(affiliateId: string, brandId: string) {
    const all = await this.listOpportunities(affiliateId, brandId, {
      segment: "all",
      limit: 500,
      page: 1,
    });
    const lost = await this.listOpportunities(affiliateId, brandId, {
      segment: "lost",
      limit: 200,
      page: 1,
    });

    const items = all.opportunities;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const receivedToday = items.filter((i) => {
      const d = new Date(i.received_at);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).length;

    const receivedWeek = items.filter((i) => {
      const d = new Date(i.received_at);
      return !Number.isNaN(d.getTime()) && d >= weekAgo;
    }).length;

    const convertedRow = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM affiliate_leads
       WHERE affiliate_id = ? AND brand_id = ? AND affiliate_status = 'converted'`,
      [affiliateId, brandId]
    );
    const convertedAssignments = await queryOne<any>(
      `SELECT COUNT(*) AS total FROM prospect_assignments
       WHERE affiliate_id = ? AND brand_id = ? AND conversion_status = 'converted'`,
      [affiliateId, brandId]
    );

    return {
      received_today: receivedToday,
      received_week: receivedWeek,
      total_open: all.total,
      contacts: items.filter((i) => i.pipeline_type === "contact").length,
      prospects: items.filter((i) => i.pipeline_type === "prospect").length,
      leads: items.filter((i) => i.pipeline_type === "lead").length,
      hot: items.filter((i) => i.temperature === "hot").length,
      followup_due: items.filter((i) => i.followup_due).length,
      lost: lost.total,
      converted_total:
        Number(convertedRow?.total || 0) + Number(convertedAssignments?.total || 0),
      from_own_links: items.filter((i) => i.source === "own_link").length,
      from_organization: items.filter((i) => i.source === "organization").length,
    };
  }

  async listCustomers(
    affiliateId: string,
    brandId: string,
    opts?: { page?: number; limit?: number; status?: string }
  ) {
    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 100);

    const leadCustomers = await query<any[]>(
      `SELECT id, customer_name, phone, email, source_type, product_name, order_id,
              affiliate_status, created_at, updated_at
       FROM affiliate_leads
       WHERE affiliate_id = ? AND brand_id = ?
         AND (affiliate_status = 'converted' OR (order_id IS NOT NULL AND order_id != ''))
       ORDER BY updated_at DESC`,
      [affiliateId, brandId]
    );

    const convertedAssignments = await query<any[]>(
      `SELECT id, prospect_name, prospect_phone, prospect_city, prospect_region, source,
              converted_customer_id, converted_order_id, assigned_at, last_interaction_at
       FROM prospect_assignments
       WHERE affiliate_id = ? AND brand_id = ? AND conversion_status = 'converted'
       ORDER BY last_interaction_at DESC`,
      [affiliateId, brandId]
    );

    const sales = await query<any[]>(
      `SELECT id, customer_name, order_id, order_total, commission_amount,
              order_status, commission_status, created_at, updated_at
       FROM affiliate_sales
       WHERE affiliate_id = ? AND brand_id = ?
       ORDER BY created_at DESC`,
      [affiliateId, brandId]
    );

    type CustomerAgg = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      customer_status: string;
      first_purchase_at: string | null;
      last_purchase_at: string | null;
      total_revenue: number;
      purchase_count: number;
      commission_total: number;
      commission_pending: number;
      source_label: string;
      city: string | null;
      region: string | null;
      refs: string[];
    };

    const byKey = new Map<string, CustomerAgg>();

    function upsert(key: string, seed: Partial<CustomerAgg> & { name: string }) {
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id: key,
          name: seed.name,
          phone: seed.phone ?? null,
          email: seed.email ?? null,
          customer_status: seed.customer_status || "active",
          first_purchase_at: seed.first_purchase_at ?? null,
          last_purchase_at: seed.last_purchase_at ?? null,
          total_revenue: seed.total_revenue || 0,
          purchase_count: seed.purchase_count || 0,
          commission_total: seed.commission_total || 0,
          commission_pending: seed.commission_pending || 0,
          source_label: seed.source_label || "Cliente",
          city: seed.city ?? null,
          region: seed.region ?? null,
          refs: seed.refs || [],
        });
        return byKey.get(key)!;
      }
      if (seed.phone && !existing.phone) existing.phone = seed.phone;
      if (seed.email && !existing.email) existing.email = seed.email;
      if (seed.city && !existing.city) existing.city = seed.city;
      if (seed.region && !existing.region) existing.region = seed.region;
      if (seed.refs?.length) existing.refs.push(...seed.refs);
      return existing;
    }

    for (const row of leadCustomers || []) {
      const phone = normalizePhone(row.phone);
      const key = phone || `lead:${row.id}`;
      upsert(key, {
        name: String(row.customer_name || "Cliente"),
        phone: row.phone ? String(row.phone) : null,
        email: row.email ? String(row.email) : null,
        customer_status: row.order_id ? "active" : "converted",
        first_purchase_at: row.created_at ? String(row.created_at) : null,
        last_purchase_at: row.updated_at ? String(row.updated_at) : null,
        source_label: mapSourceType(row.source_type),
        refs: [`affiliate_lead:${row.id}`],
      });
    }

    for (const row of convertedAssignments || []) {
      const phone = normalizePhone(row.prospect_phone);
      const key = phone || `assignment:${row.id}`;
      const agg = upsert(key, {
        name: String(row.prospect_name || "Cliente"),
        phone: row.prospect_phone ? String(row.prospect_phone) : null,
        customer_status: "active",
        first_purchase_at: row.assigned_at ? String(row.assigned_at) : null,
        last_purchase_at: row.last_interaction_at ? String(row.last_interaction_at) : null,
        source_label: mapSourceType(row.source || "distribution"),
        city: row.prospect_city ? String(row.prospect_city) : null,
        region: row.prospect_region ? String(row.prospect_region) : null,
        refs: [`assignment:${row.id}`],
      });
      if (row.converted_order_id) {
        agg.purchase_count += 1;
      }
    }

    for (const sale of sales || []) {
      const name = String(sale.customer_name || "Cliente").trim();
      const key = `sale:${name.toLowerCase()}`;
      const agg = upsert(key, {
        name,
        customer_status: "active",
        source_label: "Venda atribuída",
        refs: [`sale:${sale.id}`],
      });
      const amount = Number(sale.order_total || 0);
      const commission = Number(sale.commission_amount || 0);
      agg.total_revenue += amount;
      agg.purchase_count += 1;
      agg.commission_total += commission;
      if (String(sale.commission_status || "").toLowerCase() === "pending") {
        agg.commission_pending += commission;
      }
      const created = sale.created_at ? String(sale.created_at) : null;
      if (created) {
        if (!agg.first_purchase_at || created < agg.first_purchase_at) agg.first_purchase_at = created;
        if (!agg.last_purchase_at || created > agg.last_purchase_at) agg.last_purchase_at = created;
      }
    }

    let customers = Array.from(byKey.values()).map((c) => {
      const last = c.last_purchase_at ? new Date(c.last_purchase_at).getTime() : 0;
      const daysSince = last ? Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000)) : 999;
      let status = c.customer_status;
      if (c.purchase_count > 1) status = "recurring";
      else if (daysSince > 90) status = "inactive";
      else if (c.first_purchase_at && daysSince <= 30) status = "new";
      else status = "active";

      const averageTicket = c.purchase_count > 0 ? c.total_revenue / c.purchase_count : 0;
      return {
        ...c,
        customer_status: status,
        average_ticket: Math.round(averageTicket * 100) / 100,
        next_action:
          status === "inactive"
            ? "Reativar cliente"
            : status === "recurring"
              ? "Acompanhar recompra"
              : "Pós-venda e retenção",
      };
    });

    const statusFilter = String(opts?.status || "").trim().toLowerCase();
    if (statusFilter && statusFilter !== "all") {
      customers = customers.filter((c) => c.customer_status === statusFilter);
    }

    customers.sort((a, b) => {
      const ta = new Date(a.last_purchase_at || a.first_purchase_at || 0).getTime();
      const tb = new Date(b.last_purchase_at || b.first_purchase_at || 0).getTime();
      return tb - ta;
    });

    const total = customers.length;
    const offset = (page - 1) * limit;
    const pageItems = customers.slice(offset, offset + limit);

    return { customers: pageItems, page, limit, total };
  }

  async getCustomerStats(affiliateId: string, brandId: string) {
    const { customers } = await this.listCustomers(affiliateId, brandId, { limit: 500, page: 1 });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const newThisMonth = customers.filter((c) => {
      const d = c.first_purchase_at ? new Date(c.first_purchase_at) : null;
      return d && !Number.isNaN(d.getTime()) && d >= monthStart;
    }).length;

    return {
      total: customers.length,
      active: customers.filter((c) => c.customer_status === "active").length,
      new_month: newThisMonth,
      recurring: customers.filter((c) => c.customer_status === "recurring").length,
      inactive: customers.filter((c) => c.customer_status === "inactive").length,
      total_revenue: customers.reduce((s, c) => s + c.total_revenue, 0),
      commission_total: customers.reduce((s, c) => s + c.commission_total, 0),
      commission_pending: customers.reduce((s, c) => s + c.commission_pending, 0),
      average_ticket:
        customers.length > 0
          ? Math.round(
              (customers.reduce((s, c) => s + c.average_ticket, 0) / customers.length) * 100
            ) / 100
          : 0,
    };
  }
}

export const affiliateCrmService = new AffiliateCrmService();
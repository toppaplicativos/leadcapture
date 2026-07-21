import { query, queryOne } from "../config/database";
import { resolveOpportunityNiche } from "./affiliateDistribution";

export type OpportunitySegment =
  | "all"
  | "contact"
  | "prospect"
  | "lead"
  | "hot"
  | "followup"
  | "lost"
  /** Fases operacionais do atendimento manual (kanban afiliado) */
  | "new"
  | "to_contact"
  | "inbox"
  | "fila"
  | "contacted"
  | "engaged"
  | "closed";

export type PipelineType = "contact" | "prospect" | "lead";
export type Temperature = "cold" | "warm" | "hot";
export type OperationalPhase = "new" | "to_contact" | "contacted" | "engaged" | "closed";

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
    panfleteiro_capture_batch: "Prospecção da organização",
  };
  return labels[String(sourceType || "").toLowerCase()] || sourceType;
}

function isFollowupDue(nextFollowupAt?: string | null): boolean {
  if (!nextFollowupAt) return false;
  const due = new Date(nextFollowupAt).getTime();
  if (Number.isNaN(due)) return false;
  return due <= Date.now() + 24 * 60 * 60 * 1000;
}

/** Fase do pipeline operacional (manual = espelho da campanha opt-in / follow-up). */
export function classifyOperationalPhase(input: {
  ref_type: "affiliate_lead" | "assignment";
  status_code: string;
  followup_due?: boolean;
}): OperationalPhase {
  const code = String(input.status_code || "").toLowerCase();
  if (code === "lost" || code === "converted" || code === "recycled") return "closed";

  if (input.ref_type === "affiliate_lead") {
    if (code === "new" || !code) return "new";
    if (code === "contacted") return "contacted";
    if (code === "negotiating") return "engaged";
    return "to_contact";
  }

  // assignment stages
  if (code === "assigned_to_affiliate" || code === "assigned") return "new";
  if (code === "initial_message_sent" || code === "awaiting_response") return "contacted";
  if (
    code === "engaged"
    || code === "needs_human_attention"
    || code === "proposal_sent"
  ) {
    return "engaged";
  }
  if (input.followup_due) return "contacted";
  /* Default: na fila de trabalho */
  return "to_contact";
}

function nextActionForPhase(phase: OperationalPhase, followupDue?: boolean): string {
  if (followupDue) return "Follow-up — reenviar ou avançar";
  if (phase === "new") return "Preparar opt-in LGPD";
  if (phase === "to_contact") return "Enviar primeira mensagem";
  if (phase === "contacted") return "Aguardar resposta ou fazer follow-up";
  if (phase === "engaged") return "Avançar negociação";
  if (phase === "closed") return "Arquivo";
  return "Continuar atendimento";
}



function buildFacets(items: Array<Record<string, any>>) {
  const niches = new Set<string>();
  const regions = new Set<string>();
  let whatsapp = 0;
  let email = 0;
  let instagram = 0;
  let address = 0;
  for (const i of items) {
    const n = String(i.niche || "").trim();
    if (n) niches.add(n);
    for (const r of [i.city, i.region]) {
      const v = String(r || "").trim();
      if (v) regions.add(v);
    }
    const phone = i.channels?.whatsapp || i.phone;
    if (i.has_whatsapp || String(phone || "").replace(/\D/g, "").length >= 8) whatsapp += 1;
    if (i.channels?.email || i.email) email += 1;
    if (i.channels?.instagram || i.instagram) instagram += 1;
    if (i.channels?.address || i.address) address += 1;
  }
  return {
    niches: Array.from(niches).sort((a, b) => a.localeCompare(b, "pt-BR")),
    regions: Array.from(regions).sort((a, b) => a.localeCompare(b, "pt-BR")),
    channels: { whatsapp, email, instagram, address, total: items.length },
  };
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
    /* Limite alto para CRM afiliado (filtros client-side precisam da base completa) */
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 1000);
    /* "closed"/"Arquivo" = contatos perdidos/arquivados (antes o segment closed nunca
       trazia lost porque a base aberta excluía lost). */
    const onlyLost = segment === "lost" || segment === "closed";
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
              message, affiliate_status, affiliate_notes, created_at, updated_at, next_followup_at
       FROM affiliate_leads
       WHERE ${leadClauses.join(" AND ")}
       ORDER BY updated_at DESC`,
      leadParams
    ).catch(async () => {
      // schema legado sem order_id / colunas opcionais
      try {
        return await query<any[]>(
          `SELECT id, customer_name, phone, email, source_type, cta_type, product_name,
                  message, affiliate_status, affiliate_notes, created_at, updated_at
           FROM affiliate_leads
           WHERE affiliate_id = ? AND brand_id = ?
           ORDER BY updated_at DESC`,
          [affiliateId, brandId],
        );
      } catch {
        return [];
      }
    });

    const assignmentClausesPa = [
      "pa.affiliate_id = ?",
      "pa.brand_id = ?",
    ];
    const assignmentClausesBare = [
      "affiliate_id = ?",
      "brand_id = ?",
    ];
    const assignmentParams: any[] = [affiliateId, brandId];
    if (onlyLost) {
      assignmentClausesPa.push(
        "(pa.assignment_status = 'lost' OR pa.current_stage = 'lost' OR pa.conversion_status = 'lost')",
      );
      assignmentClausesBare.push(
        "(assignment_status = 'lost' OR current_stage = 'lost' OR conversion_status = 'lost')",
      );
    } else {
      /* IS DISTINCT FROM trata NULL corretamente no Postgres */
      assignmentClausesPa.push("COALESCE(pa.conversion_status, 'open') IS DISTINCT FROM 'converted'");
      assignmentClausesPa.push(
        "COALESCE(pa.assignment_status, 'assigned') NOT IN ('converted', 'lost', 'recycled')",
      );
      assignmentClausesBare.push("COALESCE(conversion_status, 'open') IS DISTINCT FROM 'converted'");
      assignmentClausesBare.push(
        "COALESCE(assignment_status, 'assigned') NOT IN ('converted', 'lost', 'recycled')",
      );
    }

    const assignmentRows = await query<any[]>(
      `SELECT pa.id, pa.prospect_id, pa.prospect_name, pa.prospect_phone, pa.prospect_city, pa.prospect_region,
              pa.source, pa.assignment_status, pa.current_stage, pa.conversion_status,
              pa.assigned_at, pa.last_interaction_at, pa.next_followup_at, pa.notes, pa.followup_count, pa.metadata_json,
              c.email AS customer_email,
              c.category AS customer_category,
              c.subcategory AS customer_subcategory,
              c.city AS customer_city,
              c.state AS customer_state,
              c.source_details AS customer_source_details
       FROM prospect_assignments pa
       LEFT JOIN customers c ON c.id = pa.prospect_id
       WHERE ${assignmentClausesPa.join(" AND ")}
       ORDER BY pa.assigned_at DESC`,
      assignmentParams
    ).catch(async () => {
      // fallback: join só com email (sem category/subcategory)
      try {
        return await query<any[]>(
          `SELECT pa.id, pa.prospect_id, pa.prospect_name, pa.prospect_phone, pa.prospect_city, pa.prospect_region,
                  pa.source, pa.assignment_status, pa.current_stage, pa.conversion_status,
                  pa.assigned_at, pa.last_interaction_at, pa.next_followup_at, pa.notes, pa.followup_count, pa.metadata_json,
                  c.email AS customer_email, c.category AS customer_category, c.subcategory AS customer_subcategory
           FROM prospect_assignments pa
           LEFT JOIN customers c ON c.id = pa.prospect_id
           WHERE ${assignmentClausesPa.join(" AND ")}
           ORDER BY pa.assigned_at DESC`,
          assignmentParams,
        );
      } catch {
        // fallback final: sem join
        try {
          return await query<any[]>(
            `SELECT id, prospect_id, prospect_name, prospect_phone, prospect_city, prospect_region,
                    source, assignment_status, current_stage, conversion_status,
                    assigned_at, last_interaction_at, next_followup_at, notes, followup_count, metadata_json
             FROM prospect_assignments
             WHERE ${assignmentClausesBare.join(" AND ")}
             ORDER BY assigned_at DESC`,
            assignmentParams,
          );
        } catch {
          return [];
        }
      }
    });

    const leadItems = (leadRows || []).map((row) => {
      const pipelineType = classifyLeadPipeline(row.affiliate_status);
      const temperature = classifyLeadTemperature(row.affiliate_status);
      const phone = row.phone ? String(row.phone) : null;
      const email = row.email ? String(row.email) : null;
      return {
        id: `lead:${row.id}`,
        ref_type: "affiliate_lead" as const,
        ref_id: String(row.id),
        name: String(row.customer_name || "Sem nome"),
        phone,
        email,
        instagram: null as string | null,
        address: null as string | null,
        channels: {
          whatsapp: phone,
          email,
          instagram: null as string | null,
          address: null as string | null,
        },
        pipeline_type: pipelineType,
        commercial_status: mapLeadStatusLabel(row.affiliate_status),
        status_code: String(row.affiliate_status || "new"),
        temperature,
        source: "own_link" as const,
        source_label: mapSourceType(row.source_type),
        campaign_name: null,
        program_name: null,
        city: null as string | null,
        region: null as string | null,
        product_name: row.product_name ? String(row.product_name) : null,
        niche: resolveOpportunityNiche({
          metadata: {
            niche: row.product_name,
            category: row.cta_type || row.source_type,
            segment: row.cta_type,
          },
        }),
        message: row.message ? String(row.message) : null,
        notes: row.affiliate_notes ? String(row.affiliate_notes) : null,
        last_interaction_at: row.updated_at ? String(row.updated_at) : null,
        next_followup_at: row.next_followup_at ? String(row.next_followup_at) : null,
        received_at: row.created_at ? String(row.created_at) : String(row.updated_at || ""),
        followup_due: isFollowupDue(row.next_followup_at),
        followup_count: 0,
        cta_type: row.cta_type ? String(row.cta_type) : null,
        has_whatsapp: normalizePhone(phone).length >= 8,
      };
    }).map((item) => {
      const operational_phase = classifyOperationalPhase({
        ref_type: "affiliate_lead",
        status_code: item.status_code,
        followup_due: item.followup_due,
      });
      return {
        ...item,
        operational_phase,
        next_action: nextActionForPhase(operational_phase, item.followup_due),
        suggested_template: operational_phase === "new" || operational_phase === "to_contact"
          ? "optin"
          : operational_phase === "contacted"
            ? "followup"
            : "apresentacao",
      };
    });

    const assignmentItems = (assignmentRows || []).map((row) => {
      let metadata: Record<string, any> = {};
      try { metadata = typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json || "{}") : (row.metadata_json || {}); } catch { metadata = {}; }
      const stage = String(row.current_stage || "assigned_to_affiliate");
      const pipelineType = classifyAssignmentPipeline(stage);
      const temperature = classifyAssignmentTemperature(stage);
      const followupDue = isFollowupDue(row.next_followup_at);
      const phone = row.prospect_phone ? String(row.prospect_phone) : null;
      const email = String(row.customer_email || metadata.email || "").trim() || null;
      const instagram = String(metadata.instagram || metadata.instagram_handle || metadata.ig || "")
        .trim()
        .replace(/^@/, "") || null;
      const address = String(metadata.address || metadata.endereco || "").trim() || null;
      return {
        id: `assignment:${row.id}`,
        ref_type: "assignment" as const,
        ref_id: String(row.id),
        name: String(row.prospect_name || "Prospect"),
        phone,
        email,
        instagram,
        address,
        channels: {
          whatsapp: phone,
          email,
          instagram,
          address,
        },
        pipeline_type: pipelineType,
        commercial_status: mapStageLabel(stage),
        status_code: stage,
        temperature,
        source: "organization" as const,
        source_label: mapSourceType(row.source || "distribution"),
        campaign_name: null,
        program_name: null,
        city: row.prospect_city
          ? String(row.prospect_city)
          : row.customer_city
            ? String(row.customer_city)
            : null,
        region: row.prospect_region
          ? String(row.prospect_region)
          : row.customer_state
            ? String(row.customer_state)
            : null,
        product_name: null as string | null,
        niche: (() => {
          let sd: Record<string, any> = {};
          try {
            const raw = row.customer_source_details;
            sd = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
          } catch {
            sd = {};
          }
          return resolveOpportunityNiche({
            metadata,
            customerCategory: row.customer_category,
            customerSubcategory: row.customer_subcategory,
            sourceDetails: sd,
          });
        })(),
        message: row.notes ? String(row.notes) : null,
        notes: row.notes ? String(row.notes) : null,
        last_interaction_at: row.last_interaction_at ? String(row.last_interaction_at) : null,
        next_followup_at: row.next_followup_at ? String(row.next_followup_at) : null,
        received_at: row.assigned_at ? String(row.assigned_at) : "",
        followup_due: followupDue,
        followup_count: Number(row.followup_count || 0),
        cta_type: null as string | null,
        has_whatsapp: normalizePhone(phone).length >= 8,
      };
    }).map((item) => {
      const operational_phase = classifyOperationalPhase({
        ref_type: "assignment",
        status_code: item.status_code,
        followup_due: item.followup_due,
      });
      return {
        ...item,
        operational_phase,
        next_action: nextActionForPhase(operational_phase, item.followup_due),
        suggested_template:
          operational_phase === "new" || operational_phase === "to_contact"
            ? "optin"
            : operational_phase === "contacted" || item.followup_due
              ? "followup"
              : "apresentacao",
      };
    });

    // Preferir assignment da org quando o mesmo telefone existe como lead de link
    const orgPhones = new Set(
      assignmentItems
        .map((i) => normalizePhone(i.phone).slice(-9))
        .filter((p) => p.length >= 8)
    );
    const items = [
      ...assignmentItems,
      ...leadItems.filter((lead) => {
        const tail = normalizePhone(lead.phone).slice(-9);
        if (tail.length >= 8 && orgPhones.has(tail)) return false;
        return true;
      }),
    ];

    const facets = buildFacets(items);

    const filtered = items.filter((item) => {
      if (segment === "all") return true;
      if (segment === "inbox" || segment === "fila") {
        return item.operational_phase === "new" || item.operational_phase === "to_contact";
      }
      if (segment === "contact") return item.pipeline_type === "contact";
      if (segment === "prospect") return item.pipeline_type === "prospect";
      if (segment === "lead") return item.pipeline_type === "lead";
      if (segment === "hot") return item.temperature === "hot";
      if (segment === "followup") return item.followup_due;
      if (segment === "lost" || segment === "closed") {
        return item.operational_phase === "closed"
          || item.status_code === "lost"
          || item.commercial_status === "Perdido";
      }
      if (
        segment === "new"
        || segment === "to_contact"
        || segment === "contacted"
        || segment === "engaged"
      ) {
        return item.operational_phase === segment;
      }
      return true;
    });

    filtered.sort((a, b) => {
      // Fila: follow-up due first, then newest
      if (a.followup_due !== b.followup_due) return a.followup_due ? -1 : 1;
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
      facets,
    };
  }

  /** Stats a partir de uma lista já carregada — evita 2–3 listagens no mesmo request. */
  buildOpportunityStatsFromItems(
    items: Array<Record<string, any>>,
    opts?: { lostTotal?: number; convertedTotal?: number },
  ) {
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

    const phaseNew = items.filter((i) => i.operational_phase === "new").length;
    const phaseToContact = items.filter((i) => i.operational_phase === "to_contact").length;
    const phaseClosedOpen = items.filter((i) => i.operational_phase === "closed").length;

    return {
      received_today: receivedToday,
      received_week: receivedWeek,
      total_open: items.length,
      contacts: items.filter((i) => i.pipeline_type === "contact").length,
      prospects: items.filter((i) => i.pipeline_type === "prospect").length,
      leads: items.filter((i) => i.pipeline_type === "lead").length,
      hot: items.filter((i) => i.temperature === "hot").length,
      followup_due: items.filter((i) => i.followup_due).length,
      lost: Number(opts?.lostTotal || 0),
      phase_new: phaseNew,
      phase_to_contact: phaseToContact,
      phase_inbox: phaseNew + phaseToContact,
      phase_contacted: items.filter((i) => i.operational_phase === "contacted").length,
      phase_engaged: items.filter((i) => i.operational_phase === "engaged").length,
      phase_closed: phaseClosedOpen + Number(opts?.lostTotal || 0),
      converted_total: Number(opts?.convertedTotal || 0),
      from_own_links: items.filter((i) => i.source === "own_link").length,
      from_organization: items.filter((i) => i.source === "organization").length,
    };
  }

  /**
   * Uma única listagem + stats leves (counts). Substitui list + getOpportunityStats em paralelo.
   */
  async listOpportunitiesWithStats(
    affiliateId: string,
    brandId: string,
    opts?: {
      segment?: OpportunitySegment;
      page?: number;
      limit?: number;
      /** false = só abertos (mais rápido; Arquivo carrega sob demanda no FE) */
      includeClosed?: boolean;
    },
  ) {
    const segment = (opts?.segment || "all") as OpportunitySegment;
    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 500);
    const onlyClosed = segment === "closed" || segment === "lost";
    const needClosed =
      onlyClosed
      || opts?.includeClosed === true
      || (opts?.includeClosed !== false && segment === "all");

    /* Só arquivo: 1 query. Evita carregar abertos de novo no 2º fetch do FE. */
    if (onlyClosed) {
      const closedBundle = await this.listOpportunities(affiliateId, brandId, {
        segment: "closed",
        page: 1,
        limit: Math.min(limit, 200),
      }).catch(() => ({ opportunities: [] as any[], facets: null as any }));
      const closedItems = closedBundle.opportunities || [];
      const offset = (page - 1) * limit;
      return {
        opportunities: closedItems.slice(offset, offset + limit),
        page,
        limit,
        total: closedItems.length,
        segment,
        facets: closedBundle.facets || buildFacets(closedItems),
        stats: {
          total_open: 0,
          phase_closed: closedItems.length,
          lost: closedItems.length,
        },
        all_open: [],
        all_closed: closedItems,
        universe_size: closedItems.length,
        include_closed: true,
      };
    }

    /* Abertos (caminho crítico). Arquivo opcional. */
    const openCap = Math.min(500, Math.max(limit, 200));
    const openBundle = await this.listOpportunities(affiliateId, brandId, {
      segment: "all",
      page: 1,
      limit: openCap,
    });
    const openItems = openBundle.opportunities || [];

    let closedItems: any[] = [];
    if (needClosed) {
      const closedBundle = await this.listOpportunities(affiliateId, brandId, {
        segment: "closed",
        page: 1,
        limit: 200,
      }).catch(() => ({ opportunities: [] as any[], facets: null as any }));
      closedItems = closedBundle.opportunities || [];
    }

    const lostTotal = closedItems.length;
    const stats = this.buildOpportunityStatsFromItems(openItems, {
      lostTotal,
      convertedTotal: 0,
    });

    const facetSource = [...openItems, ...closedItems];
    const facets = this.mergeFacets(openBundle.facets, closedItems);

    let filtered: any[];
    if (segment === "inbox" || segment === "fila") {
      filtered = openItems.filter(
        (i) => i.operational_phase === "new" || i.operational_phase === "to_contact",
      );
    } else if (
      segment === "new"
      || segment === "to_contact"
      || segment === "contacted"
      || segment === "engaged"
    ) {
      filtered = openItems.filter((i) => i.operational_phase === segment);
    } else if (segment === "followup") {
      filtered = openItems.filter((i) => i.followup_due);
    } else if (segment === "hot") {
      filtered = openItems.filter((i) => i.temperature === "hot");
    } else if (segment === "contact") {
      filtered = openItems.filter((i) => i.pipeline_type === "contact");
    } else if (segment === "prospect") {
      filtered = openItems.filter((i) => i.pipeline_type === "prospect");
    } else if (segment === "lead") {
      filtered = openItems.filter((i) => i.pipeline_type === "lead");
    } else {
      filtered = openItems;
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    return {
      opportunities: pageItems,
      page,
      limit,
      total,
      segment,
      facets,
      stats: {
        ...stats,
        phase_closed: Math.max(Number(stats.phase_closed || 0), closedItems.length, lostTotal),
      },
      all_open: openItems,
      all_closed: closedItems,
      universe_size: facetSource.length,
      include_closed: needClosed,
    };
  }

  private mergeFacets(
    base: any,
    extraItems: Array<Record<string, any>>,
  ) {
    const niches = new Set<string>(Array.isArray(base?.niches) ? base.niches : []);
    const regions = new Set<string>(Array.isArray(base?.regions) ? base.regions : []);
    for (const i of extraItems || []) {
      const n = String(i.niche || "").trim();
      if (n) niches.add(n);
      for (const r of [i.city, i.region]) {
        const v = String(r || "").trim();
        if (v) regions.add(v);
      }
    }
    return {
      niches: Array.from(niches).sort((a, b) => a.localeCompare(b, "pt-BR")),
      regions: Array.from(regions).sort((a, b) => a.localeCompare(b, "pt-BR")),
      channels: base?.channels || { total: 0 },
    };
  }

  async getOpportunityStats(affiliateId: string, brandId: string) {
    // Compat: uma listagem + counts leves (não 2 listagens completas)
    const bundle = await this.listOpportunitiesWithStats(affiliateId, brandId, {
      segment: "all",
      page: 1,
      limit: 50,
    });
    return bundle.stats;
  }

  /**
   * Digest leve para cards de produtividade (hoje / fila / follow-up).
   * Evita o FE montar a lista completa só por KPIs.
   */
  async getAttendanceDigest(affiliateId: string, brandId: string) {
    const bundle = await this.listOpportunitiesWithStats(affiliateId, brandId, {
      segment: "all",
      page: 1,
      limit: 50,
      includeClosed: false,
    });
    const open = bundle.all_open || [];
    const stats = bundle.stats || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const claimedToday = open.filter((i) => {
      const d = new Date(i.received_at);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).length;
    const claimedWeek = open.filter((i) => {
      const d = new Date(i.received_at);
      return !Number.isNaN(d.getTime()) && d >= weekAgo;
    }).length;

    /* Ações manuais do dia (envio / avanço) */
    let sentToday = 0;
    let closedToday = 0;
    let repliedToday = 0;
    try {
      const rows = await query<any[]>(
        `SELECT action, COUNT(*)::int AS n
         FROM affiliate_manual_actions
         WHERE affiliate_id = ? AND brand_id = ?
           AND created_at >= CURRENT_DATE
         GROUP BY action`,
        [affiliateId, brandId],
      ).catch(async () => {
        /* PG COUNT(*)::int pode falhar em outros dialetos — fallback simples */
        return await query<any[]>(
          `SELECT action, COUNT(*) AS n
           FROM affiliate_manual_actions
           WHERE affiliate_id = ? AND brand_id = ?
             AND created_at >= CURRENT_DATE
           GROUP BY action`,
          [affiliateId, brandId],
        ).catch(() => []);
      });
      for (const r of rows || []) {
        const a = String(r.action || "").toLowerCase();
        const n = Number(r.n || 0);
        if (a === "sent" || a === "followup" || a === "called") sentToday += n;
        if (a === "replied" || a === "negotiating") repliedToday += n;
        if (
          a === "lost"
          || a === "dismiss"
          || a === "not_matching"
          || a === "channel_unavailable"
        ) {
          closedToday += n;
        }
      }
    } catch {
      /* tabela pode não existir ainda */
    }

    const s = stats as Record<string, any>;
    const followupDue = Number(s.followup_due || 0);
    const inbox = Number(s.phase_inbox || 0);
    const contacted = Number(s.phase_contacted || 0);
    const engaged = Number(s.phase_engaged || 0);
    const responseRate =
      sentToday > 0 ? Math.round((repliedToday / sentToday) * 100) : null;

    return {
      inbox,
      followup_due: followupDue,
      contacted,
      engaged,
      total_open: Number(s.total_open || open.length),
      claimed_today: claimedToday,
      claimed_week: claimedWeek,
      sent_today: sentToday,
      closed_today: closedToday,
      replied_today: repliedToday,
      response_rate_today: responseRate,
      needs_attention: followupDue + inbox,
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

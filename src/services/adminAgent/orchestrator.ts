import { aiRouter } from "../aiRouter";
import { AgentWorkspaceService } from "../agentWorkspace";
import { brandSkillsService } from "../brandSkills";
import { InventoryService } from "../inventory";
import { query, queryOne } from "../../config/database";
import { logger } from "../../utils/logger";
import {
  fetchLeadById,
  fetchLeadStats,
  fetchRecentConversations,
  fetchRecentLeads,
  fetchRecentClients,
  fetchClientStats,
  fetchRecentOrders,
  fetchOrderStats,
  fetchRecentProducts,
  fetchGalleryCount,
  generateProductDraftFromBrief,
} from "./actions";
import { SKILLS, NAV_PATHS, buildSkillsCatalog } from "./squads";
import { getSkillMeta } from "./skillMeta";
import type {
  AdminAgentContext,
  AgentAction,
  AgentTurn,
  ChatMessage,
  ComponentSpec,
  SkillSelection,
} from "./types";

const workspaceService = new AgentWorkspaceService();
const inventoryService = new InventoryService();

export class AdminAgentOrchestrator {
  async chat(
    message: string,
    history: ChatMessage[],
    ctx: AdminAgentContext,
  ): Promise<AgentTurn> {
    const trimmed = String(message || "").trim();

    /* Gatilho direto (navegação / chips) — sem LLM */
    const directSkill = String(ctx.directSkill || "").trim();
    if (directSkill && SKILLS[directSkill]) {
      const skill = SKILLS[directSkill];
      const execCtx: AdminAgentContext = ctx.skillContext
        ? { ...ctx, skillContext: { ...ctx.skillContext } }
        : ctx;
      const customMsg = String(ctx.skillContext?.assistantMessage || "").trim();
      const { components, actions } = await this.executeSkill(directSkill, execCtx);
      const turn: AgentTurn = {
        message: customMsg || trimmed || `Abrindo ${skill.name.toLowerCase()}…`,
        squad: skill.squad,
        skill: directSkill,
        components,
        actions,
      };
      if (directSkill === "campaigns.create") turn.nextSkill = "campaigns.confirm";
      if (directSkill === "skills.train") turn.nextSkill = "skills.confirm";
      return this.applyPresentation(directSkill, turn);
    }

    /* Continuação de fluxo multi-turn (form submit, row click, nextSkill) */
    const continuation = this.resolveContinuation(trimmed, ctx);
    if (continuation) {
      const { components, actions } = await this.executeSkill(continuation.skill, {
        ...ctx,
        skillContext: { ...ctx.skillContext, ...continuation.context },
      });
      return this.applyPresentation(continuation.skill, {
        message: continuation.message,
        squad: continuation.squad,
        skill: continuation.skill,
        components,
        actions,
        nextSkill: continuation.nextSkill,
      });
    }

    if (!trimmed) {
      return {
        message: "Como posso ajudar? Posso mostrar seu painel, configurar o agente, listar leads ou criar campanhas.",
        components: [this.buildHelpNav()],
      };
    }

    let selection: SkillSelection;
    try {
      selection = await this.selectSkill(trimmed, history, ctx);
    } catch (err: any) {
      logger.warn({ err: err?.message }, "admin agent: skill selection failed, using fallback");
      selection = this.fallbackSelection(trimmed, ctx);
    }

    const skill = SKILLS[selection.skill];
    if (!skill) {
      return {
        message: selection.message || "Não encontrei uma ação exata. Veja o que posso fazer:",
        squad: selection.squad,
        components: [this.buildHelpNav()],
      };
    }

    const execCtx: AdminAgentContext = selection.context
      ? { ...ctx, skillContext: { ...ctx.skillContext, ...selection.context } }
      : ctx;
    const { components, actions } = await this.executeSkill(selection.skill, execCtx);
    const turn: AgentTurn = {
      message: selection.message,
      squad: selection.squad,
      skill: selection.skill,
      components,
      actions,
      nextSkill: selection.nextSkill,
    };

    if (selection.skill === "campaigns.create") {
      turn.nextSkill = "campaigns.confirm";
    }
    if (selection.skill === "skills.train") {
      turn.nextSkill = "skills.confirm";
    }
    if (selection.skill === "crm.lead.find" && selection.context?.search) {
      turn.nextSkill = "crm.lead.detail";
    }

    return this.applyPresentation(selection.skill, turn);
  }

  private applyPresentation(skillId: string, turn: AgentTurn): AgentTurn {
    const meta = getSkillMeta(skillId);
    if (meta) {
      turn.objective = meta.objectives[0];
      if (meta.requiresCanvas) {
        turn.presentation = "canvas";
        turn.canvasRoute = meta.canvasRoute;
      } else if (meta.inlineComponents) {
        turn.presentation = "inline";
      }
    }
    if (skillId === "lead.prospect") {
      turn.presentation = "inline";
      turn.canvasRoute = "/busca";
    }
    if (skillId === "messages.inbox") {
      turn.presentation = "inline";
      turn.canvasRoute = "/mensagens";
    }
    if (skillId === "catalog.products" || skillId === "catalog.products.table" || skillId === "catalog.products.create") {
      turn.presentation = "inline";
      turn.canvasRoute = "/produtos";
    }
    if (skillId === "crm.clients.table" || skillId === "crm.clients.list") {
      turn.presentation = "inline";
      turn.canvasRoute = "/clientes";
    }
    if (skillId === "catalog.orders") {
      turn.presentation = "inline";
      turn.canvasRoute = "/pedidos";
    }
    if (skillId === "campaigns.list") {
      turn.presentation = "inline";
      turn.canvasRoute = "/campanhas";
    }
    if (skillId === "gallery.open") {
      turn.presentation = "inline";
      turn.canvasRoute = "/galeria";
    }
    if (skillId === "dashboard.overview" || skillId === "dashboard.show") {
      turn.presentation = "inline";
      turn.canvasRoute = "/dashboard";
    }
    if (!turn.presentation && turn.components?.length) {
      turn.presentation = "inline";
    }
    return turn;
  }

  private async selectSkill(
    message: string,
    history: ChatMessage[],
    ctx: AdminAgentContext,
  ): Promise<SkillSelection> {
    const catalog = buildSkillsCatalog();
    const historyText = history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é o orquestrador do painel admin LeadCapture — um sistema Agent-Driven onde o chat monta a UI.

CONTEXTO:
- Página atual: ${ctx.currentPath || "/admin"}
- Brand: ${ctx.brandId || "não definida"}

CATÁLOGO DE SQUADS E SKILLS:
${catalog}

HISTÓRICO RECENTE:
${historyText || "(vazio)"}

MENSAGEM DO USUÁRIO:
${message}

TAREFA:
1. Identifique a intenção do usuário.
2. Escolha o squad e a skill mais adequados do catálogo acima.
3. Escreva uma resposta curta, amigável e em português brasileiro.

Responda APENAS com JSON válido neste formato:
{
  "squad": "id_do_squad",
  "skill": "id.da.skill",
  "message": "resposta natural ao usuário",
  "reasoning": "breve justificativa interna"
}`;

    const result = await aiRouter.generateJson<SkillSelection>(prompt, {
      userId: ctx.userId,
      brandId: ctx.brandId || undefined,
    }, { temperature: 0.2 });

    if (!result?.skill || !SKILLS[result.skill]) {
      return this.fallbackSelection(message, ctx);
    }

    return {
      squad: result.squad || SKILLS[result.skill].squad,
      skill: result.skill,
      message: String(result.message || "").trim() || SKILLS[result.skill].name,
      reasoning: result.reasoning,
    };
  }

  private resolveContinuation(
    message: string,
    ctx: AdminAgentContext,
  ): { skill: string; squad: string; message: string; context?: Record<string, unknown>; nextSkill?: string } | null {
    const ev = ctx.componentEvent;
    const sk = ctx.skillContext;

    if (ev?.action === "select_row" && ev.payload?.leadId) {
      return {
        skill: "crm.lead.detail",
        squad: "crm",
        message: "Aqui estão os dados do lead selecionado.",
        context: { leadId: String(ev.payload.leadId) },
      };
    }

    if (ev?.action === "select_row" && ev.payload?.conversationId) {
      const name = String(ev.payload.name || "contato").trim();
      return {
        skill: "messages.inbox",
        squad: "messages",
        message: `Abrindo conversa com ${name}.`,
        context: { conversationId: String(ev.payload.conversationId) },
      };
    }

    if (ev?.action === "select_option" && ev.payload?.optionId) {
      const optionId = String(ev.payload.optionId);
      const label = String(ev.payload.label || optionId);
      if (ev.componentId === "channel-picker" || sk?.nextSkill === "campaigns.create") {
        return {
          skill: "campaigns.create",
          squad: "campaigns",
          message: `Canal ${label} selecionado. Confirme para continuar.`,
          context: { channel: optionId },
          nextSkill: "campaigns.confirm",
        };
      }
    }

    if (ev?.action === "submit_form" && ev.componentId === "prospect-form") {
      const q = String(ev.payload?.query || "").trim();
      const loc = String(ev.payload?.location || "").trim();
      if (!q || !loc) return null;
      return {
        skill: "lead.prospect",
        squad: "crm",
        message: `Buscando ${q} em ${loc}. O mapa abre ao lado — arraste para prospectar.`,
        context: { query: q, location: loc },
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "order-customer-form") {
      const customer = String(ev.payload?.customer || "").trim();
      if (!customer) return null;
      return {
        skill: "order.assisted",
        squad: "catalog",
        message: `Pedido para ${customer}. Escolha os produtos:`,
        context: { customer },
        nextSkill: "order.assisted",
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "lead-search-form") {
      const search = String(ev.payload?.search || message || "").trim();
      if (!search) return null;
      return {
        skill: "crm.lead.find",
        squad: "crm",
        message: `Resultados para "${search}":`,
        context: { search },
        nextSkill: "crm.lead.detail",
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "product-create-form") {
      const name = String(ev.payload?.name || "").trim();
      const brief = String(ev.payload?.brief || "").trim();
      if (!name && !brief) return null;
      return {
        skill: "catalog.products.create",
        squad: "catalog",
        message: name
          ? `Gerando rascunho de "${name}" com IA…`
          : "Gerando rascunho do produto com IA…",
        context: {
          name,
          category: String(ev.payload?.category || "").trim(),
          brief,
          price: ev.payload?.price != null && ev.payload?.price !== ""
            ? Number(ev.payload.price)
            : undefined,
        },
      };
    }

    if (sk?.nextSkill === "crm.lead.detail" && sk.leadId) {
      return {
        skill: "crm.lead.detail",
        squad: "crm",
        message: "Detalhes do lead:",
        context: { leadId: String(sk.leadId) },
      };
    }

    if (sk?.nextSkill && SKILLS[sk.nextSkill]) {
      const skill = SKILLS[sk.nextSkill];
      return {
        skill: skill.id,
        squad: skill.squad,
        message: skill.name,
        context: sk as Record<string, unknown>,
      };
    }

    return null;
  }

  private fallbackSelection(message: string, ctx?: AdminAgentContext): SkillSelection {
    const lower = message.toLowerCase();

    const leadNameMatch = lower.match(/(?:lead|cliente)\s+(?:chamad[oa]|nome)\s+(.+)/i)
      || lower.match(/editar\s+(?:o\s+)?lead\s+(.+)/i)
      || lower.match(/encontrar\s+lead\s+(.+)/i);
    if (leadNameMatch?.[1]) {
      const search = leadNameMatch[1].trim();
      return {
        squad: "crm",
        skill: "crm.lead.find",
        message: `Buscando lead "${search}"...`,
        context: { search },
        nextSkill: "crm.lead.detail",
      };
    }

    if (ctx?.skillContext?.search) {
      return {
        squad: "crm",
        skill: "crm.lead.find",
        message: `Resultados para "${ctx.skillContext.search}":`,
      };
    }

    for (const skill of Object.values(SKILLS)) {
      if (skill.intents.some((i) => lower.includes(i))) {
        return {
          squad: skill.squad,
          skill: skill.id,
          message: `Vou te ajudar com: ${skill.name.toLowerCase()}.`,
        };
      }
    }
    if (/agente|whatsapp|bot/i.test(lower)) {
      return { squad: "workspace", skill: "workspace.overview", message: "Aqui está o status do seu agente IA." };
    }
    if (/mensagem|conversa|inbox/i.test(lower)) {
      return { squad: "messages", skill: "messages.inbox", message: "Últimas conversas:" };
    }
    const prospectMatch = lower.match(/(?:buscar|prospectar|encontrar)\s+(.+?)\s+(?:em|na|no)\s+(.+)/i)
      || lower.match(/(.+?)\s+em\s+([a-záàâãéêíóôõúç\s]+)$/i);
    if (/busca|prospect|paleteiro|panfleteiro|google\s*maps|no\s+mapa/i.test(lower)) {
      if (prospectMatch?.[1] && prospectMatch?.[2]) {
        const q = prospectMatch[1].trim();
        const loc = prospectMatch[2].trim();
        return {
          squad: "crm",
          skill: "lead.prospect",
          message: `Abrindo busca de ${q} em ${loc} no mapa.`,
          context: { query: q, location: loc },
        };
      }
      return { squad: "crm", skill: "lead.prospect", message: "Vamos prospectar no mapa. Qual segmento e cidade?" };
    }
    if (/lead|cliente|crm/i.test(lower)) {
      return { squad: "crm", skill: "crm.leads.table", message: "Aqui estão seus leads recentes." };
    }
    if (/campanha|disparo/i.test(lower)) {
      return { squad: "campaigns", skill: "campaigns.list", message: "Veja suas campanhas." };
    }
    if (/pedido\s+para|fazer\s+pedido|tirar\s+pedido|preciso\s+fazer\s+um\s+pedido/i.test(lower)) {
      return { squad: "catalog", skill: "order.assisted", message: "Vamos montar esse pedido juntos." };
    }
    if (/fluxo|automação\s+visual/i.test(lower)) {
      return { squad: "automations", skill: "flow.builder", message: "Abrindo o editor de fluxos..." };
    }
    if (/criativo|gerar\s+imagem/i.test(lower)) {
      return { squad: "creative", skill: "creative.generate", message: "Abrindo criativos IA..." };
    }
    if (/vídeo|video\s+studio/i.test(lower)) {
      return { squad: "creative", skill: "video.create", message: "Abrindo Video Studio..." };
    }
    if (/galeria|minhas\s+imagens/i.test(lower)) {
      return { squad: "creative", skill: "gallery.open", message: "Abrindo sua galeria..." };
    }
    if (/painel|dashboard|como\s+está\s+o\s+negócio|mostrar\s+painel/i.test(lower)) {
      return { squad: "dashboard", skill: "dashboard.show", message: "Abrindo o painel completo..." };
    }
    if (/produto|estoque|loja/i.test(lower)) {
      return { squad: "catalog", skill: "catalog.products", message: "Resumo do seu catálogo." };
    }
    return {
      squad: "nav",
      skill: "nav.help",
      message: "Posso navegar pelo painel, mostrar KPIs, configurar o agente ou criar campanhas. O que você precisa?",
    };
  }

  private async executeSkill(
    skillId: string,
    ctx: AdminAgentContext,
  ): Promise<{ components: ComponentSpec[]; actions: AgentAction[] }> {
    const components: ComponentSpec[] = [];
    const actions: AgentAction[] = [];
    const sk = ctx.skillContext || {};

    switch (skillId) {
      case "workspace.overview": {
        const overview = await workspaceService.getOverview(ctx.userId, ctx.brandId);
        components.push({
          id: "readiness",
          type: "readiness_card",
          props: {
            score: overview.readiness_score,
            agentName: overview.profile?.agent_name || "Agente",
            filledFields: overview.profile?.filled_fields,
            totalFields: overview.profile?.total_fields,
          },
        });
        if (overview.readiness_checklist?.length) {
          components.push({
            id: "checklist",
            type: "checklist",
            props: { items: overview.readiness_checklist.slice(0, 6) },
          });
        }
        break;
      }

      case "workspace.navigate": {
        components.push(this.buildNavSuggestions(["agente", "habilidades", "mensagens"]));
        actions.push({ type: "navigate", payload: { path: "/agente" } });
        break;
      }

      case "crm.leads.list": {
        const stats = await fetchLeadStats(ctx.userId, ctx.brandId);
        const total = Number(stats?.total ?? 0);
        components.push({
          id: "leads-stats",
          type: "leads_stats",
          props: {
            total,
            newCount: Number(stats?.new_count ?? 0),
            live: true,
          },
        });
        components.push({
          id: "kpis",
          type: "kpi_row",
          props: {
            items: [
              { label: "Leads", value: total, icon: "users" },
            ],
          },
        });
        components.push(this.buildNavSuggestions(["leads", "busca", "mensagens"]));
        actions.push({ type: "navigate", payload: { path: "/leads" } });
        break;
      }

      case "crm.leads.search":
      case "lead.prospect": {
        const q = String(sk.query || "").trim();
        const loc = String(sk.location || "").trim();
        if (!q || !loc) {
          components.push({
            id: "prospect-form",
            type: "form",
            props: {
              title: "Busca no mapa (modo paleteiro)",
              fields: [
                { name: "query", label: "Segmento", type: "text", placeholder: "Ex: pizzaria, dentista" },
                { name: "location", label: "Cidade", type: "text", placeholder: "Ex: Fortaleza, SP" },
              ],
              submitLabel: "Buscar no mapa",
              nextSkill: "lead.prospect",
            },
          });
          break;
        }
        components.push({
          id: "prospect-stats",
          type: "prospect_stats",
          props: {
            query: q,
            location: loc,
            radius: sk.radius,
            live: true,
          },
        });
        if (skillId === "crm.leads.search") {
          components.push(this.buildNavSuggestions(["busca"]));
        }
        break;
      }

      case "crm.clients.table":
      case "crm.clients.list": {
        const search = String(sk.search || "").trim();
        const status = String(sk.status || "").trim();
        const [stats, clients] = await Promise.all([
          fetchClientStats(ctx.userId, ctx.brandId),
          fetchRecentClients(ctx.userId, ctx.brandId, {
            search: search || undefined,
            status: status || undefined,
            limit: 12,
          }),
        ]);
        components.push({
          id: "clients-stats",
          type: "clients_stats",
          props: {
            total: stats.total || 0,
            activeCount: stats.active_count || 0,
            search: search || undefined,
            status: status || undefined,
            live: true,
          },
        });
        components.push({
          id: "client-stats-kpi",
          type: "kpi_row",
          props: {
            items: [
              { label: "Clientes", value: stats.total || 0, icon: "users" },
              { label: "Ativos", value: stats.active_count || 0, icon: "zap" },
            ],
          },
        });
        components.push({
          id: "clients-table",
          type: "table",
          props: {
            title: "Clientes recentes",
            columns: [
              { key: "name", label: "Nome" },
              { key: "phone", label: "Telefone" },
              { key: "city", label: "Cidade" },
              { key: "status", label: "Status" },
            ],
            rows: clients.rows,
            rowType: "client",
            emptyLabel: "Nenhum cliente encontrado.",
          },
        });
        components.push(this.buildNavSuggestions(["clientes", "leads"]));
        break;
      }

      case "crm.leads.table": {
        const search = String(sk.search || "").trim();
        const status = String(sk.status || "").trim();
        const [stats, leads] = await Promise.all([
          fetchLeadStats(ctx.userId, ctx.brandId),
          fetchRecentLeads(ctx.userId, ctx.brandId, {
            search: search || undefined,
            status: status || undefined,
            limit: 12,
          }),
        ]);
        if (stats) {
          components.push({
            id: "leads-stats",
            type: "leads_stats",
            props: {
              total: stats.total || 0,
              newCount: stats.new_count || 0,
              search: search || undefined,
              status: status || undefined,
              live: true,
            },
          });
          components.push({
            id: "lead-stats",
            type: "kpi_row",
            props: {
              items: [
                { label: "Total", value: stats.total || 0, icon: "users" },
                { label: "Novos", value: stats.new_count || 0, icon: "zap" },
              ],
            },
          });
        }
        components.push({
          id: "leads-table",
          type: "table",
          props: {
            title: "Leads recentes",
            columns: [
              { key: "name", label: "Nome" },
              { key: "phone", label: "Telefone" },
              { key: "city", label: "Cidade" },
              { key: "status", label: "Status" },
            ],
            rows: leads.rows,
            rowType: "lead",
            emptyLabel: "Nenhum lead encontrado.",
          },
        });
        components.push(this.buildNavSuggestions(["leads", "busca"]));
        break;
      }

      case "crm.lead.find": {
        const search = String(sk.search || "").trim();
        if (!search) {
          components.push({
            id: "lead-search-form",
            type: "form",
            props: {
              title: "Buscar lead",
              fields: [
                { name: "search", label: "Nome, telefone ou cidade", type: "text", placeholder: "Ex: João Silva" },
              ],
              submitLabel: "Buscar",
              nextSkill: "crm.lead.find",
            },
          });
          break;
        }
        const leads = await fetchRecentLeads(ctx.userId, ctx.brandId, { search, limit: 6 });
        components.push({
          id: "lead-results",
          type: "table",
          props: {
            title: `${leads.total} resultado(s)`,
            columns: [
              { key: "name", label: "Nome" },
              { key: "phone", label: "Telefone" },
              { key: "city", label: "Cidade" },
            ],
            rows: leads.rows,
            rowType: "lead",
            emptyLabel: "Nenhum lead com esse termo.",
          },
        });
        if (leads.rows.length === 1) {
          components.push({
            id: "lead-auto",
            type: "lead_card",
            props: { lead: await fetchLeadById(ctx.userId, ctx.brandId, String(leads.rows[0].id)) },
          });
        }
        break;
      }

      case "crm.lead.detail": {
        const leadId = String(sk.leadId || "").trim();
        if (!leadId) break;
        const lead = await fetchLeadById(ctx.userId, ctx.brandId, leadId);
        if (!lead) {
          components.push({
            id: "lead-missing",
            type: "text",
            props: { content: "Lead não encontrado." },
          });
          break;
        }
        components.push({
          id: "lead-card",
          type: "lead_card",
          props: { lead },
        });
        components.push({
          id: "lead-actions",
          type: "button",
          props: { label: "Abrir na lista de leads", path: `/leads`, variant: "secondary" },
        });
        actions.push({ type: "navigate", payload: { path: "/leads" } });
        break;
      }

      case "messages.inbox": {
        const convId = String(sk.conversationId || "").trim();
        const inbox = await fetchRecentConversations(ctx.userId, ctx.brandId);
        const unreadTotal = inbox.rows.reduce((s, r) => s + Number(r.unread || 0), 0);
        components.push({
          id: "inbox-stats",
          type: "inbox_stats",
          props: {
            total: inbox.total,
            unread: unreadTotal,
            conversationId: convId || undefined,
            live: true,
          },
        });
        components.push({
          id: "inbox-table",
          type: "table",
          props: {
            title: "Conversas recentes",
            columns: [
              { key: "name", label: "Contato" },
              { key: "mode", label: "Modo IA" },
              { key: "unread", label: "Não lidas" },
            ],
            rows: inbox.rows.map((r) => ({ ...r, unread: r.unread || 0 })),
            rowType: "conversation",
            emptyLabel: "Nenhuma conversa ainda.",
          },
        });
        components.push(this.buildNavSuggestions(["mensagens"]));
        break;
      }

      case "catalog.products.create": {
        const name = String(sk.name || "").trim();
        const brief = String(sk.brief || sk.description || "").trim();
        const category = String(sk.category || "").trim();
        const priceRaw = sk.price;

        if (!name && !brief) {
          components.push({
            id: "product-create-form",
            type: "form",
            props: {
              title: "Novo produto",
              fields: [
                { name: "name", label: "Nome do produto", type: "text", placeholder: "Ex: Bolo de chocolate 1kg" },
                { name: "category", label: "Categoria", type: "text", placeholder: "Ex: Bolos, Bebidas…" },
                { name: "brief", label: "Descreva em poucas palavras", type: "textarea", placeholder: "Ex: bolo artesanal para festas, massa fofa, entrega no mesmo dia" },
                { name: "price", label: "Preço (opcional)", type: "number", placeholder: "49.90" },
              ],
              submitLabel: "Gerar com IA",
              nextSkill: "catalog.products.create",
            },
          });
          break;
        }

        const draft = await generateProductDraftFromBrief(ctx.userId, ctx.brandId, {
          name: name || brief.slice(0, 60),
          category,
          brief,
          price: priceRaw != null && priceRaw !== "" ? Number(priceRaw) : undefined,
        });

        const preview = draft.description.length > 220
          ? `${draft.description.slice(0, 220)}…`
          : draft.description;

        components.push({
          id: "product-draft-preview",
          type: "text",
          props: { content: preview },
        });
        components.push({
          id: "product-draft-confirm",
          type: "confirmation",
          props: {
            title: draft.name,
            description: [
              category || draft.category ? `Categoria: ${category || draft.category}` : "",
              draft.price > 0 ? `Preço sugerido: R$ ${draft.price.toFixed(2)}` : "",
              draft.features.length ? `Destaques: ${draft.features.slice(0, 3).join(" · ")}` : "",
              "Revise e publique no editor.",
            ].filter(Boolean).join(" · "),
            confirmLabel: "Abrir editor",
            action: "create_product",
            draft,
          },
        });
        components.push(this.buildNavSuggestions(["produtos"]));
        break;
      }

      case "catalog.products.table": {
        const products = await fetchRecentProducts(ctx.userId, ctx.brandId);
        const search = String(sk.search || "").trim();
        components.push({
          id: "products-stats",
          type: "products_stats",
          props: {
            total: products.total,
            search: search || undefined,
            live: true,
          },
        });
        components.push({
          id: "products-table",
          type: "table",
          props: {
            title: "Produtos",
            columns: [
              { key: "name", label: "Produto" },
              { key: "sku", label: "SKU" },
              { key: "stock", label: "Estoque" },
            ],
            rows: products.rows,
            rowType: "product",
            emptyLabel: "Nenhum produto no catálogo.",
          },
        });
        components.push(this.buildNavSuggestions(["produtos", "estoque"]));
        break;
      }

      case "campaigns.list": {
        const stats = await this.countCampaigns(ctx.userId, ctx.brandId);
        components.push({
          id: "campaigns-stats",
          type: "campaigns_stats",
          props: {
            total: stats.total,
            active: stats.active,
            live: true,
          },
        });
        components.push({
          id: "kpis",
          type: "kpi_row",
          props: {
            items: [
              { label: "Campanhas", value: stats.total, icon: "megaphone" },
              { label: "Ativas", value: stats.active, icon: "zap" },
            ],
          },
        });
        components.push(this.buildNavSuggestions(["campanhas"]));
        break;
      }

      case "campaigns.create": {
        const channel = String(sk.channel || "").trim();
        if (!channel) {
          components.push({
            id: "channel-picker",
            type: "option_picker",
            props: {
              title: "Escolha o canal",
              options: [
                { id: "whatsapp", label: "WhatsApp", description: "Disparos e conversas" },
                { id: "instagram", label: "Instagram", description: "Posts e DMs" },
                { id: "facebook", label: "Facebook", description: "Página e anúncios" },
              ],
              nextSkill: "campaigns.create",
            },
          });
          break;
        }
        if (channel === "whatsapp") {
          components.push({
            id: "confirm-campaign",
            type: "confirmation",
            props: {
              title: "Criar campanha WhatsApp com IA",
              description: "O wizard analisa seu negócio e monta a campanha automaticamente.",
              confirmLabel: "Abrir wizard",
              action: "open_modal",
              modal: "ai-campaign",
            },
          });
          actions.push({ type: "open_modal", payload: { modal: "ai-campaign" } });
        } else {
          components.push({
            id: "channel-nav",
            type: "button",
            props: {
              label: channel === "instagram" ? "Abrir Instagram" : "Abrir Facebook",
              path: channel === "instagram" ? "/instagram" : "/facebook",
              variant: "primary",
            },
          });
          actions.push({
            type: "navigate",
            payload: { path: channel === "instagram" ? "/instagram" : "/facebook" },
          });
        }
        break;
      }

      case "order.assisted": {
        const customer = String(sk.customer || "").trim();
        if (!customer) {
          components.push({
            id: "order-customer-form",
            type: "form",
            props: {
              title: "Para quem é o pedido?",
              fields: [
                { name: "customer", label: "Nome do cliente", type: "text", placeholder: "Ex: João Silva" },
              ],
              submitLabel: "Continuar",
              nextSkill: "order.assisted",
            },
          });
          break;
        }
        const products = await fetchRecentProducts(ctx.userId, ctx.brandId);
        components.push({
          id: "order-products",
          type: "table",
          props: {
            title: `Produtos para ${customer}`,
            columns: [
              { key: "name", label: "Produto" },
              { key: "sku", label: "SKU" },
              { key: "stock", label: "Estoque" },
            ],
            rows: products.rows,
            rowType: "product",
            emptyLabel: "Nenhum produto no catálogo.",
          },
        });
        components.push({
          id: "order-confirm",
          type: "confirmation",
          props: {
            title: "Confirmar pedido",
            description: `Montar pedido assistido para ${customer}?`,
            confirmLabel: "Ir para PDV",
            action: "navigate",
          },
        });
        components.push({
          id: "order-pdv-btn",
          type: "button",
          props: { label: "Abrir tirar pedido", path: "/tirar-pedido", variant: "primary" },
        });
        actions.push({ type: "navigate", payload: { path: "/tirar-pedido" } });
        break;
      }

      case "dashboard.show": {
        const dash = await this.buildDashboardKpiComponents(ctx);
        components.push(...dash);
        actions.push({ type: "navigate", payload: { path: "/dashboard" } });
        break;
      }

      case "flow.builder":
        components.push(this.buildNavSuggestions(["fluxos"]));
        actions.push({ type: "navigate", payload: { path: "/fluxos" } });
        break;

      case "creative.generate":
        components.push(this.buildNavSuggestions(["criativos"]));
        actions.push({ type: "navigate", payload: { path: "/criativos" } });
        break;

      case "video.create":
        components.push(this.buildNavSuggestions(["video-studio"]));
        actions.push({ type: "navigate", payload: { path: "/video-studio" } });
        break;

      case "gallery.open": {
        const total = await fetchGalleryCount(ctx.userId, ctx.brandId);
        components.push({
          id: "gallery-stats",
          type: "gallery_stats",
          props: { total, live: true },
        });
        components.push(this.buildNavSuggestions(["galeria"]));
        break;
      }

      case "agent.configure":
        break;

      case "skills.list": {
        if (ctx.brandId) {
          const skills = await brandSkillsService.listForBrand(ctx.userId, ctx.brandId);
          components.push({
            id: "skills",
            type: "skill_list",
            props: {
              skills: skills.slice(0, 8).map((s) => ({
                id: s.id,
                name: s.name,
                type: s.skill_type,
                active: s.is_active,
                confidence: s.confidence_score,
              })),
              total: skills.length,
            },
          });
        }
        components.push(this.buildNavSuggestions(["habilidades", "agente"]));
        break;
      }

      case "skills.train": {
        components.push({
          id: "confirm-skill",
          type: "confirmation",
          props: {
            title: "Ensinar nova habilidade",
            description: "Envie materiais (texto, tabelas, imagens) e a IA vai estruturar uma brand skill.",
            confirmLabel: "Abrir treinador",
            action: "open_modal",
            modal: "skill-trainer",
          },
        });
        actions.push({ type: "open_modal", payload: { modal: "skill-trainer" } });
        break;
      }

      case "catalog.products": {
        const inv = await inventoryService.getOverview(ctx.userId, ctx.brandId);
        const search = String(sk.search || "").trim();
        components.push({
          id: "products-stats",
          type: "products_stats",
          props: {
            total: inv.total_products || 0,
            active: Math.max(0, (inv.total_products || 0) - (inv.out_of_stock || 0)),
            outOfStock: inv.out_of_stock || 0,
            search: search || undefined,
            live: true,
          },
        });
        components.push({
          id: "kpis",
          type: "kpi_row",
          props: {
            items: [
              { label: "Produtos", value: inv.total_products || 0, icon: "package" },
              { label: "Em estoque", value: inv.total_units || 0, icon: "boxes" },
              { label: "Sem estoque", value: inv.out_of_stock || 0, icon: "alert" },
            ],
          },
        });
        components.push(this.buildNavSuggestions(["produtos", "estoque"]));
        break;
      }

      case "catalog.orders": {
        const search = String(sk.search || "").trim();
        const status = String(sk.status || "").trim();
        const [stats, orders] = await Promise.all([
          fetchOrderStats(ctx.userId, ctx.brandId),
          fetchRecentOrders(ctx.userId, ctx.brandId, {
            search: search || undefined,
            status: status || undefined,
            limit: 12,
          }),
        ]);
        components.push({
          id: "orders-stats",
          type: "orders_stats",
          props: {
            total: stats.total || 0,
            pendingCount: stats.pending_count || 0,
            paidCount: stats.paid_count || 0,
            revenueTotal: stats.revenue_total || 0,
            search: search || undefined,
            status: status || undefined,
            live: true,
          },
        });
        components.push({
          id: "orders-stats-kpi",
          type: "kpi_row",
          props: {
            items: [
              { label: "Pedidos", value: stats.total || 0, icon: "cart" },
              { label: "Pagos", value: stats.paid_count || 0, icon: "zap" },
              { label: "Pendentes", value: stats.pending_count || 0, icon: "alert" },
            ],
          },
        });
        components.push({
          id: "orders-table",
          type: "table",
          props: {
            title: "Pedidos recentes",
            columns: [
              { key: "order_number", label: "Pedido" },
              { key: "name", label: "Cliente" },
              { key: "total", label: "Valor" },
              { key: "status", label: "Status" },
            ],
            rows: orders.rows.map((r: { total?: number; [key: string]: unknown }) => ({
              ...r,
              total: r.total != null
                ? Number(r.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "—",
            })),
            rowType: "order",
            emptyLabel: "Nenhum pedido encontrado.",
          },
        });
        components.push(this.buildNavSuggestions(["pedidos", "produtos"]));
        break;
      }

      case "dashboard.overview": {
        components.push(...(await this.buildDashboardKpiComponents(ctx)));
        components.push(this.buildHelpNav());
        break;
      }

      case "nav.help":
      default:
        components.push(this.buildHelpNav());
        break;
    }

    return { components, actions };
  }

  private async buildDashboardKpiComponents(ctx: AdminAgentContext): Promise<ComponentSpec[]> {
    const [leads, inv, campaigns, orders] = await Promise.all([
      this.countLeads(ctx.userId, ctx.brandId),
      inventoryService.getOverview(ctx.userId, ctx.brandId),
      this.countCampaigns(ctx.userId, ctx.brandId),
      this.countOrders(ctx.userId, ctx.brandId),
    ]);
    return [{
      id: "kpis",
      type: "kpi_row",
      props: {
        items: [
          { label: "Leads", value: leads, icon: "users" },
          { label: "Campanhas", value: campaigns.total, icon: "megaphone" },
          { label: "Pedidos", value: orders, icon: "cart" },
          { label: "Produtos", value: inv.total_products || 0, icon: "package" },
        ],
        subtitle: campaigns.active > 0 ? `${campaigns.active} campanha(s) ativa(s)` : undefined,
      },
    }];
  }

  private buildHelpNav(): ComponentSpec {
    return this.buildNavSuggestions([
      "dashboard", "leads", "campanhas", "agente", "habilidades", "produtos", "mensagens",
    ]);
  }

  private buildNavSuggestions(keys: string[]): ComponentSpec {
    const items = keys
      .map((k) => {
        const n = NAV_PATHS[k];
        if (!n) return null;
        return { path: n.path, label: n.label, navKey: k };
      })
      .filter(Boolean) as Array<{ path: string; label: string; navKey: string }>;
    return { id: `nav-${keys.join("-")}`, type: "nav_suggestions", props: { items } };
  }

  private async countLeads(userId: string, brandId: string | null): Promise<number> {
    try {
      const stats = await fetchLeadStats(userId, brandId);
      return Number(stats?.total ?? 0);
    } catch {
      return 0;
    }
  }

  private async countCampaigns(
    userId: string,
    brandId: string | null,
  ): Promise<{ total: number; active: number }> {
    try {
      const normalizedBrandId = String(brandId || "").trim();
      const brandClause = normalizedBrandId ? "AND brand_id = ?" : "AND brand_id IS NULL";
      const params = normalizedBrandId ? [userId, normalizedBrandId] : [userId];
      const row = await queryOne<any>(
        `SELECT COUNT(*)::int AS total,
          SUM(CASE WHEN status IN ('running', 'scheduled', 'active', 'sending') THEN 1 ELSE 0 END)::int AS active
         FROM campaign_history
         WHERE user_id = ? ${brandClause}`,
        params,
      );
      return {
        total: Number(row?.total ?? 0),
        active: Number(row?.active ?? 0),
      };
    } catch {
      return { total: 0, active: 0 };
    }
  }

  private async countOrders(userId: string, brandId: string | null): Promise<number> {
    try {
      const brandClause = brandId ? "AND o.brand_id = ?" : "AND o.brand_id IS NULL";
      const params = brandId ? [userId, brandId] : [userId];
      const row = await queryOne<any>(
        `SELECT COUNT(*)::int AS n FROM commerce_orders o WHERE o.user_id = ? ${brandClause}`,
        params,
      );
      return Number(row?.n ?? 0);
    } catch {
      return 0;
    }
  }
}

export const adminAgentOrchestrator = new AdminAgentOrchestrator();
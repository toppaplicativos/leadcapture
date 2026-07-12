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
  generateInstagramPostFromBrief,
  generateFacebookPostFromBrief,
} from "./actions";
import { instagramService } from "../instagram";
import { facebookService } from "../facebook";
import {
  countFlowsByMode,
  createFlowFromTemplate,
  detectTemplateFromBrief,
  getAvailableTemplates,
  listUserFlows,
} from "../flowAutomation";
import { getFlowTemplate } from "./flowTemplates";
import { AffiliatesService } from "../affiliates";
import bcrypt from "bcryptjs";
import { SKILLS, NAV_PATHS, buildSkillsCatalog } from "./squads";
import { getSkillMeta } from "./skillMeta";
import { combineMemoryBlocks } from "./memory";
import type { AdminAgentMemory } from "./sessionStore";
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
const affiliatesService = new AffiliatesService();

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
      if (directSkill === "instagram.post.create") turn.nextSkill = "instagram.post.confirm";
      if (directSkill === "facebook.post.create") turn.nextSkill = "facebook.post.confirm";
      if (directSkill === "automation.create") turn.nextSkill = "automation.confirm";
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

    let execCtx: AdminAgentContext = selection.context
      ? { ...ctx, skillContext: { ...ctx.skillContext, ...selection.context } }
      : ctx;
    if (
      (selection.skill === "instagram.post.create"
        || selection.skill === "facebook.post.create"
        || selection.skill === "automation.create")
      && !String(execCtx.skillContext?.brief || "").trim()
      && trimmed
    ) {
      execCtx = {
        ...execCtx,
        skillContext: { ...execCtx.skillContext, brief: trimmed },
      };
    }
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
    if (selection.skill === "instagram.post.create") {
      turn.nextSkill = "instagram.post.confirm";
    }
    if (selection.skill === "facebook.post.create") {
      turn.nextSkill = "facebook.post.confirm";
    }
    if (selection.skill === "automation.create") {
      turn.nextSkill = "automation.confirm";
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
    if (skillId === "instagram.open" || skillId === "instagram.post.create" || skillId === "instagram.analyze" || skillId === "instagram.messages") {
      turn.presentation = "inline";
      turn.canvasRoute = "/instagram";
    }
    if (skillId === "instagram.post.confirm") {
      turn.presentation = "inline";
    }
    if (skillId === "facebook.open" || skillId === "facebook.post.create" || skillId === "facebook.analyze") {
      turn.presentation = "inline";
      turn.canvasRoute = "/facebook";
    }
    if (skillId === "facebook.post.confirm") {
      turn.presentation = "inline";
    }
    if (skillId === "automation.open" || skillId === "automation.create") {
      turn.presentation = "inline";
      // Hub de gestão: página Automações (não Fluxos, não Instagram)
      turn.canvasRoute = "/automacoes";
    }
    if (skillId === "flow.builder") {
      turn.presentation = "inline";
      turn.canvasRoute = "/fluxos";
    }
    if (skillId === "automation.confirm") {
      turn.presentation = "inline";
    }
    if (
      skillId === "affiliate.open" || skillId === "affiliate.create" || skillId === "affiliate.analyze"
      || skillId === "affiliate.approve" || skillId === "affiliate.config" || skillId === "affiliate.payouts"
      || skillId === "affiliate.materials"
    ) {
      turn.presentation = "inline";
      turn.canvasRoute = "/afiliados";
    }
    if (skillId === "affiliate.create.confirm" || skillId === "affiliate.config.confirm" || skillId === "affiliate.payout.confirm") {
      turn.presentation = "inline";
    }
    if (skillId === "dashboard.overview" || skillId === "dashboard.show") {
      turn.presentation = "inline";
      turn.canvasRoute = "/dashboard";
    }
    if (skillId === "settings.open") {
      turn.presentation = "inline";
      turn.canvasRoute = "/configuracoes";
    }
    if (skillId === "design.edit") {
      turn.presentation = "inline";
      turn.canvasRoute = "/loja";
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

    const memoryBlock = combineMemoryBlocks(
      ctx.sessionMemory as AdminAgentMemory | undefined,
      ctx.brandMemory as AdminAgentMemory | undefined,
    );

    const prompt = `Você é o orquestrador do painel admin LeadCapture — um sistema Agent-Driven onde o chat monta a UI.

CONTEXTO:
- Página atual: ${ctx.currentPath || "/admin"}
- Brand: ${ctx.brandId || "não definida"}
${memoryBlock ? `\n${memoryBlock}\n` : ""}
${ctx.sessionSummary ? `RESUMO DA CONVERSA (mensagens antigas compactadas):\n${ctx.sessionSummary}\n` : ""}
${ctx.pastSessionContext ? `${ctx.pastSessionContext}\n` : ""}
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
    }, {
      functionKey: "text.admin.orchestrator",
      temperature: 0.2,
    });

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

    if (ev?.action === "submit_form" && ev.componentId === "ig-post-form") {
      const brief = String(ev.payload?.brief || "").trim();
      if (!brief) return null;
      return {
        skill: "instagram.post.create",
        squad: "social",
        message: "Gerando post com IA…",
        context: {
          brief,
          objective: String(ev.payload?.objective || "").trim(),
          tone: String(ev.payload?.tone || "").trim(),
        },
        nextSkill: "instagram.post.confirm",
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "automation-brief-form") {
      const brief = String(ev.payload?.brief || "").trim();
      if (!brief) return null;
      return {
        skill: "automation.create",
        squad: "automations",
        message: "Montando automação a partir do seu briefing…",
        context: { brief },
        nextSkill: "automation.confirm",
      };
    }

    if (ev?.action === "select_option" && ev.componentId === "auto-templates") {
      const templateId = String(ev.payload?.optionId || "").trim();
      if (!templateId) return null;
      return {
        skill: "automation.create",
        squad: "automations",
        message: "Carregando template…",
        context: { templateId },
        nextSkill: "automation.confirm",
      };
    }

    if (ev?.action === "flow_activate" || ev?.action === "flow_save_draft") {
      const templateId = String(ev.payload?.templateId || sk?.templateId || "").trim();
      if (!templateId) return null;
      return {
        skill: "automation.confirm",
        squad: "automations",
        message: ev.action === "flow_activate" ? "Ativando fluxo…" : "Salvando rascunho…",
        context: {
          templateId,
          flowName: String(ev.payload?.flowName || sk?.flowName || "").trim(),
          action: ev.action,
        },
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "order-customer-form") {
      const customer = String(ev.payload?.customer || "").trim();
      if (!customer) return null;
      return {
        skill: "order.assisted",
        squad: "catalog",
        message: `Pedido para ${customer}. Escolha os produtos:`,
        context: { customer, step: "items" },
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "order-delivery-form") {
      const address = String(ev.payload?.address || "").trim();
      const deliveryType = String(ev.payload?.delivery_type || "").trim();
      if (!address || !deliveryType) return null;
      return {
        skill: "order.assisted",
        squad: "catalog",
        message: "Como será o pagamento?",
        context: {
          customer: sk?.customer,
          step: "payment",
          address,
          delivery_type: deliveryType,
          cart: sk?.cart,
        },
      };
    }

    if (ev?.action === "select_option" && ev.componentId === "order-payment-picker") {
      const payment = String(ev.payload?.optionId || ev.payload?.label || "").trim();
      if (!payment) return null;
      return {
        skill: "order.assisted",
        squad: "catalog",
        message: "Revise o pedido antes de confirmar:",
        context: {
          customer: sk?.customer,
          step: "review",
          address: sk?.address,
          delivery_type: sk?.delivery_type,
          payment,
          cart: sk?.cart,
        },
      };
    }

    if (ev?.action === "order_confirm_pdv") {
      return {
        skill: "order.assisted",
        squad: "catalog",
        message: "Abrindo PDV com os dados do pedido…",
        context: { ...sk, step: "done" },
      };
    }

    if (ev?.action === "submit_form" && ev.componentId === "fb-post-form") {
      const brief = String(ev.payload?.brief || "").trim();
      if (!brief) return null;
      return {
        skill: "facebook.post.create",
        squad: "social",
        message: "Gerando post do Facebook com IA…",
        context: {
          brief,
          objective: String(ev.payload?.objective || "").trim(),
          tone: String(ev.payload?.tone || "").trim(),
        },
        nextSkill: "facebook.post.confirm",
      };
    }

    if (ev?.action === "fb_publish_now" || ev?.action === "fb_schedule" || ev?.action === "fb_save_draft") {
      const postId = String(ev.payload?.postId || sk?.postId || "").trim();
      if (!postId) return null;
      const action = ev.action;
      if (action === "fb_publish_now") {
        return { skill: "facebook.post.confirm", squad: "social", message: "Publicando no Facebook…", context: { postId, action } };
      }
      if (action === "fb_schedule") {
        const scheduledAt = String(ev.payload?.scheduledAt || "").trim();
        if (!scheduledAt) return null;
        return { skill: "facebook.post.confirm", squad: "social", message: "Agendando post…", context: { postId, action, scheduledAt } };
      }
      return { skill: "facebook.post.confirm", squad: "social", message: "Rascunho salvo.", context: { postId, action } };
    }

    if (ev?.action === "ig_publish_now" || ev?.action === "ig_schedule" || ev?.action === "ig_save_draft") {
      const postId = String(ev.payload?.postId || sk?.postId || "").trim();
      if (!postId) return null;
      const action = ev.action;
      if (action === "ig_publish_now") {
        return {
          skill: "instagram.post.confirm",
          squad: "social",
          message: "Publicando no Instagram…",
          context: { postId, action },
        };
      }
      if (action === "ig_schedule") {
        const scheduledAt = String(ev.payload?.scheduledAt || "").trim();
        if (!scheduledAt) return null;
        return {
          skill: "instagram.post.confirm",
          squad: "social",
          message: "Agendando post…",
          context: { postId, action, scheduledAt },
        };
      }
      return {
        skill: "instagram.post.confirm",
        squad: "social",
        message: "Rascunho salvo.",
        context: { postId, action },
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
    if (
      /cri(ar|e)\s+(um\s+)?(fluxo|automação|automacao)|fluxo\s+de\s+pedido|pedido\s+completo|comportamento\s+reativ/i.test(lower)
      && /whatsapp|whats|zap/i.test(lower)
    ) {
      return {
        squad: "automations",
        skill: "automation.create",
        message: "Vou montar a automação WhatsApp com as fases do fluxo…",
        context: { brief: message },
        nextSkill: "automation.confirm",
      };
    }
    if (/automação|automacao|fluxo/i.test(lower) && /proativ|reativ|whatsapp/i.test(lower)) {
      return { squad: "automations", skill: "automation.open", message: "Suas automações:" };
    }
    if (/fluxo|automação\s+visual|editor\s+de\s+fluxo/i.test(lower)) {
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
    if (/cri(ar|e)\s+(um\s+)?post|postar|publicar|fazer\s+(um\s+)?post|legenda\s+para/i.test(lower) && /facebook|face\s*book|\bfb\b/i.test(lower)) {
      return {
        squad: "social",
        skill: "facebook.post.create",
        message: "Vou montar o post do Facebook com IA…",
        context: { brief: message },
      };
    }
    if (/cri(ar|e)\s+(um\s+)?post|postar\s+no\s+insta|publicar\s+no\s+instagram|fazer\s+(um\s+)?post|legenda\s+para/i.test(lower)) {
      return {
        squad: "social",
        skill: "instagram.post.create",
        message: "Vou montar o post com IA. Um momento…",
        context: { brief: message },
      };
    }
    if (/(analis|métricas?|performance|insights|engajamento)/i.test(lower) && /facebook|\bfb\b/i.test(lower)) {
      return { squad: "social", skill: "facebook.analyze", message: "Analisando sua página Facebook…" };
    }
    if (/(analis|métricas?|performance|insights|engajamento)/i.test(lower) && /instagram|insta/i.test(lower)) {
      return { squad: "social", skill: "instagram.analyze", message: "Analisando sua conta Instagram…" };
    }
    if (/(dm|direct|mensagens?)/i.test(lower) && /instagram|insta/i.test(lower)) {
      return { squad: "social", skill: "instagram.messages", message: "Abrindo suas DMs do Instagram…" };
    }
    if (/facebook|\bfb\b|face\s*book/i.test(lower)) {
      return { squad: "social", skill: "facebook.open", message: "Abrindo o Facebook..." };
    }
    if (/instagram|insta\b|reels?\b|stories?\b/i.test(lower)) {
      return { squad: "social", skill: "instagram.open", message: "Abrindo o Instagram..." };
    }
    if (/cadastr(ar|e)\s+(um\s+)?afiliado|novo\s+(parceiro|afiliado)/i.test(lower)) {
      return { squad: "affiliates", skill: "affiliate.create", message: "Vamos cadastrar o parceiro:" };
    }
    if (/configur(ar|e)\s+(o\s+)?programa\s+de\s+afiliados|comissão\s+padrão|saque\s+mínimo/i.test(lower)) {
      return { squad: "affiliates", skill: "affiliate.config", message: "Configurações do programa de afiliados:" };
    }
    if (/aprovar\s+(comiss|afiliado)|comissões?\s+pendentes/i.test(lower)) {
      return { squad: "affiliates", skill: "affiliate.approve", message: "Comissões e aprovações pendentes:" };
    }
    if (/saque|payout|pix\s+do\s+afiliado/i.test(lower)) {
      return { squad: "affiliates", skill: "affiliate.payouts", message: "Solicitações de saque:" };
    }
    if (/afiliado|parceiro|programa\s+de\s+afiliados|cupom\s+do\s+afiliado/i.test(lower)) {
      return { squad: "affiliates", skill: "affiliate.open", message: "Seu programa de afiliados:" };
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
        } else if (channel === "instagram") {
          components.push({
            id: "channel-nav",
            type: "button",
            props: { label: "Abrir Instagram", path: "/instagram", variant: "primary" },
          });
          actions.push({ type: "navigate", payload: { path: "/instagram" } });
        } else if (channel === "facebook") {
          components.push({
            id: "fb-stats",
            type: "facebook_stats",
            props: { connected: false, live: true },
          });
          components.push({
            id: "channel-nav",
            type: "button",
            props: { label: "Abrir Facebook", path: "/facebook", variant: "primary" },
          });
          actions.push({ type: "navigate", payload: { path: "/facebook" } });
        }
        break;
      }

      case "order.assisted": {
        const customer = String(sk.customer || "").trim();
        const step = String(sk.step || "").trim() || (customer ? "items" : "customer");

        if (step === "customer" || !customer) {
          components.push({
            id: "order-customer-form",
            type: "form",
            props: {
              title: "Para quem é o pedido?",
              fields: [
                { name: "customer", label: "Nome do cliente", type: "text", placeholder: "Ex: João Silva" },
                { name: "phone", label: "WhatsApp (opcional)", type: "text", placeholder: "5511999999999" },
              ],
              submitLabel: "Continuar",
            },
          });
          break;
        }

        if (step === "items") {
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
                { key: "price", label: "Preço" },
              ],
              rows: products.rows,
              rowType: "product",
              emptyLabel: "Nenhum produto no catálogo.",
            },
          });
          components.push({
            id: "order-items-hint",
            type: "text",
            props: {
              content: "Selecione itens na tabela ou diga no chat: \"adicionar 2x Produto X\". Depois informe entrega.",
            },
          });
          components.push({
            id: "order-delivery-form",
            type: "form",
            props: {
              title: "Entrega",
              fields: [
                { name: "address", label: "Endereço", type: "text", placeholder: "Rua, número, bairro" },
                {
                  name: "delivery_type",
                  label: "Tipo",
                  type: "select",
                  options: [
                    { value: "retirada", label: "Retirada" },
                    { value: "entrega", label: "Entrega padrão" },
                    { value: "expressa", label: "Entrega expressa" },
                  ],
                },
              ],
              submitLabel: "Continuar para pagamento",
            },
          });
          break;
        }

        if (step === "payment") {
          components.push({
            id: "order-payment-picker",
            type: "option_picker",
            props: {
              title: "Forma de pagamento",
              options: [
                { id: "pix", label: "PIX", description: "Pagamento instantâneo" },
                { id: "cartao", label: "Cartão", description: "Crédito ou débito na entrega" },
                { id: "dinheiro", label: "Dinheiro", description: "Pagamento na entrega" },
              ],
            },
          });
          break;
        }

        if (step === "review") {
          const payment = String(sk.payment || "");
          const deliveryType = String(sk.delivery_type || "");
          const address = String(sk.address || "");
          components.push({
            id: "order-review",
            type: "confirmation",
            props: {
              title: `Pedido para ${customer}`,
              description: [
                deliveryType ? `Entrega: ${deliveryType}` : "",
                address ? `Endereço: ${address}` : "",
                payment ? `Pagamento: ${payment}` : "",
              ].filter(Boolean).join(" · ") || "Revise os dados antes de finalizar.",
              confirmLabel: "Abrir PDV e finalizar",
            },
          });
          components.push({
            id: "order-pdv-btn",
            type: "button",
            props: { label: "Abrir tirar pedido", path: "/tirar-pedido", variant: "primary" },
          });
          components.push({
            id: "order-flow-suggest",
            type: "text",
            props: {
              content: "Dica: diga \"crie um fluxo de pedidos completo para WhatsApp\" para automatizar este processo no chat do cliente.",
            },
          });
          actions.push({ type: "navigate", payload: { path: "/tirar-pedido" } });
          break;
        }

        components.push({
          id: "order-done",
          type: "text",
          props: { content: "Pedido encaminhado ao PDV. Registre venda, fatura e expedição no sistema." },
        });
        actions.push({ type: "navigate", payload: { path: "/tirar-pedido" } });
        break;
      }

      case "automation.open": {
        const counts = await countFlowsByMode(ctx.userId);
        const flows = await listUserFlows(ctx.userId);
        components.push({
          id: "auto-stats",
          type: "automation_stats",
          props: {
            total: counts.total,
            reactive: counts.reactive,
            proactive: counts.proactive,
            flows: flows.slice(0, 6).map((f) => ({
              id: f.id,
              name: f.name,
              status: f.status,
              trigger: f.triggerSubtype,
            })),
            templates: getAvailableTemplates().map((t) => ({
              id: t.id,
              name: t.name,
              mode: t.mode,
            })),
            live: true,
          },
        });
        components.push(this.buildNavSuggestions(["automacoes", "fluxos", "instagram"]));
        // Gestão principal em Automações — Instagram só espelha as que usam IG
        actions.push({ type: "navigate", payload: { path: "/automacoes" } });
        break;
      }

      case "automation.create": {
        const templateIdDirect = String(sk.templateId || "").trim();
        if (templateIdDirect) {
          const template = detectTemplateFromBrief(templateIdDirect) || getFlowTemplate(templateIdDirect);
          if (template) {
            components.push({
              id: "auto-flow-preview",
              type: "automation_flow_preview",
              props: {
                draftId: `draft-${template.id}-${Date.now()}`,
                templateId: template.id,
                name: template.name,
                description: template.description,
                mode: template.mode,
                channel: template.channel,
                triggerSubtype: template.triggerSubtype,
                phases: template.phases,
                nodeCount: template.nodes.length,
              },
            });
            break;
          }
        }

        const brief = String(sk.brief || "").trim();
        if (!brief) {
          components.push({
            id: "automation-brief-form",
            type: "form",
            props: {
              title: "Qual automação você quer criar?",
              fields: [
                {
                  name: "brief",
                  label: "Descreva o comportamento",
                  type: "textarea",
                  placeholder: "Ex: fluxo de pedidos completo para WhatsApp com itens, entrega, pagamento e expedição",
                },
              ],
              submitLabel: "Gerar fluxo",
            },
          });
          break;
        }

        const template = detectTemplateFromBrief(brief);
        if (!template) {
          components.push({
            id: "auto-no-template",
            type: "text",
            props: {
              content: "Não identifiquei um template exato. Tente: \"fluxo de pedidos completo para WhatsApp\" ou \"boas-vindas proativa para novo lead\".",
            },
          });
          components.push({
            id: "auto-templates",
            type: "option_picker",
            props: {
              title: "Templates disponíveis",
              options: getAvailableTemplates().map((t) => ({
                id: t.id,
                label: t.name,
                description: t.description,
              })),
            },
          });
          break;
        }

        const draftId = `draft-${template.id}-${Date.now()}`;
        components.push({
          id: "auto-flow-preview",
          type: "automation_flow_preview",
          props: {
            draftId,
            templateId: template.id,
            name: template.name,
            description: template.description,
            mode: template.mode,
            channel: template.channel,
            triggerSubtype: template.triggerSubtype,
            phases: template.phases,
            nodeCount: template.nodes.length,
          },
        });
        break;
      }

      case "automation.confirm": {
        const templateId = String(sk.templateId || "").trim();
        const action = String(sk.action || "flow_save_draft");
        const flowName = String(sk.flowName || "").trim();

        if (!templateId) {
          components.push({
            id: "auto-missing",
            type: "text",
            props: { content: "Fluxo não encontrado. Crie uma automação pelo chat primeiro." },
          });
          break;
        }

        try {
          const { flowId, template } = await createFlowFromTemplate(ctx.userId, templateId, {
            name: flowName || undefined,
            activate: action === "flow_activate",
          });
          const statusLabel = action === "flow_activate" ? "ativado" : "salvo como rascunho";
          components.push({
            id: "auto-created",
            type: "text",
            props: {
              content: `Fluxo "${template.name}" ${statusLabel}. ${template.phases.length} fases · ${template.nodes.length} nós. Edite detalhes no editor avançado.`,
            },
          });
          components.push({
            id: "auto-open-flow",
            type: "button",
            props: { label: "Abrir no editor", path: "/fluxos", variant: "primary" },
          });
          actions.push({ type: "navigate", payload: { path: "/fluxos" } });
          components.push({
            id: "auto-flow-meta",
            type: "text",
            props: { content: `ID: ${flowId}` },
          });
        } catch (err: any) {
          components.push({
            id: "auto-err",
            type: "text",
            props: { content: `Erro ao criar fluxo: ${err?.message || "falha"}` },
          });
        }
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

      case "instagram.open": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({
            id: "ig-no-brand",
            type: "text",
            props: { text: "Selecione uma marca para gerenciar o Instagram." },
          });
          break;
        }
        try {
          const conn = await instagramService.getConnection(brandId);
          const profile = await instagramService.getProfile(brandId, { refresh: false });
          // Mesma regra do /connection-status e InstagramPage: token/conta salva = conectado
          const connected = !!(
            conn?.access_token
            || conn?.username
            || conn?.account_id
            || profile?.is_connected
            || profile?.username
          );
          components.push({
            id: "ig-stats",
            type: "instagram_stats",
            props: {
              connected,
              username: profile?.username || conn?.username || "",
              name: profile?.name || conn?.name || "",
              followers: Number(profile?.followers_count || conn?.followers_count || 0),
              following: Number(profile?.follows_count || conn?.follows_count || 0),
              mediaCount: Number(profile?.media_count || conn?.media_count || 0),
              avatarUrl: profile?.profile_picture_url || conn?.profile_picture_url || "",
              live: true,
            },
          });
        } catch {
          components.push({
            id: "ig-stats",
            type: "instagram_stats",
            props: { connected: false, live: true },
          });
        }
        components.push(this.buildNavSuggestions(["instagram"]));
        actions.push({ type: "navigate", payload: { path: "/instagram" } });
        break;
      }

      case "instagram.post.create": {
        const brandId = String(ctx.brandId || "").trim();
        const brief = String(sk.brief || "").trim();

        if (!brief) {
          components.push({
            id: "ig-post-form",
            type: "form",
            props: {
              title: "Novo post Instagram",
              fields: [
                { name: "brief", label: "Sobre o que é o post?", type: "textarea", placeholder: "Ex: promoção de hidratação capilar com 20% off até sexta" },
                { name: "objective", label: "Objetivo (opcional)", type: "text", placeholder: "Ex: gerar agendamentos" },
                { name: "tone", label: "Tom (opcional)", type: "text", placeholder: "Ex: descontraído, profissional" },
              ],
              submitLabel: "Gerar post com IA",
              nextSkill: "instagram.post.create",
            },
          });
          break;
        }

        if (!brandId) {
          components.push({ id: "ig-no-brand", type: "text", props: { content: "Selecione uma marca para criar posts." } });
          break;
        }

        const draft = await generateInstagramPostFromBrief(ctx.userId, brandId, {
          brief,
          objective: String(sk.objective || "").trim() || undefined,
          tone: String(sk.tone || "").trim() || undefined,
        });

        if ("error" in draft) {
          components.push({ id: "ig-error", type: "text", props: { content: draft.error } });
          if (draft.error.includes("não conectado")) {
            components.push({
              id: "ig-connect-btn",
              type: "button",
              props: { label: "Conectar Instagram", path: "/instagram", variant: "primary" },
            });
            actions.push({ type: "navigate", payload: { path: "/instagram" } });
          }
          break;
        }

        const previewCaption = draft.caption.length > 280
          ? `${draft.caption.slice(0, 280)}…`
          : draft.caption;

        components.push({
          id: "ig-post-preview",
          type: "instagram_post_preview",
          props: {
            postId: draft.postId,
            caption: draft.caption,
            previewCaption,
            mediaUrl: draft.mediaUrl,
            brief: draft.brief,
            imageSource: draft.imageSource,
          },
        });
        components.push({
          id: "ig-preview-hint",
          type: "text",
          props: { content: "Revise o preview. Quer publicar agora, agendar ou manter como rascunho?" },
        });
        actions.push({ type: "navigate", payload: { path: "/instagram" } });
        break;
      }

      case "instagram.post.confirm": {
        const brandId = String(ctx.brandId || "").trim();
        const postId = String(sk.postId || "").trim();
        const action = String(sk.action || "");

        if (!brandId || !postId) {
          components.push({ id: "ig-missing", type: "text", props: { content: "Post não encontrado. Crie um novo post pelo chat." } });
          break;
        }

        if (action === "ig_publish_now") {
          const result = await instagramService.publishPost(brandId, postId);
          components.push({
            id: "ig-publish-result",
            type: "text",
            props: {
              content: result.ok
                ? "Post publicado no Instagram com sucesso."
                : `Não foi possível publicar: ${result.message}`,
            },
          });
          if (result.ok) {
            components.push({
              id: "ig-stats",
              type: "instagram_stats",
              props: { connected: true, live: true },
            });
          }
          break;
        }

        if (action === "ig_schedule") {
          const scheduledAt = String(sk.scheduledAt || "").trim();
          if (!scheduledAt) {
            components.push({ id: "ig-sched-missing", type: "text", props: { content: "Informe data e hora para agendar." } });
            break;
          }
          await instagramService.updatePost(postId, {
            status: "scheduled",
            scheduled_at: new Date(scheduledAt).toISOString(),
          });
          const when = new Date(scheduledAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          });
          components.push({
            id: "ig-scheduled",
            type: "text",
            props: { content: `Post agendado para ${when}. Será publicado automaticamente nesse horário — revise no calendário do Instagram.` },
          });
          actions.push({ type: "navigate", payload: { path: "/instagram" } });
          break;
        }

        components.push({
          id: "ig-draft-saved",
          type: "text",
          props: { content: "Rascunho salvo. Abra o studio para editar ou publicar quando quiser." },
        });
        actions.push({ type: "navigate", payload: { path: "/instagram" } });
        break;
      }

      case "instagram.analyze": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "ig-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const profile = await instagramService.getProfile(brandId);
        if (!profile?.is_connected) {
          components.push({ id: "ig-not-connected", type: "text", props: { content: "Conecte o Instagram para ver métricas." } });
          break;
        }
        const analytics = await instagramService.fetchAnalytics(brandId, 28);
        const media = await instagramService.fetchMedia(brandId, 6);
        const account = analytics?.account;
        const reach = account?.reach || 0;
        const views = account?.views || 0;
        const profileViews = account?.profile_views || 0;
        const engaged = account?.accounts_engaged || 0;

        components.push({
          id: "ig-analyze-kpis",
          type: "kpi_row",
          props: {
            items: [
              { label: "Seguidores", value: Number(analytics?.profile.followers_count || profile.followers_count || 0), icon: "users" },
              { label: "Posts", value: Number(analytics?.profile.media_count || profile.media_count || 0), icon: "package" },
              { label: "Alcance 28d", value: reach, icon: "megaphone" },
              { label: "Views perfil", value: profileViews, icon: "zap" },
            ],
            subtitle: views > 0
              ? `${views.toLocaleString("pt-BR")} visualizações · ${engaged.toLocaleString("pt-BR")} contas engajadas (28 dias)`
              : engaged > 0
                ? `${engaged.toLocaleString("pt-BR")} contas engajadas (28 dias)`
                : undefined,
          },
        });

        if (media.length) {
          components.push({
            id: "ig-recent-posts",
            type: "table",
            props: {
              title: "Posts recentes",
              columns: ["Legenda", "Curtidas", "Comentários"],
              rows: media.slice(0, 5).map((m: any) => ({
                id: m.id,
                cells: [
                  String(m.caption || "(sem legenda)").slice(0, 60),
                  String(m.like_count ?? "—"),
                  String(m.comments_count ?? "—"),
                ],
              })),
            },
          });
        }

        components.push(this.buildNavSuggestions(["instagram"]));
        actions.push({ type: "navigate", payload: { path: "/instagram" } });
        break;
      }

      case "instagram.messages": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "ig-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const profile = await instagramService.getProfile(brandId);
        if (!profile?.is_connected) {
          components.push({ id: "ig-not-connected", type: "text", props: { content: "Conecte o Instagram para ver DMs." } });
          break;
        }
        const { conversations } = await instagramService.getConversations(brandId);
        if (!conversations.length) {
          components.push({ id: "ig-no-dms", type: "text", props: { content: "Nenhuma conversa no Direct no momento." } });
        } else {
          components.push({
            id: "ig-dms-table",
            type: "table",
            props: {
              title: "Direct — conversas recentes",
              columns: ["Conversa", "Última mensagem"],
              rows: conversations.slice(0, 8).map((c, i) => {
                const from = c.username || c.sender_id || "—";
                const handle = String(from).startsWith("@") ? from : `@${from}`;
                const text = String(c.last_message || "").slice(0, 80) || "(mídia)";
                return {
                  id: String(c.id || i),
                  cells: [handle, text],
                };
              }),
            },
          });
        }
        components.push({
          id: "ig-dms-btn",
          type: "button",
          props: { label: "Responder no studio", path: "/instagram", variant: "primary" },
        });
        actions.push({ type: "navigate", payload: { path: "/instagram" } });
        break;
      }

      case "facebook.open": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "fb-no-brand", type: "text", props: { content: "Selecione uma marca para gerenciar o Facebook." } });
          break;
        }
        try {
          const conn = await facebookService.getConnection(brandId);
          const profile = await facebookService.getProfile(brandId);
          const connected = !!conn && !!profile?.is_connected;
          components.push({
            id: "fb-stats",
            type: "facebook_stats",
            props: {
              connected,
              pageName: profile?.page_name || profile?.name || "",
              category: profile?.page_category || profile?.category || "",
              fans: Number(profile?.fan_count || 0),
              followers: Number(profile?.followers_count || 0),
              avatarUrl: profile?.page_picture_url || profile?.picture_url || "",
              live: true,
            },
          });
        } catch {
          components.push({
            id: "fb-stats",
            type: "facebook_stats",
            props: { connected: false, live: true },
          });
        }
        components.push(this.buildNavSuggestions(["facebook"]));
        actions.push({ type: "navigate", payload: { path: "/facebook" } });
        break;
      }

      case "facebook.post.create": {
        const brandId = String(ctx.brandId || "").trim();
        const brief = String(sk.brief || "").trim();

        if (!brief) {
          components.push({
            id: "fb-post-form",
            type: "form",
            props: {
              title: "Novo post Facebook",
              fields: [
                { name: "brief", label: "Sobre o que é o post?", type: "textarea", placeholder: "Ex: promoção de verão na loja com frete grátis" },
                { name: "objective", label: "Objetivo (opcional)", type: "text", placeholder: "Ex: aumentar vendas" },
                { name: "tone", label: "Tom (opcional)", type: "text", placeholder: "Ex: amigável, institucional" },
              ],
              submitLabel: "Gerar post com IA",
              nextSkill: "facebook.post.create",
            },
          });
          break;
        }

        if (!brandId) {
          components.push({ id: "fb-no-brand", type: "text", props: { content: "Selecione uma marca para criar posts." } });
          break;
        }

        const draft = await generateFacebookPostFromBrief(ctx.userId, brandId, {
          brief,
          objective: String(sk.objective || "").trim() || undefined,
          tone: String(sk.tone || "").trim() || undefined,
        });

        if ("error" in draft) {
          components.push({ id: "fb-error", type: "text", props: { content: draft.error } });
          if (draft.error.includes("não conectado")) {
            components.push({
              id: "fb-connect-btn",
              type: "button",
              props: { label: "Conectar Facebook", path: "/facebook", variant: "primary" },
            });
            actions.push({ type: "navigate", payload: { path: "/facebook" } });
          }
          break;
        }

        const previewMessage = draft.message.length > 280 ? `${draft.message.slice(0, 280)}…` : draft.message;

        components.push({
          id: "fb-post-preview",
          type: "facebook_post_preview",
          props: {
            postId: draft.postId,
            message: draft.message,
            previewMessage,
            mediaUrl: draft.mediaUrl,
            brief: draft.brief,
            imageSource: draft.imageSource,
          },
        });
        components.push({
          id: "fb-preview-hint",
          type: "text",
          props: { content: "Revise o preview. Quer publicar agora, agendar ou manter como rascunho?" },
        });
        actions.push({ type: "navigate", payload: { path: "/facebook" } });
        break;
      }

      case "facebook.post.confirm": {
        const brandId = String(ctx.brandId || "").trim();
        const postId = String(sk.postId || "").trim();
        const action = String(sk.action || "");

        if (!brandId || !postId) {
          components.push({ id: "fb-missing", type: "text", props: { content: "Post não encontrado. Crie um novo post pelo chat." } });
          break;
        }

        if (action === "fb_publish_now") {
          const result = await facebookService.publishPost(brandId, postId);
          components.push({
            id: "fb-publish-result",
            type: "text",
            props: {
              content: result.ok
                ? "Post publicado no Facebook com sucesso."
                : `Não foi possível publicar: ${result.message}`,
            },
          });
          break;
        }

        if (action === "fb_schedule") {
          const scheduledAt = String(sk.scheduledAt || "").trim();
          if (!scheduledAt) {
            components.push({ id: "fb-sched-missing", type: "text", props: { content: "Informe data e hora para agendar." } });
            break;
          }
          await facebookService.updatePost(postId, {
            status: "scheduled",
            scheduled_at: new Date(scheduledAt).toISOString(),
          });
          const when = new Date(scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
          components.push({
            id: "fb-scheduled",
            type: "text",
            props: { content: `Post agendado para ${when}. Será publicado automaticamente nesse horário — revise no calendário do Facebook.` },
          });
          actions.push({ type: "navigate", payload: { path: "/facebook" } });
          break;
        }

        components.push({
          id: "fb-draft-saved",
          type: "text",
          props: { content: "Rascunho salvo. Abra o studio para editar ou publicar quando quiser." },
        });
        actions.push({ type: "navigate", payload: { path: "/facebook" } });
        break;
      }

      case "facebook.analyze": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "fb-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const profile = await facebookService.getProfile(brandId);
        if (!profile?.is_connected) {
          components.push({ id: "fb-not-connected", type: "text", props: { content: "Conecte o Facebook para ver métricas." } });
          break;
        }
        const insights = await facebookService.fetchInsights(brandId, "days_28");
        const feed = await facebookService.fetchPosts(brandId, 6);

        let engagements = 0;
        let impressions = 0;
        if (insights?.data) {
          for (const m of insights.data) {
            const val = Number(m.values?.[0]?.value || 0);
            if (m.name === "page_post_engagements") engagements = val;
            if (m.name === "page_impressions_unique") impressions = val;
          }
        }

        components.push({
          id: "fb-analyze-kpis",
          type: "kpi_row",
          props: {
            items: [
              { label: "Curtidas", value: Number(profile.fan_count || 0), icon: "users" },
              { label: "Seguidores", value: Number(profile.followers_count || 0), icon: "megaphone" },
              { label: "Engajamento", value: engagements, icon: "zap" },
              { label: "Alcance", value: impressions, icon: "package" },
            ],
          },
        });

        if (feed.length) {
          components.push({
            id: "fb-recent-posts",
            type: "table",
            props: {
              title: "Posts recentes",
              columns: ["Texto", "Curtidas", "Comentários"],
              rows: feed.slice(0, 5).map((p: any) => ({
                id: p.id,
                cells: [
                  String(p.message || "(sem texto)").slice(0, 60),
                  String(p.likes?.summary?.total_count ?? "—"),
                  String(p.comments?.summary?.total_count ?? "—"),
                ],
              })),
            },
          });
        }

        components.push(this.buildNavSuggestions(["facebook"]));
        actions.push({ type: "navigate", payload: { path: "/facebook" } });
        break;
      }

      case "affiliate.open":
      case "affiliate.analyze": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca para gerenciar afiliados." } });
          break;
        }
        try {
          const stats = await affiliatesService.getProgramStats(ctx.userId, brandId);
          components.push({
            id: "aff-stats",
            type: "affiliate_stats",
            props: {
              enabled: !!stats.program?.is_enabled,
              commissionPct: Number(stats.program?.default_commission_pct || 10),
              affiliatesTotal: stats.affiliates_total,
              affiliatesPending: stats.affiliates_pending,
              affiliatesActive: stats.affiliates_active,
              totalClicks: stats.total_clicks,
              totalSales: stats.total_sales,
              commissionPending: stats.commission_pending,
              commissionApproved: stats.commission_approved,
              payoutsRequested: stats.payouts_requested,
              commissionsPendingCount: stats.commissions_pending_count,
              materialsCount: stats.materials_count,
              topAffiliates: (stats.top_affiliates || []).slice(0, 5).map((a: any) => ({
                id: a.id,
                name: a.display_name,
                code: a.code,
                status: a.status,
                clicks: a.total_clicks,
                sales: a.total_sales,
                commission: a.total_commission,
              })),
              live: true,
            },
          });
        } catch (affErr: any) {
          components.push({
            id: "aff-stats-err",
            type: "text",
            props: {
              content: `Não foi possível carregar estatísticas do programa (${affErr?.message || "erro"}). Abra a gestão para configurar.`,
            },
          });
        }
        components.push(this.buildNavSuggestions(["afiliados"]));
        actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        break;
      }

      case "affiliate.create": {
        const brandId = String(ctx.brandId || "").trim();
        const name = String(sk.name || "").trim();
        const email = String(sk.email || "").trim();
        const password = String(sk.password || "").trim();
        const phone = String(sk.phone || "").trim();
        const code = String(sk.code || "").trim();
        const region = String(sk.region || "").trim();

        if (!name || !email || !password) {
          components.push({
            id: "aff-create-form",
            type: "form",
            props: {
              title: "Cadastrar parceiro",
              fields: [
                { name: "name", label: "Nome", type: "text", placeholder: "João Silva" },
                { name: "email", label: "Email de login", type: "email", placeholder: "joao@email.com" },
                { name: "password", label: "Senha (min 6)", type: "password", placeholder: "••••••" },
                { name: "code", label: "Código do link (opcional)", type: "text", placeholder: "joao10" },
                { name: "phone", label: "Telefone", type: "text", placeholder: "31999998888" },
                { name: "region", label: "Região", type: "text", placeholder: "BH, Contagem…" },
              ],
              submitLabel: "Revisar cadastro",
              nextSkill: "affiliate.create",
            },
          });
          break;
        }

        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        if (password.length < 6) {
          components.push({ id: "aff-pwd", type: "text", props: { content: "Senha deve ter pelo menos 6 caracteres." } });
          break;
        }

        const config = await affiliatesService.getOrCreateProgramConfig(ctx.userId, brandId);
        components.push({
          id: "aff-create-preview",
          type: "affiliate_create_preview",
          props: {
            draftId: `aff-draft-${Date.now()}`,
            name,
            email,
            password,
            phone: phone || null,
            code: code || null,
            region: region || null,
            commissionPct: Number(config.default_commission_pct || 10),
          },
        });
        break;
      }

      case "affiliate.create.confirm": {
        const brandId = String(ctx.brandId || "").trim();
        const name = String(sk.name || "").trim();
        const email = String(sk.email || "").trim();
        const password = String(sk.password || "").trim();
        const phone = String(sk.phone || "").trim() || null;
        const code = String(sk.code || "").trim() || null;
        const region = String(sk.region || "").trim() || null;

        if (!brandId || !email || !password || password.length < 6) {
          components.push({ id: "aff-missing", type: "text", props: { content: "Dados incompletos. Cadastre o parceiro novamente." } });
          break;
        }

        try {
          const config = await affiliatesService.getOrCreateProgramConfig(ctx.userId, brandId);
          const passwordHash = await bcrypt.hash(password, 12);
          const created = await affiliatesService.createAffiliateAccount({
            ownerUserId: ctx.userId,
            brandId,
            email,
            passwordHash,
            name: name || "Afiliado",
            phone,
            region,
            codeHint: code,
            autoApprove: config.auto_approve_affiliates !== false,
          });
          components.push({
            id: "aff-created",
            type: "text",
            props: {
              content: `Parceiro ${created.affiliate.display_name} cadastrado! Link: /afiliado/${created.affiliate.code} · Cupom: ${created.affiliate.coupon_code}`,
            },
          });
          components.push({
            id: "aff-open",
            type: "button",
            props: { label: "Abrir gestão completa", path: "/afiliados", variant: "primary" },
          });
          actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        } catch (err: any) {
          components.push({ id: "aff-err", type: "text", props: { content: `Erro: ${err?.message || "falha ao cadastrar"}` } });
        }
        break;
      }

      case "affiliate.config": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const config = await affiliatesService.getOrCreateProgramConfig(ctx.userId, brandId);
        const hasChanges = sk.is_enabled !== undefined || sk.default_commission_pct !== undefined
          || sk.min_withdrawal !== undefined || sk.cookie_days !== undefined;

        if (!hasChanges) {
          components.push({
            id: "aff-config-form",
            type: "form",
            props: {
              title: "Configurações do programa",
              fields: [
                { name: "default_commission_pct", label: "Comissão padrão (%)", type: "number", defaultValue: config.default_commission_pct },
                { name: "min_withdrawal", label: "Saque mínimo (R$)", type: "number", defaultValue: config.min_withdrawal },
                { name: "cookie_days", label: "Cookie (dias)", type: "number", defaultValue: config.cookie_days },
                { name: "payment_days", label: "Prazo pagamento (dias)", type: "number", defaultValue: config.payment_days },
              ],
              submitLabel: "Revisar alterações",
              nextSkill: "affiliate.config",
            },
          });
          components.push({
            id: "aff-config-hint",
            type: "text",
            props: { content: `Programa ${config.is_enabled ? "ativo" : "desativado"} · Aprovação automática: ${config.auto_approve_affiliates ? "sim" : "não"}. Ajustes avançados na página de gestão.` },
          });
          actions.push({ type: "navigate", payload: { path: "/afiliados" } });
          break;
        }

        const payload = {
          is_enabled: sk.is_enabled !== undefined ? !!sk.is_enabled : config.is_enabled,
          default_commission_pct: sk.default_commission_pct !== undefined ? Number(sk.default_commission_pct) : config.default_commission_pct,
          min_withdrawal: sk.min_withdrawal !== undefined ? Number(sk.min_withdrawal) : config.min_withdrawal,
          cookie_days: sk.cookie_days !== undefined ? Number(sk.cookie_days) : config.cookie_days,
          payment_days: sk.payment_days !== undefined ? Number(sk.payment_days) : config.payment_days,
          accept_new_affiliates: sk.accept_new_affiliates !== undefined ? !!sk.accept_new_affiliates : config.accept_new_affiliates,
          auto_approve_affiliates: sk.auto_approve_affiliates !== undefined ? !!sk.auto_approve_affiliates : config.auto_approve_affiliates,
        };

        components.push({
          id: "aff-config-preview",
          type: "affiliate_config_preview",
          props: { ...payload, draftId: `cfg-${Date.now()}` },
        });
        break;
      }

      case "affiliate.config.confirm": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        try {
          await affiliatesService.updateProgramConfig(ctx.userId, brandId, {
            is_enabled: sk.is_enabled !== undefined ? !!sk.is_enabled : undefined,
            default_commission_pct: sk.default_commission_pct !== undefined ? Number(sk.default_commission_pct) : undefined,
            min_withdrawal: sk.min_withdrawal !== undefined ? Number(sk.min_withdrawal) : undefined,
            cookie_days: sk.cookie_days !== undefined ? Number(sk.cookie_days) : undefined,
            payment_days: sk.payment_days !== undefined ? Number(sk.payment_days) : undefined,
            accept_new_affiliates: sk.accept_new_affiliates !== undefined ? !!sk.accept_new_affiliates : undefined,
            auto_approve_affiliates: sk.auto_approve_affiliates !== undefined ? !!sk.auto_approve_affiliates : undefined,
          });
          components.push({ id: "aff-cfg-saved", type: "text", props: { content: "Configurações do programa salvas!" } });
          actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        } catch (err: any) {
          components.push({ id: "aff-cfg-err", type: "text", props: { content: `Erro: ${err?.message || "falha"}` } });
        }
        break;
      }

      case "affiliate.approve": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const pendingAffiliates = await query<any[]>(
          `SELECT a.id, a.display_name, a.code, a.status, u.email
           FROM affiliates a
           INNER JOIN users u ON u.id = a.affiliate_user_id
           WHERE a.owner_user_id = ? AND a.brand_id = ? AND a.status = 'pending'
           ORDER BY a.created_at DESC LIMIT 10`,
          [ctx.userId, brandId]
        );
        const sales = await affiliatesService.listBrandSales(ctx.userId, brandId, 10);
        const pendingSales = sales.filter((s) => s.commission_status === "pending");

        if (pendingAffiliates.length) {
          components.push({
            id: "aff-pending-partners",
            type: "table",
            props: {
              title: "Afiliados aguardando aprovação",
              columns: ["Nome", "Email", "Código"],
              rows: pendingAffiliates.map((a) => ({
                id: a.id,
                cells: [a.display_name, a.email, a.code],
              })),
            },
          });
        }
        if (pendingSales.length) {
          components.push({
            id: "aff-pending-sales",
            type: "table",
            props: {
              title: "Comissões pendentes",
              columns: ["Parceiro", "Valor", "Status"],
              rows: pendingSales.map((s) => ({
                id: s.id,
                cells: [s.display_name, `R$ ${Number(s.commission_amount).toFixed(2)}`, s.commission_status],
              })),
            },
          });
          components.push({
            id: "aff-approve-all",
            type: "button",
            props: { label: "Aprovar comissões de pedidos pagos", path: "/afiliados", variant: "primary" },
          });
        }
        if (!pendingAffiliates.length && !pendingSales.length) {
          components.push({ id: "aff-none", type: "text", props: { content: "Nenhuma aprovação pendente no momento." } });
        }
        actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        break;
      }

      case "affiliate.payouts": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const rows = await query<any[]>(
          `SELECT p.*, a.display_name
           FROM affiliate_payouts p
           INNER JOIN affiliates a ON a.id = p.affiliate_id
           WHERE p.owner_user_id = ? AND p.brand_id = ? AND p.status = 'requested'
           ORDER BY p.created_at DESC LIMIT 8`,
          [ctx.userId, brandId]
        );
        if (!rows.length) {
          components.push({ id: "aff-no-payouts", type: "text", props: { content: "Nenhum saque pendente." } });
        } else {
          for (const p of rows.slice(0, 3)) {
            components.push({
              id: `aff-payout-${p.id}`,
              type: "affiliate_payout_preview",
              props: {
                payoutId: p.id,
                affiliateName: p.display_name,
                amount: Number(p.amount),
                pixKey: p.pix_key || "",
              },
            });
          }
        }
        actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        break;
      }

      case "affiliate.payout.confirm": {
        const payoutId = String(sk.payoutId || "").trim();
        const status = String(sk.status || "paid").trim();
        if (!payoutId) {
          components.push({ id: "aff-payout-missing", type: "text", props: { content: "Saque não encontrado." } });
          break;
        }
        await query(
          `UPDATE affiliate_payouts SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN NOW() ELSE paid_at END, updated_at = NOW()
           WHERE id = ? AND owner_user_id = ?`,
          [status, status, payoutId, ctx.userId]
        );
        components.push({ id: "aff-payout-done", type: "text", props: { content: `Saque marcado como ${status}.` } });
        actions.push({ type: "navigate", payload: { path: "/afiliados" } });
        break;
      }

      case "affiliate.materials": {
        const brandId = String(ctx.brandId || "").trim();
        if (!brandId) {
          components.push({ id: "aff-no-brand", type: "text", props: { content: "Selecione uma marca." } });
          break;
        }
        const materials = await affiliatesService.listMaterials(ctx.userId, brandId);
        if (!materials.length) {
          components.push({ id: "aff-no-mat", type: "text", props: { content: "Nenhum material cadastrado. Adicione na gestão completa." } });
        } else {
          components.push({
            id: "aff-materials",
            type: "table",
            props: {
              title: "Materiais de divulgação",
              columns: ["Título", "Tipo", "Região"],
              rows: materials.slice(0, 8).map((m: any) => ({
                id: m.id,
                cells: [m.title, m.type, m.region || "—"],
              })),
            },
          });
        }
        actions.push({ type: "navigate", payload: { path: "/afiliados" } });
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

      case "settings.open": {
        // Conta/org/marcas — WhatsApp é ferramenta à parte
        components.push(this.buildNavSuggestions(["configuracoes", "loja"]));
        break;
      }

      case "design.edit": {
        // UI principal no chat (StoreModuleBlock) + canvas /loja
        components.push(this.buildNavSuggestions(["loja", "produtos", "configuracoes"]));
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
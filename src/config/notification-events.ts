/**
 * Catálogo central de eventos → notificação + ação.
 * Complementa push-events.ts com templates, deep links e regras de ação.
 */
import type { PushAppContext, PushEventCategory, PushPriority } from "./push-events";

export type NotificationEventType =
  | "informational"
  | "action_required"
  | "critical_alert"
  | "approval_required"
  | "system_warning"
  | "financial_event"
  | "commercial_event"
  | "support_event"
  | "inventory_event"
  | "automation_event"
  | "security_event";

export type PlatformActionType =
  | "reply_lead"
  | "send_proposal"
  | "call_customer"
  | "approve_affiliate"
  | "review_commission"
  | "resolve_support"
  | "reconnect_whatsapp"
  | "separate_order"
  | "update_stock"
  | "approve_payout"
  | "review_campaign"
  | "fix_automation"
  | "perform_post_sale"
  | "trigger_recurrence"
  | "review_application"
  | "generic";

export type AutoActionRule = {
  action_type: PlatformActionType;
  title_template: string;
  description_template?: string;
  sla_minutes?: number;
  priority?: "low" | "normal" | "high" | "urgent" | "critical";
};

export type NotificationEventDefinition = {
  event_key: string;
  app_context: PushAppContext;
  category: PushEventCategory;
  event_type: NotificationEventType;
  default_priority: PushPriority;
  title_template: string;
  body_template: string;
  cta_label?: string;
  deep_link_template?: string;
  channels: Array<"in_app" | "push">;
  action_required: boolean;
  can_be_disabled_by_user: boolean;
  sound_key?: string;
  auto_action?: AutoActionRule;
  group_key?: string;
};

function def(
  app: PushAppContext,
  category: PushEventCategory,
  event_key: string,
  event_type: NotificationEventType,
  title: string,
  body: string,
  opts: Partial<NotificationEventDefinition> = {},
): NotificationEventDefinition {
  return {
    event_key,
    app_context: app,
    category,
    event_type,
    default_priority: opts.default_priority || "normal",
    title_template: title,
    body_template: body,
    cta_label: opts.cta_label,
    deep_link_template: opts.deep_link_template,
    channels: opts.channels || ["in_app", "push"],
    action_required:
      opts.action_required !== undefined
        ? opts.action_required
        : event_type === "action_required" || event_type === "critical_alert",
    can_be_disabled_by_user:
      opts.can_be_disabled_by_user !== undefined
        ? opts.can_be_disabled_by_user
        : event_type !== "critical_alert",
    sound_key: opts.sound_key,
    auto_action: opts.auto_action,
    group_key: opts.group_key,
  };
}

export const NOTIFICATION_EVENT_REGISTRY: NotificationEventDefinition[] = [
  /* ── Afiliado ── */
  def("affiliate", "whatsapp", "affiliate.whatsapp.disconnected", "critical_alert",
    "WhatsApp desconectado",
    "Seu WhatsApp foi desconectado. Reconecte para continuar recebendo contatos.",
    {
      default_priority: "critical",
      cta_label: "Reconectar",
      deep_link_template: "/conexoes",
      sound_key: "alert_critical",
      can_be_disabled_by_user: false,
      auto_action: {
        action_type: "reconnect_whatsapp",
        title_template: "Reconectar WhatsApp",
        sla_minutes: 10,
        priority: "critical",
      },
    }),
  def("affiliate", "leads", "affiliate.lead.assigned", "commercial_event",
    "Novo contato atribuído",
    "{{customer_name}} entrou pelo seu link{{product_suffix}}.",
    {
      default_priority: "high",
      cta_label: "Ver contato",
      deep_link_template: "/contatos",
      sound_key: "new_lead",
      group_key: "affiliate_leads",
    }),
  def("affiliate", "leads", "affiliate.lead.hot", "action_required",
    "Lead quente aguardando você",
    "{{customer_name}} respondeu{{message_suffix}}.",
    {
      default_priority: "critical",
      cta_label: "Responder agora",
      deep_link_template: "/contatos",
      sound_key: "new_lead",
      auto_action: {
        action_type: "reply_lead",
        title_template: "Responder {{customer_name}}",
        description_template: "{{body_preview}}",
        sla_minutes: 15,
        priority: "urgent",
      },
    }),
  def("affiliate", "commissions", "affiliate.commission.approved", "financial_event",
    "Comissão aprovada",
    "Sua comissão de {{amount}} foi aprovada.",
    {
      default_priority: "high",
      cta_label: "Ver carteira",
      deep_link_template: "/financeiro",
      action_required: false,
    }),
  def("affiliate", "onboarding", "affiliate.program.application_approved", "informational",
    "Candidatura aprovada",
    "Você foi aprovado no programa {{program_name}}.",
    {
      cta_label: "Ver programa",
      deep_link_template: "/contatos",
    }),

  /* ── Admin marca ── */
  def("admin", "onboarding", "admin.affiliate.application_received", "approval_required",
    "Nova candidatura de afiliado",
    "{{applicant_name}} solicitou entrada no programa.",
    {
      default_priority: "high",
      cta_label: "Analisar",
      deep_link_template: "/afiliados",
      auto_action: {
        action_type: "review_application",
        title_template: "Analisar candidatura de {{applicant_name}}",
        sla_minutes: 1440,
        priority: "high",
      },
    }),
  def("admin", "leads", "admin.lead.no_affiliate", "action_required",
    "Lead sem afiliado elegível",
    "{{pending_count}} prospect(s) na fila sem afiliado disponível (WhatsApp, termos ou treinamento).",
    {
      default_priority: "high",
      cta_label: "Ver distribuição",
      deep_link_template: "/afiliados",
      group_key: "affiliate_distribution",
    }),
  def("admin", "whatsapp", "admin.system.whatsapp_service_unstable", "system_warning",
    "WhatsApp instável",
    "A sessão {{instance_name}} está com instabilidade.",
    {
      default_priority: "high",
      deep_link_template: "/mensagens",
    }),
  def("admin", "sales", "admin.sale.created", "commercial_event",
    "Nova venda",
    "Pedido de {{customer_name}} — {{amount}}.",
    {
      default_priority: "high",
      cta_label: "Ver pedido",
      deep_link_template: "/pedidos",
    }),
  def("admin", "inventory", "stock.product.critical_stock", "inventory_event",
    "Estoque crítico",
    "{{product_name}} atingiu nível crítico ({{qty}} un.).",
    {
      app_context: "stock",
      default_priority: "critical",
      cta_label: "Ver estoque",
      deep_link_template: "/produtos/{{product_id}}",
      sound_key: "stock",
      group_key: "stock_alerts",
      auto_action: {
        action_type: "update_stock",
        title_template: "Repor estoque — {{product_name}}",
        sla_minutes: 60,
        priority: "urgent",
      },
    }),
  def("admin", "orders", "stock.order.awaiting_separation", "action_required",
    "Pedido aguardando separação",
    "Pedido #{{order_number}} pronto para separar.",
    {
      app_context: "stock",
      default_priority: "high",
      cta_label: "Separar",
      deep_link_template: "/pedidos",
      auto_action: {
        action_type: "separate_order",
        title_template: "Separar pedido #{{order_number}}",
        sla_minutes: 20,
        priority: "high",
      },
    }),

  /* ── Afiliado — leads adicionais ── */
  def("affiliate", "leads", "affiliate.lead.price_requested", "commercial_event",
    "Prospect pediu preço",
    "{{customer_name}} quer saber o valor{{message_suffix}}.",
    {
      default_priority: "high",
      cta_label: "Responder",
      deep_link_template: "/contatos",
      sound_key: "new_lead",
    }),
  def("affiliate", "leads", "affiliate.lead.followup_due", "action_required",
    "Follow-up vencido",
    "Hora de retomar contato com {{customer_name}}.",
    {
      default_priority: "high",
      cta_label: "Fazer follow-up",
      deep_link_template: "/contatos",
      group_key: "affiliate_followups",
      auto_action: {
        action_type: "reply_lead",
        title_template: "Follow-up — {{customer_name}}",
        sla_minutes: 60,
        priority: "high",
      },
    }),
  def("affiliate", "leads", "affiliate.lead.followups_batch", "action_required",
    "Follow-ups vencidos",
    "Você tem {{count}} follow-ups vencidos.",
    {
      default_priority: "high",
      cta_label: "Ver follow-ups",
      deep_link_template: "/contatos",
      group_key: "affiliate_followups",
    }),
  def("affiliate", "clients", "affiliate.customer.converted", "commercial_event",
    "Novo cliente convertido",
    "{{customer_name}} virou cliente{{amount_suffix}}.",
    {
      default_priority: "high",
      cta_label: "Ver cliente",
      deep_link_template: "/clientes",
      sound_key: "sale",
    }),
  def("affiliate", "commissions", "affiliate.commission.generated", "financial_event",
    "Comissão gerada",
    "Nova comissão de {{amount}} registrada.",
    {
      cta_label: "Ver carteira",
      deep_link_template: "/financeiro",
    }),
  def("affiliate", "commissions", "affiliate.commission.disputed", "financial_event",
    "Comissão em disputa",
    "Sua comissão de {{amount}} está em análise.",
    {
      default_priority: "high",
      cta_label: "Ver detalhes",
      deep_link_template: "/financeiro",
    }),
  def("affiliate", "commissions", "affiliate.payout.pending", "financial_event",
    "Pagamento pendente",
    "Seu pagamento de {{amount}} está aguardando processamento.",
    {
      default_priority: "high",
      cta_label: "Ver pagamentos",
      deep_link_template: "/financeiro",
    }),
  def("affiliate", "sales", "affiliate.sales_goal.reached", "commercial_event",
    "Meta de vendas atingida",
    "Parabéns! Você atingiu a meta de {{goal_name}}.",
    {
      default_priority: "high",
      cta_label: "Ver desempenho",
      deep_link_template: "/desempenho",
      sound_key: "sale",
    }),
  def("affiliate", "support", "affiliate.support.new_ticket", "support_event",
    "Novo chamado de cliente",
    "{{customer_name}} abriu um chamado: {{subject_preview}}.",
    {
      default_priority: "high",
      cta_label: "Ver chamado",
      deep_link_template: "/suporte/{{case_id}}",
    }),
  def("affiliate", "support", "affiliate.support.intervention_requested", "support_event",
    "Intervenção solicitada",
    "{{affiliate_name}} pediu apoio no caso #{{case_id}}.",
    {
      default_priority: "critical",
      cta_label: "Intervir",
      deep_link_template: "/suporte/{{case_id}}",
    }),
  def("affiliate", "support", "affiliate.support.customer_complaint", "support_event",
    "Cliente reclamou",
    "{{customer_name}} registrou uma reclamação.",
    {
      default_priority: "high",
      cta_label: "Resolver",
      deep_link_template: "/suporte/{{case_id}}",
    }),
  def("affiliate", "system", "affiliate.system.integration_error", "system_warning",
    "Integração com erro",
    "{{integration_name}} falhou: {{error_preview}}.",
    {
      default_priority: "critical",
      cta_label: "Ver incidente",
      deep_link_template: "/configuracoes",
    }),
  def("affiliate", "system", "affiliate.system.message_send_failed", "system_warning",
    "Falha no envio de mensagens",
    "Não foi possível entregar mensagem para {{customer_name}}.",
    {
      default_priority: "high",
      deep_link_template: "/mensagens",
    }),
  def("affiliate", "system", "affiliate.system.automation_error", "automation_event",
    "Erro em automação",
    "A automação {{automation_name}} falhou.",
    {
      default_priority: "high",
      cta_label: "Revisar",
      deep_link_template: "/automacoes",
    }),
  def("affiliate", "commissions", "affiliate.payout.sent", "financial_event",
    "Pagamento enviado",
    "Seu pagamento de {{amount}} foi enviado.",
    {
      default_priority: "high",
      cta_label: "Ver pagamentos",
      deep_link_template: "/financeiro",
    }),
  def("affiliate", "onboarding", "affiliate.program.invited", "informational",
    "Convite para programa",
    "Você foi convidado para {{program_name}}.",
    {
      cta_label: "Ver convite",
      deep_link_template: "/contatos",
    }),

  /* ── Admin — afiliados e campanhas ── */
  def("admin", "onboarding", "admin.affiliate.invite_accepted", "informational",
    "Afiliado aceitou convite",
    "{{affiliate_name}} entrou no programa.",
    {
      cta_label: "Ver afiliados",
      deep_link_template: "/afiliados",
    }),
  def("admin", "onboarding", "admin.affiliate.whatsapp_disconnected", "system_warning",
    "Afiliado com WhatsApp offline",
    "{{affiliate_name}} está com WhatsApp desconectado.",
    {
      default_priority: "high",
      cta_label: "Ver afiliado",
      deep_link_template: "/afiliados",
    }),
  def("admin", "campaigns", "admin.campaign.low_response", "system_warning",
    "Campanha com baixa resposta",
    "A campanha {{campaign_name}} está abaixo do esperado.",
    {
      default_priority: "high",
      cta_label: "Revisar campanha",
      deep_link_template: "/campanhas",
      auto_action: {
        action_type: "review_campaign",
        title_template: "Revisar campanha {{campaign_name}}",
        sla_minutes: 120,
        priority: "high",
      },
    }),
  def("admin", "sales", "admin.sale.pending_validation", "approval_required",
    "Venda aguardando validação",
    "Pedido de {{customer_name}} — {{amount}}.",
    {
      default_priority: "high",
      cta_label: "Validar",
      deep_link_template: "/pedidos",
      auto_action: {
        action_type: "review_commission",
        title_template: "Validar venda — {{customer_name}}",
        sla_minutes: 240,
        priority: "high",
      },
    }),
  def("admin", "support", "admin.support.sla_expired", "critical_alert",
    "SLA de suporte vencido",
    "Chamado #{{case_id}} ultrapassou o prazo.",
    {
      default_priority: "critical",
      cta_label: "Resolver",
      deep_link_template: "/suporte",
      can_be_disabled_by_user: false,
      auto_action: {
        action_type: "resolve_support",
        title_template: "Resolver chamado #{{case_id}}",
        sla_minutes: 30,
        priority: "critical",
      },
    }),
  def("admin", "system", "admin.system.integration_failed", "system_warning",
    "Falha de integração",
    "{{integration_name}} falhou: {{error_preview}}.",
    {
      default_priority: "critical",
      cta_label: "Ver incidente",
      deep_link_template: "/configuracoes",
      auto_action: {
        action_type: "fix_automation",
        title_template: "Corrigir integração {{integration_name}}",
        sla_minutes: 120,
        priority: "urgent",
      },
    }),

  /* ── App operação ── */
  def("admin", "tasks", "app.task.due_soon", "action_required",
    "Tarefa vence em breve",
    "{{task_title}} vence às {{due_time}}.",
    {
      default_priority: "high",
      cta_label: "Ver tarefa",
      deep_link_template: "/tarefas",
    }),
  def("admin", "tasks", "app.task.overdue", "action_required",
    "Tarefa vencida",
    "{{task_title}} está atrasada.",
    {
      default_priority: "critical",
      cta_label: "Concluir",
      deep_link_template: "/tarefas",
      auto_action: {
        action_type: "generic",
        title_template: "Concluir tarefa — {{task_title}}",
        sla_minutes: 60,
        priority: "urgent",
      },
    }),
  def("admin", "orders", "app.order.delayed", "action_required",
    "Pedido atrasado",
    "Pedido #{{order_number}} está atrasado.",
    {
      default_priority: "critical",
      cta_label: "Ver pedido",
      deep_link_template: "/pedidos",
    }),
  def("admin", "system", "app.automation.failed", "automation_event",
    "Automação com erro",
    "{{automation_name}} falhou para {{affected_count}} contatos.",
    {
      default_priority: "high",
      cta_label: "Revisar",
      deep_link_template: "/automacoes",
      auto_action: {
        action_type: "fix_automation",
        title_template: "Corrigir automação {{automation_name}}",
        sla_minutes: 120,
        priority: "high",
      },
    }),

  /* ── Estoque ── */
  def("admin", "inventory", "stock.product.low_stock", "inventory_event",
    "Estoque baixo",
    "{{product_name}} com {{qty}} un. restantes.",
    {
      app_context: "stock",
      default_priority: "high",
      cta_label: "Ver produto",
      deep_link_template: "/produtos",
      sound_key: "stock",
    }),
  def("admin", "inventory", "stock.product.out_of_stock", "critical_alert",
    "Produto sem estoque",
    "{{product_name}} zerou o estoque.",
    {
      app_context: "stock",
      default_priority: "critical",
      cta_label: "Repor",
      deep_link_template: "/produtos",
      can_be_disabled_by_user: false,
      auto_action: {
        action_type: "update_stock",
        title_template: "Repor estoque — {{product_name}}",
        sla_minutes: 30,
        priority: "critical",
      },
    }),
  def("admin", "inventory", "stock.inventory.divergence_found", "action_required",
    "Divergência no inventário",
    "Contagem de {{product_name}} divergiu em {{delta}} un.",
    {
      app_context: "stock",
      default_priority: "high",
      cta_label: "Corrigir",
      deep_link_template: "/inventario",
      auto_action: {
        action_type: "update_stock",
        title_template: "Corrigir divergência — {{product_name}}",
        sla_minutes: 60,
        priority: "high",
      },
    }),
  def("admin", "inventory", "stock.movement.inbound", "inventory_event",
    "Entrada de estoque registrada",
    "{{qty}} un. de {{product_name}} entraram no estoque.",
    {
      app_context: "stock",
      deep_link_template: "/movimentacoes",
    }),
  def("admin", "inventory", "stock.movement.outbound", "inventory_event",
    "Saída de estoque registrada",
    "{{qty}} un. de {{product_name}} saíram do estoque.",
    {
      app_context: "stock",
      deep_link_template: "/movimentacoes",
    }),
  def("admin", "orders", "stock.order.ready_delivery", "action_required",
    "Pedido pronto para entrega",
    "Pedido #{{order_number}} está pronto para sair.",
    {
      app_context: "stock",
      default_priority: "high",
      cta_label: "Expedir",
      deep_link_template: "/pedidos/{{order_id}}",
    }),
  def("admin", "orders", "stock.order.delayed", "action_required",
    "Pedido atrasado",
    "Pedido #{{order_number}} ultrapassou o prazo.",
    {
      app_context: "stock",
      default_priority: "critical",
      cta_label: "Ver pedido",
      deep_link_template: "/pedidos/{{order_id}}",
    }),
  def("admin", "inventory", "stock.product.expiring_soon", "inventory_event",
    "Produto próximo do vencimento",
    "{{product_name}} vence em {{days}} dias.",
    {
      app_context: "stock",
      default_priority: "high",
      deep_link_template: "/produtos/{{product_id}}",
    }),
  def("admin", "inventory", "stock.replenishment.requested", "action_required",
    "Solicitação de reposição",
    "{{product_name}} precisa de reposição.",
    {
      app_context: "stock",
      cta_label: "Aprovar",
      deep_link_template: "/reposicao",
    }),
  def("admin", "inventory", "stock.replenishment.approved", "informational",
    "Reposição aprovada",
    "Reposição de {{product_name}} foi aprovada.",
    {
      app_context: "stock",
      deep_link_template: "/reposicao",
    }),
  def("admin", "inventory", "stock.replenishment.rejected", "informational",
    "Reposição recusada",
    "Reposição de {{product_name}} foi recusada.",
    {
      app_context: "stock",
      deep_link_template: "/reposicao",
    }),
  def("admin", "inventory", "stock.inventory.pending", "action_required",
    "Inventário pendente",
    "Inventário de {{location_name}} aguarda contagem.",
    {
      app_context: "stock",
      cta_label: "Iniciar",
      deep_link_template: "/inventario",
    }),
  def("admin", "inventory", "stock.inventory.completed", "informational",
    "Inventário finalizado",
    "Inventário de {{location_name}} foi concluído.",
    {
      app_context: "stock",
      deep_link_template: "/inventario",
    }),

  /* ── App operação ── */
  def("admin", "tasks", "app.task.assigned", "action_required",
    "Nova tarefa atribuída",
    "{{task_title}} foi atribuída a você.",
    {
      default_priority: "high",
      cta_label: "Ver tarefa",
      deep_link_template: "/tarefas/{{task_id}}",
    }),
  def("admin", "leads", "app.inbox.new_conversation", "commercial_event",
    "Novo atendimento",
    "{{customer_name}} iniciou uma conversa.",
    {
      default_priority: "high",
      cta_label: "Atender",
      deep_link_template: "/mensagens/{{conversation_id}}",
    }),
  def("admin", "clients", "app.client.registered", "informational",
    "Novo cliente cadastrado",
    "{{customer_name}} foi cadastrado.",
    {
      deep_link_template: "/clientes/{{client_id}}",
    }),
  def("admin", "orders", "app.order.created", "commercial_event",
    "Novo pedido",
    "Pedido #{{order_number}} de {{customer_name}}.",
    {
      default_priority: "high",
      cta_label: "Ver pedido",
      deep_link_template: "/pedidos/{{order_id}}",
      sound_key: "order",
    }),
  def("admin", "orders", "app.order.updated", "informational",
    "Pedido atualizado",
    "Pedido #{{order_number}} — status: {{status}}.",
    {
      deep_link_template: "/pedidos/{{order_id}}",
    }),
  def("admin", "leads", "app.client.replied", "action_required",
    "Cliente respondeu",
    "{{customer_name}} respondeu no atendimento.",
    {
      default_priority: "high",
      cta_label: "Responder",
      deep_link_template: "/mensagens/{{conversation_id}}",
    }),
  def("admin", "system", "app.automation.paused", "automation_event",
    "Automação pausada",
    "{{automation_name}} foi pausada.",
    {
      deep_link_template: "/automacoes/{{automation_id}}",
    }),
  def("admin", "reports", "app.report.available", "informational",
    "Relatório disponível",
    "O relatório {{report_name}} está pronto.",
    {
      deep_link_template: "/relatorios/{{report_id}}",
    }),
  def("admin", "onboarding", "app.approval.pending", "approval_required",
    "Aprovação pendente",
    "{{item_title}} aguarda sua aprovação.",
    {
      default_priority: "high",
      cta_label: "Aprovar",
      deep_link_template: "/aprovacoes/{{item_id}}",
    }),

  /* ── Master / plataforma ── */
  def("master", "system", "master.system.security_alert", "security_event",
    "Alerta de segurança",
    "{{alert_message}}",
    {
      default_priority: "critical",
      can_be_disabled_by_user: false,
      deep_link_template: "/admin/audit-log",
    }),
  def("master", "system", "master.system.payment_failed", "system_warning",
    "Falha de pagamento",
    "Falha no processamento: {{error_preview}}.",
    {
      default_priority: "critical",
      deep_link_template: "/admin/configuracoes",
    }),
];

const REGISTRY_MAP = new Map(
  NOTIFICATION_EVENT_REGISTRY.map((e) => [e.event_key, e]),
);

/**
 * Aliases push-events (snake_case legado) → notification-events (dotted canônico).
 * Preferências e seeds antigos podem usar a chave curta; o hub resolve para a canônica.
 */
export const EVENT_KEY_ALIASES: Record<string, string> = {
  // affiliate
  whatsapp_disconnected: "affiliate.whatsapp.disconnected",
  whatsapp_reconnect_required: "affiliate.whatsapp.disconnected",
  message_undelivered: "affiliate.system.message_send_failed",
  new_contact: "affiliate.lead.assigned",
  new_prospect_assigned: "affiliate.lead.assigned",
  hot_lead: "affiliate.lead.hot",
  prospect_replied: "affiliate.lead.hot",
  prospect_requested_price: "affiliate.lead.price_requested",
  follow_up_due: "affiliate.lead.followup_due",
  prospect_converted: "affiliate.customer.converted",
  commission_generated: "affiliate.commission.generated",
  commission_approved: "affiliate.commission.approved",
  commission_disputed: "affiliate.commission.disputed",
  payout_pending: "affiliate.payout.pending",
  payout_available: "affiliate.payout.pending",
  payout_completed: "affiliate.payout.sent",
  program_invite: "affiliate.program.invited",
  application_approved: "affiliate.program.application_approved",
  sales_goal_reached: "affiliate.sales_goal.reached",
  new_support_ticket: "affiliate.support.new_ticket",
  intervention_requested: "affiliate.support.intervention_requested",
  customer_complaint: "affiliate.support.customer_complaint",
  integration_error: "affiliate.system.integration_error",
  message_send_failed: "affiliate.system.message_send_failed",
  automation_error: "affiliate.system.automation_error",
  // admin affiliates
  affiliate_application_received: "admin.affiliate.application_received",
  affiliate_whatsapp_offline: "admin.affiliate.whatsapp_disconnected",
  lead_no_affiliate: "admin.lead.no_affiliate",
  // app ops (amostra)
  task_assigned: "app.task.assigned",
  new_conversation: "app.inbox.new_conversation",
  client_registered: "app.client.registered",
  order_created: "app.order.created",
};

/** Resolve alias → chave canônica do registry. */
export function resolveCanonicalEventKey(eventKey: string): string {
  const raw = String(eventKey || "").trim();
  if (!raw) return raw;
  if (REGISTRY_MAP.has(raw)) return raw;
  const aliased = EVENT_KEY_ALIASES[raw];
  if (aliased && REGISTRY_MAP.has(aliased)) return aliased;
  // também: se alguém passar sem prefixo mas o alias mapeia
  if (aliased) return aliased;
  return raw;
}

export function getNotificationEventDefinition(eventKey: string): NotificationEventDefinition | null {
  const key = resolveCanonicalEventKey(eventKey);
  return REGISTRY_MAP.get(key) || null;
}

export function renderTemplate(template: string, vars: Record<string, string | number | undefined | null>): string {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v != null && String(v).trim() ? String(v).trim() : "";
  }).replace(/\s+/g, " ").trim();
}

export function mapHubPriority(p: PushPriority): "low" | "medium" | "high" | "critical" {
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "medium";
}

export function mapActionPriority(
  p?: string,
): "low" | "normal" | "high" | "urgent" | "critical" {
  const v = String(p || "normal").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "urgent") return "urgent";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "normal";
}
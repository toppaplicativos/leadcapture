/**
 * Catálogo central de eventos de push por contexto de PWA.
 * Governado pelo App Admin (master); seed idempotente no bootstrap.
 */

export type PushAppContext = "master" | "admin" | "affiliate" | "stock" | "storefront" | "mob"

export type PushEventCategory =
  | "account_security"
  | "whatsapp"
  | "leads"
  | "clients"
  | "sales"
  | "commissions"
  | "tasks"
  | "campaigns"
  | "support"
  | "inventory"
  | "orders"
  | "system"
  | "onboarding"
  | "reports"

export type PushPriority = "critical" | "high" | "normal" | "low"

export interface PushEventDefinition {
  event_key: string
  app_context: PushAppContext
  category: PushEventCategory
  label: string
  description?: string
  default_priority: PushPriority
  default_enabled: boolean
  mandatory: boolean
  sound_key?: string
  sort_order: number
}

const CATEGORY_LABELS: Record<PushEventCategory, string> = {
  account_security: "Conta e segurança",
  whatsapp: "WhatsApp e conexões",
  leads: "Leads e prospects",
  clients: "Clientes",
  sales: "Vendas e conversões",
  commissions: "Comissões e pagamentos",
  tasks: "Tarefas e follow-ups",
  campaigns: "Campanhas",
  support: "Suporte e intervenção",
  inventory: "Estoque",
  orders: "Pedidos e entregas",
  system: "Sistema e integrações",
  onboarding: "Treinamentos e onboarding",
  reports: "Relatórios e resumos",
}

function ev(
  app_context: PushAppContext,
  category: PushEventCategory,
  event_key: string,
  label: string,
  opts: Partial<PushEventDefinition> = {},
): PushEventDefinition {
  return {
    event_key,
    app_context,
    category,
    label,
    description: opts.description,
    default_priority: opts.default_priority || "normal",
    default_enabled: opts.default_enabled !== false,
    mandatory: !!opts.mandatory,
    sound_key: opts.sound_key,
    sort_order: opts.sort_order ?? 0,
  }
}

/** Eventos base — expandível via painel master sem redeploy. */
export const PUSH_EVENT_SEED: PushEventDefinition[] = [
  /* ── Master (adm.leadcapture.online) ── */
  ev("master", "system", "platform_maintenance", "Manutenção da plataforma", { default_priority: "critical", mandatory: true, sort_order: 1 }),
  ev("master", "system", "integration_failure", "Falha em integração global", { default_priority: "critical", sort_order: 2 }),
  ev("master", "sales", "new_subscription", "Nova assinatura", { default_priority: "high", sort_order: 10 }),
  ev("master", "sales", "subscription_canceled", "Assinatura cancelada", { default_priority: "high", sort_order: 11 }),

  /* ── Admin (app.leadcapture.online) ── */
  ev("admin", "whatsapp", "whatsapp_disconnected", "WhatsApp desconectado", { default_priority: "critical", sound_key: "alert_critical", sort_order: 1 }),
  ev("admin", "whatsapp", "whatsapp_connected", "WhatsApp conectado", { default_priority: "normal", sort_order: 2 }),
  ev("admin", "whatsapp", "whatsapp_session_unstable", "Sessão WhatsApp instável", { default_priority: "high", sort_order: 3 }),
  ev("admin", "leads", "new_lead_batch", "Novo lote de prospects captado", { default_priority: "high", sound_key: "new_lead", sort_order: 10 }),
  ev("admin", "leads", "lead_distribution_started", "Distribuição de leads iniciada", { default_priority: "normal", sort_order: 11 }),
  ev("admin", "leads", "lead_distribution_done", "Distribuição concluída", { default_priority: "normal", sort_order: 12 }),
  ev("admin", "leads", "lead_no_affiliate", "Lead sem afiliado disponível", { default_priority: "high", sort_order: 13 }),
  ev("admin", "leads", "lead_urgent_unattended", "Lead urgente sem atendimento", { default_priority: "critical", mandatory: true, sort_order: 14 }),
  ev("admin", "campaigns", "campaign_started", "Campanha iniciada", { default_priority: "normal", sort_order: 20 }),
  ev("admin", "campaigns", "campaign_paused", "Campanha pausada", { default_priority: "normal", sort_order: 21 }),
  ev("admin", "campaigns", "campaign_low_response", "Campanha com baixa resposta", { default_priority: "high", sort_order: 22 }),
  ev("admin", "sales", "new_sale", "Nova venda registrada", { default_priority: "high", sound_key: "sale", sort_order: 30 }),
  ev("admin", "sales", "conversion_pending_validation", "Conversão aguardando validação", { default_priority: "high", sort_order: 31 }),
  ev("admin", "sales", "order_canceled", "Pedido cancelado", { default_priority: "high", sort_order: 32 }),
  ev("admin", "onboarding", "affiliate_registered", "Novo afiliado cadastrado", { default_priority: "normal", sort_order: 40 }),
  ev("admin", "onboarding", "affiliate_application_received", "Nova candidatura recebida", { default_priority: "high", sort_order: 41 }),
  ev("admin", "onboarding", "affiliate_onboarding_done", "Afiliado concluiu onboarding", { default_priority: "normal", sort_order: 42 }),
  ev("admin", "onboarding", "affiliate_whatsapp_offline", "Afiliado com WhatsApp desconectado", { default_priority: "high", sort_order: 43 }),
  ev("admin", "onboarding", "affiliate_high_performance", "Afiliado com alta performance", { default_priority: "normal", sort_order: 44 }),
  ev("admin", "onboarding", "affiliate_auto_blocked", "Afiliado bloqueado por regra", { default_priority: "critical", sort_order: 45 }),
  ev("admin", "reports", "daily_summary", "Resumo diário", { default_priority: "low", default_enabled: false, sort_order: 50 }),

  /* ── Afiliado (parceiros.*) ── */
  ev("affiliate", "whatsapp", "whatsapp_disconnected", "WhatsApp desconectado", { default_priority: "critical", mandatory: true, sound_key: "alert_critical", sort_order: 1 }),
  ev("affiliate", "whatsapp", "whatsapp_reconnect_required", "Necessário reconectar WhatsApp", { default_priority: "critical", sort_order: 2 }),
  ev("affiliate", "whatsapp", "message_undelivered", "Mensagem não entregue", { default_priority: "high", sort_order: 3 }),
  ev("affiliate", "leads", "new_contact", "Novo contato recebido", { default_priority: "high", sound_key: "new_lead", sort_order: 10 }),
  ev("affiliate", "leads", "new_prospect_assigned", "Novo prospect atribuído", { default_priority: "high", sound_key: "new_lead", sort_order: 11 }),
  ev("affiliate", "leads", "hot_lead", "Novo lead quente", { default_priority: "critical", sound_key: "new_lead", sort_order: 12 }),
  ev("affiliate", "leads", "prospect_replied", "Prospect respondeu", { default_priority: "high", sort_order: 13 }),
  ev("affiliate", "leads", "prospect_requested_price", "Prospect pediu preço", { default_priority: "high", sort_order: 14 }),
  ev("affiliate", "leads", "prospect_requested_human", "Prospect pediu atendimento humano", { default_priority: "critical", sort_order: 15 }),
  ev("affiliate", "leads", "follow_up_due", "Follow-up vencido", { default_priority: "high", sort_order: 16 }),
  ev("affiliate", "leads", "lead_stage_changed", "Lead mudou de etapa", { default_priority: "normal", sort_order: 17 }),
  ev("affiliate", "clients", "prospect_converted", "Prospect convertido em cliente", { default_priority: "high", sound_key: "sale", sort_order: 20 }),
  ev("affiliate", "clients", "client_repurchase", "Cliente fez nova compra", { default_priority: "high", sound_key: "sale", sort_order: 21 }),
  ev("affiliate", "commissions", "commission_generated", "Comissão gerada", { default_priority: "normal", sort_order: 30 }),
  ev("affiliate", "commissions", "commission_approved", "Comissão aprovada", { default_priority: "high", sort_order: 31 }),
  ev("affiliate", "commissions", "payout_available", "Comissão disponível para saque", { default_priority: "high", sort_order: 32 }),
  ev("affiliate", "commissions", "payout_completed", "Pagamento realizado", { default_priority: "high", sort_order: 33 }),
  ev("affiliate", "onboarding", "program_invite", "Convite recebido", { default_priority: "normal", sort_order: 40 }),
  ev("affiliate", "onboarding", "application_approved", "Candidatura aprovada", { default_priority: "high", sort_order: 41 }),
  ev("affiliate", "onboarding", "training_required", "Treinamento pendente", { default_priority: "normal", sort_order: 42 }),
  ev("affiliate", "commissions", "commission_disputed", "Comissão em disputa", { default_priority: "high", sort_order: 34 }),
  ev("affiliate", "commissions", "payout_pending", "Pagamento pendente", { default_priority: "high", sort_order: 35 }),
  ev("affiliate", "sales", "sales_goal_reached", "Meta de vendas atingida", { default_priority: "high", sound_key: "sale", sort_order: 36 }),
  ev("affiliate", "support", "new_support_ticket", "Novo chamado de cliente", { default_priority: "high", sort_order: 50 }),
  ev("affiliate", "support", "intervention_requested", "Intervenção solicitada", { default_priority: "critical", sort_order: 51 }),
  ev("affiliate", "support", "customer_complaint", "Cliente reclamou", { default_priority: "high", sort_order: 52 }),
  ev("affiliate", "system", "integration_error", "Integração com erro", { default_priority: "critical", sort_order: 60 }),
  ev("affiliate", "system", "message_send_failed", "Falha no envio de mensagens", { default_priority: "high", sort_order: 61 }),
  ev("affiliate", "system", "automation_error", "Erro em automação", { default_priority: "high", sort_order: 62 }),

  /* ── App operação ── */
  ev("admin", "tasks", "task_assigned", "Nova tarefa atribuída", { default_priority: "high", sort_order: 60 }),
  ev("admin", "tasks", "task_overdue", "Tarefa vencida", { default_priority: "critical", sort_order: 61 }),
  ev("admin", "leads", "new_conversation", "Novo atendimento", { default_priority: "high", sort_order: 62 }),
  ev("admin", "clients", "client_registered", "Novo cliente cadastrado", { default_priority: "normal", sort_order: 63 }),
  ev("admin", "orders", "order_created", "Novo pedido", { default_priority: "high", sound_key: "order", sort_order: 64 }),
  ev("admin", "orders", "order_updated", "Pedido atualizado", { default_priority: "normal", sort_order: 65 }),
  ev("admin", "orders", "order_delayed", "Pedido atrasado", { default_priority: "critical", sort_order: 66 }),
  ev("admin", "leads", "client_replied", "Cliente respondeu", { default_priority: "high", sort_order: 67 }),
  ev("admin", "system", "automation_paused", "Automação pausada", { default_priority: "normal", sort_order: 68 }),
  ev("admin", "system", "automation_failed", "Automação com erro", { default_priority: "high", sort_order: 69 }),
  ev("admin", "reports", "report_available", "Relatório disponível", { default_priority: "low", sort_order: 70 }),
  ev("admin", "onboarding", "approval_pending", "Aprovação pendente", { default_priority: "high", sort_order: 71 }),
  ev("admin", "support", "support_sla_warning", "SLA de suporte próximo de vencer", { default_priority: "high", sort_order: 72 }),
  ev("admin", "support", "support_sla_expired", "SLA vencido", { default_priority: "critical", mandatory: true, sort_order: 73 }),
  ev("admin", "system", "panfleteiro_failed", "Falha no Panfleteiro", { default_priority: "critical", sort_order: 74 }),
  ev("admin", "system", "payment_failed", "Falha de pagamento", { default_priority: "critical", sort_order: 75 }),
  ev("admin", "account_security", "security_alert", "Alerta de segurança", { default_priority: "critical", mandatory: true, sort_order: 76 }),

  /* ── Estoque ── */
  ev("stock", "inventory", "low_stock", "Estoque baixo", { default_priority: "high", sound_key: "stock", sort_order: 1 }),
  ev("stock", "inventory", "critical_stock", "Estoque crítico", { default_priority: "critical", sound_key: "stock", sort_order: 2 }),
  ev("stock", "inventory", "out_of_stock", "Produto sem estoque", { default_priority: "critical", sound_key: "stock", sort_order: 3 }),
  ev("stock", "inventory", "stock_inbound", "Entrada de estoque registrada", { default_priority: "normal", sort_order: 4 }),
  ev("stock", "inventory", "stock_outbound", "Saída de estoque registrada", { default_priority: "normal", sort_order: 5 }),
  ev("stock", "inventory", "product_expiring", "Produto próximo do vencimento", { default_priority: "high", sort_order: 6 }),
  ev("stock", "inventory", "inventory_divergence", "Divergência de inventário", { default_priority: "high", sort_order: 7 }),
  ev("stock", "inventory", "replenishment_requested", "Solicitação de reposição", { default_priority: "high", sort_order: 8 }),
  ev("stock", "inventory", "replenishment_approved", "Reposição aprovada", { default_priority: "normal", sort_order: 9 }),
  ev("stock", "inventory", "replenishment_rejected", "Reposição recusada", { default_priority: "normal", sort_order: 10 }),
  ev("stock", "inventory", "inventory_pending", "Inventário pendente", { default_priority: "high", sort_order: 11 }),
  ev("stock", "inventory", "inventory_completed", "Inventário finalizado", { default_priority: "normal", sort_order: 12 }),
  ev("stock", "orders", "new_order", "Novo pedido", { default_priority: "high", sound_key: "order", sort_order: 20 }),
  ev("stock", "orders", "order_awaiting_separation", "Pedido aguardando separação", { default_priority: "high", sound_key: "order", sort_order: 21 }),
  ev("stock", "orders", "order_ready_delivery", "Pedido pronto para entrega", { default_priority: "high", sort_order: 22 }),
  ev("stock", "orders", "order_delayed", "Pedido atrasado", { default_priority: "critical", sort_order: 23 }),
  ev("stock", "orders", "order_ready_pickup", "Pedido pronto para retirada", { default_priority: "normal", sort_order: 24 }),
  ev("stock", "system", "sync_failure", "Falha de sincronização", { default_priority: "critical", sort_order: 30 }),

  /* ── Lead Capture Mob (entregadores) ── */
  ev("mob", "orders", "delivery_offered", "Nova entrega disponível", { default_priority: "high", sound_key: "order", sort_order: 1 }),
  ev("mob", "orders", "delivery_assigned", "Entrega atribuída a você", { default_priority: "high", sound_key: "order", sort_order: 2 }),
  ev("mob", "orders", "delivery_status_changed", "Status da entrega atualizado", { default_priority: "normal", sort_order: 3 }),
  ev("mob", "orders", "delivery_cancelled", "Entrega cancelada", { default_priority: "high", sort_order: 4 }),
  ev("mob", "account_security", "membership_approved", "Vínculo com organização aprovado", { default_priority: "high", sort_order: 10 }),
  ev("mob", "account_security", "membership_suspended", "Vínculo suspenso", { default_priority: "critical", sort_order: 11 }),
  ev("admin", "orders", "mob_delivery_created", "Entrega Mob criada a partir do pedido", { default_priority: "normal", sort_order: 80 }),
  ev("admin", "orders", "mob_delivery_completed", "Entrega Mob concluída", { default_priority: "normal", sort_order: 81 }),
]

export function getCategoryLabel(category: PushEventCategory): string {
  return CATEGORY_LABELS[category] || category
}

export const PUSH_APP_CONTEXT_LABELS: Record<PushAppContext, string> = {
  master: "App Admin (adm)",
  admin: "Admin da marca (app)",
  affiliate: "Parceiros / Afiliados",
  stock: "Estoque",
  storefront: "Loja pública",
  mob: "Lead Capture Mob (entregadores)",
}

export const PUSH_SOUND_OPTIONS = [
  { key: "default", label: "Padrão" },
  { key: "alert_critical", label: "Alerta crítico" },
  { key: "new_lead", label: "Novo lead" },
  { key: "sale", label: "Venda" },
  { key: "order", label: "Pedido" },
  { key: "stock", label: "Estoque" },
  { key: "support", label: "Suporte" },
  { key: "connection", label: "Conexão / falha" },
] as const
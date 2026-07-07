export type FlowTemplatePhase = {
  id: string;
  label: string;
  description: string;
  kind: "reactive" | "proactive" | "system";
  channel: "whatsapp" | "instagram" | "facebook" | "internal";
};

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  mode: "reactive" | "proactive" | "hybrid";
  channel: "whatsapp";
  triggerSubtype: string;
  phases: FlowTemplatePhase[];
  nodes: Array<{
    id: string;
    type: "trigger" | "condition" | "action" | "delay" | "destination" | "end";
    subtype: string;
    label: string;
    data: Record<string, unknown>;
  }>;
  connections: Array<{ id: string; from: string; fromHandle: string; to: string }>;
};

function chain(ids: string[]): Array<{ id: string; from: string; fromHandle: string; to: string }> {
  const out: Array<{ id: string; from: string; fromHandle: string; to: string }> = [];
  for (let i = 0; i < ids.length - 1; i++) {
    out.push({ id: `c-${ids[i]}-${ids[i + 1]}`, from: ids[i], fromHandle: "default", to: ids[i + 1] });
  }
  return out;
}

/** Fluxo completo de pedidos WhatsApp — reativo, multi-fase. */
export function whatsappOrderCompleteTemplate(): FlowTemplate {
  const nodes = [
    {
      id: "t1",
      type: "trigger" as const,
      subtype: "message_received",
      label: "Mensagem recebida",
      data: { description: "Cliente envia mensagem no WhatsApp" },
    },
    {
      id: "a1",
      type: "action" as const,
      subtype: "ai_message",
      label: "Boas-vindas e intenção",
      data: {
        ai_instrucao:
          "Cumprimente o cliente e identifique se deseja fazer um pedido. Se sim, confirme e peça para escolher os itens.",
      },
    },
    {
      id: "a2",
      type: "action" as const,
      subtype: "ai_message",
      label: "Seleção de itens",
      data: {
        ai_instrucao:
          "Apresente o catálogo de produtos. Use lista numerada ou botões (1, 2, 3). Colete quantidade de cada item e monte o carrinho.",
        ui_hint: "lista_ou_botoes",
      },
    },
    {
      id: "a3",
      type: "action" as const,
      subtype: "set_variable",
      label: "Salvar carrinho",
      data: { variable_name: "cart_items", value_template: "{{context.cart}}" },
    },
    {
      id: "a4",
      type: "action" as const,
      subtype: "ai_message",
      label: "Endereço e entrega",
      data: {
        ai_instrucao:
          "Pergunte endereço completo e tipo de entrega: retirada, entrega padrão ou expressa. Confirme frete se aplicável.",
      },
    },
    {
      id: "a5",
      type: "action" as const,
      subtype: "ai_message",
      label: "Forma de pagamento",
      data: {
        ai_instrucao:
          "Ofereça formas de pagamento: PIX, cartão, dinheiro na entrega. Confirme a escolha antes de finalizar.",
        ui_hint: "botoes_pagamento",
      },
    },
    {
      id: "a6",
      type: "action" as const,
      subtype: "webhook",
      label: "Criar pedido",
      data: {
        url: "/api/orders",
        method: "POST",
        description: "Registra pedido no commerce + meta PDV",
      },
    },
    {
      id: "a7",
      type: "action" as const,
      subtype: "send_notification",
      label: "Notificar expedição",
      data: {
        title: "Novo pedido WhatsApp",
        message: "Pedido {{context.order_id}} aguardando separação.",
        event: "order.created",
        channels_csv: "in_app",
      },
    },
    {
      id: "a8",
      type: "action" as const,
      subtype: "webhook",
      label: "Afiliado e comissão",
      data: {
        url: "/api/affiliates/attribute-sale",
        method: "POST",
        description: "Rastreia cookie lc_affiliate e registra comissão",
      },
    },
    {
      id: "a9",
      type: "action" as const,
      subtype: "send_message",
      label: "Confirmação + fatura",
      data: {
        message:
          "Pedido confirmado! Nº {{context.order_id}}. Resumo enviado. Obrigado pela preferência.",
      },
    },
    {
      id: "e1",
      type: "end" as const,
      subtype: "completed",
      label: "Fim",
      data: {},
    },
  ];

  const nodeIds = nodes.map((n) => n.id);

  return {
    id: "whatsapp_order_complete",
    name: "Pedido completo WhatsApp",
    description:
      "Fluxo reativo: recebe pedido, seleção de itens, entrega, pagamento, fatura, expedição e comissão de afiliado.",
    mode: "reactive",
    channel: "whatsapp",
    triggerSubtype: "message_received",
    phases: [
      { id: "receive", label: "Receber pedido", description: "Detecta intenção na mensagem", kind: "reactive", channel: "whatsapp" },
      { id: "items", label: "Selecionar itens", description: "Lista ou botões do catálogo", kind: "reactive", channel: "whatsapp" },
      { id: "delivery", label: "Endereço e entrega", description: "Tipo e endereço de entrega", kind: "reactive", channel: "whatsapp" },
      { id: "payment", label: "Pagamento", description: "PIX, cartão ou dinheiro", kind: "reactive", channel: "whatsapp" },
      { id: "order", label: "Registrar pedido", description: "Commerce + PDV + timeline", kind: "system", channel: "internal" },
      { id: "invoice", label: "Fatura ao cliente", description: "Confirmação e resumo", kind: "proactive", channel: "whatsapp" },
      { id: "expedition", label: "Expedição", description: "Notifica equipe de separação", kind: "system", channel: "internal" },
      { id: "affiliate", label: "Afiliado", description: "Cookie + comissão", kind: "system", channel: "internal" },
    ],
    nodes,
    connections: chain(nodeIds),
  };
}

/** Follow-up proativo após novo lead. */
export function whatsappProactiveLeadTemplate(): FlowTemplate {
  const nodes = [
    {
      id: "t1",
      type: "trigger" as const,
      subtype: "new_lead",
      label: "Novo lead",
      data: {},
    },
    {
      id: "d1",
      type: "delay" as const,
      subtype: "wait_minutes",
      label: "Aguardar 5 min",
      data: { minutes: 5 },
    },
    {
      id: "a1",
      type: "action" as const,
      subtype: "send_message",
      label: "Mensagem de boas-vindas",
      data: {
        message: "Olá {{customer.name}}! Vi seu interesse. Posso ajudar com um pedido ou tirar dúvidas?",
      },
    },
    {
      id: "e1",
      type: "end" as const,
      subtype: "completed",
      label: "Fim",
      data: {},
    },
  ];
  const nodeIds = nodes.map((n) => n.id);
  return {
    id: "whatsapp_proactive_lead",
    name: "Boas-vindas proativa (lead)",
    description: "Envia mensagem WhatsApp 5 min após cadastro de lead.",
    mode: "proactive",
    channel: "whatsapp",
    triggerSubtype: "new_lead",
    phases: [
      { id: "trigger", label: "Novo lead", description: "Dispara ao criar lead", kind: "proactive", channel: "whatsapp" },
      { id: "wait", label: "Aguardar", description: "Delay antes do envio", kind: "proactive", channel: "whatsapp" },
      { id: "send", label: "Mensagem", description: "Primeiro contato proativo", kind: "proactive", channel: "whatsapp" },
    ],
    nodes,
    connections: chain(nodeIds),
  };
}

const TEMPLATES: Record<string, () => FlowTemplate> = {
  whatsapp_order_complete: whatsappOrderCompleteTemplate,
  whatsapp_proactive_lead: whatsappProactiveLeadTemplate,
};

export function getFlowTemplate(id: string): FlowTemplate | null {
  const fn = TEMPLATES[id];
  return fn ? fn() : null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.keys(TEMPLATES).map((id) => getFlowTemplate(id)!);
}

/** Deduz template a partir do briefing em linguagem natural. */
export function resolveTemplateFromBrief(brief: string): FlowTemplate | null {
  const lower = String(brief || "").toLowerCase();
  if (
    /pedido|order|compra|carrinho|checkout|entrega|pagamento|fatura|expedi|afiliad/i.test(lower)
    && /whatsapp|whats|zap/i.test(lower)
  ) {
    return whatsappOrderCompleteTemplate();
  }
  if (/proativ|follow.?up|boas.?vindas|novo\s+lead/i.test(lower) && /whatsapp|whats/i.test(lower)) {
    return whatsappProactiveLeadTemplate();
  }
  if (/fluxo\s+de\s+pedido|pedido\s+completo|tirar\s+pedido\s+no\s+whats/i.test(lower)) {
    return whatsappOrderCompleteTemplate();
  }
  if (/automação|automacao|fluxo/i.test(lower) && /whatsapp/i.test(lower)) {
    return whatsappOrderCompleteTemplate();
  }
  return null;
}
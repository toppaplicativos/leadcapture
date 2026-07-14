/**
 * Full email template catalog — system (LeadCapture) + tenant (store brand).
 * Catalog version: bump EMAIL_CATALOG_VERSION to force re-seed of defaults.
 */

import {
  systemEmailLayout,
  tenantEmailLayout,
  emailIconBadge,
  emailH1,
  emailP,
  emailMuted,
  emailCta,
  emailCard,
  emailKvTable,
  emailDivider,
  emailPill,
  brandCta,
  EMAIL_DS,
} from "./designSystem"

export const EMAIL_CATALOG_VERSION = "2026-07-13-v6-affiliate-onboard"

export type CatalogTemplate = {
  slug: string
  scope: "system" | "tenant"
  category: string
  description: string
  variables: string[]
  subject: string
  html: string
  text: string
  audience?: string
}

const L = EMAIL_DS

/* ───────────────────────────── SYSTEM ───────────────────────────── */

const sys = (body: string) => systemEmailLayout(body)
const ten = (body: string) => tenantEmailLayout(body)

export const SYSTEM_TEMPLATES: CatalogTemplate[] = [
  {
    slug: "welcome-owner",
    scope: "system",
    category: "onboarding",
    audience: "organization_owner",
    description: "Boas-vindas ao dono da organização após assinatura confirmada.",
    variables: ["user_name", "brand_name", "plan_name", "login_url"],
    subject: "Bem-vindo(a) ao LeadCapture, {{user_name}}",
    html: sys(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Conta ativa", "success")}
      <div style="height:12px"></div>
      ${emailH1("Bem-vindo(a) ao LeadCapture")}
      ${emailP(`Olá <strong>{{user_name}}</strong>, sua conta no plano <strong>{{plan_name}}</strong> está pronta para operar.`)}
      ${emailP(`A organização <strong>{{brand_name}}</strong> já está no painel. Use o LeadCapture para captar leads, conectar WhatsApp, organizar o CRM e rodar campanhas — tudo em um só lugar.`)}
      ${emailCard(emailKvTable([
        ["Plano", "{{plan_name}}"],
        ["Organização", "{{brand_name}}"],
        ["Painel", "app.leadcapture.online"],
      ]))}
      <p style="margin:0 0 8px">${emailCta("{{login_url}}", "Abrir painel")}</p>
      ${emailMuted("Primeiros passos: conecte um WhatsApp e capture leads no Radar.")}
    `),
    text: "Bem-vindo {{user_name}}! Plano {{plan_name}} ativo. Organização {{brand_name}}. Acesse {{login_url}}",
  },
  {
    slug: "welcome",
    scope: "system",
    category: "onboarding",
    audience: "organization_owner",
    description: "Alias legado de welcome-owner (compatibilidade).",
    variables: ["user_name", "brand_name", "plan_name", "login_url"],
    subject: "Bem-vindo(a) ao LeadCapture, {{user_name}}",
    html: sys(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailH1("Sua conta está pronta")}
      ${emailP(`Olá <strong>{{user_name}}</strong> — o LeadCapture já está configurado para a organização <strong>{{brand_name}}</strong> no plano <strong>{{plan_name}}</strong>.`)}
      ${emailP("Entre no painel para captar leads, conectar canais e gerenciar sua operação.")}
      <p style="margin:20px 0 8px">${emailCta("{{login_url}}", "Entrar no painel")}</p>
    `),
    text: "Bem-vindo {{user_name}}. Plano {{plan_name}}. Login: {{login_url}}",
  },
  {
    slug: "welcome-team",
    scope: "system",
    category: "onboarding",
    audience: "team_member",
    description: "Convite / boas-vindas a membro da equipe de uma organização.",
    variables: ["user_name", "brand_name", "inviter_name", "role_name", "login_url"],
    subject: "Você entrou em {{brand_name}} no LeadCapture",
    html: sys(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Bem-vindo à equipe")}
      ${emailP(`Oi <strong>{{user_name}}</strong>, <strong>{{inviter_name}}</strong> adicionou você na organização <strong>{{brand_name}}</strong> como <strong>{{role_name}}</strong>.`)}
      ${emailCard(`<p style="margin:0;font-size:14px;color:#404040;line-height:1.5">Use este e-mail para acessar o painel e operar junto com o time.</p>`)}
      <p style="margin:0">${emailCta("{{login_url}}", "Acessar workspace")}</p>
    `),
    text: "{{user_name}}, você foi adicionado a {{brand_name}} como {{role_name}}. {{login_url}}",
  },
  {
    slug: "welcome-partners",
    scope: "system",
    category: "onboarding",
    audience: "affiliate",
    description: "Boas-vindas global ao LeadCapture Parceiros após cadastro.",
    variables: ["user_name", "panel_url"],
    subject: "Bem-vindo(a) ao LeadCapture Parceiros, {{user_name}}",
    html: sys(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Parceiros", "success")}
      <div style="height:12px"></div>
      ${emailH1("Sua conta de parceiro está no ar")}
      ${emailP(`Oi <strong>{{user_name}}</strong>, o cadastro no <strong>LeadCapture Parceiros</strong> foi concluído.`)}
      ${emailP("No app você escolhe programas de marcas, recebe link e cupom, compartilha materiais oficiais e acompanha comissões — tudo em um só lugar.")}
      ${emailCard(emailKvTable([
        ["App", "LeadCapture Parceiros"],
        ["Próximo passo", "Explorar o Mercado"],
        ["Acesso", "parceiros.leadcapture.online"],
      ]))}
      ${emailP("<strong>Como começar:</strong> abra o app → ative notificações → entre em um programa → compartilhe seu link.")}
      <p style="margin:0 0 8px">${emailCta("{{panel_url}}", "Abrir LeadCapture Parceiros")}</p>
      ${emailMuted("Se você não criou esta conta, ignore este e-mail com segurança.")}
    `),
    text: "Bem-vindo {{user_name}} ao LeadCapture Parceiros. Acesse {{panel_url}}",
  },
  {
    slug: "payment-failed",
    scope: "system",
    category: "billing",
    description: "Cobrança recorrente falhou.",
    variables: ["user_name", "plan_name", "billing_url", "amount"],
    subject: "Não conseguimos cobrar sua assinatura {{plan_name}}",
    html: sys(`
      ${emailIconBadge("mark", "#fef2f2")}
      ${emailPill("Ação necessária", "danger")}
      <div style="height:12px"></div>
      ${emailH1("Falha no pagamento", L.danger)}
      ${emailP(`Olá {{user_name}}, tentamos renovar o plano <strong>{{plan_name}}</strong> e a cobrança não foi concluída.`)}
      ${emailP("Sua conta permanece ativa por um período de carência. Atualize o método de pagamento para evitar suspensão.")}
      <p style="margin:0">${emailCta("{{billing_url}}", "Atualizar pagamento")}</p>
    `),
    text: "Falha ao cobrar {{plan_name}}. Atualize: {{billing_url}}",
  },
  {
    slug: "subscription-canceled",
    scope: "system",
    category: "billing",
    description: "Confirmação de cancelamento.",
    variables: ["user_name", "plan_name", "ends_at", "reactivate_url"],
    subject: "Sua assinatura foi cancelada",
    html: sys(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Assinatura cancelada")}
      ${emailP(`Olá {{user_name}}, confirmamos o cancelamento do plano <strong>{{plan_name}}</strong>.`)}
      ${emailCard(emailKvTable([
        ["Plano", "{{plan_name}}"],
        ["Acesso até", "{{ends_at}}"],
      ]))}
      ${emailP("Mudou de ideia? Você pode reativar a qualquer momento.")}
      <p style="margin:0">${emailCta("{{reactivate_url}}", "Reativar assinatura", "secondary")}</p>
    `),
    text: "Plano {{plan_name}} cancelado. Acesso até {{ends_at}}.",
  },
  {
    slug: "password-reset",
    scope: "system",
    category: "security",
    description: "Link para redefinir senha.",
    variables: ["user_name", "reset_url", "expires_in"],
    subject: "Redefinição de senha — LeadCapture",
    html: sys(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailH1("Redefinir senha")}
      ${emailP(`Olá {{user_name}}, recebemos um pedido para redefinir a senha da sua conta.`)}
      <p style="margin:0 0 16px">${emailCta("{{reset_url}}", "Definir nova senha")}</p>
      ${emailMuted("O link expira em {{expires_in}}. Se você não pediu, ignore este e-mail com segurança.")}
    `),
    text: "Redefinir senha: {{reset_url}} (expira em {{expires_in}})",
  },
  {
    slug: "trial-ending",
    scope: "system",
    category: "billing",
    description: "Aviso de fim de trial.",
    variables: ["user_name", "plan_name", "ends_at", "billing_url"],
    subject: "Seu trial do {{plan_name}} acaba em breve",
    html: sys(`
      ${emailIconBadge("mark", "#fffbeb")}
      ${emailPill("Trial", "warning")}
      <div style="height:12px"></div>
      ${emailH1("Seu período de teste termina em {{ends_at}}")}
      ${emailP(`Oi {{user_name}}, o trial do <strong>{{plan_name}}</strong> está acabando. Confirme o pagamento para manter leads, WhatsApp e campanhas rodando.`)}
      <p style="margin:0">${emailCta("{{billing_url}}", "Manter assinatura")}</p>
    `),
    text: "Trial {{plan_name}} termina em {{ends_at}}. {{billing_url}}",
  },
  {
    slug: "invoice-paid",
    scope: "system",
    category: "billing",
    description: "Recibo de cobrança bem-sucedida.",
    variables: ["user_name", "plan_name", "amount", "next_billing", "invoice_url"],
    subject: "Recibo — {{plan_name}} · {{amount}}",
    html: sys(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Pago", "success")}
      <div style="height:12px"></div>
      ${emailH1("Pagamento recebido")}
      ${emailP(`Olá {{user_name}}, confirmamos o pagamento de <strong>{{amount}}</strong> do plano <strong>{{plan_name}}</strong>.`)}
      ${emailCard(emailKvTable([
        ["Valor", "{{amount}}"],
        ["Plano", "{{plan_name}}"],
        ["Próxima cobrança", "{{next_billing}}"],
      ]))}
      <p style="margin:0">${emailCta("{{invoice_url}}", "Ver fatura", "secondary")}</p>
    `),
    text: "Recibo {{amount}} · {{plan_name}}. Próxima: {{next_billing}}.",
  },
  {
    slug: "security-alert",
    scope: "system",
    category: "security",
    description: "Alerta de segurança (novo login / alteração sensível).",
    variables: ["user_name", "event_label", "ip", "when", "support_url"],
    subject: "Alerta de segurança — {{event_label}}",
    html: sys(`
      ${emailIconBadge("mark", "#fef2f2")}
      ${emailPill("Segurança", "danger")}
      <div style="height:12px"></div>
      ${emailH1("Atividade na sua conta")}
      ${emailP(`Olá {{user_name}}, detectamos: <strong>{{event_label}}</strong>.`)}
      ${emailCard(emailKvTable([
        ["Quando", "{{when}}"],
        ["IP", "{{ip}}"],
      ]))}
      ${emailP("Se foi você, pode ignorar. Caso contrário, altere a senha e fale com o suporte.")}
      <p style="margin:0">${emailCta("{{support_url}}", "Falar com suporte", "secondary")}</p>
    `),
    text: "Alerta: {{event_label}} em {{when}} (IP {{ip}}).",
  },
]

/* ───────────────────────────── TENANT ───────────────────────────── */

function customerWelcomeBody(typeLabel: string, ctaLabel: string): string {
  return `
    ${emailIconBadge("mark", "#f5f5f5")}
    ${emailPill(typeLabel, "info")}
    <div style="height:12px"></div>
    ${emailH1("Bem-vindo(a) à {{brand_name}}")}
    ${emailP(`Oi <strong>{{customer_name}}</strong>, seu cadastro foi realizado com sucesso.`)}
    ${emailP("{{welcome_message}}")}
    <p style="margin:18px 0 8px">${brandCta("{{store_url}}", ctaLabel)}</p>
    ${emailMuted("Dúvidas? Responda este e-mail ou fale conosco no WhatsApp.")}
  `
}

export const TENANT_TEMPLATES: CatalogTemplate[] = [
  {
    slug: "welcome-customer",
    scope: "tenant",
    category: "onboarding",
    audience: "customer",
    description: "Boas-vindas genéricas a cliente/lead com e-mail.",
    variables: ["customer_name", "brand_name", "brand_color", "store_url", "whatsapp_url", "welcome_message", "client_type"],
    subject: "Bem-vindo(a) à {{brand_name}}, {{customer_name}}",
    html: ten(customerWelcomeBody("Cliente", "Conhecer a marca")),
    text: "Bem-vindo {{customer_name}} à {{brand_name}}. {{store_url}}",
  },
  {
    slug: "welcome-customer-retail",
    scope: "tenant",
    category: "onboarding",
    audience: "customer_retail",
    description: "Boas-vindas cliente varejo / consumidor final.",
    variables: ["customer_name", "brand_name", "brand_color", "store_url", "whatsapp_url", "welcome_message", "client_type", "brand_logo_url"],
    subject: "{{brand_name}} · prazer em ter você, {{customer_name}}",
    html: ten(customerWelcomeBody("Varejo", "Ver novidades")),
    text: "Olá {{customer_name}}, bem-vindo à {{brand_name}} (varejo).",
  },
  {
    slug: "welcome-customer-b2b",
    scope: "tenant",
    category: "onboarding",
    audience: "customer_b2b",
    description: "Boas-vindas cliente B2B / atacado.",
    variables: ["customer_name", "brand_name", "brand_color", "store_url", "whatsapp_url", "welcome_message", "client_type", "brand_logo_url"],
    subject: "Parceria {{brand_name}} — bem-vindo, {{customer_name}}",
    html: ten(customerWelcomeBody("B2B / Atacado", "Acessar área do parceiro")),
    text: "Bem-vindo {{customer_name}} (B2B) à {{brand_name}}.",
  },
  {
    slug: "welcome-customer-service",
    scope: "tenant",
    category: "onboarding",
    audience: "customer_service",
    description: "Boas-vindas cliente de serviços / agendamento.",
    variables: ["customer_name", "brand_name", "brand_color", "store_url", "whatsapp_url", "welcome_message", "client_type", "brand_logo_url"],
    subject: "{{brand_name}} · seu cadastro está ativo",
    html: ten(customerWelcomeBody("Serviços", "Falar conosco")),
    text: "Cadastro ativo em {{brand_name}}. {{store_url}}",
  },
  {
    slug: "welcome-affiliate",
    scope: "tenant",
    category: "affiliates",
    audience: "affiliate",
    description: "Boas-vindas ao afiliado da marca.",
    variables: ["affiliate_name", "brand_name", "brand_color", "affiliate_panel_url", "commission_rate", "program_name", "brand_logo_url"],
    subject: "Bem-vindo(a) à {{brand_name}}, {{affiliate_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Conta de parceiro", "success")}
      <div style="height:12px"></div>
      ${emailH1("Sua conta de parceiro está pronta")}
      ${emailP(`Oi <strong>{{affiliate_name}}</strong> — você entrou no programa <strong>{{program_name}}</strong> da <strong>{{brand_name}}</strong>.`)}
      ${emailP("No app você encontra materiais oficiais, link e cupom com rastreio, leads e a carteira de comissões.")}
      ${emailCard(emailKvTable([
        ["Programa", "{{program_name}}"],
        ["Comissão", "{{commission_rate}}"],
        ["Acesso", "Central do afiliado"],
      ]))}
      ${emailP("<strong>Primeiros passos:</strong> abra o app → copie seu link → compartilhe com materiais da marca → ative as notificações.")}
      <p style="margin:0 0 8px">${brandCta("{{affiliate_panel_url}}", "Abrir meu app de parceiro")}</p>
      ${emailMuted("Guarde este e-mail: o link leva direto à sua central.")}
    `),
    text: "Bem-vindo {{affiliate_name}}! Programa {{program_name}} · {{brand_name}}. Comissão: {{commission_rate}}. App: {{affiliate_panel_url}}",
  },
  {
    slug: "affiliate-approved",
    scope: "tenant",
    category: "affiliates",
    audience: "affiliate",
    description: "Afiliado aprovado / aceite confirmado no programa.",
    variables: ["affiliate_name", "brand_name", "brand_color", "affiliate_panel_url", "program_name", "brand_logo_url", "commission_rate"],
    subject: "Você foi aceito em {{program_name}} · {{brand_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Aprovado", "success")}
      <div style="height:12px"></div>
      ${emailH1("Aceite confirmado")}
      ${emailP(`Parabéns, <strong>{{affiliate_name}}</strong>! Sua entrada no programa <strong>{{program_name}}</strong> da <strong>{{brand_name}}</strong> foi aprovada.`)}
      ${emailCard(emailKvTable([
        ["Programa", "{{program_name}}"],
        ["Status", "Ativo / onboarding"],
        ["Comissão", "{{commission_rate}}"],
      ]))}
      ${emailP("Conclua o onboarding no app (termos e treinamentos, se houver), copie seu link e comece a divulgar com os materiais oficiais.")}
      <p style="margin:0 0 8px">${brandCta("{{affiliate_panel_url}}", "Continuar no app")}</p>
      ${emailMuted("Ative as notificações para saber de leads e comissões em tempo real.")}
    `),
    text: "Aceito em {{program_name}} ({{brand_name}}). Comissão: {{commission_rate}}. App: {{affiliate_panel_url}}",
  },
  {
    slug: "affiliate-commission",
    scope: "tenant",
    category: "affiliates",
    description: "Comissão gerada por venda.",
    variables: ["affiliate_name", "brand_name", "brand_color", "order_id", "commission_amount", "sale_amount", "panel_url"],
    subject: "Comissão de {{commission_amount}} registrada",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailH1("Nova comissão")}
      ${emailP(`{{affiliate_name}}, uma venda da {{brand_name}} gerou comissão para você.`)}
      ${emailCard(emailKvTable([
        ["Pedido", "#{{order_id}}"],
        ["Venda", "{{sale_amount}}"],
        ["Sua comissão", "{{commission_amount}}"],
      ]))}
      <p style="margin:0">${brandCta("{{panel_url}}", "Ver no painel")}</p>
    `),
    text: "Comissão {{commission_amount}} no pedido #{{order_id}}.",
  },
  {
    slug: "order-confirmed-buyer",
    scope: "tenant",
    category: "orders",
    description: "Confirmação de pedido para o comprador.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "total", "items_summary", "tracking_url", "payment_status"],
    subject: "Pedido #{{order_id}} recebido — {{brand_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailPill("{{payment_status}}", "info")}
      <div style="height:12px"></div>
      ${emailH1("Pedido confirmado")}
      ${emailP(`{{customer_name}}, recebemos seu pedido na <strong>{{brand_name}}</strong>.`)}
      ${emailCard(emailKvTable([
        ["Pedido", "#{{order_id}}"],
        ["Total", "{{total}}"],
        ["Itens", "{{items_summary}}"],
      ]))}
      <p style="margin:0 0 8px">${brandCta("{{tracking_url}}", "Acompanhar pedido")}</p>
      ${emailMuted("Guardamos este e-mail como comprovante da sua compra.")}
    `),
    text: "Pedido #{{order_id}} · {{total}}. Acompanhe: {{tracking_url}}",
  },
  {
    slug: "order-received-seller",
    scope: "tenant",
    category: "orders",
    description: "Novo pedido — notificação para a loja/vendedor.",
    variables: ["seller_name", "brand_name", "brand_color", "order_id", "total", "customer_name", "customer_phone", "items_summary", "admin_url"],
    subject: "Novo pedido #{{order_id}} · {{total}}",
    html: ten(`
      ${emailIconBadge("mark", "#fffbeb")}
      ${emailPill("Novo pedido", "warning")}
      <div style="height:12px"></div>
      ${emailH1("Você tem um novo pedido")}
      ${emailP(`Oi {{seller_name}}, entrou um pedido na <strong>{{brand_name}}</strong>.`)}
      ${emailCard(emailKvTable([
        ["Pedido", "#{{order_id}}"],
        ["Cliente", "{{customer_name}}"],
        ["Telefone", "{{customer_phone}}"],
        ["Total", "{{total}}"],
        ["Itens", "{{items_summary}}"],
      ]))}
      <p style="margin:0">${brandCta("{{admin_url}}", "Abrir no painel")}</p>
    `),
    text: "Novo pedido #{{order_id}} de {{customer_name}} · {{total}}",
  },
  {
    slug: "order-paid-buyer",
    scope: "tenant",
    category: "orders",
    description: "Pagamento confirmado para o comprador.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "total", "tracking_url"],
    subject: "Pagamento confirmado — pedido #{{order_id}}",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailPill("Pago", "success")}
      <div style="height:12px"></div>
      ${emailH1("Pagamento recebido")}
      ${emailP(`{{customer_name}}, o pagamento de <strong>{{total}}</strong> do pedido <strong>#{{order_id}}</strong> foi confirmado.`)}
      ${emailP("Já estamos preparando tudo. Você recebe novidades por aqui.")}
      <p style="margin:18px 0 0">${brandCta("{{tracking_url}}", "Ver pedido")}</p>
    `),
    text: "Pagamento OK pedido #{{order_id}} · {{total}}",
  },
  {
    slug: "order-shipped-buyer",
    scope: "tenant",
    category: "orders",
    description: "Pedido enviado / saiu para entrega.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "tracking_code", "tracking_url"],
    subject: "Seu pedido #{{order_id}} saiu para entrega",
    html: ten(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailH1("Pedido a caminho")}
      ${emailP(`{{customer_name}}, o pedido <strong>#{{order_id}}</strong> da {{brand_name}} foi despachado.`)}
      ${emailCard(`<p style="margin:0 0 6px;font-size:12px;color:${L.muted}">Código de rastreio</p>
        <p style="margin:0;font-size:16px;font-weight:700;font-family:Menlo,monospace;letter-spacing:0.02em">{{tracking_code}}</p>`)}
      <p style="margin:0">${brandCta("{{tracking_url}}", "Rastrear envio")}</p>
    `),
    text: "Pedido #{{order_id}} enviado. Rastreio: {{tracking_code}}",
  },
  {
    slug: "order-delivered-buyer",
    scope: "tenant",
    category: "orders",
    description: "Pedido entregue + pedido de avaliação.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "review_url"],
    subject: "Pedido #{{order_id}} entregue 🎉",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailH1("Entrega concluída")}
      ${emailP(`{{customer_name}}, o pedido <strong>#{{order_id}}</strong> foi marcado como entregue.`)}
      ${emailP("Se puder, conte como foi a experiência — leva menos de um minuto.")}
      <p style="margin:18px 0 0">${brandCta("{{review_url}}", "Avaliar compra")}</p>
    `),
    text: "Pedido #{{order_id}} entregue. Avalie: {{review_url}}",
  },
  {
    slug: "order-canceled-buyer",
    scope: "tenant",
    category: "orders",
    description: "Pedido cancelado — comprador.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "reason", "store_url"],
    subject: "Pedido #{{order_id}} cancelado",
    html: ten(`
      ${emailIconBadge("mark", "#fef2f2")}
      ${emailPill("Cancelado", "danger")}
      <div style="height:12px"></div>
      ${emailH1("Pedido cancelado")}
      ${emailP(`{{customer_name}}, o pedido <strong>#{{order_id}}</strong> foi cancelado.`)}
      ${emailCard(`<p style="margin:0;font-size:14px;color:#404040"><strong>Motivo:</strong> {{reason}}</p>`)}
      <p style="margin:0">${brandCta("{{store_url}}", "Voltar à loja")}</p>
    `),
    text: "Pedido #{{order_id}} cancelado. {{reason}}",
  },
  {
    slug: "order-canceled-seller",
    scope: "tenant",
    category: "orders",
    description: "Pedido cancelado — vendedor.",
    variables: ["seller_name", "brand_name", "brand_color", "order_id", "reason", "admin_url"],
    subject: "Cancelamento #{{order_id}}",
    html: ten(`
      ${emailIconBadge("mark", "#fffbeb")}
      ${emailH1("Pedido cancelado")}
      ${emailP(`{{seller_name}}, o pedido <strong>#{{order_id}}</strong> foi cancelado.`)}
      ${emailMuted("{{reason}}")}
      <p style="margin:16px 0 0">${brandCta("{{admin_url}}", "Ver no painel")}</p>
    `),
    text: "Cancelado #{{order_id}}: {{reason}}",
  },
  {
    slug: "payment-pending-buyer",
    scope: "tenant",
    category: "orders",
    description: "Lembrete de pagamento pendente / PIX.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "total", "checkout_url", "expires_at"],
    subject: "Aguardando pagamento — pedido #{{order_id}}",
    html: ten(`
      ${emailIconBadge("mark", "#fffbeb")}
      ${emailPill("Pendente", "warning")}
      <div style="height:12px"></div>
      ${emailH1("Finalize seu pagamento")}
      ${emailP(`{{customer_name}}, seu pedido <strong>#{{order_id}}</strong> ({{total}}) ainda aguarda pagamento.`)}
      ${emailMuted("Expira em {{expires_at}}.")}
      <p style="margin:16px 0 0">${brandCta("{{checkout_url}}", "Pagar agora")}</p>
    `),
    text: "Pagar pedido #{{order_id}} {{total}}: {{checkout_url}}",
  },
  {
    slug: "cart-abandoned",
    scope: "tenant",
    category: "recovery",
    description: "Carrinho / checkout abandonado.",
    variables: ["customer_name", "brand_name", "brand_color", "cart_url", "discount_code", "items_summary", "total"],
    subject: "Você esqueceu algo no carrinho · {{brand_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Seu carrinho te espera")}
      ${emailP(`Oi {{customer_name}}, você deixou itens na {{brand_name}} sem finalizar.`)}
      ${emailCard(`
        <p style="margin:0 0 8px;font-size:13px;color:${L.muted}">Itens</p>
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${L.ink}">{{items_summary}}</p>
        <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em">{{total}}</p>
      `)}
      ${emailCard(`<p style="margin:0;font-size:14px;color:#404040">Use o cupom <strong style="font-family:Menlo,monospace;letter-spacing:0.04em">{{discount_code}}</strong> e finalize com desconto.</p>`, { bg: "#fffbeb", border: "#fde68a" })}
      <p style="margin:0">${brandCta("{{cart_url}}", "Finalizar compra")}</p>
    `),
    text: "Carrinho pendente {{total}}. Cupom {{discount_code}}: {{cart_url}}",
  },
  {
    slug: "followup-lead",
    scope: "tenant",
    category: "crm",
    description: "Follow-up de lead sem resposta.",
    variables: ["customer_name", "brand_name", "brand_color", "agent_name", "whatsapp_url"],
    subject: "Oi {{customer_name}}, ainda posso ajudar?",
    html: ten(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailH1("Tudo certo por aí?")}
      ${emailP(`Oi {{customer_name}}, aqui é {{agent_name}} da {{brand_name}}.`)}
      ${emailP("Vi seu interesse e queria saber se restou alguma dúvida. Estou por aqui — sem pressão.")}
      <p style="margin:18px 0 0">${brandCta("{{whatsapp_url}}", "Falar no WhatsApp")}</p>
    `),
    text: "Oi {{customer_name}}, posso ajudar? {{whatsapp_url}}",
  },
  {
    slug: "review-request",
    scope: "tenant",
    category: "engagement",
    description: "Pedido de avaliação pós-compra.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "review_url"],
    subject: "Como foi sua compra na {{brand_name}}?",
    html: ten(`
      ${emailIconBadge("mark", "#fffbeb")}
      ${emailH1("Sua opinião importa")}
      ${emailP(`{{customer_name}}, o pedido <strong>#{{order_id}}</strong> já foi entregue. Conta pra gente como foi?`)}
      <p style="margin:18px 0 0">${brandCta("{{review_url}}", "Deixar avaliação")}</p>
    `),
    text: "Avalie o pedido #{{order_id}}: {{review_url}}",
  },
  {
    slug: "aniversario",
    scope: "tenant",
    category: "engagement",
    description: "Aniversário do cliente.",
    variables: ["customer_name", "brand_name", "brand_color", "discount_code", "store_url"],
    subject: "Feliz aniversário, {{customer_name}} 🎂",
    html: ten(`
      ${emailIconBadge("mark", "#fdf2f8")}
      ${emailH1("Parabéns!")}
      ${emailP(`{{customer_name}}, a {{brand_name}} deseja um dia incrível.`)}
      ${emailCard(`<p style="margin:0;font-size:14px">Presente: cupom <strong style="font-family:Menlo,monospace">{{discount_code}}</strong></p>`, { bg: "#fffbeb", border: "#fde68a" })}
      <p style="margin:0">${brandCta("{{store_url}}", "Aproveitar presente")}</p>
    `),
    text: "Feliz aniversário! Cupom {{discount_code}} em {{store_url}}",
  },
  {
    slug: "recuperacao-cliente",
    scope: "tenant",
    category: "recovery",
    description: "Cliente inativo — reativação.",
    variables: ["customer_name", "brand_name", "brand_color", "days_inactive", "store_url", "discount_code"],
    subject: "Sentimos sua falta, {{customer_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Faz tempo, hein?")}
      ${emailP(`{{customer_name}}, faz <strong>{{days_inactive}} dias</strong> que não te vemos na {{brand_name}}.`)}
      ${emailCard(`<p style="margin:0;font-size:14px">Cupom de volta: <strong style="font-family:Menlo,monospace">{{discount_code}}</strong></p>`)}
      <p style="margin:0">${brandCta("{{store_url}}", "Ver novidades")}</p>
    `),
    text: "Sentimos sua falta. Cupom {{discount_code}}: {{store_url}}",
  },
  {
    slug: "lembrete-agendamento",
    scope: "tenant",
    category: "services",
    description: "Lembrete de agendamento.",
    variables: ["customer_name", "brand_name", "brand_color", "appointment_date", "appointment_time", "address", "confirm_url"],
    subject: "Lembrete: {{appointment_date}} às {{appointment_time}}",
    html: ten(`
      ${emailIconBadge("mark", "#eff6ff")}
      ${emailH1("Seu horário está chegando")}
      ${emailP(`Olá {{customer_name}}, lembrete do agendamento na {{brand_name}}.`)}
      ${emailCard(emailKvTable([
        ["Data", "{{appointment_date}}"],
        ["Horário", "{{appointment_time}}"],
        ["Local", "{{address}}"],
      ]))}
      <p style="margin:0">${brandCta("{{confirm_url}}", "Confirmar presença")}</p>
    `),
    text: "Agendamento {{appointment_date}} {{appointment_time}} — {{address}}",
  },
  {
    slug: "novo-produto",
    scope: "tenant",
    category: "marketing",
    description: "Lançamento de produto.",
    variables: ["customer_name", "brand_name", "brand_color", "product_name", "product_image", "product_url", "product_price"],
    subject: "Novidade: {{product_name}}",
    html: ten(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Acabou de chegar")}
      ${emailP(`{{customer_name}}, lançamento na {{brand_name}}: <strong>{{product_name}}</strong>.`)}
      <p style="margin:0 0 16px;text-align:center">
        <img src="{{product_image}}" alt="{{product_name}}" width="480" style="max-width:100%;border-radius:14px;border:1px solid ${L.borderLight};display:block;margin:0 auto">
      </p>
      ${emailCard(`<p style="margin:0;font-size:18px;font-weight:700">{{product_price}}</p>`)}
      <p style="margin:0">${brandCta("{{product_url}}", "Conferir agora")}</p>
    `),
    text: "Novo: {{product_name}} {{product_price}} — {{product_url}}",
  },
  {
    slug: "agradecimento-pedido",
    scope: "tenant",
    category: "orders",
    description: "Alias legado de order-confirmed-buyer.",
    variables: ["customer_name", "brand_name", "brand_color", "order_id", "total", "tracking_url"],
    subject: "Obrigado pela compra na {{brand_name}}!",
    html: ten(`
      ${emailIconBadge("mark", "#ecfdf5")}
      ${emailH1("Obrigado pela compra")}
      ${emailP(`{{customer_name}}, pedido <strong>#{{order_id}}</strong> · <strong>{{total}}</strong> recebido com sucesso.`)}
      <p style="margin:18px 0 0">${brandCta("{{tracking_url}}", "Acompanhar")}</p>
    `),
    text: "Pedido #{{order_id}} confirmado. {{tracking_url}}",
  },
  {
    slug: "abandono-carrinho",
    scope: "tenant",
    category: "recovery",
    description: "Alias legado de cart-abandoned.",
    variables: ["customer_name", "brand_name", "brand_color", "cart_url", "discount_code", "items_summary", "total"],
    subject: "Você esqueceu algo no carrinho 👀",
    html: ten(`
      ${emailIconBadge("mark", "#f5f5f5")}
      ${emailH1("Voltou pra terminar?")}
      ${emailP(`Oi {{customer_name}}, ainda dá tempo de garantir seus itens na {{brand_name}}.`)}
      ${emailCard(`<p style="margin:0;font-size:14px">Cupom <strong style="font-family:Menlo,monospace">{{discount_code}}</strong></p>`, { bg: "#fffbeb", border: "#fde68a" })}
      <p style="margin:0">${brandCta("{{cart_url}}", "Finalizar compra")}</p>
    `),
    text: "Cupom {{discount_code}}: {{cart_url}}",
  },
]

export function allCatalogTemplates(): CatalogTemplate[] {
  return [...SYSTEM_TEMPLATES, ...TENANT_TEMPLATES]
}

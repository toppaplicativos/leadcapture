export type SkillKind = "business" | "ui";

export interface SkillMeta {
  kind: SkillKind;
  objectives: string[];
  requiresCanvas: boolean;
  canvasRoute?: string;
  inlineComponents: boolean;
}

/** Metadados de apresentação — separado das business actions. */
export const SKILL_META: Record<string, SkillMeta> = {
  "dashboard.show": {
    kind: "business",
    objectives: ["como está o negócio", "visão geral", "painel", "resumo"],
    requiresCanvas: true,
    canvasRoute: "/dashboard",
    inlineComponents: false,
  },
  "crm.leads.table": {
    kind: "business",
    objectives: ["ver leads", "meus leads", "listar leads"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "crm.clients.table": {
    kind: "business",
    objectives: ["ver clientes", "relacionamento", "base de clientes"],
    requiresCanvas: false,
    canvasRoute: "/clientes",
    inlineComponents: true,
  },
  "crm.clients.list": {
    kind: "business",
    objectives: ["lista de clientes"],
    requiresCanvas: false,
    canvasRoute: "/clientes",
    inlineComponents: true,
  },
  "lead.prospect": {
    kind: "business",
    objectives: ["prospectar leads", "buscar no mapa", "modo paleteiro"],
    requiresCanvas: false,
    canvasRoute: "/busca",
    inlineComponents: true,
  },
  "crm.leads.search": {
    kind: "business",
    objectives: ["buscar leads", "prospectar"],
    requiresCanvas: false,
    canvasRoute: "/busca",
    inlineComponents: true,
  },
  "crm.lead.find": {
    kind: "business",
    objectives: ["encontrar lead", "editar lead", "cadastrar cliente"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "campaigns.create": {
    kind: "business",
    objectives: ["criar campanha", "nova campanha", "disparar mensagens", "vender"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "campaigns.list": {
    kind: "business",
    objectives: ["ver campanhas", "campanhas ativas"],
    requiresCanvas: false,
    canvasRoute: "/campanhas",
    inlineComponents: true,
  },
  "messages.inbox": {
    kind: "business",
    objectives: ["responder cliente", "conversas", "mensagens", "atendimento"],
    requiresCanvas: false,
    inlineComponents: true,
    canvasRoute: "/mensagens",
  },
  "order.assisted": {
    kind: "business",
    objectives: ["fazer pedido", "tirar pedido", "pedido para"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "flow.builder": {
    kind: "business",
    objectives: ["editar fluxo", "criar fluxo", "automação visual"],
    requiresCanvas: true,
    canvasRoute: "/fluxos",
    inlineComponents: false,
  },
  "creative.generate": {
    kind: "business",
    objectives: ["criar criativo", "gerar imagem", "criativos ia"],
    requiresCanvas: true,
    canvasRoute: "/criativos",
    inlineComponents: false,
  },
  "video.create": {
    kind: "business",
    objectives: ["criar vídeo", "video studio"],
    requiresCanvas: true,
    canvasRoute: "/video-studio",
    inlineComponents: false,
  },
  "gallery.open": {
    kind: "business",
    objectives: ["abrir galeria", "minhas imagens"],
    requiresCanvas: false,
    canvasRoute: "/galeria",
    inlineComponents: true,
  },
  "agent.configure": {
    kind: "business",
    objectives: ["configurar agente", "treinar agente"],
    requiresCanvas: true,
    canvasRoute: "/agente",
    inlineComponents: false,
  },
  "workspace.overview": {
    kind: "business",
    objectives: ["status do agente", "prontidão"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "dashboard.overview": {
    kind: "business",
    objectives: ["resumo rápido", "kpis"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "catalog.products": {
    kind: "business",
    objectives: ["ver produtos", "catálogo"],
    requiresCanvas: false,
    canvasRoute: "/produtos",
    inlineComponents: true,
  },
  "catalog.products.table": {
    kind: "business",
    objectives: ["ver estoque", "tabela de produtos"],
    requiresCanvas: false,
    canvasRoute: "/produtos",
    inlineComponents: true,
  },
  "catalog.products.create": {
    kind: "business",
    objectives: ["criar produto", "cadastrar produto", "novo produto"],
    requiresCanvas: false,
    canvasRoute: "/produtos",
    inlineComponents: true,
  },
  "catalog.orders": {
    kind: "business",
    objectives: ["ver pedidos", "vendas"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "skills.list": {
    kind: "business",
    objectives: ["ver habilidades"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "skills.train": {
    kind: "business",
    objectives: ["ensinar agente", "nova habilidade"],
    requiresCanvas: false,
    inlineComponents: true,
  },
  "nav.help": {
    kind: "ui",
    objectives: ["ajuda", "o que posso fazer"],
    requiresCanvas: false,
    inlineComponents: true,
  },
};

export function getSkillMeta(skillId: string): SkillMeta | null {
  return SKILL_META[skillId] || null;
}
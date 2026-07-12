/**
 * Instagram reply seed pack for automation_definitions.
 * Fill-missing only; never overwrites user-modified rows; seeds inactive by default.
 */

import { query, queryOne, insert, update } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import { automationDefinitionsService } from "./automationDefinitions";

export const IG_SEED_PACK_VERSION = 2;

export interface SeedTemplate {
  seed_key: string;
  nome: string;
  descricao: string;
  priority: number;
  trigger: Record<string, any>;
  pipeline: Array<{ ordem: number; tipo: string; config: Record<string, any> }>;
  limites: Record<string, any>;
}

const DEFAULT_KEYWORDS = ["preço", "preco", "valor", "quanto", "info", "catálogo", "catalogo", "pedido"];

export function getInstagramReplySeedPack(): SeedTemplate[] {
  return [
    /**
     * PADRÃO POR BRAND — dois caminhos, mesma estrutura:
     * 1) dm_keyword — palavras-chave (preço, catálogo…) + FAQ/IA da marca
     * 2) resposta_padrao_dm — sem keyword: template + contexto da marca (persona/FAQ)
     */
    {
      seed_key: "ig.dm.keyword",
      nome: "DM com palavra-chave",
      descricao:
        "Quando a DM contém palavras-chave (preço, catálogo…). Usa FAQ/persona da marca. Ative e edite as keywords.",
      priority: 20,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "dm_keyword",
        palavrasChave: [...DEFAULT_KEYWORDS],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: true,
            // {brand} is filled from brand AI settings at send time
            fallback_message:
              "Sobre isso, a {brand} pode te ajudar! Me diga mais detalhes ou digite *menu* para opções.",
            mensagem:
              "Recebi sua dúvida sobre o tema 💚 A equipe da {brand} retorna em breve com valores e disponibilidade. Digite *menu* se quiser navegar.",
            delaySegundos: 0,
            mensagemSteps: [
              {
                id: "kw-text",
                tipo: "texto",
                caption:
                  "Recebi sua dúvida 💚 A {brand} retorna em breve com mais detalhes. Digite *menu* para opções.",
                delaySegundos: 0,
              },
            ],
          },
        },
      ],
      limites: {
        maxPorUsuario: 3,
        cooldownSegundos: 3600,
        maxPorHora: 30,
        maxPorDia: 200,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.dm.default_reply",
      nome: "Resposta padrão em DM",
      descricao:
        "Sem palavra-chave: template padrão da marca (persona/FAQ/contexto). Mesmo padrão para toda brand — conteúdo por marca.",
      priority: 50,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "resposta_padrao_dm",
        palavrasChave: [],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            // Prefer FAQ + brand context; IA optional with strong brand fallback
            iaGenerated: true,
            fallback_message:
              "Oi! Recebemos sua mensagem na {brand} 💚 Em breve retornamos. Digite *menu* para ver opções.",
            mensagem:
              "Oi! Recebemos sua mensagem na {brand} 💚 Em breve retornamos. Digite *menu* para ver opções.",
            delaySegundos: 0,
            mensagemSteps: [
              {
                id: "default-text",
                tipo: "texto",
                caption:
                  "Oi! Recebemos sua mensagem na {brand} 💚 Em breve retornamos. Digite *menu* para ver opções.",
                delaySegundos: 0,
              },
            ],
          },
        },
      ],
      limites: {
        maxPorUsuario: 3,
        cooldownSegundos: 60,
        maxPorHora: 40,
        maxPorDia: 200,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.comment.keyword_dm",
      nome: "Comentário keyword → DM",
      descricao: "Quando um comentário contém keyword, envia DM privada.",
      priority: 30,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "comentario_keyword",
        palavrasChave: [...DEFAULT_KEYWORDS],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: true,
            fallback_message: "Obrigado pelo comentário! Te chamei no direct.",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 3,
        cooldownSegundos: 3600,
        maxPorHora: 20,
        maxPorDia: 100,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.comment.keyword_public",
      nome: "Comentário keyword → público",
      descricao: "Responde publicamente no comentário quando há keyword.",
      priority: 40,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "comentario_keyword",
        palavrasChave: [...DEFAULT_KEYWORDS],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "comentar_ig",
          config: {
            iaGenerated: true,
            fallback_message: "Obrigado pelo comentário! 💚",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 3,
        cooldownSegundos: 3600,
        maxPorHora: 20,
        maxPorDia: 100,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.mention.thanks",
      nome: "Agradecimento por menção",
      descricao: "Agradece em DM quando a conta é mencionada no story.",
      priority: 50,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "mencao_story",
        palavrasChave: [],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: true,
            fallback_message: "Muito obrigado pela menção! 💚",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 1,
        cooldownSegundos: 86400,
        maxPorHora: 10,
        maxPorDia: 50,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.follower.welcome",
      nome: "Boas-vindas a novo seguidor",
      descricao: "Placeholder experimental — ativar só se o webhook de follow estiver disponível.",
      priority: 50,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "novo_seguidor",
        palavrasChave: [],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: false,
            mensagem: "Olá! Obrigado por seguir a gente 💚",
            fallback_message: "Olá! Obrigado por seguir a gente 💚",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 1,
        cooldownSegundos: 604800,
        maxPorHora: 20,
        maxPorDia: 100,
        janelaMaxUsuarioSegundos: 604800,
      },
    },
    // ── Navegação por botões (Quick Replies / postback) ──
    {
      seed_key: "ig.dm.nav_menu",
      nome: "Menu de navegação IG",
      descricao:
        "Envia menu com botões (Quick Replies). Gatilho: menu, ajuda, oi… Ative e teste no direct.",
      priority: 15,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "dm_keyword",
        palavrasChave: ["menu", "ajuda", "opções", "opcoes", "inicio", "início", "start", "navegação", "navegacao"],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: false,
            fallback_message: "Como posso ajudar?",
            delaySegundos: 0,
            mensagemSteps: [
              {
                id: "nav-text-1",
                tipo: "texto",
                caption: "Olá! 👋 Como posso ajudar?",
                delaySegundos: 0,
              },
              {
                id: "nav-btns-1",
                tipo: "botoes",
                caption: "Escolha uma opção:",
                buttons: [
                  { id: "nav_cat", label: "Catálogo", payload: "NAV_CATALOG" },
                  { id: "nav_price", label: "Preços", payload: "NAV_PRICES" },
                  { id: "nav_human", label: "Falar conosco", payload: "NAV_HUMAN" },
                ],
              },
            ],
          },
        },
      ],
      limites: {
        maxPorUsuario: 5,
        cooldownSegundos: 30,
        maxPorHora: 40,
        maxPorDia: 200,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.dm.nav_catalog",
      nome: "Navegação → Catálogo",
      descricao: "Resposta ao botão NAV_CATALOG (payload do Quick Reply).",
      priority: 10,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "dm_keyword",
        palavrasChave: ["NAV_CATALOG", "Catálogo", "Catalogo"],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: false,
            mensagem:
              "📦 Nosso catálogo está aqui: acesse a loja ou digite o produto que procura.\n\nResponda *menu* para voltar.",
            fallback_message: "Veja nosso catálogo e me diga o que busca!",
            delaySegundos: 0,
            mensagemSteps: [
              {
                id: "cat-text",
                tipo: "texto",
                caption:
                  "📦 Nosso catálogo está disponível! Me diga o produto ou responda *menu* para outras opções.",
              },
              {
                id: "cat-cta",
                tipo: "cta",
                ctaLabel: "Abrir loja",
                url: "https://leadcapture.online",
                caption: "Toque para ver a vitrine:",
              },
            ],
          },
        },
      ],
      limites: {
        maxPorUsuario: 5,
        cooldownSegundos: 10,
        maxPorHora: 40,
        maxPorDia: 200,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.dm.nav_prices",
      nome: "Navegação → Preços",
      descricao: "Resposta ao botão NAV_PRICES.",
      priority: 10,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "dm_keyword",
        palavrasChave: ["NAV_PRICES", "Preços", "Precos"],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: false,
            mensagem:
              "💰 Preços variam por volume. Me diga o produto e a quantidade que monto um orçamento. Responda *menu* para voltar.",
            fallback_message: "Me diga o produto para orçamento.",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 5,
        cooldownSegundos: 10,
        maxPorHora: 40,
        maxPorDia: 200,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
    {
      seed_key: "ig.dm.nav_human",
      nome: "Navegação → Atendimento humano",
      descricao: "Resposta ao botão NAV_HUMAN.",
      priority: 10,
      trigger: {
        tipo: "evento",
        plataforma: "instagram",
        evento: "dm_keyword",
        palavrasChave: ["NAV_HUMAN", "Falar conosco", "humano", "atendente"],
      },
      pipeline: [
        {
          ordem: 1,
          tipo: "enviar_dm_ig",
          config: {
            iaGenerated: false,
            mensagem:
              "🙋 Um atendente vai te responder em breve. Enquanto isso, descreva seu pedido. Responda *menu* para outras opções.",
            fallback_message: "Em breve um humano responde aqui.",
            delaySegundos: 0,
          },
        },
      ],
      limites: {
        maxPorUsuario: 3,
        cooldownSegundos: 60,
        maxPorHora: 20,
        maxPorDia: 100,
        janelaMaxUsuarioSegundos: 86400,
      },
    },
  ];
}

export interface SeedInstallResult {
  created: string[];
  updated: string[];
  skipped: string[];
  skipped_customized: string[];
}

export async function seedInstagramReplyDefinitions(
  brandId: string,
  userId: string,
  options: { force?: boolean; mode?: "fill-missing" } = {},
): Promise<SeedInstallResult> {
  await automationDefinitionsService.ensureSchema();

  const pack = getInstagramReplySeedPack();
  const result: SeedInstallResult = {
    created: [],
    updated: [],
    skipped: [],
    skipped_customized: [],
  };

  // Advisory lock via transaction-scoped advisory when PG; fallback sequential for MySQL-compat
  try {
    await query(`SELECT pg_advisory_xact_lock(hashtext(?))`, [`automation_seed:${brandId}`]);
  } catch {
    /* non-PG or no hashtext — continue without lock */
  }

  for (const seed of pack) {
    const existing = await queryOne<any>(
      `SELECT id, seed_key, system_version, user_modified_at, origin, ativa
       FROM automation_definitions
       WHERE brand_id = ? AND seed_key = ?
       LIMIT 1`,
      [brandId, seed.seed_key],
    );

    if (!existing) {
      const id = uuidv4();
      await insert(
        `INSERT INTO automation_definitions
         (id, brand_id, user_id, nome, descricao, ativa, status,
          trigger_json, pipeline_json, limites_json, metrics_json,
          seed_key, origin, priority, system_version, user_modified_at, next_run_at)
         VALUES (?, ?, ?, ?, ?, FALSE, 'rascunho', ?, ?, ?, ?, ?, 'seed', ?, ?, NULL, NULL)`,
        [
          id,
          brandId,
          userId,
          seed.nome,
          seed.descricao,
          JSON.stringify(seed.trigger),
          JSON.stringify(seed.pipeline),
          JSON.stringify(seed.limites),
          JSON.stringify({ runs: 0, sucessos: 0, falhas: 0 }),
          seed.seed_key,
          seed.priority,
          IG_SEED_PACK_VERSION,
        ],
      );
      result.created.push(seed.seed_key);
      continue;
    }

    if (existing.user_modified_at) {
      result.skipped_customized.push(seed.seed_key);
      continue;
    }

    const ver = Number(existing.system_version || 0);
    // fill-missing (default): never overwrite existing content unless force
    if (!options.force) {
      result.skipped.push(seed.seed_key);
      continue;
    }
    const shouldUpdate = options.force === true || ver < IG_SEED_PACK_VERSION;

    if (shouldUpdate && !existing.user_modified_at) {
      await update(
        `UPDATE automation_definitions
         SET nome = ?, descricao = ?, trigger_json = ?, pipeline_json = ?, limites_json = ?,
             priority = ?, system_version = ?, origin = COALESCE(origin, 'seed'), updated_at = NOW()
         WHERE id = ? AND brand_id = ? AND user_modified_at IS NULL`,
        [
          seed.nome,
          seed.descricao,
          JSON.stringify(seed.trigger),
          JSON.stringify(seed.pipeline),
          JSON.stringify(seed.limites),
          seed.priority,
          IG_SEED_PACK_VERSION,
          existing.id,
          brandId,
        ],
      );
      result.updated.push(seed.seed_key);
    } else {
      result.skipped.push(seed.seed_key);
    }
  }

  logger.info(
    `[AutomationSeeds] brand=${brandId} created=${result.created.length} updated=${result.updated.length} skipped=${result.skipped.length}`,
  );
  return result;
}

/** Seed keys expected for IG reply pack (for tests / UI). */
export function listInstagramSeedKeys(): string[] {
  return getInstagramReplySeedPack().map((s) => s.seed_key);
}

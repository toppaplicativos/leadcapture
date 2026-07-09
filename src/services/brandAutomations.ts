/**
 * ═══════════════════════════════════════════════════════════════════
 * Brand Automations — catálogo de automações pré-definidas POR BRAND
 * ═══════════════════════════════════════════════════════════════════
 *
 * Arquitetura (inspirada em topp_automations do Topp App, adaptada pra
 * leadcapture onde o escopo eh por BRAND, nao global):
 *
 *   automation_catalog       — catalogo GLOBAL de 14 templates pre-definidos
 *                              (slug, name, category, task_type, default_config)
 *
 *   brand_automations        — estado POR BRAND: ativada/pausada, config
 *                              customizada, counters de execucao
 *
 *   brand_automation_runs    — log de execucoes (1 linha por run, status, duration)
 *
 * Fluxo:
 *   1. Bootstrap insere os 14 templates em automation_catalog (idempotente)
 *   2. Quando user abre /automacoes, lemos catalog + LEFT JOIN brand_automations
 *      pra mostrar todas as opcoes com estado atual do brand ativo
 *   3. User clica toggle → cria/atualiza brand_automations.status='active'
 *   4. Scheduler tick periodico verifica brand_automations.status='active' E
 *      next_run_at <= NOW → dispara task correspondente
 *
 * NAO MEXE em crm_automation_rules (motor antigo continua vivo).
 */

import { query, queryOne, insert, update } from "../config/database";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

/* ───────────────────────── Tipos ───────────────────────── */

export type AutomationFrequency =
  | "every_5min" | "every_15min" | "every_30min"
  | "hourly" | "every_2h" | "every_6h" | "every_12h"
  | "daily" | "weekly" | "monthly";

export type AutomationStatus = "active" | "paused" | "error" | "disabled";

export type AutomationCategory =
  | "social" | "outreach" | "blog" | "system" | "leads" | "analytics" | "geral";

export interface CatalogTemplate {
  slug: string;
  name: string;
  description: string;
  category: AutomationCategory;
  task_type: string;
  default_frequency: AutomationFrequency;
  default_cron?: string;
  default_config: Record<string, any>;
  is_squad?: boolean;
  execution_steps?: string[];
  icon?: string;
}

export interface BrandAutomation {
  id: string;
  brand_id: string;
  user_id: string;
  catalog_slug: string;
  status: AutomationStatus;
  frequency: AutomationFrequency;
  cron_expression: string | null;
  config: Record<string, any>;
  next_run_at: Date | null;
  last_run_at: Date | null;
  last_run_status: string | null;
  last_run_duration_ms: number | null;
  last_error: string | null;
  run_count: number;
  success_count: number;
  error_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface AutomationRunRecord {
  id: string;
  brand_automation_id: string;
  status: "running" | "success" | "error";
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  result: Record<string, any> | null;
  error_message: string | null;
}

/* ──────────────── Catálogo de 14 templates (Topp App parity) ──────────────── */

export const CATALOG: CatalogTemplate[] = [
  {
    slug: "social-post-creator",
    name: "Social Post Creator Squad",
    description: "Squad completo: Estrategista → Caption → Visual → Revisão → Publicação. 5 skills especializados em posts para redes sociais.",
    category: "social",
    task_type: "squad:social-post",
    default_frequency: "every_6h",
    default_config: {
      tone: "profissional",
      category: "tecnologia",
      language: "pt-BR",
      platform: "instagram",
      auto_publish: false,
      auto_schedule: false,
      generate_image: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Caption", "Visual", "Revisão", "Publicação"],
    icon: "Share2",
  },
  {
    slug: "weekly-performance-report",
    name: "Relatório Semanal de Performance",
    description: "Toda segunda às 8h consolida métricas da semana: impressões, alcance, engajamento, melhor post. Salva snapshot no banco para histórico.",
    category: "social",
    task_type: "instagram:performance-report",
    default_frequency: "weekly",
    default_cron: "0 8 * * 1",
    default_config: {},
    icon: "BarChart3",
  },
  {
    slug: "conversion-post-friday",
    name: "Post de Conversão (Sex 19h)",
    description: "Post estratégico de vendas/CTA toda sexta às 19h. Apresenta resultados, cases e chamadas para ação.",
    category: "social",
    task_type: "squad:social-post",
    default_frequency: "weekly",
    default_cron: "0 19 * * 5",
    default_config: {
      tone: "persuasivo e orientado a resultado",
      category: "resultado, conversão e proposta de valor",
      platform: "instagram",
      auto_publish: true,
      auto_schedule: false,
      generate_image: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Caption", "Visual", "Revisão", "Publicação"],
    icon: "TrendingUp",
  },
  {
    slug: "engagement-post-mwf",
    name: "Post de Engajamento (Seg/Qua/Sex 18h)",
    description: "Posts de inspiração e motivação para gerar comentários e saves nas segundas, quartas e sextas às 18h.",
    category: "social",
    task_type: "squad:social-post",
    default_frequency: "weekly",
    default_cron: "0 18 * * 1,3,5",
    default_config: {
      tone: "inspirador e motivacional",
      category: "inspiração e motivação para empreendedores",
      platform: "instagram",
      auto_publish: true,
      auto_schedule: false,
      generate_image: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Caption", "Visual", "Revisão", "Publicação"],
    icon: "Heart",
  },
  {
    slug: "mention-monitor-3h",
    name: "Monitor de Menções (a cada 3h)",
    description: "Verifica menções ao perfil a cada 3 horas. Identifica posts de alto valor (≥50 curtidas) e novas menções.",
    category: "social",
    task_type: "instagram:mention-monitor",
    default_frequency: "every_2h",
    default_cron: "0 */3 * * *",
    default_config: {
      save_mentions: true,
      min_likes_to_highlight: 50,
    },
    icon: "Bell",
  },
  {
    slug: "auto-reply-comments-4h",
    name: "Resposta Automática a Comentários",
    description: "Verifica comentários sem resposta nos últimos posts e gera replies personalizados com IA a cada 4 horas.",
    category: "social",
    task_type: "instagram:auto-reply",
    default_frequency: "every_2h",
    default_cron: "0 */4 * * *",
    default_config: {
      reply_tone: "amigável, genuíno e profissional",
      max_per_run: 8,
    },
    icon: "MessageCircle",
  },
  {
    slug: "morning-value-post",
    name: "Post Matinal de Valor (Seg–Sex 9h)",
    description: "Gera e publica conteúdo educativo + visual IA todo dia útil às 9h. Squad completo: estratégia → legenda → imagem → revisão → publicação.",
    category: "social",
    task_type: "squad:social-post",
    default_frequency: "daily",
    default_cron: "0 9 * * 1-5",
    default_config: {
      tone: "profissional e inspirador",
      category: "educação e negócios digitais",
      platform: "instagram",
      auto_publish: true,
      auto_schedule: false,
      generate_image: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Caption", "Visual", "Revisão", "Publicação"],
    icon: "Sunrise",
  },
  {
    slug: "educational-content-tt",
    name: "Conteúdo Educativo (Ter/Qui 12h)",
    description: "Publica dicas práticas e tutoriais às terças e quintas ao meio-dia. Formato ideal para carrosséis.",
    category: "social",
    task_type: "squad:social-post",
    default_frequency: "weekly",
    default_cron: "0 12 * * 2,4",
    default_config: {
      tone: "didático e acessível",
      category: "dicas práticas, tutoriais e produtividade",
      platform: "instagram",
      auto_publish: true,
      auto_schedule: false,
      generate_image: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Caption", "Visual", "Revisão", "Publicação"],
    icon: "BookOpen",
  },
  {
    slug: "hashtag-research-weekly",
    name: "Pesquisa de Hashtags (Qua 8h)",
    description: "Toda quarta pesquisa hashtags estratégicas do nicho, analisa performance e usa IA para sugerir 25 hashtags otimizadas. Salva como template.",
    category: "social",
    task_type: "instagram:hashtag-research",
    default_frequency: "weekly",
    default_cron: "0 8 * * 3",
    default_config: {
      niche: "automação e IA para pequenas empresas brasileiras",
      max_per_run: 7,
      seed_hashtags: ["ia", "automacao", "marketing", "empreendedorismo", "pme", "tecnologia", "negociosdigitais"],
    },
    icon: "Hash",
  },
  {
    slug: "daily-stories-11h",
    name: "Stories Diários de Engajamento (11h)",
    description: "Gera conteúdo criativo para Story todos os dias às 11h. Headline impactante + visual IA + CTA.",
    category: "social",
    task_type: "instagram:story-publisher",
    default_frequency: "daily",
    default_cron: "0 11 * * *",
    default_config: {
      tone: "animado, direto e inspirador",
      category: "dica do dia para empreendedores",
      auto_publish: false,
    },
    icon: "Smartphone",
  },
  {
    slug: "profile-health-23h",
    name: "Saúde do Perfil (Diário 23h)",
    description: "Check-up noturno diário: valida token de acesso, monitora crescimento de seguidores, detecta anomalias e salva snapshot para histórico.",
    category: "social",
    task_type: "instagram:profile-health",
    default_frequency: "daily",
    default_cron: "0 23 * * *",
    default_config: {},
    icon: "ShieldCheck",
  },
  {
    slug: "ig-webhook-dm-reply",
    name: "Resposta automática a DMs (Webhook)",
    description: "Quando alguém envia DM no Instagram, responde automaticamente com IA. Disparada em tempo real pelo webhook Meta.",
    category: "social",
    task_type: "instagram:webhook-dm-reply",
    default_frequency: "every_5min",
    default_config: {
      trigger_type: "webhook",
      trigger_event: "resposta_padrao_dm",
      ia_generated: true,
      reply_tone: "amigável, genuíno e profissional",
      delay_seconds: 3,
      fallback_message: "Obrigado pela mensagem! Em breve retornamos.",
    },
    icon: "MessageCircle",
  },
  {
    slug: "ig-webhook-comment-keyword",
    name: "Resposta a comentário com keyword (Webhook)",
    description: "Quando alguém comenta com palavras-chave (preço, valor, info…), responde via DM ou comentário público.",
    category: "social",
    task_type: "instagram:webhook-comment-reply",
    default_frequency: "every_5min",
    default_config: {
      trigger_type: "webhook",
      trigger_event: "comentario_keyword",
      keywords: ["preço", "valor", "quanto", "info", "catalogo", "pedido"],
      reply_mode: "dm",
      ia_generated: true,
      reply_tone: "amigável e orientado a venda",
      delay_seconds: 5,
      fallback_message: "Obrigado pelo comentário! Te chamamos no direct com mais detalhes.",
    },
    icon: "MessageSquare",
  },
  {
    slug: "ig-webhook-mention-thanks",
    name: "Agradecimento por menção no Story (Webhook)",
    description: "Agradece automaticamente quando alguém menciona a marca em story ou compartilhamento.",
    category: "social",
    task_type: "instagram:webhook-mention-thanks",
    default_frequency: "every_5min",
    default_config: {
      trigger_type: "webhook",
      trigger_event: "mencao_story",
      ia_generated: true,
      reply_tone: "genuíno e breve",
      delay_seconds: 10,
      fallback_message: "Muito obrigado pela menção! 💚",
    },
    icon: "AtSign",
  },
  {
    slug: "prospect-outreach",
    name: "Prospect Outreach Squad",
    description: "Pipeline de prospecção ativa: seleciona prospects por nicho/score, analisa presença digital, cria mensagem personalizada por canal, revisa qualidade e dispara.",
    category: "outreach",
    task_type: "squad:prospect-outreach",
    default_frequency: "daily",
    default_config: {
      niche: "",
      channels: ["whatsapp", "email"],
      auto_send: false,
      max_per_run: 5,
      message_tone: "profissional",
      filter_status: "new",
      use_ai_messages: false,
      min_potential_score: 30,
    },
    is_squad: true,
    execution_steps: ["Seleção", "Análise digital", "Mensagens", "Revisão", "Disparo"],
    icon: "Target",
  },
  {
    slug: "blog-content-squad",
    name: "Blog Content Squad",
    description: "Squad completo: Estrategista → Redator → SEO → Prompt Visual → Gerador de Imagem → Avaliador → Revisor → Publicador. 8 skills em pipeline.",
    category: "blog",
    task_type: "squad:blog-content",
    default_frequency: "every_12h",
    default_config: {
      language: "pt-BR",
      auto_publish: false,
      generate_cover: true,
    },
    is_squad: true,
    execution_steps: ["Estrategista", "Redator", "SEO", "Prompt visual", "Imagem", "Avaliação", "Revisão", "Publicação"],
    icon: "FileText",
  },
  {
    slug: "site-health-check",
    name: "Health Check do Site",
    description: "Monitora a saúde do site e API. Verifica se estão online, mede tempo de resposta.",
    category: "system",
    task_type: "system:health-check",
    default_frequency: "hourly",
    default_config: {
      urls: ["https://app.leadcapture.online", "https://app.leadcapture.online/api/health"],
      timeout_ms: 10000,
      alert_on_error: true,
    },
    icon: "Activity",
  },
];

/* ───────────────────────── Service ───────────────────────── */

export class BrandAutomationsService {
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  /* Schema: catalogo, estado por brand, runs. Idempotente. */
  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;

    this.schemaPromise = (async () => {
      /* automation_catalog — catalogo GLOBAL de templates */
      await query(`
        CREATE TABLE IF NOT EXISTS automation_catalog (
          slug VARCHAR(80) PRIMARY KEY,
          name VARCHAR(140) NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(24) NOT NULL,
          task_type VARCHAR(80) NOT NULL,
          default_frequency VARCHAR(24) NOT NULL,
          default_cron VARCHAR(80) NULL,
          default_config JSONB NOT NULL DEFAULT '{}',
          is_squad BOOLEAN NOT NULL DEFAULT FALSE,
          execution_steps JSONB NULL,
          icon VARCHAR(40) NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      /* brand_automations — estado POR BRAND. Unique (brand_id, catalog_slug). */
      await query(`
        CREATE TABLE IF NOT EXISTS brand_automations (
          id VARCHAR(36) PRIMARY KEY,
          brand_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          catalog_slug VARCHAR(80) NOT NULL REFERENCES automation_catalog(slug) ON DELETE CASCADE,
          status VARCHAR(16) NOT NULL DEFAULT 'paused',
          frequency VARCHAR(24) NOT NULL,
          cron_expression VARCHAR(80) NULL,
          config JSONB NOT NULL DEFAULT '{}',
          next_run_at TIMESTAMPTZ NULL,
          last_run_at TIMESTAMPTZ NULL,
          last_run_status VARCHAR(24) NULL,
          last_run_duration_ms INTEGER NULL,
          last_error TEXT NULL,
          run_count INTEGER NOT NULL DEFAULT 0,
          success_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT brand_automations_unique UNIQUE (brand_id, catalog_slug)
        )
      `);

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_automations_brand ON brand_automations (brand_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_automations_next_run ON brand_automations (next_run_at) WHERE status = 'active'`);
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_automations_user ON brand_automations (user_id)`);
      } catch { /* ignore */ }

      /* brand_automation_runs — log de execucoes */
      await query(`
        CREATE TABLE IF NOT EXISTS brand_automation_runs (
          id VARCHAR(36) PRIMARY KEY,
          brand_automation_id VARCHAR(36) NOT NULL REFERENCES brand_automations(id) ON DELETE CASCADE,
          status VARCHAR(16) NOT NULL DEFAULT 'running',
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ NULL,
          duration_ms INTEGER NULL,
          result JSONB NULL,
          error_message TEXT NULL,
          triggered_by VARCHAR(16) NOT NULL DEFAULT 'cron'
        )
      `);
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_automation_runs_auto ON brand_automation_runs (brand_automation_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_brand_automation_runs_started ON brand_automation_runs (started_at DESC)`);
      } catch { /* ignore */ }

      /* Seed do catalogo (upsert idempotente) */
      await this.seedCatalog();

      this.schemaReady = true;
      logger.info(`Brand Automations schema OK (${CATALOG.length} templates no catálogo)`);
    })().finally(() => { this.schemaPromise = null; });

    return this.schemaPromise;
  }

  /* Insere/atualiza os 14 templates. Roda toda inicializacao - se template ja existe,
     atualiza description/config/frequency (mas nao tira do ar - is_active intacto). */
  private async seedCatalog(): Promise<void> {
    for (let i = 0; i < CATALOG.length; i++) {
      const tpl = CATALOG[i];
      try {
        await query(
          `INSERT INTO automation_catalog
             (slug, name, description, category, task_type, default_frequency, default_cron,
              default_config, is_squad, execution_steps, icon, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             task_type = EXCLUDED.task_type,
             default_frequency = EXCLUDED.default_frequency,
             default_cron = EXCLUDED.default_cron,
             default_config = EXCLUDED.default_config,
             is_squad = EXCLUDED.is_squad,
             execution_steps = EXCLUDED.execution_steps,
             icon = EXCLUDED.icon,
             sort_order = EXCLUDED.sort_order,
             updated_at = NOW()`,
          [
            tpl.slug,
            tpl.name,
            tpl.description,
            tpl.category,
            tpl.task_type,
            tpl.default_frequency,
            tpl.default_cron || null,
            JSON.stringify(tpl.default_config),
            !!tpl.is_squad,
            tpl.execution_steps ? JSON.stringify(tpl.execution_steps) : null,
            tpl.icon || null,
            i + 1,
          ],
        );
      } catch (e: any) {
        logger.warn(`brandAutomations: falha ao seedar template ${tpl.slug} (${e.message})`);
      }
    }
  }

  /* ──────────── Catalog (lista global de templates) ──────────── */

  async listCatalog(): Promise<CatalogTemplate[]> {
    await this.ensureSchema();
    const rows = (await query<any[]>(
      `SELECT * FROM automation_catalog WHERE is_active = TRUE ORDER BY sort_order ASC`,
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category as AutomationCategory,
      task_type: r.task_type,
      default_frequency: r.default_frequency as AutomationFrequency,
      default_cron: r.default_cron || undefined,
      default_config: this.parseJson(r.default_config),
      is_squad: !!r.is_squad,
      execution_steps: this.parseJsonArray(r.execution_steps),
      icon: r.icon || undefined,
    }));
  }

  /* ──────────── Brand state (listagem + toggle + config) ──────────── */

  /* Retorna TODOS os templates do catalogo com o estado do brand mergeado (se existir)
     — se um catalog_slug nao tem brand_automation, retorna como "nao configurado" (status='paused' implicito).
     UI mostra todos como cards e o user toggla cada um. */
  async listForBrand(userId: string, brandId: string): Promise<Array<CatalogTemplate & {
    state: BrandAutomation | null;
  }>> {
    await this.ensureSchema();
    const catalog = await this.listCatalog();
    const stateRows = (await query<any[]>(
      `SELECT * FROM brand_automations WHERE brand_id = ? AND user_id = ?`,
      [brandId, userId],
    )) as any;
    const stateBySlug = new Map<string, any>();
    for (const r of Array.isArray(stateRows) ? stateRows : []) {
      stateBySlug.set(r.catalog_slug, r);
    }
    return catalog.map((tpl) => ({
      ...tpl,
      state: stateBySlug.has(tpl.slug) ? this.toBrandAutomation(stateBySlug.get(tpl.slug)) : null,
    }));
  }

  /* Toggle (cria se nao existir, alterna active/paused). Retorna o estado novo. */
  /* Ativa um template (cria se nao existir). Idempotente — nao pausa se ja ativo. */
  async activateSlug(
    userId: string,
    brandId: string,
    catalogSlug: string,
    configPatch?: Record<string, any>,
  ): Promise<BrandAutomation> {
    await this.ensureSchema();
    const tpl = (await this.listCatalog()).find((t) => t.slug === catalogSlug);
    if (!tpl) throw new Error(`Template '${catalogSlug}' nao existe no catalogo`);

    const existing = await queryOne<any>(
      `SELECT * FROM brand_automations WHERE brand_id = ? AND user_id = ? AND catalog_slug = ? LIMIT 1`,
      [brandId, userId, catalogSlug],
    );

    const mergedConfig = { ...tpl.default_config, ...(configPatch || {}) };
    const isWebhook = mergedConfig.trigger_type === "webhook";
    const nextRunAt = isWebhook ? null : this.calculateNextRun(tpl.default_cron || null, tpl.default_frequency);

    if (existing) {
      if (existing.status !== "active") {
        await update(
          `UPDATE brand_automations
           SET status = 'active', config = ?, next_run_at = ?, last_error = NULL, updated_at = NOW()
           WHERE id = ?`,
          [JSON.stringify(mergedConfig), nextRunAt, existing.id],
        );
      } else if (configPatch) {
        await update(
          `UPDATE brand_automations SET config = ?, updated_at = NOW() WHERE id = ?`,
          [JSON.stringify(mergedConfig), existing.id],
        );
      }
      const refreshed = await queryOne<any>(`SELECT * FROM brand_automations WHERE id = ? LIMIT 1`, [existing.id]);
      return this.toBrandAutomation(refreshed);
    }

    const id = uuidv4();
    await insert(
      `INSERT INTO brand_automations
         (id, brand_id, user_id, catalog_slug, status, frequency, cron_expression, config, next_run_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        id,
        brandId,
        userId,
        catalogSlug,
        tpl.default_frequency,
        tpl.default_cron || null,
        JSON.stringify(mergedConfig),
        nextRunAt,
      ],
    );
    const created = await queryOne<any>(`SELECT * FROM brand_automations WHERE id = ? LIMIT 1`, [id]);
    return this.toBrandAutomation(created);
  }

  async toggle(userId: string, brandId: string, catalogSlug: string): Promise<BrandAutomation> {
    await this.ensureSchema();
    const tpl = (await this.listCatalog()).find((t) => t.slug === catalogSlug);
    if (!tpl) throw new Error(`Template '${catalogSlug}' nao existe no catalogo`);

    const existing = await queryOne<any>(
      `SELECT * FROM brand_automations WHERE brand_id = ? AND user_id = ? AND catalog_slug = ? LIMIT 1`,
      [brandId, userId, catalogSlug],
    );

    if (existing) {
      const newStatus: AutomationStatus = existing.status === "active" ? "paused" : "active";
      const nextRunAt = newStatus === "active" ? this.calculateNextRun(tpl.default_cron || null, tpl.default_frequency) : null;
      await update(
        `UPDATE brand_automations SET status = ?, next_run_at = ?, last_error = NULL, updated_at = NOW()
         WHERE id = ?`,
        [newStatus, nextRunAt, existing.id],
      );
      const refreshed = await queryOne<any>(`SELECT * FROM brand_automations WHERE id = ? LIMIT 1`, [existing.id]);
      return this.toBrandAutomation(refreshed);
    }

    /* Cria com config default do template, ja ativada */
    const id = uuidv4();
    const nextRunAt = this.calculateNextRun(tpl.default_cron || null, tpl.default_frequency);
    await insert(
      `INSERT INTO brand_automations
         (id, brand_id, user_id, catalog_slug, status, frequency, cron_expression, config, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        brandId,
        userId,
        catalogSlug,
        "active",
        tpl.default_frequency,
        tpl.default_cron || null,
        JSON.stringify(tpl.default_config),
        nextRunAt,
      ],
    );
    const created = await queryOne<any>(`SELECT * FROM brand_automations WHERE id = ? LIMIT 1`, [id]);
    return this.toBrandAutomation(created);
  }

  async updateConfig(
    userId: string,
    brandId: string,
    automationId: string,
    patch: { config?: Record<string, any>; frequency?: AutomationFrequency; cron_expression?: string | null },
  ): Promise<BrandAutomation | null> {
    await this.ensureSchema();
    const fields: string[] = [];
    const values: any[] = [];
    if (patch.config !== undefined) {
      fields.push("config = ?");
      values.push(JSON.stringify(patch.config));
    }
    if (patch.frequency !== undefined) {
      fields.push("frequency = ?");
      values.push(patch.frequency);
    }
    if (patch.cron_expression !== undefined) {
      fields.push("cron_expression = ?");
      values.push(patch.cron_expression);
    }
    if (fields.length === 0) {
      return this.findById(userId, brandId, automationId);
    }
    fields.push("updated_at = NOW()");
    await update(
      `UPDATE brand_automations SET ${fields.join(", ")} WHERE id = ? AND brand_id = ? AND user_id = ?`,
      [...values, automationId, brandId, userId],
    );
    return this.findById(userId, brandId, automationId);
  }

  async findById(userId: string, brandId: string, automationId: string): Promise<BrandAutomation | null> {
    await this.ensureSchema();
    const r = await queryOne<any>(
      `SELECT * FROM brand_automations WHERE id = ? AND brand_id = ? AND user_id = ? LIMIT 1`,
      [automationId, brandId, userId],
    );
    return r ? this.toBrandAutomation(r) : null;
  }

  async listRuns(userId: string, brandId: string, automationId: string, limit = 20): Promise<AutomationRunRecord[]> {
    await this.ensureSchema();
    const auto = await this.findById(userId, brandId, automationId);
    if (!auto) return [];
    const rows = (await query<any[]>(
      `SELECT * FROM brand_automation_runs WHERE brand_automation_id = ?
       ORDER BY started_at DESC LIMIT ?`,
      [automationId, Math.max(1, Math.min(100, limit))],
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      brand_automation_id: r.brand_automation_id,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      duration_ms: r.duration_ms,
      result: this.parseJson(r.result),
      error_message: r.error_message,
    }));
  }

  /* ──────────── Execução manual + scheduling ──────────── */

  /* Cria o registro de run, retorna o id. Executor preenche depois via finishRun. */
  async startRun(automationId: string, triggeredBy: "cron" | "manual" | "webhook"): Promise<string> {
    await this.ensureSchema();
    const id = uuidv4();
    await insert(
      `INSERT INTO brand_automation_runs (id, brand_automation_id, status, triggered_by) VALUES (?, ?, 'running', ?)`,
      [id, automationId, triggeredBy],
    );
    return id;
  }

  async finishRun(
    runId: string,
    automationId: string,
    status: "success" | "error",
    durationMs: number,
    result?: Record<string, any>,
    errorMessage?: string,
  ): Promise<void> {
    await update(
      `UPDATE brand_automation_runs SET status = ?, completed_at = NOW(), duration_ms = ?, result = ?, error_message = ?
       WHERE id = ?`,
      [status, durationMs, result ? JSON.stringify(result) : null, errorMessage || null, runId],
    );
    /* Atualiza counters + next_run no brand_automation */
    const auto = await queryOne<any>(`SELECT * FROM brand_automations WHERE id = ? LIMIT 1`, [automationId]);
    if (!auto) return;
    const nextRunAt = auto.status === "active"
      ? this.calculateNextRun(auto.cron_expression, auto.frequency)
      : null;
    await update(
      `UPDATE brand_automations
         SET last_run_at = NOW(), last_run_status = ?, last_run_duration_ms = ?, last_error = ?,
             run_count = run_count + 1,
             success_count = success_count + ?,
             error_count = error_count + ?,
             next_run_at = ?,
             updated_at = NOW()
       WHERE id = ?`,
      [
        status,
        durationMs,
        status === "error" ? (errorMessage || "Erro") : null,
        status === "success" ? 1 : 0,
        status === "error" ? 1 : 0,
        nextRunAt,
        automationId,
      ],
    );
  }

  /* Busca brand_automations active com next_run_at no passado, ate `batchSize`.
     Usado pelo scheduler tick (1x por minuto). */
  async getDueAutomations(batchSize = 20): Promise<Array<BrandAutomation & { task_type: string; catalog_name: string }>> {
    await this.ensureSchema();
    const rows = (await query<any[]>(
      `SELECT ba.*, ac.task_type, ac.name AS catalog_name
       FROM brand_automations ba
       INNER JOIN automation_catalog ac ON ac.slug = ba.catalog_slug
       WHERE ba.status = 'active'
         AND (ba.config->>'trigger_type' IS NULL OR ba.config->>'trigger_type' != 'webhook')
         AND (ba.next_run_at IS NULL OR ba.next_run_at <= NOW())
       ORDER BY ba.next_run_at ASC NULLS FIRST
       LIMIT ?`,
      [batchSize],
    )) as any;
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      ...this.toBrandAutomation(r),
      task_type: r.task_type,
      catalog_name: r.catalog_name,
    }));
  }

  /* ──────────── Helpers ──────────── */

  private toBrandAutomation(row: any): BrandAutomation {
    return {
      id: row.id,
      brand_id: row.brand_id,
      user_id: row.user_id,
      catalog_slug: row.catalog_slug,
      status: row.status,
      frequency: row.frequency,
      cron_expression: row.cron_expression,
      config: this.parseJson(row.config),
      next_run_at: row.next_run_at,
      last_run_at: row.last_run_at,
      last_run_status: row.last_run_status,
      last_run_duration_ms: row.last_run_duration_ms,
      last_error: row.last_error,
      run_count: Number(row.run_count || 0),
      success_count: Number(row.success_count || 0),
      error_count: Number(row.error_count || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private parseJson(value: any): Record<string, any> {
    if (!value) return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(String(value)); } catch { return {}; }
  }

  private parseJsonArray(value: any): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /* Calcula proxima execucao baseado em frequency (intervalo) OU cron (horario fixo).
     Implementacao simples - pra cron, usa parser proprio basico (minute hour dayOfMonth month dayOfWeek). */
  calculateNextRun(cron: string | null, frequency: AutomationFrequency): Date {
    const now = new Date();
    if (cron && cron.trim()) {
      return this.nextFromCron(cron.trim(), now);
    }
    return this.nextFromFrequency(frequency, now);
  }

  private nextFromFrequency(freq: AutomationFrequency, from: Date): Date {
    const ms: Record<AutomationFrequency, number> = {
      every_5min: 5 * 60_000,
      every_15min: 15 * 60_000,
      every_30min: 30 * 60_000,
      hourly: 60 * 60_000,
      every_2h: 2 * 60 * 60_000,
      every_6h: 6 * 60 * 60_000,
      every_12h: 12 * 60 * 60_000,
      daily: 24 * 60 * 60_000,
      weekly: 7 * 24 * 60 * 60_000,
      monthly: 30 * 24 * 60 * 60_000,
    };
    return new Date(from.getTime() + (ms[freq] || ms.daily));
  }

  /* Parser cron simplificado — suporta:
       minuto: numero, *, *\/N, lista (1,3,5)
       hora:   numero, *, *\/N, lista, range (1-5)
       dia_mes: numero ou *
       mes: numero ou *
       dia_sem: numero, *, lista, range
     Pra cron complexo (e.g. L, W, #) cai pra frequency. */
  private nextFromCron(cron: string, from: Date): Date {
    const parts = cron.split(/\s+/);
    if (parts.length !== 5) {
      logger.warn(`brandAutomations: cron inválido '${cron}', fallback pra daily`);
      return this.nextFromFrequency("daily", from);
    }
    const [minSpec, hourSpec, domSpec, monSpec, dowSpec] = parts;

    /* Itera minuto a minuto até achar o próximo match. Cap de 7 dias pra evitar loop infinito. */
    const candidate = new Date(from.getTime());
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);
    const maxIterations = 60 * 24 * 7;

    for (let i = 0; i < maxIterations; i++) {
      const minute = candidate.getMinutes();
      const hour = candidate.getHours();
      const dom = candidate.getDate();
      const month = candidate.getMonth() + 1;
      const dow = candidate.getDay();

      if (
        this.cronFieldMatches(minSpec, minute, 0, 59) &&
        this.cronFieldMatches(hourSpec, hour, 0, 23) &&
        this.cronFieldMatches(domSpec, dom, 1, 31) &&
        this.cronFieldMatches(monSpec, month, 1, 12) &&
        this.cronFieldMatches(dowSpec, dow, 0, 6)
      ) {
        return candidate;
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }
    /* Não achou match em 7 dias — provavel cron impossível */
    logger.warn(`brandAutomations: cron '${cron}' nao matcheia em 7 dias, fallback daily`);
    return this.nextFromFrequency("daily", from);
  }

  private cronFieldMatches(spec: string, value: number, min: number, max: number): boolean {
    if (spec === "*") return true;
    /* Step "*\/N" */
    const stepMatch = spec.match(/^\*\/(\d+)$/);
    if (stepMatch) return value % Number(stepMatch[1]) === 0;
    /* Range "A-B" possivelmente com step "A-B/N" — sem step por enquanto */
    if (spec.includes("-")) {
      const [a, b] = spec.split("-").map((s) => Number(s));
      if (Number.isFinite(a) && Number.isFinite(b)) return value >= a && value <= b;
    }
    /* Lista "A,B,C" — cada item pode ser numero ou range */
    if (spec.includes(",")) {
      const items = spec.split(",");
      for (const it of items) {
        if (it.includes("-")) {
          const [a, b] = it.split("-").map((s) => Number(s));
          if (Number.isFinite(a) && Number.isFinite(b) && value >= a && value <= b) return true;
        } else {
          if (Number(it) === value) return true;
        }
      }
      return false;
    }
    /* Numero simples */
    const num = Number(spec);
    if (Number.isFinite(num) && num >= min && num <= max) return num === value;
    return false;
  }
}

export const brandAutomationsService = new BrandAutomationsService();

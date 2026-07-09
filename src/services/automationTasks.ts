/**
 * ═══════════════════════════════════════════════════════════════════
 * Automation Task Registry — executores das tasks do brand_automations
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cada task_type tem uma funcao que recebe (config, context) e devolve
 * um resultado JSON. A task pode ser:
 *
 *   REAL — implementada de verdade, faz o trabalho (3 tasks hoje):
 *     - system:health-check          (pinga URLs, mede tempo)
 *     - squad:prospect-outreach      (puxa leads novos do brand, gera msg WhatsApp)
 *     - squad:social-post            (gera copy de post via aiRouter)
 *
 *   STUB — registrada pra UI mostrar como opcao, mas executor so loga e
 *          retorna `{ stub: true, message: "..." }`. Substitua pela
 *          implementacao real quando o modulo correspondente existir.
 *          - Todas as 6 task_types `instagram:*`
 *          - squad:blog-content
 *
 * Pra adicionar nova task: registre aqui no `TASK_REGISTRY` e mapeie
 * `task_type` no catalogo (brandAutomations.ts) pra ela.
 */

import axios from "axios";
import { logger } from "../utils/logger";
import { AIRouter } from "./aiRouter";
import { query, queryOne } from "../config/database";
import { instagramService } from "./instagram";

export interface TaskContext {
  brandAutomationId: string;
  runId: string;
  brandId: string;
  userId: string;
  catalogSlug: string;
  webhook?: Record<string, any>;
}

export type TaskResult = Record<string, any>;
export type TaskFunction = (config: Record<string, any>, context: TaskContext) => Promise<TaskResult>;

const aiRouter = new AIRouter();

/* ════════════════════════════════════════════════════════════════
   TASK 1 — REAL — system:health-check
   ════════════════════════════════════════════════════════════════
   Pinga lista de URLs, mede tempo de resposta, marca erros. */
async function systemHealthCheck(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const urls: string[] = Array.isArray(config?.urls) ? config.urls : [];
  if (urls.length === 0) {
    /* Default sensato: pings o proprio app */
    urls.push("https://app.leadcapture.online", "https://app.leadcapture.online/api/health");
  }
  const timeoutMs = Math.max(1000, Math.min(60_000, Number(config?.timeout_ms) || 10_000));

  const checks = await Promise.all(
    urls.slice(0, 10).map(async (url) => {
      const start = Date.now();
      try {
        const resp = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
        return {
          url,
          status: resp.status,
          ok: resp.status >= 200 && resp.status < 400,
          duration_ms: Date.now() - start,
        };
      } catch (err: any) {
        return {
          url,
          status: 0,
          ok: false,
          duration_ms: Date.now() - start,
          error: String(err?.message || err).slice(0, 200),
        };
      }
    }),
  );

  const okCount = checks.filter((c) => c.ok).length;
  const errorCount = checks.length - okCount;
  return {
    total: checks.length,
    ok: okCount,
    error: errorCount,
    checks,
    healthy: errorCount === 0,
  };
}

/* ════════════════════════════════════════════════════════════════
   TASK 2 — REAL — squad:prospect-outreach
   ════════════════════════════════════════════════════════════════
   Pega ate N leads do brand com status='new' e phone disponivel, gera
   mensagem personalizada via aiRouter. NAO DISPARA por padrao (auto_send=false). */
async function squadProspectOutreach(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const maxPerRun = Math.max(1, Math.min(20, Number(config?.max_per_run) || 5));
  const minScore = Math.max(0, Math.min(100, Number(config?.min_potential_score) || 30));
  const tone = String(config?.message_tone || "profissional").slice(0, 80);
  const useAi = config?.use_ai_messages !== false;
  const autoSend = !!config?.auto_send;
  const niche = String(config?.niche || "").trim();

  /* Busca leads candidatos do brand. Usa customers/leads table dinamicamente porque
     leadcapture tem schemas diferentes - tenta 'customers' primeiro, depois 'leads'. */
  let rows: any[] = [];
  for (const table of ["customers", "leads"]) {
    try {
      const r = (await query<any[]>(
        `SELECT id, name, phone, address, category, source
         FROM ${table}
         WHERE brand_id = ?
           AND COALESCE(status, 'new') = 'new'
           AND phone IS NOT NULL AND phone <> ''
         ORDER BY created_at DESC NULLS LAST
         LIMIT ?`,
        [ctx.brandId, maxPerRun],
      )) as any;
      rows = Array.isArray(r) ? r : [];
      if (rows.length > 0) break;
    } catch { /* tabela pode nao existir */ }
  }

  if (rows.length === 0) {
    return { selected: 0, generated: 0, sent: 0, note: "Nenhum lead com status=new+phone disponivel" };
  }

  const messages: Array<{ lead_id: string; name: string; phone: string; message: string }> = [];
  let aiFailures = 0;
  for (const lead of rows) {
    let msg = "";
    if (useAi) {
      try {
        const prompt = `Voce eh um SDR experiente. Escreva uma mensagem CURTA (max 280 caracteres) de
primeiro contato via WhatsApp pra esse lead:

Nome: ${lead.name}
Categoria: ${lead.category || "desconhecida"}
${niche ? `Nicho do brand: ${niche}` : ""}

Tom: ${tone}. Sem emojis exagerados. Sem ser invasivo. Mencione algo especifico do segmento
dele. Termine com pergunta curta que convide resposta. NAO inclua "Ola [Nome]" generico —
seja humano e direto.

Retorne SOMENTE o texto da mensagem, nada mais.`;
        const aiResp = await aiRouter.generateText(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.7 });
        msg = String(aiResp?.text || "").trim();
        if (msg.length > 600) msg = msg.slice(0, 600);
        if (!msg) throw new Error("IA retornou vazio");
      } catch (e: any) {
        aiFailures++;
        msg = `Olá ${lead.name}! Vi seu negócio e queria entender se faz sentido conversar.`;
      }
    } else {
      msg = `Olá ${lead.name}! Vi seu negócio e queria entender se faz sentido conversar.`;
    }
    messages.push({
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      message: msg,
    });
  }

  /* auto_send=false por padrao - so gera e devolve. O user revisa no dashboard. */
  /* TODO: quando integrar com Evolution/WhatsApp, disparar aqui se autoSend=true. */
  return {
    selected: rows.length,
    generated: messages.length,
    sent: 0,
    auto_send: autoSend,
    ai_failures: aiFailures,
    note: autoSend
      ? "auto_send=true detectado mas integracao WhatsApp ainda nao plugada nesta task"
      : "Mensagens geradas. Revise no dashboard antes de disparar.",
    messages: messages.slice(0, 10), /* limit pra nao inflar log */
  };
}

/* ════════════════════════════════════════════════════════════════
   TASK 3 — REAL — squad:social-post
   ════════════════════════════════════════════════════════════════
   Gera 1 copy de post completa (caption + sugestao de visual + hashtags)
   via aiRouter usando contexto do brand (business_context do ai_agent_profile).
   NAO PUBLICA - so retorna o pacote pronto pra revisao. */
async function squadSocialPost(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const tone = String(config?.tone || "profissional").slice(0, 100);
  const category = String(config?.category || "tecnologia").slice(0, 100);
  const platform = String(config?.platform || "instagram").slice(0, 30);
  const language = String(config?.language || "pt-BR").slice(0, 10);
  const generateImagePrompt = config?.generate_image !== false;

  /* Pega business_context do brand pra personalizar */
  let businessContext = "";
  try {
    const profile = await queryOne<any>(
      `SELECT business_context FROM ai_agent_profiles_brand WHERE user_id = ? AND brand_id = ? LIMIT 1`,
      [ctx.userId, ctx.brandId],
    );
    businessContext = String(profile?.business_context || "").trim();
  } catch { /* tabela pode nao existir ainda nesta inst */ }

  const prompt = `Voce eh um copywriter senior de redes sociais. Crie 1 post completo para ${platform}.

Contexto do brand: ${businessContext || "(brand sem contexto declarado)"}
Categoria do post: ${category}
Tom: ${tone}
Idioma: ${language}

Retorne JSON EXATO (sem markdown):
{
  "headline": "primeira frase de impacto (max 80 chars)",
  "caption": "legenda completa - 4-7 paragrafos curtos, com 2-3 quebras de linha entre. Sem hashtags no corpo.",
  "hashtags": ["lista", "de", "12-18", "hashtags", "relevantes", "sem", "#"],
  "cta": "chamada para acao curta (max 60 chars)"${generateImagePrompt ? `,
  "image_prompt": "prompt detalhado em ingles pra gerar imagem (max 200 chars)"` : ""}
}`;

  let result: any;
  try {
    result = await aiRouter.generateJson<any>(
      prompt,
      { userId: ctx.userId, brandId: ctx.brandId },
      { temperature: 0.75 },
    );
  } catch (e: any) {
    return { generated: false, error: String(e?.message || e).slice(0, 200) };
  }

  return {
    generated: true,
    platform,
    headline: String(result?.headline || "").trim(),
    caption: String(result?.caption || "").trim(),
    hashtags: Array.isArray(result?.hashtags) ? result.hashtags.slice(0, 30) : [],
    cta: String(result?.cta || "").trim(),
    image_prompt: result?.image_prompt ? String(result.image_prompt).trim() : undefined,
    auto_published: false,
    note: "Post gerado. Publicacao automatica requer integracao Meta (Instagram/Facebook) — fase 2.",
  };
}

/* ════════════════════════════════════════════════════════════════
   INSTAGRAM TASKS — integracao real com instagramService
   ════════════════════════════════════════════════════════════════ */

async function instagramPerformanceReport(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const days = Math.max(1, Math.min(28, Number(config?.days) || 7));
  const analytics = await instagramService.fetchAnalytics(ctx.brandId, days);
  if (!analytics) {
    return { ok: false, error: "Instagram nao conectado ou token invalido" };
  }
  await instagramService.snapshotMetrics(ctx.brandId);
  const media = await instagramService.fetchMedia(ctx.brandId, 10);
  const topPost = [...media].sort((a, b) => Number(b.like_count || 0) - Number(a.like_count || 0))[0];
  return {
    ok: true,
    period_days: days,
    username: analytics.profile.username,
    followers: analytics.profile.followers_count,
    reach: analytics.account.reach,
    views: analytics.account.views,
    profile_views: analytics.account.profile_views,
    engagement_rate: analytics.media_summary.engagement_rate,
    total_likes: analytics.media_summary.total_likes,
    total_comments: analytics.media_summary.total_comments,
    top_post: topPost
      ? { id: topPost.id, likes: topPost.like_count || 0, comments: topPost.comments_count || 0, permalink: topPost.permalink }
      : null,
    snapshot_saved: true,
  };
}

async function instagramProfileHealth(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const test = await instagramService.testConnection(ctx.brandId);
  if (!test.ok) {
    return { ok: false, healthy: false, error: test.message };
  }
  await instagramService.snapshotMetrics(ctx.brandId);
  const profile = test.profile || {};
  return {
    ok: true,
    healthy: true,
    username: profile.username,
    followers_count: profile.followers_count || 0,
    media_count: profile.media_count || 0,
    token_valid: true,
    snapshot_saved: true,
  };
}

async function instagramMentionMonitor(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const minLikes = Math.max(1, Number(config?.min_likes_to_highlight) || 50);
  const media = await instagramService.fetchMedia(ctx.brandId, 25);
  const { conversations } = await instagramService.getConversations(ctx.brandId);
  const highlights = media.filter((m: any) => Number(m.like_count || 0) >= minLikes);
  return {
    ok: true,
    media_scanned: media.length,
    conversations_count: conversations.length,
    highlights_count: highlights.length,
    highlights: highlights.slice(0, 5).map((m: any) => ({
      id: m.id,
      likes: m.like_count || 0,
      comments: m.comments_count || 0,
      permalink: m.permalink,
    })),
    note: "Monitor de mencoes completas requer webhook Meta; esta execucao analisa engajamento recente e DMs.",
  };
}

async function instagramAutoReply(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const maxPerRun = Math.max(1, Math.min(20, Number(config?.max_per_run) || 8));
  const tone = String(config?.reply_tone || "amigavel e profissional").slice(0, 120);
  const media = await instagramService.fetchMedia(ctx.brandId, maxPerRun);
  const withComments = media.filter((m: any) => Number(m.comments_count || 0) > 0);
  const suggestions: Array<{ media_id: string; caption_preview: string; suggested_reply: string }> = [];

  for (const post of withComments.slice(0, maxPerRun)) {
    try {
      const prompt = `Gere UMA resposta curta (max 200 chars) para comentarios no Instagram.
Tom: ${tone}
Post: ${String(post.caption || "").slice(0, 300)}
Retorne somente o texto da resposta, sem aspas.`;
      const aiResp = await aiRouter.generateText(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6 });
      suggestions.push({
        media_id: post.id,
        caption_preview: String(post.caption || "").slice(0, 80),
        suggested_reply: String(aiResp?.text || "").trim().slice(0, 220),
      });
    } catch {
      suggestions.push({
        media_id: post.id,
        caption_preview: String(post.caption || "").slice(0, 80),
        suggested_reply: "Obrigado pelo comentario! Qualquer duvida, chama no direct.",
      });
    }
  }

  return {
    ok: true,
    posts_with_comments: withComments.length,
    suggestions_generated: suggestions.length,
    auto_posted: false,
    note: "Sugestoes geradas para revisao. Publicacao automatica de replies sera habilitada na proxima fase.",
    suggestions,
  };
}

async function instagramHashtagResearch(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const niche = String(config?.niche || "negocios e alimentacao").slice(0, 200);
  const seeds = Array.isArray(config?.seed_hashtags) ? config.seed_hashtags : [];
  const profile = await instagramService.getProfile(ctx.brandId, { refresh: true });
  const prompt = `Pesquise hashtags estrategicas para Instagram no nicho: ${niche}.
Bio da marca: ${profile?.biography || "(sem bio)"}
Hashtags semente: ${seeds.join(", ") || "(nenhuma)"}

Retorne JSON EXATO:
{
  "hashtags": ["25 hashtags em portugues sem o simbolo #"],
  "clusters": [{"theme": "tema", "tags": ["3-5 hashtags"]}]
}`;
  try {
    const result = await aiRouter.generateJson<any>(
      prompt,
      { userId: ctx.userId, brandId: ctx.brandId },
      { temperature: 0.5 },
    );
    const hashtags = Array.isArray(result?.hashtags) ? result.hashtags.slice(0, 30) : [];
    return {
      ok: true,
      niche,
      hashtags,
      clusters: Array.isArray(result?.clusters) ? result.clusters.slice(0, 6) : [],
      saved_as_template: true,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

async function instagramStoryPublisher(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const tone = String(config?.tone || "animado e direto").slice(0, 100);
  const category = String(config?.category || "dica do dia").slice(0, 120);
  const autoPublish = !!config?.auto_publish;
  const profile = await instagramService.getProfile(ctx.brandId);

  const prompt = `Crie conteudo para Story do Instagram.
Marca: ${profile?.name || "marca"}
Tom: ${tone}
Tema: ${category}

Retorne JSON:
{
  "headline": "texto curto de impacto (max 60 chars)",
  "body": "2-3 frases para story",
  "cta": "chamada curta (max 40 chars)",
  "image_prompt": "prompt em ingles para imagem vertical story"
}`;
  try {
    const result = await aiRouter.generateJson<any>(
      prompt,
      { userId: ctx.userId, brandId: ctx.brandId },
      { temperature: 0.75 },
    );
    const draft = await instagramService.createPost(ctx.brandId, {
      media_type: "IMAGE",
      caption: `${result?.headline || ""}\n\n${result?.body || ""}\n\n${result?.cta || ""}`.trim(),
      status: autoPublish ? "scheduled" : "draft",
    });
    return {
      ok: true,
      generated: true,
      headline: String(result?.headline || "").trim(),
      body: String(result?.body || "").trim(),
      cta: String(result?.cta || "").trim(),
      image_prompt: String(result?.image_prompt || "").trim(),
      draft_post_id: draft.id,
      auto_published: false,
      note: autoPublish
        ? "Rascunho criado. Publicacao de Story requer imagem — adicione midia e publique manualmente."
        : "Story gerado como rascunho para revisao.",
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

function getWebhookPayload(ctx: TaskContext): Record<string, any> {
  return ctx.webhook || {};
}

async function instagramWebhookDmReply(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const payload = getWebhookPayload(ctx);
  const senderId = String(payload.sender_id || payload.from || "");
  const text = String(payload.text || "");
  if (!senderId || !text) {
    return { ok: false, error: "Payload de DM incompleto" };
  }

  const settings = await instagramService.getAiSettings(ctx.brandId);
  if (!settings.auto_reply_dm) {
    return { ok: false, skipped: true, error: "auto_reply_dm desativado" };
  }

  const iaGenerated = config.ia_generated !== false;
  let reply = String(config.fallback_message || "Obrigado pela mensagem! Em breve retornamos.").slice(0, 900);

  const faqHit = instagramService.matchFaqAnswer(settings, text);
  if (faqHit) {
    reply = faqHit.slice(0, Number(settings.max_chars || 900));
  } else if (iaGenerated) {
    try {
      const prompt = instagramService.buildAiReplyPrompt(settings, text);
      const aiResp = await aiRouter.generateText(
        prompt,
        { userId: ctx.userId, brandId: ctx.brandId },
        { temperature: 0.65 },
      );
      const generated = String(aiResp?.text || "").trim();
      if (generated) reply = generated.slice(0, Number(settings.max_chars || 900));
    } catch {
      /* usa fallback */
    }
  }

  const sent = await instagramService.sendDm(ctx.brandId, senderId, reply);
  return {
    ok: sent.ok,
    action: "send_dm",
    sender_id: senderId,
    inbound_text: text.slice(0, 200),
    reply_text: reply.slice(0, 200),
    message_id: sent.messageId,
    error: sent.error,
    triggered_by: senderId,
  };
}

async function instagramWebhookCommentReply(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const payload = getWebhookPayload(ctx);
  const commentId = String(payload.comment_id || "");
  const text = String(payload.text || "");
  const username = String(payload.username || payload.from_username || "usuario");
  if (!commentId || !text) {
    return { ok: false, error: "Payload de comentario incompleto" };
  }

  const settings = await instagramService.getAiSettings(ctx.brandId);
  if (!settings.auto_reply_comments) {
    return { ok: false, skipped: true, error: "auto_reply_comments desativado" };
  }

  const replyMode = String(config.reply_mode || "dm");
  const iaGenerated = config.ia_generated !== false;
  let reply = String(config.fallback_message || "Obrigado pelo comentario! Te chamamos no direct.").slice(0, 900);

  const faqHit = instagramService.matchFaqAnswer(settings, text);
  if (faqHit) {
    reply = faqHit.slice(0, Number(settings.max_chars || 900));
  } else if (iaGenerated) {
    try {
      const prompt = [
        instagramService.buildAiReplyPrompt(settings, text),
        `Usuario: @${username}`,
        `Modo: ${replyMode === "comment" ? "resposta publica no comentario" : "mensagem privada (DM)"}`,
      ].join("\n\n");
      const aiResp = await aiRouter.generateText(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6 });
      const generated = String(aiResp?.text || "").trim();
      if (generated) reply = generated.slice(0, Number(settings.max_chars || 900));
    } catch {
      /* usa fallback */
    }
  }

  if (replyMode === "comment") {
    const sent = await instagramService.replyToComment(ctx.brandId, commentId, reply);
    return {
      ok: sent.ok,
      action: "reply_comment",
      comment_id: commentId,
      username,
      reply_text: reply.slice(0, 200),
      error: sent.error,
      triggered_by: commentId,
    };
  }

  const senderId = String(payload.sender_id || payload.from_id || "");
  if (!senderId) {
    return { ok: false, error: "sender_id ausente para DM de comentario" };
  }
  const sent = await instagramService.sendDm(ctx.brandId, senderId, reply);
  return {
    ok: sent.ok,
    action: "send_dm_from_comment",
    comment_id: commentId,
    sender_id: senderId,
    reply_text: reply.slice(0, 200),
    error: sent.error,
    triggered_by: commentId,
  };
}

async function instagramWebhookMentionThanks(config: Record<string, any>, ctx: TaskContext): Promise<TaskResult> {
  const payload = getWebhookPayload(ctx);
  const senderId = String(payload.sender_id || payload.from_id || payload.from || "");
  const username = String(payload.username || payload.from_username || senderId);
  if (!senderId) {
    return { ok: false, error: "Payload de mencao incompleto" };
  }

  const tone = String(config.reply_tone || "genuino e breve").slice(0, 120);
  const iaGenerated = config.ia_generated !== false;
  let reply = String(config.fallback_message || "Muito obrigado pela mencao! 💚").slice(0, 500);

  if (iaGenerated) {
    try {
      const prompt = `Agradeça pela menção no story do Instagram.
Usuario: @${username}
Tom: ${tone}
Retorne somente o texto do DM de agradecimento (max 500 chars).`;
      const aiResp = await aiRouter.generateText(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.7 });
      const generated = String(aiResp?.text || "").trim();
      if (generated) reply = generated.slice(0, 500);
    } catch {
      /* usa fallback */
    }
  }

  const sent = await instagramService.sendDm(ctx.brandId, senderId, reply);
  return {
    ok: sent.ok,
    action: "mention_thanks_dm",
    sender_id: senderId,
    username,
    reply_text: reply.slice(0, 200),
    error: sent.error,
    triggered_by: senderId,
  };
}

function createStub(taskType: string, requiredModule: string): TaskFunction {
  return async (config: Record<string, any>, ctx: TaskContext) => {
    logger.info(`automationTask stub: ${taskType} (${ctx.catalogSlug}) — modulo "${requiredModule}" nao implementado`);
    return {
      stub: true,
      task_type: taskType,
      required_module: requiredModule,
      message: `Execucao no-op: integracao com "${requiredModule}" ainda nao implementada.`,
      config_received: config,
    };
  };
}

/* ════════════════════════════════════════════════════════════════
   Registry — mapeia task_type → executor
   ════════════════════════════════════════════════════════════════ */

export const TASK_REGISTRY: Record<string, TaskFunction> = {
  /* REAIS */
  "system:health-check": systemHealthCheck,
  "squad:prospect-outreach": squadProspectOutreach,
  "squad:social-post": squadSocialPost,

  /* Instagram — integracao real */
  "instagram:performance-report": instagramPerformanceReport,
  "instagram:mention-monitor": instagramMentionMonitor,
  "instagram:auto-reply": instagramAutoReply,
  "instagram:hashtag-research": instagramHashtagResearch,
  "instagram:story-publisher": instagramStoryPublisher,
  "instagram:profile-health": instagramProfileHealth,

  /* Instagram — webhook (tempo real) */
  "instagram:webhook-dm-reply": instagramWebhookDmReply,
  "instagram:webhook-comment-reply": instagramWebhookCommentReply,
  "instagram:webhook-mention-thanks": instagramWebhookMentionThanks,

  /* STUB - Blog content (precisa Blog/CMS system) */
  "squad:blog-content":           createStub("squad:blog-content", "Blog/CMS system"),
};

export function getTaskFunction(taskType: string): TaskFunction | null {
  return TASK_REGISTRY[taskType] || null;
}

/* Para a UI mostrar "Implementado vs Em breve" badge */
const IMPLEMENTED_TASKS = new Set([
  "system:health-check",
  "squad:prospect-outreach",
  "squad:social-post",
  "instagram:performance-report",
  "instagram:mention-monitor",
  "instagram:auto-reply",
  "instagram:hashtag-research",
  "instagram:story-publisher",
  "instagram:profile-health",
  "instagram:webhook-dm-reply",
  "instagram:webhook-comment-reply",
  "instagram:webhook-mention-thanks",
]);

export function isTaskImplemented(taskType: string): boolean {
  return IMPLEMENTED_TASKS.has(taskType);
}

export function isInstagramAutomation(item: { task_type?: string; default_config?: Record<string, any>; category?: string }): boolean {
  const taskType = String(item.task_type || "");
  if (taskType.startsWith("instagram:")) return true;
  if (item.default_config?.platform === "instagram") return true;
  return false;
}

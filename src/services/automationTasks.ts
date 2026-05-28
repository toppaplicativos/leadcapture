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

export interface TaskContext {
  brandAutomationId: string;
  runId: string;
  brandId: string;
  userId: string;
  catalogSlug: string;
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
   STUBS — 11 tasks registradas mas nao implementadas
   ════════════════════════════════════════════════════════════════
   Cada stub loga aviso e retorna placeholder. UI vai mostrar warning
   amber "Em breve" pra essas. Substitua pela implementacao real quando
   o modulo correspondente (Instagram/Blog/etc) for construido. */
function createStub(taskType: string, requiredModule: string): TaskFunction {
  return async (config: Record<string, any>, ctx: TaskContext) => {
    logger.info(`automationTask stub: ${taskType} (${ctx.catalogSlug}) — modulo "${requiredModule}" nao implementado`);
    return {
      stub: true,
      task_type: taskType,
      required_module: requiredModule,
      message: `Execucao no-op: integracao com "${requiredModule}" ainda nao implementada. Esta automacao foi pre-cadastrada para servir de TEMPLATE - ative-a quando o modulo estiver pronto.`,
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

  /* STUBS - Instagram (6) - precisam de Meta integration */
  "instagram:performance-report": createStub("instagram:performance-report", "Meta Instagram Graph API"),
  "instagram:mention-monitor":    createStub("instagram:mention-monitor", "Meta Instagram Graph API"),
  "instagram:auto-reply":         createStub("instagram:auto-reply", "Meta Instagram Graph API"),
  "instagram:hashtag-research":   createStub("instagram:hashtag-research", "Meta Instagram Graph API"),
  "instagram:story-publisher":    createStub("instagram:story-publisher", "Meta Instagram Graph API"),
  "instagram:profile-health":     createStub("instagram:profile-health", "Meta Instagram Graph API"),

  /* STUB - Blog content (precisa Blog/CMS system) */
  "squad:blog-content":           createStub("squad:blog-content", "Blog/CMS system"),
};

export function getTaskFunction(taskType: string): TaskFunction | null {
  return TASK_REGISTRY[taskType] || null;
}

/* Para a UI mostrar "Implementado vs Em breve" badge */
export function isTaskImplemented(taskType: string): boolean {
  return ["system:health-check", "squad:prospect-outreach", "squad:social-post"].includes(taskType);
}

/**
 * ═══════════════════════════════════════════════════════════════════
 * Skill Trainer Squad — orquestrador de 7 skills que CRIA uma brand_skill
 * a partir de materiais diversos (texto, imagens, tabelas).
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pipeline:
 *   1. intakeMaterials        — extrai texto de imagens (Gemini Vision), tabelas (xlsx)
 *   2. understandIntent       — decide tipo de skill (info|calculator|lookup|flow|policy)
 *   3. extractStructuredData  — produz data_payload estruturado (tabelas → JSON)
 *   4. defineTriggers         — intents/keywords/examples que ativam a skill
 *   5. composeInstructions    — prompt-engineered de instrucoes pro agente
 *   6. validateSkill          — IA simula 3 conversas e atribui confidence_score
 *   7. persist                — salva brand_skill + materials no banco
 *
 * Cada skill emite SSE event pro frontend mostrar pipeline visual.
 *
 * Reusa padrao do aiCampaignSquad (mutex por brand, soft-fail, timeouts).
 */

import { AIRouter } from "./aiRouter";
import { brandSkillsService, type SkillType, type BrandSkill } from "./brandSkills";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { integrationService } from "./integrations";
import { logger } from "../utils/logger";
import * as XLSX from "xlsx";
import * as fs from "fs/promises";
import * as path from "path";

const aiRouter = new AIRouter();

/* ───────────────────────── Tipos ───────────────────────── */

export type SkillSquadStep =
  | "intakeMaterials"
  | "understandIntent"
  | "extractStructuredData"
  | "defineTriggers"
  | "composeInstructions"
  | "validateSkill"
  | "persist";

export type SkillSquadStatus = "pending" | "running" | "done" | "error";

export interface SkillSquadEvent {
  step: number;
  name: SkillSquadStep | "final" | "error";
  status: SkillSquadStatus | "info";
  output?: any;
  message?: string;
  durationMs?: number;
}

export type SkillEmitFn = (event: SkillSquadEvent) => void;

/* Material que o user subiu (frontend ja converte arquivo binario p/ base64 ou caminho) */
export interface SkillMaterialInput {
  kind: "text" | "image" | "table";
  /** Pra kind=text: o conteudo. Pra kind=image: caminho do arquivo salvo. Pra kind=table: caminho do CSV/XLSX. */
  content?: string;
  filePath?: string;
  mimeType?: string;
  originalFilename?: string;
}

export interface SkillSquadContext {
  brandId: string;
  userId: string;
  /** Descricao livre do user — "ensine o agente a simular consorcio" */
  promptText: string;
  /** Materiais anexados — text+image+table */
  materials: SkillMaterialInput[];
}

/* Resultado interno de cada step */
interface IntakeResult {
  text_blocks: Array<{ source: string; text: string }>;
  table_data: Array<{ source: string; rows: any[]; headers: string[] }>;
  images_summary: Array<{ source: string; description: string; extracted_text: string }>;
  combined_text: string;
}

interface IntentResult {
  skill_type: SkillType;
  name: string;          // nome curto e claro
  description: string;   // 1-2 frases
  reasoning: string;     // por que esse tipo (debug)
}

interface StructuredDataResult {
  data_payload: any;     // estruturado (table, list of items, regras)
  schema_notes: string;  // 1 frase descrevendo o schema do payload
}

interface TriggersResult {
  trigger_intents: string[];
  trigger_keywords: string[];
  trigger_examples: string[];
}

interface InstructionsResult {
  instructions: string;
  examples: Array<{ q: string; a: string }>;
}

interface ValidationResult {
  confidence_score: number;
  simulations: Array<{ scenario: string; agent_response: string; score: number; notes: string }>;
  warnings: string[];
}

/* ───────────────── Mutex global por brand ───────────────── */
const inFlight = new Set<string>();
export function isBrandSkillTrainerRunning(brandId: string): boolean {
  return inFlight.has(brandId);
}

/* ───────────────── Helpers ───────────────── */

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout após ${ms}ms`)), ms),
    ),
  ]);
}

/* Resolve chave Gemini ativa (qualquer integration) — usado pra Vision multimodal */
async function getGeminiKey(scope: { userId: string; brandId: string }): Promise<{ key: string; model: string }> {
  /* Tenta resolver via integrationService normal primeiro */
  try {
    const resolved = await integrationService.getProvider("gemini", scope);
    if (resolved?.key) {
      return {
        key: resolved.key,
        model: String(resolved.config?.model || "gemini-2.5-flash"),
      };
    }
  } catch { /* fallback */ }
  /* Fallback: pega qualquer global */
  const any = await integrationService.findAnyActiveProvider(["gemini"]).catch(() => null);
  if (!any?.key) throw new Error("Nenhuma chave Gemini ativa configurada");
  return { key: any.key, model: String(any.config?.model || "gemini-2.5-flash") };
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 — intakeMaterials
   ════════════════════════════════════════════════════════════════
   - text: usa direto
   - image: Gemini Vision multimodal extrai texto/descricao
   - table: xlsx/csv lib parseia em rows + headers
*/
async function stepIntake(ctx: SkillSquadContext): Promise<IntakeResult> {
  const text_blocks: IntakeResult["text_blocks"] = [];
  const table_data: IntakeResult["table_data"] = [];
  const images_summary: IntakeResult["images_summary"] = [];

  /* O texto principal sempre vai como bloco 'user-prompt' */
  if (ctx.promptText && ctx.promptText.trim()) {
    text_blocks.push({ source: "prompt do usuario", text: ctx.promptText.trim() });
  }

  /* Vai precisar de chave Gemini pra Vision; resolve UMA vez */
  let geminiClient: { genAI: GoogleGenerativeAI; model: string } | null = null;
  const ensureGemini = async () => {
    if (geminiClient) return geminiClient;
    const { key, model } = await getGeminiKey({ userId: ctx.userId, brandId: ctx.brandId });
    geminiClient = { genAI: new GoogleGenerativeAI(key), model };
    return geminiClient;
  };

  for (const mat of ctx.materials) {
    try {
      if (mat.kind === "text" && mat.content) {
        text_blocks.push({ source: "anexo de texto", text: mat.content.trim() });
        continue;
      }

      if (mat.kind === "image" && mat.filePath) {
        /* Le bytes da imagem, manda pro Gemini Vision pra extrair texto+contexto */
        const buf = await fs.readFile(mat.filePath);
        const base64 = buf.toString("base64");
        const mime = mat.mimeType || "image/png";

        const { genAI, model: modelName } = await ensureGemini();
        const model = genAI.getGenerativeModel({ model: modelName });
        const visionPrompt = `Voce esta extraindo informacao de uma imagem que sera usada
para treinar um agente de WhatsApp comercial. Analise a imagem e retorne:

1. TEXT EXTRAIDO: todo texto visivel (OCR). Se for print de conversa,
   inclua quem falou (Cliente, Atendente).
2. DESCRICAO: 1 paragrafo descrevendo o que voce ve E como esse conteudo
   pode ser usado pra treinar o agente (contexto comercial).

Responda em JSON puro (sem markdown):
{ "extracted_text": "...", "description": "..." }`;

        const result = await withTimeout(
          model.generateContent([
            visionPrompt,
            { inlineData: { mimeType: mime, data: base64 } },
          ]),
          30_000,
          "vision-extract",
        );
        const text = String(result.response.text() || "").trim();
        let parsed: any = { extracted_text: text, description: "" };
        /* Tenta parsear JSON limpo, se falhar usa texto inteiro como extracted */
        try {
          const cleaned = text.replace(/^```json|```$/gi, "").trim();
          parsed = JSON.parse(cleaned);
        } catch { /* fallback ja setado */ }

        images_summary.push({
          source: mat.originalFilename || "imagem",
          description: String(parsed.description || "").trim(),
          extracted_text: String(parsed.extracted_text || "").trim(),
        });
        continue;
      }

      if (mat.kind === "table" && mat.filePath) {
        /* Le CSV ou XLSX e converte em rows + headers */
        const wb = XLSX.readFile(mat.filePath);
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
        const headers = rows.length > 0 ? Object.keys(rows[0] as any) : [];
        /* Limita a 200 rows pra nao explodir prompt */
        table_data.push({
          source: mat.originalFilename || "tabela",
          rows: rows.slice(0, 200),
          headers,
        });
        continue;
      }
    } catch (err: any) {
      logger.warn(`stepIntake: falha em ${mat.kind} (${err.message})`);
      /* Continua com os outros materiais */
    }
  }

  /* Texto consolidado que vai pras skills seguintes */
  const parts: string[] = [];
  for (const b of text_blocks) parts.push(`[${b.source}]\n${b.text}`);
  for (const img of images_summary) {
    parts.push(`[imagem: ${img.source}]\nDescricao: ${img.description}\nTexto extraido: ${img.extracted_text}`);
  }
  for (const tbl of table_data) {
    const sample = tbl.rows.slice(0, 5).map((r) => JSON.stringify(r)).join("\n");
    parts.push(`[tabela: ${tbl.source}]\nColunas: ${tbl.headers.join(", ")}\nAmostra (primeiras 5 linhas):\n${sample}\nTotal de linhas: ${tbl.rows.length}`);
  }
  const combined_text = parts.join("\n\n---\n\n").slice(0, 12_000); /* cap em 12k chars */

  return { text_blocks, table_data, images_summary, combined_text };
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — understandIntent
   ════════════════════════════════════════════════════════════════
   IA decide tipo da skill (info|calculator|lookup|flow|policy) + nome/descricao */
async function stepIntent(intake: IntakeResult, ctx: SkillSquadContext): Promise<IntentResult> {
  const prompt = `Voce eh um arquiteto de skills de IA conversacional. O usuario subiu materiais
para treinar uma habilidade no agente WhatsApp do brand dele. Sua tarefa: classificar
o tipo de skill e dar nome+descricao claros.

MATERIAL CONSOLIDADO:
"""
${intake.combined_text || "(sem materiais)"}
"""

TIPOS DE SKILL POSSIVEIS:
- info: skill puramente informativa (responde duvida, explica conceito)
- calculator: faz calculo/simulacao (ex: simular financiamento, calcular frete)
- lookup: consulta dados estruturados (ex: catalogo, tabela de precos, FAQ)
- flow: controla conversa multi-turn (ex: coleta dados de cadastro)
- policy: regra estrita (ex: politica de cancelamento, garantia, devolucao)

Retorne JSON EXATO:
{
  "skill_type": "info|calculator|lookup|flow|policy",
  "name": "nome curto da skill (max 60 chars) ex: 'Simular consorcio', 'FAQ produtos', 'Politica de garantia'",
  "description": "1-2 frases descrevendo o que essa skill ensina o agente a fazer",
  "reasoning": "1 frase: por que voce escolheu esse tipo"
}

REGRAS:
- name eh CURTO e CLARO (terceiros entendem em 2 segundos)
- description eh acionavel (foco no que o agente FAZ, nao no que ele eh)
- Se ha tabela com numeros/precos → provavel 'lookup' ou 'calculator'
- Se ha script de conversa → provavel 'flow'
- Se ha regra de negocio → 'policy'`;

  const result = await withTimeout(
    aiRouter.generateJson<IntentResult>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.5 }),
    20_000, "understandIntent",
  );

  const validTypes = ["info", "calculator", "lookup", "flow", "policy"];
  const type = validTypes.includes(String(result?.skill_type).toLowerCase())
    ? (String(result.skill_type).toLowerCase() as SkillType)
    : "info";

  return {
    skill_type: type,
    name: String(result?.name || "Nova habilidade").trim().slice(0, 100),
    description: String(result?.description || "").trim().slice(0, 600),
    reasoning: String(result?.reasoning || "").trim().slice(0, 300),
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — extractStructuredData
   ════════════════════════════════════════════════════════════════
   Se tem tabela → usa tabela bruta. Se nao tem, IA extrai dados do texto. */
async function stepExtractData(intake: IntakeResult, intent: IntentResult, ctx: SkillSquadContext): Promise<StructuredDataResult> {
  /* Se ja tem tabela parseada, usa direto (mais confiavel que IA) */
  if (intake.table_data.length > 0) {
    const tables = intake.table_data.map((t) => ({
      source: t.source,
      headers: t.headers,
      rows: t.rows,
    }));
    return {
      data_payload: { tables },
      schema_notes: `${intake.table_data.length} tabela(s) parseada(s): ${intake.table_data.map((t) => `${t.source} (${t.rows.length} linhas)`).join(", ")}`,
    };
  }

  /* Sem tabela — IA tenta extrair estrutura do texto. Pra skill_type=info,
     pode nao precisar de payload (so instrucoes). */
  if (intent.skill_type === "info" || intent.skill_type === "policy") {
    return {
      data_payload: null,
      schema_notes: "Skill puramente textual — nao requer dados estruturados.",
    };
  }

  const prompt = `Extraia dados ESTRUTURADOS do material abaixo. Esta skill eh tipo "${intent.skill_type}".

MATERIAL:
"""
${intake.combined_text.slice(0, 5000)}
"""

Retorne JSON com os dados estruturados que o agente vai usar pra executar a skill.
Formato livre — voce decide o schema mais util. Exemplos:

- Se for calculator: { "formulas": [...], "variables": [...] }
- Se for lookup: { "items": [{name, ...}, ...] }
- Se for flow: { "steps": [{ask, validate, ...}] }

Retorne JSON EXATO:
{
  "data_payload": { ... (estrutura adequada) ... },
  "schema_notes": "1 frase descrevendo o schema escolhido"
}

REGRAS:
- Se o material nao tem dados estruturaveis, retorne data_payload: null
- Use chaves em ingles snake_case
- Mantenha enxuto — so o que o agente precisa pra executar`;

  let result: StructuredDataResult;
  try {
    result = await withTimeout(
      aiRouter.generateJson<StructuredDataResult>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.4 }),
      20_000, "extractStructuredData",
    );
  } catch (e: any) {
    /* Soft fail — skill sem payload, so com instrucoes */
    logger.warn(`stepExtractData soft-fail: ${e.message}`);
    return { data_payload: null, schema_notes: `Falha na extracao: ${e.message}` };
  }

  return {
    data_payload: result?.data_payload || null,
    schema_notes: String(result?.schema_notes || "").trim(),
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — defineTriggers
   ════════════════════════════════════════════════════════════════
   intents/keywords/examples que devem ativar a skill */
async function stepTriggers(intake: IntakeResult, intent: IntentResult, ctx: SkillSquadContext): Promise<TriggersResult> {
  const prompt = `Defina os GATILHOS que devem ativar essa skill na conversa do agente WhatsApp.

NOME DA SKILL: ${intent.name}
DESCRICAO: ${intent.description}
TIPO: ${intent.skill_type}

CONTEXTO DO MATERIAL:
${intake.combined_text.slice(0, 3000)}

Retorne JSON EXATO:
{
  "trigger_intents": ["intencoes do cliente — max 5: ex: ask_price, request_quote, ask_about_product"],
  "trigger_keywords": ["palavras-chave que o cliente pode dizer — max 10, curtas, em pt-BR"],
  "trigger_examples": ["3-5 frases REAIS que um cliente diria pra ativar essa skill"]
}

REGRAS:
- keywords em pt-BR, sem acento (matching robusto)
- examples sao mensagens TIPICAS (curtas, naturais, como cliente real escreve)
- intents em ingles snake_case`;

  const result = await withTimeout(
    aiRouter.generateJson<TriggersResult>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6 }),
    15_000, "defineTriggers",
  );

  return {
    trigger_intents: Array.isArray(result?.trigger_intents) ? result.trigger_intents.slice(0, 6).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
    trigger_keywords: Array.isArray(result?.trigger_keywords) ? result.trigger_keywords.slice(0, 12).map((s: any) => String(s || "").toLowerCase().trim()).filter(Boolean) : [],
    trigger_examples: Array.isArray(result?.trigger_examples) ? result.trigger_examples.slice(0, 6).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 5 — composeInstructions
   ════════════════════════════════════════════════════════════════
   Prompt-engineered de instrucoes pro agente seguir + 3-5 exemplos de Q&A */
async function stepCompose(intake: IntakeResult, intent: IntentResult, data: StructuredDataResult, triggers: TriggersResult, ctx: SkillSquadContext): Promise<InstructionsResult> {
  const dataHint = data.data_payload
    ? `Dados estruturados disponiveis (data_payload):\n${JSON.stringify(data.data_payload).slice(0, 1500)}`
    : "Skill sem dados estruturados — apenas instrucoes textuais.";

  const prompt = `Escreva as INSTRUCOES que o agente WhatsApp seguira sempre que essa skill disparar.
Tambem gere 3-4 exemplos de Q&A pra calibrar o tom.

NOME DA SKILL: ${intent.name}
TIPO: ${intent.skill_type}
DESCRICAO: ${intent.description}

GATILHOS:
- Intencoes: ${triggers.trigger_intents.join(", ") || "(nenhuma)"}
- Keywords: ${triggers.trigger_keywords.join(", ") || "(nenhuma)"}

${dataHint}

CONTEXTO ORIGINAL (do material do usuario):
"""
${intake.combined_text.slice(0, 4000)}
"""

Retorne JSON EXATO:
{
  "instructions": "TEXTO em 3-6 paragrafos curtos. Diga ao agente: (1) o que essa skill faz, (2) quando usar, (3) como executar (passos), (4) o que NAO fazer, (5) tom esperado",
  "examples": [
    { "q": "pergunta tipica do cliente", "a": "resposta ideal do agente" },
    { "q": "...", "a": "..." }
  ]
}

REGRAS CRITICAS:
- instructions eh CONSUMIDA por outro LLM como contexto. Seja DIRETO, sem floreios.
- Tom consultivo, profissional, humanizado (nao roboto).
- NUNCA invente dados — se nao houver dado pra responder, agente DEVE dizer que vai verificar.
- Se ha data_payload, instrua o agente a USAR esses dados literalmente.
- Maximo 1800 chars no instructions, max 4 examples.`;

  const result = await withTimeout(
    aiRouter.generateJson<InstructionsResult>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6 }),
    25_000, "composeInstructions",
  );

  return {
    instructions: String(result?.instructions || "").trim().slice(0, 2000),
    examples: Array.isArray(result?.examples)
      ? result.examples.slice(0, 5).map((e: any) => ({
          q: String(e?.q || "").trim().slice(0, 200),
          a: String(e?.a || "").trim().slice(0, 600),
        })).filter((e: any) => e.q && e.a)
      : [],
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 6 — validateSkill
   ════════════════════════════════════════════════════════════════
   IA simula 3 cenarios E avalia se a skill geraria boa resposta */
async function stepValidate(intent: IntentResult, instructions: InstructionsResult, triggers: TriggersResult, ctx: SkillSquadContext): Promise<ValidationResult> {
  const prompt = `Voce eh QA de skills de IA. Simule 3 cenarios de uso dessa skill e avalie a qualidade.

SKILL: ${intent.name}
TIPO: ${intent.skill_type}
INSTRUCOES PRO AGENTE:
"""
${instructions.instructions}
"""

CENARIOS A SIMULAR (use os exemplos abaixo):
${triggers.trigger_examples.slice(0, 3).map((ex, i) => `${i + 1}. "${ex}"`).join("\n") || "1. Pergunta tipica do segmento\n2. Pergunta ambigua\n3. Pergunta fora do escopo"}

Para CADA cenario, simule a resposta do agente e avalie de 0-100.

Retorne JSON EXATO:
{
  "confidence_score": 0-100 (qualidade geral da skill - quanto mais cenarios funcionam bem, maior),
  "simulations": [
    { "scenario": "pergunta", "agent_response": "resposta simulada", "score": 0-100, "notes": "o que funcionou ou nao" }
  ],
  "warnings": ["lista de problemas identificados, ex: 'instrucoes ambiguas', 'falta exemplo de fallback'"]
}

REGRAS:
- score < 60 = warning
- 3 simulacoes obrigatorias
- Seja CRITICO, nao infle scores`;

  let result: ValidationResult;
  try {
    result = await withTimeout(
      aiRouter.generateJson<ValidationResult>(prompt, { userId: ctx.userId, brandId: ctx.brandId }, { temperature: 0.6 }),
      20_000, "validateSkill",
    );
  } catch (e: any) {
    /* Validacao falhou — assume confidence default media e segue */
    logger.warn(`stepValidate soft-fail: ${e.message}`);
    return {
      confidence_score: 55,
      simulations: [],
      warnings: [`Validacao automatica falhou: ${e.message}`],
    };
  }

  return {
    confidence_score: Math.max(0, Math.min(100, Math.round(Number(result?.confidence_score) || 50))),
    simulations: Array.isArray(result?.simulations)
      ? result.simulations.slice(0, 5).map((s: any) => ({
          scenario: String(s?.scenario || "").trim().slice(0, 200),
          agent_response: String(s?.agent_response || "").trim().slice(0, 600),
          score: Math.max(0, Math.min(100, Math.round(Number(s?.score) || 0))),
          notes: String(s?.notes || "").trim().slice(0, 300),
        }))
      : [],
    warnings: Array.isArray(result?.warnings) ? result.warnings.slice(0, 5).map((s: any) => String(s || "").trim()).filter(Boolean) : [],
  };
}

/* ════════════════════════════════════════════════════════════════
   STEP 7 — persist
   ════════════════════════════════════════════════════════════════
   Salva brand_skill + materials. */
async function stepPersist(
  ctx: SkillSquadContext,
  intent: IntentResult,
  data: StructuredDataResult,
  triggers: TriggersResult,
  instructions: InstructionsResult,
  validation: ValidationResult,
  intake: IntakeResult,
): Promise<BrandSkill> {
  const skill = await brandSkillsService.create(ctx.userId, ctx.brandId, {
    name: intent.name,
    description: intent.description,
    skill_type: intent.skill_type,
    trigger_intents: triggers.trigger_intents,
    trigger_keywords: triggers.trigger_keywords,
    trigger_examples: triggers.trigger_examples,
    instructions: instructions.instructions,
    data_payload: data.data_payload,
    examples: instructions.examples,
    confidence_score: validation.confidence_score,
    is_active: true,
    source_summary: `${ctx.materials.length} materiais (${ctx.materials.map((m) => m.kind).join(", ") || "texto"})`,
  });

  /* Persist materials anexados */
  for (let i = 0; i < ctx.materials.length; i++) {
    const m = ctx.materials[i];
    try {
      const stat = m.filePath ? await fs.stat(m.filePath).catch(() => null) : null;
      let extractedData: any = null;
      if (m.kind === "image") {
        const img = intake.images_summary[i] || intake.images_summary.find((im) => im.source === (m.originalFilename || "imagem"));
        if (img) extractedData = { description: img.description, extracted_text: img.extracted_text };
      } else if (m.kind === "table") {
        const tbl = intake.table_data.find((t) => t.source === (m.originalFilename || "tabela"));
        if (tbl) extractedData = { headers: tbl.headers, row_count: tbl.rows.length };
      }
      await brandSkillsService.attachMaterial(skill.id, {
        brand_skill_id: skill.id,
        kind: m.kind,
        content_text: m.kind === "text" ? (m.content || null) : null,
        file_path: m.filePath || null,
        mime_type: m.mimeType || null,
        original_filename: m.originalFilename || null,
        extracted_data: extractedData,
        size_bytes: stat ? Number(stat.size) : null,
      });
    } catch (e: any) {
      logger.warn(`persist material ${m.kind} failed: ${e.message}`);
    }
  }

  return skill;
}

/* ═══════════════════════════════════════════════════════════════════
   ORQUESTRADOR — executa 7 steps com emit() entre cada
   ═══════════════════════════════════════════════════════════════════ */

export async function executeSkillTrainerSquad(ctx: SkillSquadContext, emit: SkillEmitFn): Promise<{ skill_id: string } | null> {
  if (inFlight.has(ctx.brandId)) {
    emit({ step: 0, name: "error", status: "error", message: "Outro treinamento de skill ja esta rodando para esse brand." });
    return null;
  }
  inFlight.add(ctx.brandId);

  try {
    /* STEP 1 */
    emit({ step: 1, name: "intakeMaterials", status: "running" });
    let t = Date.now();
    const intake = await stepIntake(ctx);

    /* Guard: sem nenhum conteúdo extraído → erro informativo antes de gastar tokens */
    if (!intake.combined_text.trim()) {
      emit({
        step: 1, name: "intakeMaterials", status: "error",
        message: "Nenhum conteúdo foi extraído dos materiais enviados. Descreva a habilidade no campo de texto ou anexe um arquivo.",
        durationMs: Date.now() - t,
      });
      emit({
        step: 0, name: "error", status: "error",
        message: "Nenhum conteúdo para treinar. Adicione um texto descrevendo a habilidade ou anexe uma imagem/tabela.",
      });
      return null;
    }

    emit({
      step: 1, name: "intakeMaterials", status: "done",
      output: {
        text_blocks_count: intake.text_blocks.length,
        images_count: intake.images_summary.length,
        tables_count: intake.table_data.length,
        sample: intake.combined_text.slice(0, 300),
      },
      durationMs: Date.now() - t,
    });

    /* STEP 2 */
    emit({ step: 2, name: "understandIntent", status: "running" });
    t = Date.now();
    const intent = await stepIntent(intake, ctx);
    emit({ step: 2, name: "understandIntent", status: "done", output: intent, durationMs: Date.now() - t });

    /* STEP 3 */
    emit({ step: 3, name: "extractStructuredData", status: "running" });
    t = Date.now();
    const data = await stepExtractData(intake, intent, ctx);
    emit({
      step: 3, name: "extractStructuredData", status: "done",
      output: {
        schema_notes: data.schema_notes,
        payload_keys: data.data_payload && typeof data.data_payload === "object" ? Object.keys(data.data_payload as any).slice(0, 10) : [],
        has_payload: !!data.data_payload,
      },
      durationMs: Date.now() - t,
    });

    /* STEP 4 */
    emit({ step: 4, name: "defineTriggers", status: "running" });
    t = Date.now();
    const triggers = await stepTriggers(intake, intent, ctx);
    emit({ step: 4, name: "defineTriggers", status: "done", output: triggers, durationMs: Date.now() - t });

    /* STEP 5 */
    emit({ step: 5, name: "composeInstructions", status: "running" });
    t = Date.now();
    const instructions = await stepCompose(intake, intent, data, triggers, ctx);
    emit({
      step: 5, name: "composeInstructions", status: "done",
      output: {
        instructions_preview: instructions.instructions.slice(0, 400),
        instructions_length: instructions.instructions.length,
        examples_count: instructions.examples.length,
      },
      durationMs: Date.now() - t,
    });

    /* STEP 6 */
    emit({ step: 6, name: "validateSkill", status: "running" });
    t = Date.now();
    const validation = await stepValidate(intent, instructions, triggers, ctx);
    emit({ step: 6, name: "validateSkill", status: "done", output: validation, durationMs: Date.now() - t });

    /* STEP 7 */
    emit({ step: 7, name: "persist", status: "running" });
    t = Date.now();
    const skill = await stepPersist(ctx, intent, data, triggers, instructions, validation, intake);
    emit({
      step: 7, name: "persist", status: "done",
      output: { skill_id: skill.id, name: skill.name, slug: skill.slug, confidence: skill.confidence_score },
      durationMs: Date.now() - t,
    });

    /* FINAL */
    emit({
      step: 8, name: "final", status: "info",
      output: {
        skill_id: skill.id,
        name: skill.name,
        skill_type: skill.skill_type,
        confidence_score: skill.confidence_score,
        triggers_summary: `${triggers.trigger_keywords.length} keywords, ${triggers.trigger_intents.length} intents, ${triggers.trigger_examples.length} exemplos`,
        instructions_preview: instructions.instructions.slice(0, 300),
        warnings: validation.warnings,
      },
    });

    return { skill_id: skill.id };
  } catch (err: any) {
    const msg = String(err?.message || err);
    logger.error(`skillTrainerSquad error (brand=${ctx.brandId}): ${msg}`);
    emit({ step: 0, name: "error", status: "error", message: msg });
    return null;
  } finally {
    inFlight.delete(ctx.brandId);
  }
}

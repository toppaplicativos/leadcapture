/**
 * Extractor — usa IA (Gemini Vision para imagem, AIRouter.generateJson para texto)
 * para transformar conteúdo bruto em array de leads estruturados.
 *
 * Estratégia única do prompt: o modelo decide quais campos existem, normaliza
 * format e retorna estrutura previsível. Backend normaliza fone/email/nome
 * em etapa posterior — esse extractor só faz semântica.
 */

import { aiRouter } from "../aiRouter";
import { GeminiService } from "../gemini";
import { logger } from "../../utils/logger";
import { wrapProviderError } from "../../utils/safeError";

const geminiService = new GeminiService();

export interface ExtractedLeadRaw {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  interest?: string | null;
  notes?: string | null;
  temperature?: "frio" | "morno" | "quente" | null;
}

const EXTRACTION_PROMPT = `Voce e um extrator de leads B2B/B2C para CRM brasileiro.

Receba conteudo (texto, lista, planilha, conversa de WhatsApp, cartao de visita, flyer) e extraia TODOS os possiveis contatos.

REGRAS:
1. Cada lead = uma pessoa ou empresa com pelo menos um identificador (nome, telefone ou email).
2. Se o conteudo tem multiplas linhas com nome+telefone, cada linha vira UM lead.
3. NAO invente dados. Se um campo nao aparece no conteudo, deixe null.
4. Mantenha o nome no formato original do texto (sem corrigir para Title Case — backend cuida).
5. Telefone: preserve o que vier (com ou sem DDD/+55). Backend normaliza.
6. Interesse: pegue da conversa/contexto ("quer X", "interessado em Y", "buscando Z").
7. Temperatura:
   - "quente" = sinais de compra explicita ("quero", "vamos fechar", "qual o preco")
   - "morno" = interesse expresso sem urgencia ("estou pensando", "considerando")
   - "frio" = apenas contato sem sinal de intencao
   - null = sem sinal suficiente
8. Observacoes: qualquer outro detalhe util (ex: "ja conversou com vendedor", "indicacao do Joao").
9. Empresa: separe do nome se aparecer ("Maria Silva / Padaria Pao Quente" → name="Maria Silva", company="Padaria Pao Quente").
10. Cidade/Estado: se aparecer textualmente.

RETORNE JSON estritamente valido neste schema (SEM comentarios, SEM markdown):

{
  "leads": [
    {
      "name": "string ou null",
      "phone": "string ou null",
      "email": "string ou null",
      "company": "string ou null",
      "city": "string ou null",
      "state": "string ou null (UF 2 letras)",
      "interest": "string ou null",
      "notes": "string ou null",
      "temperature": "frio | morno | quente | null"
    }
  ]
}

Se nao identificar NENHUM lead, retorne {"leads":[]}.`;

interface ExtractionResponse {
  leads: ExtractedLeadRaw[];
}

/** Extrai leads de texto bruto (já vindo do user ou de CSV/XLS convertido). */
export async function extractLeadsFromText(
  text: string,
  scope: { userId: string; brandId: string }
): Promise<ExtractedLeadRaw[]> {
  const content = String(text || "").trim();
  if (!content) return [];

  const fullPrompt = `${EXTRACTION_PROMPT}\n\nCONTEUDO:\n${content}`;

  try {
    const response = await aiRouter.generateJson<ExtractionResponse>(
      fullPrompt,
      { userId: scope.userId, brandId: scope.brandId },
      { temperature: 0.2, functionKey: "text.import.extract" },
    );
    return Array.isArray(response?.leads) ? response.leads : [];
  } catch (err: any) {
    logger.warn(`[smartLeadImport] aiRouter falhou: ${err?.message}. Tentando Gemini direto.`);
  }

  /* Fallback: Gemini direto — mesmo padrão do followupRuler */
  try {
    const response = await geminiService.generateJson<ExtractionResponse>(fullPrompt, {
      userId: scope.userId,
      brandId: scope.brandId,
      temperature: 0.2,
    });
    return Array.isArray(response?.leads) ? response.leads : [];
  } catch (err: any) {
    /* IMPORTANT (Bug-6): the provider error message often contains our full
     * request body — including the EXTRACTION_PROMPT and the user content.
     * We log it intact (server-only) but wrap with a safe error before
     * letting it propagate to the HTTP layer. */
    logger.error({ err, prompt_len: fullPrompt.length, source: "text" }, "[smartLeadImport] text extraction failed");
    throw wrapProviderError(err, "lead-extraction:text");
  }
}

/** Extrai leads de imagem (foto, print, cartao de visita) via Gemini Vision. */
export async function extractLeadsFromImage(
  base64: string,
  mimeType: string,
  scope: { userId: string; brandId: string }
): Promise<ExtractedLeadRaw[]> {
  const clean = String(base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!clean) return [];

  try {
    /* Gemini Vision: passamos o prompt como contexto + a imagem como inlineData.
       Pedimos OCR + extração no mesmo passo (Gemini lida bem com isso). */
    const responseText = await geminiService.analyzeImages(
      [{ base64: clean, mimeType: mimeType || "image/jpeg" }],
      EXTRACTION_PROMPT,
      "Imagem com possiveis contatos (print de WhatsApp, cartao, flyer, foto de lista, etc).",
      true,
      { userId: scope.userId, brandId: scope.brandId, temperature: 0.2 }
    );

    /* Gemini pode ou nao envolver em ```json. Faz parse tolerante. */
    const cleaned = responseText.trim();
    const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1] || cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
    const parsed = JSON.parse(candidate) as ExtractionResponse;
    return Array.isArray(parsed?.leads) ? parsed.leads : [];
  } catch (err: any) {
    /* See note on text branch above — never propagate raw provider message. */
    logger.error({ err, mime: mimeType, source: "image" }, "[smartLeadImport] image extraction failed");
    throw wrapProviderError(err, "lead-extraction:image");
  }
}

import { query, queryOne, update } from "../config/database";
import { GeminiService } from "./gemini";
import { logger } from "../utils/logger";

// ─── Types ──────────────────────────────────────────────────────

export type SentimentColor = "green" | "yellow" | "red" | "black";

export type ResponseClassification = {
  sentiment: SentimentColor;
  intent: "interested" | "neutral" | "negative" | "opt_out" | "viewed_no_reply";
  confidence: number;
  scoreDelta: number;
  tagsToAdd: string[];
  tagsToRemove: string[];
  suggestedStatus: string | null;
  suggestedAction: string;
  autoFlowTrigger: string | null;
};

export type ResponseIntelligenceResult = {
  classification: ResponseClassification;
  leadId: string;
  phone: string;
  applied: boolean;
};

// ─── Static patterns ────────────────────────────────────────────

const OPT_OUT_PATTERNS = [
  "nao quero", "para de", "pare de", "nao me", "sair", "remover",
  "cancelar", "desinscrever", "nao tenho interesse", "nao envie mais",
  "bloquear", "parar", "nao mande mais", "spam", "chega",
  "nao incomode", "me tire", "tire meu numero", "denunciar",
  "me remove", "me exclui", "sai daqui", "me bloqueia",
];

const NEGATIVE_PATTERNS = [
  "nao obrigado", "sem interesse", "nao no momento", "agora nao",
  "nao estou", "estou satisfeito", "ja tenho", "nao preciso",
  "talvez depois", "nao e comigo", "numero errado", "nao quero",
  "nao conheco", "desculpa", "ninguem pediu", "quem e voce",
];

const INTERESTED_PATTERNS = [
  "quero", "interesse", "manda", "envia", "quanto custa",
  "qual o preco", "qual valor", "como funciona", "me conta",
  "pode me", "quero saber", "gostaria", "tenho interesse",
  "falar mais", "mais detalhe", "mais informac", "pode explicar",
  "vamos conversar", "quero ver", "me fala", "fala mais",
  "liga", "ligar", "agenda", "marcar", "horario", "disponivel",
  "preco", "valor", "orcamento", "proposta", "quando posso",
  "fechamos", "vamos fechar", "quero contratar", "aceito",
  "pode enviar", "pode mandar", "sim por favor", "claro",
];

const PRICE_PATTERNS = [
  "quanto custa", "qual o preco", "qual valor", "orcamento",
  "tabela de preco", "me passa o valor", "quanto fica",
  "quanto sai", "qual o investimento", "preco", "valores",
];

const SHORT_POSITIVE = new Set([
  "sim", "ok", "pode ser", "opa", "bom dia", "boa tarde",
  "boa noite", "oi", "ola", "claro", "show", "top",
  "beleza", "blz", "pode", "manda", "envia", "bora",
]);

// ─── Service ──────────────────────────────────────────────────────

export class ResponseIntelligenceService {
  private gemini: GeminiService | null = null;

  private getGemini(): GeminiService {
    if (!this.gemini) this.gemini = new GeminiService();
    return this.gemini;
  }

  // ─── Core classification ──────────────────────────────────────

  classifyText(text: string): ResponseClassification {
    const lower = text.toLowerCase().trim();

    // Opt-out (red/black)
    if (OPT_OUT_PATTERNS.some(p => lower.includes(p))) {
      return {
        sentiment: "red",
        intent: "opt_out",
        confidence: 0.95,
        scoreDelta: -50,
        tagsToAdd: ["opt_out", "bloqueado", "sem_interesse"],
        tagsToRemove: ["aguardando_resposta", "lead_morno", "lead_quente"],
        suggestedStatus: "lost",
        suggestedAction: "Bloquear envios futuros para este lead.",
        autoFlowTrigger: null,
      };
    }

    // Negative (red)
    if (NEGATIVE_PATTERNS.some(p => lower.includes(p))) {
      return {
        sentiment: "red",
        intent: "negative",
        confidence: 0.85,
        scoreDelta: -15,
        tagsToAdd: ["sem_interesse"],
        tagsToRemove: ["aguardando_resposta", "lead_quente"],
        suggestedStatus: "lost",
        suggestedAction: "Lead sem interesse. Considerar reativacao em 7 dias.",
        autoFlowTrigger: null,
      };
    }

    // Price inquiry (green - high interest)
    if (PRICE_PATTERNS.some(p => lower.includes(p))) {
      return {
        sentiment: "green",
        intent: "interested",
        confidence: 0.95,
        scoreDelta: 40,
        tagsToAdd: ["interessado", "lead_quente", "pediu_preco", "respondeu"],
        tagsToRemove: ["aguardando_resposta", "lead_morno", "lead_frio"],
        suggestedStatus: "replied",
        suggestedAction: "Lead pediu preco! Enviar proposta comercial imediatamente.",
        autoFlowTrigger: "envio_oferta_direta",
      };
    }

    // Interested (green)
    if (INTERESTED_PATTERNS.some(p => lower.includes(p))) {
      return {
        sentiment: "green",
        intent: "interested",
        confidence: 0.85,
        scoreDelta: 20,
        tagsToAdd: ["interessado", "lead_quente", "respondeu"],
        tagsToRemove: ["aguardando_resposta", "lead_morno", "lead_frio"],
        suggestedStatus: "replied",
        suggestedAction: "Lead demonstrou interesse. Iniciar conversa consultiva.",
        autoFlowTrigger: "nutricao_educacional_3_dias",
      };
    }

    // Short positive
    if (SHORT_POSITIVE.has(lower)) {
      return {
        sentiment: "green",
        intent: "interested",
        confidence: 0.70,
        scoreDelta: 15,
        tagsToAdd: ["respondeu", "lead_morno"],
        tagsToRemove: ["aguardando_resposta", "lead_frio"],
        suggestedStatus: "replied",
        suggestedAction: "Resposta curta positiva. Continuar conversa.",
        autoFlowTrigger: null,
      };
    }

    // Neutral (yellow)
    return {
      sentiment: "yellow",
      intent: "neutral",
      confidence: 0.60,
      scoreDelta: 5,
      tagsToAdd: ["respondeu", "lead_morno"],
      tagsToRemove: ["aguardando_resposta"],
      suggestedStatus: null,
      suggestedAction: "Resposta neutra. Enviar follow-up em 24h.",
      autoFlowTrigger: "followup_1_lead_silencioso",
    };
  }

  // ─── AI-enhanced classification (optional) ─────────────────────

  async classifyWithAI(text: string, contextBlock?: string): Promise<ResponseClassification> {
    // First get rule-based classification as baseline
    const rulesBased = this.classifyText(text);

    // If confidence is high, skip AI
    if (rulesBased.confidence >= 0.90) return rulesBased;

    try {
      const gemini = this.getGemini();
      const prompt = `Classifique a seguinte resposta de um lead a uma mensagem comercial de WhatsApp.

${contextBlock ? `CONTEXTO DO NEGOCIO:\n${contextBlock}\n` : ""}

RESPOSTA DO LEAD: "${text}"

Responda APENAS com um JSON valido no formato:
{
  "sentiment": "green" | "yellow" | "red",
  "intent": "interested" | "neutral" | "negative" | "opt_out",
  "confidence": 0.0 a 1.0,
  "action": "breve descricao da acao sugerida"
}

Criterios:
- green/interested: lead quer saber mais, pediu preco, mostrou curiosidade
- yellow/neutral: resposta vaga, sem indicacao clara
- red/negative: nao quer, nao tem interesse
- red/opt_out: pediu para parar de receber mensagens

JSON:`;

      const result = await (gemini as any).model.generateContent(prompt);
      const raw = result.response.text().trim();

      // Extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const aiSentiment = parsed.sentiment as SentimentColor;
        const aiIntent = parsed.intent;

        // Merge AI with rules-based, preferring higher confidence
        if (parsed.confidence > rulesBased.confidence) {
          const merged = this.classifyText(text); // re-get base
          merged.sentiment = aiSentiment;
          merged.intent = aiIntent;
          merged.confidence = parsed.confidence;
          merged.suggestedAction = String(parsed.action || merged.suggestedAction);

          // Re-derive tags and score from AI intent
          return this.enrichClassification(merged);
        }
      }
    } catch (err: any) {
      logger.warn(`ResponseIntelligence AI classification failed: ${err.message}`);
    }

    return rulesBased;
  }

  private enrichClassification(base: ResponseClassification): ResponseClassification {
    switch (base.intent) {
      case "interested":
        base.scoreDelta = 25;
        base.tagsToAdd = ["interessado", "lead_quente", "respondeu"];
        base.tagsToRemove = ["aguardando_resposta", "lead_morno", "lead_frio"];
        base.suggestedStatus = "replied";
        base.autoFlowTrigger = "nutricao_educacional_3_dias";
        break;
      case "neutral":
        base.scoreDelta = 5;
        base.tagsToAdd = ["respondeu", "lead_morno"];
        base.tagsToRemove = ["aguardando_resposta"];
        base.suggestedStatus = null;
        base.autoFlowTrigger = "followup_1_lead_silencioso";
        break;
      case "negative":
        base.scoreDelta = -15;
        base.tagsToAdd = ["sem_interesse"];
        base.tagsToRemove = ["aguardando_resposta", "lead_quente"];
        base.suggestedStatus = "lost";
        base.autoFlowTrigger = null;
        break;
      case "opt_out":
        base.scoreDelta = -50;
        base.tagsToAdd = ["opt_out", "bloqueado"];
        base.tagsToRemove = ["aguardando_resposta", "lead_morno", "lead_quente"];
        base.suggestedStatus = "lost";
        base.autoFlowTrigger = null;
        break;
    }
    return base;
  }

  // ─── Viewed-no-reply detection (24h) ──────────────────────────

  classifyViewedNoReply(): ResponseClassification {
    return {
      sentiment: "black",
      intent: "viewed_no_reply",
      confidence: 1.0,
      scoreDelta: -10,
      tagsToAdd: ["visualizou_sem_resposta"],
      tagsToRemove: ["aguardando_resposta"],
      suggestedStatus: null,
      suggestedAction: "Visualizou mas nao respondeu. Enviar follow-up leve.",
      autoFlowTrigger: "followup_1_lead_silencioso",
    };
  }

  // ─── Apply classification to lead ──────────────────────────────

  async applyToLead(
    userId: string,
    leadId: string,
    classification: ResponseClassification
  ): Promise<void> {
    try {
      const cols = await this.getCustomerColumns();

      const fields: string[] = [];
      const values: any[] = [];

      // Tags
      if (cols.has("tags")) {
        const row = await queryOne<any>(`SELECT tags FROM customers WHERE id = ? LIMIT 1`, [leadId]);
        let currentTags = this.parseJsonArray(row?.tags);

        // Remove tags
        const removeSet = new Set(classification.tagsToRemove.map(t => t.toLowerCase()));
        currentTags = currentTags.filter(t => !removeSet.has(t.toLowerCase()));

        // Add tags
        const allTags = [...new Set([...currentTags, ...classification.tagsToAdd])];
        fields.push("tags = ?");
        values.push(JSON.stringify(allTags));
      }

      // Status
      if (classification.suggestedStatus && cols.has("status")) {
        fields.push("status = ?");
        values.push(classification.suggestedStatus);
      }

      // Score
      if (cols.has("lead_score")) {
        fields.push("lead_score = GREATEST(0, lead_score + ?)");
        values.push(classification.scoreDelta);
      }

      // Last contact
      if (cols.has("last_contact_at")) {
        fields.push("last_contact_at = NOW()");
      }

      if (!fields.length) return;

      const ownerCol = cols.has("user_id") ? "user_id" : cols.has("assigned_to") ? "assigned_to" : null;

      let sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
      values.push(leadId);

      if (ownerCol) {
        sql += ` AND ${ownerCol} = ?`;
        values.push(userId);
      }

      await update(sql, values);

      logger.info(`[ResponseIntelligence] Applied ${classification.sentiment}/${classification.intent} to lead ${leadId} (score: ${classification.scoreDelta > 0 ? "+" : ""}${classification.scoreDelta})`);
    } catch (err: any) {
      logger.error(`[ResponseIntelligence] Failed to apply classification to lead ${leadId}: ${err.message}`);
    }
  }

  // ─── Check high-score leads for human handoff ──────────────────

  async getHighScoreLeads(
    userId: string,
    threshold: number = 70,
    brandId?: string | null
  ): Promise<Array<{ id: string; name: string; phone: string; score: number; tags: string[] }>> {
    const cols = await this.getCustomerColumns();
    if (!cols.has("lead_score")) return [];

    const ownerCol = cols.has("user_id") ? "user_id" : cols.has("assigned_to") ? "assigned_to" : null;
    const normalizedBrandId = String(brandId || "").trim();

    let sql = `SELECT id, name, phone, lead_score, tags FROM customers WHERE lead_score >= ?`;
    const params: any[] = [threshold];

    if (ownerCol) {
      sql += ` AND ${ownerCol} = ?`;
      params.push(userId);
    }

    if (cols.has("brand_id")) {
      if (normalizedBrandId) {
        sql += ` AND brand_id = ?`;
        params.push(normalizedBrandId);
      } else {
        sql += ` AND brand_id IS NULL`;
      }
    }

    sql += ` ORDER BY lead_score DESC LIMIT 50`;

    const rows = await query<any[]>(sql, params);
    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name || ""),
      phone: String(r.phone || ""),
      score: Number(r.lead_score || 0),
      tags: this.parseJsonArray(r.tags),
    }));
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private customerColumnsCache: Set<string> | null = null;

  private async getCustomerColumns(): Promise<Set<string>> {
    if (!this.customerColumnsCache) {
      const rows = await query<any[]>("SHOW COLUMNS FROM customers");
      this.customerColumnsCache = new Set(rows.map(r => String(r.Field || "")));
    }
    return this.customerColumnsCache;
  }

  private parseJsonArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(i => String(i).trim()).filter(Boolean);
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(i => String(i).trim()).filter(Boolean);
    } catch { /* ignore */ }
    return [];
  }
}

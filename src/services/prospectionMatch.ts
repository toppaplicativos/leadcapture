import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../utils/logger";

/* ════════════════════════════════════════════════════════════
   ProspectionMatchService
   ────────────────────────────────────────────────────────────
   Scores how well a product (supply) matches a search query
   (demand). Uses Gemini to understand semantic intent rather
   than naive keyword matching.

   Example problem:
     Product "Alho de qualidade" with description keyword
     "cozinha industrial" → a naïve search for "cozinha industrial"
     returns this product, BUT the people searching that term
     probably want industrial kitchen equipment, not garlic.
     The match score should be LOW.

   The service returns a score 0-100 and reasoning.
   ════════════════════════════════════════════════════════════ */

export interface ProductForMatch {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number;
}

export interface MatchScoreResult {
  product_id: string;
  score: number;            // 0-100
  grade: "A" | "B" | "C" | "D";   // A=great fit, D=poor fit
  demand_intent: string;    // what the searcher likely wants
  supply_profile: string;   // what the product actually is
  reasoning: string;        // why the score is what it is
  is_relevant: boolean;     // score >= 50
}

export interface BulkMatchResult {
  query: string;
  results: MatchScoreResult[];
  total: number;
  relevant_count: number;
}

const GRADE_THRESHOLDS = { A: 75, B: 50, C: 25 };

function scoreToGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= GRADE_THRESHOLDS.A) return "A";
  if (score >= GRADE_THRESHOLDS.B) return "B";
  if (score >= GRADE_THRESHOLDS.C) return "C";
  return "D";
}

export class ProspectionMatchService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }

  /* ── Score a single product against a query ────────── */
  async scoreMatch(query: string, product: ProductForMatch): Promise<MatchScoreResult> {
    const prompt = this.buildSinglePrompt(query, product);

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);

      const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
      return {
        product_id: product.id,
        score,
        grade: scoreToGrade(score),
        demand_intent: String(parsed.demand_intent || "").slice(0, 200),
        supply_profile: String(parsed.supply_profile || "").slice(0, 200),
        reasoning: String(parsed.reasoning || "").slice(0, 300),
        is_relevant: score >= 50,
      };
    } catch (err: any) {
      logger.error(err, `ProspectionMatch: failed to score product ${product.id}`);
      return this.fallbackScore(query, product);
    }
  }

  /* ── Score multiple products in a single AI call ──── */
  async scoreBulk(query: string, products: ProductForMatch[]): Promise<BulkMatchResult> {
    if (!products.length) {
      return { query, results: [], total: 0, relevant_count: 0 };
    }

    // For small batches use single calls (more reliable JSON)
    if (products.length <= 3) {
      const results = await Promise.all(
        products.map((p) => this.scoreMatch(query, p))
      );
      results.sort((a, b) => b.score - a.score);
      return {
        query,
        results,
        total: results.length,
        relevant_count: results.filter((r) => r.is_relevant).length,
      };
    }

    // Bulk prompt for 4+ products
    const prompt = this.buildBulkPrompt(query, products);

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: any[] = JSON.parse(cleaned);

      const results: MatchScoreResult[] = parsed.map((item: any, idx: number) => {
        const productId = item.product_id || products[idx]?.id || "";
        const score = Math.min(100, Math.max(0, Number(item.score) || 0));
        return {
          product_id: productId,
          score,
          grade: scoreToGrade(score),
          demand_intent: String(item.demand_intent || "").slice(0, 200),
          supply_profile: String(item.supply_profile || "").slice(0, 200),
          reasoning: String(item.reasoning || "").slice(0, 300),
          is_relevant: score >= 50,
        };
      });

      results.sort((a, b) => b.score - a.score);

      return {
        query,
        results,
        total: results.length,
        relevant_count: results.filter((r) => r.is_relevant).length,
      };
    } catch (err: any) {
      logger.error(err, "ProspectionMatch: bulk scoring failed, falling back to individual");
      // Fallback: score individually
      const results = await Promise.all(
        products.map((p) => this.scoreMatch(query, p))
      );
      results.sort((a, b) => b.score - a.score);
      return {
        query,
        results,
        total: results.length,
        relevant_count: results.filter((r) => r.is_relevant).length,
      };
    }
  }

  /* ── Quick text-only relevance (no AI, for pre-filter) ── */
  quickTextScore(query: string, product: ProductForMatch): number {
    const q = (query || "").toLowerCase().trim();
    if (!q) return 50; // no query = neutral

    const name = (product.name || "").toLowerCase();
    const desc = (product.description || "").toLowerCase();
    const cat = (product.category || "").toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length >= 2);

    let score = 0;
    let matched = 0;

    for (const word of words) {
      if (name.includes(word)) { score += 30; matched++; }
      else if (cat.includes(word)) { score += 20; matched++; }
      else if (desc.includes(word)) { score += 10; matched++; }
    }

    if (words.length > 0) {
      // Normalize by how many words matched
      const coverage = matched / words.length;
      score = Math.round(score * coverage);
    }

    return Math.min(100, score);
  }

  /* ── Private helpers ─────────────────────── */

  private buildSinglePrompt(query: string, product: ProductForMatch): string {
    return `Voce e um analista de inteligencia comercial. Avalie o MATCH entre a DEMANDA (o que o comprador busca) e a OFERTA (o que o produto oferece).

DEMANDA (busca do comprador): "${query}"

OFERTA (produto a venda):
- Nome: ${product.name}
- Categoria: ${product.category || "Sem categoria"}
- Descricao: ${(product.description || "Sem descricao").slice(0, 500)}
${product.price ? `- Preco: R$ ${product.price.toFixed(2)}` : ""}

ANALISE com estes criterios:
1. INTENCAO DE COMPRA — O que a pessoa que busca "${query}" provavelmente quer comprar?
2. PERFIL DO PRODUTO — O que este produto realmente e/faz?
3. MATCH REAL — O produto atende a necessidade real do comprador? (Nao apenas palavras em comum, mas contexto semantico)
4. PUBLICO-ALVO — O comprador tipico desta busca e o mesmo publico que compraria este produto?

Exemplos de armadilhas a detectar:
- "cozinha industrial" no produto alho → quem busca cozinha industrial quer equipamentos, nao ingredientes
- "material de escritorio" no produto caderno → match bom, mesma intencao
- "celular" na descricao de capinha → match parcial, acessorio vs dispositivo

Retorne APENAS JSON valido (sem markdown):
{
  "score": <0-100>,
  "demand_intent": "<o que o comprador realmente quer>",
  "supply_profile": "<o que este produto realmente e>",
  "reasoning": "<por que o score e X, explicacao curta>"
}`;
  }

  private buildBulkPrompt(query: string, products: ProductForMatch[]): string {
    const productsList = products
      .map(
        (p, i) =>
          `[${i}] id="${p.id}" | nome="${p.name}" | categoria="${p.category || "—"}" | descricao="${(p.description || "").slice(0, 200)}"`
      )
      .join("\n");

    return `Voce e um analista de inteligencia comercial. Para a DEMANDA abaixo, avalie o MATCH com cada produto.

DEMANDA (busca): "${query}"

PRODUTOS:
${productsList}

Para CADA produto, analise:
1. A intencao real de quem busca "${query}"
2. Se o produto realmente atende essa intencao (nao apenas coincidencia de palavras)
3. Se o publico-alvo da busca compraria de fato este produto

Retorne APENAS um JSON array valido (sem markdown), um objeto por produto:
[
  {
    "product_id": "<id do produto>",
    "score": <0-100>,
    "demand_intent": "<o que o comprador quer>",
    "supply_profile": "<o que o produto e>",
    "reasoning": "<explicacao curta>"
  }
]`;
  }

  private fallbackScore(query: string, product: ProductForMatch): MatchScoreResult {
    const textScore = this.quickTextScore(query, product);
    return {
      product_id: product.id,
      score: textScore,
      grade: scoreToGrade(textScore),
      demand_intent: query,
      supply_profile: product.name,
      reasoning: "Score calculado por correspondencia textual (IA indisponivel)",
      is_relevant: textScore >= 50,
    };
  }
}

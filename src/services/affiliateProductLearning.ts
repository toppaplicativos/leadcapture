import { createHash, randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { ProductsService } from "./products";
import { AIRouter } from "./aiRouter";
import { AffiliatesService } from "./affiliates";
import { normalizeUploadUrl } from "../utils/mediaUrl";

let schemaReady = false;

export type AffiliateProductGuideStructure = {
  headline: string;
  summary: string;
  strong_points: string[];
  ideal_audience: string;
  how_to_sell: string[];
  objections: Array<{ objection: string; response: string }>;
  tips: string[];
  pitch_ideas: string[];
  keywords: string[];
  commission_angle: string;
};

export type AffiliateProductGuideRow = {
  id: string;
  owner_user_id: string;
  brand_id: string;
  product_id: string;
  status: "pending" | "ready" | "failed";
  structure_json: string | null;
  product_snapshot_hash: string | null;
  error_message: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_product_guides (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      product_id VARCHAR(60) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      structure_json JSON NULL,
      product_snapshot_hash VARCHAR(64) NULL,
      error_message TEXT NULL,
      generated_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_product_guide (brand_id, product_id)
    )
  `);
  schemaReady = true;
}

function productSnapshotHash(product: {
  name?: string;
  description?: string;
  price?: number;
  features?: string[];
}): string {
  const payload = JSON.stringify({
    name: product.name,
    description: product.description,
    price: product.price,
    features: product.features,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function parseAiJson(text: string): AffiliateProductGuideStructure {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(raw);
  return {
    headline: String(parsed.headline || parsed.titulo || "").trim() || "Como vender este produto",
    summary: String(parsed.summary || parsed.resumo || "").trim(),
    strong_points: Array.isArray(parsed.strong_points || parsed.pontos_fortes)
      ? (parsed.strong_points || parsed.pontos_fortes).map((v: unknown) => String(v).trim()).filter(Boolean)
      : [],
    ideal_audience: String(parsed.ideal_audience || parsed.publico_ideal || "").trim(),
    how_to_sell: Array.isArray(parsed.how_to_sell || parsed.como_vender)
      ? (parsed.how_to_sell || parsed.como_vender).map((v: unknown) => String(v).trim()).filter(Boolean)
      : [],
    objections: Array.isArray(parsed.objections || parsed.objecoes)
      ? (parsed.objections || parsed.objecoes)
          .map((o: any) => ({
            objection: String(o?.objection || o?.objecao || "").trim(),
            response: String(o?.response || o?.resposta || "").trim(),
          }))
          .filter((o: { objection: string; response: string }) => o.objection && o.response)
      : [],
    tips: Array.isArray(parsed.tips || parsed.dicas)
      ? (parsed.tips || parsed.dicas).map((v: unknown) => String(v).trim()).filter(Boolean)
      : [],
    pitch_ideas: Array.isArray(parsed.pitch_ideas || parsed.ideias_pitch)
      ? (parsed.pitch_ideas || parsed.ideias_pitch).map((v: unknown) => String(v).trim()).filter(Boolean)
      : [],
    keywords: Array.isArray(parsed.keywords || parsed.palavras_chave)
      ? (parsed.keywords || parsed.palavras_chave).map((v: unknown) => String(v).trim()).filter(Boolean)
      : [],
    commission_angle: String(parsed.commission_angle || parsed.angulo_comissao || "").trim(),
  };
}

function buildPrompt(product: {
  name: string;
  description?: string;
  price?: number;
  promoPrice?: number;
  unit?: string;
  features?: string[];
  category?: string;
}, brandName?: string): string {
  const price = product.promoPrice && product.promoPrice < (product.price || 0)
    ? `R$ ${product.promoPrice} (de R$ ${product.price})`
    : `R$ ${product.price || 0}`;

  return `Você é um especialista em vendas e treinamento de afiliados para e-commerce brasileiro.
Crie um guia prático para o afiliado vender o produto abaixo. Responda APENAS com JSON válido (sem markdown).

PRODUTO:
- Nome: ${product.name}
- Marca: ${brandName || "Loja"}
- Categoria: ${product.category || "Geral"}
- Preço: ${price}${product.unit ? ` / ${product.unit}` : ""}
- Descrição: ${product.description || "—"}
- Benefícios: ${(product.features || []).join("; ") || "—"}

JSON esperado:
{
  "headline": "frase de impacto curta",
  "summary": "2-3 frases sobre o produto",
  "strong_points": ["5 pontos fortes"],
  "ideal_audience": "quem compra e por quê",
  "how_to_sell": ["5 passos práticos de venda"],
  "objections": [{"objection": "...", "response": "..."}],
  "tips": ["5 dicas rápidas"],
  "pitch_ideas": ["3 ideias de mensagem para WhatsApp/Instagram"],
  "keywords": ["palavras para usar na divulgação"],
  "commission_angle": "como destacar valor para converter"
}`;
}

export class AffiliateProductLearningService {
  private products = new ProductsService();
  private ai = new AIRouter();
  private affiliates = new AffiliatesService();

  async listCatalog(ownerUserId: string, brandId: string) {
    await ensureSchema();
    const products = await this.products.getActiveProducts(ownerUserId, brandId);
    const guides = await query<AffiliateProductGuideRow[]>(
      `SELECT product_id, status, generated_at, product_snapshot_hash
       FROM affiliate_product_guides
       WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );
    const guideMap = new Map(guides.map((g) => [g.product_id, g]));

    return products
      .filter((p) => p.active !== false && p.is_active !== false)
      .map((p) => {
        const g = guideMap.get(p.id);
        return {
          id: p.id,
          slug: String((p as { slug?: string }).slug || "").trim() || null,
          name: p.name,
          subtitle: p.subtitle || null,
          description: p.description,
          category: p.category,
          price: p.price,
          promo_price: p.promoPrice ?? null,
          unit: p.unit,
          image_url: normalizeUploadUrl(p.imageUrl || p.image || (p.images?.[0] ?? null)),
          features: p.features || [],
          guide_status: g?.status || null,
          has_guide: g?.status === "ready",
          guide_generated_at: g?.generated_at || null,
        };
      });
  }

  async getGuide(ownerUserId: string, brandId: string, productId: string) {
    await ensureSchema();
    const row = await queryOne<AffiliateProductGuideRow>(
      `SELECT * FROM affiliate_product_guides
       WHERE owner_user_id = ? AND brand_id = ? AND product_id = ?
       LIMIT 1`,
      [ownerUserId, brandId, productId]
    );
    if (!row || row.status !== "ready" || !row.structure_json) return null;

    let structure: AffiliateProductGuideStructure;
    try {
      structure = typeof row.structure_json === "string"
        ? JSON.parse(row.structure_json)
        : row.structure_json as AffiliateProductGuideStructure;
    } catch {
      return null;
    }
    return { ...row, structure };
  }

  async generateGuide(ownerUserId: string, brandId: string, productId: string, opts?: { force?: boolean }) {
    await ensureSchema();
    const product = await this.products.getProduct(productId, ownerUserId, brandId);
    if (!product) throw new Error("Produto não encontrado");

    const brand = await queryOne<any>(
      `SELECT name FROM brand_units WHERE id = ? LIMIT 1`,
      [brandId]
    );
    const hash = productSnapshotHash(product);
    const existing = await queryOne<AffiliateProductGuideRow>(
      `SELECT * FROM affiliate_product_guides WHERE brand_id = ? AND product_id = ? LIMIT 1`,
      [brandId, productId]
    );

    if (existing?.status === "ready" && existing.product_snapshot_hash === hash && !opts?.force) {
      return this.getGuide(ownerUserId, brandId, productId);
    }

    const id = existing?.id || randomUUID();
    await query(
      `INSERT INTO affiliate_product_guides
       (id, owner_user_id, brand_id, product_id, status, error_message, updated_at)
       VALUES (?, ?, ?, ?, 'pending', NULL, NOW())
       ON DUPLICATE KEY UPDATE status = 'pending', error_message = NULL, updated_at = NOW()`,
      [id, ownerUserId, brandId, productId]
    );

    try {
      const result = await this.ai.generateText(buildPrompt(product, brand?.name), {
        userId: ownerUserId,
        brandId,
      }, { temperature: 0.55, functionKey: "text.affiliate.product_learn" });

      const structure = parseAiJson(result.text || "");
      await query(
        `UPDATE affiliate_product_guides
         SET status = 'ready', structure_json = ?, product_snapshot_hash = ?,
             error_message = NULL, generated_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(structure), hash, id]
      );
      await this.affiliates.bumpContentVersion(ownerUserId, brandId);
      return this.getGuide(ownerUserId, brandId, productId);
    } catch (e: any) {
      await query(
        `UPDATE affiliate_product_guides
         SET status = 'failed', error_message = ?, updated_at = NOW()
         WHERE id = ?`,
        [String(e?.message || "Falha na geração").slice(0, 500), id]
      );
      throw e;
    }
  }
}

export const affiliateProductLearningService = new AffiliateProductLearningService();
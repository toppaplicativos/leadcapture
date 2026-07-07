import { CustomersService } from "../customers";
import { ClientsService } from "../clients";
import { InventoryService } from "../inventory";
import { galleryService } from "../gallery";
import { aiRouter } from "../aiRouter";
import { CreativeStudioService } from "../creativeStudio";
import { instagramService } from "../instagram";
import { query, queryOne } from "../../config/database";

export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  price: number;
  features: string[];
};

const customersService = new CustomersService();
const clientsService = new ClientsService();
const inventoryService = new InventoryService();
const creativeStudio = new CreativeStudioService();

export type InstagramPostDraft = {
  postId: string;
  caption: string;
  mediaUrl: string;
  brief: string;
  imageSource: "gallery" | "ai" | "none";
};

export async function fetchRecentLeads(
  userId: string,
  brandId: string | null,
  opts?: { search?: string; status?: string; limit?: number },
) {
  const result = await customersService.getAll({
    ownerUserId: userId,
    brandId,
    search: opts?.search,
    status: opts?.status,
    limit: opts?.limit || 8,
    offset: 0,
  });

  return {
    total: result.total,
    rows: (result.customers || []).map((c: any) => ({
      id: c.id,
      name: c.name || c.trade_name || "Sem nome",
      phone: c.phone || "",
      city: c.city || "",
      status: c.status || "",
      source: c.source || "",
    })),
  };
}

export async function fetchLeadById(
  userId: string,
  brandId: string | null,
  leadId: string,
) {
  const lead = await customersService.getById(leadId, userId, brandId).catch(() => null);
  if (!lead) return null;
  return mapLead(lead);
}

function mapLead(c: any) {
  return {
    id: c.id,
    name: c.name || c.trade_name || "Sem nome",
    phone: c.phone || "",
    email: c.email || "",
    city: c.city || "",
    state: c.state || "",
    status: c.status || "",
    source: c.source || "",
    category: c.category || "",
    notes: c.notes || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
  };
}

export async function fetchRecentProducts(userId: string, brandId: string | null) {
  const result = await inventoryService.listStock(userId, brandId, { limit: 8, page: 1 });
  const products = result.items || [];
  return {
    total: result.total || products.length,
    rows: products.map((p: any) => ({
      id: p.product_id || p.id,
      name: p.product_name || p.name || "Produto",
      sku: p.sku || "",
      stock: p.stock_current ?? p.stock_available ?? 0,
      price: p.price ?? p.sale_price ?? null,
    })),
  };
}

export async function fetchRecentConversations(userId: string, _brandId: string | null) {
  try {
    const rows = await query<any[]>(
      `SELECT c.id, c.contact_name, c.contact_phone, c.ai_mode, c.last_message_at,
              c.unread_count, c.last_message_text
       FROM whatsapp_conversations c
       JOIN whatsapp_instances i ON c.instance_id = i.id
       WHERE i.created_by = ?
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
       LIMIT 8`,
      [userId],
    );
    const list = Array.isArray(rows) ? rows : [];
    return {
      total: list.length,
      rows: list.map((r: any) => ({
        id: r.id,
        name: r.contact_name || r.contact_phone || "Contato",
        phone: r.contact_phone || "",
        mode: r.ai_mode || "manual",
        preview: String(r.last_message_text || "").slice(0, 80),
        unread: Number(r.unread_count || 0),
      })),
    };
  } catch {
    return { total: 0, rows: [] };
  }
}

export async function fetchGalleryCount(userId: string, brandId: string | null) {
  if (!brandId) return 0;
  try {
    const { total } = await galleryService.listItems(userId, brandId, { limit: 1, page: 1 });
    return total;
  } catch {
    return 0;
  }
}

export async function fetchLeadStats(userId: string, brandId: string | null) {
  try {
    return await customersService.getStats(userId, brandId);
  } catch {
    return null;
  }
}

export async function fetchRecentClients(
  userId: string,
  brandId: string | null,
  opts?: { search?: string; status?: string; limit?: number },
) {
  const result = await clientsService.getAll(userId, {
    search: opts?.search,
    status: opts?.status,
    page: 1,
    limit: opts?.limit || 12,
    brand_id: brandId || undefined,
  });

  return {
    total: result.total,
    rows: (result.clients || []).map((c: any) => ({
      id: c.id,
      name: c.name || c.trade_name || "Sem nome",
      phone: c.phone || "",
      email: c.email || "",
      city: c.city || "",
      status: c.status || "",
      source: c.source || "",
    })),
  };
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  aguardando_pagamento: "Aguardando",
  pago: "Pago",
  em_preparacao: "Preparando",
  em_entrega: "Em entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const ORDER_BUSINESS_STATUS_SQL = `COALESCE(m.business_status, CASE o.status_pedido
  WHEN 'pago' THEN 'pago'
  WHEN 'aguardando_pagamento' THEN 'aguardando_pagamento'
  WHEN 'cancelado' THEN 'cancelado'
  WHEN 'estornado' THEN 'cancelado'
  ELSE 'novo'
END)`;

function orderBrandClause(brandId: string | null, params: any[]): string {
  if (brandId) {
    params.push(brandId);
    return "o.brand_id = ?";
  }
  return "o.brand_id IS NULL";
}

export async function fetchRecentOrders(
  userId: string,
  brandId: string | null,
  opts?: { search?: string; status?: string; limit?: number },
) {
  try {
    const limit = opts?.limit || 12;
    const params: any[] = [userId];
    const brandClause = orderBrandClause(brandId, params);
    let where = `o.user_id = ? AND ${brandClause}`;
    if (opts?.status) {
      where += ` AND LOWER(${ORDER_BUSINESS_STATUS_SQL}) = ?`;
      params.push(String(opts.status).toLowerCase());
    }
    if (opts?.search?.trim()) {
      where += " AND (o.customer_name ILIKE ? OR o.id::text ILIKE ?)";
      const q = `%${opts.search.trim()}%`;
      params.push(q, q);
    }
    const countParams = [...params];
    params.push(limit);

    const rows = await query<any>(
      `SELECT o.id, o.customer_name, o.customer_phone, o.valor_total,
              ${ORDER_BUSINESS_STATUS_SQL} AS status,
              o.forma_pagamento,
              COALESCE(m.channel, CASE o.origem WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'checkout_web' THEN 'Site' ELSE 'Site' END) AS channel,
              o.origem, o.created_at
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE ${where}
       ORDER BY o.created_at DESC LIMIT ?`,
      params,
    );

    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE ${where}`,
      countParams,
    );

    return {
      total: Number(totalRow?.n ?? rows.length),
      rows: (rows || []).map((o: any) => {
        const st = String(o.status || "novo").toLowerCase();
        return {
          id: o.id,
          name: o.customer_name || "Cliente",
          order_number: String(o.id || "").slice(0, 8),
          phone: o.customer_phone || "",
          total: Number(o.valor_total || 0),
          status: ORDER_STATUS_LABEL[st] || st,
          payment: String(o.forma_pagamento || "").toUpperCase() || "—",
          channel: o.channel || o.origem || "",
          created_at: o.created_at || "",
        };
      }),
    };
  } catch {
    return { total: 0, rows: [] };
  }
}

export async function fetchOrderStats(userId: string, brandId: string | null) {
  try {
    const params: any[] = [userId];
    const brandClause = orderBrandClause(brandId, params);
    const row = await queryOne<{
      total: number
      pending_count: number
      paid_count: number
      revenue_total: number
    }>(
      `SELECT COUNT(*)::int AS total,
        SUM(CASE WHEN LOWER(${ORDER_BUSINESS_STATUS_SQL}) IN ('novo', 'aguardando_pagamento') THEN 1 ELSE 0 END)::int AS pending_count,
        SUM(CASE WHEN LOWER(${ORDER_BUSINESS_STATUS_SQL}) IN ('pago', 'em_preparacao', 'em_entrega', 'entregue') THEN 1 ELSE 0 END)::int AS paid_count,
        COALESCE(SUM(o.valor_total), 0)::float AS revenue_total
       FROM commerce_orders o
       LEFT JOIN order_management_meta m ON m.order_id = o.id
       WHERE o.user_id = ? AND ${brandClause}`,
      params,
    );
    return {
      total: Number(row?.total ?? 0),
      pending_count: Number(row?.pending_count ?? 0),
      paid_count: Number(row?.paid_count ?? 0),
      revenue_total: Number(row?.revenue_total ?? 0),
    };
  } catch {
    return { total: 0, pending_count: 0, paid_count: 0, revenue_total: 0 };
  }
}

export async function fetchClientStats(userId: string, brandId: string | null) {
  try {
    const params: any[] = [userId];
    let where = "user_id = ? AND is_active = TRUE";
    if (brandId) {
      where += " AND brand_id = ?";
      params.push(brandId);
    } else {
      where += " AND brand_id IS NULL";
    }
    const row = await queryOne<{ total: number; active_count: number }>(
      `SELECT COUNT(*)::int AS total,
        SUM(CASE WHEN status IN ('converted', 'active', 'negotiating', 'replied') THEN 1 ELSE 0 END)::int AS active_count
       FROM clients WHERE ${where}`,
      params,
    );
    return {
      total: Number(row?.total ?? 0),
      active_count: Number(row?.active_count ?? 0),
    };
  } catch {
    return { total: 0, active_count: 0 };
  }
}

export async function generateProductDraftFromBrief(
  userId: string,
  brandId: string | null,
  input: { name?: string; category?: string; brief?: string; price?: number },
): Promise<ProductDraft> {
  const name = String(input.name || "").trim() || "Novo produto";
  const category = String(input.category || "").trim() || "Geral";
  const brief = String(input.brief || "").trim();
  const priceHint = input.price != null && Number.isFinite(input.price) ? Number(input.price) : null;

  const fallback: ProductDraft = {
    name,
    description: brief || `Produto ${name} — adicione mais detalhes na descrição.`,
    category,
    price: priceHint ?? 0,
    features: [],
  };

  if (!brief && !priceHint) return fallback;

  const prompt = [
    "Você é especialista em catálogo de e-commerce no Brasil.",
    "Gere um rascunho de produto em JSON válido com os campos:",
    '{ "name": string, "description": string, "category": string, "price": number, "features": string[] }',
    "Regras:",
    "- Português-BR natural e comercial",
    "- description: 2-3 parágrafos curtos, sem markdown",
    "- price: número em reais (sem símbolo), realista para o segmento",
    "- features: 3-5 bullets curtos como strings",
    "- Não inventar especificações técnicas impossíveis",
    `- Nome base: ${name}`,
    `- Categoria: ${category}`,
    brief ? `- Briefing do lojista: ${brief}` : "",
    priceHint != null ? `- Preço sugerido pelo lojista: R$ ${priceHint.toFixed(2)}` : "",
    "Retorne APENAS o JSON.",
  ].filter(Boolean).join("\n");

  try {
    const result = await aiRouter.generateJson<ProductDraft>(prompt, {
      userId,
      brandId: brandId || undefined,
    }, { temperature: 0.55 });
    return {
      name: String(result?.name || name).trim() || name,
      description: String(result?.description || brief || fallback.description).trim(),
      category: String(result?.category || category).trim() || category,
      price: Number(result?.price ?? priceHint ?? 0) || 0,
      features: Array.isArray(result?.features)
        ? result.features.map((f) => String(f).trim()).filter(Boolean).slice(0, 6)
        : [],
    };
  } catch {
    return fallback;
  }
}

function parseInstagramCaption(text: string) {
  const raw = String(text || "").trim();
  const parts = raw.split(/\n\s*\n/);
  let caption = parts[0] || raw;
  const hashtagLine = parts[1] || "";
  let hashtags = hashtagLine.match(/#[\wÀ-ɏà-ÿ]+/g) || [];
  if (hashtags.length === 0) {
    hashtags = caption.match(/#[\wÀ-ɏà-ÿ]+/g) || [];
    if (hashtags.length > 0) caption = caption.replace(/#[\wÀ-ɏà-ÿ]+/g, "").trim();
  }
  const fullCaption = hashtags.length
    ? `${caption}\n\n${hashtags.join(" ")}`
    : caption;
  return { caption: fullCaption.slice(0, 2200), hashtags };
}

export async function generateInstagramCaption(
  userId: string,
  brandId: string | null,
  input: { brief: string; tone?: string; objective?: string },
) {
  const brief = String(input.brief || "").trim();
  const prompt = [
    "Gere uma legenda profissional e envolvente para um post no Instagram.",
    "A legenda deve ter no maximo 2000 caracteres.",
    "Inclua uma chamada para acao sutil.",
    "Ao final, sugira de 5 a 10 hashtags relevantes em portugues, separadas por espaco.",
    "Formato da resposta: primeiro a legenda, depois uma linha em branco, depois as hashtags.",
    `Contexto: ${brief}`,
    input.tone ? `Tom de voz: ${input.tone}` : "",
    input.objective ? `Objetivo: ${input.objective}` : "",
  ].filter(Boolean).join("\n");

  const result = await creativeStudio.generateText(userId, {
    prompt,
    tone: input.tone || undefined,
    objective: input.objective || undefined,
    maxCharacters: 2200,
  }, brandId || undefined);

  return parseInstagramCaption(String(result?.text || brief));
}

async function resolveInstagramMediaUrl(
  userId: string,
  brandId: string,
  brief: string,
): Promise<{ url: string; source: InstagramPostDraft["imageSource"] }> {
  try {
    const { items } = await galleryService.listItems(userId, brandId, { limit: 24, page: 1 });
    const image = (items || []).find((i) => i.type === "image" && (i.url || i.thumbnailUrl));
    if (image?.url) return { url: image.url, source: "gallery" };
  } catch { /* fallback to AI */ }

  try {
    const gen = await creativeStudio.generateImage(userId, {
      prompt: `Post Instagram comercial, estética profissional para redes sociais: ${brief}`,
      format: "square",
      style: "fotografia de produto/serviço, luz natural, cores vibrantes",
    }, brandId);
    if (gen?.imageUrl) return { url: gen.imageUrl, source: "ai" };
  } catch { /* no image */ }

  return { url: "", source: "none" };
}

export async function generateInstagramPostFromBrief(
  userId: string,
  brandId: string | null,
  input: { brief?: string; tone?: string; objective?: string },
): Promise<InstagramPostDraft | { error: string }> {
  const brief = String(input.brief || "").trim();
  if (!brief) return { error: "Descreva o tema do post." };
  if (!brandId) return { error: "Selecione uma marca." };

  const profile = await instagramService.getProfile(brandId);
  if (!profile?.is_connected) {
    return { error: "Instagram não conectado. Conecte sua conta Business primeiro." };
  }

  const { caption } = await generateInstagramCaption(userId, brandId, {
    brief,
    tone: input.tone,
    objective: input.objective,
  });

  const media = await resolveInstagramMediaUrl(userId, brandId, brief);
  if (!media.url) {
    return { error: "Não encontrei imagem na galeria e a geração com IA falhou. Envie uma mídia na Galeria e tente de novo." };
  }

  const post = await instagramService.createPost(brandId, {
    media_type: "IMAGE",
    media_url: media.url,
    thumbnail_url: media.url,
    caption,
    status: "draft",
  });

  return {
    postId: post.id,
    caption,
    mediaUrl: media.url,
    brief,
    imageSource: media.source,
  };
}
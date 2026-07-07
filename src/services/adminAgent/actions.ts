import { CustomersService } from "../customers";
import { ClientsService } from "../clients";
import { InventoryService } from "../inventory";
import { galleryService } from "../gallery";
import { aiRouter } from "../aiRouter";
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

export async function fetchRecentOrders(
  userId: string,
  brandId: string | null,
  opts?: { search?: string; status?: string; limit?: number },
) {
  const limit = opts?.limit || 12;
  const params: any[] = [userId];
  let where = "user_id = ?";
  if (brandId) {
    where += " AND brand_id = ?";
    params.push(brandId);
  }
  if (opts?.status) {
    where += " AND LOWER(COALESCE(business_status, status_pedido, '')) = ?";
    params.push(String(opts.status).toLowerCase());
  }
  if (opts?.search?.trim()) {
    where += " AND (customer_name ILIKE ? OR CAST(order_number AS TEXT) ILIKE ?)";
    const q = `%${opts.search.trim()}%`;
    params.push(q, q);
  }
  params.push(limit);

  const rows = await query<any>(
    `SELECT id, order_number, customer_name, customer_phone, valor_total,
            COALESCE(business_status, status_pedido, 'novo') AS status,
            forma_pagamento, channel, origem, created_at
     FROM orders WHERE ${where}
     ORDER BY created_at DESC LIMIT ?`,
    params,
  );

  const countParams = params.slice(0, -1);
  const totalRow = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM orders WHERE ${where}`,
    countParams,
  );

  return {
    total: Number(totalRow?.n ?? rows.length),
    rows: (rows || []).map((o: any) => {
      const st = String(o.status || "novo").toLowerCase();
      return {
        id: o.id,
        name: o.customer_name || "Cliente",
        order_number: o.order_number || String(o.id || "").slice(0, 8),
        phone: o.customer_phone || "",
        total: Number(o.valor_total || 0),
        status: ORDER_STATUS_LABEL[st] || st,
        payment: String(o.forma_pagamento || "").toUpperCase() || "—",
        channel: o.channel || o.origem || "",
        created_at: o.created_at || "",
      };
    }),
  };
}

export async function fetchOrderStats(userId: string, brandId: string | null) {
  try {
    const params: any[] = [userId];
    let where = "user_id = ?";
    if (brandId) {
      where += " AND brand_id = ?";
      params.push(brandId);
    }
    const row = await queryOne<{
      total: number
      pending_count: number
      paid_count: number
      revenue_total: number
    }>(
      `SELECT COUNT(*)::int AS total,
        SUM(CASE WHEN LOWER(COALESCE(business_status, status_pedido, '')) IN ('novo', 'aguardando_pagamento') THEN 1 ELSE 0 END)::int AS pending_count,
        SUM(CASE WHEN LOWER(COALESCE(business_status, status_pedido, '')) IN ('pago', 'em_preparacao', 'em_entrega', 'entregue') THEN 1 ELSE 0 END)::int AS paid_count,
        COALESCE(SUM(valor_total), 0)::float AS revenue_total
       FROM orders WHERE ${where}`,
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
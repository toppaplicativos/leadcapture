import { CustomersService } from "../customers";
import { InventoryService } from "../inventory";
import { galleryService } from "../gallery";
import { query } from "../../config/database";

const customersService = new CustomersService();
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
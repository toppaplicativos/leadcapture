import { query, queryOne, insert, update } from "../config/database";
import { KnowledgeBase, KnowledgeBaseCreateDTO } from "../types";
import { logger } from "../utils/logger";

export class KnowledgeBaseService {
  async create(userId: string, dto: KnowledgeBaseCreateDTO): Promise<KnowledgeBase> {
    const id = await insert(
      `INSERT INTO knowledge_base (user_id, company_id, title, content, category, tags, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, dto.company_id || null, dto.title, dto.content,
        dto.category || null, dto.tags || null, dto.active !== false,
      ]
    );
    logger.info(`Knowledge base entry created: ${dto.title} (ID: ${id})`);
    return (await this.getById(id, userId))!;
  }

  async getById(id: number, userId: string): Promise<KnowledgeBase | null> {
    return queryOne<KnowledgeBase>("SELECT * FROM knowledge_base WHERE id = ? AND user_id = ?", [id, userId]);
  }

  async getAll(filters?: {
    category?: string;
    search?: string;
    active?: boolean;
    company_id?: string;
    user_id?: string;
  }): Promise<KnowledgeBase[]> {
    let where = "WHERE 1=1";
    const params: any[] = [];

    if (filters?.user_id) { where += " AND user_id = ?"; params.push(filters.user_id); }
    if (filters?.category) { where += " AND category = ?"; params.push(filters.category); }
    if (filters?.active !== undefined) { where += " AND active = ?"; params.push(filters.active); }
    if (filters?.company_id) { where += " AND company_id = ?"; params.push(filters.company_id); }
    if (filters?.search) {
      where += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    return query<KnowledgeBase[]>(
      `SELECT * FROM knowledge_base ${where} ORDER BY created_at DESC`, params
    );
  }

  async update(id: number, userId: string, data: Partial<KnowledgeBaseCreateDTO>): Promise<KnowledgeBase | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) { fields.push("title = ?"); values.push(data.title); }
    if (data.content !== undefined) { fields.push("content = ?"); values.push(data.content); }
    if (data.category !== undefined) { fields.push("category = ?"); values.push(data.category); }
    if (data.tags !== undefined) { fields.push("tags = ?"); values.push(data.tags); }
    if (data.active !== undefined) { fields.push("active = ?"); values.push(data.active); }

    if (fields.length === 0) return this.getById(id, userId);

    values.push(id, userId);
    await update(`UPDATE knowledge_base SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values);
    logger.info(`Knowledge base updated: ID ${id}`);
    return this.getById(id, userId);
  }

  async delete(id: number, userId: string): Promise<boolean> {
    const affected = await update("DELETE FROM knowledge_base WHERE id = ? AND user_id = ?", [id, userId]);
    return affected > 0;
  }

  // Search knowledge base for AI context (used by Gemini for message generation)
  async searchForContext(searchQuery: string, userId: string, companyId?: string): Promise<string> {
    let where = "WHERE active = true";
    const params: any[] = [];

    where += " AND user_id = ?";
    params.push(userId);

    if (companyId) { where += " AND company_id = ?"; params.push(companyId); }

    where += " AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)";
    const s = `%${searchQuery}%`;
    params.push(s, s, s);

    const entries = await query<KnowledgeBase[]>(
      `SELECT title, content FROM knowledge_base ${where} LIMIT 5`, params
    );

    if (entries.length === 0) return "";

    return entries.map(e => `## ${e.title}\n${e.content}`).join("\n\n---\n\n");
  }
}


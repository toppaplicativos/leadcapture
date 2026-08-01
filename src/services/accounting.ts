import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";

let schemaReady: Promise<void> | null = null;

const BASE_CATEGORIES = {
  income: ["Vendas", "Serviços", "Recebimentos", "Rendimentos", "Reembolsos recebidos", "Outras entradas"],
  expense: ["Fornecedores", "Matéria-prima", "Folha e salários", "Encargos e benefícios", "Impostos e taxas", "Aluguel e estrutura", "Marketing e vendas", "Frete e logística", "Tecnologia e assinaturas", "Manutenção", "Reembolsos", "Outras saídas"],
} as const;

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS accounting_categories (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, name VARCHAR(120) NOT NULL,
      kind VARCHAR(12) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(brand_id, name, kind)
    )`);
    await query(`ALTER TABLE accounting_categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE accounting_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
    await query(`CREATE TABLE IF NOT EXISTS accounting_transactions (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, kind VARCHAR(12) NOT NULL,
      description VARCHAR(240) NOT NULL, category VARCHAR(120) NOT NULL, amount DECIMAL(14,2) NOT NULL,
      occurred_on DATE NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'paid',
      payment_method VARCHAR(40), document_number VARCHAR(80), notes TEXT,
      created_by VARCHAR(36), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_tx_brand_date
      ON accounting_transactions(brand_id, occurred_on DESC)`);
    await query(`ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS category_id VARCHAR(36)`);
    await query(`ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS source_type VARCHAR(40)`);
    await query(`ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS source_id VARCHAR(120)`);
    await query(`ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS source_label VARCHAR(180)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tx_source
      ON accounting_transactions(brand_id, source_type, source_id)`);
    await query(`CREATE TABLE IF NOT EXISTS accounting_employees (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, name VARCHAR(160) NOT NULL,
      email VARCHAR(180), phone VARCHAR(40), document_number VARCHAR(40), role_title VARCHAR(120),
      department VARCHAR(120), employment_type VARCHAR(30) NOT NULL DEFAULT 'clt',
      admission_date DATE, salary DECIMAL(14,2), status VARCHAR(20) NOT NULL DEFAULT 'active',
      notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounting_employee_brand
      ON accounting_employees(brand_id, status, name)`);
    await query(`ALTER TABLE accounting_employees ADD COLUMN IF NOT EXISTS photo_url TEXT`);
    await query(`ALTER TABLE accounting_employees ADD COLUMN IF NOT EXISTS profile_data JSON`);
    await query(`CREATE TABLE IF NOT EXISTS accounting_recurring_expenses (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, source_type VARCHAR(40) NOT NULL,
      source_id VARCHAR(36) NOT NULL, description VARCHAR(240) NOT NULL, amount DECIMAL(14,2) NOT NULL,
      frequency VARCHAR(20) NOT NULL DEFAULT 'monthly', category VARCHAR(120) NOT NULL,
      starts_on DATE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(brand_id, source_type, source_id)
    )`);
    await query(`ALTER TABLE accounting_recurring_expenses ADD COLUMN IF NOT EXISTS due_day INTEGER`);
    await query(`ALTER TABLE accounting_recurring_expenses ADD COLUMN IF NOT EXISTS expense_type VARCHAR(20) NOT NULL DEFAULT 'fixed'`);
    await query(`ALTER TABLE accounting_recurring_expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40)`);
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

async function seedCategories(brandId: string) {
  const seeds = (["income", "expense"] as const).flatMap(kind =>
    BASE_CATEGORIES[kind].map(name => ({ kind, name })));
  await Promise.all(seeds.map(({ kind, name }) =>
    query(`INSERT INTO accounting_categories (id,brand_id,name,kind,is_system,is_active)
      VALUES (?,?,?,?,TRUE,TRUE) ON CONFLICT (brand_id,name,kind) DO NOTHING`,
    [randomUUID(), brandId, name, kind])));
}

function rangeWhere(brandId: string, from?: string, to?: string) {
  const conditions = ["brand_id = ?"];
  const params: any[] = [brandId];
  if (from) { conditions.push("occurred_on >= ?"); params.push(from); }
  if (to) { conditions.push("occurred_on <= ?"); params.push(to); }
  return { sql: conditions.join(" AND "), params };
}

export const accountingService = {
  async listCategories(brandId: string) {
    await ensureSchema();
    await seedCategories(brandId);
    return query<any[]>(`SELECT * FROM accounting_categories WHERE brand_id=?
      ORDER BY kind DESC, is_system DESC, name`, [brandId]);
  },

  async createCategory(brandId: string, body: any) {
    await ensureSchema();
    await seedCategories(brandId);
    const name = String(body.name || "").trim();
    const kind = String(body.kind || "");
    if (!name || !["income", "expense"].includes(kind)) throw new Error("Nome e tipo da categoria são obrigatórios.");
    const existing = await queryOne<any>(`SELECT * FROM accounting_categories
      WHERE brand_id=? AND LOWER(name)=LOWER(?) AND kind=?`, [brandId, name, kind]);
    if (existing) {
      if (!existing.is_active) await query(`UPDATE accounting_categories SET is_active=TRUE WHERE id=?`, [existing.id]);
      return { ...(existing || {}), is_active: true };
    }
    const id = randomUUID();
    await query(`INSERT INTO accounting_categories (id,brand_id,name,kind,is_system,is_active)
      VALUES (?,?,?,?,FALSE,TRUE)`, [id, brandId, name, kind]);
    return queryOne<any>("SELECT * FROM accounting_categories WHERE id=?", [id]);
  },

  async setCategoryActive(brandId: string, id: string, isActive: boolean) {
    await ensureSchema();
    await query(`UPDATE accounting_categories SET is_active=? WHERE id=? AND brand_id=?`,
      [isActive, id, brandId]);
    return queryOne<any>("SELECT * FROM accounting_categories WHERE id=? AND brand_id=?", [id, brandId]);
  },

  async dashboard(brandId: string, from?: string, to?: string) {
    await ensureSchema();
    const where = rangeWhere(brandId, from, to);
    const totals = await queryOne<any>(`SELECT
      COALESCE(SUM(CASE WHEN kind='income' AND status='paid' THEN amount ELSE 0 END),0) income,
      COALESCE(SUM(CASE WHEN kind='expense' AND status='paid' THEN amount ELSE 0 END),0) expense,
      COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,
      COUNT(*) transaction_count FROM accounting_transactions WHERE ${where.sql} AND is_deleted=FALSE`, where.params);
    const employees = await queryOne<any>(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) active,
      COALESCE(SUM(CASE WHEN status='active' THEN salary ELSE 0 END),0) payroll
      FROM accounting_employees WHERE brand_id = ?`, [brandId]);
    const monthly = await query<any[]>(`SELECT TO_CHAR(occurred_on, 'YYYY-MM') AS "month",
      COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) income,
      COALESCE(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) expense
      FROM accounting_transactions WHERE ${where.sql} AND is_deleted=FALSE
      GROUP BY TO_CHAR(occurred_on, 'YYYY-MM') ORDER BY month`, where.params);
    const income = Number(totals?.income || 0), expense = Number(totals?.expense || 0);
    return { income, expense, balance: income - expense, pending: Number(totals?.pending || 0),
      transaction_count: Number(totals?.transaction_count || 0), employees: {
        total: Number(employees?.total || 0), active: Number(employees?.active || 0),
        payroll: Number(employees?.payroll || 0),
      }, monthly };
  },

  async listTransactions(brandId: string, from?: string, to?: string) {
    await ensureSchema();
    const where = rangeWhere(brandId, from, to);
    return query<any[]>(`SELECT * FROM accounting_transactions WHERE ${where.sql} AND is_deleted=FALSE
      ORDER BY occurred_on DESC, created_at DESC`, where.params);
  },

  async listRecurringExpenses(brandId: string) {
    await ensureSchema();
    return query<any[]>(`SELECT r.*, e.name employee_name, e.photo_url employee_photo,
      e.role_title employee_role
      FROM accounting_recurring_expenses r
      LEFT JOIN accounting_employees e ON r.source_type='employee' AND e.id=r.source_id
      WHERE r.brand_id=? ORDER BY r.is_active DESC, r.description`, [brandId]);
  },

  async payRecurringExpense(brandId: string, id: string, body: any, userId?: string) {
    await ensureSchema();
    await seedCategories(brandId);
    const recurring = await queryOne<any>(`SELECT * FROM accounting_recurring_expenses
      WHERE id=? AND brand_id=? AND is_active=TRUE`, [id, brandId]);
    if (!recurring) throw new Error("Despesa recorrente não encontrada ou inativa.");
    const competence = String(body.competence || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência inválida.");
    const sourceId = `${id}:${competence}`;
    const existing = await queryOne<any>(`SELECT * FROM accounting_transactions
      WHERE brand_id=? AND source_type='recurring_payment' AND source_id=? AND is_deleted=FALSE`, [brandId, sourceId]);
    if (existing) return existing;
    const category = await queryOne<any>(`SELECT * FROM accounting_categories
      WHERE brand_id=? AND kind='expense' AND name=?`, [brandId, recurring.category]);
    const transactionId = randomUUID();
    await query(`INSERT INTO accounting_transactions
      (id,brand_id,kind,description,category,category_id,amount,occurred_on,status,payment_method,
       document_number,notes,created_by,source_type,source_id,source_label)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [transactionId, brandId, "expense", recurring.description, recurring.category, category?.id || null,
      Number(body.amount || recurring.amount), body.paid_on || new Date().toISOString().slice(0, 10), "paid",
      body.payment_method || recurring.payment_method || null, body.document_number || null,
      body.notes || `Pagamento da competência ${competence}`, userId || null, "recurring_payment",
      sourceId, `Competência ${competence}`]);
    return queryOne<any>("SELECT * FROM accounting_transactions WHERE id=?", [transactionId]);
  },

  async saveTransaction(brandId: string, body: any, userId?: string, id?: string) {
    await ensureSchema();
    await seedCategories(brandId);
    const category = body.category_id
      ? await queryOne<any>(`SELECT * FROM accounting_categories
          WHERE id=? AND brand_id=? AND kind=? AND is_active=TRUE`, [body.category_id, brandId, body.kind])
      : await queryOne<any>(`SELECT * FROM accounting_categories
          WHERE brand_id=? AND kind=? AND LOWER(name)=LOWER(?) AND is_active=TRUE`,
        [brandId, body.kind, String(body.category || "")]);
    if (!category) throw new Error("Selecione uma categoria válida para este tipo de lançamento.");
    if (id) {
      await query(`UPDATE accounting_transactions SET kind=?, description=?, category=?, category_id=?, amount=?,
        occurred_on=?, status=?, payment_method=?, document_number=?, notes=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND brand_id=? AND source_type IS NULL`, [body.kind, body.description, category.name, category.id, body.amount,
        body.occurred_on, body.status, body.payment_method || null, body.document_number || null,
        body.notes || null, id, brandId]);
      return queryOne<any>("SELECT * FROM accounting_transactions WHERE id=? AND brand_id=?", [id, brandId]);
    }
    const newId = randomUUID();
    await query(`INSERT INTO accounting_transactions
      (id,brand_id,kind,description,category,category_id,amount,occurred_on,status,payment_method,document_number,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [newId, brandId, body.kind, body.description, category.name, category.id,
      body.amount, body.occurred_on, body.status, body.payment_method || null,
      body.document_number || null, body.notes || null, userId || null]);
    return queryOne<any>("SELECT * FROM accounting_transactions WHERE id=?", [newId]);
  },

  async deleteTransaction(brandId: string, id: string) {
    await ensureSchema();
    await query(`UPDATE accounting_transactions SET is_deleted=TRUE,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND brand_id=? AND source_type IS NULL`, [id, brandId]);
  },

  async syncPaidOrders(brandId: string, userId?: string) {
    await ensureSchema();
    await seedCategories(brandId);
    const sales = await queryOne<any>(`SELECT id FROM accounting_categories
      WHERE brand_id=? AND kind='income' AND name='Vendas'`, [brandId]);
    let orders: any[] = [];
    try {
      orders = await query<any[]>(`SELECT id,valor_total,forma_pagamento,data_pagamento,data_criacao,
        customer_name FROM commerce_orders WHERE brand_id=? AND status_pedido='pago'`, [brandId]);
    } catch (error: any) {
      if (/commerce_orders|does not exist/i.test(String(error?.message || ""))) return { imported: 0, existing: 0, available: false };
      throw error;
    }
    let imported = 0;
    for (const order of orders) {
      const id = randomUUID();
      const occurred = order.data_pagamento || order.data_criacao || new Date();
      const result: any = await query(`INSERT INTO accounting_transactions
        (id,brand_id,kind,description,category,category_id,amount,occurred_on,status,payment_method,
         document_number,notes,created_by,source_type,source_id,source_label)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (brand_id,source_type,source_id) DO NOTHING`,
      [id, brandId, "income", `Venda${order.customer_name ? ` — ${order.customer_name}` : ""}`,
        "Vendas", sales?.id || null, Number(order.valor_total || 0), occurred, "paid",
        order.forma_pagamento || null, order.id, "Importado automaticamente dos pedidos",
        userId || null, "commerce_order", order.id, `Pedido ${String(order.id).slice(0, 8)}`]);
      if (Number(result?.affectedRows || result?.rowCount || 0) > 0) imported++;
    }
    return { imported, existing: Math.max(0, orders.length - imported), available: true, total: orders.length };
  },

  async listEmployees(brandId: string) {
    await ensureSchema();
    return query<any[]>("SELECT * FROM accounting_employees WHERE brand_id=? ORDER BY status, name", [brandId]);
  },

  async getEmployeeDetail(brandId: string, id: string) {
    await ensureSchema();
    const [employee, recurringExpense] = await Promise.all([
      queryOne<any>("SELECT * FROM accounting_employees WHERE id=? AND brand_id=?", [id, brandId]),
      queryOne<any>(`SELECT * FROM accounting_recurring_expenses
        WHERE brand_id=? AND source_type='employee' AND source_id=?`, [brandId, id]),
    ]);
    return { employee, recurring_expense: recurringExpense || null };
  },

  async saveEmployee(brandId: string, body: any, id?: string) {
    await ensureSchema();
    const values = [body.name, body.email || null, body.phone || null, body.document_number || null,
      body.role_title || null, body.department || null, body.employment_type || "clt",
      body.admission_date || null, body.salary || null, body.status || "active", body.notes || null,
      body.photo_url || null, JSON.stringify(body.profile_data || {})];
    let employeeId = id;
    if (id) {
      await query(`UPDATE accounting_employees SET name=?,email=?,phone=?,document_number=?,role_title=?,
        department=?,employment_type=?,admission_date=?,salary=?,status=?,notes=?,photo_url=?,profile_data=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND brand_id=?`, [...values, id, brandId]);
    } else {
      employeeId = randomUUID();
      await query(`INSERT INTO accounting_employees
        (id,brand_id,name,email,phone,document_number,role_title,department,employment_type,admission_date,salary,status,notes,photo_url,profile_data)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [employeeId, brandId, ...values]);
    }
    const salary = Number(body.salary || 0);
    const active = String(body.status || "active") === "active" && salary > 0;
    await query(`INSERT INTO accounting_recurring_expenses
      (id,brand_id,source_type,source_id,description,amount,frequency,category,starts_on,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (brand_id,source_type,source_id) DO UPDATE SET
        description=EXCLUDED.description,amount=EXCLUDED.amount,starts_on=EXCLUDED.starts_on,
        is_active=EXCLUDED.is_active,updated_at=CURRENT_TIMESTAMP`,
      [randomUUID(), brandId, "employee", employeeId, `Folha fixa · ${body.name}`, salary, "monthly",
       "Folha e salários", body.admission_date || null, active]);
    return queryOne<any>("SELECT * FROM accounting_employees WHERE id=? AND brand_id=?", [employeeId, brandId]);
  },

  async deleteEmployee(brandId: string, id: string) {
    await ensureSchema();
    await query(`UPDATE accounting_employees SET status='inactive',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND brand_id=?`, [id, brandId]);
    await query(`UPDATE accounting_recurring_expenses SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP
      WHERE brand_id=? AND source_type='employee' AND source_id=?`, [brandId, id]);
  },
};

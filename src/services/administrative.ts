import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { permissionsService } from "./permissions";

let schemaReady: Promise<void> | null = null;

export async function ensureAdministrativeSchema(): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS administrative_departments (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, name VARCHAR(140) NOT NULL,
      code VARCHAR(40), manager_employee_id VARCHAR(36), cost_center_code VARCHAR(60),
      is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(brand_id, name)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS administrative_approvals (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, resource_type VARCHAR(40) NOT NULL,
      resource_id VARCHAR(36) NOT NULL, title VARCHAR(220) NOT NULL, description TEXT,
      amount DECIMAL(14,2), requested_by VARCHAR(36), assigned_to VARCHAR(36),
      status VARCHAR(20) NOT NULL DEFAULT 'pending', decision_note TEXT, decided_by VARCHAR(36),
      decided_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_administrative_approval_brand
      ON administrative_approvals(brand_id, status, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS administrative_audit_log (
      id VARCHAR(36) PRIMARY KEY, brand_id VARCHAR(36) NOT NULL, actor_user_id VARCHAR(36),
      action VARCHAR(100) NOT NULL, resource_type VARCHAR(60) NOT NULL, resource_id VARCHAR(36),
      summary VARCHAR(280) NOT NULL, metadata_json TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_administrative_audit_brand
      ON administrative_audit_log(brand_id, created_at DESC)`);
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export async function recordAdministrativeAudit(input: {
  brandId: string; actorUserId?: string | null; action: string; resourceType: string;
  resourceId?: string | null; summary: string; metadata?: Record<string, unknown>;
}) {
  await ensureAdministrativeSchema();
  await query(`INSERT INTO administrative_audit_log
    (id,brand_id,actor_user_id,action,resource_type,resource_id,summary,metadata_json)
    VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), input.brandId, input.actorUserId || null,
    input.action, input.resourceType, input.resourceId || null, input.summary,
    input.metadata ? JSON.stringify(input.metadata) : null]);
}

export const administrativeService = {
  async bootstrap(brandId: string, userId: string) {
    await ensureAdministrativeSchema();
    const [brand, permissions, pending, departments] = await Promise.all([
      queryOne<any>("SELECT id,name,slug,logo_url,primary_color,secondary_color FROM brand_units WHERE id=?", [brandId]),
      permissionsService.isBrandOwner(userId, brandId).then(async owner =>
        owner ? ["*"] : Array.from(await permissionsService.getUserEffectivePermissions(userId, brandId))),
      queryOne<any>(`SELECT COUNT(*) total, COALESCE(SUM(amount),0) amount
        FROM administrative_approvals WHERE brand_id=? AND status='pending'`, [brandId]),
      queryOne<any>(`SELECT COUNT(*) total FROM administrative_departments
        WHERE brand_id=? AND is_active=TRUE`, [brandId]),
    ]);
    return { brand, permissions, pending_approvals: Number(pending?.total || 0),
      pending_amount: Number(pending?.amount || 0), active_departments: Number(departments?.total || 0) };
  },

  async listDepartments(brandId: string) {
    await ensureAdministrativeSchema();
    return query<any[]>(`SELECT d.*, e.name manager_name,
      (SELECT COUNT(*) FROM accounting_employees ae WHERE ae.brand_id=d.brand_id
       AND ae.department=d.name AND ae.status='active') employee_count
      FROM administrative_departments d LEFT JOIN accounting_employees e ON e.id=d.manager_employee_id
      WHERE d.brand_id=? ORDER BY d.is_active DESC,d.name`, [brandId]);
  },

  async saveDepartment(brandId: string, body: any, id?: string) {
    await ensureAdministrativeSchema();
    if (id) {
      await query(`UPDATE administrative_departments SET name=?,code=?,manager_employee_id=?,
        cost_center_code=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND brand_id=?`,
        [body.name, body.code || null, body.manager_employee_id || null, body.cost_center_code || null,
          body.is_active !== false, id, brandId]);
      return queryOne<any>("SELECT * FROM administrative_departments WHERE id=? AND brand_id=?", [id, brandId]);
    }
    const newId = randomUUID();
    await query(`INSERT INTO administrative_departments
      (id,brand_id,name,code,manager_employee_id,cost_center_code,is_active) VALUES (?,?,?,?,?,?,?)`,
      [newId, brandId, body.name, body.code || null, body.manager_employee_id || null,
        body.cost_center_code || null, body.is_active !== false]);
    return queryOne<any>("SELECT * FROM administrative_departments WHERE id=?", [newId]);
  },

  async listApprovals(brandId: string, status?: string) {
    await ensureAdministrativeSchema();
    const params:any[] = [brandId]; let extra = "";
    if (status) { extra = " AND a.status=?"; params.push(status); }
    return query<any[]>(`SELECT a.*, ru.name requested_by_name, du.name decided_by_name
      FROM administrative_approvals a
      LEFT JOIN users ru ON ru.id=a.requested_by LEFT JOIN users du ON du.id=a.decided_by
      WHERE a.brand_id=?${extra} ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.created_at DESC`, params);
  },

  async requestApproval(brandId: string, body: any, userId: string) {
    await ensureAdministrativeSchema();
    const id = randomUUID();
    await query(`INSERT INTO administrative_approvals
      (id,brand_id,resource_type,resource_id,title,description,amount,requested_by,assigned_to,status)
      VALUES (?,?,?,?,?,?,?,?,?,'pending')`, [id,brandId,body.resource_type,body.resource_id,
      body.title,body.description || null,body.amount || null,userId,body.assigned_to || null]);
    return queryOne<any>("SELECT * FROM administrative_approvals WHERE id=?", [id]);
  },

  async decideApproval(brandId: string, id: string, decision: "approved"|"rejected", note: string, userId: string) {
    await ensureAdministrativeSchema();
    const current = await queryOne<any>("SELECT * FROM administrative_approvals WHERE id=? AND brand_id=?", [id,brandId]);
    if (!current) throw new Error("Solicitação não encontrada");
    if (current.status !== "pending") throw new Error("Esta solicitação já foi decidida");
    await query(`UPDATE administrative_approvals SET status=?,decision_note=?,decided_by=?,
      decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND brand_id=?`,
      [decision,note || null,userId,id,brandId]);
    return queryOne<any>("SELECT * FROM administrative_approvals WHERE id=?", [id]);
  },

  async listAudit(brandId: string, limit = 100, resourceType?: string, resourceId?: string) {
    await ensureAdministrativeSchema();
    const filters = ["l.brand_id=?"];
    const params: any[] = [brandId];
    if (resourceType) { filters.push("l.resource_type=?"); params.push(resourceType); }
    if (resourceId) { filters.push("l.resource_id=?"); params.push(resourceId); }
    params.push(Math.min(Math.max(limit,1),250));
    return query<any[]>(`SELECT l.*,u.name actor_name,u.email actor_email
      FROM administrative_audit_log l LEFT JOIN users u ON u.id=l.actor_user_id
      WHERE ${filters.join(" AND ")} ORDER BY l.created_at DESC LIMIT ?`, params);
  },
};

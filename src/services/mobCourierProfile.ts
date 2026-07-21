/**
 * Lead Capture Mob — courier personal profile, documents and onboarding gates.
 * Separate from fleet (vehicles) domain.
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import type { CourierCadastroStatus, MobCourier } from "./mobLogistics";
import { mobLogisticsService } from "./mobLogistics";

export type CourierDocStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "needs_resubmit";

export type CourierDocType =
  | "cnh"
  | "cnh_photo"
  | "rg_front"
  | "rg_back"
  | "selfie"
  | "proof_address"
  | "criminal_record"
  | "other";

export type MobCourierDocument = {
  id: string;
  courier_id: string;
  doc_type: string;
  doc_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  file_url: string | null;
  status: CourierDocStatus;
  rejection_reason: string | null;
  validated_by: string | null;
  validated_at: string | null;
  created_at?: string;
  updated_at?: string;
};

const SENSITIVE_PROFILE_FIELDS = ["full_name", "cpf", "birth_date"] as const;

const PROFILE_EDITABLE_ALWAYS = [
  "phone",
  "whatsapp",
  "photo_url",
  "pix_key",
  "address_json",
  "emergency_contact_json",
] as const;

const RESUBMIT_DOC_STATUSES: CourierDocStatus[] = [
  "pending",
  "rejected",
  "needs_resubmit",
  "expired",
];

function mapDoc(row: any): MobCourierDocument {
  return {
    id: String(row.id),
    courier_id: String(row.courier_id),
    doc_type: String(row.doc_type || "other"),
    doc_number: row.doc_number || null,
    issued_at: row.issued_at || null,
    expires_at: row.expires_at || null,
    file_url: row.file_url || null,
    status: (row.status || "pending") as CourierDocStatus,
    rejection_reason: row.rejection_reason || null,
    validated_by: row.validated_by || null,
    validated_at: row.validated_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

let schemaReady = false;

export async function ensureCourierProfileSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS mob_courier_documents (
      id VARCHAR(36) PRIMARY KEY,
      courier_id VARCHAR(36) NOT NULL,
      doc_type VARCHAR(40) NOT NULL,
      doc_number VARCHAR(80) NULL,
      issued_at DATE NULL,
      expires_at DATE NULL,
      file_url TEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      rejection_reason TEXT NULL,
      validated_by VARCHAR(36) NULL,
      validated_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_mob_cdocs_courier ON mob_courier_documents (courier_id)`
  ).catch(() => undefined);
  // review notes on courier
  await query(
    `ALTER TABLE mob_couriers ADD COLUMN IF NOT EXISTS review_notes TEXT NULL`
  ).catch(() => undefined);
  schemaReady = true;
}

function digitsOnly(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "");
}

function isProfileMinimumComplete(c: MobCourier): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!String(c.full_name || "").trim() || String(c.full_name).trim().length < 3) {
    missing.push("full_name");
  }
  if (digitsOnly(c.cpf).length < 11) missing.push("cpf");
  if (!String(c.phone || c.whatsapp || "").trim()) missing.push("phone");
  return { ok: missing.length === 0, missing };
}

export const mobCourierProfileService = {
  ensureSchema: ensureCourierProfileSchema,

  async listDocuments(courierId: string): Promise<MobCourierDocument[]> {
    await ensureCourierProfileSchema();
    const rows =
      (await query<any[]>(
        `SELECT * FROM mob_courier_documents
         WHERE courier_id = ?
         ORDER BY created_at DESC`,
        [courierId]
      )) || [];
    return rows.map(mapDoc);
  },

  async addDocument(
    courierId: string,
    input: Partial<MobCourierDocument> & { doc_type: string }
  ): Promise<MobCourierDocument> {
    await ensureCourierProfileSchema();
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier) throw new Error("Entregador não encontrado");
    if (courier.cadastro_status === "blocked") throw new Error("Conta bloqueada");

    const id = randomUUID();
    let status: CourierDocStatus = (input.status as CourierDocStatus) || "pending";
    if (input.expires_at) {
      const exp = new Date(input.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) status = "expired";
    }

    await insert(
      `INSERT INTO mob_courier_documents (
        id, courier_id, doc_type, doc_number, issued_at, expires_at, file_url, status
      ) VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        courierId,
        String(input.doc_type).trim(),
        input.doc_number || null,
        input.issued_at || null,
        input.expires_at || null,
        input.file_url || null,
        status,
      ]
    );

    // If profile was approved and new doc arrives, mark awaiting review of docs
    if (courier.cadastro_status === "approved" && status === "pending") {
      await update(
        `UPDATE mob_couriers SET cadastro_status = 'awaiting_documents', updated_at = NOW() WHERE id = ?`,
        [courierId]
      ).catch(() => undefined);
    } else if (
      ["incomplete", "rejected"].includes(courier.cadastro_status) ||
      courier.cadastro_status === "awaiting_documents"
    ) {
      // keep / move to awaiting_documents after first doc
      if (courier.cadastro_status === "incomplete" || courier.cadastro_status === "rejected") {
        await update(
          `UPDATE mob_couriers SET cadastro_status = 'awaiting_documents', updated_at = NOW() WHERE id = ?`,
          [courierId]
        ).catch(() => undefined);
      }
    }

    const row = await queryOne<any>(`SELECT * FROM mob_courier_documents WHERE id = ?`, [id]);
    return mapDoc(row);
  },

  async resubmitDocument(
    courierId: string,
    docId: string,
    patch: Partial<MobCourierDocument>
  ): Promise<MobCourierDocument> {
    await ensureCourierProfileSchema();
    const doc = await queryOne<any>(
      `SELECT * FROM mob_courier_documents WHERE id = ? AND courier_id = ? LIMIT 1`,
      [docId, courierId]
    );
    if (!doc) throw new Error("Documento não encontrado");
    const current = mapDoc(doc);
    if (!RESUBMIT_DOC_STATUSES.includes(current.status) && current.status !== "approved") {
      throw new Error("Documento não pode ser alterado neste status");
    }
    // approved docs: only allow if admin set needs_resubmit
    if (current.status === "approved") {
      throw new Error("Documento aprovado — peça reenvio à loja se precisar atualizar");
    }

    const fields: string[] = [];
    const params: any[] = [];
    const set = (col: string, val: any) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };
    if (patch.doc_number !== undefined) set("doc_number", patch.doc_number || null);
    if (patch.issued_at !== undefined) set("issued_at", patch.issued_at || null);
    if (patch.expires_at !== undefined) set("expires_at", patch.expires_at || null);
    if (patch.file_url !== undefined) set("file_url", patch.file_url || null);
    if (patch.doc_type !== undefined) set("doc_type", String(patch.doc_type));

    set("status", "pending");
    set("rejection_reason", null);
    set("validated_by", null);
    set("validated_at", null);
    fields.push("updated_at = NOW()");
    params.push(docId);

    await update(
      `UPDATE mob_courier_documents SET ${fields.join(", ")} WHERE id = ?`,
      params
    );

    await update(
      `UPDATE mob_couriers
       SET cadastro_status = CASE
         WHEN cadastro_status IN ('approved','rejected','incomplete') THEN 'awaiting_documents'
         ELSE cadastro_status
       END,
       updated_at = NOW()
       WHERE id = ?`,
      [courierId]
    ).catch(() => undefined);

    const row = await queryOne<any>(`SELECT * FROM mob_courier_documents WHERE id = ?`, [docId]);
    return mapDoc(row);
  },

  async validateDocument(
    courierId: string,
    docId: string,
    input: {
      status: "approved" | "rejected" | "needs_resubmit";
      validated_by?: string;
      rejection_reason?: string;
    }
  ): Promise<MobCourierDocument> {
    await ensureCourierProfileSchema();
    const doc = await queryOne<any>(
      `SELECT * FROM mob_courier_documents WHERE id = ? AND courier_id = ? LIMIT 1`,
      [docId, courierId]
    );
    if (!doc) throw new Error("Documento não encontrado");

    await update(
      `UPDATE mob_courier_documents
       SET status = ?, validated_by = ?, validated_at = NOW(),
           rejection_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        input.status,
        input.validated_by || null,
        input.status === "approved" ? null : input.rejection_reason || "Reprovado",
        docId,
      ]
    );

    if (input.status === "rejected" || input.status === "needs_resubmit") {
      await update(
        `UPDATE mob_couriers SET cadastro_status = 'awaiting_documents', updated_at = NOW() WHERE id = ?`,
        [courierId]
      ).catch(() => undefined);
    }

    const row = await queryOne<any>(`SELECT * FROM mob_courier_documents WHERE id = ?`, [docId]);
    return mapDoc(row);
  },

  /**
   * Courier-facing profile update with field locks after approval.
   * Never accepts cadastro_status / ops_status from client.
   */
  async updateProfileSafe(
    courierId: string,
    patch: Record<string, any>
  ): Promise<MobCourier | null> {
    await ensureCourierProfileSchema();
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier) throw new Error("Entregador não encontrado");
    if (courier.cadastro_status === "blocked") throw new Error("Conta bloqueada");

    const safe: Record<string, any> = {};
    const locked = courier.cadastro_status === "approved";

    for (const k of PROFILE_EDITABLE_ALWAYS) {
      if (patch[k] !== undefined) safe[k] = patch[k];
    }

    for (const k of SENSITIVE_PROFILE_FIELDS) {
      if (patch[k] === undefined) continue;
      if (locked) {
        throw new Error(
          "Nome, CPF e data de nascimento não podem ser alterados após aprovação do cadastro"
        );
      }
      safe[k] = patch[k];
    }

    // Soft cache only — fleet is source of truth for vehicles
    if (patch.vehicle_json !== undefined && !locked) {
      safe.vehicle_json = patch.vehicle_json;
    }

    return mobLogisticsService.updateCourierProfile(courierId, safe);
  },

  async submitForReview(courierId: string): Promise<{
    courier: MobCourier;
    documents: MobCourierDocument[];
    missing: string[];
  }> {
    await ensureCourierProfileSchema();
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier) throw new Error("Entregador não encontrado");
    if (courier.cadastro_status === "blocked") throw new Error("Conta bloqueada");
    if (courier.cadastro_status === "suspended") throw new Error("Conta suspensa");

    const min = isProfileMinimumComplete(courier);
    const docs = await this.listDocuments(courierId);
    const missing = [...min.missing];

    // Recommend at least one identity doc (CNH or selfie or RG)
    const hasIdDoc = docs.some((d) =>
      ["cnh", "cnh_photo", "rg_front", "selfie"].includes(d.doc_type)
    );
    if (!hasIdDoc) missing.push("document_identity");

    if (missing.length) {
      throw new Error(
        `Complete o cadastro antes de enviar: ${missing.join(", ")}`
      );
    }

    await update(
      `UPDATE mob_couriers SET cadastro_status = 'under_review', review_notes = NULL, updated_at = NOW() WHERE id = ?`,
      [courierId]
    );
    // pending docs stay pending for admin
    const updated = (await mobLogisticsService.getCourierById(courierId))!;
    return { courier: updated, documents: docs, missing: [] };
  },

  async adminSetCadastro(
    courierId: string,
    action: "approve" | "reject" | "request_changes",
    opts?: { notes?: string; actorUserId?: string }
  ): Promise<MobCourier> {
    await ensureCourierProfileSchema();
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier) throw new Error("Entregador não encontrado");

    let status: CourierCadastroStatus = courier.cadastro_status;
    if (action === "approve") status = "approved";
    if (action === "reject") status = "rejected";
    if (action === "request_changes") status = "awaiting_documents";

    await update(
      `UPDATE mob_couriers
       SET cadastro_status = ?, review_notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, opts?.notes || null, courierId]
    );

    if (action === "request_changes" || action === "reject") {
      // mark pending approved docs? only pending stay; optional mark all non-approved as needs_resubmit
      if (action === "request_changes") {
        await update(
          `UPDATE mob_courier_documents
           SET status = 'needs_resubmit',
               rejection_reason = COALESCE(?, rejection_reason),
               updated_at = NOW()
           WHERE courier_id = ? AND status = 'pending'`,
          [opts?.notes || "Solicitada correção", courierId]
        ).catch(() => undefined);
      }
    }

    if (action === "approve") {
      // auto-approve pending personal docs if admin approved whole package
      await update(
        `UPDATE mob_courier_documents
         SET status = 'approved', validated_at = NOW(), validated_by = ?, updated_at = NOW()
         WHERE courier_id = ? AND status = 'pending'`,
        [opts?.actorUserId || null, courierId]
      ).catch(() => undefined);
    }

    const updated = await mobLogisticsService.getCourierById(courierId);
    if (!updated) throw new Error("Entregador não encontrado");
    return updated;
  },

  async getOnboardingState(courierId: string): Promise<{
    courier: MobCourier;
    documents: MobCourierDocument[];
    memberships: any[];
    vehicles: any[];
    profile_complete: boolean;
    profile_missing: string[];
    can_go_online: boolean;
    blockers: string[];
    sensitive_locked: boolean;
    review_notes: string | null;
  }> {
    await ensureCourierProfileSchema();
    const courier = await mobLogisticsService.getCourierById(courierId);
    if (!courier) throw new Error("Entregador não encontrado");

    const documents = await this.listDocuments(courierId);
    const memberships = await mobLogisticsService.listMembershipsForCourier(courierId);
    const approvedMemberships = (memberships || []).filter((m: any) => m.status === "approved");

    const { mobFleetService } = await import("./mobFleet");
    await mobFleetService.ensureSchema();
    const vehicles: any[] = [];
    // include pending memberships so courier can register vehicle before approval
    const orgs = (memberships || []).filter((m: any) =>
      ["pending", "approved"].includes(m.status)
    );
    for (const m of orgs) {
      const list = await mobFleetService.listVehicles(m.owner_user_id, m.brand_id, {
        courier_id: courierId,
      });
      for (const v of list) {
        const docs = await mobFleetService.listDocuments(m.owner_user_id, m.brand_id, v.id);
        vehicles.push({
          ...v,
          documents: docs,
          org_name: m.brand_name || m.operation_name || null,
          brand_id: m.brand_id,
          owner_user_id: m.owner_user_id,
          membership_id: m.id,
          membership_status: m.status,
        });
      }
    }

    const min = isProfileMinimumComplete(courier);
    const blockers: string[] = [];
    if (!min.ok) blockers.push("Complete os dados pessoais (nome, CPF e telefone)");
    if (["incomplete", "awaiting_documents", "rejected"].includes(courier.cadastro_status)) {
      blockers.push("Cadastro ainda não aprovado pela loja");
    }
    if (courier.cadastro_status === "under_review") {
      blockers.push("Cadastro em análise");
    }
    if (courier.cadastro_status === "suspended" || courier.cadastro_status === "blocked") {
      blockers.push("Conta suspensa ou bloqueada");
    }
    if (!approvedMemberships.length) {
      blockers.push("Nenhum vínculo aprovado com uma loja");
    }
    const readyVehicle = vehicles.some((v) =>
      ["available", "in_use"].includes(String(v.status))
    );
    if (!readyVehicle) {
      blockers.push("Cadastre e aguarde aprovação de um veículo");
    }

    const reviewNotes =
      (courier as any).review_notes != null
        ? String((courier as any).review_notes)
        : null;

    return {
      courier: { ...courier, review_notes: reviewNotes } as any,
      documents,
      memberships: memberships || [],
      vehicles,
      profile_complete: min.ok,
      profile_missing: min.missing,
      can_go_online: blockers.length === 0 && courier.cadastro_status === "approved",
      blockers,
      sensitive_locked: courier.cadastro_status === "approved",
      review_notes: reviewNotes,
    };
  },

  async assertCanGoOnline(courierId: string): Promise<void> {
    const state = await this.getOnboardingState(courierId);
    if (!state.can_go_online) {
      throw new Error(state.blockers[0] || "Cadastro incompleto para ficar online");
    }
  },
};

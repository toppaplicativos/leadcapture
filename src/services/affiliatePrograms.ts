import { randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { AffiliatesService } from "./affiliates";
import { normalizeCommissionMode } from "./affiliateCommission";

let programsSchemaReady = false;

export type ProgramStatus = "draft" | "active" | "inactive" | "closed";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type EnrollmentStatus = "onboarding" | "active" | "suspended" | "completed" | "revoked";
export type StepType =
  | "terms_accept"
  | "policy_accept"
  | "orientation"
  | "training"
  | "checklist"
  | "quiz"
  | "resource_unlock";
export type TrainingContentType = "text" | "video" | "pdf" | "quiz" | "checklist";
export type ProgressItemType = "step" | "training";
export type ProgressStatus = "pending" | "in_progress" | "completed";

const DEFAULT_ONBOARDING_STEPS: Array<{
  slug: string;
  title: string;
  step_type: StepType;
  description: string;
  sort_order: number;
}> = [
  {
    slug: "termos",
    title: "Aceite dos termos",
    step_type: "terms_accept",
    description: "Leia e aceite os termos específicos deste programa.",
    sort_order: 10,
  },
  {
    slug: "politicas",
    title: "Políticas e conduta",
    step_type: "policy_accept",
    description: "Confirme ciência sobre comissão, pagamento e uso de materiais.",
    sort_order: 20,
  },
  {
    slug: "orientacao",
    title: "Orientação inicial",
    step_type: "orientation",
    description: "Apresentação do programa e da oportunidade de ganho.",
    sort_order: 30,
  },
  {
    slug: "liberacao",
    title: "Liberação de recursos",
    step_type: "resource_unlock",
    description: "Após concluir as etapas, seu link e cupom exclusivos são liberados.",
    sort_order: 90,
  },
];

function slugify(input: string): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "programa";
}

async function ensureAffiliateProgramsSchema(): Promise<void> {
  if (programsSchemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_programs (
      id VARCHAR(36) PRIMARY KEY,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      slug VARCHAR(80) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      commission_mode VARCHAR(30) NOT NULL DEFAULT 'percentage',
      commission_value DECIMAL(12,4) NOT NULL DEFAULT 10.0000,
      commission_rules TEXT,
      eligibility_rules TEXT,
      terms_html TEXT,
      policies_html TEXT,
      orientation_html TEXT,
      cookie_days INT NOT NULL DEFAULT 30,
      min_withdrawal DECIMAL(12,2) NOT NULL DEFAULT 50.00,
      payment_days INT NOT NULL DEFAULT 15,
      share_title VARCHAR(160),
      share_description VARCHAR(320),
      share_image_url VARCHAR(500),
      promotion_tone TEXT,
      cover_image_url VARCHAR(500),
      accept_applications BOOLEAN NOT NULL DEFAULT TRUE,
      auto_approve_applications BOOLEAN NOT NULL DEFAULT FALSE,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_marketplace_visible BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      legacy_config_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_program_brand_slug (brand_id, slug),
      KEY idx_aff_program_brand_status (brand_id, status)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_offers (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      product_id VARCHAR(36),
      offer_type VARCHAR(30) NOT NULL DEFAULT 'product',
      title VARCHAR(160) NOT NULL,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_aff_program_offer_program (program_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_steps (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      slug VARCHAR(80) NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT,
      step_type VARCHAR(40) NOT NULL DEFAULT 'orientation',
      sort_order INT NOT NULL DEFAULT 0,
      is_required BOOLEAN NOT NULL DEFAULT TRUE,
      config_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_program_step_slug (program_id, slug),
      KEY idx_aff_program_step_program (program_id, sort_order)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_trainings (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      step_id VARCHAR(36),
      title VARCHAR(160) NOT NULL,
      description TEXT,
      content_type VARCHAR(30) NOT NULL DEFAULT 'text',
      content_html TEXT,
      media_url VARCHAR(500),
      completion_criteria TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      is_required BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_aff_program_training_program (program_id, sort_order)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_applications (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      credential_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      application_note TEXT,
      admin_note TEXT,
      reviewed_by VARCHAR(36),
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_program_application (program_id, affiliate_user_id),
      KEY idx_aff_program_app_brand (brand_id, status)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_enrollments (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      owner_user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      affiliate_user_id VARCHAR(36) NOT NULL,
      application_id VARCHAR(36),
      status VARCHAR(20) NOT NULL DEFAULT 'onboarding',
      enrollment_code VARCHAR(60),
      coupon_code VARCHAR(40),
      current_step_id VARCHAR(36),
      onboarding_completed_at TIMESTAMP NULL,
      resources_unlocked_at TIMESTAMP NULL,
      approved_at TIMESTAMP NULL,
      suspended_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_program_enrollment (program_id, affiliate_id),
      UNIQUE KEY uq_aff_program_enrollment_code (brand_id, enrollment_code),
      UNIQUE KEY uq_aff_program_enrollment_coupon (brand_id, coupon_code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_progress (
      id VARCHAR(36) PRIMARY KEY,
      enrollment_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NOT NULL,
      item_type VARCHAR(20) NOT NULL,
      item_id VARCHAR(36) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payload_json TEXT,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_program_progress_item (enrollment_id, item_type, item_id),
      KEY idx_aff_program_progress_enrollment (enrollment_id)
    )
  `);

  await query(`ALTER TABLE affiliate_materials ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_learning_modules ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_sales ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_clicks ADD COLUMN program_id VARCHAR(36) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_applications ADD COLUMN source VARCHAR(40) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_applications ADD COLUMN accepted_terms_at TIMESTAMP NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_enrollments ADD COLUMN source VARCHAR(40) NULL`).catch(() => undefined);

  // Repasse / pagamento do programa (exposto na candidatura)
  await query(`ALTER TABLE affiliate_programs ADD COLUMN payout_method VARCHAR(40) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_programs ADD COLUMN payout_frequency VARCHAR(40) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_programs ADD COLUMN payout_min_amount DECIMAL(12,2) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_programs ADD COLUMN payout_notes TEXT NULL`).catch(() => undefined);

  // Detalhes da oferta (tipo de produto comercializado)
  await query(`ALTER TABLE affiliate_program_offers ADD COLUMN product_type VARCHAR(40) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_program_offers ADD COLUMN product_category VARCHAR(120) NULL`).catch(() => undefined);

  programsSchemaReady = true;
}

/** Labels canônicos — UI admin + exposição ao candidato */
export const PAYOUT_METHOD_LABELS: Record<string, string> = {
  pix_direct: "PIX direto",
  bank_deposit: "Depósito em conta",
  wallet: "Carteira interna",
  other: "Outro",
};

export const PAYOUT_FREQUENCY_LABELS: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  on_demand: "Sob demanda",
};

export const OFFER_PRODUCT_TYPE_LABELS: Record<string, string> = {
  physical: "Produto físico",
  digital: "Produto digital",
  service: "Serviço",
  subscription: "Assinatura",
  package: "Pacote / combo",
  course: "Curso / infoproduto",
  other: "Outro",
};

export function normalizePayoutMethod(raw: unknown): string | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  return PAYOUT_METHOD_LABELS[v] ? v : "other";
}

export function normalizePayoutFrequency(raw: unknown): string | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  return PAYOUT_FREQUENCY_LABELS[v] ? v : "on_demand";
}

export function normalizeOfferProductType(raw: unknown): string | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  return OFFER_PRODUCT_TYPE_LABELS[v] ? v : "other";
}

export function formatPayoutSummary(program: {
  payout_method?: string | null;
  payout_frequency?: string | null;
  payout_min_amount?: number | null;
  min_withdrawal?: number | null;
  payment_days?: number | null;
  payout_notes?: string | null;
}): {
  method: string | null;
  method_label: string | null;
  frequency: string | null;
  frequency_label: string | null;
  min_amount: number;
  payment_days: number | null;
  notes: string | null;
  terms_text: string;
} {
  const method = program.payout_method ? String(program.payout_method) : null;
  const frequency = program.payout_frequency ? String(program.payout_frequency) : null;
  const minAmount = Number(
    program.payout_min_amount != null && !Number.isNaN(Number(program.payout_min_amount))
      ? program.payout_min_amount
      : program.min_withdrawal ?? 0,
  );
  const paymentDays = program.payment_days != null ? Number(program.payment_days) : null;
  const notes = program.payout_notes ? String(program.payout_notes).trim() : null;
  const methodLabel = method ? (PAYOUT_METHOD_LABELS[method] || method) : null;
  const frequencyLabel = frequency ? (PAYOUT_FREQUENCY_LABELS[frequency] || frequency) : null;

  const parts: string[] = [];
  if (methodLabel) parts.push(`Forma de repasse: ${methodLabel}.`);
  if (frequencyLabel) parts.push(`Periodicidade: ${frequencyLabel}.`);
  if (minAmount > 0) {
    parts.push(
      `Valor mínimo para saque/repasse: R$ ${minAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }
  if (paymentDays != null && paymentDays > 0 && frequency !== "on_demand") {
    parts.push(`Prazo de referência para liberação: ${paymentDays} dia(s) após a confirmação.`);
  }
  if (notes) parts.push(notes);

  return {
    method,
    method_label: methodLabel,
    frequency,
    frequency_label: frequencyLabel,
    min_amount: minAmount,
    payment_days: paymentDays,
    notes,
    terms_text: parts.join(" "),
  };
}

export class AffiliateProgramsService {
  private affiliates = new AffiliatesService();

  async ensureSchema() {
    await this.affiliates.ensureSchema();
    await ensureAffiliateProgramsSchema();
  }

  /**
   * Regra de negócio: programa ativo da marca = visível no mercado de afiliados.
   * - is_enabled (config legada) → default program status active + marketplace
   * - status active em qualquer campanha → marketplace_visible TRUE
   * - desativar → some do mercado (status inactive / marketplace false)
   */
  async syncMarketplaceFromBrandConfig(ownerUserId: string, brandId: string) {
    await this.ensureSchema();
    const config = await this.affiliates.getOrCreateProgramConfig(ownerUserId, brandId);
    const enabled = config.is_enabled !== false && config.is_enabled !== 0 as any;

    // Garante programa principal
    await this.syncLegacyDefaultProgram(ownerUserId, brandId);

    if (enabled) {
      // Ativo: default program no mercado + candidaturas alinhadas à config
      await query(
        `UPDATE affiliate_programs
         SET status = 'active',
             is_marketplace_visible = TRUE,
             accept_applications = ?,
             auto_approve_applications = ?,
             commission_mode = COALESCE(?, commission_mode),
             commission_value = COALESCE(?, commission_value),
             updated_at = NOW()
         WHERE brand_id = ? AND owner_user_id = ? AND is_default = TRUE`,
        [
          config.accept_new_affiliates !== false,
          !!config.auto_approve_affiliates,
          normalizeCommissionMode(config.default_commission_mode || "percentage"),
          Number(config.default_commission_value ?? config.default_commission_pct ?? 10),
          brandId,
          ownerUserId,
        ],
      );
      // Qualquer campanha já "active" permanece no mercado
      await query(
        `UPDATE affiliate_programs
         SET is_marketplace_visible = TRUE, updated_at = NOW()
         WHERE brand_id = ? AND owner_user_id = ? AND status = 'active'`,
        [brandId, ownerUserId],
      );
    } else {
      // Programa da marca desligado: remove do mercado (não encerra campanhas closed)
      await query(
        `UPDATE affiliate_programs
         SET status = CASE WHEN status = 'closed' THEN 'closed' ELSE 'inactive' END,
             is_marketplace_visible = FALSE,
             updated_at = NOW()
         WHERE brand_id = ? AND owner_user_id = ? AND status IN ('active', 'draft', 'inactive')`,
        [brandId, ownerUserId],
      );
    }
  }

  async syncLegacyDefaultProgram(ownerUserId: string, brandId: string) {
    await this.ensureSchema();
    const config = await this.affiliates.getOrCreateProgramConfig(ownerUserId, brandId);
    const enabled = config.is_enabled !== false && config.is_enabled !== 0 as any;

    let program = await queryOne<any>(
      `SELECT * FROM affiliate_programs WHERE brand_id = ? AND is_default = TRUE LIMIT 1`,
      [brandId]
    );

    if (!program) {
      const id = randomUUID();
      const slug = "programa-principal";
      await query(
        `INSERT INTO affiliate_programs
         (id, owner_user_id, brand_id, slug, name, description, status,
          commission_mode, commission_value, commission_rules,
          terms_html, policies_html, cookie_days, min_withdrawal, payment_days,
          share_title, share_description, share_image_url, promotion_tone,
          accept_applications, auto_approve_applications, is_default, is_marketplace_visible,
          legacy_config_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, 0)`,
        [
          id,
          ownerUserId,
          brandId,
          slug,
          "Programa Principal",
          "Programa padrão da marca — todos os afiliados legados são vinculados aqui.",
          enabled ? "active" : "inactive",
          normalizeCommissionMode(config.default_commission_mode),
          Number(config.default_commission_value ?? config.default_commission_pct ?? 10),
          config.commission_rules || null,
          config.terms_html || null,
          null,
          Number(config.cookie_days || 30),
          Number(config.min_withdrawal || 50),
          Number(config.payment_days || 15),
          config.share_title || null,
          config.share_description || null,
          config.share_image_url || null,
          config.promotion_tone || null,
          config.accept_new_affiliates !== false,
          config.auto_approve_affiliates !== false,
          enabled, // is_marketplace_visible = enabled
          config.id,
        ]
      );
      program = await queryOne<any>(`SELECT * FROM affiliate_programs WHERE id = ? LIMIT 1`, [id]);

      for (const step of DEFAULT_ONBOARDING_STEPS) {
        await query(
          `INSERT INTO affiliate_program_steps
           (id, program_id, slug, title, description, step_type, sort_order, is_required)
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [randomUUID(), id, step.slug, step.title, step.description, step.step_type, step.sort_order]
        );
      }
    } else {
      // Mantém default alinhado ao toggle da marca (sem sobrescrever closed)
      if (String(program.status || "") !== "closed") {
        await query(
          `UPDATE affiliate_programs
           SET status = ?,
               is_marketplace_visible = ?,
               accept_applications = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [
            enabled ? "active" : "inactive",
            enabled,
            config.accept_new_affiliates !== false,
            program.id,
          ],
        );
        program = await queryOne<any>(`SELECT * FROM affiliate_programs WHERE id = ? LIMIT 1`, [program.id]);
      }
    }

    const affiliates = await query<any[]>(
      `SELECT * FROM affiliates WHERE owner_user_id = ? AND brand_id = ?`,
      [ownerUserId, brandId]
    );

    for (const aff of affiliates || []) {
      await this.ensureLegacyEnrollment(String(program.id), aff, ownerUserId, brandId);
    }

    return program;
  }

  private stepIsRequired(step: any): boolean {
    return Number(step?.is_required) === 1 || step?.is_required === true;
  }

  private async ensureLegacyEnrollment(
    programId: string,
    affiliate: any,
    ownerUserId: string,
    brandId: string
  ) {
    const existing = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments WHERE program_id = ? AND affiliate_id = ? LIMIT 1`,
      [programId, affiliate.id]
    );
    if (existing) return existing;

    // Novos vínculos: se o programa tem termos/políticas obrigatórios, entra em onboarding.
    // Antes: sempre 'active' e o aceite de termos falhava com "já concluído".
    const steps = await query<any[]>(
      `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
      [programId]
    );
    const requiredSteps = (steps || []).filter(
      (s) => this.stepIsRequired(s) && s.step_type !== "resource_unlock",
    );
    const firstStep = (steps || []).find((s) => s.step_type !== "resource_unlock") || steps?.[0];
    const instantActive = requiredSteps.length === 0;

    const id = randomUUID();
    if (instantActive) {
      await query(
        `INSERT INTO affiliate_program_enrollments
         (id, program_id, owner_user_id, brand_id, affiliate_id, affiliate_user_id,
          status, enrollment_code, coupon_code, resources_unlocked_at, approved_at, onboarding_completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(), NOW(), NOW())`,
        [
          id,
          programId,
          ownerUserId,
          brandId,
          affiliate.id,
          affiliate.affiliate_user_id,
          affiliate.code,
          affiliate.coupon_code,
        ],
      );
    } else {
      await query(
        `INSERT INTO affiliate_program_enrollments
         (id, program_id, owner_user_id, brand_id, affiliate_id, affiliate_user_id,
          status, enrollment_code, coupon_code, current_step_id, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, 'onboarding', ?, ?, ?, NOW())`,
        [
          id,
          programId,
          ownerUserId,
          brandId,
          affiliate.id,
          affiliate.affiliate_user_id,
          affiliate.code,
          affiliate.coupon_code,
          firstStep?.id || null,
        ],
      );
    }
    return queryOne<any>(`SELECT * FROM affiliate_program_enrollments WHERE id = ? LIMIT 1`, [id]);
  }

  async listPrograms(ownerUserId: string, brandId: string, opts?: { status?: string; includeDraft?: boolean }) {
    await this.syncLegacyDefaultProgram(ownerUserId, brandId);
    try {
      await this.syncMarketplaceFromBrandConfig(ownerUserId, brandId);
    } catch (err: any) {
      console.error("[affiliatePrograms] syncMarketplace on list:", err?.message || err);
    }
    const clauses = ["owner_user_id = ?", "brand_id = ?"];
    const values: any[] = [ownerUserId, brandId];
    if (!opts?.includeDraft) {
      clauses.push("status != 'draft'");
    }
    if (opts?.status) {
      clauses.push("status = ?");
      values.push(opts.status);
    }
    const programs = await query<any[]>(
      `SELECT * FROM affiliate_programs WHERE ${clauses.join(" AND ")} ORDER BY sort_order ASC, created_at ASC`,
      values
    );
    return programs;
  }

  async getProgram(ownerUserId: string, brandId: string, programId: string) {
    await this.ensureSchema();
    return queryOne<any>(
      `SELECT * FROM affiliate_programs WHERE id = ? AND owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [programId, ownerUserId, brandId]
    );
  }

  async getProgramBundle(ownerUserId: string, brandId: string, programId: string) {
    const program = await this.getProgram(ownerUserId, brandId, programId);
    if (!program) return null;

    const [offers, steps, trainings, stats] = await Promise.all([
      query<any[]>(
        `SELECT o.*, p.name AS product_name
         FROM affiliate_program_offers o
         LEFT JOIN products p ON p.id = o.product_id
         WHERE o.program_id = ? AND o.is_active = TRUE
         ORDER BY o.sort_order ASC`,
        [programId]
      ),
      query<any[]>(
        `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
        [programId]
      ),
      query<any[]>(
        `SELECT * FROM affiliate_program_trainings WHERE program_id = ? ORDER BY sort_order ASC`,
        [programId]
      ),
      queryOne<any>(
        `SELECT
           (SELECT COUNT(*) FROM affiliate_program_applications WHERE program_id = ? AND status = 'pending') AS applications_pending,
           (SELECT COUNT(*) FROM affiliate_program_enrollments WHERE program_id = ? AND status = 'onboarding') AS onboarding_count,
           (SELECT COUNT(*) FROM affiliate_program_enrollments WHERE program_id = ? AND status = 'active') AS active_count`,
        [programId, programId, programId]
      ),
    ]);

    return { program, offers: offers || [], steps: steps || [], trainings: trainings || [], stats: stats || {} };
  }

  async createProgram(ownerUserId: string, brandId: string, payload: Record<string, unknown>) {
    await this.ensureSchema();
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Nome do programa é obrigatório");

    let slug = slugify(String(payload.slug || name));
    const slugHit = await queryOne<any>(
      `SELECT id FROM affiliate_programs WHERE brand_id = ? AND slug = ? LIMIT 1`,
      [brandId, slug]
    );
    if (slugHit) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const id = randomUUID();
    const mode = normalizeCommissionMode(payload.commission_mode || "percentage");
    const value = Number(payload.commission_value ?? payload.commission_pct ?? 10);
    const status = String(payload.status || "draft");
    const isActive = status === "active";
    // Campanha ativa ⇒ sempre no mercado de afiliados
    const marketplaceVisible = isActive ? true : payload.is_marketplace_visible !== false;
    const acceptApps = isActive
      ? payload.accept_applications !== false
      : payload.accept_applications !== false;

    const payoutMethod = normalizePayoutMethod(payload.payout_method);
    const payoutFrequency = normalizePayoutFrequency(payload.payout_frequency);
    const payoutMin = payload.payout_min_amount != null
      ? Number(payload.payout_min_amount)
      : Number(payload.min_withdrawal || 50);
    const minWithdrawal = Number(payload.min_withdrawal ?? payoutMin ?? 50);

    await query(
      `INSERT INTO affiliate_programs
       (id, owner_user_id, brand_id, slug, name, description, status,
        commission_mode, commission_value, commission_rules, eligibility_rules,
        terms_html, policies_html, orientation_html,
        cookie_days, min_withdrawal, payment_days,
        share_title, share_description, share_image_url, promotion_tone, cover_image_url,
        accept_applications, auto_approve_applications, is_marketplace_visible, sort_order,
        payout_method, payout_frequency, payout_min_amount, payout_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerUserId,
        brandId,
        slug,
        name,
        String(payload.description || "").trim() || null,
        status,
        mode,
        value,
        payload.commission_rules || null,
        payload.eligibility_rules || null,
        payload.terms_html || null,
        payload.policies_html || null,
        payload.orientation_html || null,
        Number(payload.cookie_days || 30),
        minWithdrawal,
        Number(payload.payment_days || 15),
        payload.share_title || null,
        payload.share_description || null,
        payload.share_image_url || null,
        payload.promotion_tone || null,
        payload.cover_image_url || null,
        acceptApps,
        !!payload.auto_approve_applications,
        marketplaceVisible,
        Number(payload.sort_order || 0),
        payoutMethod,
        payoutFrequency,
        Number.isFinite(payoutMin) ? payoutMin : minWithdrawal,
        payload.payout_notes ? String(payload.payout_notes).trim() || null : null,
      ]
    );

    for (const step of DEFAULT_ONBOARDING_STEPS) {
      await query(
        `INSERT INTO affiliate_program_steps
         (id, program_id, slug, title, description, step_type, sort_order, is_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [randomUUID(), id, step.slug, step.title, step.description, step.step_type, step.sort_order]
      );
    }

    // Qualquer campanha ativa exige programa da marca ligado (join no marketplace)
    if (isActive) {
      try {
        await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
          is_enabled: true,
          accept_new_affiliates: true,
        });
      } catch (err: any) {
        console.error("[affiliatePrograms] enable brand on create active:", err?.message || err);
      }
    }

    return this.getProgramBundle(ownerUserId, brandId, id);
  }

  async updateProgram(ownerUserId: string, brandId: string, programId: string, payload: Record<string, unknown>) {
    await this.ensureSchema();
    const program = await this.getProgram(ownerUserId, brandId, programId);
    if (!program) throw new Error("Programa não encontrado");
    if (program.is_default && payload.status === "closed") {
      throw new Error("O programa principal não pode ser encerrado");
    }

    // Ativo ⇒ sempre no mercado; inativo/encerrado/rascunho ⇒ some do mercado
    const nextStatus = payload.status !== undefined ? String(payload.status) : String(program.status || "draft");
    if (nextStatus === "active") {
      payload.is_marketplace_visible = true;
      // Candidaturas abertas: o mercado global filtra accept_applications
      payload.accept_applications = true;
    } else if (nextStatus === "inactive" || nextStatus === "closed" || nextStatus === "draft") {
      payload.is_marketplace_visible = false;
    }

    const fields: string[] = [];
    const values: any[] = [];
    const allowed = [
      "name", "description", "status", "commission_mode", "commission_value", "commission_rules",
      "eligibility_rules", "terms_html", "policies_html", "orientation_html",
      "cookie_days", "min_withdrawal", "payment_days",
      "share_title", "share_description", "share_image_url", "promotion_tone", "cover_image_url",
      "accept_applications", "auto_approve_applications", "is_marketplace_visible", "sort_order", "slug",
      "payout_method", "payout_frequency", "payout_min_amount", "payout_notes",
    ];

    for (const key of allowed) {
      if (payload[key] === undefined) continue;
      if (key === "commission_mode") {
        fields.push(`${key} = ?`);
        values.push(normalizeCommissionMode(payload[key]));
        continue;
      }
      if (key === "payout_method") {
        fields.push(`${key} = ?`);
        values.push(normalizePayoutMethod(payload[key]));
        continue;
      }
      if (key === "payout_frequency") {
        fields.push(`${key} = ?`);
        values.push(normalizePayoutFrequency(payload[key]));
        continue;
      }
      if (key === "payout_min_amount" || key === "min_withdrawal" || key === "payment_days" || key === "cookie_days") {
        fields.push(`${key} = ?`);
        values.push(Number(payload[key]));
        continue;
      }
      if (key === "payout_notes") {
        fields.push(`${key} = ?`);
        values.push(payload[key] ? String(payload[key]).trim() || null : null);
        continue;
      }
      fields.push(`${key} = ?`);
      values.push(payload[key]);
    }

    if (!fields.length) return this.getProgramBundle(ownerUserId, brandId, programId);

    fields.push("updated_at = NOW()");
    values.push(programId, ownerUserId, brandId);
    await query(
      `UPDATE affiliate_programs SET ${fields.join(", ")} WHERE id = ? AND owner_user_id = ? AND brand_id = ?`,
      values
    );

    // Alinha config da marca com a campanha principal; campanhas extras só ligam a marca
    try {
      if (program.is_default) {
        if (nextStatus === "active") {
          await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
            is_enabled: true,
            accept_new_affiliates: true,
          });
        } else if (nextStatus === "inactive" || nextStatus === "draft") {
          // Programa principal inativo ⇒ marca fora do mercado
          await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
            is_enabled: false,
          });
        }
      } else if (nextStatus === "active") {
        // Campanha extra ativa exige join cfg.is_enabled no marketplace
        await this.affiliates.updateProgramConfig(ownerUserId, brandId, {
          is_enabled: true,
          accept_new_affiliates: true,
        });
      }
    } catch (err: any) {
      console.error("[affiliatePrograms] brand config sync on program status:", err?.message || err);
    }

    return this.getProgramBundle(ownerUserId, brandId, programId);
  }

  async upsertStep(ownerUserId: string, brandId: string, programId: string, payload: Record<string, unknown>) {
    await this.getProgram(ownerUserId, brandId, programId);
    const id = String(payload.id || "").trim() || randomUUID();
    const slug = slugify(String(payload.slug || payload.title || id));

    const existing = await queryOne<any>(`SELECT id FROM affiliate_program_steps WHERE id = ? LIMIT 1`, [id]);
    if (existing) {
      await query(
        `UPDATE affiliate_program_steps
         SET slug = ?, title = ?, description = ?, step_type = ?, sort_order = ?, is_required = ?, config_json = ?, updated_at = NOW()
         WHERE id = ? AND program_id = ?`,
        [
          slug,
          String(payload.title || "").trim(),
          payload.description || null,
          String(payload.step_type || "orientation"),
          Number(payload.sort_order || 0),
          payload.is_required !== false,
          payload.config_json ? JSON.stringify(payload.config_json) : null,
          id,
          programId,
        ]
      );
    } else {
      await query(
        `INSERT INTO affiliate_program_steps
         (id, program_id, slug, title, description, step_type, sort_order, is_required, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          programId,
          slug,
          String(payload.title || "").trim(),
          payload.description || null,
          String(payload.step_type || "orientation"),
          Number(payload.sort_order || 0),
          payload.is_required !== false,
          payload.config_json ? JSON.stringify(payload.config_json) : null,
        ]
      );
    }
    return queryOne<any>(`SELECT * FROM affiliate_program_steps WHERE id = ? LIMIT 1`, [id]);
  }

  async deleteStep(ownerUserId: string, brandId: string, programId: string, stepId: string) {
    await this.getProgram(ownerUserId, brandId, programId);
    await query(`DELETE FROM affiliate_program_steps WHERE id = ? AND program_id = ?`, [stepId, programId]);
  }

  async upsertTraining(ownerUserId: string, brandId: string, programId: string, payload: Record<string, unknown>) {
    await this.getProgram(ownerUserId, brandId, programId);
    const id = String(payload.id || "").trim() || randomUUID();
    const existing = await queryOne<any>(`SELECT id FROM affiliate_program_trainings WHERE id = ? LIMIT 1`, [id]);

    const values = [
      String(payload.title || "").trim(),
      payload.description || null,
      String(payload.content_type || "text"),
      payload.content_html || null,
      payload.media_url || null,
      payload.completion_criteria ? JSON.stringify(payload.completion_criteria) : null,
      Number(payload.sort_order || 0),
      payload.is_required !== false,
      payload.step_id || null,
    ];

    if (existing) {
      await query(
        `UPDATE affiliate_program_trainings
         SET title = ?, description = ?, content_type = ?, content_html = ?, media_url = ?,
             completion_criteria = ?, sort_order = ?, is_required = ?, step_id = ?, updated_at = NOW()
         WHERE id = ? AND program_id = ?`,
        [...values, id, programId]
      );
    } else {
      await query(
        `INSERT INTO affiliate_program_trainings
         (id, program_id, step_id, title, description, content_type, content_html, media_url,
          completion_criteria, sort_order, is_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, programId, ...values]
      );
    }
    return queryOne<any>(`SELECT * FROM affiliate_program_trainings WHERE id = ? LIMIT 1`, [id]);
  }

  async deleteTraining(ownerUserId: string, brandId: string, programId: string, trainingId: string) {
    await this.getProgram(ownerUserId, brandId, programId);
    await query(`DELETE FROM affiliate_program_trainings WHERE id = ? AND program_id = ?`, [trainingId, programId]);
  }

  async upsertOffer(ownerUserId: string, brandId: string, programId: string, payload: Record<string, unknown>) {
    await this.getProgram(ownerUserId, brandId, programId);
    const id = String(payload.id || "").trim() || randomUUID();
    const title = String(payload.title || "").trim();
    if (!title) throw new Error("Título da oferta é obrigatório");

    const productType = normalizeOfferProductType(payload.product_type || payload.offer_type);
    const productCategory = payload.product_category
      ? String(payload.product_category).trim().slice(0, 120) || null
      : null;
    const offerType = String(payload.offer_type || (productType ? "product" : "product")).trim() || "product";
    const description = payload.description != null ? String(payload.description).trim() || null : null;

    const existing = await queryOne<any>(`SELECT id FROM affiliate_program_offers WHERE id = ? LIMIT 1`, [id]);
    if (existing) {
      await query(
        `UPDATE affiliate_program_offers
         SET product_id = ?, offer_type = ?, title = ?, description = ?, sort_order = ?, is_active = ?,
             product_type = ?, product_category = ?, updated_at = NOW()
         WHERE id = ? AND program_id = ?`,
        [
          payload.product_id || null,
          offerType,
          title,
          description,
          Number(payload.sort_order || 0),
          payload.is_active !== false,
          productType,
          productCategory,
          id,
          programId,
        ]
      );
    } else {
      await query(
        `INSERT INTO affiliate_program_offers
         (id, program_id, product_id, offer_type, title, description, sort_order, is_active, product_type, product_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          programId,
          payload.product_id || null,
          offerType,
          title,
          description,
          Number(payload.sort_order || 0),
          payload.is_active !== false,
          productType,
          productCategory,
        ]
      );
    }
    return queryOne<any>(`SELECT * FROM affiliate_program_offers WHERE id = ? LIMIT 1`, [id]);
  }

  async listApplications(ownerUserId: string, brandId: string, programId?: string) {
    await this.ensureSchema();
    const clauses = ["a.owner_user_id = ?", "a.brand_id = ?"];
    const values: any[] = [ownerUserId, brandId];
    if (programId) {
      clauses.push("a.program_id = ?");
      values.push(programId);
    }
    return query<any[]>(
      `SELECT a.*, p.name AS program_name, p.slug AS program_slug,
              u.email, u.name AS user_name, af.display_name, af.code
       FROM affiliate_program_applications a
       INNER JOIN affiliate_programs p ON p.id = a.program_id
       INNER JOIN users u ON u.id = a.affiliate_user_id
       LEFT JOIN affiliates af ON af.id = a.affiliate_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY a.created_at DESC`,
      values
    );
  }

  async reviewApplication(
    ownerUserId: string,
    brandId: string,
    applicationId: string,
    decision: "approved" | "rejected",
    adminNote?: string,
    reviewerId?: string
  ) {
    await this.ensureSchema();
    const app = await queryOne<any>(
      `SELECT * FROM affiliate_program_applications WHERE id = ? AND owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [applicationId, ownerUserId, brandId]
    );
    if (!app) throw new Error("Candidatura não encontrada");
    if (app.status !== "pending") throw new Error("Candidatura já analisada");

    await query(
      `UPDATE affiliate_program_applications
       SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [decision, adminNote || null, reviewerId || null, applicationId]
    );

    if (decision === "approved") {
      const affiliate = await queryOne<any>(
        `SELECT * FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
        [app.affiliate_user_id, brandId]
      );
      if (affiliate) {
        await this.createEnrollmentFromApplication(app, affiliate);
        const program = await queryOne<any>(
          `SELECT name FROM affiliate_programs WHERE id = ? LIMIT 1`,
          [app.program_id]
        );
        void this.emitAffiliateProgramEvent("affiliate.program.application_approved", {
          affiliateUserId: String(app.affiliate_user_id),
          brandId,
          programName: String(program?.name || "programa"),
          programId: String(app.program_id),
        });
      }
    }

    return queryOne<any>(`SELECT * FROM affiliate_program_applications WHERE id = ? LIMIT 1`, [applicationId]);
  }

  private async generateEnrollmentCodes(brandId: string, affiliate: any, program: any) {
    const baseCode = String(affiliate.code || "").trim();
    const baseCoupon = String(affiliate.coupon_code || "").trim();
    const suffix = String(program.slug || "p").slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "") || "P1";

    let code = `${baseCode}-${suffix}`;
    let coupon = `${baseCoupon}${suffix}`.slice(0, 40);

    for (let i = 0; i < 5; i++) {
      const codeHit = await queryOne<any>(
        `SELECT id FROM affiliate_program_enrollments WHERE brand_id = ? AND enrollment_code = ? LIMIT 1`,
        [brandId, code]
      );
      const couponHit = await queryOne<any>(
        `SELECT id FROM affiliate_program_enrollments WHERE brand_id = ? AND coupon_code = ? LIMIT 1`,
        [brandId, coupon]
      );
      if (!codeHit && !couponHit) break;
      code = `${baseCode}-${suffix}${i + 1}`;
      coupon = `${baseCoupon}${suffix}${i + 1}`.slice(0, 40);
    }

    return { code, coupon };
  }

  private async createEnrollmentFromApplication(application: any, affiliate: any) {
    const program = await queryOne<any>(`SELECT * FROM affiliate_programs WHERE id = ? LIMIT 1`, [application.program_id]);
    if (!program) throw new Error("Programa não encontrado");

    const existing = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments WHERE program_id = ? AND affiliate_id = ? LIMIT 1`,
      [application.program_id, affiliate.id]
    );
    if (existing) return existing;

    const { code, coupon } = await this.generateEnrollmentCodes(String(application.brand_id), affiliate, program);
    const steps = await query<any[]>(
      `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
      [application.program_id]
    );
    const firstStep = (steps || []).find((s) => s.step_type !== "resource_unlock") || steps?.[0];

    const enrollmentId = randomUUID();
    // Sempre passa por onboarding se houver etapas obrigatórias (termos, políticas, etc.).
    // Antes: is_default pulava onboarding e gerava "já concluído" no aceite de termos.
    const requiredSteps = (steps || []).filter(
      (s) => this.stepIsRequired(s) && s.step_type !== "resource_unlock",
    );
    const instantActive = requiredSteps.length === 0;

    await query(
      `INSERT INTO affiliate_program_enrollments
       (id, program_id, owner_user_id, brand_id, affiliate_id, affiliate_user_id, application_id,
        status, enrollment_code, coupon_code, current_step_id, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        enrollmentId,
        application.program_id,
        application.owner_user_id,
        application.brand_id,
        affiliate.id,
        application.affiliate_user_id,
        application.id,
        instantActive ? "active" : "onboarding",
        code,
        coupon,
        instantActive ? null : firstStep?.id || null,
      ]
    );

    if (instantActive) {
      await query(
        `UPDATE affiliate_program_enrollments
         SET resources_unlocked_at = NOW(), onboarding_completed_at = NOW()
         WHERE id = ?`,
        [enrollmentId]
      );
    }

    await query(
      `UPDATE affiliate_program_applications SET affiliate_id = ?, updated_at = NOW() WHERE id = ?`,
      [affiliate.id, application.id]
    );

    return queryOne<any>(`SELECT * FROM affiliate_program_enrollments WHERE id = ? LIMIT 1`, [enrollmentId]);
  }

  async listMarketplaceForAffiliate(input: {
    ownerUserId: string;
    brandId: string;
    affiliateUserId: string;
    credentialId: string;
  }) {
    await this.ensureSchema();
    try {
      await this.syncLegacyDefaultProgram(input.ownerUserId, input.brandId);
    } catch (err: any) {
      console.error("[affiliatePrograms] syncLegacyDefaultProgram:", err?.message || err);
    }

    const affiliate = await queryOne<any>(
      `SELECT * FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateUserId, input.brandId]
    );

    // Garante que config ativa ⇒ programa default no mercado
    try {
      await this.syncMarketplaceFromBrandConfig(input.ownerUserId, input.brandId);
    } catch (err: any) {
      console.error("[affiliatePrograms] syncMarketplace before list:", err?.message || err);
    }

    const programs = (await query<any[]>(
      `SELECT p.*
       FROM affiliate_programs p
       INNER JOIN affiliate_program_config cfg
         ON cfg.brand_id = p.brand_id AND cfg.owner_user_id = p.owner_user_id
       WHERE p.brand_id = ?
         AND cfg.is_enabled = TRUE
         AND p.status = 'active'
         AND p.is_marketplace_visible = TRUE
       ORDER BY p.sort_order ASC, p.name ASC`,
      [input.brandId]
    )) || [];

    const applications = (await query<any[]>(
      `SELECT * FROM affiliate_program_applications WHERE affiliate_user_id = ? AND brand_id = ?`,
      [input.affiliateUserId, input.brandId]
    )) || [];
    const appMap = new Map(applications.map((a) => [a.program_id, a]));

    const enrollments = affiliate
      ? (await query<any[]>(
          `SELECT * FROM affiliate_program_enrollments WHERE affiliate_id = ?`,
          [affiliate.id]
        )) || []
      : [];
    const enrollMap = new Map(enrollments.map((e) => [e.program_id, e]));

    let offers: any[] = [];
    try {
      offers = (await query<any[]>(
        `SELECT o.id, o.program_id, o.product_id, o.offer_type, o.title, o.description,
                o.sort_order, o.is_active, p.name AS product_name
         FROM affiliate_program_offers o
         INNER JOIN affiliate_programs pr ON pr.id = o.program_id
         LEFT JOIN products p ON p.id = o.product_id
         WHERE pr.brand_id = ? AND pr.status = 'active' AND o.is_active = TRUE
         ORDER BY o.sort_order ASC`,
        [input.brandId]
      )) || [];
    } catch (err: any) {
      console.error("[affiliatePrograms] offers query:", err?.message || err);
    }

    const offersByProgram = new Map<string, any[]>();
    for (const o of offers) {
      const pid = String(o.program_id || "");
      if (!pid) continue;
      const list = offersByProgram.get(pid) || [];
      list.push(o);
      offersByProgram.set(pid, list);
    }

    const prospectsRow = await queryOne<any>(
      `SELECT COUNT(*)::int AS total FROM customers WHERE brand_id = ?`,
      [input.brandId],
    ).catch(() => null);
    const prospectsCaptured = Number(prospectsRow?.total || 0);

    return programs.map((p) => {
      const application = appMap.get(p.id) || null;
      const enrollment = enrollMap.get(p.id) || null;
      let participation_status:
        | "not_applied"
        | "pending"
        | "rejected"
        | "onboarding"
        | "active"
        | "suspended"
        | "completed" = "not_applied";

      if (enrollment) {
        participation_status =
          enrollment.status === "onboarding"
            ? "onboarding"
            : enrollment.status === "active"
              ? "active"
              : (enrollment.status as any);
      } else if (application) {
        participation_status = application.status === "pending" ? "pending" : (application.status as any);
      }

      return {
        ...p,
        offers: offersByProgram.get(p.id) || [],
        application,
        enrollment,
        participation_status,
        prospects_captured: prospectsCaptured,
        leads_captured: prospectsCaptured,
        can_apply:
          p.accept_applications &&
          !application &&
          !enrollment &&
          participation_status === "not_applied",
        // onboarding explícito OU active legado sem progresso de termos
        can_continue:
          enrollment?.status === "onboarding"
          || (
            enrollment?.status === "active"
            && !enrollment?.onboarding_completed_at
          ),
        resources_unlocked: !!enrollment?.resources_unlocked_at,
      };
    });
  }

  async applyToProgram(input: {
    ownerUserId: string;
    brandId: string;
    programId: string;
    affiliateUserId: string;
    credentialId: string;
    note?: string;
    source?: string;
    forceAutoApprove?: boolean;
    bypassApplicationGate?: boolean;
    acceptedTermsAt?: Date | string | null;
  }) {
    await this.ensureSchema();
    const program = await queryOne<any>(
      `SELECT * FROM affiliate_programs WHERE id = ? AND brand_id = ? AND status = 'active' LIMIT 1`,
      [input.programId, input.brandId]
    );
    if (!program) throw new Error("Programa não disponível");
    if (!program.accept_applications && !input.bypassApplicationGate) {
      throw new Error("Este programa não aceita candidaturas");
    }

    const affiliate = await queryOne<any>(
      `SELECT * FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
      [input.affiliateUserId, input.brandId]
    );
    if (!affiliate) throw new Error("Perfil de afiliado não encontrado");

    const existingApp = await queryOne<any>(
      `SELECT * FROM affiliate_program_applications WHERE program_id = ? AND affiliate_user_id = ? LIMIT 1`,
      [input.programId, input.affiliateUserId]
    );
    if (existingApp && existingApp.status === "pending") throw new Error("Candidatura já enviada");

    const existingEnrollment = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments WHERE program_id = ? AND affiliate_id = ? LIMIT 1`,
      [input.programId, affiliate.id]
    );
    if (existingEnrollment) throw new Error("Você já participa deste programa");

    const appId = randomUUID();
    const autoApprove =
      !!input.forceAutoApprove ||
      !!program.auto_approve_applications ||
      !!program.is_default;
    const source = String(input.source || "marketplace_application").trim() || "marketplace_application";

    await query(
      `INSERT INTO affiliate_program_applications
       (id, program_id, owner_user_id, brand_id, affiliate_user_id, credential_id, affiliate_id,
        status, application_note, reviewed_at, source, accepted_terms_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appId,
        input.programId,
        input.ownerUserId,
        input.brandId,
        input.affiliateUserId,
        input.credentialId,
        affiliate.id,
        autoApprove ? "approved" : "pending",
        input.note || null,
        autoApprove ? new Date() : null,
        source,
        input.acceptedTermsAt || null,
      ]
    );

    const application = await queryOne<any>(
      `SELECT * FROM affiliate_program_applications WHERE id = ? LIMIT 1`,
      [appId]
    );

    let enrollment = null;
    if (autoApprove) {
      enrollment = await this.createEnrollmentFromApplication(application, affiliate);
      if (enrollment?.id) {
        await query(
          `UPDATE affiliate_program_enrollments SET source = ? WHERE id = ?`,
          [source, enrollment.id]
        ).catch(() => undefined);
      }
      void this.emitAffiliateProgramEvent("affiliate.program.application_approved", {
        affiliateUserId: input.affiliateUserId,
        brandId: input.brandId,
        programName: String(program.name || "programa"),
        programId: input.programId,
      });
    } else {
      void this.emitAffiliateProgramEvent("admin.affiliate.application_received", {
        ownerUserId: input.ownerUserId,
        brandId: input.brandId,
        applicantName: String(affiliate.display_name || affiliate.code || "Afiliado"),
        programId: input.programId,
      });
    }

    return { application, enrollment, auto_approved: autoApprove };
  }

  private async emitAffiliateProgramEvent(
    eventKey: string,
    ctx: {
      affiliateUserId?: string;
      ownerUserId?: string;
      brandId: string;
      programName?: string;
      programId?: string;
      applicantName?: string;
    }
  ) {
    try {
      const { emitPlatformEventToUser } = await import("./notificationHub");
      if (eventKey.startsWith("admin.") && ctx.ownerUserId) {
        await emitPlatformEventToUser(eventKey, ctx.ownerUserId, {
          organization_id: ctx.brandId,
          role: "admin",
          entity_type: "affiliate_program",
          entity_id: ctx.programId || ctx.brandId,
          deep_link: "/afiliados",
          template_vars: {
            applicant_name: ctx.applicantName || "Afiliado",
            program_name: ctx.programName || "",
            brand_id: ctx.brandId,
          },
        });
      } else if (ctx.affiliateUserId) {
        await emitPlatformEventToUser(eventKey, ctx.affiliateUserId, {
          organization_id: ctx.brandId,
          role: "affiliate",
          entity_type: "affiliate_program",
          entity_id: ctx.programId || ctx.brandId,
          deep_link: "/contatos",
          template_vars: {
            program_name: ctx.programName || "programa",
            brand_id: ctx.brandId,
          },
        });
      }
    } catch {
      /* notificação não bloqueia candidatura */
    }
  }

  async getEnrollmentOnboarding(enrollmentId: string, affiliateUserId: string) {
    await this.ensureSchema();
    const enrollment = await queryOne<any>(
      `SELECT e.*, p.name AS program_name, p.slug AS program_slug, p.terms_html, p.policies_html,
              p.orientation_html, p.commission_mode, p.commission_value, p.commission_rules
       FROM affiliate_program_enrollments e
       INNER JOIN affiliate_programs p ON p.id = e.program_id
       WHERE e.id = ? AND e.affiliate_user_id = ? LIMIT 1`,
      [enrollmentId, affiliateUserId]
    );
    if (!enrollment) return null;

    const [steps, trainings, progress] = await Promise.all([
      query<any[]>(
        `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
        [enrollment.program_id]
      ),
      query<any[]>(
        `SELECT * FROM affiliate_program_trainings WHERE program_id = ? ORDER BY sort_order ASC`,
        [enrollment.program_id]
      ),
      query<any[]>(
        `SELECT * FROM affiliate_program_progress WHERE enrollment_id = ?`,
        [enrollmentId]
      ),
    ]);

    const progressMap = new Map(
      (progress || []).map((p) => [`${p.item_type}:${p.item_id}`, p])
    );

    const flow = (steps || []).map((step) => {
      const prog = progressMap.get(`step:${step.id}`);
      const stepTrainings = (trainings || []).filter((t) => t.step_id === step.id);
      return {
        ...step,
        progress: prog || { status: "pending" },
        trainings: stepTrainings.map((t) => ({
          ...t,
          progress: progressMap.get(`training:${t.id}`) || { status: "pending" },
        })),
        locked: this.isStepLocked(step, steps || [], progressMap, trainings || []),
      };
    });

    return {
      enrollment,
      steps: flow,
      trainings: (trainings || []).map((t) => ({
        ...t,
        progress: progressMap.get(`training:${t.id}`) || { status: "pending" },
      })),
      resources_unlocked: !!enrollment.resources_unlocked_at,
      enrollment_code: enrollment.resources_unlocked_at ? enrollment.enrollment_code : null,
      coupon_code: enrollment.resources_unlocked_at ? enrollment.coupon_code : null,
    };
  }

  private isStepLocked(step: any, allSteps: any[], progressMap: Map<string, any>, trainings?: any[]) {
    const ordered = [...allSteps].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const idx = ordered.findIndex((s) => s.id === step.id);
    if (idx <= 0) return false;
    for (let i = 0; i < idx; i++) {
      const prev = ordered[i];
      if (!this.stepIsRequired(prev)) continue;
      const prog = progressMap.get(`step:${prev.id}`);
      if (prog?.status !== "completed") return true;
      const prevTrainings = (trainings || []).filter(
        (t) => t.step_id === prev.id && this.stepIsRequired(t),
      );
      for (const tr of prevTrainings) {
        if (progressMap.get(`training:${tr.id}`)?.status !== "completed") return true;
      }
    }
    return false;
  }

  async completeOnboardingItem(input: {
    enrollmentId: string;
    affiliateUserId: string;
    itemType: ProgressItemType;
    itemId: string;
    payload?: Record<string, unknown>;
  }) {
    await this.ensureSchema();
    const enrollment = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments WHERE id = ? AND affiliate_user_id = ? LIMIT 1`,
      [input.enrollmentId, input.affiliateUserId]
    );
    if (!enrollment) throw new Error("Inscrição não encontrada");
    if (enrollment.status === "suspended" || enrollment.status === "revoked") {
      throw new Error("Inscrição inativa ou suspensa");
    }

    const steps = await query<any[]>(
      `SELECT * FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
      [enrollment.program_id]
    );
    const progressRows = await query<any[]>(
      `SELECT * FROM affiliate_program_progress WHERE enrollment_id = ?`,
      [input.enrollmentId]
    );
    const progressMap = new Map(
      (progressRows || []).map((p) => [`${p.item_type}:${p.item_id}`, p])
    );

    const requiredIncomplete = (steps || []).some((s) => {
      if (!this.stepIsRequired(s) || s.step_type === "resource_unlock") return false;
      return progressMap.get(`step:${s.id}`)?.status !== "completed";
    });

    // active/completed cedo demais (legado is_default / ensureLegacyEnrollment): reabre se faltar termo
    if (enrollment.status === "onboarding") {
      // ok — fluxo normal
    } else if (
      (enrollment.status === "active" || enrollment.status === "completed")
      && requiredIncomplete
    ) {
      await query(
        `UPDATE affiliate_program_enrollments
         SET status = 'onboarding',
             onboarding_completed_at = NULL,
             resources_unlocked_at = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [input.enrollmentId],
      );
      enrollment.status = "onboarding";
    } else if (enrollment.status !== "onboarding") {
      throw new Error("Onboarding já concluído ou inscrição inativa");
    }

    if (input.itemType === "step") {
      const step = (steps || []).find((s) => s.id === input.itemId);
      if (!step) throw new Error("Etapa não encontrada");
      const trainings = await query<any[]>(
        `SELECT * FROM affiliate_program_trainings WHERE program_id = ?`,
        [enrollment.program_id]
      );
      if (this.isStepLocked(step, steps || [], progressMap, trainings || [])) {
        throw new Error("Conclua a etapa anterior antes de avançar");
      }

      const requiredTrainings = await query<any[]>(
        `SELECT * FROM affiliate_program_trainings
         WHERE program_id = ? AND step_id = ? AND is_required = TRUE`,
        [enrollment.program_id, step.id]
      );
      for (const tr of requiredTrainings || []) {
        const tp = progressMap.get(`training:${tr.id}`);
        if (tp?.status !== "completed") {
          throw new Error("Conclua os treinamentos obrigatórios desta etapa");
        }
      }
    }

    const existing = progressMap.get(`${input.itemType}:${input.itemId}`);
    if (existing?.status === "completed") {
      return this.getEnrollmentOnboarding(input.enrollmentId, input.affiliateUserId);
    }

    const progressId = existing?.id || randomUUID();
    if (existing) {
      await query(
        `UPDATE affiliate_program_progress
         SET status = 'completed', payload_json = ?, completed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [input.payload ? JSON.stringify(input.payload) : null, progressId]
      );
    } else {
      await query(
        `INSERT INTO affiliate_program_progress
         (id, enrollment_id, program_id, affiliate_id, item_type, item_id, status, payload_json, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, NOW())`,
        [
          progressId,
          input.enrollmentId,
          enrollment.program_id,
          enrollment.affiliate_id,
          input.itemType,
          input.itemId,
          input.payload ? JSON.stringify(input.payload) : null,
        ]
      );
    }

    await this.advanceEnrollment(enrollment, steps || []);
    return this.getEnrollmentOnboarding(input.enrollmentId, input.affiliateUserId);
  }

  private async advanceEnrollment(enrollment: any, steps: any[]) {
    const progress = await query<any[]>(
      `SELECT * FROM affiliate_program_progress WHERE enrollment_id = ?`,
      [enrollment.id]
    );


    const completedStepIds = new Set(
      (progress || []).filter((p) => p.item_type === "step" && p.status === "completed").map((p) => p.item_id)
    );

    const ordered = [...steps].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const nextStep = ordered.find(
      (s) => this.stepIsRequired(s) && !completedStepIds.has(s.id) && s.step_type !== "resource_unlock"
    );

    if (nextStep) {
      await query(
        `UPDATE affiliate_program_enrollments SET current_step_id = ?, updated_at = NOW() WHERE id = ?`,
        [nextStep.id, enrollment.id]
      );
      return;
    }

    const unlockStep = ordered.find((s) => s.step_type === "resource_unlock");
    if (unlockStep && !completedStepIds.has(unlockStep.id)) {
      await query(
        `INSERT INTO affiliate_program_progress
         (id, enrollment_id, program_id, affiliate_id, item_type, item_id, status, completed_at)
         VALUES (?, ?, ?, ?, 'step', ?, 'completed', NOW())`,
        [randomUUID(), enrollment.id, enrollment.program_id, enrollment.affiliate_id, unlockStep.id]
      );
    }

    await query(
      `UPDATE affiliate_program_enrollments
       SET status = 'active', current_step_id = NULL,
           onboarding_completed_at = NOW(), resources_unlocked_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [enrollment.id]
    );
  }

  async listEnrollments(ownerUserId: string, brandId: string, programId?: string) {
    await this.ensureSchema();
    const clauses = ["e.owner_user_id = ?", "e.brand_id = ?"];
    const values: any[] = [ownerUserId, brandId];
    if (programId) {
      clauses.push("e.program_id = ?");
      values.push(programId);
    }
    return query<any[]>(
      `SELECT e.*, p.name AS program_name, af.display_name, af.code, u.email
       FROM affiliate_program_enrollments e
       INNER JOIN affiliate_programs p ON p.id = e.program_id
       INNER JOIN affiliates af ON af.id = e.affiliate_id
       INNER JOIN users u ON u.id = e.affiliate_user_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY e.updated_at DESC`,
      values
    );
  }

  async updateEnrollmentStatus(
    ownerUserId: string,
    brandId: string,
    enrollmentId: string,
    status: EnrollmentStatus
  ) {
    await this.ensureSchema();
    const enrollment = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments
       WHERE id = ? AND owner_user_id = ? AND brand_id = ? LIMIT 1`,
      [enrollmentId, ownerUserId, brandId]
    );
    if (!enrollment) throw new Error("Inscrição não encontrada");

    const allowed: EnrollmentStatus[] = ["active", "suspended", "revoked", "onboarding"];
    if (!allowed.includes(status)) throw new Error("Status inválido");

    if (status === "active" && !enrollment.resources_unlocked_at) {
      throw new Error("Afiliado ainda não concluiu o onboarding deste programa");
    }

    await query(
      `UPDATE affiliate_program_enrollments
       SET status = ?,
           suspended_at = ${status === "suspended" ? "NOW()" : "NULL"},
           updated_at = NOW()
       WHERE id = ?`,
      [status, enrollmentId]
    );
    return queryOne<any>(`SELECT * FROM affiliate_program_enrollments WHERE id = ? LIMIT 1`, [enrollmentId]);
  }

  async listAffiliateEnrollments(affiliateUserId: string, brandId: string) {
    await this.ensureSchema();
    const affiliate = await queryOne<any>(
      `SELECT id, code, coupon_code FROM affiliates WHERE affiliate_user_id = ? AND brand_id = ? LIMIT 1`,
      [affiliateUserId, brandId]
    );
    if (!affiliate) return [];

    const rows = await query<any[]>(
      `SELECT e.*, p.name AS program_name, p.slug AS program_slug,
              p.commission_mode, p.commission_value, p.is_default, p.status AS program_status
       FROM affiliate_program_enrollments e
       INNER JOIN affiliate_programs p ON p.id = e.program_id
       WHERE e.affiliate_id = ? AND e.brand_id = ?
       ORDER BY p.is_default DESC, p.sort_order ASC, p.name ASC`,
      [affiliate.id, brandId]
    );

    return (rows || []).map((row) => ({
      id: row.id,
      program_id: row.program_id,
      program_name: row.program_name,
      program_slug: row.program_slug,
      program_status: row.program_status,
      is_default: !!row.is_default,
      status: row.status,
      commission_mode: row.commission_mode,
      commission_value: row.commission_value,
      resources_unlocked: !!row.resources_unlocked_at,
      enrollment_code: row.resources_unlocked_at ? row.enrollment_code : null,
      coupon_code: row.resources_unlocked_at ? row.coupon_code : null,
      legacy_code: affiliate.code,
      legacy_coupon: affiliate.coupon_code,
    }));
  }

  async resolveEnrollmentContext(affiliateUserId: string, brandId: string, programId?: string) {
    const enrollments = await this.listAffiliateEnrollments(affiliateUserId, brandId);
    if (!enrollments.length) return { enrollment: null, program_id: null, enrollments };

    if (programId) {
      const hit = enrollments.find((e) => e.program_id === programId);
      return { enrollment: hit || null, program_id: programId, enrollments };
    }

    const preferred =
      enrollments.find((e) => e.is_default && e.resources_unlocked)
      || enrollments.find((e) => e.is_default)
      || enrollments.find((e) => e.resources_unlocked && e.status === "active")
      || enrollments[0];

    return { enrollment: preferred || null, program_id: preferred?.program_id || null, enrollments };
  }

  async listProgramProductIds(programId: string): Promise<string[]> {
    await this.ensureSchema();
    const offers = await query<any[]>(
      `SELECT product_id FROM affiliate_program_offers
       WHERE program_id = ? AND is_active = TRUE AND product_id IS NOT NULL`,
      [programId]
    );
    return (offers || []).map((o) => String(o.product_id)).filter(Boolean);
  }

  async reorderStep(
    ownerUserId: string,
    brandId: string,
    programId: string,
    stepId: string,
    direction: "up" | "down"
  ) {
    const bundle = await this.getProgramBundle(ownerUserId, brandId, programId);
    if (!bundle) throw new Error("Programa não encontrado");

    const steps = [...(bundle.steps || [])].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) throw new Error("Etapa não encontrada");

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) return bundle;

    const current = steps[idx];
    const other = steps[swapIdx];
    await query(
      `UPDATE affiliate_program_steps SET sort_order = ?, updated_at = NOW() WHERE id = ?`,
      [other.sort_order, current.id]
    );
    await query(
      `UPDATE affiliate_program_steps SET sort_order = ?, updated_at = NOW() WHERE id = ?`,
      [current.sort_order, other.id]
    );
    return this.getProgramBundle(ownerUserId, brandId, programId);
  }
}

export const affiliateProgramsService = new AffiliateProgramsService();
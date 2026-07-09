import { randomBytes, randomUUID } from "crypto";
import { query, queryOne } from "../config/database";
import { AffiliatesService } from "./affiliates";
import { affiliateProgramsService } from "./affiliatePrograms";

let schemaReady = false;

export type GlobalAffiliateProfile = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  document: string | null;
  pix_key: string | null;
  global_status: string;
  created_at: string;
  updated_at: string;
};

export type ProgramMembership = {
  id: string;
  affiliate_user_id: string;
  organization_id: string;
  program_id: string;
  affiliate_id: string | null;
  enrollment_id: string | null;
  application_id: string | null;
  status: string;
  source: string;
  accepted_terms_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  onboarding_completed_at: string | null;
  training_status: string;
  organization_name: string | null;
  organization_slug: string | null;
  organization_logo_url: string | null;
  program_name: string | null;
  program_slug: string | null;
};

function mapEnrollmentStatus(enrollment: any, application: any): string {
  if (enrollment) {
    const st = String(enrollment.status || "").trim();
    if (st === "active") return "approved";
    if (st === "onboarding") return application?.status === "pending" ? "pending_application" : "pre_approved";
    if (st === "suspended") return "blocked";
    if (st === "completed") return "inactive";
    return st;
  }
  if (application) {
    const st = String(application.status || "").trim();
    if (st === "pending") return "pending_application";
    if (st === "rejected") return "rejected";
    if (st === "approved") return "pre_approved";
    return st;
  }
  return "pending_application";
}

async function ensureGlobalSchema(): Promise<void> {
  if (schemaReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_global_profiles (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NULL,
      document VARCHAR(30) NULL,
      pix_key VARCHAR(120) NULL,
      global_status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_affiliate_global_user (user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_program_memberships (
      id VARCHAR(36) PRIMARY KEY,
      affiliate_user_id VARCHAR(36) NOT NULL,
      organization_id VARCHAR(36) NOT NULL,
      program_id VARCHAR(36) NOT NULL,
      affiliate_id VARCHAR(36) NULL,
      enrollment_id VARCHAR(36) NULL,
      application_id VARCHAR(36) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_application',
      source VARCHAR(40) NOT NULL DEFAULT 'marketplace_application',
      accepted_terms_at TIMESTAMP NULL,
      approved_at TIMESTAMP NULL,
      rejected_at TIMESTAMP NULL,
      onboarding_completed_at TIMESTAMP NULL,
      training_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_membership_program_user (program_id, affiliate_user_id),
      KEY idx_aff_membership_user (affiliate_user_id),
      KEY idx_aff_membership_org (organization_id, status)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS affiliate_invitations (
      id VARCHAR(36) PRIMARY KEY,
      program_id VARCHAR(36) NOT NULL,
      organization_id VARCHAR(36) NOT NULL,
      owner_user_id VARCHAR(36) NOT NULL,
      invite_code VARCHAR(64) NOT NULL,
      email VARCHAR(190) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aff_invite_code (invite_code),
      KEY idx_aff_invite_program (program_id, status)
    )
  `);

  await query(
    `ALTER TABLE affiliate_program_applications ADD COLUMN source VARCHAR(40) NULL`
  ).catch(() => undefined);
  await query(
    `ALTER TABLE affiliate_program_enrollments ADD COLUMN source VARCHAR(40) NULL`
  ).catch(() => undefined);
  await query(`ALTER TABLE affiliate_invitations ADD COLUMN label VARCHAR(120) NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_invitations ADD COLUMN accepted_count INT NOT NULL DEFAULT 0`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_invitations ADD COLUMN max_uses INT NULL`).catch(() => undefined);
  await query(`ALTER TABLE affiliate_invitations ADD COLUMN created_by VARCHAR(36) NULL`).catch(() => undefined);

  schemaReady = true;
}

function generateInviteCode(): string {
  return randomBytes(12).toString("base64url");
}

function buildInvitePath(code: string): string {
  return `/parceiros?invite=${encodeURIComponent(code)}`;
}

export class AffiliateGlobalService {
  private affiliates = new AffiliatesService();

  async ensureSchema() {
    await this.affiliates.ensureSchema();
    await affiliateProgramsService.ensureSchema();
    await ensureGlobalSchema();
  }

  async getOrCreateGlobalProfile(userId: string): Promise<GlobalAffiliateProfile> {
    await this.ensureSchema();
    const existing = await queryOne<any>(
      `SELECT g.*, u.email
       FROM affiliate_global_profiles g
       INNER JOIN users u ON u.id = g.user_id
       WHERE g.user_id = ? LIMIT 1`,
      [userId]
    );
    if (existing) {
      return {
        id: String(existing.id),
        user_id: String(existing.user_id),
        display_name: String(existing.display_name || ""),
        email: String(existing.email || ""),
        phone: existing.phone ? String(existing.phone) : null,
        document: existing.document ? String(existing.document) : null,
        pix_key: existing.pix_key ? String(existing.pix_key) : null,
        global_status: String(existing.global_status || "active"),
        created_at: String(existing.created_at || ""),
        updated_at: String(existing.updated_at || ""),
      };
    }

    const user = await queryOne<any>(
      `SELECT id, email, name, phone FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!user) throw new Error("Usuário não encontrado");

    const id = randomUUID();
    await query(
      `INSERT INTO affiliate_global_profiles
       (id, user_id, display_name, phone, global_status)
       VALUES (?, ?, ?, ?, 'active')`,
      [id, userId, String(user.name || "Afiliado").trim(), user.phone || null]
    );

    return this.getOrCreateGlobalProfile(userId);
  }

  async createGlobalAccount(input: {
    email: string;
    passwordHash: string;
    name: string;
    phone?: string | null;
  }): Promise<{ userId: string; profile: GlobalAffiliateProfile }> {
    await this.ensureSchema();
    const email = String(input.email || "").trim().toLowerCase();
    const name = String(input.name || "").trim() || "Afiliado";

    const existing = await queryOne<any>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [email]
    );
    if (existing) throw new Error("Este e-mail já está cadastrado. Faça login.");

    const userId = randomUUID();
    await query(
      `INSERT INTO users (id, email, password_hash, name, phone, role, is_active)
       VALUES (?, ?, ?, ?, ?, 'affiliate', TRUE)`,
      [userId, email, input.passwordHash, name, input.phone || null]
    );

    const profile = await this.getOrCreateGlobalProfile(userId);
    return { userId, profile };
  }

  async linkToBrand(input: {
    affiliateUserId: string;
    email: string;
    brandId: string;
    ownerUserId: string;
    displayName: string;
    phone?: string | null;
    source?: string;
    autoApprove?: boolean;
  }): Promise<{ credentialId: string; affiliateId: string }> {
    await this.ensureSchema();

    const existingCred = await queryOne<any>(
      `SELECT c.id, a.id AS affiliate_id
       FROM affiliate_app_credentials c
       LEFT JOIN affiliates a ON a.credential_id = c.id
       WHERE c.brand_id = ? AND c.affiliate_user_id = ?
       LIMIT 1`,
      [input.brandId, input.affiliateUserId]
    );
    if (existingCred?.id && existingCred?.affiliate_id) {
      return {
        credentialId: String(existingCred.id),
        affiliateId: String(existingCred.affiliate_id),
      };
    }

    const credentialId = randomUUID();
    const autoApprove = input.autoApprove !== false;
    await query(
      `INSERT INTO affiliate_app_credentials
       (id, owner_user_id, affiliate_user_id, brand_id, email, credential_type, is_active)
       VALUES (?, ?, ?, ?, ?, 'afiliado', ?)`,
      [
        credentialId,
        input.ownerUserId,
        input.affiliateUserId,
        input.brandId,
        input.email,
        autoApprove,
      ]
    );

    const affiliate = await this.affiliates.createAffiliateProfile({
      ownerUserId: input.ownerUserId,
      brandId: input.brandId,
      credentialId,
      affiliateUserId: input.affiliateUserId,
      displayName: input.displayName,
      phone: input.phone || null,
      status: autoApprove ? "active" : "pending",
    });

    if (autoApprove) {
      await this.affiliates.syncAffiliateCoupon(affiliate, input.ownerUserId);
    }

    return { credentialId, affiliateId: String(affiliate.id) };
  }

  async syncMemberships(affiliateUserId: string): Promise<void> {
    await this.ensureSchema();

    const enrollments = (await query<any[]>(
      `SELECT e.*, p.name AS program_name, p.slug AS program_slug,
              b.name AS organization_name, b.slug AS organization_slug
       FROM affiliate_program_enrollments e
       INNER JOIN affiliate_programs p ON p.id = e.program_id
       INNER JOIN brand_units b ON b.id = e.brand_id
       WHERE e.affiliate_user_id = ?`,
      [affiliateUserId]
    )) || [];

    const applications = (await query<any[]>(
      `SELECT a.*, p.name AS program_name, p.slug AS program_slug,
              b.name AS organization_name, b.slug AS organization_slug
       FROM affiliate_program_applications a
       INNER JOIN affiliate_programs p ON p.id = a.program_id
       INNER JOIN brand_units b ON b.id = a.brand_id
       WHERE a.affiliate_user_id = ?`,
      [affiliateUserId]
    )) || [];

    const appByProgram = new Map(applications.map((a) => [String(a.program_id), a]));

    for (const enrollment of enrollments) {
      const application = appByProgram.get(String(enrollment.program_id)) || null;
      const status = mapEnrollmentStatus(enrollment, application);
      const source = String(application?.source || enrollment.source || "marketplace_application");
      const id = randomUUID();

      await query(
        `INSERT INTO affiliate_program_memberships
         (id, affiliate_user_id, organization_id, program_id, affiliate_id, enrollment_id,
          application_id, status, source, accepted_terms_at, approved_at, rejected_at,
          onboarding_completed_at, training_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           affiliate_id = VALUES(affiliate_id),
           enrollment_id = VALUES(enrollment_id),
           application_id = VALUES(application_id),
           status = VALUES(status),
           source = VALUES(source),
           approved_at = VALUES(approved_at),
           rejected_at = VALUES(rejected_at),
           onboarding_completed_at = VALUES(onboarding_completed_at),
           training_status = VALUES(training_status),
           updated_at = NOW()`,
        [
          id,
          affiliateUserId,
          enrollment.brand_id,
          enrollment.program_id,
          enrollment.affiliate_id,
          enrollment.id,
          application?.id || null,
          status,
          source,
          application?.accepted_terms_at || null,
          enrollment.approved_at || enrollment.resources_unlocked_at || null,
          application?.status === "rejected" ? application.reviewed_at || null : null,
          enrollment.onboarding_completed_at || null,
          enrollment.onboarding_completed_at ? "completed" : "pending",
        ]
      );
    }

    for (const application of applications) {
      const hasEnrollment = enrollments.some((e) => String(e.program_id) === String(application.program_id));
      if (hasEnrollment) continue;

      const status = mapEnrollmentStatus(null, application);
      const id = randomUUID();
      await query(
        `INSERT INTO affiliate_program_memberships
         (id, affiliate_user_id, organization_id, program_id, affiliate_id, enrollment_id,
          application_id, status, source, accepted_terms_at, rejected_at, training_status)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE
           affiliate_id = VALUES(affiliate_id),
           application_id = VALUES(application_id),
           status = VALUES(status),
           source = VALUES(source),
           rejected_at = VALUES(rejected_at),
           updated_at = NOW()`,
        [
          id,
          affiliateUserId,
          application.brand_id,
          application.program_id,
          application.affiliate_id || null,
          application.id,
          status,
          String(application.source || "marketplace_application"),
          application.accepted_terms_at || null,
          application.status === "rejected" ? application.reviewed_at || null : null,
        ]
      );
    }
  }

  async listMemberships(affiliateUserId: string): Promise<ProgramMembership[]> {
    await this.syncMemberships(affiliateUserId);
    const rows = (await query<any[]>(
      `SELECT m.*, b.name AS organization_name, b.slug AS organization_slug, b.logo_url AS organization_logo_url,
              p.name AS program_name, p.slug AS program_slug
       FROM affiliate_program_memberships m
       LEFT JOIN brand_units b ON b.id = m.organization_id
       LEFT JOIN affiliate_programs p ON p.id = m.program_id
       WHERE m.affiliate_user_id = ?
       ORDER BY m.updated_at DESC`,
      [affiliateUserId]
    )) || [];

    return rows.map((r) => ({
      id: String(r.id),
      affiliate_user_id: String(r.affiliate_user_id),
      organization_id: String(r.organization_id),
      program_id: String(r.program_id),
      affiliate_id: r.affiliate_id ? String(r.affiliate_id) : null,
      enrollment_id: r.enrollment_id ? String(r.enrollment_id) : null,
      application_id: r.application_id ? String(r.application_id) : null,
      status: String(r.status),
      source: String(r.source),
      accepted_terms_at: r.accepted_terms_at ? String(r.accepted_terms_at) : null,
      approved_at: r.approved_at ? String(r.approved_at) : null,
      rejected_at: r.rejected_at ? String(r.rejected_at) : null,
      onboarding_completed_at: r.onboarding_completed_at ? String(r.onboarding_completed_at) : null,
      training_status: String(r.training_status || "pending"),
      organization_name: r.organization_name ? String(r.organization_name) : null,
      organization_slug: r.organization_slug ? String(r.organization_slug) : null,
      organization_logo_url: r.organization_logo_url ? String(r.organization_logo_url) : null,
      program_name: r.program_name ? String(r.program_name) : null,
      program_slug: r.program_slug ? String(r.program_slug) : null,
    }));
  }

  async getGlobalDashboard(affiliateUserId: string) {
    await this.ensureSchema();

    const affiliateIds = (await query<any[]>(
      `SELECT id, brand_id, total_clicks, total_sales, total_commission, display_name
       FROM affiliates WHERE affiliate_user_id = ?`,
      [affiliateUserId]
    )) || [];

    const ids = affiliateIds.map((a) => String(a.id));
    const byProgram: Array<{
      organization_id: string;
      organization_name: string;
      organization_slug: string;
      organization_logo_url: string | null;
      program_id: string;
      program_name: string;
      total_commission: number;
      pending_commission: number;
      approved_commission: number;
      paid_commission: number;
      conversions: number;
      clicks: number;
    }> = [];

    let totalClicks = 0;
    let totalSales = 0;
    let totalCommission = 0;
    let pendingCommission = 0;
    let approvedCommission = 0;
    let paidCommission = 0;
    let conversions = 0;
    let leads = 0;

    for (const aff of affiliateIds) {
      totalClicks += Number(aff.total_clicks || 0);
      totalSales += Number(aff.total_sales || 0);
      totalCommission += Number(aff.total_commission || 0);
    }

    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const pending = await queryOne<any>(
        `SELECT COALESCE(SUM(commission_amount), 0) AS total
         FROM affiliate_sales
         WHERE affiliate_id IN (${placeholders}) AND commission_status = 'pending'`,
        ids
      );
      const approved = await queryOne<any>(
        `SELECT COALESCE(SUM(commission_amount), 0) AS total
         FROM affiliate_sales
         WHERE affiliate_id IN (${placeholders}) AND commission_status = 'approved'`,
        ids
      );
      const paid = await queryOne<any>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM affiliate_payouts
         WHERE affiliate_id IN (${placeholders}) AND status = 'paid'`,
        ids
      );
      const conv = await queryOne<any>(
        `SELECT COUNT(*) AS total FROM affiliate_sales WHERE affiliate_id IN (${placeholders})`,
        ids
      );
      const leadCount = await queryOne<any>(
        `SELECT COUNT(*) AS total FROM affiliate_leads
         WHERE affiliate_id IN (${placeholders})
           AND affiliate_status NOT IN ('converted', 'lost')`,
        ids
      );
      // Contatos da organização (distribuição) + contatos de link
      let assignmentOpen = 0;
      try {
        const assignmentCount = await queryOne<any>(
          `SELECT COUNT(*) AS total FROM prospect_assignments
           WHERE affiliate_id IN (${placeholders})
             AND conversion_status != 'converted'
             AND assignment_status NOT IN ('converted', 'lost', 'recycled')`,
          ids
        );
        assignmentOpen = Number(assignmentCount?.total || 0);
      } catch {
        assignmentOpen = 0;
      }

      pendingCommission = Number(pending?.total || 0);
      approvedCommission = Number(approved?.total || 0);
      paidCommission = Number(paid?.total || 0);
      conversions = Number(conv?.total || 0);
      leads = Number(leadCount?.total || 0) + assignmentOpen;
    }

    const memberships = await this.listMemberships(affiliateUserId);
    const activePrograms = memberships.filter((m) => m.status === "approved" || m.status === "pre_approved").length;
    const pendingApplications = memberships.filter((m) => m.status === "pending_application").length;
    const rejectedPrograms = memberships.filter((m) => m.status === "rejected").length;

    for (const m of memberships) {
      if (!m.affiliate_id) continue;
      const stats = await this.affiliates.getDashboardStats(m.affiliate_id, m.organization_id);
      if (!stats) continue;
      byProgram.push({
        organization_id: m.organization_id,
        organization_name: m.organization_name || "",
        organization_slug: m.organization_slug || "",
        organization_logo_url: m.organization_logo_url,
        program_id: m.program_id,
        program_name: m.program_name || "",
        total_commission: Number(stats.commission_accumulated || stats.affiliate?.total_commission || 0),
        pending_commission: Number(stats.commission_pending || 0),
        approved_commission: Number(stats.commission_available || 0),
        paid_commission: 0,
        conversions: Number(stats.conversions || 0),
        clicks: Number(stats.clicks || stats.affiliate?.total_clicks || 0),
      });
    }

    const organizations = (await query<any[]>(
      `SELECT DISTINCT b.id, b.name, b.slug, b.logo_url
       FROM affiliate_app_credentials c
       INNER JOIN brand_units b ON b.id = c.brand_id
       WHERE c.affiliate_user_id = ? AND c.is_active = TRUE
       ORDER BY b.name ASC`,
      [affiliateUserId]
    )) || [];

    return {
      totals: {
        total_commission: totalCommission,
        pending_commission: pendingCommission,
        approved_commission: approvedCommission,
        paid_commission: paidCommission,
        total_clicks: totalClicks,
        total_sales: totalSales,
        conversions,
        leads,
      },
      programs: {
        active: activePrograms,
        pending: pendingApplications,
        rejected: rejectedPrograms,
        total: memberships.length,
      },
      by_program: byProgram,
      organizations: organizations.map((o) => ({
        id: String(o.id),
        name: String(o.name || ""),
        slug: String(o.slug || ""),
        logo_url: o.logo_url ? String(o.logo_url) : null,
      })),
      memberships,
    };
  }

  async listGlobalMarketplace(input: {
    affiliateUserId: string;
    q?: string;
    category?: string;
    limit?: number;
  }) {
    await this.ensureSchema();

    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
    const q = String(input.q || "").trim().toLowerCase();

    let programs = (await query<any[]>(
      `SELECT p.*, b.name AS organization_name, b.slug AS organization_slug,
              b.logo_url AS organization_logo_url, b.primary_color, b.secondary_color
       FROM affiliate_programs p
       INNER JOIN brand_units b ON b.id = p.brand_id
       INNER JOIN affiliate_program_config cfg ON cfg.brand_id = p.brand_id AND cfg.is_enabled = TRUE
       WHERE p.status = 'active' AND p.is_marketplace_visible = TRUE
       ORDER BY p.sort_order ASC, p.name ASC
       LIMIT 200`
    )) || [];

    if (q) {
      programs = programs.filter((p) => {
        const hay = [
          p.name,
          p.description,
          p.organization_name,
          p.slug,
          p.organization_slug,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }

    programs = programs.slice(0, limit);

    const applications = (await query<any[]>(
      `SELECT * FROM affiliate_program_applications WHERE affiliate_user_id = ?`,
      [input.affiliateUserId]
    )) || [];
    const appMap = new Map(applications.map((a) => [String(a.program_id), a]));

    const enrollments = (await query<any[]>(
      `SELECT e.* FROM affiliate_program_enrollments e
       INNER JOIN affiliates a ON a.id = e.affiliate_id
       WHERE e.affiliate_user_id = ?`,
      [input.affiliateUserId]
    )) || [];
    const enrollMap = new Map(enrollments.map((e) => [String(e.program_id), e]));

    const offers = (await query<any[]>(
      `SELECT o.id, o.program_id, o.product_id, o.offer_type, o.title, o.description,
              o.sort_order, o.is_active, p.name AS product_name
       FROM affiliate_program_offers o
       INNER JOIN affiliate_programs pr ON pr.id = o.program_id
       LEFT JOIN products p ON p.id = o.product_id
       WHERE pr.status = 'active' AND o.is_active = TRUE
       ORDER BY o.sort_order ASC`
    )) || [];

    const offersByProgram = new Map<string, any[]>();
    for (const o of offers) {
      const pid = String(o.program_id || "");
      if (!pid) continue;
      const list = offersByProgram.get(pid) || [];
      list.push(o);
      offersByProgram.set(pid, list);
    }

    return programs.map((p) => {
      const application = appMap.get(String(p.id)) || null;
      const enrollment = enrollMap.get(String(p.id)) || null;
      let participation_status = "not_applied";

      if (enrollment) {
        participation_status =
          enrollment.status === "onboarding"
            ? "onboarding"
            : enrollment.status === "active"
              ? "active"
              : String(enrollment.status);
      } else if (application) {
        participation_status = application.status === "pending" ? "pending" : String(application.status);
      }

      return {
        id: String(p.id),
        slug: String(p.slug || ""),
        name: String(p.name || ""),
        description: p.description ? String(p.description) : null,
        commission_mode: String(p.commission_mode || "percentage"),
        commission_value: Number(p.commission_value || 0),
        organization: {
          id: String(p.brand_id),
          name: String(p.organization_name || ""),
          slug: String(p.organization_slug || ""),
          logo_url: p.organization_logo_url ? String(p.organization_logo_url) : null,
          primary_color: p.primary_color ? String(p.primary_color) : null,
          secondary_color: p.secondary_color ? String(p.secondary_color) : null,
        },
        offers: offersByProgram.get(String(p.id)) || [],
        participation_status,
        can_apply:
          !!p.accept_applications &&
          !application &&
          !enrollment &&
          participation_status === "not_applied",
        can_continue: enrollment?.status === "onboarding",
        enrollment: enrollment
          ? { id: String(enrollment.id), status: String(enrollment.status) }
          : null,
      };
    });
  }

  async getProgramDetailForPartner(input: {
    affiliateUserId: string;
    programRef: string;
  }) {
    await this.ensureSchema();
    const ref = String(input.programRef || "").trim();
    if (!ref) throw new Error("Programa inválido");

    let program = await queryOne<any>(
      `SELECT p.*, b.name AS organization_name, b.slug AS organization_slug,
              b.logo_url AS organization_logo_url, b.primary_color, b.secondary_color, b.slogan
       FROM affiliate_programs p
       INNER JOIN brand_units b ON b.id = p.brand_id
       INNER JOIN affiliate_program_config cfg ON cfg.brand_id = p.brand_id AND cfg.is_enabled = TRUE
       WHERE p.id = ? AND p.status = 'active' AND p.is_marketplace_visible = TRUE
       LIMIT 1`,
      [ref]
    );

    if (!program) {
      program = await queryOne<any>(
        `SELECT p.*, b.name AS organization_name, b.slug AS organization_slug,
                b.logo_url AS organization_logo_url, b.primary_color, b.secondary_color, b.slogan
         FROM affiliate_programs p
         INNER JOIN brand_units b ON b.id = p.brand_id
         INNER JOIN affiliate_program_config cfg ON cfg.brand_id = p.brand_id AND cfg.is_enabled = TRUE
         WHERE p.slug = ? AND p.status = 'active' AND p.is_marketplace_visible = TRUE
         LIMIT 1`,
        [ref]
      );
    }

    if (!program) throw new Error("Programa não encontrado ou indisponível");

    const [offers, steps, trainings] = await Promise.all([
      query<any[]>(
        `SELECT o.id, o.title, o.description, o.offer_type, o.product_id, p.name AS product_name
         FROM affiliate_program_offers o
         LEFT JOIN products p ON p.id = o.product_id
         WHERE o.program_id = ? AND o.is_active = TRUE
         ORDER BY o.sort_order ASC`,
        [program.id]
      ),
      query<any[]>(
        `SELECT id, title, step_type, description, is_required, sort_order
         FROM affiliate_program_steps WHERE program_id = ? ORDER BY sort_order ASC`,
        [program.id]
      ),
      query<any[]>(
        `SELECT id, title, description, content_type, is_required, sort_order
         FROM affiliate_program_trainings WHERE program_id = ? ORDER BY sort_order ASC`,
        [program.id]
      ),
    ]);

    const application = await queryOne<any>(
      `SELECT * FROM affiliate_program_applications
       WHERE program_id = ? AND affiliate_user_id = ? LIMIT 1`,
      [program.id, input.affiliateUserId]
    );
    const enrollment = await queryOne<any>(
      `SELECT * FROM affiliate_program_enrollments
       WHERE program_id = ? AND affiliate_user_id = ? LIMIT 1`,
      [program.id, input.affiliateUserId]
    );

    let participation_status = "not_applied";
    if (enrollment) {
      participation_status =
        enrollment.status === "onboarding"
          ? "onboarding"
          : enrollment.status === "active"
            ? "active"
            : String(enrollment.status);
    } else if (application) {
      participation_status = application.status === "pending" ? "pending" : String(application.status);
    }

    const requiredSteps = (steps || []).filter((s) => s.is_required && s.step_type !== "resource_unlock").length;
    const requiredTrainings = (trainings || []).filter((t) => t.is_required).length;

    return {
      id: String(program.id),
      slug: String(program.slug || ""),
      name: String(program.name || ""),
      description: program.description ? String(program.description) : null,
      eligibility_rules: program.eligibility_rules ? String(program.eligibility_rules) : null,
      terms_html: program.terms_html ? String(program.terms_html) : null,
      policies_html: program.policies_html ? String(program.policies_html) : null,
      orientation_html: program.orientation_html ? String(program.orientation_html) : null,
      commission_mode: String(program.commission_mode || "percentage"),
      commission_value: Number(program.commission_value || 0),
      commission_rules: program.commission_rules ? String(program.commission_rules) : null,
      accept_applications: program.accept_applications !== false,
      organization: {
        id: String(program.brand_id),
        name: String(program.organization_name || ""),
        slug: String(program.organization_slug || ""),
        logo_url: program.organization_logo_url ? String(program.organization_logo_url) : null,
        primary_color: program.primary_color ? String(program.primary_color) : null,
        secondary_color: program.secondary_color ? String(program.secondary_color) : null,
        slogan: program.slogan ? String(program.slogan) : null,
      },
      offers: offers || [],
      onboarding: {
        steps_count: (steps || []).length,
        required_steps_count: requiredSteps,
        trainings_count: (trainings || []).length,
        required_trainings_count: requiredTrainings,
        steps: (steps || []).map((s) => ({
          id: String(s.id),
          title: String(s.title || ""),
          step_type: String(s.step_type || ""),
          is_required: !!s.is_required,
        })),
      },
      participation_status,
      can_apply:
        program.accept_applications &&
        !application &&
        !enrollment &&
        participation_status === "not_applied",
      can_continue: enrollment?.status === "onboarding",
      enrollment: enrollment
        ? { id: String(enrollment.id), status: String(enrollment.status) }
        : null,
      application: application
        ? { id: String(application.id), status: String(application.status) }
        : null,
    };
  }

  async applyToProgramGlobal(input: {
    affiliateUserId: string;
    email: string;
    displayName: string;
    phone?: string | null;
    programId: string;
    note?: string;
    acceptedTerms?: boolean;
  }) {
    await this.ensureSchema();

    const program = await queryOne<any>(
      `SELECT p.*, b.user_id AS owner_user_id
       FROM affiliate_programs p
       INNER JOIN brand_units b ON b.id = p.brand_id
       WHERE p.id = ? AND p.status = 'active' LIMIT 1`,
      [input.programId]
    );
    if (!program) throw new Error("Programa não disponível");
    if (!program.accept_applications) throw new Error("Este programa não aceita candidaturas");
    if (!input.acceptedTerms) throw new Error("Aceite os termos do programa para se candidatar");

    const acceptedTermsAt = new Date();

    const { credentialId } = await this.linkToBrand({
      affiliateUserId: input.affiliateUserId,
      email: input.email,
      brandId: String(program.brand_id),
      ownerUserId: String(program.owner_user_id),
      displayName: input.displayName,
      phone: input.phone,
      source: "marketplace_application",
      autoApprove: !!program.auto_approve_applications || !!program.is_default,
    });

    const result = await affiliateProgramsService.applyToProgram({
      ownerUserId: String(program.owner_user_id),
      brandId: String(program.brand_id),
      programId: String(program.id),
      affiliateUserId: input.affiliateUserId,
      credentialId,
      note: input.note,
      source: "marketplace_application",
      acceptedTermsAt,
    });

    await this.syncMemberships(input.affiliateUserId);
    return result;
  }

  async createProgramInvitation(input: {
    ownerUserId: string;
    brandId: string;
    programId: string;
    createdBy: string;
    email?: string | null;
    label?: string | null;
    maxUses?: number | null;
    expiresInDays?: number | null;
  }) {
    await this.ensureSchema();

    const program = await queryOne<any>(
      `SELECT id, name, status FROM affiliate_programs
       WHERE id = ? AND brand_id = ? AND owner_user_id = ? LIMIT 1`,
      [input.programId, input.brandId, input.ownerUserId]
    );
    if (!program) throw new Error("Programa não encontrado");
    if (String(program.status || "") !== "active") {
      throw new Error("Ative o programa antes de gerar convites");
    }

    const id = randomUUID();
    const inviteCode = generateInviteCode();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86400000)
      : null;

    await query(
      `INSERT INTO affiliate_invitations
       (id, program_id, organization_id, owner_user_id, invite_code, email, status,
        expires_at, label, max_uses, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        id,
        input.programId,
        input.brandId,
        input.ownerUserId,
        inviteCode,
        input.email ? String(input.email).trim().toLowerCase() : null,
        expiresAt,
        input.label ? String(input.label).trim() : null,
        input.maxUses != null ? Number(input.maxUses) : null,
        input.createdBy,
      ]
    );

    const invitation = await queryOne<any>(
      `SELECT * FROM affiliate_invitations WHERE id = ? LIMIT 1`,
      [id]
    );

    return {
      invitation,
      invite_code: inviteCode,
      invite_path: buildInvitePath(inviteCode),
    };
  }

  async listProgramInvitations(input: {
    ownerUserId: string;
    brandId: string;
    programId: string;
  }) {
    await this.ensureSchema();
    const rows = (await query<any[]>(
      `SELECT * FROM affiliate_invitations
       WHERE program_id = ? AND organization_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC`,
      [input.programId, input.brandId, input.ownerUserId]
    )) || [];

    return rows.map((row) => ({
      ...row,
      invite_path: buildInvitePath(String(row.invite_code || "")),
    }));
  }

  async revokeInvitation(input: {
    ownerUserId: string;
    brandId: string;
    invitationId: string;
  }) {
    await this.ensureSchema();
    const invite = await queryOne<any>(
      `SELECT id FROM affiliate_invitations
       WHERE id = ? AND organization_id = ? AND owner_user_id = ? LIMIT 1`,
      [input.invitationId, input.brandId, input.ownerUserId]
    );
    if (!invite) throw new Error("Convite não encontrado");

    await query(
      `UPDATE affiliate_invitations SET status = 'revoked', updated_at = NOW() WHERE id = ?`,
      [input.invitationId]
    );
    return queryOne<any>(`SELECT * FROM affiliate_invitations WHERE id = ? LIMIT 1`, [input.invitationId]);
  }

  async getInvitationPreview(inviteCode: string) {
    await this.ensureSchema();
    const code = String(inviteCode || "").trim();
    if (!code) throw new Error("Convite inválido");

    const invite = await queryOne<any>(
      `SELECT i.*, p.name AS program_name, p.slug AS program_slug, p.description AS program_description,
              p.commission_mode, p.commission_value, p.terms_html,
              b.name AS organization_name, b.slug AS organization_slug, b.logo_url AS organization_logo_url,
              b.primary_color, b.secondary_color
       FROM affiliate_invitations i
       INNER JOIN affiliate_programs p ON p.id = i.program_id
       INNER JOIN brand_units b ON b.id = i.organization_id
       WHERE i.invite_code = ? LIMIT 1`,
      [code]
    );
    if (!invite) throw new Error("Convite não encontrado");
    if (String(invite.status || "") !== "active") throw new Error("Este convite não está mais ativo");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou");
    }
    if (invite.max_uses != null && Number(invite.accepted_count || 0) >= Number(invite.max_uses)) {
      throw new Error("Este convite atingiu o limite de usos");
    }

    return {
      invite_code: String(invite.invite_code),
      email_restricted: invite.email ? String(invite.email) : null,
      label: invite.label ? String(invite.label) : null,
      program: {
        id: String(invite.program_id),
        name: String(invite.program_name || ""),
        slug: String(invite.program_slug || ""),
        description: invite.program_description ? String(invite.program_description) : null,
        commission_mode: String(invite.commission_mode || "percentage"),
        commission_value: Number(invite.commission_value || 0),
        terms_html: invite.terms_html ? String(invite.terms_html) : null,
      },
      organization: {
        id: String(invite.organization_id),
        name: String(invite.organization_name || ""),
        slug: String(invite.organization_slug || ""),
        logo_url: invite.organization_logo_url ? String(invite.organization_logo_url) : null,
        primary_color: invite.primary_color ? String(invite.primary_color) : null,
        secondary_color: invite.secondary_color ? String(invite.secondary_color) : null,
      },
    };
  }

  private async getActiveInvitation(inviteCode: string) {
    const preview = await this.getInvitationPreview(inviteCode);
    const invite = await queryOne<any>(
      `SELECT * FROM affiliate_invitations WHERE invite_code = ? LIMIT 1`,
      [inviteCode]
    );
    if (!invite) throw new Error("Convite não encontrado");
    return { invite, preview };
  }

  async acceptInvitation(input: {
    affiliateUserId: string;
    email: string;
    displayName: string;
    phone?: string | null;
    inviteCode: string;
  }) {
    await this.ensureSchema();
    const { invite, preview } = await this.getActiveInvitation(input.inviteCode);

    if (invite.email && String(invite.email).toLowerCase() !== String(input.email).toLowerCase()) {
      throw new Error("Este convite é válido apenas para o e-mail indicado pela organização");
    }

    const program = await queryOne<any>(
      `SELECT p.*, b.user_id AS owner_user_id
       FROM affiliate_programs p
       INNER JOIN brand_units b ON b.id = p.brand_id
       WHERE p.id = ? AND p.status = 'active' LIMIT 1`,
      [invite.program_id]
    );
    if (!program) throw new Error("Programa não disponível");

    const existingEnrollment = await queryOne<any>(
      `SELECT e.id FROM affiliate_program_enrollments e
       WHERE e.program_id = ? AND e.affiliate_user_id = ? LIMIT 1`,
      [invite.program_id, input.affiliateUserId]
    );
    if (existingEnrollment) {
      await this.syncMemberships(input.affiliateUserId);
      return {
        already_member: true,
        enrollment_id: String(existingEnrollment.id),
        program: preview.program,
        organization: preview.organization,
      };
    }

    const { credentialId } = await this.linkToBrand({
      affiliateUserId: input.affiliateUserId,
      email: input.email,
      brandId: String(program.brand_id),
      ownerUserId: String(program.owner_user_id),
      displayName: input.displayName,
      phone: input.phone,
      autoApprove: true,
    });

    const result = await affiliateProgramsService.applyToProgram({
      ownerUserId: String(program.owner_user_id),
      brandId: String(program.brand_id),
      programId: String(program.id),
      affiliateUserId: input.affiliateUserId,
      credentialId,
      note: invite.label ? `Convite: ${invite.label}` : "Convite direto da organização",
      source: "direct_invite",
      forceAutoApprove: true,
      bypassApplicationGate: true,
    });

    await query(
      `UPDATE affiliate_invitations
       SET accepted_count = accepted_count + 1, updated_at = NOW()
       WHERE id = ?`,
      [invite.id]
    );

    await query(
      `INSERT INTO affiliate_program_memberships
       (id, affiliate_user_id, organization_id, program_id, affiliate_id, enrollment_id,
        application_id, status, source, approved_at, training_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pre_approved', 'direct_invite', NOW(), 'pending')
       ON DUPLICATE KEY UPDATE
         affiliate_id = VALUES(affiliate_id),
         enrollment_id = VALUES(enrollment_id),
         application_id = VALUES(application_id),
         status = VALUES(status),
         source = 'direct_invite',
         approved_at = NOW(),
         updated_at = NOW()`,
      [
        randomUUID(),
        input.affiliateUserId,
        program.brand_id,
        program.id,
        result.application?.affiliate_id || null,
        result.enrollment?.id || null,
        result.application?.id || null,
      ]
    ).catch(() => undefined);

    await this.syncMemberships(input.affiliateUserId);

    return {
      already_member: false,
      auto_approved: true,
      application: result.application,
      enrollment: result.enrollment,
      program: preview.program,
      organization: preview.organization,
    };
  }

  async listGlobalAlerts(affiliateUserId: string, limit = 50) {
    await this.ensureSchema();
    const { affiliateDistributionService } = await import("./affiliateDistribution");
    await affiliateDistributionService.ensureSchema();

    const rows = await query<any[]>(
      `SELECT a.*, b.name AS organization_name, b.slug AS organization_slug
       FROM affiliate_alerts a
       INNER JOIN brand_units b ON b.id = a.brand_id
       WHERE a.affiliate_user_id = ?
       ORDER BY a.is_read ASC, a.created_at DESC
       LIMIT ?`,
      [affiliateUserId, Math.min(Math.max(limit, 1), 50)]
    );

    return (rows || []).map((r) => ({
      id: String(r.id),
      brand_id: r.brand_id ? String(r.brand_id) : null,
      alert_type: String(r.alert_type || ""),
      severity: String(r.severity || "info"),
      title: String(r.title || ""),
      body: r.body ? String(r.body) : null,
      action_path: r.action_path ? String(r.action_path) : null,
      organization_name: r.organization_name ? String(r.organization_name) : null,
      organization_slug: r.organization_slug ? String(r.organization_slug) : null,
      is_read: !!r.is_read,
      created_at: r.created_at ? String(r.created_at) : null,
    }));
  }

  async markGlobalAlertRead(alertId: string, affiliateUserId: string) {
    await this.ensureSchema();
    const { affiliateDistributionService } = await import("./affiliateDistribution");
    await affiliateDistributionService.ensureSchema();
    await query(
      `UPDATE affiliate_alerts SET is_read = TRUE
       WHERE id = ? AND affiliate_user_id = ?`,
      [alertId, affiliateUserId]
    );
  }

  async markAllGlobalAlertsRead(affiliateUserId: string) {
    await this.ensureSchema();
    const { affiliateDistributionService } = await import("./affiliateDistribution");
    await affiliateDistributionService.ensureSchema();
    await query(
      `UPDATE affiliate_alerts SET is_read = TRUE
       WHERE affiliate_user_id = ? AND is_read = FALSE`,
      [affiliateUserId]
    );
  }
}

export const affiliateGlobalService = new AffiliateGlobalService();
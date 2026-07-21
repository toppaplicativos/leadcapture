import { getPool, query, queryOne } from "../config/database";

export type InstanceOwnerType = "admin" | "affiliate";

export type InstanceAuthScope = {
  actorUserId: string;
  ownerUserId: string;
  brandId: string | null;
  isAffiliate: boolean;
  /** Filtro opcional na listagem admin */
  ownerTypeFilter?: InstanceOwnerType | null;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

function resolveAuthUserId(req: any): string | undefined {
  const raw = req?.userId || req?.user?.userId || req?.user?.sub;
  const userId = String(raw || "").trim();
  return userId || undefined;
}

export function resolveInstanceAuthScope(req: any): InstanceAuthScope | null {
  const user = req?.user || {};
  const credentialType = String(user.credential_type || "").trim().toLowerCase();

  if (credentialType === "afiliado") {
    const ownerUserId = String(user.owner_user_id || "").trim();
    const actorUserId = String(user.userId || user.sub || "").trim();
    const brandId = String(user.brand_id || req?.headers?.["x-brand-id"] || "").trim() || null;
    if (!ownerUserId || !actorUserId) return null;
    return { actorUserId, ownerUserId, brandId, isAffiliate: true };
  }

  const actorUserId = resolveAuthUserId(req);
  if (!actorUserId) return null;
  return { actorUserId, ownerUserId: actorUserId, brandId: null, isAffiliate: false };
}

export function buildOwnerMetaForCreate(scope: InstanceAuthScope): {
  ownerType: InstanceOwnerType;
  ownerActorId: string;
} {
  if (scope.isAffiliate) {
    return { ownerType: "affiliate", ownerActorId: scope.actorUserId };
  }
  return { ownerType: "admin", ownerActorId: scope.actorUserId };
}

function slugifyBrandCode(raw: unknown): string {
  const s = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 14);
  return s || "org";
}

/**
 * Nome/código automático de sessão do afiliado — sem input do usuário.
 * Formato: {slugOrg}-WA-001
 * Fila global sequencial por marca (não reinicia por afiliado).
 * Ex.: afiliado A → marca-WA-001, afiliado B → marca-WA-002, A de novo → marca-WA-003.
 * Serve de rastreio: cada sessão amarra contatos à organização e ao afiliado dono.
 */
export async function allocateAffiliateSessionCode(input: {
  ownerUserId: string;
  brandId: string;
  actorUserId: string;
}): Promise<{ name: string; trackingCode: string; seq: number; brandSlug: string; brandName: string | null }> {
  const brand = await queryOne<{ slug?: string | null; name?: string | null }>(
    `SELECT slug, name FROM brand_units WHERE id = ? LIMIT 1`,
    [input.brandId],
  );
  const brandSlug = slugifyBrandCode(brand?.slug || brand?.name || "org");
  const brandName = brand?.name ? String(brand.name) : null;

  await ensureWhatsAppInstanceOwnerSchema();

  /* Reserva o próximo número sob lock de linha (fila global da marca).
     Dois requests simultâneos não geram o mesmo código. */
  const connection = await getPool().getConnection();
  try {
    await connection.query("BEGIN");
    await connection.execute(
      `INSERT IGNORE INTO brand_whatsapp_session_sequences
         (brand_id, next_seq)
       VALUES (?, 1)`,
      [input.brandId],
    );
    const [counterRows] = await connection.execute<any[]>(
      `SELECT next_seq
       FROM brand_whatsapp_session_sequences
       WHERE brand_id = ?
       FOR UPDATE`,
      [input.brandId],
    );
    /* Todas as sessões da marca (afiliado + sistema) que seguem o padrão WA-NNN */
    const [existingRows] = await connection.execute<any[]>(
      `SELECT name FROM whatsapp_instances WHERE brand_id = ?`,
      [input.brandId],
    );

    const used = new Set<number>();
    const pattern = new RegExp(`^${brandSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-WA-(\\d+)`, "i");
    for (const row of existingRows || []) {
      const match = String(row.name || "").match(pattern);
      if (match) used.add(Number(match[1]));
    }
    let seq = Math.max(1, Number(counterRows?.[0]?.next_seq || 1));
    /* Se o contador ficou atrás (legado / migração), sobe a partir do maior usado */
    if (used.size > 0) {
      const maxUsed = Math.max(...used);
      if (seq <= maxUsed) seq = maxUsed + 1;
    }
    while (used.has(seq)) seq += 1;
    if (seq > 999) {
      throw new Error("Limite de 999 sessões WhatsApp atingido para esta organização");
    }

    await connection.execute(
      `UPDATE brand_whatsapp_session_sequences
       SET next_seq = ?, updated_at = NOW()
       WHERE brand_id = ?`,
      [seq + 1, input.brandId],
    );
    await connection.query("COMMIT");
    const trackingCode = `${brandSlug}-WA-${String(seq).padStart(3, "0")}`;
    return { name: trackingCode, trackingCode, seq, brandSlug, brandName };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const row = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(row?.total || 0) > 0;
}

export async function ensureWhatsAppInstanceOwnerSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaPromise) {
    await schemaPromise;
    return;
  }

  schemaPromise = (async () => {
    const hasOwnerType = await columnExists("whatsapp_instances", "owner_type");
    if (!hasOwnerType) {
      await query(
        `ALTER TABLE whatsapp_instances
         ADD COLUMN owner_type ENUM('admin','affiliate') NOT NULL DEFAULT 'admin'`,
      );
    }

    const hasOwnerActor = await columnExists("whatsapp_instances", "owner_actor_id");
    if (!hasOwnerActor) {
      await query(`ALTER TABLE whatsapp_instances ADD COLUMN owner_actor_id VARCHAR(36) NULL`);
    }

    await query(
      `UPDATE whatsapp_instances
       SET owner_type = 'admin', owner_actor_id = COALESCE(owner_actor_id, created_by)
       WHERE owner_actor_id IS NULL OR owner_actor_id = ''`,
    );

    try {
      await query(`CREATE INDEX idx_whatsapp_instances_owner_actor ON whatsapp_instances (owner_actor_id)`);
    } catch {
      // index may already exist
    }
    try {
      await query(`CREATE INDEX idx_whatsapp_instances_owner_type ON whatsapp_instances (owner_type)`);
    } catch {
      // index may already exist
    }
    await query(
      `CREATE TABLE IF NOT EXISTS affiliate_whatsapp_session_sequences (
         owner_user_id VARCHAR(36) NOT NULL,
         brand_id VARCHAR(36) NOT NULL,
         actor_user_id VARCHAR(36) NOT NULL,
         next_seq INT NOT NULL DEFAULT 1,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (owner_user_id, brand_id, actor_user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    /* Fila global sequencial por marca (sem reinício por afiliado) */
    await query(
      `CREATE TABLE IF NOT EXISTS brand_whatsapp_session_sequences (
         brand_id VARCHAR(36) NOT NULL,
         next_seq INT NOT NULL DEFAULT 1,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (brand_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    schemaReady = true;
  })();

  await schemaPromise;
}

export type InstanceAccessFilter = {
  whereSql: string;
  params: unknown[];
};

/**
 * Filtro de listagem / acesso por tenant + marca + dono (admin vs afiliado).
 *
 * Admin + brandId: prioriza `brand_id` da marca ativa (todas as sessões da marca,
 * sistema e afiliado). Também inclui legado sem brand_id do dono da marca.
 * Afiliado: só as próprias sessões da marca.
 */
export function buildInstanceAccessFilter(
  scope: InstanceAuthScope,
  brandId?: string | null,
  alias = "wi",
  options?: { brandOwnerUserId?: string | null },
): InstanceAccessFilter {
  const normalizedBrand = String(brandId || scope.brandId || "").trim();
  const brandOwner = String(options?.brandOwnerUserId || scope.ownerUserId || "").trim();
  const params: unknown[] = [];
  let where: string;
  if (normalizedBrand) {
    if (scope.isAffiliate) {
      where = `${alias}.created_by = ? AND ${alias}.brand_id = ?`;
      params.push(scope.ownerUserId, normalizedBrand);
    } else {
      // Admin: tudo com brand_id da marca + legado null do dono da marca
      where = `(
        ${alias}.brand_id = ?
        OR (
          ${alias}.brand_id IS NULL
          AND ${alias}.created_by = ?
        )
      )`;
      params.push(normalizedBrand, brandOwner || scope.ownerUserId);
    }
  } else if (scope.isAffiliate) {
    where = `${alias}.created_by = ? AND ${alias}.brand_id IS NOT NULL`;
    params.push(scope.ownerUserId);
  } else {
    where = `${alias}.created_by = ?`;
    params.push(scope.ownerUserId);
  }

  if (scope.isAffiliate) {
    where += ` AND ${alias}.owner_type = 'affiliate' AND ${alias}.owner_actor_id = ?`;
    params.push(scope.actorUserId);
  } else if (scope.ownerTypeFilter === "admin" || scope.ownerTypeFilter === "affiliate") {
    where += ` AND ${alias}.owner_type = ?`;
    params.push(scope.ownerTypeFilter);
  }

  return { whereSql: where, params };
}

export async function instanceBelongsToScope(
  instanceId: string,
  scope: InstanceAuthScope,
  brandId?: string | null,
): Promise<boolean> {
  await ensureWhatsAppInstanceOwnerSchema();
  const filter = buildInstanceAccessFilter(scope, brandId, "wi");
  const row = await queryOne<{ id: string }>(
    `SELECT wi.id FROM whatsapp_instances wi
     WHERE wi.id = ? AND ${filter.whereSql}
     LIMIT 1`,
    [instanceId, ...filter.params],
  );
  return !!row;
}

/** Fragmento SQL para JOIN whatsapp_instances em inbox / conversas. */
/** IDs de instâncias admin (sistema) elegíveis para campanhas e disparos em massa. */
export async function listSystemDispatchInstanceIds(
  ownerUserId: string,
  brandId?: string | null,
): Promise<string[]> {
  await ensureWhatsAppInstanceOwnerSchema();
  const params: unknown[] = [ownerUserId];
  let where = "created_by = ? AND (owner_type = 'admin' OR owner_type IS NULL)";
  const normalizedBrand = String(brandId || "").trim();
  if (normalizedBrand) {
    where += " AND brand_id = ?";
    params.push(normalizedBrand);
  }
  const rows = await query<{ id: string }[]>(
    `SELECT id FROM whatsapp_instances WHERE ${where}`,
    params,
  );
  return (Array.isArray(rows) ? rows : []).map((r) => String(r.id));
}

export function buildInboxInstanceClause(
  scope: InstanceAuthScope,
  brandId?: string | null,
  alias = "i",
): { clause: string; params: unknown[] } {
  const filter = buildInstanceAccessFilter(scope, brandId, alias);
  return { clause: ` AND ${filter.whereSql}`, params: filter.params };
}

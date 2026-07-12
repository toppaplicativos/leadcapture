import { query, queryOne } from "../config/database";

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
 * Formato: {slugOrg}-WA-001 (sequencial por afiliado+marca).
 * Serve de rastreio: cada sessão amarra contatos à organização e ao afiliado.
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

  const existing = await query<{ name: string }[]>(
    `SELECT name FROM whatsapp_instances
     WHERE created_by = ?
       AND brand_id = ?
       AND owner_type = 'affiliate'
       AND owner_actor_id = ?
     ORDER BY created_at ASC`,
    [input.ownerUserId, input.brandId, input.actorUserId],
  );

  const used = new Set<number>();
  const prefix = `${brandSlug}-WA-`;
  for (const row of existing || []) {
    const n = String(row.name || "");
    const m = n.match(new RegExp(`^${brandSlug}-WA-(\\d+)`, "i"));
    if (m) used.add(Number(m[1]));
  }

  let seq = 1;
  while (used.has(seq)) seq += 1;
  // Soft-cap por afiliado/marca (muitas sessões possíveis, sem estourar plano admin)
  if (seq > 50) {
    throw new Error("Limite de 50 sessões WhatsApp por organização atingido para este afiliado");
  }

  const trackingCode = `${prefix}${String(seq).padStart(3, "0")}`;
  return {
    name: trackingCode,
    trackingCode,
    seq,
    brandSlug,
    brandName,
  };
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

    schemaReady = true;
  })();

  await schemaPromise;
}

export type InstanceAccessFilter = {
  whereSql: string;
  params: unknown[];
};

/** Filtro de listagem / acesso por tenant (created_by) + marca + dono (admin vs afiliado). */
export function buildInstanceAccessFilter(
  scope: InstanceAuthScope,
  brandId?: string | null,
  alias = "wi",
): InstanceAccessFilter {
  const params: unknown[] = [scope.ownerUserId];
  let where = `${alias}.created_by = ?`;

  const normalizedBrand = String(brandId || scope.brandId || "").trim();
  if (normalizedBrand) {
    where += ` AND ${alias}.brand_id = ?`;
    params.push(normalizedBrand);
  } else if (scope.isAffiliate) {
    where += ` AND ${alias}.brand_id IS NOT NULL`;
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
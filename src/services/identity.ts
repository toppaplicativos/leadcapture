/**
 * IdentityService — schema + data migration for account_kind / role normalization.
 * Safe to call on every boot (idempotent).
 */

import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import {
  AccountKind,
  canonicalRoleForKind,
  normalizeAccountKind,
} from "../config/identity"

let _ready = false
let _readyPromise: Promise<void> | null = null

export class IdentityService {
  async ensureSchema(): Promise<void> {
    if (_ready) return
    if (_readyPromise) return _readyPromise
    _readyPromise = this._run().finally(() => {
      _readyPromise = null
    })
    return _readyPromise
  }

  private async _run(): Promise<void> {
    try {
      await this._ensureAccountKindColumn()
      await this._migrateLegacyAdminsToOrg()
      await this._backfillAccountKind()
      _ready = true
      logger.info("[identity] schema + normalization ready")
    } catch (err: any) {
      logger.error(`[identity] ensureSchema failed: ${err?.message || err}`)
      throw err
    }
  }

  private async _columnExists(column: string): Promise<boolean> {
    try {
      const row = await queryOne<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'users'
             AND column_name = ?
         ) AS exists`,
        [column],
      )
      return Boolean(row?.exists)
    } catch {
      try {
        const row = await queryOne<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [column],
        )
        return Number(row?.total || 0) > 0
      } catch {
        return false
      }
    }
  }

  private async _ensureAccountKindColumn(): Promise<void> {
    const has = await this._columnExists("account_kind")
    if (has) return
    try {
      await query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_kind VARCHAR(32)`,
      )
    } catch {
      try {
        await query(`ALTER TABLE users ADD COLUMN account_kind VARCHAR(32) NULL`)
      } catch (err: any) {
        if (!/duplicate|already exists/i.test(String(err?.message || ""))) {
          throw err
        }
      }
    }
    try {
      await query(
        `CREATE INDEX IF NOT EXISTS idx_users_account_kind ON users (account_kind)`,
      )
    } catch {
      /* index optional */
    }
  }

  /**
   * Core migration:
   * - users with role=admin AND NOT is_super_admin → role=org, account_kind=org
   * - is_super_admin → account_kind=platform (role stays admin for master panel)
   */
  private async _migrateLegacyAdminsToOrg(): Promise<void> {
    // Platform masters first
    try {
      const r1 = await query(
        `UPDATE users
         SET account_kind = 'platform'
         WHERE COALESCE(is_super_admin, false) = true
           AND (account_kind IS NULL OR account_kind <> 'platform')`,
      )
      const n1 = Number((r1 as any)?.affectedRows || (r1 as any)?.rowCount || 0)
      if (n1 > 0) logger.info(`[identity] platform masters tagged: ${n1}`)
    } catch (err: any) {
      logger.warn(`[identity] platform tag: ${err?.message}`)
    }

    // Tenant owners: admin → org
    try {
      const r2 = await query(
        `UPDATE users
         SET role = 'org',
             account_kind = 'org'
         WHERE LOWER(role) = 'admin'
           AND COALESCE(is_super_admin, false) = false`,
      )
      const n2 = Number((r2 as any)?.affectedRows || (r2 as any)?.rowCount || 0)
      if (n2 > 0) logger.info(`[identity] migrated legacy admin → org: ${n2}`)
    } catch (err: any) {
      // role column might still be ENUM without 'org' — widen first
      logger.warn(`[identity] admin→org update failed, trying widen: ${err?.message}`)
      await this._widenRoleColumn()
      const r3 = await query(
        `UPDATE users
         SET role = 'org',
             account_kind = 'org'
         WHERE LOWER(role) = 'admin'
           AND COALESCE(is_super_admin, false) = false`,
      )
      const n3 = Number((r3 as any)?.affectedRows || (r3 as any)?.rowCount || 0)
      if (n3 > 0) logger.info(`[identity] migrated legacy admin → org (retry): ${n3}`)
    }
  }

  private async _widenRoleColumn(): Promise<void> {
    // Postgres: role is typically VARCHAR already. MySQL ENUM needs ALTER.
    try {
      await query(
        `ALTER TABLE users MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT 'operator'`,
      )
    } catch {
      try {
        await query(
          `ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(32)`,
        )
      } catch {
        /* ignore — already wide */
      }
    }
  }

  private async _backfillAccountKind(): Promise<void> {
    const maps: Array<{ sql: string; label: string }> = [
      {
        label: "affiliate",
        sql: `UPDATE users SET account_kind = 'affiliate'
              WHERE account_kind IS NULL AND LOWER(role) = 'affiliate'`,
      },
      {
        label: "staff-manager",
        sql: `UPDATE users SET account_kind = 'staff'
              WHERE account_kind IS NULL AND LOWER(role) IN ('manager','operator')`,
      },
      {
        label: "consumer",
        sql: `UPDATE users SET account_kind = 'consumer'
              WHERE account_kind IS NULL AND LOWER(role) = 'consumer'`,
      },
      {
        label: "org-by-brand-owner",
        sql: `UPDATE users u SET account_kind = 'org', role = CASE WHEN LOWER(u.role) = 'admin' THEN 'org' ELSE u.role END
              WHERE u.account_kind IS NULL
                AND COALESCE(u.is_super_admin, false) = false
                AND EXISTS (SELECT 1 FROM brand_units b WHERE b.user_id = u.id)`,
      },
      {
        label: "org-fallback",
        sql: `UPDATE users SET account_kind = 'org'
              WHERE account_kind IS NULL AND LOWER(role) IN ('org','admin')
                AND COALESCE(is_super_admin, false) = false`,
      },
    ]
    for (const m of maps) {
      try {
        const r = await query(m.sql)
        const n = Number((r as any)?.affectedRows || (r as any)?.rowCount || 0)
        if (n > 0) logger.info(`[identity] backfill ${m.label}: ${n}`)
      } catch (err: any) {
        logger.warn(`[identity] backfill ${m.label}: ${err?.message}`)
      }
    }
  }

  /** Safe write helper for new users */
  resolveCreateIdentity(input: {
    kind?: AccountKind | string | null
    role?: string | null
    isSuperAdmin?: boolean
  }): { account_kind: AccountKind; role: string } {
    const kind = normalizeAccountKind(input.kind, {
      role: input.role,
      isSuperAdmin: input.isSuperAdmin,
    })
    // Never allow self-serve platform
    const safeKind: AccountKind =
      kind === "platform" && !input.isSuperAdmin ? "org" : kind
    // Never allow self-serve admin role
    let role = String(input.role || "").toLowerCase()
    if (role === "admin" && !input.isSuperAdmin) role = "org"
    return {
      account_kind: safeKind,
      role: canonicalRoleForKind(safeKind, role || null),
    }
  }
}

export const identityService = new IdentityService()

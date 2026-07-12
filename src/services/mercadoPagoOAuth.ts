/**
 * Mercado Pago OAuth (Authorization Code + PKCE S256) for multitenant brands.
 * Platform holds one MP application; each organization (brand_units) authorizes independently.
 * Tokens encrypted at rest via AES-256-GCM (same pattern as paymentConfig).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  createHmac,
} from "crypto"
import axios from "axios"
import { query, queryOne } from "../config/database"
import { logger } from "../utils/logger"
import { getGatewayAdapter } from "./paymentGatewayAdapters"

export type MpEnvironment = "test" | "production"
export type MpConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "refreshing"
  | "reauthorization_required"
  | "disconnected"
  | "error"

export type MpConnectionPublic = {
  id: string
  organization_id: string
  provider: "mercado_pago"
  environment: MpEnvironment
  status: MpConnectionStatus
  provider_user_id: string | null
  provider_account_id: string | null
  scope: string | null
  connected_at: string | null
  last_refreshed_at: string | null
  last_verified_at: string | null
  disconnected_at: string | null
  reauthorization_required_at: string | null
  last_error_code: string | null
  last_error_message_sanitized: string | null
  token_expires_at: string | null
  /** masked identifier only */
  account_label: string | null
}

type MpConnectionRow = MpConnectionPublic & {
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_type: string | null
  connected_by_user_id: string | null
  metadata_json: any
  owner_user_id: string | null
}

const PROVIDER = "mercado_pago"
const OAUTH_AUTH_URL = "https://auth.mercadopago.com/authorization"
const OAUTH_TOKEN_URL = "https://api.mercadopago.com/oauth/token"
const API_BASE = "https://api.mercadopago.com"
const OAUTH_TTL_MS = 10 * 60 * 1000
const REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000 // 15 days before expiry
const refreshLocks = new Map<string, Promise<string>>()

let schemaReady = false
let schemaPromise: Promise<void> | null = null

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function getEncryptionKey(): Buffer {
  const source =
    process.env.MERCADO_PAGO_TOKEN_ENCRYPTION_KEY ||
    process.env.PAYMENT_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "lead-system-change-payment-key"
  return createHash("sha256").update(source).digest()
}

function encryptSecret(value?: string | null): string | null {
  const plain = String(value || "").trim()
  if (!plain) return null
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

function decryptSecret(value?: string | null): string | null {
  const payload = String(value || "").trim()
  if (!payload) return null
  const [ivB64, tagB64, dataB64] = payload.split(":")
  if (!ivB64 || !tagB64 || !dataB64) return null
  try {
    const key = getEncryptionKey()
    const iv = Buffer.from(ivB64, "base64")
    const tag = Buffer.from(tagB64, "base64")
    const data = Buffer.from(dataB64, "base64")
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function mercadoPagoConfig() {
  const enabled = String(process.env.MERCADO_PAGO_ENABLED || "false").toLowerCase() === "true"
  const environment = (String(process.env.MERCADO_PAGO_ENVIRONMENT || "test").toLowerCase() ===
  "production"
    ? "production"
    : "test") as MpEnvironment
  const clientId = String(process.env.MERCADO_PAGO_CLIENT_ID || "").trim()
  const clientSecret = String(process.env.MERCADO_PAGO_CLIENT_SECRET || "").trim()
  const publicKey = String(process.env.MERCADO_PAGO_PUBLIC_KEY || "").trim()
  const redirectUri = String(process.env.MERCADO_PAGO_REDIRECT_URI || "").trim()
  const webhookUrl = String(process.env.MERCADO_PAGO_WEBHOOK_URL || "").trim()
  const webhookSecret = String(process.env.MERCADO_PAGO_WEBHOOK_SECRET || "").trim()
  const currency = String(process.env.MERCADO_PAGO_DEFAULT_CURRENCY || "BRL").toUpperCase()
  const feeEnabled =
    String(process.env.MERCADO_PAGO_PLATFORM_FEE_ENABLED || "false").toLowerCase() === "true"
  const feeType = String(process.env.MERCADO_PAGO_PLATFORM_FEE_TYPE || "percentage").toLowerCase()
  const feeValue = Number(process.env.MERCADO_PAGO_PLATFORM_FEE_VALUE || 0)
  const configured = Boolean(clientId && clientSecret && redirectUri)

  return {
    enabled,
    environment,
    clientId,
    clientSecret,
    publicKey,
    redirectUri,
    webhookUrl,
    webhookSecret,
    currency,
    feeEnabled,
    feeType: feeType === "fixed" ? "fixed" : "percentage",
    feeValue: Number.isFinite(feeValue) ? feeValue : 0,
    configured,
  }
}

function toPublic(row: any): MpConnectionPublic {
  const uid = String(row.provider_user_id || "").trim()
  return {
    id: row.id,
    organization_id: row.organization_id,
    provider: PROVIDER,
    environment: row.environment,
    status: row.status,
    provider_user_id: row.provider_user_id,
    provider_account_id: row.provider_account_id,
    scope: row.scope,
    connected_at: row.connected_at,
    last_refreshed_at: row.last_refreshed_at,
    last_verified_at: row.last_verified_at,
    disconnected_at: row.disconnected_at,
    reauthorization_required_at: row.reauthorization_required_at,
    last_error_code: row.last_error_code,
    last_error_message_sanitized: row.last_error_message_sanitized,
    token_expires_at: row.token_expires_at,
    account_label: uid ? `MP ···${uid.slice(-6)}` : null,
  }
}

export class MercadoPagoOAuthService {
  async ensureSchema(): Promise<void> {
    if (schemaReady) return
    if (schemaPromise) return schemaPromise
    schemaPromise = this._boot().finally(() => {
      schemaPromise = null
    })
    return schemaPromise
  }

  private async _boot(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS payment_provider_connections (
        id VARCHAR(36) PRIMARY KEY,
        organization_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NULL,
        provider VARCHAR(40) NOT NULL DEFAULT 'mercado_pago',
        environment VARCHAR(16) NOT NULL DEFAULT 'test',
        status VARCHAR(40) NOT NULL DEFAULT 'not_connected',
        provider_account_id VARCHAR(120) NULL,
        provider_user_id VARCHAR(120) NULL,
        scope TEXT NULL,
        access_token_encrypted TEXT NULL,
        refresh_token_encrypted TEXT NULL,
        token_type VARCHAR(40) NULL,
        token_expires_at TIMESTAMPTZ NULL,
        connected_by_user_id VARCHAR(36) NULL,
        connected_at TIMESTAMPTZ NULL,
        last_refreshed_at TIMESTAMPTZ NULL,
        last_verified_at TIMESTAMPTZ NULL,
        disconnected_at TIMESTAMPTZ NULL,
        reauthorization_required_at TIMESTAMPTZ NULL,
        last_error_code VARCHAR(80) NULL,
        last_error_message_sanitized TEXT NULL,
        metadata_json JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ppc_org_provider_env_active
      ON payment_provider_connections (organization_id, provider, environment)
      WHERE status NOT IN ('disconnected')
    `).catch(async () => {
      await query(
        `CREATE INDEX IF NOT EXISTS idx_ppc_org_provider_env
         ON payment_provider_connections (organization_id, provider, environment)`,
      ).catch(() => undefined)
    })
    await query(
      `CREATE INDEX IF NOT EXISTS idx_ppc_provider_user ON payment_provider_connections (provider_user_id)`,
    ).catch(() => undefined)
    await query(
      `CREATE INDEX IF NOT EXISTS idx_ppc_token_expires ON payment_provider_connections (token_expires_at)`,
    ).catch(() => undefined)

    await query(`
      CREATE TABLE IF NOT EXISTS payment_oauth_attempts (
        id VARCHAR(36) PRIMARY KEY,
        organization_id VARCHAR(36) NOT NULL,
        owner_user_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NOT NULL,
        provider VARCHAR(40) NOT NULL DEFAULT 'mercado_pago',
        state_hash VARCHAR(128) NOT NULL,
        code_verifier_encrypted TEXT NOT NULL,
        redirect_after TEXT NULL,
        environment VARCHAR(16) NOT NULL DEFAULT 'test',
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_poa_state_hash ON payment_oauth_attempts (state_hash)`,
    ).catch(() => undefined)
    await query(
      `CREATE INDEX IF NOT EXISTS idx_poa_expires ON payment_oauth_attempts (expires_at)`,
    ).catch(() => undefined)

    await query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id VARCHAR(36) PRIMARY KEY,
        provider VARCHAR(40) NOT NULL DEFAULT 'mercado_pago',
        environment VARCHAR(16) NOT NULL DEFAULT 'test',
        provider_notification_id VARCHAR(160) NULL,
        provider_user_id VARCHAR(120) NULL,
        event_type VARCHAR(80) NULL,
        action VARCHAR(80) NULL,
        resource_id VARCHAR(160) NULL,
        request_id VARCHAR(160) NULL,
        signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
        payload_json JSONB NULL,
        processing_status VARCHAR(32) NOT NULL DEFAULT 'received',
        processing_attempts INT NOT NULL DEFAULT 0,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ NULL,
        last_error TEXT NULL,
        idempotency_key VARCHAR(255) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_pwe_idempotency ON payment_webhook_events (idempotency_key)`,
    ).catch(() => undefined)
    await query(
      `CREATE INDEX IF NOT EXISTS idx_pwe_resource ON payment_webhook_events (resource_id)`,
    ).catch(() => undefined)

    // Extend payment_transactions with MP preference fields (best-effort)
    await query(
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS provider_preference_id VARCHAR(120)`,
    ).catch(() => undefined)
    await query(
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS external_reference VARCHAR(160)`,
    ).catch(() => undefined)
    await query(
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS platform_fee_amount DECIMAL(12,2) DEFAULT 0`,
    ).catch(() => undefined)
    await query(
      `ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36)`,
    ).catch(() => undefined)

    schemaReady = true
    logger.info("[mercadoPagoOAuth] schema ready")
  }

  assertPlatformReady(): void {
    const cfg = mercadoPagoConfig()
    if (!cfg.enabled) {
      throw Object.assign(new Error("Mercado Pago desabilitado (MERCADO_PAGO_ENABLED=false)"), {
        status: 503,
        code: "mp_disabled",
      })
    }
    if (!cfg.configured) {
      throw Object.assign(
        new Error(
          "Mercado Pago não configurado na plataforma. Defina MERCADO_PAGO_CLIENT_ID, CLIENT_SECRET e REDIRECT_URI.",
        ),
        { status: 503, code: "mp_not_configured" },
      )
    }
  }

  async getConnection(organizationId: string): Promise<MpConnectionPublic | null> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    const row = await queryOne<any>(
      `SELECT * FROM payment_provider_connections
       WHERE organization_id = ? AND provider = ? AND environment = ?
       ORDER BY updated_at DESC LIMIT 1`,
      [organizationId, PROVIDER, cfg.environment],
    )
    if (!row || row.status === "disconnected") return null
    return toPublic(row)
  }

  async getConnectionRow(organizationId: string): Promise<MpConnectionRow | null> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    const row = await queryOne<any>(
      `SELECT * FROM payment_provider_connections
       WHERE organization_id = ? AND provider = ? AND environment = ?
         AND status <> 'disconnected'
       ORDER BY updated_at DESC LIMIT 1`,
      [organizationId, PROVIDER, cfg.environment],
    )
    return row || null
  }

  async startConnect(input: {
    organizationId: string
    ownerUserId: string
    userId: string
    redirectAfter?: string
  }): Promise<{ authorizationUrl: string; attemptId: string }> {
    await this.ensureSchema()
    this.assertPlatformReady()
    const cfg = mercadoPagoConfig()

    const state = base64Url(randomBytes(32))
    const stateHash = createHash("sha256").update(state).digest("hex")
    const codeVerifier = base64Url(randomBytes(48))
    const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest())
    const attemptId = randomUUID()
    const expiresAt = new Date(Date.now() + OAUTH_TTL_MS)

    await query(
      `INSERT INTO payment_oauth_attempts
        (id, organization_id, owner_user_id, user_id, provider, state_hash,
         code_verifier_encrypted, redirect_after, environment, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        attemptId,
        input.organizationId,
        input.ownerUserId,
        input.userId,
        PROVIDER,
        stateHash,
        encryptSecret(codeVerifier),
        input.redirectAfter || "/pagamentos?provider=mercado_pago",
        cfg.environment,
        expiresAt.toISOString(),
      ],
    )

    // Soft mark connecting
    const existingConn = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM payment_provider_connections
       WHERE organization_id = ? AND provider = ? AND environment = ?
       LIMIT 1`,
      [input.organizationId, PROVIDER, cfg.environment],
    )
    if (existingConn?.id) {
      if (existingConn.status === "disconnected" || existingConn.status === "error") {
        await query(
          `UPDATE payment_provider_connections
           SET status = 'connecting', connected_by_user_id = ?, updated_at = NOW()
           WHERE id = ?`,
          [input.userId, existingConn.id],
        )
      }
    } else {
      await query(
        `INSERT INTO payment_provider_connections
          (id, organization_id, owner_user_id, provider, environment, status, connected_by_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 'connecting', ?, NOW())`,
        [
          randomUUID(),
          input.organizationId,
          input.ownerUserId,
          PROVIDER,
          cfg.environment,
          input.userId,
        ],
      )
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      state,
      // offline_access for refresh_token; read write for API
      scope: "offline_access read write",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })

    return {
      authorizationUrl: `${OAUTH_AUTH_URL}?${params.toString()}`,
      attemptId,
    }
  }

  async handleCallback(input: {
    code?: string
    state?: string
    error?: string
    errorDescription?: string
  }): Promise<{ redirectPath: string; ok: boolean }> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    const fail = (msg: string) => {
      logger.warn(`[mp-oauth] callback fail: ${msg}`)
      return {
        redirectPath: `/pagamentos?provider=mercado_pago&connection=error&reason=${encodeURIComponent(msg.slice(0, 80))}`,
        ok: false,
      }
    }

    if (input.error) {
      return fail(input.errorDescription || input.error)
    }
    const code = String(input.code || "").trim()
    const state = String(input.state || "").trim()
    if (!code || !state) return fail("missing_code_or_state")

    const stateHash = createHash("sha256").update(state).digest("hex")
    const attempt = await queryOne<any>(
      `SELECT * FROM payment_oauth_attempts
       WHERE state_hash = ? AND provider = ? AND status = 'pending'
       LIMIT 1`,
      [stateHash, PROVIDER],
    )
    if (!attempt) return fail("invalid_state")
    if (new Date(attempt.expires_at).getTime() < Date.now()) {
      await query(`UPDATE payment_oauth_attempts SET status = 'expired' WHERE id = ?`, [attempt.id])
      return fail("state_expired")
    }

    await query(
      `UPDATE payment_oauth_attempts SET status = 'processing' WHERE id = ? AND status = 'pending'`,
      [attempt.id],
    )

    const codeVerifier = decryptSecret(attempt.code_verifier_encrypted)
    if (!codeVerifier) {
      await query(`UPDATE payment_oauth_attempts SET status = 'error' WHERE id = ?`, [attempt.id])
      return fail("verifier_missing")
    }

    try {
      const tokenResp = await axios.post(
        OAUTH_TOKEN_URL,
        {
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: cfg.redirectUri,
          code_verifier: codeVerifier,
        },
        { headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 20000 },
      )

      const data = tokenResp.data || {}
      const accessToken = String(data.access_token || "").trim()
      const refreshToken = String(data.refresh_token || "").trim()
      const expiresIn = Number(data.expires_in || 0)
      const mpUserId = String(data.user_id || data.user?.id || "").trim()
      const scope = String(data.scope || "").trim()
      const tokenType = String(data.token_type || "Bearer").trim()
      if (!accessToken) throw new Error("token_missing")

      const expiresAt =
        expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 15552000000)

      // Upsert connection
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM payment_provider_connections
         WHERE organization_id = ? AND provider = ? AND environment = ?
         LIMIT 1`,
        [attempt.organization_id, PROVIDER, cfg.environment],
      )

      const connectionId = existing?.id || randomUUID()
      if (existing?.id) {
        await query(
          `UPDATE payment_provider_connections SET
             status = 'connected',
             owner_user_id = COALESCE(?, owner_user_id),
             provider_user_id = ?,
             provider_account_id = ?,
             scope = ?,
             access_token_encrypted = ?,
             refresh_token_encrypted = ?,
             token_type = ?,
             token_expires_at = ?,
             connected_by_user_id = ?,
             connected_at = COALESCE(connected_at, NOW()),
             last_refreshed_at = NOW(),
             last_verified_at = NOW(),
             disconnected_at = NULL,
             reauthorization_required_at = NULL,
             last_error_code = NULL,
             last_error_message_sanitized = NULL,
             updated_at = NOW()
           WHERE id = ?`,
          [
            attempt.owner_user_id,
            mpUserId || null,
            mpUserId || null,
            scope || null,
            encryptSecret(accessToken),
            encryptSecret(refreshToken),
            tokenType,
            expiresAt.toISOString(),
            attempt.user_id,
            connectionId,
          ],
        )
      } else {
        await query(
          `INSERT INTO payment_provider_connections
            (id, organization_id, owner_user_id, provider, environment, status,
             provider_user_id, provider_account_id, scope, access_token_encrypted,
             refresh_token_encrypted, token_type, token_expires_at, connected_by_user_id,
             connected_at, last_refreshed_at, last_verified_at)
           VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            connectionId,
            attempt.organization_id,
            attempt.owner_user_id,
            PROVIDER,
            cfg.environment,
            mpUserId || null,
            mpUserId || null,
            scope || null,
            encryptSecret(accessToken),
            encryptSecret(refreshToken),
            tokenType,
            expiresAt.toISOString(),
            attempt.user_id,
          ],
        )
      }

      // Mirror into payment_gateways for existing createPayment paths (secret = access token)
      await this.syncLegacyGateway({
        organizationId: attempt.organization_id,
        ownerUserId: attempt.owner_user_id,
        accessToken,
        environment: cfg.environment,
      })

      await query(
        `UPDATE payment_oauth_attempts SET status = 'consumed', consumed_at = NOW() WHERE id = ?`,
        [attempt.id],
      )

      const redirectAfter = String(attempt.redirect_after || "/pagamentos").split("?")[0]
      return {
        redirectPath: `${redirectAfter}?provider=mercado_pago&connection=success`,
        ok: true,
      }
    } catch (err: any) {
      const msg = String(err?.response?.data?.message || err?.message || "token_exchange_failed")
      await query(
        `UPDATE payment_oauth_attempts SET status = 'error' WHERE id = ?`,
        [attempt.id],
      )
      await query(
        `UPDATE payment_provider_connections
         SET status = 'error', last_error_code = 'token_exchange',
             last_error_message_sanitized = ?, updated_at = NOW()
         WHERE organization_id = ? AND provider = ? AND environment = ?`,
        [msg.slice(0, 200), attempt.organization_id, PROVIDER, cfg.environment],
      ).catch(() => undefined)
      return fail(msg)
    }
  }

  private async syncLegacyGateway(input: {
    organizationId: string
    ownerUserId: string
    accessToken: string
    environment: MpEnvironment
  }): Promise<void> {
    try {
      const { PaymentConfigService } = await import("./paymentConfig")
      const pcs = new PaymentConfigService()
      const accountId = `${input.ownerUserId}::${input.organizationId}`
      await pcs.ensureSchema()
      await pcs.saveGateway(accountId, {
        gateway_name: "mercado_pago",
        public_key: mercadoPagoConfig().publicKey || null,
        secret_key: input.accessToken,
        webhook_secret: mercadoPagoConfig().webhookSecret || null,
        environment: input.environment === "production" ? "production" : "sandbox",
        active: true,
        gateway_priority: 1,
      } as any)
    } catch (err: any) {
      logger.warn(`[mp-oauth] syncLegacyGateway: ${err?.message}`)
    }
  }

  async disconnect(organizationId: string, userId: string): Promise<void> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    await query(
      `UPDATE payment_provider_connections SET
         status = 'disconnected',
         access_token_encrypted = NULL,
         refresh_token_encrypted = NULL,
         disconnected_at = NOW(),
         updated_at = NOW()
       WHERE organization_id = ? AND provider = ? AND environment = ?`,
      [organizationId, PROVIDER, cfg.environment],
    )
    // Deactivate legacy gateway but keep payment history
    try {
      const row = await queryOne<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM payment_provider_connections
         WHERE organization_id = ? AND provider = ? LIMIT 1`,
        [organizationId, PROVIDER],
      )
      const owner = row?.owner_user_id
      if (owner) {
        const accountId = `${owner}::${organizationId}`
        await query(
          `UPDATE payment_gateways SET active = FALSE, secret_key_encrypted = NULL, updated_at = NOW()
           WHERE account_id = ? AND gateway_name IN ('mercado_pago','mercadopago')`,
          [accountId],
        ).catch(() => undefined)
      }
    } catch {
      /* ignore */
    }
    logger.info(`[mp-oauth] disconnected org=${organizationId} by=${userId}`)
  }

  async markReauthorizationRequired(connectionId: string, reason: string): Promise<void> {
    await query(
      `UPDATE payment_provider_connections SET
         status = 'reauthorization_required',
         reauthorization_required_at = NOW(),
         last_error_code = 'reauthorization_required',
         last_error_message_sanitized = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [String(reason || "").slice(0, 200), connectionId],
    )
  }

  /**
   * Returns a valid access token for the organization (never expose to FE).
   */
  async getValidAccessToken(organizationId: string): Promise<string> {
    await this.ensureSchema()
    const row = await this.getConnectionRow(organizationId)
    if (!row || !["connected", "refreshing"].includes(row.status)) {
      throw Object.assign(new Error("Mercado Pago não conectado para esta organização"), {
        status: 400,
        code: "mp_not_connected",
      })
    }

    const token = decryptSecret(row.access_token_encrypted)
    if (!token) {
      await this.markReauthorizationRequired(row.id, "token_decrypt_failed")
      throw Object.assign(new Error("Token inválido — reconecte o Mercado Pago"), {
        status: 400,
        code: "mp_reauth_required",
      })
    }

    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
    const needsRefresh = !expiresAt || expiresAt - Date.now() < REFRESH_WINDOW_MS
    if (!needsRefresh) return token

    return this.refreshConnection(row.id)
  }

  async refreshConnection(connectionId: string): Promise<string> {
    const existing = refreshLocks.get(connectionId)
    if (existing) return existing

    const job = this._doRefresh(connectionId).finally(() => {
      refreshLocks.delete(connectionId)
    })
    refreshLocks.set(connectionId, job)
    return job
  }

  private async _doRefresh(connectionId: string): Promise<string> {
    await this.ensureSchema()
    this.assertPlatformReady()
    const cfg = mercadoPagoConfig()

    const row = await queryOne<any>(
      `SELECT * FROM payment_provider_connections WHERE id = ? LIMIT 1`,
      [connectionId],
    )
    if (!row) throw new Error("connection_not_found")

    await query(
      `UPDATE payment_provider_connections SET status = 'refreshing', updated_at = NOW() WHERE id = ?`,
      [connectionId],
    )

    const refreshToken = decryptSecret(row.refresh_token_encrypted)
    if (!refreshToken) {
      await this.markReauthorizationRequired(connectionId, "missing_refresh_token")
      throw Object.assign(new Error("Refresh token ausente — reconecte o Mercado Pago"), {
        status: 400,
        code: "mp_reauth_required",
      })
    }

    try {
      const tokenResp = await axios.post(
        OAUTH_TOKEN_URL,
        {
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        { headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 20000 },
      )
      const data = tokenResp.data || {}
      const accessToken = String(data.access_token || "").trim()
      const newRefresh = String(data.refresh_token || refreshToken).trim()
      const expiresIn = Number(data.expires_in || 0)
      if (!accessToken) throw new Error("refresh_token_missing_access")

      const expiresAt =
        expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 15552000000)

      await query(
        `UPDATE payment_provider_connections SET
           status = 'connected',
           access_token_encrypted = ?,
           refresh_token_encrypted = ?,
           token_expires_at = ?,
           last_refreshed_at = NOW(),
           last_verified_at = NOW(),
           reauthorization_required_at = NULL,
           last_error_code = NULL,
           last_error_message_sanitized = NULL,
           updated_at = NOW()
         WHERE id = ?`,
        [encryptSecret(accessToken), encryptSecret(newRefresh), expiresAt.toISOString(), connectionId],
      )

      if (row.organization_id && row.owner_user_id) {
        await this.syncLegacyGateway({
          organizationId: row.organization_id,
          ownerUserId: row.owner_user_id,
          accessToken,
          environment: cfg.environment,
        })
      }

      return accessToken
    } catch (err: any) {
      const status = err?.response?.status
      const msg = String(err?.response?.data?.message || err?.message || "refresh_failed")
      if (status === 400 || status === 401 || /invalid_grant|invalid_token/i.test(msg)) {
        await this.markReauthorizationRequired(connectionId, msg)
        throw Object.assign(new Error("Sessão Mercado Pago expirada — reconecte"), {
          status: 400,
          code: "mp_reauth_required",
        })
      }
      await query(
        `UPDATE payment_provider_connections SET status = 'error', last_error_code = 'refresh_failed',
           last_error_message_sanitized = ?, updated_at = NOW() WHERE id = ?`,
        [msg.slice(0, 200), connectionId],
      )
      throw err
    }
  }

  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    await this.ensureSchema()
    const threshold = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString()
    const rows = await query<any[]>(
      `SELECT id FROM payment_provider_connections
       WHERE provider = ? AND status = 'connected'
         AND token_expires_at IS NOT NULL AND token_expires_at < ?
       LIMIT 50`,
      [PROVIDER, threshold],
    )
    const list = Array.isArray(rows) ? rows : []
    let refreshed = 0
    let failed = 0
    for (const r of list) {
      try {
        await this.refreshConnection(r.id)
        refreshed++
      } catch {
        failed++
      }
    }
    if (refreshed || failed) {
      logger.info(`[mp-oauth] token refresh job refreshed=${refreshed} failed=${failed}`)
    }
    return { refreshed, failed }
  }

  computePlatformFee(amountCents: number): number {
    const cfg = mercadoPagoConfig()
    if (!cfg.feeEnabled || cfg.feeValue <= 0) return 0
    if (cfg.feeType === "fixed") {
      return Math.max(0, Math.round(cfg.feeValue * 100))
    }
    return Math.max(0, Math.round((amountCents * cfg.feeValue) / 100))
  }

  /**
   * Create Checkout Pro preference using the org OAuth token.
   * amount in BRL (decimal); stored in payment_transactions.
   */
  async createCheckoutPro(input: {
    organizationId: string
    ownerUserId: string
    orderId: string
    amount: number
    description: string
    payer?: { name?: string | null; email?: string | null; phone?: string | null }
    methodType?: "pix" | "card" | "boleto" | "wallet"
    createdByUserId?: string | null
    successUrl?: string
    failureUrl?: string
    pendingUrl?: string
  }): Promise<{
    payment_url: string
    provider_preference_id: string
    transaction_id: string
    platform_fee_amount: number
  }> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    const accessToken = await this.getValidAccessToken(input.organizationId)

    const amount = Number(input.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error("Valor de pagamento inválido"), { status: 400 })
    }
    const amountCents = Math.round(amount * 100)
    const feeCents = this.computePlatformFee(amountCents)
    const feeAmount = feeCents / 100

    const baseUrl = String(
      process.env.CHECKOUT_BASE_URL ||
        process.env.FRONTEND_PUBLIC_URL ||
        process.env.PUBLIC_APP_URL ||
        "https://app.leadcapture.online",
    ).replace(/\/+$/, "")

    const externalReference = `lc:${input.organizationId}:${input.orderId}`
    const payload: Record<string, any> = {
      items: [
        {
          id: String(input.orderId).slice(0, 64),
          title: String(input.description || "Pedido").slice(0, 256),
          quantity: 1,
          unit_price: Number(amount.toFixed(2)),
          currency_id: cfg.currency || "BRL",
        },
      ],
      payer: {
        name: input.payer?.name || undefined,
        email: input.payer?.email || undefined,
        phone: input.payer?.phone
          ? { number: String(input.payer.phone).replace(/\D/g, "") }
          : undefined,
      },
      back_urls: {
        success: input.successUrl || `${baseUrl}/pedido/sucesso?order_id=${input.orderId}`,
        failure: input.failureUrl || `${baseUrl}/pedido/falha?order_id=${input.orderId}`,
        pending: input.pendingUrl || `${baseUrl}/pedido/pendente?order_id=${input.orderId}`,
      },
      auto_return: "approved",
      external_reference: externalReference,
      notification_url: cfg.webhookUrl || undefined,
      metadata: {
        organization_id: input.organizationId,
        order_id: input.orderId,
        owner_user_id: input.ownerUserId,
        platform: "leadcapture",
      },
    }

    // Marketplace fee (optional SaaS commission) — MP application_fee / marketplace_fee
    if (feeAmount > 0) {
      payload.marketplace_fee = Number(feeAmount.toFixed(2))
    }

    const response = await axios.post(`${API_BASE}/checkout/preferences`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": randomUUID(),
      },
      timeout: 20000,
    })

    const data = response.data || {}
    const preferenceId = String(data.id || "")
    const paymentUrl =
      cfg.environment === "production"
        ? String(data.init_point || data.sandbox_init_point || "")
        : String(data.sandbox_init_point || data.init_point || "")

    if (!preferenceId || !paymentUrl) {
      throw new Error("Falha ao criar preferência Checkout Pro no Mercado Pago")
    }

    const txId = randomUUID()
    const accountId = `${input.ownerUserId}::${input.organizationId}`
    const method = input.methodType || "wallet"

    await query(
      `INSERT INTO payment_transactions
        (id, account_id, order_id, gateway_name, provider_payment_id, method_type,
         amount, currency, status, payment_url, raw_response, organization_id,
         provider_preference_id, external_reference, platform_fee_amount)
       VALUES (?, ?, ?, 'mercado_pago', ?, ?, ?, 'BRL', 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        accountId,
        input.orderId,
        preferenceId,
        method,
        amount,
        paymentUrl,
        JSON.stringify({ preference: data, marketplace_fee: feeAmount }),
        input.organizationId,
        preferenceId,
        externalReference,
        feeAmount,
      ],
    ).catch(async (err: any) => {
      // Fallback without extended columns
      logger.warn(`[mp] payment_transactions insert extended failed: ${err?.message}`)
      await query(
        `INSERT INTO payment_transactions
          (id, account_id, order_id, gateway_name, provider_payment_id, method_type,
           amount, currency, status, payment_url, raw_response)
         VALUES (?, ?, ?, 'mercado_pago', ?, ?, ?, 'BRL', 'pending', ?, ?)`,
        [
          txId,
          accountId,
          input.orderId,
          preferenceId,
          method,
          amount,
          paymentUrl,
          JSON.stringify({ preference: data }),
        ],
      )
    })

    return {
      payment_url: paymentUrl,
      provider_preference_id: preferenceId,
      transaction_id: txId,
      platform_fee_amount: feeAmount,
    }
  }

  /**
   * Validate MP webhook x-signature (ts + v1 HMAC).
   * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
   */
  validateWebhookSignature(args: {
    xSignature?: string
    xRequestId?: string
    dataId?: string
  }): boolean {
    const secret = mercadoPagoConfig().webhookSecret
    if (!secret) {
      // In test without secret, allow but mark signature_valid=false upstream
      return !mercadoPagoConfig().enabled || mercadoPagoConfig().environment === "test"
    }
    const header = String(args.xSignature || "").trim()
    if (!header) return false
    const parts: Record<string, string> = {}
    for (const part of header.split(",")) {
      const [k, v] = part.split("=").map((s) => s.trim())
      if (k && v) parts[k] = v
    }
    const ts = parts["ts"]
    const v1 = parts["v1"]
    if (!ts || !v1) return false
    const dataId = String(args.dataId || "").toLowerCase()
    const requestId = String(args.xRequestId || "")
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const expected = createHmac("sha256", secret).update(manifest).digest("hex")
    return expected === v1
  }

  async processWebhook(input: {
    body: any
    headers: Record<string, any>
    rawPayload?: string
  }): Promise<{ ok: boolean; status?: string; paymentId?: string; duplicate?: boolean }> {
    await this.ensureSchema()
    const cfg = mercadoPagoConfig()
    const body = input.body || {}
    const action = String(body.action || body.type || "").trim()
    const eventType = String(body.type || body.topic || action || "payment").trim()
    const dataId = String(body?.data?.id || body?.id || body?.resource || "").replace(/.*\//, "").trim()
    const requestId = String(
      input.headers["x-request-id"] || input.headers["x-requestid"] || "",
    ).trim()
    const notificationId = String(body.id || body?.data?.id || requestId || randomUUID()).trim()
    const providerUserId = String(body.user_id || body?.data?.user_id || "").trim()

    const sigValid = this.validateWebhookSignature({
      xSignature: input.headers["x-signature"] || input.headers["x-signature".toLowerCase()],
      xRequestId: requestId,
      dataId,
    })

    const idempotencyKey = createHash("sha256")
      .update(`${PROVIDER}|${notificationId}|${action}|${dataId}`)
      .digest("hex")

    // Insert event (idempotent)
    const eventId = randomUUID()
    try {
      await query(
        `INSERT INTO payment_webhook_events
          (id, provider, environment, provider_notification_id, provider_user_id,
           event_type, action, resource_id, request_id, signature_valid, payload_json,
           processing_status, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)`,
        [
          eventId,
          PROVIDER,
          cfg.environment,
          notificationId,
          providerUserId || null,
          eventType,
          action || null,
          dataId || null,
          requestId || null,
          sigValid,
          JSON.stringify(body),
          idempotencyKey,
        ],
      )
    } catch (err: any) {
      if (/unique|duplicate/i.test(String(err?.message || ""))) {
        return { ok: true, duplicate: true }
      }
      throw err
    }

    if (cfg.webhookSecret && !sigValid) {
      await query(
        `UPDATE payment_webhook_events SET processing_status = 'rejected', last_error = 'invalid_signature', processed_at = NOW() WHERE id = ?`,
        [eventId],
      )
      return { ok: false }
    }

    // Handle mp-connect application authorization events lightly
    if (/mp-connect|application/i.test(eventType) || /mp-connect/i.test(action)) {
      await query(
        `UPDATE payment_webhook_events SET processing_status = 'processed', processed_at = NOW(), processing_attempts = 1 WHERE id = ?`,
        [eventId],
      )
      return { ok: true, status: "connect_event" }
    }

    if (!dataId) {
      await query(
        `UPDATE payment_webhook_events SET processing_status = 'ignored', processed_at = NOW() WHERE id = ?`,
        [eventId],
      )
      return { ok: true }
    }

    // Resolve connection by MP user id
    let accessToken: string | null = null
    let organizationId: string | null = null
    if (providerUserId) {
      const conn = await queryOne<any>(
        `SELECT * FROM payment_provider_connections
         WHERE provider = ? AND provider_user_id = ? AND status IN ('connected','refreshing')
         ORDER BY updated_at DESC LIMIT 1`,
        [PROVIDER, providerUserId],
      )
      if (conn) {
        organizationId = conn.organization_id
        try {
          accessToken = await this.getValidAccessToken(conn.organization_id)
        } catch {
          accessToken = decryptSecret(conn.access_token_encrypted)
        }
      }
    }

    // Fetch payment from MP API (never trust webhook body alone)
    let payment: any = null
    if (accessToken) {
      try {
        const resp = await axios.get(`${API_BASE}/v1/payments/${dataId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
        })
        payment = resp.data
      } catch (err: any) {
        await query(
          `UPDATE payment_webhook_events SET processing_status = 'error', processing_attempts = processing_attempts + 1,
             last_error = ?, updated_at = NOW() WHERE id = ?`,
          [String(err?.message || "fetch_payment_failed").slice(0, 200), eventId],
        ).catch(() => undefined)
        // still try with status from body
      }
    }

    const statusRaw = String(payment?.status || body?.data?.status || "").toLowerCase()
    let localStatus: "pending" | "paid" | "failed" | "canceled" = "pending"
    if (["approved", "accredited"].includes(statusRaw)) localStatus = "paid"
    else if (["rejected", "cancelled", "canceled"].includes(statusRaw))
      localStatus = statusRaw.startsWith("cancel") ? "canceled" : "failed"
    else if (["refunded", "charged_back"].includes(statusRaw)) localStatus = "canceled"

    const externalRef = String(payment?.external_reference || "").trim()
    const preferenceId = String(payment?.preference_id || payment?.order?.id || "").trim()

    // Update local transaction by preference id or external reference
    const tx = await queryOne<any>(
      `SELECT * FROM payment_transactions
       WHERE provider_payment_id = ?
          OR provider_preference_id = ?
          OR external_reference = ?
          OR provider_payment_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [String(dataId), preferenceId || "__none__", externalRef || "__none__", preferenceId || dataId],
    ).catch(() => null)

    if (tx) {
      const alreadyPaid = String(tx.status) === "paid"
      await query(
        `UPDATE payment_transactions SET
           status = ?,
           provider_payment_id = COALESCE(?, provider_payment_id),
           raw_response = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [
          // Don't regress paid → pending
          alreadyPaid && localStatus !== "canceled" ? "paid" : localStatus,
          String(payment?.id || dataId),
          JSON.stringify(payment || body),
          tx.id,
        ],
      )

      if (localStatus === "paid" && !alreadyPaid) {
        await this.markOrderPaidFromTransaction(tx)
      }
    }

    await query(
      `UPDATE payment_webhook_events SET processing_status = 'processed', processed_at = NOW(),
         processing_attempts = processing_attempts + 1 WHERE id = ?`,
      [eventId],
    )

    return {
      ok: true,
      status: localStatus,
      paymentId: String(payment?.id || dataId),
    }
  }

  private async markOrderPaidFromTransaction(tx: any): Promise<void> {
    const orderId = String(tx.order_id || "").trim()
    if (!orderId) return
    try {
      await query(
        `UPDATE pedidos SET status = 'pago', updated_at = NOW() WHERE id = ?`,
        [orderId],
      ).catch(() => undefined)
      await query(
        `UPDATE commerce_orders SET status = 'paid', updated_at = NOW() WHERE id = ?`,
        [orderId],
      ).catch(() => undefined)
    } catch (err: any) {
      logger.warn(`[mp-webhook] markOrderPaid: ${err?.message}`)
    }
  }

  async cleanupExpiredOAuthAttempts(): Promise<number> {
    await this.ensureSchema()
    const r = await query(
      `UPDATE payment_oauth_attempts SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()`,
    )
    return Number((r as any)?.rowCount || (r as any)?.affectedRows || 0)
  }
}

export const mercadoPagoOAuthService = new MercadoPagoOAuthService()

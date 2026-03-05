import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { query, queryOne, update } from "../config/database";
import QRCode from "qrcode";

export type PaymentMethodType = "pix" | "card" | "boleto" | "wallet";
export type InterestType = "none" | "merchant" | "customer";

export type PaymentSettings = {
  id: string;
  account_id: string;
  default_currency: string;
  auto_approve_orders: boolean;
  allow_pix: boolean;
  allow_card: boolean;
  allow_boleto: boolean;
  allow_wallet: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentGatewayRow = {
  id: string;
  account_id: string;
  gateway_name: string;
  public_key?: string | null;
  secret_key_encrypted?: string | null;
  webhook_secret?: string | null;
  environment: "sandbox" | "production";
  active: boolean;
  gateway_priority: number;
  created_at: string;
  updated_at: string;
};

export type PaymentMethodConfig = {
  id: string;
  account_id: string;
  method_type: PaymentMethodType;
  enabled: boolean;
  max_installments: number;
  min_installment_value: number;
  interest_type: InterestType;
  interest_percentage: number;
  fee_fixed: number;
  fee_percentage: number;
  created_at: string;
  updated_at: string;
};

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export type PixSettings = {
  id: string;
  account_id: string;
  provider: "manual" | "mercado_pago" | "efi" | "asaas" | "openpix";
  enabled: boolean;
  is_production: boolean;
  pix_key_type: PixKeyType;
  pix_key_value?: string | null;
  receiver_name: string;
  receiver_city: string;
  txid_prefix: string;
  default_description?: string | null;
  created_at: string;
  updated_at: string;
};

export type PixGenerateInput = {
  amount: number;
  description?: string;
  txid?: string;
};

export type PixGenerateResult = {
  copy_paste: string;
  qr_code_data_url: string;
  txid: string;
  amount: number;
  provider: string;
  mode: "test" | "production";
};

export type CouponRow = {
  id: string;
  account_id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  value: number;
  expiration_date?: string | null;
  usage_limit?: number | null;
  used_count: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductPaymentOverride = {
  id: string;
  account_id: string;
  product_id: string;
  allow_pix?: boolean | null;
  allow_card?: boolean | null;
  allow_boleto?: boolean | null;
  allow_wallet?: boolean | null;
  max_installments?: number | null;
  gateway_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentCalculationInput = {
  account_id: string;
  method_type: PaymentMethodType;
  amount: number;
  installments?: number;
  coupon_code?: string;
  product_id?: string;
};

export type PaymentCalculationResult = {
  currency: string;
  method_type: PaymentMethodType;
  base_amount: number;
  coupon_discount: number;
  promo_discount: number;
  fee_fixed: number;
  fee_percentage_amount: number;
  interest_amount: number;
  final_amount: number;
  installments: number;
  installment_amount: number;
  interest_type: InterestType;
  interest_percentage: number;
  applied_coupon?: {
    id: string;
    code: string;
    discount_type: string;
    value: number;
  } | null;
  notes: string[];
};

export type PaymentTransactionRow = {
  id: string;
  account_id: string;
  order_id: string;
  gateway_name: string;
  provider_payment_id: string;
  method_type: PaymentMethodType;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "canceled";
  payment_url?: string | null;
  raw_response?: string | null;
  created_at: string;
  updated_at: string;
};

export class PaymentConfigService {
  private schemaReady = false;
  private schemaReadyPromise: Promise<void> | null = null;

  private getEncryptionKey(): Buffer {
    const source = String(process.env.PAYMENT_ENCRYPTION_KEY || process.env.JWT_SECRET || "lead-system-change-payment-key");
    return createHash("sha256").update(source).digest();
  }

  private encryptSecret(value?: string | null): string | null {
    const plain = String(value || "").trim();
    if (!plain) return null;

    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  decryptSecret(value?: string | null): string | null {
    const payload = String(value || "").trim();
    if (!payload) return null;

    const [ivB64, tagB64, dataB64] = payload.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;

    try {
      const key = this.getEncryptionKey();
      const iv = Buffer.from(ivB64, "base64");
      const tag = Buffer.from(tagB64, "base64");
      const data = Buffer.from(dataB64, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      return null;
    }
  }

  private parseBool(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = String(value || "").trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }

  private sanitizeCurrency(value?: string): string {
    const normalized = String(value || "BRL").trim().toUpperCase();
    if (normalized.length !== 3) return "BRL";
    return normalized;
  }

  private toNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaReadyPromise) {
      await this.schemaReadyPromise;
      return;
    }

    this.schemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS payment_settings (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          default_currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
          auto_approve_orders TINYINT(1) NOT NULL DEFAULT 1,
          allow_pix TINYINT(1) NOT NULL DEFAULT 1,
          allow_card TINYINT(1) NOT NULL DEFAULT 1,
          allow_boleto TINYINT(1) NOT NULL DEFAULT 0,
          allow_wallet TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_settings_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payment_gateways (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          gateway_name VARCHAR(60) NOT NULL,
          public_key TEXT NULL,
          secret_key_encrypted TEXT NULL,
          webhook_secret TEXT NULL,
          environment ENUM('sandbox','production') NOT NULL DEFAULT 'sandbox',
          active TINYINT(1) NOT NULL DEFAULT 1,
          gateway_priority INT NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_payment_gateways_account (account_id),
          KEY idx_payment_gateways_active_priority (account_id, active, gateway_priority)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payment_methods_config (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          method_type ENUM('pix','card','boleto','wallet') NOT NULL,
          enabled TINYINT(1) NOT NULL DEFAULT 1,
          max_installments INT NOT NULL DEFAULT 1,
          min_installment_value DECIMAL(12,2) NOT NULL DEFAULT 5.00,
          interest_type ENUM('none','merchant','customer') NOT NULL DEFAULT 'none',
          interest_percentage DECIMAL(8,4) NOT NULL DEFAULT 0,
          fee_fixed DECIMAL(12,2) NOT NULL DEFAULT 0,
          fee_percentage DECIMAL(8,4) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_methods_account_method (account_id, method_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payment_pix_settings (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          provider ENUM('manual','mercado_pago','efi','asaas','openpix') NOT NULL DEFAULT 'manual',
          enabled TINYINT(1) NOT NULL DEFAULT 0,
          is_production TINYINT(1) NOT NULL DEFAULT 0,
          pix_key_type ENUM('cpf','cnpj','email','phone','random') NOT NULL DEFAULT 'random',
          pix_key_encrypted TEXT NULL,
          receiver_name VARCHAR(120) NOT NULL DEFAULT 'RECEBEDOR',
          receiver_city VARCHAR(60) NOT NULL DEFAULT 'SAO PAULO',
          txid_prefix VARCHAR(12) NOT NULL DEFAULT 'LS',
          default_description VARCHAR(120) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_pix_settings_account (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS coupons (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          code VARCHAR(64) NOT NULL,
          discount_type ENUM('percentage','fixed') NOT NULL DEFAULT 'fixed',
          value DECIMAL(12,2) NOT NULL DEFAULT 0,
          expiration_date DATETIME NULL,
          usage_limit INT NULL,
          used_count INT NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_coupons_account_code (account_id, code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS product_payment_overrides (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          product_id VARCHAR(64) NOT NULL,
          allow_pix TINYINT(1) NULL,
          allow_card TINYINT(1) NULL,
          allow_boleto TINYINT(1) NULL,
          allow_wallet TINYINT(1) NULL,
          max_installments INT NULL,
          gateway_name VARCHAR(60) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_product_payment_override (account_id, product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id VARCHAR(36) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          plan_id VARCHAR(64) NOT NULL,
          billing_cycle VARCHAR(30) NOT NULL,
          status VARCHAR(40) NOT NULL,
          next_billing_date DATETIME NULL,
          gateway_subscription_id VARCHAR(120) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_subscriptions_account_status (account_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payment_logs (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          order_id VARCHAR(64) NULL,
          gateway VARCHAR(60) NOT NULL,
          request_payload JSON NULL,
          response_payload JSON NULL,
          status VARCHAR(40) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_payment_logs_account_order (account_id, order_id),
          KEY idx_payment_logs_gateway_status (gateway, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id VARCHAR(64) PRIMARY KEY,
          account_id VARCHAR(120) NOT NULL,
          order_id VARCHAR(64) NOT NULL,
          gateway_name VARCHAR(60) NOT NULL,
          provider_payment_id VARCHAR(120) NOT NULL,
          method_type ENUM('pix','card','boleto','wallet') NOT NULL,
          amount DECIMAL(12,2) NOT NULL DEFAULT 0,
          currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
          status ENUM('pending','paid','failed','canceled') NOT NULL DEFAULT 'pending',
          payment_url TEXT NULL,
          raw_response JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_tx_provider (provider_payment_id),
          KEY idx_payment_tx_account_order (account_id, order_id),
          KEY idx_payment_tx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Legacy migration: account_id can include user::brand and easily exceed 36 chars.
      // Keep this id long enough to avoid truncation, cross-brand collisions and missing lookups.
      await query(`ALTER TABLE payment_settings MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE payment_gateways MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE payment_methods_config MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE payment_pix_settings MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE coupons MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE product_payment_overrides MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE subscriptions MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE payment_logs MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);
      await query(`ALTER TABLE payment_transactions MODIFY COLUMN account_id VARCHAR(120) NOT NULL`).catch(() => undefined);

      this.schemaReady = true;
    })().finally(() => {
      this.schemaReadyPromise = null;
    });

    await this.schemaReadyPromise;
  }

  private async ensureDefaultMethodRows(accountId: string): Promise<void> {
    const methods: PaymentMethodType[] = ["pix", "card", "boleto", "wallet"];
    for (const method of methods) {
      await query(
        `INSERT IGNORE INTO payment_methods_config (
          id, account_id, method_type, enabled, max_installments, min_installment_value,
          interest_type, interest_percentage, fee_fixed, fee_percentage
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          method,
          method === "pix" || method === "card" ? 1 : 0,
          method === "card" ? 12 : 1,
          5,
          "none",
          0,
          0,
          0,
        ]
      );
    }
  }

  async getSettings(accountId: string): Promise<PaymentSettings> {
    await this.ensureSchema();

    await query(
      `INSERT IGNORE INTO payment_settings (
        id, account_id, default_currency, auto_approve_orders,
        allow_pix, allow_card, allow_boleto, allow_wallet
      ) VALUES (UUID(), ?, 'BRL', 1, 1, 1, 0, 0)`,
      [accountId]
    );

    const row = await queryOne<any>(`SELECT * FROM payment_settings WHERE account_id = ? LIMIT 1`, [accountId]);
    return {
      ...row,
      auto_approve_orders: this.parseBool(row?.auto_approve_orders),
      allow_pix: this.parseBool(row?.allow_pix),
      allow_card: this.parseBool(row?.allow_card),
      allow_boleto: this.parseBool(row?.allow_boleto),
      allow_wallet: this.parseBool(row?.allow_wallet),
      default_currency: this.sanitizeCurrency(row?.default_currency),
    } as PaymentSettings;
  }

  async updateSettings(accountId: string, payload: Partial<PaymentSettings>): Promise<PaymentSettings> {
    await this.ensureSchema();
    await this.getSettings(accountId);

    const fields: string[] = [];
    const values: any[] = [];

    if (payload.default_currency !== undefined) {
      fields.push("default_currency = ?");
      values.push(this.sanitizeCurrency(payload.default_currency));
    }
    if (payload.auto_approve_orders !== undefined) {
      fields.push("auto_approve_orders = ?");
      values.push(payload.auto_approve_orders ? 1 : 0);
    }
    if (payload.allow_pix !== undefined) {
      fields.push("allow_pix = ?");
      values.push(payload.allow_pix ? 1 : 0);
    }
    if (payload.allow_card !== undefined) {
      fields.push("allow_card = ?");
      values.push(payload.allow_card ? 1 : 0);
    }
    if (payload.allow_boleto !== undefined) {
      fields.push("allow_boleto = ?");
      values.push(payload.allow_boleto ? 1 : 0);
    }
    if (payload.allow_wallet !== undefined) {
      fields.push("allow_wallet = ?");
      values.push(payload.allow_wallet ? 1 : 0);
    }

    if (fields.length > 0) {
      values.push(accountId);
      await update(`UPDATE payment_settings SET ${fields.join(", ")} WHERE account_id = ?`, values);
    }

    return this.getSettings(accountId);
  }

  async listGateways(accountId: string, includeSecrets = false): Promise<Array<PaymentGatewayRow & { secret_key?: string | null }>> {
    await this.ensureSchema();
    const rows = await query<PaymentGatewayRow[]>(
      `SELECT * FROM payment_gateways WHERE account_id = ? ORDER BY gateway_priority ASC, created_at ASC`,
      [accountId]
    );

    return (rows || []).map((row) => ({
      ...row,
      active: this.parseBool((row as any).active),
      secret_key: includeSecrets ? this.decryptSecret((row as any).secret_key_encrypted) : undefined,
      secret_key_encrypted: undefined,
    }));
  }

  async saveGateway(accountId: string, payload: Partial<PaymentGatewayRow> & { gateway_name: string }): Promise<PaymentGatewayRow> {
    await this.ensureSchema();

    const id = payload.id ? String(payload.id) : undefined;
    const gatewayName = String(payload.gateway_name || "").trim().toLowerCase();
    if (!gatewayName) throw new Error("gateway_name é obrigatório");

    if (id) {
      const fields: string[] = [];
      const values: any[] = [];

      if (payload.public_key !== undefined) {
        fields.push("public_key = ?");
        values.push(payload.public_key || null);
      }
      if ((payload as any).secret_key !== undefined) {
        fields.push("secret_key_encrypted = ?");
        values.push(this.encryptSecret((payload as any).secret_key));
      }
      if (payload.webhook_secret !== undefined) {
        fields.push("webhook_secret = ?");
        values.push(payload.webhook_secret || null);
      }
      if (payload.environment !== undefined) {
        fields.push("environment = ?");
        values.push(payload.environment === "production" ? "production" : "sandbox");
      }
      if (payload.active !== undefined) {
        fields.push("active = ?");
        values.push(payload.active ? 1 : 0);
      }
      if (payload.gateway_priority !== undefined) {
        fields.push("gateway_priority = ?");
        values.push(Math.max(1, Math.floor(this.toNumber(payload.gateway_priority, 1))));
      }

  fields.push("gateway_name = ?");
  values.push(gatewayName);

      if (fields.length > 0) {
        values.push(id, accountId);
        await update(`UPDATE payment_gateways SET ${fields.join(", ")} WHERE id = ? AND account_id = ?`, values);
      }

      const row = await queryOne<PaymentGatewayRow>(`SELECT * FROM payment_gateways WHERE id = ? AND account_id = ? LIMIT 1`, [
        id,
        accountId,
      ]);
      if (!row) throw new Error("gateway não encontrado");
      return { ...row, active: this.parseBool((row as any).active) } as PaymentGatewayRow;
    }

    const newId = cryptoRandomId();
    await query(
      `INSERT INTO payment_gateways (
        id, account_id, gateway_name, public_key, secret_key_encrypted,
        webhook_secret, environment, active, gateway_priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        accountId,
        gatewayName,
        payload.public_key || null,
        this.encryptSecret((payload as any).secret_key),
        payload.webhook_secret || null,
        payload.environment === "production" ? "production" : "sandbox",
        payload.active === false ? 0 : 1,
        Math.max(1, Math.floor(this.toNumber(payload.gateway_priority, 1))),
      ]
    );

    const row = await queryOne<PaymentGatewayRow>(`SELECT * FROM payment_gateways WHERE id = ? AND account_id = ? LIMIT 1`, [
      newId,
      accountId,
    ]);
    if (!row) throw new Error("falha ao salvar gateway");
    return { ...row, active: this.parseBool((row as any).active) } as PaymentGatewayRow;
  }

  async getGatewayByName(accountId: string, gatewayName: string): Promise<(PaymentGatewayRow & { secret_key?: string | null }) | null> {
    await this.ensureSchema();
    const row = await queryOne<PaymentGatewayRow>(
      `SELECT * FROM payment_gateways
       WHERE account_id = ? AND gateway_name = ? AND active = 1
       ORDER BY gateway_priority ASC, created_at ASC
       LIMIT 1`,
      [accountId, String(gatewayName || "").trim().toLowerCase()]
    );
    if (!row) return null;

    return {
      ...row,
      active: this.parseBool((row as any).active),
      secret_key: this.decryptSecret((row as any).secret_key_encrypted),
    };
  }

  async listActiveGateways(accountId: string): Promise<Array<PaymentGatewayRow & { secret_key?: string | null }>> {
    await this.ensureSchema();
    const rows = await query<PaymentGatewayRow[]>(
      `SELECT * FROM payment_gateways
       WHERE account_id = ? AND active = 1
       ORDER BY gateway_priority ASC, created_at ASC`,
      [accountId]
    );

    return (rows || []).map((row) => ({
      ...row,
      active: true,
      secret_key: this.decryptSecret((row as any).secret_key_encrypted),
    }));
  }

  async testGateway(accountId: string, gatewayId: string): Promise<{ ok: boolean; reason?: string }> {
    await this.ensureSchema();
    const row = await queryOne<any>(`SELECT * FROM payment_gateways WHERE id = ? AND account_id = ? LIMIT 1`, [
      gatewayId,
      accountId,
    ]);
    if (!row) return { ok: false, reason: "Gateway não encontrado" };

    const hasPublic = String(row.public_key || "").trim().length > 0;
    const hasSecret = String(this.decryptSecret(row.secret_key_encrypted) || "").trim().length > 0;
    if (!hasPublic && !hasSecret) {
      return { ok: false, reason: "Credenciais ausentes" };
    }

    return { ok: true };
  }

  async listMethodConfigs(accountId: string): Promise<PaymentMethodConfig[]> {
    await this.ensureSchema();
    await this.ensureDefaultMethodRows(accountId);
    const rows = await query<PaymentMethodConfig[]>(
      `SELECT * FROM payment_methods_config WHERE account_id = ? ORDER BY FIELD(method_type, 'pix','card','boleto','wallet')`,
      [accountId]
    );
    return (rows || []).map((row: any) => ({
      ...row,
      enabled: this.parseBool(row.enabled),
      max_installments: Math.max(1, Math.floor(this.toNumber(row.max_installments, 1))),
      min_installment_value: this.toNumber(row.min_installment_value, 5),
      interest_percentage: this.toNumber(row.interest_percentage, 0),
      fee_fixed: this.toNumber(row.fee_fixed, 0),
      fee_percentage: this.toNumber(row.fee_percentage, 0),
    }));
  }

  async getPixSettings(accountId: string): Promise<PixSettings> {
    await this.ensureSchema();

    await query(
      `INSERT IGNORE INTO payment_pix_settings (
        id, account_id, provider, enabled, is_production, pix_key_type,
        receiver_name, receiver_city, txid_prefix, default_description
      ) VALUES (UUID(), ?, 'manual', 0, 0, 'random', 'RECEBEDOR', 'SAO PAULO', 'LS', NULL)`,
      [accountId]
    );

    const row = await queryOne<any>(`SELECT * FROM payment_pix_settings WHERE account_id = ? LIMIT 1`, [accountId]);
    if (!row) {
      throw new Error("Falha ao carregar configuração de PIX");
    }

    return {
      ...row,
      enabled: this.parseBool(row.enabled),
      is_production: this.parseBool(row.is_production),
      provider: String(row.provider || "manual") as PixSettings["provider"],
      pix_key_type: String(row.pix_key_type || "random") as PixKeyType,
      pix_key_value: this.decryptSecret(row.pix_key_encrypted),
      receiver_name: String(row.receiver_name || "RECEBEDOR"),
      receiver_city: String(row.receiver_city || "SAO PAULO"),
      txid_prefix: String(row.txid_prefix || "LS"),
      default_description: row.default_description || null,
    } as PixSettings;
  }

  async updatePixSettings(accountId: string, payload: Partial<PixSettings>): Promise<PixSettings> {
    await this.ensureSchema();
    await this.getPixSettings(accountId);

    const fields: string[] = [];
    const values: any[] = [];

    if (payload.provider !== undefined) {
      const allowed = ["manual", "mercado_pago", "efi", "asaas", "openpix"];
      const provider = allowed.includes(String(payload.provider)) ? String(payload.provider) : "manual";
      fields.push("provider = ?");
      values.push(provider);
    }
    if (payload.enabled !== undefined) {
      fields.push("enabled = ?");
      values.push(payload.enabled ? 1 : 0);
    }
    if (payload.is_production !== undefined) {
      fields.push("is_production = ?");
      values.push(payload.is_production ? 1 : 0);
    }
    if (payload.pix_key_type !== undefined) {
      const allowedTypes: PixKeyType[] = ["cpf", "cnpj", "email", "phone", "random"];
      const keyType = allowedTypes.includes(payload.pix_key_type) ? payload.pix_key_type : "random";
      fields.push("pix_key_type = ?");
      values.push(keyType);
    }
    if (payload.pix_key_value !== undefined) {
      fields.push("pix_key_encrypted = ?");
      values.push(this.encryptSecret(payload.pix_key_value || null));
    }
    if (payload.receiver_name !== undefined) {
      fields.push("receiver_name = ?");
      values.push(this.normalizePixMerchantName(payload.receiver_name));
    }
    if (payload.receiver_city !== undefined) {
      fields.push("receiver_city = ?");
      values.push(this.normalizePixMerchantCity(payload.receiver_city));
    }
    if (payload.txid_prefix !== undefined) {
      fields.push("txid_prefix = ?");
      values.push(this.normalizePixTxidPrefix(payload.txid_prefix));
    }
    if (payload.default_description !== undefined) {
      const normalized = String(payload.default_description || "").trim();
      fields.push("default_description = ?");
      values.push(normalized ? normalized.slice(0, 120) : null);
    }

    if (fields.length > 0) {
      values.push(accountId);
      await update(`UPDATE payment_pix_settings SET ${fields.join(", ")} WHERE account_id = ?`, values);
    }

    return this.getPixSettings(accountId);
  }

  async generatePixCharge(accountId: string, input: PixGenerateInput): Promise<PixGenerateResult> {
    const settings = await this.getPixSettings(accountId);
    if (!settings.enabled) {
      throw new Error("PIX está desabilitado para esta conta");
    }

    const key = String(settings.pix_key_value || "").trim();
    if (!key) {
      throw new Error("Chave PIX não configurada");
    }

    const amount = Number(Math.max(0, this.toNumber(input.amount, 0)).toFixed(2));
    if (amount <= 0) {
      throw new Error("Valor do PIX deve ser maior que zero");
    }

    const txid = this.normalizePixTxid(
      input.txid || `${settings.txid_prefix}-${Date.now().toString(36).toUpperCase()}`
    );
    const description = String(input.description || settings.default_description || "").trim();

    const payload = this.buildPixPayload({
      key,
      amount,
      txid,
      receiverName: settings.receiver_name,
      receiverCity: settings.receiver_city,
      description,
    });

    const qr_code_data_url = await QRCode.toDataURL(payload, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });

    return {
      copy_paste: payload,
      qr_code_data_url,
      txid,
      amount,
      provider: settings.provider,
      mode: settings.is_production ? "production" : "test",
    };
  }

  private normalizePixText(value: string): string {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .trim();
  }

  private normalizePixMerchantName(value: string): string {
    const normalized = this.normalizePixText(value).toUpperCase();
    return (normalized || "RECEBEDOR").slice(0, 25);
  }

  private normalizePixMerchantCity(value: string): string {
    const normalized = this.normalizePixText(value).toUpperCase();
    return (normalized || "SAO PAULO").slice(0, 15);
  }

  private normalizePixTxidPrefix(value: string): string {
    const normalized = this.normalizePixText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return (normalized || "LS").slice(0, 12);
  }

  private normalizePixTxid(value: string): string {
    const normalized = this
      .normalizePixText(value)
      .toUpperCase()
      .replace(/[^A-Z0-9\-\.\/]/g, "");
    const txid = (normalized || `LS-${Date.now().toString(36).toUpperCase()}`).slice(0, 25);
    return txid || "LS";
  }

  private emvField(id: string, value: string): string {
    const size = String(value.length).padStart(2, "0");
    return `${id}${size}${value}`;
  }

  private crc16Ccitt(payload: string): string {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  private buildPixPayload(input: {
    key: string;
    amount: number;
    txid: string;
    receiverName: string;
    receiverCity: string;
    description?: string;
  }): string {
    const gui = this.emvField("00", "br.gov.bcb.pix");
    const key = this.emvField("01", String(input.key).trim());
    const description = input.description
      ? this.emvField("02", this.normalizePixText(input.description).slice(0, 72))
      : "";
    const merchantAccount = this.emvField("26", `${gui}${key}${description}`);

    const amountText = Number(input.amount).toFixed(2);

    const payloadNoCrc = [
      this.emvField("00", "01"),
      this.emvField("01", "12"),
      merchantAccount,
      this.emvField("52", "0000"),
      this.emvField("53", "986"),
      this.emvField("54", amountText),
      this.emvField("58", "BR"),
      this.emvField("59", this.normalizePixMerchantName(input.receiverName)),
      this.emvField("60", this.normalizePixMerchantCity(input.receiverCity)),
      this.emvField("62", this.emvField("05", this.normalizePixTxid(input.txid))),
      "6304",
    ].join("");

    const crc = this.crc16Ccitt(payloadNoCrc);
    return `${payloadNoCrc}${crc}`;
  }

  async upsertMethodConfig(
    accountId: string,
    methodType: PaymentMethodType,
    payload: Partial<PaymentMethodConfig>
  ): Promise<PaymentMethodConfig> {
    await this.ensureSchema();
    await this.ensureDefaultMethodRows(accountId);

    const fields: string[] = [];
    const values: any[] = [];

    if (payload.enabled !== undefined) {
      fields.push("enabled = ?");
      values.push(payload.enabled ? 1 : 0);
    }
    if (payload.max_installments !== undefined) {
      fields.push("max_installments = ?");
      values.push(Math.max(1, Math.floor(this.toNumber(payload.max_installments, 1))));
    }
    if (payload.min_installment_value !== undefined) {
      fields.push("min_installment_value = ?");
      values.push(Math.max(0, this.toNumber(payload.min_installment_value, 5)));
    }
    if (payload.interest_type !== undefined) {
      const allowed: InterestType[] = ["none", "merchant", "customer"];
      fields.push("interest_type = ?");
      values.push(allowed.includes(payload.interest_type as InterestType) ? payload.interest_type : "none");
    }
    if (payload.interest_percentage !== undefined) {
      fields.push("interest_percentage = ?");
      values.push(Math.max(0, this.toNumber(payload.interest_percentage, 0)));
    }
    if (payload.fee_fixed !== undefined) {
      fields.push("fee_fixed = ?");
      values.push(Math.max(0, this.toNumber(payload.fee_fixed, 0)));
    }
    if (payload.fee_percentage !== undefined) {
      fields.push("fee_percentage = ?");
      values.push(Math.max(0, this.toNumber(payload.fee_percentage, 0)));
    }

    if (fields.length > 0) {
      values.push(accountId, methodType);
      await update(
        `UPDATE payment_methods_config SET ${fields.join(", ")} WHERE account_id = ? AND method_type = ?`,
        values
      );
    }

    const row = await queryOne<PaymentMethodConfig>(
      `SELECT * FROM payment_methods_config WHERE account_id = ? AND method_type = ? LIMIT 1`,
      [accountId, methodType]
    );

    if (!row) throw new Error("configuração de método não encontrada");
    return {
      ...row,
      enabled: this.parseBool((row as any).enabled),
    } as PaymentMethodConfig;
  }

  async listCoupons(accountId: string): Promise<CouponRow[]> {
    await this.ensureSchema();
    const rows = await query<CouponRow[]>(`SELECT * FROM coupons WHERE account_id = ? ORDER BY created_at DESC`, [accountId]);
    return (rows || []).map((row: any) => ({
      ...row,
      active: this.parseBool(row.active),
      used_count: Math.max(0, Math.floor(this.toNumber(row.used_count, 0))),
      usage_limit: row.usage_limit !== null && row.usage_limit !== undefined ? Math.floor(this.toNumber(row.usage_limit, 0)) : null,
      value: this.toNumber(row.value, 0),
    }));
  }

  async saveCoupon(
    accountId: string,
    payload: Partial<CouponRow> & { code: string; discount_type: "percentage" | "fixed"; value: number }
  ): Promise<CouponRow> {
    await this.ensureSchema();
    const id = payload.id ? String(payload.id) : cryptoRandomId();

    const code = String(payload.code || "").trim().toUpperCase();
    if (!code) throw new Error("code é obrigatório");

    const discountType = payload.discount_type === "percentage" ? "percentage" : "fixed";
    const value = Math.max(0, this.toNumber(payload.value, 0));

    const exists = await queryOne<{ id: string }>(`SELECT id FROM coupons WHERE id = ? AND account_id = ? LIMIT 1`, [id, accountId]);

    if (exists) {
      await update(
        `UPDATE coupons
         SET code = ?, discount_type = ?, value = ?, expiration_date = ?, usage_limit = ?, active = ?
         WHERE id = ? AND account_id = ?`,
        [
          code,
          discountType,
          value,
          payload.expiration_date || null,
          payload.usage_limit !== undefined ? Math.max(0, Math.floor(this.toNumber(payload.usage_limit, 0))) : null,
          payload.active === false ? 0 : 1,
          id,
          accountId,
        ]
      );
    } else {
      await query(
        `INSERT INTO coupons (
          id, account_id, code, discount_type, value, expiration_date, usage_limit, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          accountId,
          code,
          discountType,
          value,
          payload.expiration_date || null,
          payload.usage_limit !== undefined ? Math.max(0, Math.floor(this.toNumber(payload.usage_limit, 0))) : null,
          payload.active === false ? 0 : 1,
        ]
      );
    }

    const row = await queryOne<CouponRow>(`SELECT * FROM coupons WHERE id = ? AND account_id = ? LIMIT 1`, [id, accountId]);
    if (!row) throw new Error("falha ao salvar cupom");
    return { ...row, active: this.parseBool((row as any).active) } as CouponRow;
  }

  async disableCoupon(accountId: string, couponId: string): Promise<boolean> {
    await this.ensureSchema();
    const affected = await update(`UPDATE coupons SET active = 0 WHERE id = ? AND account_id = ?`, [couponId, accountId]);
    return affected > 0;
  }

  async getValidCoupon(accountId: string, code?: string): Promise<CouponRow | null> {
    await this.ensureSchema();
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) return null;

    const row = await queryOne<CouponRow>(
      `SELECT *
       FROM coupons
       WHERE account_id = ?
         AND code = ?
         AND active = 1
         AND (expiration_date IS NULL OR expiration_date > NOW())
         AND (usage_limit IS NULL OR used_count < usage_limit)
       LIMIT 1`,
      [accountId, normalized]
    );
    return row || null;
  }

  async consumeCoupon(accountId: string, couponId: string): Promise<void> {
    await this.ensureSchema();
    await update(
      `UPDATE coupons
       SET used_count = used_count + 1
       WHERE id = ? AND account_id = ?
         AND active = 1
         AND (usage_limit IS NULL OR used_count < usage_limit)`,
      [couponId, accountId]
    );
  }

  async getProductOverride(accountId: string, productId: string): Promise<ProductPaymentOverride | null> {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT * FROM product_payment_overrides WHERE account_id = ? AND product_id = ? LIMIT 1`,
      [accountId, productId]
    );
    if (!row) return null;

    return {
      ...row,
      allow_pix: row.allow_pix === null || row.allow_pix === undefined ? null : this.parseBool(row.allow_pix),
      allow_card: row.allow_card === null || row.allow_card === undefined ? null : this.parseBool(row.allow_card),
      allow_boleto: row.allow_boleto === null || row.allow_boleto === undefined ? null : this.parseBool(row.allow_boleto),
      allow_wallet: row.allow_wallet === null || row.allow_wallet === undefined ? null : this.parseBool(row.allow_wallet),
      max_installments: row.max_installments !== null && row.max_installments !== undefined ? Math.floor(this.toNumber(row.max_installments, 1)) : null,
    } as ProductPaymentOverride;
  }

  async upsertProductOverride(
    accountId: string,
    productId: string,
    payload: Partial<ProductPaymentOverride>
  ): Promise<ProductPaymentOverride> {
    await this.ensureSchema();
    const existing = await this.getProductOverride(accountId, productId);

    if (existing) {
      await update(
        `UPDATE product_payment_overrides
         SET allow_pix = ?, allow_card = ?, allow_boleto = ?, allow_wallet = ?,
             max_installments = ?, gateway_name = ?
         WHERE account_id = ? AND product_id = ?`,
        [
          payload.allow_pix === undefined ? existing.allow_pix : payload.allow_pix,
          payload.allow_card === undefined ? existing.allow_card : payload.allow_card,
          payload.allow_boleto === undefined ? existing.allow_boleto : payload.allow_boleto,
          payload.allow_wallet === undefined ? existing.allow_wallet : payload.allow_wallet,
          payload.max_installments === undefined ? existing.max_installments : payload.max_installments,
          payload.gateway_name === undefined ? existing.gateway_name : payload.gateway_name,
          accountId,
          productId,
        ]
      );
    } else {
      await query(
        `INSERT INTO product_payment_overrides (
          id, account_id, product_id, allow_pix, allow_card, allow_boleto, allow_wallet, max_installments, gateway_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cryptoRandomId(),
          accountId,
          productId,
          payload.allow_pix ?? null,
          payload.allow_card ?? null,
          payload.allow_boleto ?? null,
          payload.allow_wallet ?? null,
          payload.max_installments ?? null,
          payload.gateway_name ?? null,
        ]
      );
    }

    const row = await this.getProductOverride(accountId, productId);
    if (!row) throw new Error("falha ao salvar override de pagamento");
    return row;
  }

  private isMethodAllowedBySettings(settings: PaymentSettings, method: PaymentMethodType): boolean {
    if (method === "pix") return settings.allow_pix;
    if (method === "card") return settings.allow_card;
    if (method === "boleto") return settings.allow_boleto;
    if (method === "wallet") return settings.allow_wallet;
    return false;
  }

  private isMethodAllowedByOverride(override: ProductPaymentOverride | null, method: PaymentMethodType): boolean {
    if (!override) return true;

    if (method === "pix" && override.allow_pix !== null && override.allow_pix !== undefined) return !!override.allow_pix;
    if (method === "card" && override.allow_card !== null && override.allow_card !== undefined) return !!override.allow_card;
    if (method === "boleto" && override.allow_boleto !== null && override.allow_boleto !== undefined) return !!override.allow_boleto;
    if (method === "wallet" && override.allow_wallet !== null && override.allow_wallet !== undefined) return !!override.allow_wallet;

    return true;
  }

  async calculateFinalAmount(input: PaymentCalculationInput): Promise<PaymentCalculationResult> {
    await this.ensureSchema();

    const settings = await this.getSettings(input.account_id);
    const methods = await this.listMethodConfigs(input.account_id);
    const method = methods.find((row) => row.method_type === input.method_type);
  const notes: string[] = [];

    if (!method || !method.enabled) {
      throw new Error("método de pagamento desabilitado");
    }

    if (!this.isMethodAllowedBySettings(settings, input.method_type)) {
      throw new Error("método de pagamento bloqueado na configuração global");
    }

    const override = input.product_id ? await this.getProductOverride(input.account_id, input.product_id) : null;
    if (!this.isMethodAllowedByOverride(override, input.method_type)) {
      throw new Error("método de pagamento bloqueado para este produto");
    }

    const baseAmount = Math.max(0, this.toNumber(input.amount, 0));
    if (baseAmount <= 0) throw new Error("valor base inválido");

    const coupon = await this.getValidCoupon(input.account_id, input.coupon_code);

    const configuredInstallments = Math.max(1, method.max_installments || 1);
    const overrideInstallments = override?.max_installments && override.max_installments > 0 ? override.max_installments : null;
    const maxInstallments = Math.max(1, overrideInstallments || configuredInstallments);
    let installments = Math.max(1, Math.floor(this.toNumber(input.installments, 1)));
    if (installments > maxInstallments) {
      installments = maxInstallments;
  notes.push(`parcelamento ajustado para máximo permitido (${maxInstallments}x)`);
    }

    let amount = baseAmount;
    let couponDiscount = 0;

    if (coupon) {
      if (coupon.discount_type === "percentage") {
        couponDiscount = Number(((amount * coupon.value) / 100).toFixed(2));
      } else {
        couponDiscount = Number(Math.min(amount, coupon.value).toFixed(2));
      }
      amount = Number(Math.max(0, amount - couponDiscount).toFixed(2));
  notes.push(`cupom ${coupon.code} aplicado`);
    }

    const promoDiscount = 0;

    const feeFixed = Number(method.fee_fixed || 0);
    const feePercentageAmount = Number(((amount * Number(method.fee_percentage || 0)) / 100).toFixed(2));

    let interestAmount = 0;
    if (installments > 1 && method.interest_type === "customer" && method.interest_percentage > 0) {
      interestAmount = Number(((amount * Number(method.interest_percentage || 0)) / 100).toFixed(2));
      notes.push(`juros de parcelamento ao cliente: ${method.interest_percentage}%`);
    } else if (installments > 1 && method.interest_type === "merchant" && method.interest_percentage > 0) {
      notes.push("juros absorvidos pelo lojista");
    }

    const finalAmount = Number(Math.max(0, amount + feeFixed + feePercentageAmount + interestAmount).toFixed(2));
    const installmentAmount = Number((finalAmount / installments).toFixed(2));

    if (installmentAmount < Number(method.min_installment_value || 0)) {
      installments = Math.max(1, Math.floor(finalAmount / Math.max(1, method.min_installment_value || 1)));
      if (installments <= 0) installments = 1;
  notes.push("parcelamento reduzido por valor mínimo de parcela");
    }

  const finalInstallmentAmount = Number((finalAmount / installments).toFixed(2));

    return {
      currency: settings.default_currency,
      method_type: input.method_type,
      base_amount: baseAmount,
      coupon_discount: couponDiscount,
      promo_discount: promoDiscount,
      fee_fixed: feeFixed,
      fee_percentage_amount: feePercentageAmount,
      interest_amount: interestAmount,
      final_amount: finalAmount,
      installments,
  installment_amount: finalInstallmentAmount,
      interest_type: method.interest_type,
      interest_percentage: Number(method.interest_percentage || 0),
      applied_coupon: coupon
        ? {
            id: coupon.id,
            code: coupon.code,
            discount_type: coupon.discount_type,
            value: Number(coupon.value || 0),
          }
        : null,
  notes,
    };
  }

  async getCheckoutOptions(accountId: string, input: { amount: number; product_id?: string; coupon_code?: string }) {
    await this.ensureSchema();
    const methods = await this.listMethodConfigs(accountId);
    const settings = await this.getSettings(accountId);
  const override = input.product_id ? await this.getProductOverride(accountId, input.product_id) : null;

    const activeMethods = methods.filter((method) => {
      if (!method.enabled) return false;
      if (!this.isMethodAllowedBySettings(settings, method.method_type)) return false;
  if (!this.isMethodAllowedByOverride(override, method.method_type)) return false;
      return true;
    });

    const previews = [] as Array<{
      method_type: PaymentMethodType;
      label: string;
      max_installments: number;
      estimate: PaymentCalculationResult;
    }>;

    for (const method of activeMethods) {
      const estimate = await this.calculateFinalAmount({
        account_id: accountId,
        method_type: method.method_type,
        amount: input.amount,
        installments: method.method_type === "card" ? Math.min(3, method.max_installments) : 1,
        coupon_code: input.coupon_code,
  product_id: input.product_id,
      });

      previews.push({
        method_type: method.method_type,
        label:
          method.method_type === "pix"
            ? "PIX"
            : method.method_type === "card"
            ? "Cartão"
            : method.method_type === "boleto"
            ? "Boleto"
            : "Carteira",
        max_installments: method.max_installments,
        estimate,
      });
    }

    return {
      settings,
      methods: activeMethods,
  override,
      previews,
    };
  }

  async resolveGatewayForPayment(
    accountId: string,
    options?: { gatewayName?: string; productId?: string }
  ): Promise<(PaymentGatewayRow & { secret_key?: string | null }) | null> {
    await this.ensureSchema();

    const requested = String(options?.gatewayName || "").trim().toLowerCase();
    if (requested) {
      return this.getGatewayByName(accountId, requested);
    }

    if (options?.productId) {
      const override = await this.getProductOverride(accountId, options.productId);
      const overrideGateway = String(override?.gateway_name || "").trim().toLowerCase();
      if (overrideGateway) {
        const gateway = await this.getGatewayByName(accountId, overrideGateway);
        if (gateway) return gateway;
      }
    }

    const gateways = await this.listActiveGateways(accountId);
    return gateways[0] || null;
  }

  async savePaymentTransaction(input: {
    id?: string;
    account_id: string;
    order_id: string;
    gateway_name: string;
    provider_payment_id: string;
    method_type: PaymentMethodType;
    amount: number;
    currency: string;
    status?: "pending" | "paid" | "failed" | "canceled";
    payment_url?: string | null;
    raw_response?: Record<string, any> | null;
  }): Promise<PaymentTransactionRow> {
    await this.ensureSchema();
    const id = String(input.id || cryptoRandomId());

    await query(
      `INSERT INTO payment_transactions (
        id, account_id, order_id, gateway_name, provider_payment_id,
        method_type, amount, currency, status, payment_url, raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        gateway_name = VALUES(gateway_name),
        method_type = VALUES(method_type),
        amount = VALUES(amount),
        currency = VALUES(currency),
        status = VALUES(status),
        payment_url = VALUES(payment_url),
        raw_response = VALUES(raw_response),
        updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        input.account_id,
        input.order_id,
        String(input.gateway_name || "").trim().toLowerCase(),
        String(input.provider_payment_id || "").trim(),
        input.method_type,
        Math.max(0, this.toNumber(input.amount, 0)),
        this.sanitizeCurrency(input.currency),
        input.status || "pending",
        input.payment_url || null,
        input.raw_response ? JSON.stringify(input.raw_response) : null,
      ]
    );

    const row = await queryOne<PaymentTransactionRow>(
      `SELECT * FROM payment_transactions WHERE provider_payment_id = ? LIMIT 1`,
      [String(input.provider_payment_id || "").trim()]
    );
    if (!row) throw new Error("falha ao salvar transação de pagamento");
    return row;
  }

  async getTransactionByProviderPaymentId(providerPaymentId: string): Promise<PaymentTransactionRow | null> {
    await this.ensureSchema();
    const id = String(providerPaymentId || "").trim();
    if (!id) return null;
    const row = await queryOne<PaymentTransactionRow>(
      `SELECT * FROM payment_transactions WHERE provider_payment_id = ? LIMIT 1`,
      [id]
    );
    return row || null;
  }

  async updateTransactionStatus(
    providerPaymentId: string,
    status: "pending" | "paid" | "failed" | "canceled",
    rawResponse?: Record<string, any>
  ): Promise<void> {
    await this.ensureSchema();
    await update(
      `UPDATE payment_transactions
       SET status = ?, raw_response = COALESCE(?, raw_response)
       WHERE provider_payment_id = ?`,
      [status, rawResponse ? JSON.stringify(rawResponse) : null, String(providerPaymentId || "").trim()]
    );
  }

  async writePaymentLog(input: {
    account_id: string;
    order_id?: string | null;
    gateway: string;
    request_payload?: Record<string, any>;
    response_payload?: Record<string, any>;
    status: string;
  }): Promise<void> {
    await this.ensureSchema();
    await query(
      `INSERT INTO payment_logs (account_id, order_id, gateway, request_payload, response_payload, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.account_id,
        input.order_id || null,
        input.gateway,
        input.request_payload ? JSON.stringify(input.request_payload) : null,
        input.response_payload ? JSON.stringify(input.response_payload) : null,
        String(input.status || "unknown"),
      ]
    );
  }

  async listPaymentLogs(accountId: string, orderId?: string): Promise<any[]> {
    await this.ensureSchema();
    if (orderId) {
      return query<any[]>(
        `SELECT * FROM payment_logs WHERE account_id = ? AND order_id = ? ORDER BY created_at DESC LIMIT 200`,
        [accountId, orderId]
      );
    }

    return query<any[]>(`SELECT * FROM payment_logs WHERE account_id = ? ORDER BY created_at DESC LIMIT 200`, [accountId]);
  }
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

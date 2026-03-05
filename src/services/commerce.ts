import { randomUUID } from "crypto";
import { query, queryOne, update } from "../config/database";

export type CommerceProductType = "fisico" | "digital" | "servico";
export type CommerceOrderStatus =
  | "criado"
  | "aguardando_pagamento"
  | "pago"
  | "cancelado"
  | "estornado"
  | "abandonado";
export type CommerceOrderOrigin = "whatsapp" | "checkout_web";
export type CommercePaymentMethod = "pix" | "cartao" | "boleto" | "desconhecido";

type ColumnMeta = {
  field: string;
  type: string;
  nullable: boolean;
};

export type CommerceProduct = {
  id: string;
  user_id: string;
  brand_id?: string | null;
  nome: string;
  descricao?: string | null;
  tipo: CommerceProductType;
  preco: number;
  preco_promocional?: number | null;
  parcelamento: number;
  estoque?: number | null;
  tempo_entrega?: string | null;
  garantia?: string | null;
  imagem?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type CommerceOrder = {
  id: string;
  user_id: string;
  brand_id?: string | null;
  lead_id?: string | null;
  instance_id?: string | null;
  valor_total: number;
  subtotal: number;
  desconto: number;
  cupom_codigo?: string | null;
  forma_pagamento: CommercePaymentMethod;
  status_pedido: CommerceOrderStatus;
  origem: CommerceOrderOrigin;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  checkout_token: string;
  checkout_expires_at?: string | null;
  payment_link?: string | null;
  data_criacao: string;
  data_pagamento?: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceOrderItem = {
  id: number;
  order_id: string;
  product_id?: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  metadata_json?: string | null;
};

export class CommerceService {
  private schemaReady = false;
  private schemaReadyPromise: Promise<void> | null = null;
  private customersColumnsCache: Map<string, ColumnMeta> | null = null;

  private normalizeBrandId(brandId?: string | null): string | null {
    const normalized = String(brandId || "").trim();
    return normalized || null;
  }

  private normalizePaymentMethod(value?: string | null): CommercePaymentMethod {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "pix") return "pix";
    if (["cartao", "cartão", "card", "credit_card"].includes(normalized)) return "cartao";
    if (["boleto"].includes(normalized)) return "boleto";
    return "desconhecido";
  }

  private normalizeOrderStatus(value?: string | null): CommerceOrderStatus {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      [
        "criado",
        "aguardando_pagamento",
        "pago",
        "cancelado",
        "estornado",
        "abandonado",
      ].includes(normalized)
    ) {
      return normalized as CommerceOrderStatus;
    }
    return "criado";
  }

  private parseNumber(input: unknown, defaultValue = 0): number {
    const value = Number(input);
    if (!Number.isFinite(value)) return defaultValue;
    return value;
  }

  private makeCheckoutToken(): string {
    return randomUUID().replace(/-/g, "");
  }

  private async getCustomersColumns(): Promise<Map<string, ColumnMeta>> {
    if (this.customersColumnsCache) return this.customersColumnsCache;

    const rows = await query<any[]>("SHOW COLUMNS FROM customers");
    const map = new Map<string, ColumnMeta>();
    for (const row of rows) {
      map.set(String(row.Field), {
        field: String(row.Field),
        type: String(row.Type || ""),
        nullable: String(row.Null || "").toUpperCase() === "YES",
      });
    }
    this.customersColumnsCache = map;
    return map;
  }

  private resolveOwnerColumn(columns: Map<string, ColumnMeta>): string | null {
    if (columns.has("owner_user_id")) return "owner_user_id";
    if (columns.has("user_id")) return "user_id";
    return null;
  }

  private parseTags(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item).trim()).filter(Boolean);
    }

    const text = String(raw).trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // keep fallback split
    }

    return text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async updateLeadLifecycle(
    userId: string,
    leadId: string,
    brandId: string | null,
    input: {
      status?: string;
      tagsToAdd?: string[];
    }
  ): Promise<void> {
    const columns = await this.getCustomersColumns();
    const ownerColumn = this.resolveOwnerColumn(columns);
    if (!ownerColumn) return;

    const whereParts = ["id = ?", `${ownerColumn} = ?`];
    const whereValues: any[] = [leadId, userId];

    if (columns.has("brand_id")) {
      if (brandId) {
        whereParts.push("brand_id = ?");
        whereValues.push(brandId);
      } else {
        whereParts.push("brand_id IS NULL");
      }
    }

    const row = await queryOne<any>(
      `SELECT id${columns.has("tags") ? ", tags" : ""} FROM customers WHERE ${whereParts.join(" AND ")} LIMIT 1`,
      whereValues
    );
    if (!row) return;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.status && columns.has("status")) {
      fields.push("status = ?");
      values.push(input.status);
    }

    if (columns.has("tags") && input.tagsToAdd && input.tagsToAdd.length > 0) {
      const existing = this.parseTags(row.tags);
      const next = new Set(existing.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));
      for (const tag of input.tagsToAdd) {
        const normalized = String(tag).trim().toLowerCase();
        if (normalized) next.add(normalized);
      }
      fields.push("tags = ?");
      values.push(JSON.stringify(Array.from(next)));
    }

    if (fields.length === 0) return;
    if (columns.has("updated_at")) fields.push("updated_at = NOW()");

    values.push(...whereValues);
    await update(`UPDATE customers SET ${fields.join(", ")} WHERE ${whereParts.join(" AND ")}`, values);
  }

  private async appendOrderEvent(orderId: string, eventType: string, payload?: Record<string, any>): Promise<void> {
    await query(
      `INSERT INTO commerce_order_events (order_id, event_type, payload_json)
       VALUES (?, ?, ?)` ,
      [orderId, eventType, payload ? JSON.stringify(payload) : null]
    );
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (this.schemaReadyPromise) {
      await this.schemaReadyPromise;
      return;
    }

    this.schemaReadyPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS commerce_products (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          nome VARCHAR(180) NOT NULL,
          descricao TEXT NULL,
          tipo ENUM('fisico','digital','servico') NOT NULL DEFAULT 'servico',
          preco DECIMAL(12,2) NOT NULL DEFAULT 0,
          preco_promocional DECIMAL(12,2) NULL,
          parcelamento INT NOT NULL DEFAULT 1,
          estoque INT NULL,
          tempo_entrega VARCHAR(180) NULL,
          garantia VARCHAR(255) NULL,
          imagem TEXT NULL,
          ativo TINYINT(1) NOT NULL DEFAULT 1,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_commerce_products_user_brand (user_id, brand_id),
          KEY idx_commerce_products_active (ativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS commerce_orders (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NULL,
          lead_id VARCHAR(64) NULL,
          instance_id VARCHAR(64) NULL,
          valor_total DECIMAL(12,2) NOT NULL DEFAULT 0,
          subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
          desconto DECIMAL(12,2) NOT NULL DEFAULT 0,
          cupom_codigo VARCHAR(80) NULL,
          forma_pagamento ENUM('pix','cartao','boleto','desconhecido') NOT NULL DEFAULT 'desconhecido',
          status_pedido ENUM('criado','aguardando_pagamento','pago','cancelado','estornado','abandonado') NOT NULL DEFAULT 'criado',
          origem ENUM('whatsapp','checkout_web') NOT NULL DEFAULT 'whatsapp',
          customer_name VARCHAR(180) NULL,
          customer_email VARCHAR(180) NULL,
          customer_phone VARCHAR(60) NULL,
          checkout_token VARCHAR(96) NOT NULL,
          checkout_expires_at DATETIME NULL,
          payment_link TEXT NULL,
          data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          data_pagamento DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_commerce_orders_checkout_token (checkout_token),
          KEY idx_commerce_orders_user_brand (user_id, brand_id),
          KEY idx_commerce_orders_status (status_pedido),
          KEY idx_commerce_orders_lead (lead_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS commerce_order_items (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          product_id VARCHAR(36) NULL,
          nome VARCHAR(180) NOT NULL,
          quantidade INT NOT NULL DEFAULT 1,
          valor_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
          valor_total DECIMAL(12,2) NOT NULL DEFAULT 0,
          metadata_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_commerce_order_items_order (order_id),
          KEY idx_commerce_order_items_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS commerce_order_events (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          order_id VARCHAR(36) NOT NULL,
          event_type VARCHAR(80) NOT NULL,
          payload_json JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_commerce_order_events_order (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      this.schemaReady = true;
    })().finally(() => {
      this.schemaReadyPromise = null;
    });

    await this.schemaReadyPromise;
  }

  private buildBrandWhereClause(brandId: string | null, column = "brand_id"): { sql: string; params: any[] } {
    if (brandId) {
      return { sql: `${column} = ?`, params: [brandId] };
    }
    return { sql: `${column} IS NULL`, params: [] };
  }

  async listProducts(userId: string, brandId?: string | null): Promise<CommerceProduct[]> {
    await this.ensureSchema();
    const normalizedBrandId = this.normalizeBrandId(brandId);
    const brand = this.buildBrandWhereClause(normalizedBrandId);

    return query<CommerceProduct[]>(
      `SELECT *
       FROM commerce_products
       WHERE user_id = ? AND ${brand.sql}
       ORDER BY created_at DESC`,
      [userId, ...brand.params]
    );
  }

  async getProductById(userId: string, brandId: string | null, productId: string): Promise<CommerceProduct | null> {
    await this.ensureSchema();
    const brand = this.buildBrandWhereClause(this.normalizeBrandId(brandId));

    return (
      (await queryOne<CommerceProduct>(
        `SELECT *
         FROM commerce_products
         WHERE id = ? AND user_id = ? AND ${brand.sql}
         LIMIT 1`,
        [productId, userId, ...brand.params]
      )) || null
    );
  }

  async createProduct(
    userId: string,
    brandId: string | null,
    payload: Partial<{
      nome: string;
      descricao: string;
      tipo: CommerceProductType;
      preco: number;
      preco_promocional: number | null;
      parcelamento: number;
      estoque: number | null;
      tempo_entrega: string;
      garantia: string;
      imagem: string;
      ativo: boolean;
    }>
  ): Promise<CommerceProduct> {
    await this.ensureSchema();
    const id = randomUUID();
    const nome = String(payload.nome || "").trim();
    if (!nome) throw new Error("nome do produto é obrigatório");

    const tipo = ["fisico", "digital", "servico"].includes(String(payload.tipo || ""))
      ? (payload.tipo as CommerceProductType)
      : "servico";

    const preco = this.parseNumber(payload.preco, 0);
    if (preco <= 0) throw new Error("preço do produto deve ser maior que zero");

    await query(
      `INSERT INTO commerce_products (
        id, user_id, brand_id, nome, descricao, tipo,
        preco, preco_promocional, parcelamento, estoque,
        tempo_entrega, garantia, imagem, ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        this.normalizeBrandId(brandId),
        nome,
        payload.descricao ? String(payload.descricao).trim() : null,
        tipo,
        preco,
        payload.preco_promocional !== undefined ? this.parseNumber(payload.preco_promocional, 0) : null,
        Math.max(1, Math.floor(this.parseNumber(payload.parcelamento, 1))),
        payload.estoque !== undefined && payload.estoque !== null ? Math.floor(this.parseNumber(payload.estoque, 0)) : null,
        payload.tempo_entrega ? String(payload.tempo_entrega).trim() : null,
        payload.garantia ? String(payload.garantia).trim() : null,
        payload.imagem ? String(payload.imagem).trim() : null,
        payload.ativo === false ? 0 : 1,
      ]
    );

    const created = await this.getProductById(userId, this.normalizeBrandId(brandId), id);
    if (!created) throw new Error("falha ao criar produto");
    return created;
  }

  async updateProduct(
    userId: string,
    brandId: string | null,
    productId: string,
    payload: Partial<{
      nome: string;
      descricao: string;
      tipo: CommerceProductType;
      preco: number;
      preco_promocional: number | null;
      parcelamento: number;
      estoque: number | null;
      tempo_entrega: string;
      garantia: string;
      imagem: string;
      ativo: boolean;
    }>
  ): Promise<CommerceProduct | null> {
    await this.ensureSchema();
    const current = await this.getProductById(userId, brandId, productId);
    if (!current) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (payload.nome !== undefined) {
      const nome = String(payload.nome || "").trim();
      if (!nome) throw new Error("nome do produto é obrigatório");
      fields.push("nome = ?");
      values.push(nome);
    }
    if (payload.descricao !== undefined) {
      fields.push("descricao = ?");
      values.push(payload.descricao ? String(payload.descricao).trim() : null);
    }
    if (payload.tipo !== undefined) {
      if (!["fisico", "digital", "servico"].includes(String(payload.tipo))) {
        throw new Error("tipo de produto inválido");
      }
      fields.push("tipo = ?");
      values.push(payload.tipo);
    }
    if (payload.preco !== undefined) {
      const preco = this.parseNumber(payload.preco, 0);
      if (preco <= 0) throw new Error("preço do produto deve ser maior que zero");
      fields.push("preco = ?");
      values.push(preco);
    }
    if (payload.preco_promocional !== undefined) {
      fields.push("preco_promocional = ?");
      values.push(payload.preco_promocional === null ? null : this.parseNumber(payload.preco_promocional, 0));
    }
    if (payload.parcelamento !== undefined) {
      fields.push("parcelamento = ?");
      values.push(Math.max(1, Math.floor(this.parseNumber(payload.parcelamento, 1))));
    }
    if (payload.estoque !== undefined) {
      fields.push("estoque = ?");
      values.push(payload.estoque === null ? null : Math.floor(this.parseNumber(payload.estoque, 0)));
    }
    if (payload.tempo_entrega !== undefined) {
      fields.push("tempo_entrega = ?");
      values.push(payload.tempo_entrega ? String(payload.tempo_entrega).trim() : null);
    }
    if (payload.garantia !== undefined) {
      fields.push("garantia = ?");
      values.push(payload.garantia ? String(payload.garantia).trim() : null);
    }
    if (payload.imagem !== undefined) {
      fields.push("imagem = ?");
      values.push(payload.imagem ? String(payload.imagem).trim() : null);
    }
    if (payload.ativo !== undefined) {
      fields.push("ativo = ?");
      values.push(payload.ativo ? 1 : 0);
    }

    if (fields.length === 0) return current;

    fields.push("updated_at = NOW()");
    const brand = this.buildBrandWhereClause(this.normalizeBrandId(brandId));
    values.push(productId, userId, ...brand.params);

    await update(
      `UPDATE commerce_products
       SET ${fields.join(", ")}
       WHERE id = ? AND user_id = ? AND ${brand.sql}`,
      values
    );

    return this.getProductById(userId, brandId, productId);
  }

  async listOrders(
    userId: string,
    brandId: string | null,
    filters?: {
      status?: string;
      lead_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CommerceOrder[]> {
    await this.ensureSchema();
    const brand = this.buildBrandWhereClause(this.normalizeBrandId(brandId));
    const where = [`user_id = ?`, brand.sql];
    const params: any[] = [userId, ...brand.params];

    if (filters?.status) {
      where.push("status_pedido = ?");
      params.push(this.normalizeOrderStatus(filters.status));
    }
    if (filters?.lead_id) {
      where.push("lead_id = ?");
      params.push(String(filters.lead_id));
    }

    const limit = Math.min(200, Math.max(1, Math.floor(this.parseNumber(filters?.limit, 50))));
    const offset = Math.max(0, Math.floor(this.parseNumber(filters?.offset, 0)));

    return query<CommerceOrder[]>(
      `SELECT *
       FROM commerce_orders
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
  }

  async getOrderById(
    userId: string,
    brandId: string | null,
    orderId: string
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[] } | null> {
    await this.ensureSchema();
    const brand = this.buildBrandWhereClause(this.normalizeBrandId(brandId));

    const order = await queryOne<CommerceOrder>(
      `SELECT *
       FROM commerce_orders
       WHERE id = ? AND user_id = ? AND ${brand.sql}
       LIMIT 1`,
      [orderId, userId, ...brand.params]
    );
    if (!order) return null;

    const items = await query<CommerceOrderItem[]>(
      `SELECT * FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`,
      [order.id]
    );

    return { order, items };
  }

  async createOrder(
    userId: string,
    brandId: string | null,
    input: {
      lead_id?: string | null;
      instance_id?: string | null;
      origem?: CommerceOrderOrigin;
      forma_pagamento?: CommercePaymentMethod | string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      cupom_codigo?: string;
      desconto?: number;
      checkout_base_url: string;
      itens: Array<{
        product_id?: string;
        nome?: string;
        quantidade?: number;
        valor_unitario?: number;
        imagem?: string | null;
        imagens?: string[];
        descricao?: string | null;
        categoria?: string | null;
      }>;
    }
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[]; checkout_url: string }> {
    await this.ensureSchema();
    if (!Array.isArray(input.itens) || input.itens.length === 0) {
      throw new Error("pedido precisa de pelo menos um item");
    }

    const normalizedBrandId = this.normalizeBrandId(brandId);
    const itensResolved: Array<{
      product_id?: string | null;
      nome: string;
      quantidade: number;
      valor_unitario: number;
      valor_total: number;
      metadata_json?: string | null;
    }> = [];

    for (const rawItem of input.itens) {
      const quantidade = Math.max(1, Math.floor(this.parseNumber(rawItem.quantidade, 1)));
      let nome = String(rawItem.nome || "").trim();
      let valorUnitario = this.parseNumber(rawItem.valor_unitario, 0);
      let productId: string | null = null;
      let snapshotImage: string | null = rawItem.imagem ? String(rawItem.imagem).trim() : null;
      let snapshotImages: string[] = Array.isArray(rawItem.imagens)
        ? rawItem.imagens.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
        : [];
      let snapshotDescription: string | null = rawItem.descricao ? String(rawItem.descricao).trim() : null;
      let snapshotCategory: string | null = rawItem.categoria ? String(rawItem.categoria).trim() : null;

      if (rawItem.product_id) {
        const product = await this.getProductById(userId, normalizedBrandId, String(rawItem.product_id));
        if (!product || !product.ativo) {
          throw new Error(`produto inválido no carrinho: ${rawItem.product_id}`);
        }

        productId = product.id;
        nome = product.nome;
        const promo = product.preco_promocional !== null && product.preco_promocional !== undefined
          ? Number(product.preco_promocional)
          : null;
        valorUnitario = promo !== null && Number.isFinite(promo) && promo > 0 ? promo : Number(product.preco || 0);
        if (!snapshotImage) snapshotImage = product.imagem ? String(product.imagem).trim() : null;
        if (!snapshotDescription) snapshotDescription = product.descricao ? String(product.descricao).trim() : null;
        if (!snapshotCategory) snapshotCategory = product.tipo ? String(product.tipo).trim() : null;
      }

      if (!nome) {
        throw new Error("item inválido: nome obrigatório");
      }
      if (valorUnitario <= 0) {
        throw new Error(`item inválido (${nome}): valor unitário deve ser maior que zero`);
      }

      if (snapshotImage && snapshotImages.length === 0) {
        snapshotImages = [snapshotImage];
      }

      const metadata = {
        snapshot: {
          imagem: snapshotImage || null,
          imagens: snapshotImages,
          descricao: snapshotDescription || null,
          categoria: snapshotCategory || null,
        },
      };

      itensResolved.push({
        product_id: productId,
        nome,
        quantidade,
        valor_unitario: valorUnitario,
        valor_total: Number((valorUnitario * quantidade).toFixed(2)),
        metadata_json: JSON.stringify(metadata),
      });
    }

    const subtotal = Number(
      itensResolved.reduce((acc, item) => acc + item.valor_total, 0).toFixed(2)
    );
    const desconto = Number(Math.max(0, this.parseNumber(input.desconto, 0)).toFixed(2));
    const valorTotal = Number(Math.max(0, subtotal - desconto).toFixed(2));

    const orderId = randomUUID();
    const checkoutToken = this.makeCheckoutToken();
    const checkoutExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const checkoutBase = String(input.checkout_base_url || "").replace(/\/+$/, "");
    const checkoutUrl = `${checkoutBase}/pedido/${checkoutToken}`;

    await query(
      `INSERT INTO commerce_orders (
        id, user_id, brand_id, lead_id, instance_id,
        valor_total, subtotal, desconto, cupom_codigo,
        forma_pagamento, status_pedido, origem,
        customer_name, customer_email, customer_phone,
        checkout_token, checkout_expires_at, payment_link, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_pagamento', ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        userId,
        normalizedBrandId,
        input.lead_id ? String(input.lead_id) : null,
        input.instance_id ? String(input.instance_id) : null,
        valorTotal,
        subtotal,
        desconto,
        input.cupom_codigo ? String(input.cupom_codigo).trim() : null,
        this.normalizePaymentMethod(input.forma_pagamento),
        input.origem === "checkout_web" ? "checkout_web" : "whatsapp",
        input.customer_name ? String(input.customer_name).trim() : null,
        input.customer_email ? String(input.customer_email).trim() : null,
        input.customer_phone ? String(input.customer_phone).trim() : null,
        checkoutToken,
        checkoutExpiresAt.toISOString().slice(0, 19).replace("T", " "),
        checkoutUrl,
      ]
    );

    for (const item of itensResolved) {
      await query(
        `INSERT INTO commerce_order_items (order_id, product_id, nome, quantidade, valor_unitario, valor_total, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id || null,
          item.nome,
          item.quantidade,
          item.valor_unitario,
          item.valor_total,
          item.metadata_json || null,
        ]
      );
    }

    await this.appendOrderEvent(orderId, "pedido_criado", {
      subtotal,
      desconto,
      valor_total: valorTotal,
      itens: itensResolved.length,
      origem: input.origem || "whatsapp",
    });

    if (input.lead_id) {
      await this.updateLeadLifecycle(userId, String(input.lead_id), normalizedBrandId, {
        status: "negotiating",
        tagsToAdd: ["pedido_criado"],
      });
    }

    const created = await this.getOrderById(userId, normalizedBrandId, orderId);
    if (!created) throw new Error("falha ao criar pedido");

    return { ...created, checkout_url: checkoutUrl };
  }

  async updateOrderStatus(
    userId: string,
    brandId: string | null,
    orderId: string,
    input: {
      status_pedido: CommerceOrderStatus | string;
      forma_pagamento?: CommercePaymentMethod | string;
      data_pagamento?: string | null;
    }
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[] } | null> {
    await this.ensureSchema();
    const found = await this.getOrderById(userId, brandId, orderId);
    if (!found) return null;

    const status = this.normalizeOrderStatus(input.status_pedido);
    const paymentMethod =
      input.forma_pagamento !== undefined
        ? this.normalizePaymentMethod(input.forma_pagamento)
        : found.order.forma_pagamento;

    const paidAt =
      status === "pago"
        ? input.data_pagamento || new Date().toISOString().slice(0, 19).replace("T", " ")
        : null;

    await update(
      `UPDATE commerce_orders
       SET status_pedido = ?, forma_pagamento = ?, data_pagamento = ?
       WHERE id = ?`,
      [status, paymentMethod, paidAt, orderId]
    );

    await this.appendOrderEvent(orderId, `status_${status}`, {
      payment_method: paymentMethod,
      data_pagamento: paidAt,
    });

    if (found.order.lead_id) {
      if (status === "pago") {
        await this.updateLeadLifecycle(userId, String(found.order.lead_id), this.normalizeBrandId(brandId), {
          status: "converted",
          tagsToAdd: ["cliente_ativo"],
        });
      } else if (status === "abandonado") {
        await this.updateLeadLifecycle(userId, String(found.order.lead_id), this.normalizeBrandId(brandId), {
          tagsToAdd: ["checkout_abandonado"],
        });
      }
    }

    return this.getOrderById(userId, brandId, orderId);
  }

  async getCheckoutByToken(
    checkoutToken: string
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[]; expired: boolean } | null> {
    await this.ensureSchema();
    const token = String(checkoutToken || "").trim();
    if (!token) return null;

    const order = await queryOne<CommerceOrder>(
      `SELECT * FROM commerce_orders WHERE checkout_token = ? LIMIT 1`,
      [token]
    );
    if (!order) return null;

    const items = await query<CommerceOrderItem[]>(
      `SELECT * FROM commerce_order_items WHERE order_id = ? ORDER BY id ASC`,
      [order.id]
    );

    const expiresAt = order.checkout_expires_at ? new Date(order.checkout_expires_at).getTime() : null;
    const expired =
      order.status_pedido === "aguardando_pagamento" &&
      expiresAt !== null &&
      Number.isFinite(expiresAt) &&
      expiresAt < Date.now();

    if (expired) {
      await update(`UPDATE commerce_orders SET status_pedido = 'abandonado' WHERE id = ?`, [order.id]);
      await this.appendOrderEvent(order.id, "checkout_abandonado", { reason: "expired_link" });
      if (order.lead_id) {
        await this.updateLeadLifecycle(order.user_id, String(order.lead_id), this.normalizeBrandId(order.brand_id), {
          tagsToAdd: ["checkout_abandonado"],
        });
      }
      order.status_pedido = "abandonado";
    }

    return { order, items, expired };
  }

  async rebuildCheckoutFromToken(
    checkoutToken: string,
    input: {
      checkout_base_url: string;
      forma_pagamento?: CommercePaymentMethod | string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      itens?: Array<{
        product_id?: string;
        nome?: string;
        quantidade?: number;
        valor_unitario?: number;
      }>;
    }
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[]; checkout_url: string }> {
    const checkout = await this.getCheckoutByToken(checkoutToken);
    if (!checkout) throw new Error("checkout não encontrado");
    if (checkout.order.status_pedido === "pago") throw new Error("pedido já foi pago");
    if (checkout.expired || checkout.order.status_pedido === "abandonado") throw new Error("checkout expirado");

    const fallbackItems = checkout.items.map((item) => ({
      product_id: item.product_id || undefined,
      nome: item.nome,
      quantidade: Number(item.quantidade || 1),
      valor_unitario: Number(item.valor_unitario || 0),
    }));

    const nextItems = Array.isArray(input.itens) && input.itens.length > 0 ? input.itens : fallbackItems;

    return this.createOrder(checkout.order.user_id, this.normalizeBrandId(checkout.order.brand_id), {
      lead_id: checkout.order.lead_id || undefined,
      instance_id: checkout.order.instance_id || undefined,
      origem: "checkout_web",
      forma_pagamento: input.forma_pagamento || checkout.order.forma_pagamento,
      customer_name: input.customer_name || checkout.order.customer_name || undefined,
      customer_email: input.customer_email || checkout.order.customer_email || undefined,
      customer_phone: input.customer_phone || checkout.order.customer_phone || undefined,
      cupom_codigo: checkout.order.cupom_codigo || undefined,
      desconto: Number(checkout.order.desconto || 0),
      checkout_base_url: input.checkout_base_url,
      itens: nextItems,
    });
  }

  async completeCheckout(
    checkoutToken: string,
    input: {
      forma_pagamento?: CommercePaymentMethod | string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
    }
  ): Promise<{ order: CommerceOrder; items: CommerceOrderItem[] }> {
    const checkout = await this.getCheckoutByToken(checkoutToken);
    if (!checkout) {
      throw new Error("checkout não encontrado");
    }

    const order = checkout.order;
    if (order.status_pedido === "pago") return { order, items: checkout.items };
    if (order.status_pedido === "abandonado" || checkout.expired) {
      throw new Error("checkout expirado");
    }

    const paymentMethod = this.normalizePaymentMethod(input.forma_pagamento || order.forma_pagamento);
    const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    await update(
      `UPDATE commerce_orders
       SET status_pedido = 'pago',
           forma_pagamento = ?,
           data_pagamento = ?,
           customer_name = COALESCE(?, customer_name),
           customer_email = COALESCE(?, customer_email),
           customer_phone = COALESCE(?, customer_phone)
       WHERE id = ?`,
      [
        paymentMethod,
        paidAt,
        input.customer_name ? String(input.customer_name).trim() : null,
        input.customer_email ? String(input.customer_email).trim() : null,
        input.customer_phone ? String(input.customer_phone).trim() : null,
        order.id,
      ]
    );

    await this.appendOrderEvent(order.id, "pagamento_confirmado", {
      forma_pagamento: paymentMethod,
      data_pagamento: paidAt,
    });

    if (order.lead_id) {
      await this.updateLeadLifecycle(order.user_id, String(order.lead_id), this.normalizeBrandId(order.brand_id), {
        status: "converted",
        tagsToAdd: ["cliente_ativo"],
      });
    }

    const refreshed = await this.getCheckoutByToken(checkoutToken);
    if (!refreshed) throw new Error("falha ao finalizar checkout");
    return { order: refreshed.order, items: refreshed.items };
  }

  async markAbandonedPendingOrders(minutesWithoutPayment = 30): Promise<{ updated: number }> {
    await this.ensureSchema();
    const min = Math.max(1, Math.floor(minutesWithoutPayment));

    const stale = await query<Array<{ id: string; lead_id: string | null; user_id: string; brand_id: string | null }>>(
      `SELECT id, lead_id, user_id, brand_id
       FROM commerce_orders
       WHERE status_pedido = 'aguardando_pagamento'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [min]
    );

    let updatedCount = 0;
    for (const row of stale) {
      const affected = await update(
        `UPDATE commerce_orders SET status_pedido = 'abandonado' WHERE id = ? AND status_pedido = 'aguardando_pagamento'`,
        [row.id]
      );
      if (affected > 0) {
        updatedCount += 1;
        await this.appendOrderEvent(row.id, "checkout_abandonado", { reason: "timeout", minutes: min });
        if (row.lead_id) {
          await this.updateLeadLifecycle(row.user_id, String(row.lead_id), this.normalizeBrandId(row.brand_id), {
            tagsToAdd: ["checkout_abandonado"],
          });
        }
      }
    }

    return { updated: updatedCount };
  }
}

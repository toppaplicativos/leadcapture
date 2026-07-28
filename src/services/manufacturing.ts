import { randomUUID } from "crypto";
import { getPool, query, queryOne } from "../config/database";

type Scope = { userId: string; brandId: string; actorId?: string | null };

const unitFactor: Record<string, number> = {
  kg: 1,
  g: 0.001,
  t: 1000,
  ton: 1000,
  tonelada: 1000,
  toneladas: 1000,
};

function cleanUnit(value: unknown): string {
  return String(value || "kg").trim().toLowerCase();
}

function positive(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} deve ser maior que zero`);
  return Number(parsed.toFixed(3));
}

function baseWeight(quantity: number, unit: string): number | null {
  const factor = unitFactor[cleanUnit(unit)];
  return factor ? Number((quantity * factor).toFixed(3)) : null;
}

export class ManufacturingService {
  private ready = false;
  private promise: Promise<void> | null = null;

  async ensureSchema(): Promise<void> {
    if (this.ready) return;
    if (this.promise) return this.promise;
    this.promise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_settings (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          track_lots BOOLEAN NOT NULL DEFAULT TRUE,
          base_weight_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
          updated_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_manufacturing_scope (user_id, brand_id)
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_materials (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          name VARCHAR(180) NOT NULL,
          sku VARCHAR(80) NULL,
          unit VARCHAR(20) NOT NULL DEFAULT 'kg',
          category VARCHAR(100) NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_lots (
          id VARCHAR(36) PRIMARY KEY,
          material_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          lot_code VARCHAR(100) NOT NULL,
          supplier VARCHAR(180) NULL,
          received_quantity DECIMAL(15,3) NOT NULL,
          available_quantity DECIMAL(15,3) NOT NULL,
          unit VARCHAR(20) NOT NULL,
          unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0,
          received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NULL,
          notes TEXT NULL,
          created_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_batches (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          batch_code VARCHAR(100) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'completed',
          input_weight_kg DECIMAL(15,3) NULL,
          output_weight_kg DECIMAL(15,3) NULL,
          waste_weight_kg DECIMAL(15,3) NULL,
          yield_percent DECIMAL(8,3) NULL,
          notes TEXT NULL,
          produced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_batch_inputs (
          id VARCHAR(36) PRIMARY KEY,
          batch_id VARCHAR(36) NOT NULL,
          lot_id VARCHAR(36) NOT NULL,
          material_id VARCHAR(36) NOT NULL,
          quantity DECIMAL(15,3) NOT NULL,
          unit VARCHAR(20) NOT NULL,
          weight_kg DECIMAL(15,3) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_batch_outputs (
          id VARCHAR(36) PRIMARY KEY,
          batch_id VARCHAR(36) NOT NULL,
          product_id VARCHAR(36) NOT NULL,
          quantity DECIMAL(15,3) NOT NULL,
          unit VARCHAR(20) NOT NULL DEFAULT 'un',
          unit_weight_kg DECIMAL(15,4) NULL,
          weight_kg DECIMAL(15,3) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_recipes (
          id VARCHAR(36) PRIMARY KEY,
          user_id VARCHAR(36) NOT NULL,
          brand_id VARCHAR(36) NOT NULL,
          product_id VARCHAR(36) NOT NULL,
          output_quantity DECIMAL(15,3) NOT NULL DEFAULT 1,
          unit_weight_kg DECIMAL(15,4) NULL,
          expected_loss_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
          notes TEXT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by VARCHAR(36) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_manufacturing_recipe_product (user_id, brand_id, product_id)
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS manufacturing_recipe_items (
          id VARCHAR(36) PRIMARY KEY,
          recipe_id VARCHAR(36) NOT NULL,
          material_id VARCHAR(36) NOT NULL,
          quantity DECIMAL(15,3) NOT NULL,
          unit VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.ready = true;
    })().finally(() => { this.promise = null; });
    return this.promise;
  }

  async settings(scope: Scope) {
    await this.ensureSchema();
    const row = await queryOne<any>(
      `SELECT enabled, track_lots, base_weight_unit
       FROM manufacturing_settings WHERE user_id = ? AND brand_id = ? LIMIT 1`,
      [scope.userId, scope.brandId],
    );
    return row || { enabled: false, track_lots: true, base_weight_unit: "kg" };
  }

  async updateSettings(scope: Scope, input: any) {
    await this.ensureSchema();
    const current = await queryOne<any>(
      `SELECT id FROM manufacturing_settings WHERE user_id = ? AND brand_id = ? LIMIT 1`,
      [scope.userId, scope.brandId],
    );
    if (current) {
      await query(
        `UPDATE manufacturing_settings
         SET enabled = ?, track_lots = ?, base_weight_unit = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.enabled === true, input.track_lots !== false, cleanUnit(input.base_weight_unit), scope.actorId || null, current.id],
      );
    } else {
      await query(
        `INSERT INTO manufacturing_settings
         (id, user_id, brand_id, enabled, track_lots, base_weight_unit, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), scope.userId, scope.brandId, input.enabled === true, input.track_lots !== false, cleanUnit(input.base_weight_unit), scope.actorId || null],
      );
    }
    return this.settings(scope);
  }

  async dashboard(scope: Scope) {
    await this.ensureSchema();
    const [materials, lots, production] = await Promise.all([
      queryOne<any>(
        `SELECT COUNT(*) AS total FROM manufacturing_materials
         WHERE user_id = ? AND brand_id = ? AND active = TRUE`,
        [scope.userId, scope.brandId],
      ),
      queryOne<any>(
        `SELECT COUNT(*) AS open_lots,
                COALESCE(SUM(CASE WHEN LOWER(unit) IN ('kg') THEN available_quantity
                                  WHEN LOWER(unit) IN ('g') THEN available_quantity / 1000
                                  WHEN LOWER(unit) IN ('t','ton','tonelada','toneladas') THEN available_quantity * 1000
                                  ELSE 0 END), 0) AS available_weight_kg
         FROM manufacturing_lots WHERE user_id = ? AND brand_id = ? AND available_quantity > 0`,
        [scope.userId, scope.brandId],
      ),
      queryOne<any>(
        `SELECT COUNT(*) AS batches,
                COALESCE(SUM(input_weight_kg),0) AS input_weight_kg,
                COALESCE(SUM(output_weight_kg),0) AS output_weight_kg,
                COALESCE(SUM(waste_weight_kg),0) AS waste_weight_kg,
                CASE WHEN COALESCE(SUM(input_weight_kg),0) > 0
                  THEN SUM(output_weight_kg) / SUM(input_weight_kg) * 100 ELSE NULL END AS yield_percent
         FROM manufacturing_batches
         WHERE user_id = ? AND brand_id = ? AND produced_at >= CURRENT_TIMESTAMP - INTERVAL '30 day'`,
        [scope.userId, scope.brandId],
      ),
    ]);
    const recent = await query<any[]>(
      `SELECT b.*, COUNT(DISTINCT i.id) AS inputs_count, COUNT(DISTINCT o.id) AS outputs_count
       FROM manufacturing_batches b
       LEFT JOIN manufacturing_batch_inputs i ON i.batch_id = b.id
       LEFT JOIN manufacturing_batch_outputs o ON o.batch_id = b.id
       WHERE b.user_id = ? AND b.brand_id = ?
       GROUP BY b.id ORDER BY b.produced_at DESC LIMIT 20`,
      [scope.userId, scope.brandId],
    );
    return {
      materials: Number(materials?.total || 0),
      open_lots: Number(lots?.open_lots || 0),
      available_weight_kg: Number(lots?.available_weight_kg || 0),
      last_30_days: {
        batches: Number(production?.batches || 0),
        input_weight_kg: Number(production?.input_weight_kg || 0),
        output_weight_kg: Number(production?.output_weight_kg || 0),
        waste_weight_kg: Number(production?.waste_weight_kg || 0),
        yield_percent: production?.yield_percent === null ? null : Number(production.yield_percent),
      },
      recent,
    };
  }

  async listMaterials(scope: Scope) {
    await this.ensureSchema();
    return query<any[]>(
      `SELECT m.*,
              COALESCE(SUM(l.available_quantity),0) AS available_quantity,
              COUNT(CASE WHEN l.available_quantity > 0 THEN 1 END) AS open_lots
       FROM manufacturing_materials m
       LEFT JOIN manufacturing_lots l ON l.material_id = m.id
       WHERE m.user_id = ? AND m.brand_id = ? AND m.active = TRUE
       GROUP BY m.id ORDER BY m.name`,
      [scope.userId, scope.brandId],
    );
  }

  async listLots(scope: Scope, onlyAvailable = true) {
    await this.ensureSchema();
    return query<any[]>(
      `SELECT l.*, m.name AS material_name
       FROM manufacturing_lots l
       JOIN manufacturing_materials m ON m.id = l.material_id
       WHERE l.user_id = ? AND l.brand_id = ? ${onlyAvailable ? "AND l.available_quantity > 0" : ""}
       ORDER BY l.received_at ASC, l.created_at ASC`,
      [scope.userId, scope.brandId],
    );
  }

  async listRecipes(scope: Scope) {
    await this.ensureSchema();
    const recipes = await query<any[]>(
      `SELECT r.*, p.name AS product_name, p.unit AS product_unit
       FROM manufacturing_recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.user_id = ? AND r.brand_id = ? AND r.active = TRUE
       ORDER BY p.name`,
      [scope.userId, scope.brandId],
    );
    if (!recipes.length) return [];
    const ids = recipes.map((item) => item.id);
    const items = await query<any[]>(
      `SELECT i.*, m.name AS material_name
       FROM manufacturing_recipe_items i
       JOIN manufacturing_materials m ON m.id = i.material_id
       WHERE i.recipe_id IN (${ids.map(() => "?").join(",")})
       ORDER BY m.name`,
      ids,
    );
    const byRecipe = new Map<string, any[]>();
    for (const item of items) {
      const list = byRecipe.get(String(item.recipe_id)) || [];
      list.push(item);
      byRecipe.set(String(item.recipe_id), list);
    }
    return recipes.map((recipe) => ({ ...recipe, ingredients: byRecipe.get(String(recipe.id)) || [] }));
  }

  async saveRecipe(scope: Scope, input: any) {
    await this.ensureSchema();
    const productId = String(input.product_id || "").trim();
    const product = await queryOne<any>(
      `SELECT id, name, unit FROM products
       WHERE id = ? AND user_id = ? AND (brand_id = ? OR brand_id IS NULL) LIMIT 1`,
      [productId, scope.userId, scope.brandId],
    );
    if (!product) throw new Error("Produto final não encontrado");
    const outputQuantity = positive(input.output_quantity || 1, "Rendimento da ficha");
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    if (!ingredients.length) throw new Error("Adicione ao menos uma matéria-prima à ficha");
    const normalized = [];
    for (const raw of ingredients) {
      const materialId = String(raw.material_id || "").trim();
      const material = await queryOne<any>(
        `SELECT id, name, unit FROM manufacturing_materials
         WHERE id = ? AND user_id = ? AND brand_id = ? AND active = TRUE LIMIT 1`,
        [materialId, scope.userId, scope.brandId],
      );
      if (!material) throw new Error("Matéria-prima da ficha não encontrada");
      normalized.push({
        material,
        quantity: positive(raw.quantity, `Quantidade de ${material.name}`),
        unit: cleanUnit(raw.unit || material.unit),
      });
    }
    const conn = await getPool().getConnection();
    try {
      await conn.query("BEGIN");
      const [existingRows] = await conn.query(
        `SELECT id FROM manufacturing_recipes
         WHERE user_id = ? AND brand_id = ? AND product_id = ? FOR UPDATE`,
        [scope.userId, scope.brandId, productId],
      );
      const recipeId = String((existingRows as any[])[0]?.id || randomUUID());
      if ((existingRows as any[])[0]) {
        await conn.query(
          `UPDATE manufacturing_recipes
           SET output_quantity = ?, unit_weight_kg = ?, expected_loss_percent = ?,
               notes = ?, active = TRUE, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            outputQuantity, Math.max(0, Number(input.unit_weight_kg || 0)) || null,
            Math.max(0, Math.min(100, Number(input.expected_loss_percent || 0))),
            String(input.notes || "").trim() || null, recipeId,
          ],
        );
        await conn.query(`DELETE FROM manufacturing_recipe_items WHERE recipe_id = ?`, [recipeId]);
      } else {
        await conn.query(
          `INSERT INTO manufacturing_recipes
           (id, user_id, brand_id, product_id, output_quantity, unit_weight_kg,
            expected_loss_percent, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipeId, scope.userId, scope.brandId, productId, outputQuantity,
            Math.max(0, Number(input.unit_weight_kg || 0)) || null,
            Math.max(0, Math.min(100, Number(input.expected_loss_percent || 0))),
            String(input.notes || "").trim() || null, scope.actorId || null,
          ],
        );
      }
      for (const item of normalized) {
        await conn.query(
          `INSERT INTO manufacturing_recipe_items
           (id, recipe_id, material_id, quantity, unit) VALUES (?, ?, ?, ?, ?)`,
          [randomUUID(), recipeId, item.material.id, item.quantity, item.unit],
        );
      }
      await conn.query("COMMIT");
      return { id: recipeId, product_id: productId, product_name: product.name };
    } catch (error) {
      try { await conn.query("ROLLBACK"); } catch { /* noop */ }
      throw error;
    } finally {
      conn.release();
    }
  }

  async planBatch(scope: Scope, input: any) {
    await this.ensureSchema();
    const outputs = Array.isArray(input.outputs) ? input.outputs : [];
    if (!outputs.length) throw new Error("Informe os produtos que serão produzidos");
    const recipes = await this.listRecipes(scope);
    const recipeByProduct = new Map(recipes.map((recipe) => [String(recipe.product_id), recipe]));
    const needs = new Map<string, { material_id: string; material_name: string; unit: string; quantity: number }>();
    const enrichedOutputs = [];
    for (const output of outputs) {
      const productId = String(output.product_id || "").trim();
      const quantity = positive(output.quantity, "Quantidade planejada");
      const recipe = recipeByProduct.get(productId);
      if (!recipe) throw new Error(`Cadastre a ficha técnica de ${productId} antes de calcular o consumo`);
      const multiplier = quantity / Number(recipe.output_quantity || 1);
      for (const ingredient of recipe.ingredients || []) {
        const key = `${ingredient.material_id}:${cleanUnit(ingredient.unit)}`;
        const current = needs.get(key) || {
          material_id: String(ingredient.material_id),
          material_name: String(ingredient.material_name),
          unit: cleanUnit(ingredient.unit),
          quantity: 0,
        };
        current.quantity = Number((current.quantity + Number(ingredient.quantity) * multiplier).toFixed(3));
        needs.set(key, current);
      }
      enrichedOutputs.push({
        ...output,
        quantity,
        unit_weight_kg: Number(output.unit_weight_kg || recipe.unit_weight_kg || 0) || undefined,
        recipe_id: recipe.id,
      });
    }
    const lots = await this.listLots(scope, true);
    const plannedInputs: Array<{ lot_id: string; quantity: number; material_id: string; material_name: string; lot_code: string; unit: string }> = [];
    for (const need of needs.values()) {
      let remaining = need.quantity;
      const candidates = lots.filter((lot) =>
        String(lot.material_id) === need.material_id && cleanUnit(lot.unit) === need.unit,
      );
      for (const lot of candidates) {
        if (remaining <= 0.0001) break;
        const take = Number(Math.min(remaining, Number(lot.available_quantity || 0)).toFixed(3));
        if (take <= 0) continue;
        plannedInputs.push({
          lot_id: String(lot.id),
          quantity: take,
          material_id: need.material_id,
          material_name: need.material_name,
          lot_code: String(lot.lot_code),
          unit: need.unit,
        });
        remaining = Number((remaining - take).toFixed(3));
      }
      if (remaining > 0.0001) {
        throw new Error(`Matéria-prima insuficiente: faltam ${remaining} ${need.unit} de ${need.material_name}`);
      }
    }
    return { inputs: plannedInputs, outputs: enrichedOutputs, strategy: "FIFO" };
  }

  async receive(scope: Scope, input: any) {
    await this.ensureSchema();
    const quantity = positive(input.quantity, "Quantidade recebida");
    let materialId = String(input.material_id || "").trim();
    let material: any = null;
    if (materialId) {
      material = await queryOne<any>(
        `SELECT * FROM manufacturing_materials WHERE id = ? AND user_id = ? AND brand_id = ? AND active = TRUE`,
        [materialId, scope.userId, scope.brandId],
      );
      if (!material) throw new Error("Matéria-prima não encontrada");
    } else {
      const name = String(input.material_name || "").trim();
      if (!name) throw new Error("Informe a matéria-prima");
      materialId = randomUUID();
      const unit = cleanUnit(input.unit);
      await query(
        `INSERT INTO manufacturing_materials
         (id, user_id, brand_id, name, sku, unit, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [materialId, scope.userId, scope.brandId, name, String(input.sku || "").trim() || null, unit, String(input.category || "").trim() || null],
      );
      material = { id: materialId, name, unit };
    }
    const unit = cleanUnit(input.unit || material.unit);
    const lotId = randomUUID();
    const lotCode = String(input.lot_code || "").trim() || `MP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${lotId.slice(0, 5).toUpperCase()}`;
    await query(
      `INSERT INTO manufacturing_lots
       (id, material_id, user_id, brand_id, lot_code, supplier, received_quantity,
        available_quantity, unit, unit_cost, received_at, expires_at, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lotId, materialId, scope.userId, scope.brandId, lotCode,
        String(input.supplier || "").trim() || null, quantity, quantity, unit,
        Math.max(0, Number(input.unit_cost || 0)), input.received_at || new Date(),
        input.expires_at || null, String(input.notes || "").trim() || null, scope.actorId || null,
      ],
    );
    return { id: lotId, material_id: materialId, material_name: material.name, lot_code: lotCode, quantity, unit };
  }

  async createBatch(scope: Scope, input: any) {
    await this.ensureSchema();
    const inputs = Array.isArray(input.inputs) ? input.inputs : [];
    const outputs = Array.isArray(input.outputs) ? input.outputs : [];
    if (!inputs.length) throw new Error("Informe ao menos um lote consumido");
    if (!outputs.length) throw new Error("Informe ao menos um produto gerado");
    const conn = await getPool().getConnection();
    try {
      await conn.query("BEGIN");
      const batchId = randomUUID();
      const batchCode = String(input.batch_code || "").trim() || `OP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${batchId.slice(0, 5).toUpperCase()}`;
      let totalInputKg = 0;
      let inputComparable = true;
      const resolvedInputs: any[] = [];
      for (const raw of inputs) {
        const quantity = positive(raw.quantity, "Consumo do lote");
        const [rows] = await conn.query(
          `SELECT l.*, m.name AS material_name FROM manufacturing_lots l
           JOIN manufacturing_materials m ON m.id = l.material_id
           WHERE l.id = ? AND l.user_id = ? AND l.brand_id = ? FOR UPDATE`,
          [String(raw.lot_id || ""), scope.userId, scope.brandId],
        );
        const lot = (rows as any[])[0];
        if (!lot) throw new Error("Lote de matéria-prima não encontrado");
        if (Number(lot.available_quantity) < quantity) {
          throw new Error(`Saldo insuficiente no lote ${lot.lot_code}: disponível ${lot.available_quantity} ${lot.unit}`);
        }
        const weightKg = baseWeight(quantity, lot.unit);
        if (weightKg === null) inputComparable = false;
        else totalInputKg += weightKg;
        resolvedInputs.push({ lot, quantity, weightKg });
      }

      let totalOutputKg = 0;
      let outputComparable = true;
      const resolvedOutputs: any[] = [];
      for (const raw of outputs) {
        const quantity = positive(raw.quantity, "Quantidade produzida");
        const productId = String(raw.product_id || "").trim();
        const [rows] = await conn.query(
          `SELECT id, name, unit, stock_quantity, stock_threshold_low
           FROM products WHERE id = ? AND user_id = ? AND (brand_id = ? OR brand_id IS NULL) LIMIT 1`,
          [productId, scope.userId, scope.brandId],
        );
        const product = (rows as any[])[0];
        if (!product) throw new Error("Produto final não encontrado");
        const unitWeightKg = Number(raw.unit_weight_kg || 0);
        const weightKg = unitWeightKg > 0 ? Number((quantity * unitWeightKg).toFixed(3)) : null;
        if (weightKg === null) outputComparable = false;
        else totalOutputKg += weightKg;
        resolvedOutputs.push({ product, quantity, unitWeightKg: unitWeightKg || null, weightKg });
      }

      const explicitWaste = Math.max(0, Number(input.waste_weight_kg || 0));
      const canCalculate = inputComparable && outputComparable;
      const wasteKg = explicitWaste > 0 ? explicitWaste : (canCalculate ? Math.max(0, totalInputKg - totalOutputKg) : null);
      const yieldPercent = canCalculate && totalInputKg > 0 ? Number((totalOutputKg / totalInputKg * 100).toFixed(3)) : null;
      if (canCalculate && totalOutputKg + Number(wasteKg || 0) > totalInputKg + 0.01) {
        throw new Error("A soma produzida e perdida não pode superar a matéria-prima consumida");
      }

      await conn.query(
        `INSERT INTO manufacturing_batches
         (id, user_id, brand_id, batch_code, input_weight_kg, output_weight_kg,
          waste_weight_kg, yield_percent, notes, produced_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId, scope.userId, scope.brandId, batchCode,
          inputComparable ? totalInputKg : null, outputComparable ? totalOutputKg : null,
          wasteKg, yieldPercent, String(input.notes || "").trim() || null,
          input.produced_at || new Date(), scope.actorId || null,
        ],
      );

      for (const item of resolvedInputs) {
        await conn.query(
          `UPDATE manufacturing_lots SET available_quantity = available_quantity - ? WHERE id = ?`,
          [item.quantity, item.lot.id],
        );
        await conn.query(
          `INSERT INTO manufacturing_batch_inputs
           (id, batch_id, lot_id, material_id, quantity, unit, weight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), batchId, item.lot.id, item.lot.material_id, item.quantity, item.lot.unit, item.weightKg],
        );
      }

      for (const item of resolvedOutputs) {
        const outputQty = Math.max(1, Math.round(item.quantity));
        const [invRows] = await conn.query(
          `SELECT * FROM inventory WHERE product_id = ? AND user_id = ? AND brand_id = ? FOR UPDATE`,
          [item.product.id, scope.userId, scope.brandId],
        );
        const inv = (invRows as any[])[0];
        const before = Number(inv?.stock_current ?? item.product.stock_quantity ?? 0);
        const after = before + outputQty;
        if (inv) {
          await conn.query(
            `UPDATE inventory
             SET stock_current = stock_current + ?, stock_available = stock_available + ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [outputQty, outputQty, inv.id],
          );
        } else {
          await conn.query(
            `INSERT INTO inventory
             (id, product_id, user_id, brand_id, stock_current, stock_reserved, stock_available, stock_min, cost_price)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`,
            [randomUUID(), item.product.id, scope.userId, scope.brandId, after, after, Number(item.product.stock_threshold_low || 5)],
          );
        }
        await conn.query(
          `UPDATE products SET stock_quantity = ?, stock_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [after, after <= 0 ? "out_of_stock" : after <= Number(item.product.stock_threshold_low || 5) ? "low_stock" : "in_stock", item.product.id],
        );
        await conn.query(
          `UPDATE commerce_products SET estoque = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [after, item.product.id],
        );
        await conn.query(
          `INSERT INTO inventory_movements
           (id, product_id, user_id, brand_id, type, quantity, stock_before, stock_after, source, reference_id, reason, created_by)
           VALUES (?, ?, ?, ?, 'entrada', ?, ?, ?, 'producao', ?, ?, ?)`,
          [randomUUID(), item.product.id, scope.userId, scope.brandId, outputQty, before, after, batchId, `Produção ${batchCode}`, scope.actorId || null],
        );
        await conn.query(
          `INSERT INTO manufacturing_batch_outputs
           (id, batch_id, product_id, quantity, unit, unit_weight_kg, weight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), batchId, item.product.id, outputQty, item.product.unit || "un", item.unitWeightKg, item.weightKg],
        );
      }
      await conn.query("COMMIT");
      return { id: batchId, batch_code: batchCode, input_weight_kg: inputComparable ? totalInputKg : null, output_weight_kg: outputComparable ? totalOutputKg : null, waste_weight_kg: wasteKg, yield_percent: yieldPercent };
    } catch (error) {
      try { await conn.query("ROLLBACK"); } catch { /* noop */ }
      throw error;
    } finally {
      conn.release();
    }
  }
}

export const manufacturingService = new ManufacturingService();

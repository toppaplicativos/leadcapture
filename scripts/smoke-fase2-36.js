/* Smoke test Fase 2 (attribute definitions + filters) + Fase 3.6 (whatsapp) */
require("dotenv").config();
const { Pool } = require("pg");
const { attributeDefinitionService, offerCatalogService } = require("../dist/services/offerCatalog");
const { invalidateCatalogCacheBySlug } = require("../dist/services/storefrontCache");
const { ProductsService } = require("../dist/services/products");
const { BrandUnitsService } = require("../dist/services/brandUnits");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const userId = "9ebbc422-758f-4556-9b6b-ddf4985615e2";
  const brandId = "dc8f901e-857b-4cfb-b353-86cd5146d1fd";
  const slug = "alhopronto";

  /* 1. Create 2 attribute definitions */
  console.log("=== [1] Create attribute definitions ===");
  const defCor = await attributeDefinitionService.create({ label: "Tipo de Embalagem", type: "select", options: ["Bandeja", "Pote", "Saco"] }, userId, brandId);
  const defOrigem = await attributeDefinitionService.create({ label: "Origem", type: "select", options: ["Brasileiro", "Importado"] }, userId, brandId);
  console.log("created:", defCor.key, "+", defOrigem.key);

  /* 2. Tag a product with attribute values */
  console.log("\n=== [2] Tag 2 products ===");
  const ps = new ProductsService();
  const products = await ps.getActiveProducts(userId, brandId);
  await ps.updateProduct(products[0].id, { attributes: { [defCor.key]: "Bandeja", [defOrigem.key]: "Brasileiro" } }, userId, brandId);
  await ps.updateProduct(products[1].id, { attributes: { [defCor.key]: "Pote", [defOrigem.key]: "Brasileiro" } }, userId, brandId);
  console.log("tagged:", products[0].name, "+", products[1].name);

  /* 3. Set WhatsApp phone */
  console.log("\n=== [3] Set WhatsApp on brand ===");
  const bus = new BrandUnitsService();
  await bus.update(userId, brandId, { whatsapp_phone: "11999990000" });
  console.log("brand whatsapp set");

  /* 4. Hit catalog API and verify exposures */
  invalidateCatalogCacheBySlug(slug);
  const cat = await fetch(`http://localhost:3001/api/storefront/public/stores/${slug}/catalog`);
  const j = await cat.json();
  console.log("\n=== [4] Public catalog response ===");
  console.log("attribute_definitions:", (j.attribute_definitions || []).map(d => `${d.label}(${d.type})`).join(", "));
  console.log("store.brand.whatsapp_phone:", j.store?.brand?.whatsapp_phone);
  const sample = (j.all_products || []).slice(0, 2).map(p => ({ name: p.name, attributes: p.attributes }));
  console.log("sample products with attributes:");
  sample.forEach(s => console.log("  -", s.name, "attrs:", JSON.stringify(s.attributes)));

  /* Cleanup */
  console.log("\n=== Cleanup ===");
  await attributeDefinitionService.delete(defCor.id, userId);
  await attributeDefinitionService.delete(defOrigem.id, userId);
  await ps.updateProduct(products[0].id, { attributes: {} }, userId, brandId);
  await ps.updateProduct(products[1].id, { attributes: {} }, userId, brandId);
  await bus.update(userId, brandId, { whatsapp_phone: "" });
  console.log("cleanup ok");

  await pool.end();
  process.exit(0);
})().catch(e => { console.error("FATAL:", e.message); console.error(e.stack); process.exit(1); });

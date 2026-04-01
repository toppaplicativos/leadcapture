import { Router } from "express";
import { randomUUID } from "crypto";
import { query } from "../config/database";

const router = Router();

type OnboardingPayload = {
  customer_name?: string;
  customer_document?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_city?: string;
  customer_state?: string;
  customer_address?: string;
  brand_name?: string;
  brand_slug?: string;
  company_name?: string;
  business_segment?: string;
  instagram_url?: string;
  website_url?: string;
  product_name?: string;
  product_category?: string;
  product_description?: string;
  product_price?: string;
  product_cost?: string;
  target_audience?: string;
  sales_channels?: string[];
  payment_methods?: string[];
  shipping_mode?: string;
  delivery_radius_km?: string;
  delivery_fee?: string;
  launch_deadline?: string;
  notes?: string;
};

function toSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function asText(value: unknown, max = 255): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

router.post("/brand-onboarding", async (req, res) => {
  try {
    const body = (req.body || {}) as OnboardingPayload;

    const customerName = asText(body.customer_name, 160);
    const customerPhone = asText(body.customer_phone, 40);
    const customerEmail = asText(body.customer_email, 160);
    const brandName = asText(body.brand_name, 160);
    const productName = asText(body.product_name, 160);

    if (!customerName) {
      return res.status(400).json({ success: false, error: "Nome do cliente é obrigatório." });
    }
    if (!customerPhone) {
      return res.status(400).json({ success: false, error: "Telefone/WhatsApp é obrigatório." });
    }
    if (!customerEmail) {
      return res.status(400).json({ success: false, error: "Email é obrigatório." });
    }
    if (!brandName) {
      return res.status(400).json({ success: false, error: "Nome da marca é obrigatório." });
    }
    if (!productName) {
      return res.status(400).json({ success: false, error: "Nome do produto é obrigatório." });
    }

    const normalizedPayload = {
      customer_name: customerName,
      customer_document: asText(body.customer_document, 40),
      customer_phone: customerPhone,
      customer_email: customerEmail,
      customer_city: asText(body.customer_city, 120),
      customer_state: asText(body.customer_state, 60),
      customer_address: asText(body.customer_address, 255),
      brand_name: brandName,
      brand_slug: asText(body.brand_slug, 140) || toSlug(brandName),
      company_name: asText(body.company_name, 160),
      business_segment: asText(body.business_segment, 120),
      instagram_url: asText(body.instagram_url, 255),
      website_url: asText(body.website_url, 255),
      product_name: productName,
      product_category: asText(body.product_category, 120),
      product_description: asText(body.product_description, 2000),
      product_price: asText(body.product_price, 80),
      product_cost: asText(body.product_cost, 80),
      target_audience: asText(body.target_audience, 1000),
      sales_channels: Array.isArray(body.sales_channels)
        ? body.sales_channels.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      payment_methods: Array.isArray(body.payment_methods)
        ? body.payment_methods.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      shipping_mode: asText(body.shipping_mode, 120),
      delivery_radius_km: asText(body.delivery_radius_km, 40),
      delivery_fee: asText(body.delivery_fee, 80),
      launch_deadline: asText(body.launch_deadline, 40),
      notes: asText(body.notes, 3000),
    };

    await query(`
      CREATE TABLE IF NOT EXISTS brand_onboarding_submissions (
        id VARCHAR(36) PRIMARY KEY,
        customer_name VARCHAR(160) NOT NULL,
        customer_phone VARCHAR(40) NOT NULL,
        customer_email VARCHAR(160) NOT NULL,
        brand_name VARCHAR(160) NOT NULL,
        brand_slug VARCHAR(140) NULL,
        product_name VARCHAR(160) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(
      `INSERT INTO brand_onboarding_submissions
       (id, customer_name, customer_phone, customer_email, brand_name, brand_slug, product_name, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, 'new')`,
      [
        randomUUID(),
        normalizedPayload.customer_name,
        normalizedPayload.customer_phone,
        normalizedPayload.customer_email,
        normalizedPayload.brand_name,
        normalizedPayload.brand_slug,
        normalizedPayload.product_name,
        JSON.stringify(normalizedPayload),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Cadastro recebido com sucesso. Nosso time vai preparar a sua marca na plataforma.",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: String(error?.message || "Falha ao salvar onboarding."),
    });
  }
});

export default router;

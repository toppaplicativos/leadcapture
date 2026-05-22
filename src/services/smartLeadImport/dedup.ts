/**
 * Marca leads extraídos como duplicados se já existirem em `customers`
 * (mesmo brand, mesmo phone/email). `customers` é a tabela de leads/prospects
 * — `clients` é a tabela de clientes convertidos, escopo diferente.
 *
 * Tenta primeiro com `user_id + brand_id`. Se a coluna `brand_id` não existir
 * ou der erro, faz fallback para escopo só por `user_id`. Há schemas que usam
 * `owner_id` em vez de `user_id` — o segundo fallback tenta isso.
 */

import { query } from "../../config/database";
import { normalizePhone, phoneEquals } from "./phoneNormalizer";
import type { ParsedLead } from "./types";

interface ExistingContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

async function loadExistingContacts(userId: string, brandId: string): Promise<ExistingContact[]> {
  /* 1) Escopo completo: user_id + brand_id */
  try {
    const rows = await query<ExistingContact[]>(
      `SELECT id, name, phone, email
       FROM customers
       WHERE user_id = ? AND brand_id = ?`,
      [userId, brandId]
    );
    if (Array.isArray(rows)) return rows;
  } catch {
    /* coluna brand_id pode não existir em schemas antigos */
  }

  /* 2) Só user_id */
  try {
    const rows = await query<ExistingContact[]>(
      `SELECT id, name, phone, email
       FROM customers
       WHERE user_id = ?`,
      [userId]
    );
    if (Array.isArray(rows)) return rows;
  } catch {
    /* alguns schemas usam owner_id */
  }

  /* 3) owner_id (schema alternativo) */
  try {
    const rows = await query<ExistingContact[]>(
      `SELECT id, name, phone, email
       FROM customers
       WHERE owner_id = ?`,
      [userId]
    );
    if (Array.isArray(rows)) return rows;
  } catch {
    /* sem sorte */
  }

  return [];
}

/**
 * Marca duplicados — preenche `duplicateOf` quando o lead extraído já existe.
 * Também detecta duplicados INTERNOS (dois leads do mesmo lote com mesmo fone).
 */
export async function markDuplicates(leads: ParsedLead[], userId: string, brandId: string): Promise<ParsedLead[]> {
  const existing = await loadExistingContacts(userId, brandId);

  /* Index por email lower para lookup O(1) */
  const existingByEmail = new Map<string, ExistingContact>();
  for (const c of existing) {
    if (c.email) {
      existingByEmail.set(c.email.trim().toLowerCase(), c);
    }
  }

  /* Track de fones já vistos NESTE lote (para dup interno) */
  const seenPhonesInBatch = new Map<string, number>();
  const seenEmailsInBatch = new Map<string, number>();

  return leads.map((lead) => {
    const out = { ...lead };
    out.warnings = [...(lead.warnings || [])];

    /* 1) Dup contra banco — phone */
    if (out.phone) {
      const match = existing.find((c) => phoneEquals(c.phone, out.phone));
      if (match) {
        out.duplicateOf = { id: match.id, name: match.name, phone: match.phone };
        out.warnings.push(`duplicado de "${match.name}"`);
      }
    }

    /* 2) Dup contra banco — email */
    if (!out.duplicateOf && out.email) {
      const match = existingByEmail.get(out.email.trim().toLowerCase());
      if (match) {
        out.duplicateOf = { id: match.id, name: match.name, phone: match.phone };
        out.warnings.push(`duplicado de "${match.name}"`);
      }
    }

    /* 3) Dup INTERNO neste lote — phone */
    if (!out.duplicateOf && out.phone) {
      const normalized = normalizePhone(out.phone).e164 || out.phone;
      const prevIdx = seenPhonesInBatch.get(normalized);
      if (prevIdx !== undefined) {
        out.warnings.push(`repetido no proprio lote (linha ${prevIdx + 1})`);
        /* Marca como soft duplicate — frontend pode filtrar */
        out.duplicateOf = { id: `batch:${prevIdx}`, name: leads[prevIdx]?.name || "lote" };
      } else {
        seenPhonesInBatch.set(normalized, lead.index);
      }
    }

    /* 4) Dup INTERNO neste lote — email */
    if (!out.duplicateOf && out.email) {
      const e = out.email.trim().toLowerCase();
      const prevIdx = seenEmailsInBatch.get(e);
      if (prevIdx !== undefined) {
        out.warnings.push(`email repetido no lote (linha ${prevIdx + 1})`);
        out.duplicateOf = { id: `batch:${prevIdx}`, name: leads[prevIdx]?.name || "lote" };
      } else {
        seenEmailsInBatch.set(e, lead.index);
      }
    }

    return out;
  });
}

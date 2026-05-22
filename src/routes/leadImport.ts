import { Router, Response, json } from "express";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { CustomersService } from "../services/customers";
import { generateImportPreview, SmartImportPayload } from "../services/smartLeadImport";
import { logger } from "../utils/logger";
import { safeErrorPayload } from "../utils/safeError";

const router = Router();
const customersService = new CustomersService();

/* Body grande para suportar imagens em base64 — limita em 12MB (1.33x dos 10MB do payload bruto). */
router.use(json({ limit: "12mb" }));
router.use(attachBrandContext);

/**
 * POST /api/lead-import/parse
 *
 * Body:
 *   { mode: "text" | "file" | "image", payload: string, mimeType?: string, fileName?: string }
 *
 * Resposta:
 *   { success: true, preview: ImportPreview }
 */
router.post("/parse", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id is required" });

    const body = (req.body || {}) as SmartImportPayload;
    if (!body.mode || !body.payload) {
      return res.status(400).json({ error: "mode e payload sao obrigatorios" });
    }
    if (!["text", "file", "image"].includes(body.mode)) {
      return res.status(400).json({ error: "mode invalido (use: text, file, image)" });
    }

    const preview = await generateImportPreview(body, { userId, brandId: req.brandId });

    res.json({ success: true, preview });
  } catch (error: any) {
    /* Bug-6: never echo provider errors to the client — they contain our prompts.
     * Log the FULL error server-side (logger sanitizer masks PII; prompt content
     * is fine in logs since they're SSH-restricted) but return only a classified,
     * non-leaky payload. */
    logger.error(
      { err: error, userId: req.user?.userId, brandId: req.brandId, mode: req.body?.mode },
      "[lead-import] parse failed"
    );
    const payload = safeErrorPayload(error, {
      hint: "Verifique se há chave de IA configurada em Provedores IA e se o arquivo tem até 10MB.",
    });
    /* Map error code to appropriate HTTP status */
    const status =
      payload.code === "AI_AUTH" ? 401 :
      payload.code === "AI_QUOTA" ? 429 :
      payload.code === "FILE_TOO_LARGE" ? 413 :
      payload.code === "FILE_UNSUPPORTED" ? 415 :
      payload.code === "AI_MODEL_UNAVAILABLE" ? 503 :
      payload.code === "AI_TIMEOUT" ? 504 :
      500;
    res.status(status).json(payload);
  }
});

/**
 * POST /api/lead-import/confirm
 *
 * Body:
 *   { leads: ParsedLead[], skipDuplicates?: boolean }
 *
 * Cria os leads em `customers` (tabela de leads/prospects — NÃO clientes).
 * Reusa CustomersService.create para cada lead já editado/confirmado pelo user.
 */
router.post("/confirm", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.brandId) return res.status(400).json({ error: "brand_id is required" });

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leads || !leads.length) return res.status(400).json({ error: "leads vazio" });
    const skipDuplicates = req.body?.skipDuplicates !== false; // default true

    let imported = 0;
    const errors: Array<{ name: string; error: string }> = [];

    for (const lead of leads) {
      if (skipDuplicates && lead.duplicateOf) continue;
      if (!lead.name && !lead.phone && !lead.email) continue;

      try {
        /* CustomerCreateDTO usa `tags: string` (será normalizada para JSON pelo service).
           Interesse/temperatura/empresa vão em `extra_source_details` (merge em source_details). */
        const tagsJson = Array.isArray(lead.tags) && lead.tags.length > 0
          ? JSON.stringify(lead.tags)
          : JSON.stringify(["smart-import"]);

        const notes = [
          lead.notes,
          lead.interest ? `Interesse: ${lead.interest}` : null,
          lead.temperature ? `Temperatura: ${lead.temperature}` : null,
          lead.company ? `Empresa: ${lead.company}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        await customersService.create(
          {
            name: String(lead.name || "Sem nome").trim(),
            phone: lead.phone || "",
            email: lead.email || undefined,
            city: lead.city || undefined,
            state: lead.state || undefined,
            tags: tagsJson,
            notes: notes || undefined,
            source: "smart_import" as any,
            status: "new",
            extra_source_details: {
              smart_import: {
                interest: lead.interest || null,
                temperature: lead.temperature || null,
                company: lead.company || null,
                imported_at: new Date().toISOString(),
              },
            },
          },
          userId,
          req.brandId
        );
        imported++;
      } catch (err: any) {
        errors.push({ name: lead.name || "?", error: err.message });
      }
    }

    res.json({
      success: true,
      imported,
      total: leads.length,
      skipped: leads.length - imported - errors.length,
      errors,
    });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.userId, brandId: req.brandId }, "[lead-import] confirm failed");
    res.status(500).json(safeErrorPayload(error));
  }
});

export default router;

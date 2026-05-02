import { Router, Request, Response } from "express";
import { CustomersService } from "../services/customers";
import { AutomationRuntimeService } from "../services/automationRuntime";
import { authMiddleware, AuthRequest, requireRole } from "../middleware/auth";
import { attachBrandContext, BrandRequest } from "../middleware/brandContext";
import { logger } from "../utils/logger";

const router = Router();
const customersService = new CustomersService();

router.use(authMiddleware, attachBrandContext);

function getAutomationRuntime(req: AuthRequest): AutomationRuntimeService | null {
  return (req.app.get("automationRuntime") as AutomationRuntimeService | undefined) || null;
}

// GET /api/customers/filter-options - Get distinct filter values + counts
router.get("/filter-options", async (req: BrandRequest, res: Response) => {
  try {
    const userId = String(req.user?.userId || "").trim();
    const brandId = String(req.brandId || "").trim() || undefined;
    const options = await customersService.getFilterOptions({ userId, brandId });
    res.json({ success: true, ...options });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/customers - List all customers with filters
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      status,
      source,
      category,
      city,
      state,
      search,
      minRating,
      maxRating,
      tags,
      tagsExclude,
      hasWhatsapp,
      page,
      limit,
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const offset = (pageNum - 1) * limitNum;

    const result = await customersService.getAll({
      status: status as string,
      source: source as string,
      category: category as string,
      city: city as string,
      state: state as string,
      search: search as string,
      minRating: minRating !== undefined ? parseFloat(minRating as string) : undefined,
      maxRating: maxRating !== undefined ? parseFloat(maxRating as string) : undefined,
      tags: tags as string,
      tagsExclude: tagsExclude as string,
      hasWhatsapp: hasWhatsapp as "true" | "false" | undefined,
      limit: limitNum,
      offset,
      ownerUserId: userId,
      brandId: req.brandId,
    });

    res.json({
      success: true,
      customers: result.customers,
      total: result.total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(result.total / limitNum),
    });
  } catch (error: any) {
    logger.error(`Get customers error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/customers/stats - Get customer stats
router.get("/stats", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const stats = await customersService.getStats(userId, req.brandId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/customers/:id - Get customer by ID
router.get("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const customer = await customersService.getById(req.params.id as string, userId, req.brandId);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json({ success: true, customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/customers - Create customer manually
router.post("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!req.body.name) return res.status(400).json({ error: "Name is required" });
    const customer = await customersService.create(req.body, userId, req.brandId);
    const runtime = getAutomationRuntime(req);
    if (runtime && customer?.id) {
      await runtime.triggerLeadCreated(userId, customer.id, {
        segmento: String((req.body as any)?.category || "").trim() || undefined,
        cidade: String((req.body as any)?.city || "").trim() || undefined,
        produto: String((req.body as any)?.product || "").trim() || undefined,
        oferta: String((req.body as any)?.offer || "").trim() || undefined,
      });
    }
    res.status(201).json({ success: true, customer });
  } catch (error: any) {
    logger.error(`Create customer error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/customers/:id - Update customer
router.put("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const customer = await customersService.updateCustomer(
      req.params.id as string,
      req.body,
      userId,
      req.brandId
    );
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json({ success: true, customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/customers/:id/status - Update customer status
router.put("/:id/status", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });
    const customerBefore = await customersService.getById(req.params.id as string, userId, req.brandId);
    if (!customerBefore) return res.status(404).json({ error: "Customer not found" });

    const success = await customersService.updateStatus(
      req.params.id as string,
      status,
      userId,
      req.brandId
    );
    if (!success) return res.status(404).json({ error: "Customer not found" });
    const runtime = getAutomationRuntime(req);
    if (runtime) {
      await runtime.triggerLeadStatusChanged(
        userId,
        req.params.id as string,
        String((customerBefore as any)?.status || "new"),
        String(status)
      );
    }
    res.json({ success: true, message: "Status updated" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/customers/:id - Delete customer
//
// No requireRole here: in this multi-tenant SaaS, the role on the user row is
// an internal label, not a permissions gate. Isolation comes from
// `customersService.delete(id, ownerUserId, brandId)` which only deletes rows
// the calling user owns within their active brand. A user who can list a lead
// is the user who can delete it.
router.delete("/:id", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const success = await customersService.delete(req.params.id as string, userId, req.brandId);
    if (!success) return res.status(404).json({ error: "Customer not found" });
    res.json({ success: true, message: "Customer deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ──────────────── Bulk operations ────────────────
 * Both endpoints operate on the user+brand scope — server-side filtering
 * means a malformed ID list can't reach across tenants. Requests cap at 500
 * IDs to keep query size reasonable.
 */

const BULK_LIMIT = 500;

// POST /api/customers/bulk-delete - Body: { ids: string[] }
router.post("/bulk-delete", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "ids array required" });
    if (ids.length > BULK_LIMIT) return res.status(400).json({ error: `max ${BULK_LIMIT} ids per request` });

    const affected = await customersService.bulkDelete(ids, userId, req.brandId);
    return res.json({ success: true, affected });
  } catch (error: any) {
    logger.error(`bulk-delete error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/customers/bulk-update - Body: { ids: string[], patch: {...} }
//
// Whitelisted patch fields only. Anything else is silently dropped — keeps the
// endpoint forgiving to UI bugs while preventing accidental writes to core
// fields like phone/email.
const BULK_UPDATABLE = new Set([
  "status",
  "category",
  "subcategory",
  "tags",
  "assigned_to",
  "notes",
]);

router.patch("/bulk-update", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "ids array required" });
    if (ids.length > BULK_LIMIT) return res.status(400).json({ error: `max ${BULK_LIMIT} ids per request` });

    const rawPatch = (req.body?.patch || {}) as Record<string, any>;
    const patch: Record<string, any> = {};
    for (const k of Object.keys(rawPatch)) {
      if (BULK_UPDATABLE.has(k)) patch[k] = rawPatch[k];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "patch must contain at least one updatable field" });

    const affected = await customersService.bulkUpdate(ids, patch, userId, req.brandId);
    return res.json({ success: true, affected, applied: Object.keys(patch) });
  } catch (error: any) {
    logger.error(`bulk-update error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;

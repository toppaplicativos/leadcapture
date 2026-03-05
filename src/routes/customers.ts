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

// GET /api/customers - List all customers with filters
router.get("/", async (req: BrandRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { status, source, category, city, search, page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const offset = (pageNum - 1) * limitNum;

    const result = await customersService.getAll({
      status: status as string,
      source: source as string,
      category: category as string,
      city: city as string,
      search: search as string,
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
router.delete("/:id", requireRole(["admin", "manager"]), async (req: BrandRequest, res: Response) => {
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

export default router;

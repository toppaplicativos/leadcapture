import { Response, Router } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";
import { StorefrontService } from "../services/storefront";
import { invalidateCatalogCacheByBrand } from "../services/storefrontCache";
import { assertBrandLimit, EntitlementError, getBrandStatus } from "../services/planEntitlements";

const router = Router();
const brandUnitsService = new BrandUnitsService();
const storefrontService = new StorefrontService();

function resolveBrandErrorStatus(message: string): number {
  const normalized = String(message || "").toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("invalid") ||
    normalized.includes("must")
  ) {
    return 400;
  }
  if (
    normalized.includes("duplicate") ||
    normalized.includes("already exists") ||
    normalized.includes("unique")
  ) {
    return 409;
  }
  return 500;
}

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brands = await brandUnitsService.list(userId);
    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);
    res.json({ success: true, brands, active_brand_id: activeBrandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await assertBrandLimit(userId);

    const brand = await brandUnitsService.create(userId, req.body || {});
    await storefrontService.synchronizeBrandStructure(userId, String(brand.id), { syncProducts: true });
    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);
    res.status(201).json({ success: true, brand, active_brand_id: activeBrandId });
  } catch (error: any) {
    if (error instanceof EntitlementError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }
    const message = String(error?.message || "");
    if (message.includes("required") || message.includes("invalid")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || "Failed to create brand" });
  }
});

const updateBrandHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brand = await brandUnitsService.update(userId, String(req.params.id), req.body || {});
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    await storefrontService.synchronizeBrandStructure(userId, String(brand.id), { syncProducts: true });
    await invalidateCatalogCacheByBrand(String(brand.id));

    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);
    res.json({ success: true, brand, active_brand_id: activeBrandId });
  } catch (error: any) {
    const message = String(error?.message || "Failed to update brand");
    res.status(resolveBrandErrorStatus(message)).json({ error: message });
  }
};

router.put("/:id", updateBrandHandler);
router.patch("/:id", updateBrandHandler);

router.post("/:id/activate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandStatus = await getBrandStatus(String(req.params.id));
    if (brandStatus.id && !brandStatus.active) {
      return res.status(403).json({
        error: "brand_inactive",
        message:
          brandStatus.status === "suspended"
            ? "Organização suspensa — não é possível ativar."
            : "Organização arquivada — não é possível ativar.",
        status: brandStatus.status,
      });
    }

    const ok = await brandUnitsService.setActiveBrand(userId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Brand not found" });

    await storefrontService.synchronizeBrandStructure(userId, String(req.params.id), { syncProducts: true });
    await invalidateCatalogCacheByBrand(String(req.params.id));

    res.json({ success: true, active_brand_id: String(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* Panfleteiro V2: estado de busca persistido por brand
   (resolve vazamento entre operacoes ao trocar brand). */
router.get("/:id/search-state", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = String(req.params.id);
    const state = await brandUnitsService.getSearchState(userId, brandId);
    res.json({ success: true, state });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/search-state", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const brandId = String(req.params.id);
    const state = req.body?.state ?? req.body;
    if (!state || typeof state !== "object") {
      return res.status(400).json({ error: "state body is required" });
    }
    const saved = await brandUnitsService.setSearchState(userId, brandId, state);
    res.json({ success: true, state: saved });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brandId = String(req.params.id);
    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);

    // Prevent deletion of the active brand
    if (brandId === activeBrandId) {
      return res.status(400).json({ error: "Nao pode deletar o brand ativo. Ative outro brand primeiro." });
    }

    const ok = await brandUnitsService.delete(userId, brandId);
    if (!ok) return res.status(404).json({ error: "Brand not found" });

    res.json({ success: true, message: "Brand deletado com sucesso" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import { Response, Router } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";
import { StorefrontService } from "../services/storefront";
import { invalidateCatalogCacheByBrand } from "../services/storefrontCache";

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

    const brand = await brandUnitsService.create(userId, req.body || {});
    await storefrontService.synchronizeBrandStructure(userId, String(brand.id), { syncProducts: true });
    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);
    res.status(201).json({ success: true, brand, active_brand_id: activeBrandId });
  } catch (error: any) {
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

    const ok = await brandUnitsService.setActiveBrand(userId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Brand not found" });

    await storefrontService.synchronizeBrandStructure(userId, String(req.params.id), { syncProducts: true });
    await invalidateCatalogCacheByBrand(String(req.params.id));

    res.json({ success: true, active_brand_id: String(req.params.id) });
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

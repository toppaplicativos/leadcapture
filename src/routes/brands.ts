import { Response, Router } from "express";
import { AuthRequest } from "../middleware/auth";
import { BrandUnitsService } from "../services/brandUnits";

const router = Router();
const brandUnitsService = new BrandUnitsService();

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

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const brand = await brandUnitsService.update(userId, String(req.params.id), req.body || {});
    if (!brand) return res.status(404).json({ error: "Brand not found" });

    const activeBrandId = await brandUnitsService.getActiveBrandId(userId);
    res.json({ success: true, brand, active_brand_id: activeBrandId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/activate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const ok = await brandUnitsService.setActiveBrand(userId, String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Brand not found" });

    res.json({ success: true, active_brand_id: String(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import { NextFunction, Response } from "express";
import { AuthRequest } from "./auth";
import { BrandUnitsService } from "../services/brandUnits";

export interface BrandRequest extends AuthRequest {
  brandId?: string | null;
}

const brandUnitsService = new BrandUnitsService();

function getRequestedBrandId(req: BrandRequest): string | null {
  const fromHeader = String(req.headers["x-brand-id"] || "").trim();
  if (fromHeader) return fromHeader;

  const fromQuery = String((req.query as any)?.brand_id || "").trim();
  if (fromQuery) return fromQuery;

  const body = (req.body || {}) as Record<string, any>;
  const fromBody = String(body.brand_id || body.brandId || "").trim();
  if (fromBody) return fromBody;

  return null;
}

export async function attachBrandContext(
  req: BrandRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req.user?.userId || req.userId) as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const requestedBrandId = getRequestedBrandId(req);
    req.brandId = await brandUnitsService.resolveActiveBrandId(userId, requestedBrandId);
    next();
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Invalid brand context" });
  }
}

export async function requireBrandContext(
  req: BrandRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await attachBrandContext(req, res, async () => {
    if (!req.brandId) {
      res.status(400).json({ error: "brand_id is required. Create a Brand Unit first." });
      return;
    }
    next();
  });
}

/**
 * Content hub bridges — gallery materials + skill packs for tenants.
 * Lightweight Phase D surface.
 */

import { Router, Response } from "express"
import { authenticateToken, type AuthRequest } from "../middleware/auth"
import { resolveRequestBrandId } from "../middleware/permissions"
import { AffiliatesService } from "../services/affiliates"
import { query } from "../config/database"

const router = Router()
const affiliatesService = new AffiliatesService()

router.use(authenticateToken)

/**
 * GET /api/content-hub
 * Unified snapshot: gallery-ish counts + published affiliate materials + skill templates.
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || (req.user as any)?.userId
    if (!userId) return res.status(401).json({ error: "Não autenticado" })
    const brandId = resolveRequestBrandId(req)

    let materials: any[] = []
    if (brandId) {
      try {
        materials = await affiliatesService.listMaterials(String(userId), String(brandId), {
          publishedOnly: true,
        } as any)
      } catch {
        materials = []
      }
    }

    let galleryStats = { total: 0 }
    try {
      const row = await query(
        `SELECT COUNT(*)::text AS count FROM media_files WHERE user_id = ? ${brandId ? "AND (brand_id = ? OR brand_id IS NULL)" : ""}`,
        brandId ? [userId, brandId] : [userId],
      )
      galleryStats = { total: Number((row as any)?.[0]?.count || (row as any)?.count || 0) }
    } catch {
      galleryStats = { total: 0 }
    }

    let skillTemplates: any[] = []
    try {
      const { SKILL_TEMPLATES } = await import("../services/skillTemplates")
      skillTemplates = (SKILL_TEMPLATES || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
      }))
    } catch {
      skillTemplates = []
    }

    return res.json({
      hub: {
        gallery: galleryStats,
        affiliate_materials: materials,
        skill_templates: skillTemplates,
        brand_id: brandId,
      },
    })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal" })
  }
})

export default router

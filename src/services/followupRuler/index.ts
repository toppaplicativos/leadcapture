import { buildProfileForBrand } from "./profileBuilder";
import { createFollowupRulerFromProfile, BuildResult } from "./builder";

export { buildProfileForBrand, createFollowupRulerFromProfile };
export type { BuildResult, CampaignRef } from "./builder";
export type { FollowupProfile, FollowupStep } from "./templates";

/**
 * Pipeline completo:
 *   1) carrega contexto do brand
 *   2) gera profile via IA
 *   3) cria as 8 campanhas em status='draft'
 */
export async function createFollowupRulerForBrand(userId: string, brandId: string): Promise<BuildResult & { profileGenerated: boolean }> {
  const profile = await buildProfileForBrand(userId, brandId);
  const result = await createFollowupRulerFromProfile(profile);
  return { ...result, profileGenerated: true };
}

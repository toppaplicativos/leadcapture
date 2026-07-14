/**
 * Ref fraca do CampaignEngine — evita import circular customers ↔ index
 * que quebrava auto-alimentar (notifyCampaignAutoFeed importava index incompleto).
 */
import type { CampaignEngineService } from "./campaignEngine";

let _engine: CampaignEngineService | null = null;

export function setCampaignEngineRef(engine: CampaignEngineService | null): void {
  _engine = engine;
}

export function getCampaignEngineRef(): CampaignEngineService | null {
  return _engine;
}

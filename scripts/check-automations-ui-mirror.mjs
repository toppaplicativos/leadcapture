import fs from "node:fs";

const paths = [
  "frontend/src/components/automations/AutomationDefinitionsHub.tsx",
  "frontend/src/components/automations/AutomationDetailModal.tsx",
  "frontend/src/components/agent/instagram/InstagramAutomationsTab.tsx",
  "frontend/src/components/instagram/InstagramAiTab.tsx",
  "src/services/automationMatchLogic.ts",
  "src/services/automationDefinitionRunner.ts",
  "src/services/instagramEventDispatcher.ts",
];

const notes = [];
for (const p of paths) {
  const t = fs.readFileSync(p, "utf8");
  notes.push(`## ${p}`);
  if (p.includes("DefinitionsHub")) {
    notes.push(`- seed CTA: ${t.includes("seedInstagram") || t.includes("Seeds Instagram")}`);
    notes.push(`- detail modal: ${t.includes("AutomationDetailModal")}`);
  }
  if (p.includes("DetailModal")) {
    for (const tab of ["Geral", "Gatilho", "Ações", "Limites", "Histórico"]) {
      notes.push(`- tab ${tab}: ${t.includes(tab)}`);
    }
  }
  if (p.includes("InstagramAutomationsTab")) {
    notes.push(`- platform filter fetch: ${t.includes("platform: 'instagram'") || t.includes('platform: "instagram"')}`);
    notes.push(`- uses AutomationDetailModal: ${t.includes("AutomationDetailModal")}`);
    notes.push(`- catalog-only path removed: ${!t.includes("/api/automations/")}`);
  }
  if (p.includes("InstagramAiTab")) {
    notes.push(`- auto-reply master toggle labels removed: ${!t.includes("Auto-reply DMs")}`);
    notes.push(`- CTA to /automacoes: ${t.includes("/automacoes")}`);
  }
  if (p.includes("automationMatchLogic")) notes.push("- first-match + skip catalog module present");
  if (p.includes("Runner")) notes.push(`- enviar_dm_ig real path: ${t.includes("sendInstagramDm")}`);
  if (p.includes("Dispatcher")) notes.push(`- skip catalog: ${t.includes("shouldSkipCatalogWebhookReplies")}`);
  notes.push("");
}

const out =
  "C:\\Users\\LENOVO\\AppData\\Local\\Temp\\grok-goal-738575684dac\\implementer\\ui-mirror-check.md";
fs.writeFileSync(out, notes.join("\n"));
console.log(notes.join("\n"));
console.log("wrote", out);

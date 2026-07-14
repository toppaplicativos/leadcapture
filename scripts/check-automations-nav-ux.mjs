import fs from "node:fs";

const checks = [
  [
    "orchestrator canvasRoute /automacoes",
    fs.readFileSync("src/services/adminAgent/orchestrator.ts", "utf8").includes(
      'turn.canvasRoute = "/automacoes"',
    ),
  ],
  [
    "skillMeta canvasRoute /automacoes",
    fs.readFileSync("src/services/adminAgent/skillMeta.ts", "utf8").includes(
      'canvasRoute: "/automacoes"',
    ),
  ],
  [
    "AgentShell openCanvas /automacoes",
    fs.readFileSync("frontend/src/lib/agent/AgentShellContext.tsx", "utf8").includes(
      "openCanvas('/automacoes')",
    ),
  ],
  [
    "page Todas as automações",
    fs.readFileSync("frontend/src/pages/AutomationsPage.tsx", "utf8").includes(
      "Todas as automações",
    ),
  ],
  [
    "page Modelos prontos",
    fs.readFileSync("frontend/src/pages/AutomationsPage.tsx", "utf8").includes("Modelos prontos"),
  ],
  [
    "promote CTA",
    fs.readFileSync("frontend/src/pages/AutomationsPage.tsx", "utf8").includes("Como automação"),
  ],
  [
    "IG mirror copy",
    fs
      .readFileSync("frontend/src/components/agent/instagram/InstagramAutomationsTab.tsx", "utf8")
      .includes("Espelho organizacional"),
  ],
  [
    "IG no primary seed",
    !fs
      .readFileSync("frontend/src/components/agent/instagram/InstagramAutomationsTab.tsx", "utf8")
      .includes("handleSeed"),
  ],
  [
    "no catalog de tarefas label",
    !fs
      .readFileSync("frontend/src/pages/AutomationsPage.tsx", "utf8")
      .includes("Catálogo de tarefas"),
  ],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "OK" : "FAIL", name);
  if (!ok) fail += 1;
}
if (fail) process.exit(1);
console.log("\nall nav/ux checks passed");

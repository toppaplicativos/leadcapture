#!/usr/bin/env node
/**
 * CLI: Criar/Ativar regua Reev a partir de um perfil de brand.
 *
 * Uso:
 *   node scripts/followup/run.js <profile-slug> [opcoes]
 *
 * Exemplos:
 *   node scripts/followup/run.js alho-pronto --dry-run
 *   node scripts/followup/run.js alho-pronto --force-update
 *   node scripts/followup/run.js alho-pronto --activate
 *   node scripts/followup/run.js alho-pronto --activate --force-update
 *
 * Opcoes:
 *   --dry-run         Nao grava no banco, so mostra o plano
 *   --force-update    Atualiza campanhas existentes (ao inves de pular)
 *   --activate        Ativa FU0 imediatamente, agenda FU1-FU7 no futuro
 *   --instance=<id>   Override da instancia WhatsApp
 *   --source=<id>     Copia settings (midia/agendamento/etc) de campanha existente
 */

const fs = require("fs");
const path = require("path");
const { buildForBrand } = require("./builder");

// ─────────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--"))
      .map((a) => {
        const eq = a.indexOf("=");
        return eq >= 0
          ? [a.slice(2, eq), a.slice(eq + 1)]
          : [a.slice(2), true];
      })
);

const profileSlug = positional[0];

if (!profileSlug) {
  console.error(`
USO: node scripts/followup/run.js <profile-slug> [--dry-run] [--force-update] [--activate]

Perfis disponiveis:`);
  const profilesDir = path.join(__dirname, "profiles");
  for (const file of fs.readdirSync(profilesDir)) {
    if (file.endsWith(".json") && !file.startsWith("_")) {
      console.error(`  • ${file.replace(".json", "")}`);
    }
  }
  console.error("");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Load profile
// ─────────────────────────────────────────────────────────────

const profilePath = path.join(__dirname, "profiles", `${profileSlug}.json`);
if (!fs.existsSync(profilePath)) {
  console.error(`❌ Profile nao encontrado: ${profilePath}`);
  process.exit(1);
}

const profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));

// ─────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────

const options = {
  dryRun: Boolean(flags["dry-run"]),
  forceUpdate: Boolean(flags["force-update"]),
  activate: Boolean(flags.activate),
  instanceId: flags.instance || null,
  existingC1Id: flags.source || null,
  connectionString: process.env.DATABASE_URL ||
    "postgresql://postgres.pkgqdewqaonkzhzprpgq:%40Milionarios2026@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
};

buildForBrand(profile, options)
  .then((result) => {
    if (result.errors.length > 0) process.exit(2);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });

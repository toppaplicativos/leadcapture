/**
 * ============================================================
 * FOLLOW-UP SEQUENCE BUILDER
 * ============================================================
 *
 * Engine que cria (ou atualiza) a regua completa de 8 campanhas
 * Reev para um brand a partir de um profile JSON.
 *
 * Uso programatico:
 *   const { buildForBrand } = require('./builder');
 *   await buildForBrand(profile, { activate: true, dryRun: false });
 *
 * Opcoes:
 *   activate       → ativa FU0 imediatamente, agenda FU1-FU7 (scheduled_at futuro)
 *   dryRun         → nao escreve no banco, so mostra o plano
 *   forceUpdate    → atualiza campanhas existentes (ao inves de pular)
 *   instanceId     → override da instancia (default: usa do profile)
 *   schedulerBase  → data base pra agendar (default: NOW, para testes use data customizada)
 */

const { Pool } = require("pg");
const { randomUUID } = require("crypto");
const { buildSequence } = require("./templates");

const EXIT_TAGS = ["respondeu", "opt_out", "convertido"];

// ─────────────────────────────────────────────────────────────
// Database connection (lazy, reuses if provided)
// ─────────────────────────────────────────────────────────────

function createPool(connectionString) {
  return new Pool({
    connectionString: connectionString || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// ─────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────

async function buildForBrand(profile, options = {}) {
  const {
    activate = false,
    dryRun = false,
    forceUpdate = false,
    instanceId = null,
    schedulerBase = new Date(),
    connectionString = null,
    existingC1Id = null, // If there is an existing campaign to use as template base
  } = options;

  // Validation
  validateProfile(profile);

  const pool = createPool(connectionString);

  try {
    const sequence = buildSequence(profile);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`REGUA REEV — ${profile.company.name}`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Brand: ${profile.brandId}`);
    console.log(`User: ${profile.userId}`);
    console.log(`Instancia WhatsApp: ${instanceId || profile.instanceId}`);
    console.log(`Base agendamento: ${schedulerBase.toISOString()}`);
    console.log(`Modo: ${dryRun ? "DRY-RUN (sem gravar)" : "PRODUCAO"}`);
    console.log(`Forcar update: ${forceUpdate ? "sim" : "nao"}`);
    console.log(`${"═".repeat(60)}\n`);

    // Load base settings (prefer existing campaign, fallback to profile defaults)
    const baseSettings = await loadBaseSettings(pool, profile, existingC1Id);

    // Fetch existing campaigns for idempotency
    const { rows: existing } = await pool.query(
      `SELECT id, name FROM campaign_history
       WHERE user_id = $1 AND brand_id = $2 AND (name LIKE 'FU_%' OR name LIKE 'FU %')`,
      [profile.userId, profile.brandId]
    );
    const existingByName = new Map(existing.map((r) => [r.name, r.id]));

    const results = { created: [], updated: [], skipped: [], errors: [] };

    for (const step of sequence) {
      const effectiveInstance = instanceId || profile.instanceId;

      // Filter rules per step
      const filter = buildStepFilter(step, profile);

      // Settings (clone base + override)
      const settings = mergeSettings(baseSettings, step, profile);

      // Scheduled_at for activation staging
      const scheduledAt = activate && step.delayDays > 0
        ? new Date(schedulerBase.getTime() + step.delayDays * 86400000)
        : null;

      // Initial status
      const status = activate
        ? (step.delayDays === 0 ? "running" : "scheduled")
        : "draft";

      const existingId = existingByName.get(step.name);

      if (existingId && !forceUpdate) {
        results.skipped.push({ id: existingId, name: step.name });
        console.log(`⚠ SKIP  ${step.name} (ja existe: ${existingId.slice(0, 8)}...)`);
        continue;
      }

      try {
        if (existingId && forceUpdate) {
          if (!dryRun) {
            await updateCampaign(pool, existingId, profile, step, filter, settings, effectiveInstance, scheduledAt, status);
          }
          results.updated.push({ id: existingId, name: step.name, framework: step.framework });
          console.log(`✓ UPDATE ${step.name} (${step.framework})`);
        } else {
          const newId = randomUUID();
          if (!dryRun) {
            await insertCampaign(pool, newId, profile, step, filter, settings, effectiveInstance, scheduledAt, status);
          }
          results.created.push({ id: newId, name: step.name, framework: step.framework, delayDays: step.delayDays, scheduledAt });
          console.log(`✓ CREATE ${step.name} (${step.framework}, D+${step.delayDays})`);
        }
      } catch (err) {
        results.errors.push({ name: step.name, error: err.message });
        console.error(`✗ ERROR  ${step.name}: ${err.message}`);
      }
    }

    await pool.end();

    // Summary
    console.log(`\n${"═".repeat(60)}`);
    console.log(`RESUMO`);
    console.log(`${"═".repeat(60)}`);
    console.log(`Criadas:      ${results.created.length}`);
    console.log(`Atualizadas:  ${results.updated.length}`);
    console.log(`Puladas:      ${results.skipped.length}`);
    console.log(`Erros:        ${results.errors.length}`);
    if (activate) {
      console.log(`\n🚀 ATIVACAO:`);
      console.log(`   FU0: running (imediato)`);
      console.log(`   FU1-FU7: scheduled (ver datas abaixo)`);
      results.created
        .filter((c) => c.scheduledAt)
        .forEach((c) => console.log(`   • ${c.name.padEnd(28)} → ${c.scheduledAt.toLocaleString()}`));
    }
    console.log(`${"═".repeat(60)}\n`);

    return results;
  } catch (err) {
    await pool.end();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Profile validation
// ─────────────────────────────────────────────────────────────

function validateProfile(profile) {
  const required = [
    "brandId",
    "userId",
    "agent.name",
    "agent.role",
    "company.name",
    "company.description",
    "product.name",
    "product.mainBenefits",
    "product.targetPains",
    "target.segments",
    "target.region",
    "socialProof.metrics",
    "socialProof.miniCases",
    "techEducation",
    "freeContentOffers",
    "exitSurveyOptions",
  ];
  const missing = [];
  for (const path of required) {
    const keys = path.split(".");
    let val = profile;
    for (const k of keys) val = val?.[k];
    if (val === undefined || val === null || (Array.isArray(val) && val.length === 0)) {
      missing.push(path);
    }
  }
  if (missing.length) {
    throw new Error(`Profile invalido. Campos faltando: ${missing.join(", ")}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Settings helpers
// ─────────────────────────────────────────────────────────────

async function loadBaseSettings(pool, profile, sourceCampaignId) {
  if (sourceCampaignId) {
    const { rows } = await pool.query(
      `SELECT settings, speed_json FROM campaign_history WHERE id = $1`,
      [sourceCampaignId]
    );
    if (rows[0]) {
      const settings = typeof rows[0].settings === "string" ? JSON.parse(rows[0].settings) : rows[0].settings;
      const speed = typeof rows[0].speed_json === "string" ? JSON.parse(rows[0].speed_json) : rows[0].speed_json;
      return { settings: settings || {}, speed: speed || {} };
    }
  }
  return { settings: defaultSettings(profile), speed: defaultSpeed() };
}

function defaultSettings(profile) {
  return {
    campaignMode: "relationship",
    campaignCore: { slug: "", instanceMode: "specific", poolInstanceIds: [], rotationMode: "balanced" },
    destination: { type: "lead_list", targetType: "group", targets: [] },
    scheduler: { scheduleMode: "immediate", timeZone: "America/Sao_Paulo", smartWindowStart: "08:00", smartWindowEnd: "18:00" },
    actionWindow: { enabled: true, start: "08:00", end: "18:00" },
    finalActions: { nextStatus: "contacted", addTags: ["contatado"] },
    triggers: { onNewLead: false, onStatusChange: false, onTagMatch: false, onOrderCreated: false },
    composer: { intentText: "", personalizedPerLead: true, useAutoVariations: true },
    antiBlock: { autoPauseByBlocks: 5, autoPauseByErrorRate: 20, autoPauseOnOffline: true, avoidNight: true, avoidSunday: true },
    media: { imageFileName: null, imageCaption: null, imageUseTextAsCaption: false, videoFileName: null, videoCaption: null, videoUseTextAsCaption: false, audioFileName: null, audioVoiceNote: true, documentFileName: null, documentName: null, linkUrl: null },
  };
}

function defaultSpeed() {
  return { mode: "normal", msgPerMinute: 2, pauseBetweenMsgSeconds: 20 };
}

function mergeSettings(baseSettings, step, profile) {
  // Deep clone to avoid cross-campaign pollution
  const settings = JSON.parse(JSON.stringify(baseSettings.settings || {}));

  settings.campaignCore = settings.campaignCore || {};
  settings.campaignCore.slug = step.slug;

  settings.composer = settings.composer || {};
  settings.composer.intentText = step.aiPrompt;
  settings.composer.personalizedPerLead = true;
  settings.composer.useAutoVariations = true;

  settings.finalActions = settings.finalActions || {};
  settings.finalActions.nextStatus = step.delayDays === 0 ? "contacted" : "contacted";
  settings.finalActions.addTags = [...new Set(["contatado", step.addTag])];

  return { settings, speed: baseSettings.speed || defaultSpeed() };
}

function buildStepFilter(step, profile) {
  const isFirst = !step.sendAfterTag;
  return {
    statuses: isFirst ? (profile.initialStatuses || ["new"]) : ["new", "contacted"],
    hasWhatsapp: profile.requireWhatsApp === true,
    tagsInclude: step.sendAfterTag ? [step.sendAfterTag] : undefined,
    tagsExclude: [step.addTag, ...EXIT_TAGS],
  };
}

// ─────────────────────────────────────────────────────────────
// DB operations
// ─────────────────────────────────────────────────────────────

async function insertCampaign(pool, id, profile, step, filter, merged, instanceId, scheduledAt, status) {
  await pool.query(
    `INSERT INTO campaign_history (
      id, user_id, brand_id, instance_id, name, message_template, ai_prompt, use_ai,
      campaign_mode, filter_json, speed_json, settings,
      status, scheduled_at, target_count, sent_count, failed_count,
      use_instance_rotation, rotation_mode,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, true,
      'relationship', $8, $9, $10,
      $11, $12, 0, 0, 0,
      false, 'balanced',
      NOW(), NOW()
    )`,
    [
      id,
      profile.userId,
      profile.brandId,
      instanceId,
      step.name,
      step.fallback,
      step.aiPrompt,
      JSON.stringify(filter),
      JSON.stringify(merged.speed || {}),
      JSON.stringify(merged.settings || {}),
      status,
      scheduledAt,
    ]
  );
}

async function updateCampaign(pool, id, profile, step, filter, merged, instanceId, scheduledAt, status) {
  await pool.query(
    `UPDATE campaign_history SET
      name = $1, message_template = $2, ai_prompt = $3, filter_json = $4,
      settings = $5, status = $6, scheduled_at = $7, instance_id = $8, updated_at = NOW()
     WHERE id = $9`,
    [
      step.name,
      step.fallback,
      step.aiPrompt,
      JSON.stringify(filter),
      JSON.stringify(merged.settings || {}),
      status,
      scheduledAt,
      instanceId,
      id,
    ]
  );
}

module.exports = { buildForBrand, createPool };

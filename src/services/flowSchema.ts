/**
 * DDL / migrações leves do módulo Fluxos (PostgreSQL via compat layer).
 */

import { getPool } from "../config/database";
import { logger } from "../utils/logger";

let ready = false;

async function tryAlter(sql: string): Promise<void> {
  try {
    await getPool().execute(sql);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/already exists|duplicate|exists/i.test(msg)) return;
    logger.debug(`[flowSchema] alter skipped: ${msg.slice(0, 160)}`);
  }
}

export async function ensureFlowSchema(): Promise<void> {
  if (ready) return;
  const pool = getPool();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flow_automations (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NULL,
      name VARCHAR(255) NOT NULL DEFAULT 'Novo Fluxo',
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      description TEXT NULL,
      nodes_json JSONB NOT NULL DEFAULT '[]',
      connections_json JSONB NOT NULL DEFAULT '[]',
      phases_json JSONB NULL,
      published_nodes_json JSONB NULL,
      published_connections_json JSONB NULL,
      published_version INT NOT NULL DEFAULT 0,
      concurrency_policy VARCHAR(40) NOT NULL DEFAULT 'single_waiting',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flow_automation_executions (
      id VARCHAR(64) PRIMARY KEY,
      flow_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NULL,
      published_version INT NULL,
      trigger_subtype VARCHAR(80) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'running',
      system_vars_json JSONB NULL,
      context_json JSONB NULL,
      node_outputs_json JSONB NULL,
      node_output_schema_json JSONB NULL,
      steps_output_json JSONB NULL,
      steps_timeline_json JSONB NULL,
      debug_log_json JSONB NULL,
      last_node_id VARCHAR(64) NULL,
      error_message TEXT NULL,
      contact_key VARCHAR(80) NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP NULL DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS flow_sessions (
      id VARCHAR(64) PRIMARY KEY,
      flow_id VARCHAR(36) NOT NULL,
      execution_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      brand_id VARCHAR(36) NULL,
      contact_key VARCHAR(80) NOT NULL,
      channel VARCHAR(40) NOT NULL DEFAULT 'whatsapp',
      status VARCHAR(32) NOT NULL DEFAULT 'running',
      published_version INT NOT NULL DEFAULT 1,
      current_node_id VARCHAR(64) NULL,
      waiting_node_id VARCHAR(64) NULL,
      context_json JSONB NULL,
      system_vars_json JSONB NULL,
      nodes_snapshot_json JSONB NULL,
      connections_snapshot_json JSONB NULL,
      instance_id VARCHAR(64) NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      expires_at TIMESTAMP NULL,
      last_inbound_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const flowAlters = [
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS brand_id VARCHAR(36) NULL",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS description TEXT NULL",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS phases_json JSONB NULL",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS published_nodes_json JSONB NULL",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS published_connections_json JSONB NULL",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS published_version INT NOT NULL DEFAULT 0",
    "ALTER TABLE flow_automations ADD COLUMN IF NOT EXISTS concurrency_policy VARCHAR(40) NOT NULL DEFAULT 'single_waiting'",
  ];
  for (const sql of flowAlters) await tryAlter(sql);

  const execAlters = [
    "ALTER TABLE flow_automation_executions ADD COLUMN IF NOT EXISTS brand_id VARCHAR(36) NULL",
    "ALTER TABLE flow_automation_executions ADD COLUMN IF NOT EXISTS published_version INT NULL",
    "ALTER TABLE flow_automation_executions ADD COLUMN IF NOT EXISTS contact_key VARCHAR(80) NULL",
    "ALTER TABLE flow_automation_executions ADD COLUMN IF NOT EXISTS node_output_schema_json JSONB NULL",
    "ALTER TABLE flow_automation_executions ADD COLUMN IF NOT EXISTS steps_timeline_json JSONB NULL",
  ];
  for (const sql of execAlters) await tryAlter(sql);

  await tryAlter(
    "CREATE INDEX IF NOT EXISTS idx_flow_sessions_contact ON flow_sessions (user_id, contact_key, status)"
  );
  await tryAlter("CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow ON flow_sessions (flow_id)");
  await tryAlter("CREATE INDEX IF NOT EXISTS idx_flow_user_brand ON flow_automations (user_id, brand_id)");

  ready = true;
}

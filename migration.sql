
-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),
  logo_url TEXT,
  website VARCHAR(255),
  industry VARCHAR(100),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_companies_user (user_id),
  INDEX idx_companies_cnpj (cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WhatsApp sessions persistence
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id VARCHAR(36) PRIMARY KEY,
  instance_id VARCHAR(100) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36),
  session_data LONGTEXT,
  phone_number VARCHAR(20),
  status ENUM('active','disconnected','banned','pending') DEFAULT 'pending',
  last_connected_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_instance (instance_id),
  INDEX idx_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Detailed clients table
CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  cpf VARCHAR(14),
  birth_date DATE,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),
  tags JSON,
  notes TEXT,
  source ENUM('google_places','whatsapp','manual','import','website') DEFAULT 'manual',
  lead_score INT DEFAULT 0,
  status ENUM('new','contacted','negotiating','converted','lost','inactive') DEFAULT 'new',
  last_contact_at TIMESTAMP NULL,
  custom_fields JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_clients_user (user_id),
  INDEX idx_clients_phone (phone),
  INDEX idx_clients_email (email),
  INDEX idx_clients_status (status),
  INDEX idx_clients_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campaign history
CREATE TABLE IF NOT EXISTS campaign_history (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36),
  instance_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  message_template TEXT,
  ai_prompt TEXT,
  target_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  replied_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status ENUM('draft','scheduled','running','paused','completed','cancelled') DEFAULT 'draft',
  scheduled_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  settings JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_campaign_user (user_id),
  INDEX idx_campaign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Media files table
CREATE TABLE IF NOT EXISTS media_files (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36),
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  category ENUM('image','video','document','audio') NOT NULL,
  tags JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_media_user (user_id),
  INDEX idx_media_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Message log table
CREATE TABLE IF NOT EXISTS message_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  client_id VARCHAR(36),
  campaign_id VARCHAR(36),
  instance_id VARCHAR(100),
  phone VARCHAR(20) NOT NULL,
  direction ENUM('outbound','inbound') NOT NULL,
  message_type ENUM('text','image','video','document','audio','sticker') DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  status ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending',
  error_message TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_msglog_user (user_id),
  INDEX idx_msglog_phone (phone),
  INDEX idx_msglog_campaign (campaign_id),
  INDEX idx_msglog_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Knowledge base for AI training/context
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  tags TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_kb_user (user_id),
  INDEX idx_kb_company (company_id),
  INDEX idx_kb_active (active),
  INDEX idx_kb_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI agent configuration (persona, voice tone and behavior)
CREATE TABLE IF NOT EXISTS ai_agent_profiles (
  user_id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NULL,
  agent_name VARCHAR(120) NOT NULL DEFAULT 'Assistente Comercial',
  tone ENUM('formal', 'casual', 'friendly', 'professional') NOT NULL DEFAULT 'professional',
  language VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  include_emojis BOOLEAN NOT NULL DEFAULT TRUE,
  max_length INT NOT NULL DEFAULT 500,
  objective TEXT,
  business_context TEXT,
  communication_rules TEXT,
  training_notes TEXT,
  forbidden_terms JSON,
  preferred_terms JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_ai_profile_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Context Engine profile (master data for AI contextual generation)
CREATE TABLE IF NOT EXISTS context_engine_profiles (
  user_id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NULL,
  profile_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_context_engine_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dispatchers (expedidores)
CREATE TABLE IF NOT EXISTS expedition_dispatchers (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  INDEX idx_dispatcher_user (user_id),
  INDEX idx_dispatcher_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expedition orders
CREATE TABLE IF NOT EXISTS expedition_orders (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  company_id VARCHAR(36) NULL,
  dispatcher_id VARCHAR(36) NOT NULL,
  whatsapp_instance_id VARCHAR(36) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  delivery_address TEXT,
  items_json JSON NOT NULL,
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  shipping_fee DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  status ENUM('created','sent','confirmed','shipped','delivered','cancelled') DEFAULT 'created',
  whatsapp_status ENUM('pending','sent','failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (dispatcher_id) REFERENCES expedition_dispatchers(id) ON DELETE RESTRICT,
  FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE RESTRICT,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_dispatcher (dispatcher_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campaign leads junction (per-lead tracking within a campaign)
CREATE TABLE IF NOT EXISTS campaign_leads (
  id VARCHAR(36) PRIMARY KEY,
  campaign_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  lead_id VARCHAR(64) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  whatsapp_valid TINYINT(1) DEFAULT NULL,
  whatsapp_jid VARCHAR(120) DEFAULT NULL,
  message_text TEXT,
  ai_generated TINYINT(1) DEFAULT 0,
  status ENUM('pending','validating','ready','sending','sent','delivered','read','replied','failed','skipped','opted_out') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  replied_at TIMESTAMP NULL,
  reply_text TEXT,
  reply_classification ENUM('interested','neutral','negative','opt_out') DEFAULT NULL,
  score_delta INT DEFAULT 0,
  tags_added JSON,
  error_message TEXT,
  attempt_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_lead (campaign_id, lead_id),
  KEY idx_cl_campaign (campaign_id),
  KEY idx_cl_user (user_id),
  KEY idx_cl_lead (lead_id),
  KEY idx_cl_status (status),
  KEY idx_cl_phone (phone),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CRM Automations: rule catalog and scoring
CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(255) NOT NULL,
  trigger_text TEXT,
  tags_json JSON,
  status_from VARCHAR(120),
  status_to VARCHAR(120),
  timing_json JSON,
  copy_json JSON,
  objective_text TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_crm_automation_user_code (user_id, code),
  KEY idx_crm_automation_user (user_id),
  KEY idx_crm_automation_user_active (user_id, is_active),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_settings (
  user_id VARCHAR(36) PRIMARY KEY,
  lead_score_threshold INT NOT NULL DEFAULT 70,
  scoring_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_event_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  automation_code VARCHAR(120) NOT NULL,
  lead_id VARCHAR(64) NULL,
  message_key VARCHAR(120) NULL,
  event_type VARCHAR(40) NOT NULL,
  response_time_seconds INT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_crm_auto_event_user (user_id),
  KEY idx_crm_auto_event_code (automation_code),
  KEY idx_crm_auto_event_type (event_type),
  KEY idx_crm_auto_event_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_message_metrics (
  user_id VARCHAR(36) NOT NULL,
  automation_code VARCHAR(120) NOT NULL,
  message_key VARCHAR(120) NOT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  responses_count INT NOT NULL DEFAULT 0,
  engaged_count INT NOT NULL DEFAULT 0,
  client_count INT NOT NULL DEFAULT 0,
  last_event_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, automation_code, message_key),
  KEY idx_crm_auto_metric_user_code (user_id, automation_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CRM Automations runtime: worker queue, scheduling and DLQ
CREATE TABLE IF NOT EXISTS crm_automation_runtime_settings (
  user_id VARCHAR(36) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  allowed_start_hour TINYINT UNSIGNED NOT NULL DEFAULT 8,
  allowed_end_hour TINYINT UNSIGNED NOT NULL DEFAULT 20,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
  max_messages_per_hour INT NOT NULL DEFAULT 40,
  cooldown_minutes INT NOT NULL DEFAULT 2,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_auto_runtime_user_enabled (user_id, enabled),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_executions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  automation_code VARCHAR(120) NOT NULL,
  lead_id VARCHAR(64) NOT NULL,
  status ENUM('active','completed','canceled','failed') NOT NULL DEFAULT 'active',
  current_step INT NOT NULL DEFAULT 0,
  total_steps INT NOT NULL DEFAULT 1,
  next_run_at TIMESTAMP NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  context_json JSON NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auto_execution_idem (idempotency_key),
  KEY idx_auto_execution_user_status (user_id, status),
  KEY idx_auto_execution_user_code (user_id, automation_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_jobs (
  id VARCHAR(36) PRIMARY KEY,
  execution_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  automation_code VARCHAR(120) NOT NULL,
  lead_id VARCHAR(64) NOT NULL,
  instance_id VARCHAR(36) NULL,
  step_index INT NOT NULL,
  step_key VARCHAR(120) NOT NULL,
  status ENUM('pending','processing','completed','failed','dead_letter','canceled') NOT NULL DEFAULT 'pending',
  run_at TIMESTAMP NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  idempotency_key VARCHAR(255) NOT NULL,
  payload_json JSON NULL,
  last_error TEXT NULL,
  locked_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auto_jobs_idem (idempotency_key),
  KEY idx_auto_jobs_queue (status, run_at),
  KEY idx_auto_jobs_user_status (user_id, status),
  KEY idx_auto_jobs_execution (execution_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_automation_dead_letters (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  automation_code VARCHAR(120) NOT NULL,
  lead_id VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  payload_json JSON NULL,
  status ENUM('open','retried','resolved') NOT NULL DEFAULT 'open',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  retried_at TIMESTAMP NULL,
  KEY idx_auto_dlq_user_status (user_id, status),
  KEY idx_auto_dlq_job (job_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Memory Engine: persistent contextual memory per lead ─────────────────────
-- Run once on existing databases; safe to re-run (uses IF NOT EXISTS logic)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS context_memory     JSON          NULL,
  ADD COLUMN IF NOT EXISTS memory_updated_at  TIMESTAMP     NULL,
  ADD COLUMN IF NOT EXISTS memory_version     INT           NOT NULL DEFAULT 0;

-- ─── Lead Categories: user-defined segmentation labels ───────────────────────
CREATE TABLE IF NOT EXISTS lead_categories (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  brand_id    VARCHAR(36)  NULL,
  name        VARCHAR(120) NOT NULL,
  color       VARCHAR(10)  NOT NULL DEFAULT '#3b82f6',
  description TEXT         NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_lead_categories_user (user_id),
  INDEX idx_lead_categories_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

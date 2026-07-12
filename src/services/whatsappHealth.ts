/**
 * ═══════════════════════════════════════════════════════════════════
 * WhatsApp Health — monitor in-process das instances
 * ═══════════════════════════════════════════════════════════════════
 *
 * Resolve 2 problemas:
 *
 * 1. "Fantasmas conectados" — DB diz status='connected' mas o socket
 *    Baileys ja morreu silencioso. Esse monitor compara o estado em
 *    memoria do InstanceManager (sockets ativos) com o que esta no DB
 *    e corrige discrepancias.
 *
 * 2. Visibilidade — endpoint /api/instances/health retorna struct
 *    enriquecida com tempo desconectado, criticidade e flag de drift
 *    (DB vs memoria). UI usa pra mostrar banner vermelho persistente.
 *
 * Roda a cada 2min in-process. Falhas isoladas, nao derrubam o API.
 */

import { query } from "../config/database";
import type { InstanceManager } from "../core/instanceManager";
import { logger } from "../utils/logger";

/* Singleton ref do InstanceManager — injetado uma vez no startup pelo index.ts.
   Evita import circular (instanceManager eh criado em index.ts, nao exportado). */
let imRef: InstanceManager | null = null;
export function setInstanceManagerRef(im: InstanceManager): void {
  imRef = im;
}

export type InstanceHealthCriticality = "ok" | "warning" | "critical";

export interface InstanceHealthRow {
  id: string;
  name: string;
  phone: string | null;
  brand_id: string | null;
  status_db: string;
  status_runtime: "connected" | "disconnected" | "connecting" | "pairing" | "unknown";
  drift: boolean;            // db != runtime
  last_connected_at: string | null;
  seconds_since_connected: number | null;
  criticality: InstanceHealthCriticality;
  human_reason: string;
  has_pending_qr: boolean;   // TIER 2.4 — QR esperando ser escaneado
}

const TICK_MS = 2 * 60_000; // 2min
const WARNING_THRESHOLD_SEC = 5 * 60;   // 5min desconectado = warning
const CRITICAL_THRESHOLD_SEC = 10 * 60; // 10min = critical (banner)

let timer: NodeJS.Timeout | null = null;
let _started = false;

export function startWhatsAppHealthMonitor(): void {
  if (_started) return;
  _started = true;
  /* Primeiro tick depois de 60s pra dar tempo do restoreAllSessions terminar */
  setTimeout(() => {
    void tick();
    timer = setInterval(() => { void tick(); }, TICK_MS);
  }, 60_000);
  logger.info(`WhatsAppHealth monitor iniciado (tick=${TICK_MS}ms)`);
}

export function stopWhatsAppHealthMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
  _started = false;
}

/* Reconcilia: pra cada instance no DB, verifica se o InstanceManager realmente
   tem socket ativo. Se DB diz connected mas socket nao existe -> marca disconnected.
   (O caminho oposto - socket vivo, DB disconnected - eh raro porque o connect
   atualiza o DB; mas tambem corrigimos.) */
async function tick(): Promise<void> {
  try {
    const rows = (await query<any[]>(
      `SELECT id, name, status, phone, last_connected_at FROM whatsapp_instances`,
    )) as any;
    if (!Array.isArray(rows)) return;

    let driftFixed = 0;
    const deadInstanceIds: string[] = [];
    const now = Date.now();
    const DEAD_THRESHOLD_MS = 30 * 60_000; // 30min disconnected = "dead"

    for (const r of rows) {
      const id = String(r.id);
      const runtime = detectRuntimeStatusFallback(id);

      /* Drift: DB diz connected mas runtime nao tem socket */
      if (r.status === "connected" && runtime !== "connected") {
        try {
          await query(
            `UPDATE whatsapp_instances SET status = 'disconnected' WHERE id = ?`,
            [id],
          );
          r.status = "disconnected";
          driftFixed++;
          logger.warn(`WhatsAppHealth: drift detectado em "${r.name}" — DB=connected mas runtime=${runtime}. Corrigido pra disconnected.`);
        } catch (e: any) {
          logger.warn(`WhatsAppHealth: falha ao corrigir drift de ${id}: ${e.message}`);
        }
      }

      /* Drift reverso: DB diz disconnected mas runtime tem socket ativo.
         Acontece quando reconnect bem-sucedido mas syncInstanceToDB falhou,
         ou quando o health tick rodou entre disconnect e reconnect.
         Also update last_connected_at so deadInstance check sees fresh time. */
      if (r.status !== "connected" && runtime === "connected") {
        try {
          await query(
            `UPDATE whatsapp_instances SET status = 'connected', last_connected_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [id],
          );
          r.status = "connected";
          driftFixed++;
          logger.info(`WhatsAppHealth: drift reverso corrigido em "${r.name}" — DB=disconnected mas runtime=connected. Atualizado pra connected.`);
        } catch (e: any) {
          logger.warn(`WhatsAppHealth: falha ao corrigir drift reverso de ${id}: ${e.message}`);
        }
      }

      /* Identifica instances "mortas" — disconnected ha > 30min sem reconectar.
         Campanhas amarradas a elas vao ser pausadas pra parar o loop infinito.
         IMPORTANT: use the corrected r.status (after drift fix), not original DB value. */
      if (r.status !== "connected") {
        const isDead = r.last_connected_at &&
          (now - new Date(r.last_connected_at).getTime()) > DEAD_THRESHOLD_MS;
        if (isDead || !r.last_connected_at) {
          deadInstanceIds.push(id);
        }
      }
    }

    if (driftFixed > 0) {
      logger.info(`WhatsAppHealth tick: ${driftFixed} drift(s) corrigido(s)`);
    }

    /* Auto-pause campanhas amarradas a instances mortas — evita scheduler ficar
       em loop infinito (1 tentativa por minuto sem ack). User reativa manualmente
       depois de re-parear via QR. */
    if (deadInstanceIds.length > 0) {
      await autoPauseCampaignsForDeadInstances(deadInstanceIds);
    }

    /* Auto-pause campanhas que referenciam instâncias excluídas (não existem mais
       na tabela whatsapp_instances). Essas ficam em loop infinito eternamente. */
    await autoPauseOrphanedCampaigns();
  } catch (err: any) {
    logger.error(`WhatsAppHealth tick failed: ${err.message}`);
  }
}

/* Auto-pause campanhas RUNNING ou SCHEDULED amarradas a instances disconnected ha > 30min.
   Inclui 'scheduled' pra parar loop infinito de campanhas que nunca chegam a executar.
   So pausa RUNNING se tem leads pending (evita pausar campanha que ja terminou). */
async function autoPauseCampaignsForDeadInstances(deadInstanceIds: string[]): Promise<void> {
  try {
    const placeholders = deadInstanceIds.map(() => "?").join(",");
    const affected = (await query<any[]>(
      `SELECT ch.id, ch.name, ch.instance_id, ch.user_id, ch.brand_id, ch.status AS camp_status
       FROM campaign_history ch
       WHERE ch.status IN ('running', 'scheduled')
         AND ch.instance_id IN (${placeholders})
         AND (
           ch.status = 'scheduled'
           OR EXISTS (
             SELECT 1 FROM campaign_leads cl
             WHERE cl.campaign_id = ch.id AND cl.status = 'pending'
           )
         )`,
      deadInstanceIds,
    )) as any;

    if (!Array.isArray(affected) || affected.length === 0) return;

    for (const camp of affected) {
      try {
        await query(
          `UPDATE campaign_history SET status = 'paused', updated_at = NOW() WHERE id = ?`,
          [camp.id],
        );
        logger.warn(`WhatsAppHealth: auto-pause campanha "${camp.name}" (${camp.id}) — instance ${camp.instance_id} morta ha > 30min`);

        /* Notifica o dono da campanha */
        if (camp.user_id) {
          const { getNotificationService } = await import("./notifications");
          const svc = getNotificationService();
          await svc.createNotification({
            user_id: String(camp.user_id),
            type: "system",
            event: "campaign_auto_paused_dead_instance",
            title: `Campanha pausada: ${camp.name}`,
            message: `A campanha "${camp.name}" foi pausada automaticamente porque a instância WhatsApp está desconectada há mais de 30 minutos. Reconecte a instância em /whatsapp e reative a campanha quando estiver pronta.`,
            priority: "high",
            metadata: {
              campaign_id: camp.id,
              campaign_name: camp.name,
              instance_id: camp.instance_id,
              reason: "instance_disconnected_30min",
            },
          } as any).catch(() => undefined);
        }
      } catch (e: any) {
        logger.warn(`WhatsAppHealth: falha ao auto-pausar campanha ${camp.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    logger.warn(`autoPauseCampaignsForDeadInstances failed: ${e.message}`);
  }
}

/* Auto-pause campanhas cujo instance_id nao existe mais na tabela whatsapp_instances.
   Acontece quando uma instancia eh excluida mas campanhas ainda a referenciam. */
async function autoPauseOrphanedCampaigns(): Promise<void> {
  try {
    const orphaned = (await query<any[]>(
      `SELECT ch.id, ch.name, ch.instance_id, ch.user_id, ch.brand_id, ch.status AS camp_status
       FROM campaign_history ch
       WHERE ch.status IN ('running', 'scheduled')
         AND ch.instance_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM whatsapp_instances wi WHERE wi.id = ch.instance_id
         )`,
    )) as any;

    if (!Array.isArray(orphaned) || orphaned.length === 0) return;

    for (const camp of orphaned) {
      try {
        await query(
          `UPDATE campaign_history SET status = 'paused', updated_at = NOW() WHERE id = ?`,
          [camp.id],
        );
        logger.warn(`WhatsAppHealth: auto-pause campanha "${camp.name}" (${camp.id}) — instancia ${camp.instance_id} nao existe mais (foi excluida)`);

        if (camp.user_id) {
          const { getNotificationService } = await import("./notifications");
          const svc = getNotificationService();
          await svc.createNotification({
            user_id: String(camp.user_id),
            type: "system",
            event: "campaign_auto_paused_missing_instance",
            title: `Campanha pausada: ${camp.name}`,
            message: `A campanha "${camp.name}" foi pausada porque a instância WhatsApp que ela usava foi excluída. Edite a campanha e selecione uma nova instância antes de reativar.`,
            priority: "high",
            metadata: {
              campaign_id: camp.id,
              campaign_name: camp.name,
              instance_id: camp.instance_id,
              reason: "instance_deleted",
            },
          } as any).catch(() => undefined);
        }
      } catch (e: any) {
        logger.warn(`WhatsAppHealth: falha ao auto-pausar campanha orfao ${camp.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    logger.warn(`autoPauseOrphanedCampaigns failed: ${e.message}`);
  }
}

/* Fallback que verifica se o instanceManager.sockets tem entry pra esse id.
   Usado quando o IM nao expoe getRuntimeStatus. */
function detectRuntimeStatusFallback(id: string): "connected" | "disconnected" | "connecting" | "pairing" | "unknown" {
  if (!imRef) return "unknown";
  try {
    const sockets = (imRef as any).sockets as Map<string, any> | undefined;
    const instances = (imRef as any).instances as Map<string, any> | undefined;
    const pairingSessions = (imRef as any).pairingSessions as Set<string> | undefined;
    if (!sockets || !instances) return "unknown";
    if (pairingSessions?.has(id)) return "pairing";
    const sock = sockets.get(id);
    const inst = instances.get(id);
    const st = String(inst?.status || "").toLowerCase();
    // Socket vivo + status de sessão autenticada = conectado
    if (sock && inst && (st === "connected" || st === "authenticated" || st === "open")) {
      return "connected";
    }
    if (sock && inst && (st === "connecting" || st === "qr_ready")) return "connecting";
    // Sem socket mas DB/memória ainda diz connected: se o sock sumiu, é disconnected
    if (!sock && inst && (st === "connected" || st === "authenticated")) return "disconnected";
    return "disconnected";
  } catch {
    return "unknown";
  }
}

/* Detecta se existe QR Code pendente esperando ser escaneado.
   InstanceManager guarda qrCode no proprio WhatsAppInstance quando geraproun durante connect. */
function hasPendingQr(id: string): boolean {
  if (!imRef) return false;
  try {
    const instances = (imRef as any).instances as Map<string, any> | undefined;
    if (!instances) return false;
    const inst = instances.get(id);
    return !!(inst?.qrCode);
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   getHealthSnapshot — usado pelo endpoint /api/instances/health
   ═══════════════════════════════════════════════════════════════════ */

export async function getHealthSnapshot(opts?: {
  userId?: string;
  brandId?: string | null;
  isAffiliate?: boolean;
  ownerActorId?: string | null;
}): Promise<{
  instances: InstanceHealthRow[];
  summary: {
    total: number;
    connected: number;
    disconnected: number;
    critical: number;
    warning: number;
    has_critical: boolean;
  };
}> {
  const conds: string[] = [];
  const params: any[] = [];
  if (opts?.userId) {
    conds.push("created_by = ?");
    params.push(opts.userId);
  }
  /* Brand filter opcional - se passar brandId, retorna SO instances do brand;
     se nao passar, retorna todas do user (admin global). */
  if (opts?.brandId) {
    conds.push("(brand_id = ? OR brand_id IS NULL OR brand_id = '')");
    params.push(opts.brandId);
  }
  if (opts?.isAffiliate && opts?.ownerActorId) {
    conds.push("owner_type = 'affiliate'");
    conds.push("owner_actor_id = ?");
    params.push(opts.ownerActorId);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = (await query<any[]>(
    `SELECT id, name, phone, brand_id, status, last_connected_at
     FROM whatsapp_instances ${where}
     ORDER BY (status = 'connected') DESC, last_connected_at DESC NULLS LAST`,
    params,
  )) as any;

  const now = Date.now();
  const instances: InstanceHealthRow[] = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const id = String(r.id);
    const runtimeStatus = detectRuntimeStatusFallback(id);
    /* Runtime é a fonte de verdade: socket vivo = conectado, independente do DB.
       Se runtime=unknown (imRef não disponível), confiamos no DB como fallback. */
    const effectivelyConnected =
      runtimeStatus === "connected" ||
      (runtimeStatus === "unknown" && r.status === "connected");
    /* Drift clássico: DB afirma connected mas socket não existe */
    const drift = r.status === "connected" && runtimeStatus === "disconnected";

    let seconds: number | null = null;
    let lastConnIso: string | null = null;
    if (r.last_connected_at) {
      const t = new Date(r.last_connected_at).getTime();
      lastConnIso = new Date(r.last_connected_at).toISOString();
      seconds = Math.floor((now - t) / 1000);
    }

    const pendingQr = hasPendingQr(id);

    let criticality: InstanceHealthCriticality = "ok";
    let humanReason = "Operando normalmente";
    if (!effectivelyConnected || drift) {
      if (pendingQr) {
        /* TIER 2: QR ja gerado, esperando user escanear — eh critico mas tem acao clara */
        criticality = "critical";
        humanReason = "QR Code pronto! Escaneie pra reconectar";
      } else if (seconds === null || seconds > CRITICAL_THRESHOLD_SEC) {
        criticality = "critical";
        humanReason = drift
          ? "Conexão fantasma detectada - DB mostrava conectado mas Baileys não tem socket vivo"
          : seconds === null
          ? "Nunca conectou - precisa parear via QR code"
          : `Desconectado há ${Math.floor(seconds / 60)} min - bot/disparos parados`;
      } else if (seconds > WARNING_THRESHOLD_SEC) {
        criticality = "warning";
        humanReason = `Desconectado há ${Math.floor(seconds / 60)} min - reconectando...`;
      } else {
        criticality = "warning";
        humanReason = "Reconectando";
      }
    }

    return {
      id,
      name: String(r.name || ""),
      phone: r.phone || null,
      brand_id: r.brand_id || null,
      status_db: String(r.status || "unknown"),
      status_runtime: runtimeStatus,
      drift,
      last_connected_at: lastConnIso,
      seconds_since_connected: seconds,
      criticality,
      human_reason: humanReason,
      has_pending_qr: pendingQr,
    };
  });

  const connected = instances.filter((i) => i.status_runtime === "connected" || (i.status_runtime === "unknown" && i.status_db === "connected")).length;
  const disconnected = instances.length - connected;
  const critical = instances.filter((i) => i.criticality === "critical").length;
  const warning = instances.filter((i) => i.criticality === "warning").length;

  return {
    instances,
    summary: {
      total: instances.length,
      connected,
      disconnected,
      critical,
      warning,
      has_critical: critical > 0,
    },
  };
}

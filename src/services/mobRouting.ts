/**
 * Lead Capture Mob — multi-objective routing engine (spec §6–8).
 * Optimizes stop order by distance / time / cost / punctuality / urgency.
 * Reoptimization preserves completed stops and explains changes.
 */
import { randomUUID } from "crypto";
import { insert, query, queryOne, update } from "../config/database";
import { estimateRoadDistanceKm, mobLogisticsService, type MobDelivery } from "./mobLogistics";

export type RouteObjectiveWeights = {
  distance: number;
  time: number;
  cost: number;
  punctuality: number;
  urgency: number;
};

export const DEFAULT_ROUTE_WEIGHTS: RouteObjectiveWeights = {
  distance: 0.35,
  time: 0.25,
  cost: 0.1,
  punctuality: 0.2,
  urgency: 0.1,
};

export type RouteStopInput = {
  id?: string;
  delivery_id: string;
  stop_type: "pickup" | "dropoff";
  lat: number | null;
  lng: number | null;
  address?: string | null;
  label?: string | null;
  status?: string;
  /** priority higher = more urgent */
  priority?: number;
  /** SLA / window end ISO */
  deadline_at?: string | null;
  /** estimated service time at stop (minutes) */
  service_minutes?: number;
  /** vehicle cost per km override */
  cost_per_km?: number | null;
};

export type OptimizationResult = {
  ordered: Array<RouteStopInput & { stop_order: number }>;
  total_distance_km: number;
  total_time_minutes: number;
  total_cost_est: number;
  score: number;
  algorithm: string;
  weights: RouteObjectiveWeights;
  reasons: string[];
  origin: { lat: number; lng: number } | null;
  metrics_by_stop?: Array<{
    delivery_id: string;
    stop_type: string;
    leg_km: number;
    eta_minutes_from_start: number;
  }>;
};

export type ReoptimizeResult = OptimizationResult & {
  route_id: string;
  preserved_completed: number;
  order_changed: boolean;
  change_summary: string[];
  significant_change: boolean;
};

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeWeights(w: Partial<RouteObjectiveWeights> | undefined): RouteObjectiveWeights {
  const base = { ...DEFAULT_ROUTE_WEIGHTS, ...(w || {}) };
  const sum =
    base.distance + base.time + base.cost + base.punctuality + base.urgency || 1;
  return {
    distance: base.distance / sum,
    time: base.time / sum,
    cost: base.cost / sum,
    punctuality: base.punctuality / sum,
    urgency: base.urgency / sum,
  };
}

function legKm(
  from: { lat: number; lng: number },
  to: RouteStopInput,
  roadFactor = 1.35
): number {
  if (to.lat == null || to.lng == null) return 0.5; // unknown = small penalty
  return Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng) * roadFactor * 100) / 100;
}

function canVisit(
  stop: RouteStopInput,
  remaining: RouteStopInput[],
  completedPickups: Set<string>
): boolean {
  if (stop.stop_type === "dropoff") {
    if (completedPickups.has(stop.delivery_id)) return true;
    const stillNeedsPickup = remaining.some(
      (x) => x.delivery_id === stop.delivery_id && x.stop_type === "pickup"
    );
    return !stillNeedsPickup;
  }
  return true;
}

/**
 * Multi-objective nearest-neighbor with lookahead scoring.
 * Cost of choosing stop S from current position:
 *   distance * w_d + time * w_t + cost * w_c + lateness_risk * w_p - urgency * w_u
 */
export function optimizeStopsMultiObjective(
  stops: RouteStopInput[],
  origin?: { lat: number; lng: number } | null,
  weightsIn?: Partial<RouteObjectiveWeights>,
  opts?: { avg_speed_kmh?: number; cost_per_km?: number }
): OptimizationResult {
  const weights = normalizeWeights(weightsIn);
  const speed = Math.max(8, num(opts?.avg_speed_kmh, 25));
  const baseCostPerKm = num(opts?.cost_per_km, 2);

  const done = stops.filter((s) => s.status === "completed" || s.status === "skipped");
  const pending = stops.filter((s) => s.status !== "completed" && s.status !== "skipped");
  const remaining = [...pending];
  const ordered: RouteStopInput[] = [...done];

  let curLat =
    origin?.lat ??
    remaining.find((s) => s.lat != null)?.lat ??
    done.filter((s) => s.lat != null).slice(-1)[0]?.lat ??
    0;
  let curLng =
    origin?.lng ??
    remaining.find((s) => s.lng != null)?.lng ??
    done.filter((s) => s.lng != null).slice(-1)[0]?.lng ??
    0;

  // If we have completed stops, start from last completed position
  const lastDone = [...done].reverse().find((s) => s.lat != null && s.lng != null);
  if (lastDone?.lat != null && lastDone?.lng != null) {
    curLat = lastDone.lat;
    curLng = lastDone.lng;
  }

  const completedPickups = new Set(
    done.filter((s) => s.stop_type === "pickup").map((s) => s.delivery_id)
  );

  let totalKm = 0;
  let totalMin = 0;
  let totalCost = 0;
  const metrics: OptimizationResult["metrics_by_stop"] = [];
  const reasons: string[] = [];

  // Precompute max distance among pending for normalization
  let maxLeg = 1;
  for (const s of remaining) {
    if (s.lat != null && s.lng != null) {
      maxLeg = Math.max(maxLeg, haversineKm(curLat, curLng, s.lat, s.lng) * 1.35);
    }
  }

  const now = Date.now();

  while (remaining.length) {
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestLeg = 0;

    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      if (!canVisit(s, remaining, completedPickups)) continue;

      const from = { lat: curLat, lng: curLng };
      const leg = legKm(from, s);
      const minutes = (leg / speed) * 60 + num(s.service_minutes, s.stop_type === "pickup" ? 4 : 3);
      const cpk = s.cost_per_km != null ? num(s.cost_per_km) : baseCostPerKm;
      const cost = leg * cpk;

      // Lateness risk: if ETA from start would miss deadline
      let lateRisk = 0;
      if (s.deadline_at) {
        const etaAbs = now + (totalMin + minutes) * 60_000;
        const deadline = new Date(s.deadline_at).getTime();
        if (Number.isFinite(deadline)) {
          const slackMin = (deadline - etaAbs) / 60_000;
          if (slackMin < 0) lateRisk = Math.min(1, Math.abs(slackMin) / 60);
          else if (slackMin < 20) lateRisk = 0.3 * (1 - slackMin / 20);
        }
      }

      const urgency = Math.min(1, num(s.priority) / 10);
      // Lower composite = better
      const distN = leg / maxLeg;
      const timeN = minutes / 40;
      const costN = cost / 30;
      const composite =
        distN * weights.distance +
        timeN * weights.time +
        costN * weights.cost +
        lateRisk * weights.punctuality -
        urgency * weights.urgency;

      if (composite < bestScore) {
        bestScore = composite;
        bestIdx = i;
        bestLeg = leg;
      }
    }

    if (bestIdx < 0) bestIdx = 0;
    const next = remaining.splice(bestIdx, 1)[0];
    const minutes =
      (bestLeg / speed) * 60 + num(next.service_minutes, next.stop_type === "pickup" ? 4 : 3);
    const cpk = next.cost_per_km != null ? num(next.cost_per_km) : baseCostPerKm;
    totalKm += bestLeg;
    totalMin += minutes;
    totalCost += bestLeg * cpk;

    if (next.lat != null && next.lng != null) {
      curLat = next.lat;
      curLng = next.lng;
    }
    if (next.stop_type === "pickup") completedPickups.add(next.delivery_id);

    metrics!.push({
      delivery_id: next.delivery_id,
      stop_type: next.stop_type,
      leg_km: Math.round(bestLeg * 100) / 100,
      eta_minutes_from_start: Math.round(totalMin),
    });
    ordered.push(next);
  }

  reasons.push(
    `Objetivos: distância ${(weights.distance * 100).toFixed(0)}% · tempo ${(weights.time * 100).toFixed(0)}% · pontualidade ${(weights.punctuality * 100).toFixed(0)}% · urgência ${(weights.urgency * 100).toFixed(0)}% · custo ${(weights.cost * 100).toFixed(0)}%`
  );
  reasons.push(
    `${ordered.length - done.length} parada(s) pendente(s) · ${totalKm.toFixed(1)} km · ~${Math.round(totalMin)} min`
  );
  if (done.length) {
    reasons.push(`${done.length} parada(s) já concluída(s) preservada(s) no início da sequência`);
  }

  const score =
    Math.round(
      (totalKm * weights.distance * 10 +
        totalMin * weights.time * 0.5 +
        totalCost * weights.cost +
        50) *
        10
    ) / 10;

  return {
    ordered: ordered.map((s, i) => ({ ...s, stop_order: i })),
    total_distance_km: Math.round(totalKm * 100) / 100,
    total_time_minutes: Math.round(totalMin),
    total_cost_est: Math.round(totalCost * 100) / 100,
    score,
    algorithm: "multi_objective_nn_v1",
    weights,
    reasons,
    origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
    metrics_by_stop: metrics,
  };
}

export function compareStopOrders(
  before: Array<{ delivery_id: string; stop_type: string; status?: string }>,
  after: Array<{ delivery_id: string; stop_type: string; status?: string }>
): { changed: boolean; summary: string[]; significant: boolean } {
  const key = (s: { delivery_id: string; stop_type: string }) =>
    `${s.delivery_id}:${s.stop_type}`;
  const beforePending = before.filter((s) => s.status !== "completed" && s.status !== "skipped");
  const afterPending = after.filter((s) => s.status !== "completed" && s.status !== "skipped");
  const bKeys = beforePending.map(key);
  const aKeys = afterPending.map(key);
  const same =
    bKeys.length === aKeys.length && bKeys.every((k, i) => k === aKeys[i]);
  if (same) {
    return { changed: false, summary: ["Ordem das paradas pendentes inalterada"], significant: false };
  }

  const summary: string[] = [];
  let moves = 0;
  for (let i = 0; i < Math.max(bKeys.length, aKeys.length); i++) {
    if (bKeys[i] !== aKeys[i]) {
      moves += 1;
      if (summary.length < 4) {
        summary.push(
          `Posição ${i + 1}: ${bKeys[i] || "—"} → ${aKeys[i] || "—"}`
        );
      }
    }
  }
  const significant = moves >= Math.ceil(Math.max(1, bKeys.length) * 0.4);
  if (significant) {
    summary.unshift(`Mudança significativa (${moves} posição(ões) alterada(s))`);
  } else {
    summary.unshift(`Ajuste leve (${moves} posição(ões))`);
  }
  return { changed: true, summary, significant };
}

export const mobRoutingService = {
  optimizeStopsMultiObjective,

  /**
   * Build optimized stop list for deliveries (used by create route).
   */
  async planForDeliveries(input: {
    deliveries: MobDelivery[];
    origin?: { lat: number; lng: number } | null;
    weights?: Partial<RouteObjectiveWeights>;
    avg_speed_kmh?: number;
    cost_per_km?: number;
  }): Promise<OptimizationResult> {
    const raw = await mobLogisticsService.buildStopsFromDeliveries(input.deliveries);
    const enriched: RouteStopInput[] = raw.map((s) => {
      const d = input.deliveries.find((x) => x.id === s.delivery_id);
      return {
        ...s,
        priority: num(d?.priority),
        deadline_at: (d as any)?.sla_deadline_at || (d as any)?.delivery_window_end || null,
      };
    });
    return optimizeStopsMultiObjective(enriched, input.origin, input.weights, {
      avg_speed_kmh: input.avg_speed_kmh,
      cost_per_km: input.cost_per_km,
    });
  },

  /**
   * Reoptimize an existing route: keep completed stops, reorder pending.
   */
  async reoptimizeRoute(input: {
    routeId: string;
    ownerUserId: string;
    brandId: string;
    weights?: Partial<RouteObjectiveWeights>;
    origin?: { lat: number; lng: number } | null;
    reason?: string;
    avg_speed_kmh?: number;
    cost_per_km?: number;
    /** if true, only return plan without writing */
    dry_run?: boolean;
  }): Promise<ReoptimizeResult> {
    await mobLogisticsService.ensureSchema();
    const route = await mobLogisticsService.getRouteById(input.routeId);
    if (!route || route.owner_user_id !== input.ownerUserId || route.brand_id !== input.brandId) {
      throw new Error("Rota não encontrada");
    }
    if (route.status === "completed" || route.status === "cancelled") {
      throw new Error("Rota já finalizada");
    }

    const beforeStops: RouteStopInput[] = (route.stops || []).map((s: any): RouteStopInput => ({
      id: s.id,
      delivery_id: String(s.delivery_id),
      stop_type: (s.stop_type === "pickup" ? "pickup" : "dropoff") as "pickup" | "dropoff",
      lat: s.lat != null ? num(s.lat) : null,
      lng: s.lng != null ? num(s.lng) : null,
      address: s.address,
      label: s.label,
      status: String(s.status || "pending"),
      priority: 0,
      deadline_at: null,
    }));

    // Enrich priority/deadline from deliveries
    for (const s of beforeStops) {
      const d = await mobLogisticsService.getDeliveryById(s.delivery_id);
      if (d) {
        s.priority = num(d.priority);
        s.deadline_at = (d as any).sla_deadline_at || (d as any).delivery_window_end || null;
      }
    }

    let origin = input.origin || null;
    if (!origin && route.courier_id) {
      const c = await mobLogisticsService.getCourierById(route.courier_id);
      if (c?.last_lat != null && c?.last_lng != null) {
        origin = { lat: c.last_lat, lng: c.last_lng };
      }
    }
    if (!origin && route.optimized_json?.origin) {
      origin = route.optimized_json.origin;
    }

    const plan = optimizeStopsMultiObjective(beforeStops, origin, input.weights, {
      avg_speed_kmh: input.avg_speed_kmh,
      cost_per_km: input.cost_per_km,
    });

    const cmp = compareStopOrders(beforeStops, plan.ordered);
    const preserved = beforeStops.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length;

    const reasons = [
      ...plan.reasons,
      ...(input.reason ? [`Motivo: ${input.reason}`] : []),
      ...cmp.summary,
    ];

    if (input.dry_run) {
      return {
        ...plan,
        reasons,
        route_id: input.routeId,
        preserved_completed: preserved,
        order_changed: cmp.changed,
        change_summary: cmp.summary,
        significant_change: cmp.significant,
      };
    }

    if (!cmp.changed) {
      await update(
        `UPDATE mob_routes SET optimized_json = ?, updated_at = NOW() WHERE id = ?`,
        [
          JSON.stringify({
            ...(route.optimized_json || {}),
            last_reoptimize: {
              at: new Date().toISOString(),
              reason: input.reason || "no_change",
              algorithm: plan.algorithm,
              weights: plan.weights,
              order_changed: false,
            },
          }),
          input.routeId,
        ]
      ).catch(() => undefined);
      return {
        ...plan,
        reasons,
        route_id: input.routeId,
        preserved_completed: preserved,
        order_changed: false,
        change_summary: cmp.summary,
        significant_change: false,
      };
    }

    // Rewrite pending stop orders; keep completed as-is with original ids when possible
    // Strategy: delete pending stops, reinsert in new order; keep completed rows
    await query(
      `DELETE FROM mob_route_stops WHERE route_id = ? AND status NOT IN ('completed','skipped')`,
      [input.routeId]
    ).catch(() => undefined);

    let order = preserved;
    // Ensure completed have stop_order 0..preserved-1
    const completed = plan.ordered.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    );
    for (let i = 0; i < completed.length; i++) {
      const s = completed[i];
      if (s.id) {
        await update(
          `UPDATE mob_route_stops SET stop_order = ?, updated_at = NOW() WHERE id = ?`,
          [i, s.id]
        ).catch(() => undefined);
      }
    }

    const pendingOrdered = plan.ordered.filter(
      (s) => s.status !== "completed" && s.status !== "skipped"
    );
    order = completed.length;
    for (const s of pendingOrdered) {
      await insert(
        `INSERT INTO mob_route_stops (
          id, route_id, delivery_id, stop_order, stop_type, status, lat, lng, address, label
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          randomUUID(),
          input.routeId,
          s.delivery_id,
          order++,
          s.stop_type,
          s.lat,
          s.lng,
          s.address || null,
          s.label || null,
        ]
      );
    }

    await update(
      `UPDATE mob_routes
       SET total_distance_km = ?, total_stops = ?, optimized_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        plan.total_distance_km,
        plan.ordered.length,
        JSON.stringify({
          origin,
          algorithm: plan.algorithm,
          weights: plan.weights,
          total_time_minutes: plan.total_time_minutes,
          total_cost_est: plan.total_cost_est,
          metrics_by_stop: plan.metrics_by_stop,
          reasons,
          last_reoptimize: {
            at: new Date().toISOString(),
            reason: input.reason || "manual",
            order_changed: true,
            significant: cmp.significant,
            change_summary: cmp.summary,
          },
        }),
        input.routeId,
      ]
    );

    // Audit trail on first pending delivery (status unchanged — event only)
    const firstPending = pendingOrdered[0];
    if (firstPending) {
      const d = await mobLogisticsService.getDeliveryById(firstPending.delivery_id);
      if (d) {
        await mobLogisticsService
          .appendEvent({
            deliveryId: firstPending.delivery_id,
            fromStatus: d.status,
            toStatus: d.status,
            actorType: "system",
            source: "route_reoptimize",
            note: `Rota reotimizada: ${cmp.summary[0] || "ordem atualizada"}${
              input.reason ? ` (${input.reason})` : ""
            }`,
          })
          .catch(() => undefined);
      }
    }

    return {
      ...plan,
      reasons,
      route_id: input.routeId,
      preserved_completed: preserved,
      order_changed: true,
      change_summary: cmp.summary,
      significant_change: cmp.significant,
    };
  },

  /**
   * Suggest inserting a new delivery into an active route (preview).
   */
  async previewInsertDelivery(input: {
    routeId: string;
    ownerUserId: string;
    brandId: string;
    deliveryId: string;
    weights?: Partial<RouteObjectiveWeights>;
  }): Promise<OptimizationResult & { insert_position: number | null }> {
    const route = await mobLogisticsService.getRouteById(input.routeId);
    if (!route || route.owner_user_id !== input.ownerUserId) throw new Error("Rota não encontrada");
    const delivery = await mobLogisticsService.getDeliveryById(input.deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");

    const existing: RouteStopInput[] = (route.stops || []).map((s: any) => ({
      delivery_id: String(s.delivery_id),
      stop_type: s.stop_type,
      lat: s.lat != null ? num(s.lat) : null,
      lng: s.lng != null ? num(s.lng) : null,
      address: s.address,
      label: s.label,
      status: s.status,
      priority: 0,
    }));

    const extra = await mobLogisticsService.buildStopsFromDeliveries([delivery]);
    const merged = [...existing, ...extra.map((s) => ({ ...s, status: "pending" as const }))];
    const origin = route.optimized_json?.origin || null;
    const plan = optimizeStopsMultiObjective(merged, origin, input.weights);

    const firstNew = plan.ordered.findIndex(
      (s) => s.delivery_id === input.deliveryId && s.status !== "completed"
    );

    return {
      ...plan,
      insert_position: firstNew >= 0 ? firstNew : null,
      reasons: [
        ...plan.reasons,
        firstNew >= 0
          ? `Nova entrega entra na posição ${firstNew + 1} da sequência`
          : "Não foi possível posicionar a nova entrega",
      ],
    };
  },
};

/**
 * Lead Capture Mob — dispatch center domain.
 * Board KPIs, queues, explainable courier/vehicle recommendations (spec §11–12, §57).
 */
import { query, queryOne } from "../config/database";
import { estimateRoadDistanceKm, mobLogisticsService } from "./mobLogistics";
import { mobFleetService, type DeliveryCargoProfile } from "./mobFleet";

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export type DispatchWeights = {
  proximity: number;
  load: number;
  rating: number;
  acceptance: number;
  vehicle_fit: number;
  cost: number;
};

const DEFAULT_WEIGHTS: DispatchWeights = {
  proximity: 0.35,
  load: 0.2,
  rating: 0.15,
  acceptance: 0.1,
  vehicle_fit: 0.15,
  cost: 0.05,
};

export type CourierRecommendation = {
  courier_id: string;
  full_name: string;
  ops_status: string;
  distance_to_pickup_km: number | null;
  active_load: number;
  rating_avg: number;
  score: number; // higher = better for UI ranking 0–100
  raw_score: number; // internal (lower was better in legacy; we invert)
  reasons: string[];
  warnings: string[];
  vehicle?: {
    id: string;
    label: string | null;
    plate: string | null;
    type_name: string | null;
    compatibility_score: number;
    compatibility_reasons: string[];
  } | null;
};

export type DispatchBoard = {
  kpis: {
    awaiting_prep: number;
    ready: number;
    unassigned: number;
    offered: number;
    accepted: number;
    at_pickup: number;
    in_route: number;
    late: number;
    with_issues: number;
    couriers_available: number;
    couriers_busy: number;
    couriers_offline: number;
    vehicles_available: number;
  };
  queues: {
    needs_dispatch: any[];
    in_progress: any[];
    late: any[];
    offered: any[];
  };
  couriers: {
    available: any[];
    busy: any[];
  };
  generated_at: string;
};

function cargoFromDelivery(d: any): DeliveryCargoProfile {
  return {
    weight_kg: d.weight_kg != null ? num(d.weight_kg) : null,
    volume_m3: d.volume_m3 != null ? num(d.volume_m3) : null,
    package_count: d.package_count != null ? num(d.package_count) : null,
    requires_refrigeration: !!d.requires_refrigeration,
    is_fragile: !!d.is_fragile,
    is_food: !!d.is_food,
    high_value: !!d.high_value,
    distance_km: d.distance_km != null ? num(d.distance_km) : null,
    multi_stop: false,
  };
}

function summarizeDelivery(d: any) {
  return {
    id: d.id,
    status: d.status,
    customer_name: d.customer_name,
    dropoff_address: d.dropoff_address,
    pickup_address: d.pickup_address,
    delivery_fee: num(d.delivery_fee),
    distance_km: d.distance_km != null ? num(d.distance_km) : null,
    courier_id: d.courier_id,
    order_id: d.order_id,
    priority: num(d.priority),
    is_late: !!(
      d.sla_deadline_at &&
      new Date(d.sla_deadline_at).getTime() < Date.now() &&
      !["delivered", "cancelled"].includes(d.status)
    ),
    sla_deadline_at: d.sla_deadline_at || null,
    cod_required: !!d.cod_required,
    weight_kg: d.weight_kg != null ? num(d.weight_kg) : null,
    vehicle_id: d.vehicle_id || null,
    created_at: d.created_at,
    eta_minutes: d.eta_minutes != null ? num(d.eta_minutes) : null,
  };
}

export const mobDispatchService = {
  async getBoard(ownerUserId: string, brandId: string): Promise<DispatchBoard> {
    await mobLogisticsService.ensureSchema();
    await mobFleetService.ensureSchema();

    const deliveries =
      (await query<any[]>(
        `SELECT d.*, c.full_name AS courier_name, c.ops_status AS courier_ops_status
         FROM mob_deliveries d
         LEFT JOIN mob_couriers c ON c.id = d.courier_id
         WHERE d.owner_user_id = ? AND d.brand_id = ?
           AND d.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY d.priority DESC, d.created_at ASC
         LIMIT 300`,
        [ownerUserId, brandId]
      ).catch(() =>
        query<any[]>(
          `SELECT d.*, c.full_name AS courier_name, c.ops_status AS courier_ops_status
           FROM mob_deliveries d
           LEFT JOIN mob_couriers c ON c.id = d.courier_id
           WHERE d.owner_user_id = ? AND d.brand_id = ?
           ORDER BY d.priority DESC, d.created_at ASC
           LIMIT 300`,
          [ownerUserId, brandId]
        )
      )) || [];

    const memberships = await mobLogisticsService.listMembershipsForOrg(ownerUserId, brandId);
    const approved = (memberships || []).filter((m: any) => m.status === "approved");

    let available = 0;
    let busy = 0;
    let offline = 0;
    const availableList: any[] = [];
    const busyList: any[] = [];
    for (const m of approved) {
      const ops = String(m.ops_status || "offline");
      const row = {
        membership_id: m.id,
        courier_id: m.courier_id,
        full_name: m.full_name,
        ops_status: ops,
        last_lat: m.last_lat,
        last_lng: m.last_lng,
        last_location_at: m.last_location_at,
        vehicle_type: m.vehicle_json?.type || null,
        rating_avg: num(m.rating_avg || m.courier_rating),
      };
      if (ops === "available") {
        available += 1;
        availableList.push(row);
      } else if (ops === "busy") {
        busy += 1;
        busyList.push(row);
      } else {
        offline += 1;
      }
    }

    const fleet = await mobFleetService.fleetSummary(ownerUserId, brandId);

    const now = Date.now();
    let awaiting_prep = 0;
    let ready = 0;
    let unassigned = 0;
    let offered = 0;
    let accepted = 0;
    let at_pickup = 0;
    let in_route = 0;
    let late = 0;
    let with_issues = 0;

    const needs_dispatch: any[] = [];
    const in_progress: any[] = [];
    const lateList: any[] = [];
    const offeredList: any[] = [];

    for (const d of deliveries) {
      const st = String(d.status);
      const isTerminal = st === "delivered" || st === "cancelled";
      const isLate =
        !isTerminal &&
        d.sla_deadline_at &&
        new Date(d.sla_deadline_at).getTime() < now;

      if (isLate) {
        late += 1;
        lateList.push(summarizeDelivery(d));
      }

      if (["order_received", "payment_pending", "payment_approved", "preparing"].includes(st)) {
        awaiting_prep += 1;
      }
      if (["ready_for_dispatch", "awaiting_courier"].includes(st)) {
        ready += 1;
        if (!d.courier_id) {
          unassigned += 1;
          needs_dispatch.push(summarizeDelivery(d));
        }
      }
      if (st === "offered_to_courier") {
        offered += 1;
        offeredList.push(summarizeDelivery(d));
        if (!d.courier_id) needs_dispatch.push(summarizeDelivery(d));
      }
      if (
        [
          "accepted_by_courier",
          "courier_to_pickup",
          "courier_at_pickup",
        ].includes(st)
      ) {
        accepted += 1;
        if (st === "courier_at_pickup" || st === "courier_to_pickup") at_pickup += 1;
        in_progress.push(summarizeDelivery(d));
      }
      if (["picked_up", "en_route", "near_destination", "at_destination"].includes(st)) {
        in_route += 1;
        in_progress.push(summarizeDelivery(d));
      }
      if (["delivery_failed", "under_review", "redelivery_needed", "returning_to_store"].includes(st)) {
        with_issues += 1;
      }
    }

    // Deduplicate needs_dispatch by id
    const seen = new Set<string>();
    const needsUnique = needs_dispatch.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    return {
      kpis: {
        awaiting_prep,
        ready,
        unassigned,
        offered,
        accepted,
        at_pickup,
        in_route,
        late,
        with_issues,
        couriers_available: available,
        couriers_busy: busy,
        couriers_offline: offline,
        vehicles_available: fleet.available || 0,
      },
      queues: {
        needs_dispatch: needsUnique.slice(0, 40),
        in_progress: in_progress.slice(0, 40),
        late: lateList.slice(0, 30),
        offered: offeredList.slice(0, 30),
      },
      couriers: {
        available: availableList.slice(0, 40),
        busy: busyList.slice(0, 40),
      },
      generated_at: new Date().toISOString(),
    };
  },

  /**
   * Recommend couriers for a delivery with human-readable reasons (spec §12).
   */
  async recommendCouriers(
    ownerUserId: string,
    brandId: string,
    deliveryId: string,
    opts?: { limit?: number; weights?: Partial<DispatchWeights> }
  ): Promise<{
    delivery: any;
    recommendations: CourierRecommendation[];
    weights: DispatchWeights;
  }> {
    await mobLogisticsService.ensureSchema();
    await mobFleetService.ensureSchema();

    const delivery = await mobLogisticsService.getDeliveryById(deliveryId);
    if (!delivery || delivery.owner_user_id !== ownerUserId || delivery.brand_id !== brandId) {
      throw new Error("Entrega não encontrada");
    }

    const settings = await mobLogisticsService.getOrCreateSettings(ownerUserId, brandId);
    const weights: DispatchWeights = { ...DEFAULT_WEIGHTS, ...(opts?.weights || {}) };
    // normalize
    const wSum =
      weights.proximity +
      weights.load +
      weights.rating +
      weights.acceptance +
      weights.vehicle_fit +
      weights.cost;
    if (wSum > 0) {
      (Object.keys(weights) as Array<keyof DispatchWeights>).forEach((k) => {
        weights[k] = weights[k] / wSum;
      });
    }

    const rejected = await mobLogisticsService.getRejectedCourierIds(deliveryId);
    const candidates = await mobLogisticsService.listCandidateCouriers(ownerUserId, brandId, {
      excludeCourierIds: rejected,
      pickupLat: delivery.pickup_lat,
      pickupLng: delivery.pickup_lng,
      maxConcurrent: settings.max_concurrent_per_courier,
    });

    const cargo = cargoFromDelivery(delivery);
    const vehicles = await mobFleetService.listVehicles(ownerUserId, brandId);

    // Acceptance rate proxy from offers (best-effort)
    const acceptMap = new Map<string, number>();
    if (candidates.length) {
      const ids = candidates.map((c) => c.courier_id);
      const placeholders = ids.map(() => "?").join(",");
      const acceptanceRows =
        (await query<any[]>(
          `SELECT courier_id,
             COUNT(*)::int AS total,
             SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END)::int AS accepted
           FROM mob_delivery_offers
           WHERE courier_id IN (${placeholders})
           GROUP BY courier_id`,
          ids
        ).catch(() => [])) || [];
      for (const r of acceptanceRows) {
        acceptMap.set(
          String(r.courier_id),
          num(r.total) > 0 ? num(r.accepted) / num(r.total) : 0.7
        );
      }
    }

    // Membership rating
    const memberships = await mobLogisticsService.listMembershipsForOrg(ownerUserId, brandId);
    const ratingMap = new Map(
      (memberships || []).map((m: any) => [String(m.courier_id), num(m.rating_avg || m.courier_rating)])
    );

    const maxDist = Math.max(
      1,
      ...candidates.map((c) => c.distance_to_pickup_km ?? 0).filter((x) => x > 0),
      10
    );

    const recommendations: CourierRecommendation[] = [];

    for (const c of candidates) {
      const reasons: string[] = [];
      const warnings: string[] = [];
      const rating = ratingMap.get(c.courier_id) ?? 0;
      const acceptRate = acceptMap.get(c.courier_id) ?? 0.75;

      // Component scores 0–1 (higher better)
      let proximityScore = 0.4;
      if (c.distance_to_pickup_km != null) {
        proximityScore = Math.max(0, 1 - c.distance_to_pickup_km / maxDist);
        if (c.distance_to_pickup_km <= 2) {
          reasons.push(`Está a ${c.distance_to_pickup_km.toFixed(1)} km da coleta`);
        } else if (c.distance_to_pickup_km <= 8) {
          reasons.push(`A ${c.distance_to_pickup_km.toFixed(1)} km da unidade/coleta`);
        } else {
          reasons.push(`Distância ${c.distance_to_pickup_km.toFixed(1)} km (mais longe)`);
          warnings.push("Distância elevada até a coleta");
        }
      } else {
        warnings.push("Sem GPS recente — distância desconhecida");
        reasons.push("Localização não disponível no momento");
      }

      const loadScore = Math.max(0, 1 - c.active_load / Math.max(1, settings.max_concurrent_per_courier));
      if (c.active_load === 0) {
        reasons.push("Sem entrega ativa");
      } else {
        reasons.push(`${c.active_load} entrega(s) em andamento`);
        if (c.active_load >= settings.max_concurrent_per_courier - 1) {
          warnings.push("Próximo do limite de entregas simultâneas");
        }
      }

      const ratingScore = Math.min(1, rating / 5);
      if (rating >= 4.5) reasons.push(`Avaliação alta (${rating.toFixed(1)})`);
      else if (rating > 0) reasons.push(`Avaliação ${rating.toFixed(1)}`);

      const acceptanceScore = Math.min(1, acceptRate);
      if (acceptRate >= 0.9) reasons.push(`Taxa de aceite ${(acceptRate * 100).toFixed(0)}%`);
      else if (acceptRate < 0.5) warnings.push(`Taxa de aceite baixa (${(acceptRate * 100).toFixed(0)}%)`);

      if (c.ops_status === "available") reasons.push("Online e disponível");
      else if (c.ops_status === "busy") {
        reasons.push("Em turno (ocupado)");
        warnings.push("Já está em outra entrega");
      }

      // Best vehicle for this courier + cargo
      let vehiclePick: CourierRecommendation["vehicle"] = null;
      let vehicleFitScore = 0.55; // neutral if no fleet vehicles
      const courierVehicles = vehicles.filter(
        (v) =>
          (v.courier_id === c.courier_id || v.status === "available") &&
          !["blocked", "docs_expired", "inactive", "maintenance"].includes(v.status)
      );
      const owned = courierVehicles.filter((v) => v.courier_id === c.courier_id);
      const pool = owned.length ? owned : courierVehicles.filter((v) => v.status === "available");

      let bestFit = 0;
      for (const v of pool) {
        const fit = mobFleetService.evaluateCompatibility(v, cargo, v.type);
        if (fit.ok && fit.score >= bestFit) {
          bestFit = fit.score;
          vehicleFitScore = fit.score / 100;
          vehiclePick = {
            id: v.id,
            label: v.label,
            plate: v.plate,
            type_name: v.type?.name || null,
            compatibility_score: fit.score,
            compatibility_reasons: fit.reasons.slice(0, 4),
          };
        }
      }
      if (vehiclePick) {
        reasons.push(
          `Veículo compatível: ${vehiclePick.type_name || vehiclePick.label || vehiclePick.plate || "frota"}`
        );
      } else if (cargo.weight_kg || cargo.requires_refrigeration) {
        warnings.push("Nenhum veículo compatível encontrado na frota para este entregador");
        vehicleFitScore = 0.25;
      }

      // Cost: prefer lower estimated delivery fee share if vehicle cost known
      let costScore = 0.7;
      if (vehiclePick) {
        const v = pool.find((x) => x.id === vehiclePick!.id);
        const cpk = v?.type?.cost_per_km;
        if (cpk != null && delivery.distance_km != null) {
          const est = cpk * num(delivery.distance_km);
          costScore = Math.max(0.2, 1 - Math.min(1, est / 50));
          reasons.push(`Custo operacional est. R$ ${est.toFixed(2)} (${cpk}/km)`);
        }
      }

      const composite =
        proximityScore * weights.proximity +
        loadScore * weights.load +
        ratingScore * weights.rating +
        acceptanceScore * weights.acceptance +
        vehicleFitScore * weights.vehicle_fit +
        costScore * weights.cost;

      const score100 = Math.round(composite * 1000) / 10;

      recommendations.push({
        courier_id: c.courier_id,
        full_name: c.full_name,
        ops_status: c.ops_status,
        distance_to_pickup_km: c.distance_to_pickup_km,
        active_load: c.active_load,
        rating_avg: rating,
        score: score100,
        raw_score: c.score,
        reasons,
        warnings,
        vehicle: vehiclePick,
      });
    }

    recommendations.sort((a, b) => b.score - a.score);
    const limit = Math.max(1, Math.min(num(opts?.limit, 5), 15));

    return {
      delivery: summarizeDelivery(delivery),
      recommendations: recommendations.slice(0, limit),
      weights,
    };
  },

  /**
   * Quick ETA estimate for display (prep + road estimate).
   */
  async estimateDispatchEta(
    ownerUserId: string,
    brandId: string,
    deliveryId: string,
    courierId?: string
  ): Promise<{ eta_minutes: number | null; components: string[] }> {
    const delivery = await mobLogisticsService.getDeliveryById(deliveryId);
    if (!delivery) throw new Error("Entrega não encontrada");
    const settings = await mobLogisticsService.getOrCreateSettings(ownerUserId, brandId);
    const components: string[] = [];
    let minutes = num(settings.prep_time_minutes, 0);
    if (minutes > 0) components.push(`Preparação ${minutes} min`);

    let dist = delivery.distance_km != null ? num(delivery.distance_km) : null;
    if (
      dist == null &&
      delivery.pickup_lat != null &&
      delivery.pickup_lng != null &&
      delivery.dropoff_lat != null &&
      delivery.dropoff_lng != null
    ) {
      dist = estimateRoadDistanceKm(
        delivery.pickup_lat,
        delivery.pickup_lng,
        delivery.dropoff_lat,
        delivery.dropoff_lng
      );
    }

    const speed = 25; // km/h urban default
    if (dist != null) {
      const road = Math.ceil((dist / speed) * 60);
      minutes += road;
      components.push(`Percurso ~${dist.toFixed(1)} km (~${road} min)`);
    }

    if (courierId) {
      const candidates = await mobLogisticsService.listCandidateCouriers(ownerUserId, brandId, {
        pickupLat: delivery.pickup_lat,
        pickupLng: delivery.pickup_lng,
      });
      const c = candidates.find((x) => x.courier_id === courierId);
      if (c?.distance_to_pickup_km != null) {
        const toPickup = Math.ceil((c.distance_to_pickup_km / speed) * 60);
        minutes += toPickup;
        components.push(`Até a coleta ~${toPickup} min`);
      }
    }

    return { eta_minutes: minutes > 0 ? minutes : null, components };
  },
};

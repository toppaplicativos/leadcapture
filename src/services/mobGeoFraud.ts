/**
 * GPS anti-fraud heuristics for Lead Capture Mob.
 * Detects impossible jumps, stale/mock-like accuracy, and multi-device hints.
 */
import { createHash } from "crypto";

export type GeoPointInput = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: Date | string | null;
  deviceId?: string | null;
};

export type GeoFraudFlag =
  | "impossible_jump"
  | "impossible_speed"
  | "low_accuracy"
  | "stale_timestamp"
  | "mock_pattern"
  | "device_switch";

export type GeoFraudResult = {
  ok: boolean;
  flags: GeoFraudFlag[];
  severity: "none" | "warn" | "block";
  distance_km?: number;
  implied_speed_kmh?: number;
  message?: string;
};

const EARTH_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Max realistic delivery vehicle speed (km/h) with margin */
const MAX_SPEED_KMH = 140;
/** Absolute jump in one sample that is never believable (km) */
const MAX_JUMP_KM = 80;
/** Accuracy worse than this (m) → warn */
const LOW_ACCURACY_M = 80;
/** Accuracy suspiciously perfect and unchanging can be mock */
const SUSPICIOUS_ACCURACY_M = 1;

export function evaluateLocationSample(
  prev: GeoPointInput | null | undefined,
  next: GeoPointInput
): GeoFraudResult {
  const flags: GeoFraudFlag[] = [];

  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    return {
      ok: false,
      flags: ["mock_pattern"],
      severity: "block",
      message: "Coordenadas inválidas",
    };
  }

  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) {
    return {
      ok: false,
      flags: ["mock_pattern"],
      severity: "block",
      message: "Coordenadas fora do planeta",
    };
  }

  if (next.accuracy != null && next.accuracy > LOW_ACCURACY_M) {
    flags.push("low_accuracy");
  }

  // Perfectly 0 accuracy often indicates mocked location apps
  if (next.accuracy != null && next.accuracy >= 0 && next.accuracy < SUSPICIOUS_ACCURACY_M) {
    flags.push("mock_pattern");
  }

  if (next.recordedAt) {
    const t = new Date(next.recordedAt).getTime();
    if (Number.isFinite(t)) {
      const drift = Date.now() - t;
      if (drift > 10 * 60_000) flags.push("stale_timestamp");
      if (drift < -2 * 60_000) flags.push("mock_pattern"); // future clock
    }
  }

  let distanceKm: number | undefined;
  let impliedSpeed: number | undefined;

  if (prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng)) {
    distanceKm = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
    const t0 = prev.recordedAt ? new Date(prev.recordedAt).getTime() : null;
    const t1 = next.recordedAt ? new Date(next.recordedAt).getTime() : Date.now();
    const dtH = t0 && t1 > t0 ? (t1 - t0) / 3_600_000 : null;

    if (distanceKm > MAX_JUMP_KM) {
      flags.push("impossible_jump");
    }

    if (dtH != null && dtH > 0) {
      impliedSpeed = distanceKm / dtH;
      if (impliedSpeed > MAX_SPEED_KMH && distanceKm > 0.3) {
        flags.push("impossible_speed");
      }
    } else if (distanceKm > 15) {
      // No timestamp delta but large move in consecutive points
      flags.push("impossible_jump");
    }

    if (prev.deviceId && next.deviceId && prev.deviceId !== next.deviceId) {
      flags.push("device_switch");
    }

    // Reported speed wildly higher than physical speed (when both present)
    if (
      next.speed != null &&
      Number.isFinite(next.speed) &&
      next.speed > 0 &&
      impliedSpeed != null &&
      next.speed * 3.6 > MAX_SPEED_KMH * 1.5
    ) {
      flags.push("impossible_speed");
    }
  }

  const block =
    flags.includes("impossible_jump") ||
    flags.includes("impossible_speed") ||
    (flags.includes("mock_pattern") && flags.includes("low_accuracy"));

  const warn = !block && flags.length > 0;

  return {
    ok: !block,
    flags,
    severity: block ? "block" : warn ? "warn" : "none",
    distance_km: distanceKm != null ? Math.round(distanceKm * 1000) / 1000 : undefined,
    implied_speed_kmh:
      impliedSpeed != null ? Math.round(impliedSpeed * 10) / 10 : undefined,
    message: block
      ? "Localização rejeitada por padrão suspeito (salto/velocidade impossível)"
      : warn
        ? "Localização aceita com alerta de qualidade"
        : undefined,
  };
}

export function hashDeviceId(raw?: string | null): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

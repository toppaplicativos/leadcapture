/**
 * Calculadora de frete por distância (CEP real + faixas configuráveis).
 * Fontes CEP: BrasilAPI (preferida, com geo) → ViaCEP → geocode Places/Mapbox.
 */
import { logger } from "../utils/logger";
import { GooglePlacesService } from "./googlePlaces";

export type FreightTierMode = "fixed" | "per_km" | "km_range";

export type FreightTier = {
  id: string;
  label: string;
  /** fixed = valor fixo na faixa; per_km = base + (km * price_per_km); km_range = alias de fixed */
  mode: FreightTierMode;
  from_km: number;
  /** null = sem teto */
  to_km: number | null;
  fixed_fee?: number | null;
  base_fee?: number | null;
  price_per_km?: number | null;
  eta_minutes?: number | null;
};

export type FreightOrigin = {
  cep?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type FreightLogisticsConfig = {
  shipping_mode?: string | null;
  delivery_fee?: number | null;
  delivery_radius_km?: number | null;
  free_shipping_above?: number | null;
  default_eta_minutes?: number | null;
  delivery_time_text?: string | null;
  frete_texto?: string | null;
  expedition_phone?: string | null;
  origin?: FreightOrigin | null;
  /** auto | brasilapi | viacep */
  cep_provider?: "auto" | "brasilapi" | "viacep" | null;
  tiers?: FreightTier[] | null;
};

export type ResolvedPlace = {
  cep: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  label: string;
  source: string;
};

export type FreightQuote = {
  ok: boolean;
  error?: string;
  distance_km: number | null;
  fee: number | null;
  free_shipping: boolean;
  tier: FreightTier | null;
  eta_minutes: number | null;
  eta_text: string | null;
  within_radius: boolean;
  max_radius_km: number | null;
  origin: ResolvedPlace | null;
  destination: ResolvedPlace | null;
  provider: string | null;
  copy: string | null;
  policy_text: string | null;
};

/**
 * Indica se a política já pode responder ao afiliado sem inferir configuração.
 * Retirada/sem entrega são escolhas válidas; entrega aceita taxa fixa ou
 * cálculo por distância com origem e pelo menos uma faixa.
 */
export function isFreightPolicyConfigured(logistics?: FreightLogisticsConfig | null): boolean {
  const lg = logistics || {};
  const mode = String(lg.shipping_mode || "delivery");
  if (mode === "pickup" || mode === "none") return true;

  const hasFixedPolicy = lg.delivery_fee != null && Number.isFinite(Number(lg.delivery_fee));
  const hasDistancePolicy = Boolean(lg.origin?.cep && Array.isArray(lg.tiers) && lg.tiers.length);
  return hasFixedPolicy || hasDistancePolicy;
}

const places = new GooglePlacesService();

function onlyDigits(v?: string | null): string {
  return String(v || "").replace(/\D/g, "");
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function moneyBr(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function defaultFreightTiers(): FreightTier[] {
  return [
    {
      id: "short",
      label: "Curta distância",
      mode: "fixed",
      from_km: 0,
      to_km: 5,
      fixed_fee: 12,
      eta_minutes: 60,
    },
    {
      id: "medium",
      label: "Média distância",
      mode: "per_km",
      from_km: 5,
      to_km: 15,
      base_fee: 10,
      price_per_km: 2.5,
      eta_minutes: 120,
    },
    {
      id: "long",
      label: "Longa distância",
      mode: "per_km",
      from_km: 15,
      to_km: 40,
      base_fee: 15,
      price_per_km: 3.2,
      eta_minutes: 180,
    },
  ];
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeFreightTiers(raw?: FreightTier[] | null | Array<Record<string, unknown>>): FreightTier[] {
  if (!Array.isArray(raw) || !raw.length) return defaultFreightTiers();
  return raw
    .map((t: any, i) => ({
      id: String(t?.id || `tier_${i + 1}`).slice(0, 40),
      label: String(t?.label || `Faixa ${i + 1}`).slice(0, 80),
      mode: (["fixed", "per_km", "km_range"].includes(String(t?.mode))
        ? t.mode
        : "fixed") as FreightTierMode,
      from_km: Math.max(0, Number(t?.from_km) || 0),
      to_km: (() => {
        const n = numOrNull(t?.to_km);
        return n == null ? null : Math.max(0, n);
      })(),
      fixed_fee: numOrNull(t?.fixed_fee),
      base_fee: numOrNull(t?.base_fee),
      price_per_km: numOrNull(t?.price_per_km),
      eta_minutes: numOrNull(t?.eta_minutes),
    }))
    .sort((a, b) => a.from_km - b.from_km);
}

/**
 * Raio efetivo de entrega:
 * - se alguma faixa for aberta (to_km null) e não houver raio explícito → sem teto
 * - senão: max(raio configurado, maior to_km das faixas)
 * Evita o bug clássico: faixas até 40/100 km com "raio máximo" default 30 bloqueando tudo.
 */
export function resolveEffectiveMaxRadiusKm(lg: FreightLogisticsConfig): number | null {
  const explicit = numOrNull(lg.delivery_radius_km as unknown);
  const tiers =
    Array.isArray(lg.tiers) && lg.tiers.length
      ? normalizeFreightTiers(lg.tiers)
      : [];
  const openEnded = tiers.some((t) => t.to_km == null);
  const tierCeilings = tiers
    .map((t) => (t.to_km == null ? null : Number(t.to_km)))
    .filter((n): n is number => n != null && Number.isFinite(n) && n >= 0);
  const tierMax = tierCeilings.length ? Math.max(...tierCeilings) : null;

  if (openEnded) {
    // Faixa sem teto: só o raio explícito limita (null = sem limite)
    return explicit;
  }
  if (explicit == null && tierMax == null) return null;
  if (explicit == null) return tierMax;
  if (tierMax == null) return explicit;
  return Math.max(explicit, tierMax);
}

function pickTier(distanceKm: number, tiers: FreightTier[]): FreightTier | null {
  for (const t of tiers) {
    const max = t.to_km == null ? Infinity : t.to_km;
    if (distanceKm >= t.from_km && distanceKm <= max + 1e-9) return t;
  }
  // se passou do último to_km, não cobre
  return null;
}

function feeForTier(distanceKm: number, tier: FreightTier, fallbackFee?: number | null): number {
  if (tier.mode === "per_km") {
    const base = Number(tier.base_fee) || 0;
    const per = Number(tier.price_per_km) || 0;
    return Math.round((base + per * distanceKm) * 100) / 100;
  }
  // fixed / km_range
  if (tier.fixed_fee != null && !Number.isNaN(Number(tier.fixed_fee))) {
    return Math.round(Number(tier.fixed_fee) * 100) / 100;
  }
  if (fallbackFee != null && !Number.isNaN(Number(fallbackFee))) {
    return Math.round(Number(fallbackFee) * 100) / 100;
  }
  return 0;
}

async function fetchBrasilApiCep(cep: string): Promise<ResolvedPlace | null> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (data?.errors || data?.type === "service_error") return null;
    const lat = data?.location?.coordinates?.latitude != null
      ? Number(data.location.coordinates.latitude)
      : null;
    const lng = data?.location?.coordinates?.longitude != null
      ? Number(data.location.coordinates.longitude)
      : null;
    const city = data?.city || null;
    const state = data?.state || null;
    const street = data?.street || null;
    const neighborhood = data?.neighborhood || null;
    const label = [street, neighborhood, city, state, cep].filter(Boolean).join(", ");
    return {
      cep,
      street,
      neighborhood,
      city,
      state,
      lat: Number.isFinite(lat as number) ? (lat as number) : null,
      lng: Number.isFinite(lng as number) ? (lng as number) : null,
      label: label || cep,
      source: "brasilapi",
    };
  } catch (e: any) {
    logger.warn(`[freight] BrasilAPI CEP fail: ${e?.message || e}`);
    return null;
  }
}

async function fetchViaCep(cep: string): Promise<ResolvedPlace | null> {
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    if (data?.erro) return null;
    const city = data?.localidade || null;
    const state = data?.uf || null;
    const street = data?.logradouro || null;
    const neighborhood = data?.bairro || null;
    const label = [street, neighborhood, city, state, cep].filter(Boolean).join(", ");
    return {
      cep,
      street,
      neighborhood,
      city,
      state,
      lat: null,
      lng: null,
      label: label || cep,
      source: "viacep",
    };
  } catch (e: any) {
    logger.warn(`[freight] ViaCEP fail: ${e?.message || e}`);
    return null;
  }
}

async function geocodeText(
  text: string,
  scope?: { userId?: string | null; brandId?: string | null },
): Promise<{ lat: number; lng: number; source: string } | null> {
  try {
    const geo = await places.geocodeLocation(text, {
      userId: scope?.userId || undefined,
      brandId: scope?.brandId || undefined,
    });
    if (geo?.latitude != null && geo?.longitude != null) {
      return {
        lat: Number(geo.latitude),
        lng: Number(geo.longitude),
        source: String(geo.source || "geocode"),
      };
    }
  } catch (e: any) {
    logger.warn(`[freight] geocode fail "${text}": ${e?.message || e}`);
  }
  return null;
}

export async function resolveCepOrAddress(
  input: {
    cep?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    lat?: number | null;
    lng?: number | null;
  },
  opts?: {
    provider?: "auto" | "brasilapi" | "viacep" | null;
    userId?: string | null;
    brandId?: string | null;
  },
): Promise<ResolvedPlace | null> {
  const cep = onlyDigits(input.cep);
  const provider = opts?.provider || "auto";

  let place: ResolvedPlace | null = null;

  if (cep.length === 8) {
    if (provider === "viacep") {
      place = await fetchViaCep(cep);
    } else {
      place = await fetchBrasilApiCep(cep);
      if (!place && provider !== "brasilapi") place = await fetchViaCep(cep);
    }
  }

  if (!place) {
    const text = [input.address, input.city, input.state, cep || input.cep]
      .filter(Boolean)
      .join(", ")
      .trim();
    if (!text && input.lat == null) return null;
    place = {
      cep: cep.length === 8 ? cep : null,
      street: input.address || null,
      neighborhood: null,
      city: input.city || null,
      state: input.state || null,
      lat: input.lat != null ? Number(input.lat) : null,
      lng: input.lng != null ? Number(input.lng) : null,
      label: text || "Local",
      source: "manual",
    };
  }

  if (
    (place.lat == null || place.lng == null)
    && (place.label || place.city)
  ) {
    const g = await geocodeText(place.label || `${place.city} ${place.state || ""}`, {
      userId: opts?.userId,
      brandId: opts?.brandId,
    });
    if (g) {
      place.lat = g.lat;
      place.lng = g.lng;
      place.source = `${place.source}+${g.source}`;
    }
  }

  if (input.lat != null && input.lng != null && (place.lat == null || place.lng == null)) {
    place.lat = Number(input.lat);
    place.lng = Number(input.lng);
  }

  return place;
}

export async function quoteFreight(input: {
  logistics: FreightLogisticsConfig;
  destination: {
    cep?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  };
  cartTotal?: number | null;
  userId?: string | null;
  brandId?: string | null;
}): Promise<FreightQuote> {
  const lg = input.logistics || {};
  const mode = String(lg.shipping_mode || "delivery");
  if (mode === "none") {
    return {
      ok: false,
      error: "Esta loja não oferece entrega",
      distance_km: null,
      fee: null,
      free_shipping: false,
      tier: null,
      eta_minutes: null,
      eta_text: lg.delivery_time_text || null,
      within_radius: false,
      max_radius_km: null,
      origin: null,
      destination: null,
      provider: null,
      copy: null,
      policy_text: lg.frete_texto || null,
    };
  }
  if (mode === "pickup") {
    return {
      ok: true,
      distance_km: 0,
      fee: 0,
      free_shipping: true,
      tier: null,
      eta_minutes: null,
      eta_text: "Retirada na loja",
      within_radius: true,
      max_radius_km: null,
      origin: null,
      destination: null,
      provider: null,
      copy: "Retirada na loja — sem frete de entrega.",
      policy_text: lg.frete_texto || null,
    };
  }

  const originCfg = lg.origin || {};
  const origin = await resolveCepOrAddress(
    {
      cep: originCfg.cep,
      address: originCfg.address,
      city: originCfg.city,
      state: originCfg.state,
      lat: originCfg.lat,
      lng: originCfg.lng,
    },
    { provider: lg.cep_provider, userId: input.userId, brandId: input.brandId },
  );

  const destination = await resolveCepOrAddress(input.destination, {
    provider: lg.cep_provider,
    userId: input.userId,
    brandId: input.brandId,
  });

  if (!destination) {
    return {
      ok: false,
      error: "Não encontramos o CEP/endereço de destino. Confira e tente de novo.",
      distance_km: null,
      fee: null,
      free_shipping: false,
      tier: null,
      eta_minutes: null,
      eta_text: lg.delivery_time_text || null,
      within_radius: false,
      max_radius_km: lg.delivery_radius_km != null ? Number(lg.delivery_radius_km) : null,
      origin,
      destination: null,
      provider: null,
      copy: null,
      policy_text: lg.frete_texto || null,
    };
  }

  if (!origin?.lat || !origin?.lng || !destination.lat || !destination.lng) {
    // fallback: taxa fixa legada se não houver geo
    const legacy = lg.delivery_fee != null ? Number(lg.delivery_fee) : null;
    if (legacy != null && !Number.isNaN(legacy)) {
      const freeAbove = lg.free_shipping_above != null ? Number(lg.free_shipping_above) : null;
      const free =
        freeAbove != null
        && input.cartTotal != null
        && Number(input.cartTotal) >= freeAbove;
      const fee = free ? 0 : legacy;
      return {
        ok: true,
        distance_km: null,
        fee,
        free_shipping: free,
        tier: null,
        eta_minutes: lg.default_eta_minutes != null ? Number(lg.default_eta_minutes) : null,
        eta_text: lg.delivery_time_text || null,
        within_radius: true,
        max_radius_km: lg.delivery_radius_km != null ? Number(lg.delivery_radius_km) : null,
        origin,
        destination,
        provider: destination.source,
        copy: free
          ? `Frete grátis (pedido acima de ${moneyBr(freeAbove!)}).`
          : `Taxa de entrega: ${moneyBr(fee)}.`,
        policy_text: lg.frete_texto || null,
      };
    }
    return {
      ok: false,
      error:
        "Não foi possível calcular a distância. Configure o CEP de origem da loja e um CEP/endereço de destino válidos.",
      distance_km: null,
      fee: null,
      free_shipping: false,
      tier: null,
      eta_minutes: null,
      eta_text: lg.delivery_time_text || null,
      within_radius: false,
      max_radius_km: lg.delivery_radius_km != null ? Number(lg.delivery_radius_km) : null,
      origin,
      destination,
      provider: destination.source,
      copy: null,
      policy_text: lg.frete_texto || null,
    };
  }

  const distanceKm =
    Math.round(haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * 10) / 10;
  const maxRadius = resolveEffectiveMaxRadiusKm(lg);
  const tiers = normalizeFreightTiers(lg.tiers);

  if (maxRadius != null && distanceKm > maxRadius) {
    return {
      ok: false,
      error: `Fora da área de entrega (máx. ${maxRadius} km). Distância estimada: ${distanceKm} km.`,
      distance_km: distanceKm,
      fee: null,
      free_shipping: false,
      tier: null,
      eta_minutes: null,
      eta_text: lg.delivery_time_text || null,
      within_radius: false,
      max_radius_km: maxRadius,
      origin,
      destination,
      provider: destination.source,
      copy: `Não entregamos neste endereço (≈${distanceKm} km). Área coberta: até ${maxRadius} km.`,
      policy_text: lg.frete_texto || null,
    };
  }
  const tier = pickTier(distanceKm, tiers);
  if (!tier) {
    return {
      ok: false,
      error: `Sem faixa de frete configurada para ${distanceKm} km.`,
      distance_km: distanceKm,
      fee: null,
      free_shipping: false,
      tier: null,
      eta_minutes: null,
      eta_text: lg.delivery_time_text || null,
      within_radius: true,
      max_radius_km: maxRadius,
      origin,
      destination,
      provider: destination.source,
      copy: null,
      policy_text: lg.frete_texto || null,
    };
  }

  const freeAbove = lg.free_shipping_above != null ? Number(lg.free_shipping_above) : null;
  const free =
    freeAbove != null
    && input.cartTotal != null
    && !Number.isNaN(Number(input.cartTotal))
    && Number(input.cartTotal) >= freeAbove;

  const rawFee = feeForTier(distanceKm, tier, lg.delivery_fee);
  const fee = free ? 0 : rawFee;
  const eta =
    tier.eta_minutes != null
      ? Number(tier.eta_minutes)
      : lg.default_eta_minutes != null
        ? Number(lg.default_eta_minutes)
        : null;

  const etaText =
    lg.delivery_time_text
    || (eta != null ? `Prazo estimado ≈ ${eta} min` : null);

  const copy = free
    ? `Frete grátis para ${destination.city || "seu endereço"} (≈${distanceKm} km)${etaText ? ` · ${etaText}` : ""}.`
    : `Entrega para ${destination.city || "seu endereço"}: ${moneyBr(fee)} (≈${distanceKm} km, faixa ${tier.label})${etaText ? ` · ${etaText}` : ""}.`;

  return {
    ok: true,
    distance_km: distanceKm,
    fee,
    free_shipping: free,
    tier,
    eta_minutes: eta,
    eta_text: etaText,
    within_radius: true,
    max_radius_km: maxRadius,
    origin,
    destination,
    provider: destination.source,
    copy,
    policy_text: lg.frete_texto || null,
  };
}

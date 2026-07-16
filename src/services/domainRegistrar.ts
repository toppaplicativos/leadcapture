type DomainCheckResult = {
  domain: string;
  registrable: boolean;
  reason?: string | null;
  price?: number | null;
  currency?: string | null;
  tier?: string | null;
};

const CF_BASE = "https://api.cloudflare.com/client/v4";

function config() {
  return {
    accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim(),
    token: String(process.env.CLOUDFLARE_REGISTRAR_API_TOKEN || "").trim(),
    purchaseEnabled: String(process.env.REGISTRAR_PURCHASE_ENABLED || "").toLowerCase() === "true",
  };
}

function normalizeDomain(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\s+/g, "");
}

async function cloudflareRequest(path: string, init?: RequestInit) {
  const cfg = config();
  if (!cfg.accountId || !cfg.token) {
    throw new Error("Registrador ainda não configurado");
  }
  const response = await fetch(`${CF_BASE}/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const message = data?.errors?.[0]?.message || data?.message || "Falha no serviço de domínios";
    throw new Error(message);
  }
  return data?.result ?? data;
}

export const domainRegistrar = {
  status() {
    const cfg = config();
    return {
      provider: "cloudflare",
      search_enabled: Boolean(cfg.accountId && cfg.token),
      purchase_enabled: Boolean(cfg.accountId && cfg.token && cfg.purchaseEnabled),
      mode: cfg.accountId && cfg.token ? "live" : "setup_required",
    };
  },

  async check(domains: string[]): Promise<DomainCheckResult[]> {
    const normalized = Array.from(new Set(domains.map(normalizeDomain).filter(Boolean))).slice(0, 20);
    if (!normalized.length) return [];
    const result: any = await cloudflareRequest("/registrar/domain-check", {
      method: "POST",
      body: JSON.stringify({ domains: normalized }),
    });
    const rows = Array.isArray(result) ? result : result?.domains || result?.results || [];
    return rows.map((row: any) => ({
      domain: normalizeDomain(row.domain_name || row.domain || ""),
      registrable: Boolean(row.registrable ?? row.available),
      reason: row.reason ? String(row.reason) : null,
      price: row.price?.amount != null ? Number(row.price.amount) : row.price != null ? Number(row.price) : null,
      currency: String(row.price?.currency || row.currency || "").toUpperCase() || null,
      tier: row.tier ? String(row.tier) : null,
    }));
  },

  async register(domainInput: string) {
    const cfg = config();
    if (!cfg.purchaseEnabled) {
      throw new Error("Compra de domínios ainda não está habilitada");
    }
    const domain = normalizeDomain(domainInput);
    const checked = (await this.check([domain]))[0];
    if (!checked?.registrable) throw new Error("Este domínio não está disponível para registro");
    if (checked.tier === "premium") throw new Error("Domínios premium ainda não podem ser adquiridos pelo app");
    const result = await cloudflareRequest("/registrar/registrations", {
      method: "POST",
      headers: { Prefer: "respond-async" },
      body: JSON.stringify({
        domain_name: domain,
        auto_renew: true,
        privacy_mode: "redaction",
      }),
    });
    return { domain, registration: result, checked };
  },
};

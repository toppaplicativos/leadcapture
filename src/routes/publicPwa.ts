import { Request, Response, Router } from "express";
import { existsSync } from "fs";
import path from "path";
import { queryOne } from "../config/database";
import { StorefrontService } from "../services/storefront";

const router = Router();
const storefrontService = new StorefrontService();
const fallbackIconPath = path.join(__dirname, "../../public/logo.png");

type PwaAppKind = "store" | "affiliate";

type PwaContext = {
  app: PwaAppKind;
  slug?: string;
  channel?: "catalogo" | "loja";
  host?: string | null;
};

function normalizeHost(req: Request): string | null {
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .trim();
  return host || null;
}

function inferStoreContextFromPath(input: string): { slug?: string; channel?: "catalogo" | "loja" } {
  try {
    const url = new URL(input, "https://placeholder.local");
    const parts = url.pathname.split("/").filter(Boolean);
    if ((parts[0] === "catalogo" || parts[0] === "loja") && parts[1]) {
      return {
        slug: decodeURIComponent(parts[1]),
        channel: parts[0],
      };
    }
  } catch {
    // Ignore malformed path/referer.
  }

  return {};
}

function inferAffiliateContextFromPath(input: string): { slug?: string } {
  try {
    const url = new URL(input, "https://placeholder.local");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "central-afiliado" && parts[1]) {
      return { slug: decodeURIComponent(parts[1]) };
    }
  } catch {
    // Ignore malformed path/referer.
  }

  return {};
}

function resolvePwaContext(req: Request): PwaContext {
  const explicitSlug = String(req.query.slug || "").trim();
  const explicitChannel = String(req.query.channel || "").trim().toLowerCase();
  const explicitApp = String(req.query.app || "").trim().toLowerCase();
  const referer = String(req.get("referer") || "").trim();
  const inferredStore = inferStoreContextFromPath(referer);
  const inferredAffiliate = inferAffiliateContextFromPath(referer);

  const app: PwaAppKind =
    explicitApp === "affiliate" || inferredAffiliate.slug
      ? "affiliate"
      : "store";

  return {
    app,
    slug: explicitSlug || (app === "affiliate" ? inferredAffiliate.slug : inferredStore.slug) || undefined,
    channel:
      explicitChannel === "loja" || explicitChannel === "catalogo"
        ? (explicitChannel as "catalogo" | "loja")
        : inferredStore.channel,
    host: normalizeHost(req),
  };
}

function buildStoreRootPath(context: PwaContext): string {
  if (!context.slug) return "/";
  const channel = context.channel === "loja" ? "loja" : "catalogo";
  return `/${channel}/${encodeURIComponent(context.slug)}`;
}

function buildAffiliateRootPath(context: PwaContext): string {
  if (!context.slug) return "/central-afiliado";
  return `/central-afiliado/${encodeURIComponent(context.slug)}`;
}

function buildIconQuery(context: PwaContext): string {
  const params = new URLSearchParams();
  if (context.slug) params.set("slug", context.slug);
  if (context.app === "affiliate") {
    params.set("app", "affiliate");
  } else if (context.channel) {
    params.set("channel", context.channel);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function pickStoreIcon(store: any): string | null {
  const brandLogo = String(store?.brand?.logo_url || "").trim();
  if (brandLogo) return brandLogo;

  const themeLogo = String(store?.theme?.logo_url || "").trim();
  if (themeLogo) return themeLogo;

  return null;
}

function pickBrandIcon(brand: any): string | null {
  return String(brand?.logo_url || "").trim() || null;
}

function resolveLocalAsset(assetPath: string): string | null {
  const cleaned = String(assetPath || "").split("?")[0].split("#")[0].trim();
  if (!cleaned || /^https?:\/\//i.test(cleaned) || cleaned.startsWith("data:")) {
    return null;
  }

  const normalized = cleaned.replace(/^\/+/, "");
  const absolute = path.resolve(process.cwd(), normalized);
  if (!absolute.startsWith(process.cwd())) return null;
  return existsSync(absolute) ? absolute : null;
}

async function resolveAffiliateBrand(slug?: string) {
  const ref = String(slug || "").trim();
  if (!ref) return null;
  return queryOne<any>(
    `SELECT id, slug, name, logo_url, primary_color, secondary_color, slogan
     FROM brand_units
     WHERE LOWER(slug) = LOWER(?) OR LOWER(id) = LOWER(?)
     LIMIT 1`,
    [ref, ref]
  );
}

async function resolveIconSource(context: PwaContext): Promise<string | null> {
  if (context.app === "affiliate") {
    const brand = await resolveAffiliateBrand(context.slug);
    return pickBrandIcon(brand);
  }

  const bundle = await storefrontService.resolvePublicStore({
    slug: context.slug,
    host: context.host,
  });
  return pickStoreIcon(bundle?.store);
}

router.get("/icon", async (req: Request, res: Response) => {
  const context = resolvePwaContext(req);

  try {
    const iconSource = await resolveIconSource(context);
    if (!iconSource) {
      return res.sendFile(fallbackIconPath);
    }

    const localAsset = resolveLocalAsset(iconSource);
    if (localAsset) {
      return res.sendFile(localAsset);
    }

    return res.redirect(iconSource);
  } catch {
    return res.sendFile(fallbackIconPath);
  }
});

router.get("/manifest.webmanifest", async (req: Request, res: Response) => {
  const context = resolvePwaContext(req);
  const isAffiliate = context.app === "affiliate";
  const rootPath = isAffiliate ? buildAffiliateRootPath(context) : buildStoreRootPath(context);
  const scope = rootPath === "/" ? "/" : `${rootPath}/`;
  const iconQuery = buildIconQuery(context);

  let displayName = isAffiliate ? "Afiliados" : "LeadCapture";
  let description = isAffiliate
    ? "Central do afiliado: divulgação, links, comissões e vendas."
    : "Catálogo imersivo para pedidos, histórico e acompanhamento.";
  let themeColor = isAffiliate ? "#16a34a" : "#0f82ff";
  let backgroundColor = isAffiliate ? "#ffffff" : "#0c111a";

  try {
    if (isAffiliate) {
      const brand = await resolveAffiliateBrand(context.slug);
      if (brand) {
        const brandName = String(brand.name || context.slug || "").trim();
        displayName = brandName ? `${brandName} Afiliados` : displayName;
        description =
          String(brand.slogan || "").trim() ||
          `Programa de afiliados ${brandName}. Divulgue, acompanhe vendas e receba comissões.`;
        themeColor =
          String(brand.secondary_color || "").trim() ||
          String(brand.primary_color || "").trim() ||
          themeColor;
        backgroundColor =
          String(brand.primary_color || "").trim() ||
          backgroundColor;
      }
    } else {
      const bundle = await storefrontService.resolvePublicStore({
        slug: context.slug,
        host: context.host,
      });

      const store = bundle?.store as any;
      const brand = store?.brand || {};
      const theme = store?.theme || {};

      displayName =
        String(brand.name || "").trim() ||
        String(store?.name || "").trim() ||
        displayName;

      description =
        String(brand.description || "").trim() ||
        String(brand.slogan || "").trim() ||
        description;

      themeColor =
        String(brand.secondary_color || "").trim() ||
        String(theme.secondary_color || "").trim() ||
        String(brand.primary_color || "").trim() ||
        themeColor;

      backgroundColor =
        String(brand.primary_color || "").trim() ||
        String(theme.primary_color || "").trim() ||
        backgroundColor;
    }
  } catch {
    // Fall back to generic app identity.
  }

  const startUrl = isAffiliate
    ? `${rootPath}/painel?source=pwa`
    : rootPath === "/"
      ? "/?source=pwa"
      : `${rootPath}?source=pwa`;

  const manifest = isAffiliate
    ? {
        id: rootPath,
        name: displayName,
        short_name: displayName.slice(0, 12) || "Afiliados",
        description,
        lang: "pt-BR",
        dir: "ltr",
        start_url: startUrl,
        scope,
        display: "fullscreen",
        display_override: ["fullscreen", "standalone", "minimal-ui"],
        orientation: "portrait-primary",
        background_color: backgroundColor,
        theme_color: themeColor,
        categories: ["business", "finance"],
        prefer_related_applications: false,
        icons: [
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`,
            sizes: "192x192",
            purpose: "any",
          },
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=512`,
            sizes: "512x512",
            purpose: "any",
          },
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=512&maskable=1`,
            sizes: "512x512",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Divulgar",
            short_name: "Divulgar",
            url: `${rootPath}/painel/divulgacao`,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
          {
            name: "Links",
            short_name: "Links",
            url: `${rootPath}/painel/links`,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
          {
            name: "Vendas",
            short_name: "Vendas",
            url: `${rootPath}/painel/vendas`,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
        ],
      }
    : {
        id: rootPath,
        name: displayName,
        short_name: displayName.slice(0, 12) || "Catálogo",
        description,
        lang: "pt-BR",
        dir: "ltr",
        start_url: startUrl,
        scope,
        display: "fullscreen",
        display_override: ["fullscreen", "standalone", "minimal-ui"],
        orientation: "portrait-primary",
        background_color: backgroundColor,
        theme_color: themeColor,
        categories: ["shopping", "food", "business"],
        prefer_related_applications: false,
        icons: [
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`,
            sizes: "192x192",
            purpose: "any",
          },
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=512`,
            sizes: "512x512",
            purpose: "any",
          },
          {
            src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=512&maskable=1`,
            sizes: "512x512",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Catálogo",
            short_name: "Catálogo",
            url: rootPath,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
          {
            name: "Acompanhar pedido",
            short_name: "Pedido",
            url: rootPath === "/" ? "/pedido" : `${rootPath}/pedido`,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
          {
            name: "Histórico",
            short_name: "Histórico",
            url: rootPath === "/" ? "/historico" : `${rootPath}/historico`,
            icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
          },
        ],
      };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.send(JSON.stringify(manifest, null, 2));
});

export default router;
import { Request, Response, Router } from "express";
import { existsSync } from "fs";
import path from "path";
import { StorefrontService } from "../services/storefront";

const router = Router();
const storefrontService = new StorefrontService();
const fallbackIconPath = path.join(__dirname, "../../public/logo.png");

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

function resolveStoreRequestContext(req: Request): { slug?: string; channel?: "catalogo" | "loja"; host?: string | null } {
  const explicitSlug = String(req.query.slug || "").trim();
  const explicitChannel = String(req.query.channel || "").trim().toLowerCase();
  const referer = String(req.get("referer") || "").trim();
  const inferred = inferStoreContextFromPath(referer);

  return {
    slug: explicitSlug || inferred.slug || undefined,
    channel:
      explicitChannel === "loja" || explicitChannel === "catalogo"
        ? (explicitChannel as "catalogo" | "loja")
        : inferred.channel,
    host: normalizeHost(req),
  };
}

function buildStoreRootPath(context: { slug?: string; channel?: "catalogo" | "loja" }): string {
  if (!context.slug) return "/";
  const channel = context.channel === "loja" ? "loja" : "catalogo";
  return `/${channel}/${encodeURIComponent(context.slug)}`;
}

function buildIconQuery(context: { slug?: string; channel?: "catalogo" | "loja" }): string {
  const params = new URLSearchParams();
  if (context.slug) params.set("slug", context.slug);
  if (context.channel) params.set("channel", context.channel);
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

router.get("/icon", async (req: Request, res: Response) => {
  const context = resolveStoreRequestContext(req);

  try {
    const bundle = await storefrontService.resolvePublicStore({
      slug: context.slug,
      host: context.host,
    });

    const iconSource = pickStoreIcon(bundle?.store);
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
  const context = resolveStoreRequestContext(req);
  const storeRootPath = buildStoreRootPath(context);
  const scope = storeRootPath === "/" ? "/" : `${storeRootPath}/`;
  const iconQuery = buildIconQuery(context);

  let displayName = "LeadCapture";
  let description = "Catálogo imersivo para pedidos, histórico e acompanhamento.";
  let themeColor = "#0f82ff";
  let backgroundColor = "#0c111a";

  try {
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
  } catch {
    // Fall back to generic app identity.
  }

  const startUrl = storeRootPath === "/" ? "/?source=pwa" : `${storeRootPath}?source=pwa`;
  const manifest = {
    id: storeRootPath,
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
        url: storeRootPath,
        icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
      },
      {
        name: "Acompanhar pedido",
        short_name: "Pedido",
        url: storeRootPath === "/" ? "/pedido" : `${storeRootPath}/pedido`,
        icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
      },
      {
        name: "Histórico",
        short_name: "Histórico",
        url: storeRootPath === "/" ? "/historico" : `${storeRootPath}/historico`,
        icons: [{ src: `/pwa/icon${iconQuery}${iconQuery ? "&" : "?"}size=192`, sizes: "192x192" }],
      },
    ],
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.send(JSON.stringify(manifest, null, 2));
});

export default router;
import { Request, Response, Router } from "express";
import { existsSync, readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { queryOne } from "../config/database";
import { StorefrontService } from "../services/storefront";

const router = Router();
const storefrontService = new StorefrontService();
const publicDir = path.join(__dirname, "../../public");
const frontendPublicDir = path.join(__dirname, "../../frontend/public");
/** Prefer monochrome brand-mark; colorful logo.png is legacy only. */
const brandMarkPngPath = existsSync(path.join(frontendPublicDir, "brand-mark.png"))
  ? path.join(frontendPublicDir, "brand-mark.png")
  : path.join(publicDir, "brand-mark.png");
const fallbackLogoPath = existsSync(brandMarkPngPath)
  ? brandMarkPngPath
  : path.join(publicDir, "logo.png");
const brandMarkPath = existsSync(path.join(frontendPublicDir, "brand-mark.svg"))
  ? path.join(frontendPublicDir, "brand-mark.svg")
  : path.join(publicDir, "brand-mark.svg");

/** Superfícies instaláveis: cada uma com cor de fundo de ícone distinta */
export type PwaAppKind = "store" | "affiliate" | "admin" | "stock" | "mob";

type PwaContext = {
  app: PwaAppKind;
  slug?: string;
  channel?: "catalogo" | "loja";
  host?: string | null;
  /** partners = LeadCapture Parceiros global (parceiros.leadcapture.online / /parceiros) */
  surface?: "partners" | "mob" | null;
};

type AppTheme = {
  name: string;
  shortName: string;
  description: string;
  /** Cor sólida do ícone PWA (fundo) */
  iconBg: string;
  themeColor: string;
  backgroundColor: string;
  categories: string[];
};

const APP_THEMES: Record<PwaAppKind, AppTheme> = {
  store: {
    name: "Catálogo",
    shortName: "Catálogo",
    description: "Catálogo, pedidos e acompanhamento.",
    iconBg: "#0f172a",
    themeColor: "#0f82ff",
    backgroundColor: "#0c111a",
    categories: ["shopping", "food", "business"],
  },
  admin: {
    name: "LeadCapture",
    shortName: "LeadCapture",
    description: "Painel operacional: leads, WhatsApp, campanhas e catálogo.",
    iconBg: "#0a0a0a",
    themeColor: "#111827",
    backgroundColor: "#0a0a0a",
    categories: ["business", "productivity"],
  },
  stock: {
    name: "Estoque",
    shortName: "Estoque",
    description: "Controle de estoque e inventário da marca.",
    iconBg: "#78350f",
    themeColor: "#d97706",
    backgroundColor: "#fffbeb",
    categories: ["business", "productivity"],
  },
  affiliate: {
    name: "Afiliados",
    shortName: "Afiliados",
    description: "Central do afiliado: divulgação, links, comissões e vendas.",
    iconBg: "#14532d",
    themeColor: "#16a34a",
    backgroundColor: "#ecfdf5",
    categories: ["business", "finance"],
  },
  mob: {
    name: "Lead Capture Mob",
    shortName: "Mob",
    description: "App do entregador: ofertas, rotas, status e comprovantes.",
    iconBg: "#171717",
    themeColor: "#171717",
    backgroundColor: "#f5f5f5",
    categories: ["business", "productivity"],
  },
};

const PARTNERS_THEME: AppTheme = {
  name: "LeadCapture Parceiros",
  shortName: "Parceiros",
  description: "App de afiliados: programas, WhatsApp, contatos e comissões.",
  iconBg: "#14532d",
  themeColor: "#16a34a",
  backgroundColor: "#ecfdf5",
  categories: ["business", "finance"],
};

function normalizeHost(req: Request): string | null {
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .trim();
  return host || null;
}

function inferFromHost(host: string | null | undefined): Partial<PwaContext> {
  const h = String(host || "").toLowerCase().trim();
  if (!h) return {};
  if (h === "mob.leadcapture.online") {
    return { app: "mob", surface: "mob" };
  }
  if (h === "parceiros.leadcapture.online" || h === "afiliados.leadcapture.online") {
    return { app: "affiliate", surface: "partners" };
  }
  const brandHost = h.match(/^(?:parceiros|afiliados)\.([a-z0-9-]+)\./i);
  if (brandHost?.[1] && brandHost[1] !== "leadcapture") {
    return { app: "affiliate", slug: brandHost[1] };
  }
  return {};
}

const ADMIN_PATH_FIRST = new Set([
  "admin",
  "dashboard",
  "login",
  "assistente",
  "leads",
  "clientes",
  "busca",
  "mensagens",
  "notificacoes",
  "campanhas",
  "campanha",
  "automacoes",
  "fluxos",
  "habilidades",
  "skills",
  "criativos",
  "creative",
  "integracoes",
  "galeria",
  "video-studio",
  "produtos",
  "pedidos",
  "design",
  "whatsapp",
  "instagram",
  "facebook",
  "pagamentos",
  "frete",
  "dominio",
  "agente",
  "atendente",
  "configuracoes",
  "emails",
  "provedores-ia",
  "afiliados",
  "cupons",
  "avaliacoes",
  "tirar-pedido",
  "estoque",
  "inicio",
]);

function inferFromPath(input: string): Partial<PwaContext> {
  try {
    const url = new URL(input, "https://placeholder.local");
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";

    if (first === "parceiros") {
      return { app: "affiliate", surface: "partners" };
    }
    if (first === "mob" || first === "rastreio" || first === "entrar") {
      return { app: "mob", surface: "mob" };
    }
    // /loja/:slug e /catalogo/:slug = vitrine; /loja sozinho = Studio admin
    if ((first === "catalogo" || first === "loja") && parts[1]) {
      return {
        app: "store",
        slug: decodeURIComponent(parts[1]),
        channel: first as "catalogo" | "loja",
      };
    }
    if (first === "central-afiliado") {
      return {
        app: "affiliate",
        slug: parts[1] ? decodeURIComponent(parts[1]) : undefined,
      };
    }
    if (first === "app-estoque" || first === "inventario") {
      return {
        app: "stock",
        slug: parts[1] ? decodeURIComponent(parts[1]) : undefined,
      };
    }
    if (!first || ADMIN_PATH_FIRST.has(first) || first === "loja") {
      return { app: "admin" };
    }
  } catch {
    // ignore
  }
  return {};
}

function resolvePwaContext(req: Request): PwaContext {
  const explicitSlug = String(req.query.slug || "").trim();
  const explicitChannel = String(req.query.channel || "").trim().toLowerCase();
  const explicitApp = String(req.query.app || "").trim().toLowerCase();
  const explicitSurface = String(req.query.surface || "").trim().toLowerCase();
  const host = normalizeHost(req);
  const referer = String(req.get("referer") || "").trim();
  const fromHost = inferFromHost(host);
  const inferred = inferFromPath(referer);

  let app: PwaAppKind = "store";
  if (
    explicitApp === "affiliate"
    || explicitApp === "admin"
    || explicitApp === "stock"
    || explicitApp === "store"
    || explicitApp === "mob"
  ) {
    app = explicitApp;
  } else if (fromHost.app) {
    app = fromHost.app;
  } else if (inferred.app) {
    app = inferred.app;
  } else if (
    host === "app.leadcapture.online"
    || host === "leadcapture.online"
    || host === "www.leadcapture.online"
  ) {
    // Em hosts do produto, default é o painel — não o catálogo genérico.
    app = "admin";
  }

  const surface: "partners" | "mob" | null =
    explicitSurface === "partners"
    || fromHost.surface === "partners"
    || inferred.surface === "partners"
      ? "partners"
      : explicitSurface === "mob"
        || fromHost.surface === "mob"
        || inferred.surface === "mob"
          ? "mob"
          : null;

  return {
    app,
    slug: explicitSlug || fromHost.slug || inferred.slug || undefined,
    channel:
      explicitChannel === "loja" || explicitChannel === "catalogo"
        ? (explicitChannel as "catalogo" | "loja")
        : inferred.channel,
    host,
    surface,
  };
}

function buildRootPath(context: PwaContext): string {
  if (context.app === "mob") {
    // Host dedicado mob.leadcapture.online usa /; em app.* usa /mob
    if (context.host === "mob.leadcapture.online") return "/";
    return "/mob";
  }
  if (context.app === "affiliate") {
    // App global LeadCapture Parceiros (sem slug de marca)
    if (context.surface === "partners" || !context.slug) {
      return "/parceiros";
    }
    return `/central-afiliado/${encodeURIComponent(context.slug)}`;
  }
  if (context.app === "stock") {
    return context.slug ? `/app-estoque/${encodeURIComponent(context.slug)}` : "/app-estoque";
  }
  if (context.app === "admin") {
    return "/admin";
  }
  if (!context.slug) return "/";
  const channel = context.channel === "loja" ? "loja" : "catalogo";
  return `/${channel}/${encodeURIComponent(context.slug)}`;
}

function buildIconQuery(context: PwaContext): string {
  const params = new URLSearchParams();
  params.set("app", context.app);
  if (context.slug) params.set("slug", context.slug);
  if (context.surface) params.set("surface", context.surface);
  if (context.app === "store" && context.channel) params.set("channel", context.channel);
  return `?${params.toString()}`;
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
  const candidates = [
    path.resolve(process.cwd(), normalized),
    path.resolve(publicDir, normalized.replace(/^public\//, "")),
    path.resolve(process.cwd(), "uploads", path.basename(normalized)),
  ];
  for (const absolute of candidates) {
    if (!absolute.startsWith(process.cwd()) && !absolute.startsWith(publicDir)) continue;
    if (existsSync(absolute)) return absolute;
  }
  return null;
}

async function fetchRemoteBuffer(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function resolveAffiliateBrand(slug?: string) {
  const ref = String(slug || "").trim();
  if (!ref) return null;
  return queryOne<any>(
    `SELECT id, slug, name, logo_url, primary_color, secondary_color, slogan
     FROM brand_units
     WHERE LOWER(slug) = LOWER(?) OR LOWER(id) = LOWER(?)
     LIMIT 1`,
    [ref, ref],
  );
}

async function resolveBrandBySlug(slug?: string) {
  return resolveAffiliateBrand(slug);
}

async function resolveLogoBuffer(context: PwaContext): Promise<Buffer | null> {
  let iconSource: string | null = null;

  try {
    if (context.app === "affiliate" || context.app === "stock" || context.app === "admin") {
      if (context.slug) {
        const brand = await resolveBrandBySlug(context.slug);
        iconSource = pickBrandIcon(brand);
      }
    } else {
      const bundle = await storefrontService.resolvePublicStore({
        slug: context.slug,
        host: context.host,
      });
      iconSource = pickStoreIcon(bundle?.store);
    }
  } catch {
    iconSource = null;
  }

  if (iconSource) {
    const local = resolveLocalAsset(iconSource);
    if (local) {
      try {
        return readFileSync(local);
      } catch {
        /* fall through */
      }
    }
    if (/^https?:\/\//i.test(iconSource)) {
      const remote = await fetchRemoteBuffer(iconSource);
      if (remote) return remote;
    }
  }

  // Fallback: brand-mark ou logo.png
  if (existsSync(brandMarkPath)) {
    try {
      return readFileSync(brandMarkPath);
    } catch {
      /* */
    }
  }
  if (existsSync(fallbackLogoPath)) {
    try {
      return readFileSync(fallbackLogoPath);
    } catch {
      /* */
    }
  }
  return null;
}

function parseSize(raw: unknown): number {
  const n = Number(raw);
  if (n === 180 || n === 192 || n === 512) return n;
  return 192;
}

function sanitizeHexColor(input: string | undefined | null, fallback: string): string {
  const v = String(input || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

/**
 * Gera PNG PWA: logo centrado sobre fundo colorido por app.
 * maskable=1 aplica safe zone (~80% área útil).
 */
async function renderAppIcon(opts: {
  logo: Buffer | null;
  size: number;
  bg: string;
  maskable: boolean;
}): Promise<Buffer> {
  const { size, bg, maskable } = opts;
  const padRatio = maskable ? 0.22 : 0.14;
  const inner = Math.max(24, Math.round(size * (1 - padRatio * 2)));
  const left = Math.round((size - inner) / 2);
  const top = left;

  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  });

  if (!opts.logo) {
    return base.png().toBuffer();
  }

  let logoPng: Buffer;
  try {
    logoPng = await sharp(opts.logo)
      .resize(inner, inner, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    return base.png().toBuffer();
  }

  // Cantos arredondados leves no "any"; maskable fica quadrado (SO recorta)
  if (!maskable) {
    const radius = Math.round(size * 0.18);
    const roundedSvg = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${bg}"/>
      </svg>`,
    );
    const roundedBg = await sharp(roundedSvg).png().toBuffer();
    return sharp(roundedBg)
      .composite([{ input: logoPng, left, top }])
      .png()
      .toBuffer();
  }

  return base.composite([{ input: logoPng, left, top }]).png().toBuffer();
}

async function resolveThemeOverrides(context: PwaContext): Promise<{
  displayName: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  iconBg: string;
}> {
  const base =
    context.app === "affiliate" && (context.surface === "partners" || !context.slug)
      ? PARTNERS_THEME
      : APP_THEMES[context.app];
  let displayName = base.name;
  let shortName = base.shortName;
  let description = base.description;
  let themeColor = base.themeColor;
  let backgroundColor = base.backgroundColor;
  let iconBg = base.iconBg;

  try {
    if (context.app === "affiliate" && (context.surface === "partners" || !context.slug)) {
      displayName = PARTNERS_THEME.name;
      shortName = PARTNERS_THEME.shortName;
      description = PARTNERS_THEME.description;
    } else if (context.app === "affiliate" || context.app === "stock") {
      const brand = await resolveBrandBySlug(context.slug);
      if (brand) {
        const brandName = String(brand.name || context.slug || "").trim();
        if (context.app === "affiliate") {
          displayName = brandName ? `${brandName} · Afiliados` : base.name;
          shortName = brandName ? brandName.slice(0, 10) : base.shortName;
          description =
            String(brand.slogan || "").trim() ||
            `Programa de afiliados ${brandName}. Divulgue, acompanhe vendas e receba comissões.`;
        } else {
          displayName = brandName ? `${brandName} · Estoque` : base.name;
          shortName = "Estoque";
          description = `Estoque e inventário · ${brandName}`;
        }
        const primary = sanitizeHexColor(brand.primary_color, iconBg);
        const secondary = sanitizeHexColor(brand.secondary_color, themeColor);
        // Ícone: cor do app (identidade) — não troca pelo primary da marca (evita ícones errados)
        themeColor = secondary || themeColor;
        backgroundColor = primary || backgroundColor;
      }
    } else if (context.app === "store") {
      const bundle = await storefrontService.resolvePublicStore({
        slug: context.slug,
        host: context.host,
      });
      const store = bundle?.store as any;
      const brand = store?.brand || {};
      const theme = store?.theme || {};
      const brandName =
        String(brand.name || "").trim() ||
        String(store?.name || "").trim();
      if (brandName) {
        displayName = brandName;
        shortName = brandName.slice(0, 12);
      }
      description =
        String(brand.description || "").trim() ||
        String(brand.slogan || "").trim() ||
        description;
      themeColor = sanitizeHexColor(
        brand.secondary_color || theme.secondary_color || brand.primary_color,
        themeColor,
      );
      backgroundColor = sanitizeHexColor(
        brand.primary_color || theme.primary_color,
        backgroundColor,
      );
      // Catálogo: fundo do ícone usa primary da marca se existir (identidade da loja)
      iconBg = sanitizeHexColor(brand.primary_color || theme.primary_color, iconBg);
    } else if (context.app === "admin") {
      displayName = "LeadCapture";
      shortName = "LeadCapture";
    }
  } catch {
    // defaults
  }

  return { displayName, shortName, description, themeColor, backgroundColor, iconBg };
}

async function sendPwaIcon(
  res: Response,
  context: PwaContext,
  size: number,
  maskable: boolean,
): Promise<void> {
  try {
    const theme = await resolveThemeOverrides(context);
    const logo = await resolveLogoBuffer(context);
    const png = await renderAppIcon({
      logo,
      size,
      bg: theme.iconBg,
      maskable,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
    res.setHeader("X-Pwa-App", context.app);
    res.send(png);
  } catch (err: any) {
    console.error("[pwa/icon]", err?.message || err);
    if (existsSync(fallbackLogoPath)) {
      res.sendFile(fallbackLogoPath);
      return;
    }
    res.status(500).json({ error: "Falha ao gerar ícone" });
  }
}

function contextFromIconKey(key: string): PwaContext {
  const k = String(key || "").toLowerCase().trim();
  if (k === "partners" || k === "parceiros") {
    return { app: "affiliate", surface: "partners" };
  }
  if (k === "mob") return { app: "mob", surface: "mob" };
  if (k === "admin" || k === "stock" || k === "store" || k === "affiliate") {
    return { app: k };
  }
  return { app: "admin" };
}

router.get("/icon", async (req: Request, res: Response) => {
  const context = resolvePwaContext(req);
  const size = parseSize(req.query.size);
  const maskable = String(req.query.maskable || "") === "1" || String(req.query.maskable || "") === "true";
  await sendPwaIcon(res, context, size, maskable);
});

/**
 * Ícones por path estável (sem query string) — Chrome antigo / Android Go
 * validam melhor URLs do tipo /pwa/icons/admin/192.png.
 */
router.get("/icons/:key/:file", async (req: Request, res: Response) => {
  const context = contextFromIconKey(String(req.params.key || ""));
  const file = String(req.params.file || "").toLowerCase();
  const maskable = file.includes("maskable");
  const sizeMatch = file.match(/(\d{2,4})/);
  const size = parseSize(sizeMatch?.[1] || "192");
  await sendPwaIcon(res, context, size, maskable);
});

router.get("/manifest.webmanifest", async (req: Request, res: Response) => {
  const context = resolvePwaContext(req);
  const rootPath = buildRootPath(context);
  // Host dedicado de parceiros: scope cobre o domínio inteiro.
  // Em app.* com path /parceiros: limita ao prefixo para não misturar com admin.
  const hostIsPartners =
    context.host === "parceiros.leadcapture.online"
    || context.host === "afiliados.leadcapture.online"
    || /^(?:parceiros|afiliados)\./i.test(String(context.host || ""));
  const hostIsMob = context.host === "mob.leadcapture.online";
  const scope =
    context.app === "admin"
      ? "/"
      : context.app === "mob"
        ? (hostIsMob ? "/" : "/mob/")
        : context.app === "affiliate" && (context.surface === "partners" || hostIsPartners)
          ? (hostIsPartners ? "/" : "/parceiros/")
          : rootPath === "/"
            ? "/"
            : `${rootPath}/`;
  const iconQuery = buildIconQuery(context);
  const base =
    context.app === "affiliate" && (context.surface === "partners" || !context.slug)
      ? PARTNERS_THEME
      : APP_THEMES[context.app];
  const theme = await resolveThemeOverrides(context);

  const startUrl =
    context.app === "mob"
      ? (hostIsMob ? "/?source=pwa" : "/mob/app?source=pwa")
      : context.app === "affiliate" && (context.surface === "partners" || !context.slug)
        ? `/parceiros/painel?source=pwa`
        : context.app === "affiliate"
          ? `${rootPath}/painel?source=pwa`
          : context.app === "admin"
            ? "/assistente?source=pwa"
            : context.app === "stock"
              ? context.slug
                ? `${rootPath}/painel?source=pwa`
                : `${rootPath}/?source=pwa`
              : rootPath === "/"
                ? "/?source=pwa"
                : `${rootPath}?source=pwa`;

  // Path sem query é mais confiável em Chrome antigo / Android Go (tablets Multilaser etc.)
  // Com slug de marca, mantém query (ícone personalizado).
  const iconKey =
    context.app === "affiliate" && (context.surface === "partners" || !context.slug)
      ? "partners"
      : context.app === "mob"
        ? "mob"
        : context.app;
  const usePathIcons = !context.slug;
  const icon192 = usePathIcons
    ? `/pwa/icons/${iconKey}/192.png`
    : `/pwa/icon${iconQuery}&size=192`;
  const icon512 = usePathIcons
    ? `/pwa/icons/${iconKey}/512.png`
    : `/pwa/icon${iconQuery}&size=512`;
  const iconMaskable = usePathIcons
    ? `/pwa/icons/${iconKey}/512-maskable.png`
    : `/pwa/icon${iconQuery}&size=512&maskable=1`;

  const affiliateBase =
    context.app === "affiliate" && (context.surface === "partners" || !context.slug)
      ? "/parceiros/painel"
      : `${rootPath}/painel`;

  const shortcuts =
    context.app === "mob"
      ? [
          {
            name: "App do entregador",
            short_name: "App",
            url: hostIsMob ? "/" : "/mob/app",
            icons: [{ src: icon192, sizes: "192x192" }],
          },
          {
            name: "Rastreio",
            short_name: "Rastreio",
            url: "/rastreio",
            icons: [{ src: icon192, sizes: "192x192" }],
          },
        ]
      : context.app === "affiliate"
        ? [
            {
              name: "Programas",
              short_name: "Programas",
              url: context.surface === "partners" || !context.slug
                ? "/parceiros/painel"
                : `${rootPath}/painel`,
              icons: [{ src: icon192, sizes: "192x192" }],
            },
            {
              name: "Divulgar",
              short_name: "Divulgar",
              url: `${affiliateBase}/divulgacao`,
              icons: [{ src: icon192, sizes: "192x192" }],
            },
            {
              name: "Links",
              short_name: "Links",
              url: `${affiliateBase}/links`,
              icons: [{ src: icon192, sizes: "192x192" }],
            },
          ]
        : context.app === "admin"
          ? [
              {
                name: "Painel",
                short_name: "Painel",
                url: "/admin",
                icons: [{ src: icon192, sizes: "192x192" }],
              },
              {
                name: "Leads",
                short_name: "Leads",
                url: "/leads",
                icons: [{ src: icon192, sizes: "192x192" }],
              },
              {
                name: "Mensagens",
                short_name: "Mensagens",
                url: "/mensagens",
                icons: [{ src: icon192, sizes: "192x192" }],
              },
            ]
          : context.app === "stock"
            ? [
                {
                  name: "Visão geral do estoque",
                  short_name: "Início",
                  url: `${rootPath}/painel?view=overview`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
                {
                  name: "Expedição de pedidos",
                  short_name: "Expedição",
                  url: `${rootPath}/painel?view=expedition`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
                {
                  name: "Alertas de estoque",
                  short_name: "Alertas",
                  url: `${rootPath}/painel?view=alerts`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
                {
                  name: "Movimentações",
                  short_name: "Movimentos",
                  url: `${rootPath}/painel?view=movements`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
              ]
            : [
                {
                  name: "Catálogo",
                  short_name: "Catálogo",
                  url: rootPath,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
                {
                  name: "Acompanhar pedido",
                  short_name: "Pedido",
                  url: rootPath === "/" ? "/pedido" : `${rootPath}/pedido`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
                {
                  name: "Histórico",
                  short_name: "Histórico",
                  url: rootPath === "/" ? "/historico" : `${rootPath}/historico`,
                  icons: [{ src: icon192, sizes: "192x192" }],
                },
              ];

  // `id` precisa ser same-origin (path ou URL absoluta). Valores tipo "admin:/admin" são ignorados pelo browser.
  // Separar PWA de parceiros do PWA admin (ids distintos).
  const manifestId =
    context.app === "admin"
      ? "/admin?app=admin"
      : context.app === "mob"
        ? (hostIsMob ? "/?app=mob" : "/mob?app=mob")
        : context.app === "stock"
          ? context.slug
            ? `${rootPath}?app=stock`
            : `${rootPath}/?app=stock`
          : context.app === "affiliate" && (context.surface === "partners" || !context.slug)
            ? "/parceiros?app=affiliate&surface=partners"
            : context.app === "affiliate"
              ? `${rootPath}?app=affiliate`
              : rootPath === "/"
                ? "/?app=store"
                : `${rootPath}?app=store`;

  const manifest = {
    id: manifestId,
    name: theme.displayName,
    short_name: theme.shortName.slice(0, 12) || base.shortName,
    description: theme.description,
    lang: "pt-BR",
    dir: "ltr",
    start_url: startUrl,
    scope,
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "fullscreen"],
    orientation: context.app === "stock" ? "any" : "portrait-primary",
    background_color: theme.backgroundColor,
    theme_color: theme.themeColor,
    categories: base.categories,
    prefer_related_applications: false,
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconMaskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts,
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.send(JSON.stringify(manifest, null, 2));
});

/** Meta/diagnóstico: cores e nomes por app (útil para UI install banner) */
router.get("/identity", async (req: Request, res: Response) => {
  const context = resolvePwaContext(req);
  const theme = await resolveThemeOverrides(context);
  const iconQuery = buildIconQuery(context);
  res.json({
    app: context.app,
    slug: context.slug || null,
    name: theme.displayName,
    short_name: theme.shortName,
    theme_color: theme.themeColor,
    background_color: theme.backgroundColor,
    icon_bg: theme.iconBg,
    icon_url: `/pwa/icon${iconQuery}&size=192`,
  });
});

export default router;

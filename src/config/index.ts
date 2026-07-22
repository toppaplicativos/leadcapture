import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  nodeEnv: process.env.NODE_ENV || "development",
  authDir: process.env.AUTH_DIR || "./auth_whatsapp",

  // MySQL
  mysql: {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || "3306"),
    user: process.env.MYSQL_USER || process.env.DB_USER || "leadcapture",
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "@Milionarios2026",
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || "leadcapture",
    connectionLimit: 10,
  },

  // PostgreSQL / Supabase
  postgres: {
    connectionString:
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      "",
    host:
      process.env.POSTGRES_HOST ||
      process.env.SUPABASE_DB_HOST ||
      (process.env.SUPABASE_PROJECT_REF ? `db.${process.env.SUPABASE_PROJECT_REF}.supabase.co` : ""),
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    user: process.env.POSTGRES_USER || process.env.SUPABASE_DB_USER || "",
    password: process.env.POSTGRES_PASSWORD || process.env.SUPABASE_DB_PASSWORD || "",
    database: process.env.POSTGRES_DATABASE || "postgres",
    ssl: (process.env.POSTGRES_SSL || "true").toLowerCase() !== "false",
    /* Default conservador: Supabase session pooler costuma limitar a ~15 slots. */
    max: parseInt(process.env.POSTGRES_POOL_MAX || "8", 10),
  },

  // JWT
  jwtSecret: process.env.JWT_SECRET || "lead-system-secret-key-2026",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // RapidAPI Google Places V2
  rapidApi: {
    key: process.env.RAPIDAPI_KEY || "fcfd98d77fmsh189596de4efeaa8p1e7d71jsn6151ae5c92b0",
    host: process.env.RAPIDAPI_HOST || "google-map-places-new-v2.p.rapidapi.com",
    baseUrl: "https://google-map-places-new-v2.p.rapidapi.com",
  },

  creatives: {
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    videoModel: process.env.VEO_VIDEO_MODEL || "veo-3.1-generate-preview",
  },

  mercadoPago: {
    enabled: String(process.env.MERCADO_PAGO_ENABLED || "false").toLowerCase() === "true",
    environment: (String(process.env.MERCADO_PAGO_ENVIRONMENT || "test").toLowerCase() ===
    "production"
      ? "production"
      : "test") as "test" | "production",
    clientId: process.env.MERCADO_PAGO_CLIENT_ID || "",
    clientSecret: process.env.MERCADO_PAGO_CLIENT_SECRET || "",
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || "",
    redirectUri: process.env.MERCADO_PAGO_REDIRECT_URI || "",
    webhookUrl: process.env.MERCADO_PAGO_WEBHOOK_URL || "",
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET || "",
    defaultCurrency: process.env.MERCADO_PAGO_DEFAULT_CURRENCY || "BRL",
  },
};

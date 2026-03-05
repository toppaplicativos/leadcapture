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
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
    videoModel: process.env.VEO_VIDEO_MODEL || "veo-3.1-generate-preview",
  },
};

import path from "path";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".3gp"]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".3gp": "video/3gpp",
};

export function getFileExtension(filename: string): string {
  return path.extname(String(filename || "")).toLowerCase();
}

export function resolveUploadKind(mimetype: string, filename: string): "image" | "video" | null {
  const mime = String(mimetype || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

export function resolveUploadMime(mimetype: string, filename: string, kind: "image" | "video"): string {
  const mime = String(mimetype || "").toLowerCase().trim();
  if (mime.startsWith("image/") || mime.startsWith("video/")) return mime;
  const ext = getFileExtension(filename);
  return MIME_BY_EXT[ext] || (kind === "video" ? "video/mp4" : "image/jpeg");
}

export function shouldNormalizeImage(mimetype: string, filename: string): boolean {
  const mime = String(mimetype || "").toLowerCase().trim();
  const ext = getFileExtension(filename);
  if ([".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff"].includes(ext)) return true;
  if (!mime.startsWith("image/") && IMAGE_EXTENSIONS.has(ext)) return true;
  return false;
}
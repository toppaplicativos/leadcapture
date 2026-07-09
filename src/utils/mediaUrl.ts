/** Normaliza caminhos de mídia armazenados só como nome de arquivo. */
export function normalizeUploadUrl(url: unknown, folder = "product-images"): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/uploads/")) return raw;
  if (raw.startsWith("/")) return raw;
  if (raw.includes("/")) return raw.startsWith("/") ? raw : `/${raw}`;
  return `/uploads/${folder}/${raw}`;
}
import { supabase } from "@/integrations/supabase/client";
import { ApiError } from "./types";

export const PRODUCT_BUCKET = "product-images";
const SIGNED_URL_TTL = 60 * 60 * 8; // 8 hours

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return file.type.split("/").pop() ?? "jpg";
}

/** Uploads a product image and returns its storage path. */
export async function uploadProductImage(
  file: File,
  opts: { productSlug: string; kind?: "gallery" | "card" },
): Promise<string> {
  const kind = opts.kind ?? "gallery";
  const path = `${opts.productSlug}/${kind}-${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new ApiError(error.message);
  return path;
}

export async function deleteProductImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
  if (error) throw new ApiError(error.message);
}

/** Signed, time-limited URL for a stored image path. */
export async function getImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getImageUrls(paths: string[]): Promise<Record<string, string>> {
  const remote = paths.filter((p) => p && !p.startsWith("http"));
  const map: Record<string, string> = {};
  for (const p of paths.filter((p) => p.startsWith("http"))) map[p] = p;
  if (remote.length === 0) return map;
  const { data } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .createSignedUrls(remote, SIGNED_URL_TTL);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  }
  return map;
}

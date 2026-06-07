import { getSupabase, isSupabaseConfigured } from './supabase-client';

/**
 * Object storage for org logos.
 *
 * Two modes, mirroring the repository pattern:
 *  - Cloud (Supabase configured): upload to the public `org-logos` bucket at
 *    `{orgId}/logo-<ts>.png` and return the public CDN URL.
 *  - Local (IndexedDB dev/demo): no bucket exists, so fall back to a data URL
 *    (the legacy behaviour) — keeps dev fully offline.
 *
 * In BOTH modes the caller stores the returned string in
 * `Organization.logoDataUrl` and renders it directly as an <img src>. The
 * field therefore holds either a data URL (local) or a public URL (cloud);
 * no resolver is needed downstream.
 *
 * Scope note: LOGO ONLY. Device/service photos are intentionally deferred to
 * avoid storage bloat (product decision 2026-06-07).
 */

const BUCKET = 'org-logos';

/** Read a File as a data URL (used for the local fallback). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload an org logo. Returns the string to store in `logoDataUrl`:
 * a public URL (cloud) or a data URL (local fallback).
 */
export async function uploadOrgLogo(orgId: string, file: Blob): Promise<string> {
  const client = isSupabaseConfigured ? getSupabase() : null;

  // Local mode (or client init failed): keep the legacy data-URL behaviour.
  if (!client) {
    return fileToDataUrl(file as File);
  }

  // Stable-ish path with a cache-busting timestamp; old files are cleaned up
  // best-effort below so the bucket doesn't accumulate stale logos.
  const path = `${orgId}/logo-${Date.now()}.png`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: true,
  });
  if (error) throw new Error(error.message);

  // Remove any previous logos for this org (keep only the one just uploaded).
  await pruneOldLogos(orgId, path);

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Delete every logo object for an org (used on "remove logo"). */
export async function removeOrgLogo(orgId: string): Promise<void> {
  const client = isSupabaseConfigured ? getSupabase() : null;
  if (!client) return; // local mode: nothing to delete (data URL lived in the row)

  const { data: list, error } = await client.storage.from(BUCKET).list(orgId);
  if (error || !list?.length) return;
  const paths = list.map((f) => `${orgId}/${f.name}`);
  await client.storage.from(BUCKET).remove(paths);
}

/** Best-effort: delete all logos under `{orgId}/` except `keepPath`. */
async function pruneOldLogos(orgId: string, keepPath: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  try {
    const { data: list } = await client.storage.from(BUCKET).list(orgId);
    if (!list?.length) return;
    const stale = list
      .map((f) => `${orgId}/${f.name}`)
      .filter((p) => p !== keepPath);
    if (stale.length) await client.storage.from(BUCKET).remove(stale);
  } catch {
    // Pruning is non-critical; never block a successful upload on cleanup.
  }
}

// Server-side helpers shared between the sync route handlers.

import { readManifest, readSnapshot } from "@/lib/sync/blobStore";
import { sha256Hex } from "@/lib/sync/hash";
import type { ProfileSnapshot, RemoteManifest } from "@/lib/types";

export type LatestResult =
  | { ok: true; manifest: RemoteManifest; snapshot: ProfileSnapshot }
  | { ok: false; status: number; error: string };

export function isConfigError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "SYNC_NOT_CONFIGURED";
}

export async function getLatestSnapshot(
  profileId: string,
  code: string,
): Promise<LatestResult> {
  let manifest: RemoteManifest | null;
  try {
    manifest = await readManifest(profileId);
  } catch (err) {
    if (isConfigError(err))
      return { ok: false, status: 503, error: (err as Error).message };
    return { ok: false, status: 502, error: (err as Error).message };
  }
  if (!manifest)
    return { ok: false, status: 404, error: "No hay datos publicados aún." };
  const codeHash = await sha256Hex(code);
  if (codeHash !== manifest.codeHash) {
    return { ok: false, status: 401, error: "Código familiar incorrecto." };
  }
  try {
    const snapshot = await readSnapshot(profileId, manifest.version);
    return { ok: true, manifest, snapshot };
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message };
  }
}

// Server-side helpers around `@vercel/blob`. Encapsulate path conventions
// so the route handlers stay focused on validation and policy.
//
// Layout in the Blob store:
//   perfiles/<profileId>/manifest.json   ← lightweight metadata (RemoteManifest)
//   perfiles/<profileId>/v<n>.json       ← snapshot payload (ProfileSnapshot)

import { head, list, put } from "@vercel/blob";
import type { ProfileSnapshot, RemoteManifest } from "@/lib/types";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/** Throws a tagged error if the server is not configured for sync. */
function requireToken(): string {
  if (!TOKEN) {
    const err = new Error("Sync no está configurado en el servidor.") as Error & {
      code: string;
    };
    err.code = "SYNC_NOT_CONFIGURED";
    throw err;
  }
  return TOKEN;
}

const manifestPath = (profileId: string) =>
  `perfiles/${profileId}/manifest.json`;
const snapshotPath = (profileId: string, version: number) =>
  `perfiles/${profileId}/v${version}.json`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fallo al leer ${url}: ${res.status}`);
  return (await res.json()) as T;
}

/** Returns the current manifest for a profile, or `null` if none exists. */
export async function readManifest(
  profileId: string,
): Promise<RemoteManifest | null> {
  const token = requireToken();
  try {
    const meta = await head(manifestPath(profileId), { token });
    return await fetchJson<RemoteManifest>(meta.url);
  } catch (err) {
    // `head` throws BlobNotFoundError when the object doesn't exist.
    const e = err as { code?: string; name?: string; message?: string };
    if (
      e.code === "BlobNotFoundError" ||
      e.code === "not_found" ||
      e.name === "BlobNotFoundError" ||
      (e.message && e.message.toLowerCase().includes("not exist")) ||
      (e.message && e.message.toLowerCase().includes("not found"))
    ) {
      return null;
    }
    throw err;
  }
}

/** Reads the snapshot payload for a given version. */
export async function readSnapshot(
  profileId: string,
  version: number,
): Promise<ProfileSnapshot> {
  const token = requireToken();
  const meta = await head(snapshotPath(profileId, version), { token });
  return await fetchJson<ProfileSnapshot>(meta.url);
}

/** Writes both the snapshot payload and the manifest. */
export async function writeSnapshotAndManifest(
  profileId: string,
  snapshot: ProfileSnapshot,
  manifest: RemoteManifest,
): Promise<void> {
  const token = requireToken();
  const snapshotBody = JSON.stringify(snapshot);
  const manifestBody = JSON.stringify(manifest);

  // Upload snapshot first so the manifest never points to a missing file.
  await put(snapshotPath(profileId, manifest.version), snapshotBody, {
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    token,
  } as Parameters<typeof put>[2]);
  await put(manifestPath(profileId), manifestBody, {
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    token,
  } as Parameters<typeof put>[2]);
}

/** Lists snapshot versions stored for a profile (newest first). */
export async function listSnapshotVersions(profileId: string): Promise<number[]> {
  const token = requireToken();
  const prefix = `perfiles/${profileId}/v`;
  const result = await list({ prefix, token });
  const versions: number[] = [];
  for (const b of result.blobs) {
    const m = b.pathname.match(/\/v(\d+)\.json$/);
    if (m) versions.push(Number(m[1]));
  }
  return versions.sort((a, b) => b - a);
}

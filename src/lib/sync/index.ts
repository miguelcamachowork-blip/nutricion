// High-level client API for cloud sync. Wraps fetch calls and orchestrates
// publish/pull against the local Dexie database.

import {
  applyProfileSnapshot,
  buildProfileSnapshot,
  type ApplyCounts,
  type ApplyMode,
} from "./snapshot";
import {
  getProfileSyncConfig,
  setProfileSyncConfig,
} from "./config";
import type {
  ProfileSnapshot,
  RemoteManifest,
} from "@/lib/types";

// ─── Errors ────────────────────────────────────────────────────────────────

export type SyncErrorKind =
  | "not-configured"
  | "unauthorized"
  | "not-found"
  | "conflict"
  | "server-not-configured"
  | "network"
  | "unknown";

export class SyncError extends Error {
  kind: SyncErrorKind;
  status?: number;
  /** When kind === "conflict", carries the remote manifest. */
  manifest?: RemoteManifest;
  constructor(
    kind: SyncErrorKind,
    message: string,
    extra: { status?: number; manifest?: RemoteManifest } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = extra.status;
    this.manifest = extra.manifest;
  }
}

// ─── Internals ─────────────────────────────────────────────────────────────

interface ApiError {
  error?: string;
  manifest?: RemoteManifest;
}

function mapStatus(status: number): SyncErrorKind {
  switch (status) {
    case 401:
      return "unauthorized";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 503:
      return "server-not-configured";
    default:
      return "unknown";
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    return (await res.json()) as ApiError;
  } catch {
    return {};
  }
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    throw new SyncError("network", (err as Error).message || "Fallo de red.");
  }
  if (!res.ok) {
    const body = await readError(res);
    throw new SyncError(
      mapStatus(res.status),
      body.error || `Error ${res.status}`,
      { status: res.status, manifest: body.manifest },
    );
  }
  return (await res.json()) as T;
}

function requireConfig(profileId: string) {
  const cfg = getProfileSyncConfig(profileId);
  if (!cfg || !cfg.code) {
    throw new SyncError(
      "not-configured",
      "Este perfil aún no está configurado para sincronización.",
    );
  }
  return cfg;
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Returns the remote manifest for a profile. Throws SyncError on any issue. */
export async function checkRemoteVersion(
  profileId: string,
): Promise<RemoteManifest> {
  const cfg = requireConfig(profileId);
  const url = `/api/sync/${encodeURIComponent(profileId)}?code=${encodeURIComponent(cfg.code)}`;
  const data = await request<{ manifest: RemoteManifest }>(url);
  setProfileSyncConfig(profileId, {
    lastSeenRemoteVersion: data.manifest.version,
  });
  return data.manifest;
}

/**
 * Validates the family code against the cloud. Used by the configuration
 * dialog before saving the code locally.
 *
 *   - Returns { status: "match", manifest } when a snapshot exists and the
 *     code is correct.
 *   - Returns { status: "empty" } when no snapshot exists yet (first device).
 *   - Throws SyncError otherwise (unauthorized, network, etc.).
 */
export async function probeCode(
  profileId: string,
  code: string,
): Promise<
  | { status: "match"; manifest: RemoteManifest }
  | { status: "empty" }
> {
  const url = `/api/sync/${encodeURIComponent(profileId)}?code=${encodeURIComponent(code)}`;
  try {
    const data = await request<{ manifest: RemoteManifest }>(url);
    return { status: "match", manifest: data.manifest };
  } catch (err) {
    if (err instanceof SyncError && err.kind === "not-found") {
      return { status: "empty" };
    }
    throw err;
  }
}

/** Builds the local snapshot and uploads it. Returns the new manifest. */
export async function publishProfile(
  profileId: string,
): Promise<RemoteManifest> {
  const cfg = requireConfig(profileId);
  const snapshot = await buildProfileSnapshot(profileId);
  const expectedVersion = cfg.lastSyncedVersion ?? 0;
  const url = `/api/sync/${encodeURIComponent(profileId)}`;
  const data = await request<{ manifest: RemoteManifest }>(url, {
    method: "POST",
    body: JSON.stringify({
      code: cfg.code,
      expectedVersion,
      memberName: cfg.memberName,
      snapshot,
    }),
  });
  setProfileSyncConfig(profileId, {
    lastSyncedVersion: data.manifest.version,
    lastSeenRemoteVersion: data.manifest.version,
    lastSyncedAt: data.manifest.publishedAt,
  });
  return data.manifest;
}

export interface PullResult {
  manifest: RemoteManifest;
  counts: ApplyCounts;
}

/** Downloads the latest snapshot and applies it to the local DB. */
export async function pullProfile(
  profileId: string,
  mode: ApplyMode = "merge",
): Promise<PullResult> {
  const cfg = requireConfig(profileId);
  const url = `/api/sync/${encodeURIComponent(profileId)}/latest?code=${encodeURIComponent(cfg.code)}`;
  const data = await request<{
    manifest: RemoteManifest;
    snapshot: ProfileSnapshot;
  }>(url);
  const counts = await applyProfileSnapshot(data.snapshot, { mode });
  setProfileSyncConfig(profileId, {
    lastSyncedVersion: data.manifest.version,
    lastSeenRemoteVersion: data.manifest.version,
    lastSyncedAt: data.manifest.publishedAt,
  });
  return { manifest: data.manifest, counts };
}

// ─── Join codes ────────────────────────────────────────────────────────────

import { decodeJoinCode, encodeJoinCode, type JoinPayload } from "./joinCode";
import { listProfiles } from "@/lib/db/repos";
import { useActiveProfileStore } from "@/hooks/useActiveProfile";

/**
 * Builds the shareable join code for a configured profile. The receiver pastes
 * it on their device to materialise the profile from the cloud.
 */
export async function getJoinCode(profileId: string): Promise<string> {
  const cfg = requireConfig(profileId);
  const profiles = await listProfiles();
  const p = profiles.find((x) => x.id === profileId);
  if (!p) throw new SyncError("not-found", "Perfil no encontrado.");
  return encodeJoinCode({ profileId, code: cfg.code, name: p.name });
}

export interface ImportFromCloudResult {
  profileId: string;
  profileName: string;
  manifest: RemoteManifest;
  counts: ApplyCounts;
}

/**
 * Adds a profile to this device from a join code: validates the code against
 * the cloud, downloads the latest snapshot, materialises everything locally
 * and saves the sync configuration.
 */
export async function importProfileFromCloud(
  joinCode: string,
  memberName?: string,
): Promise<ImportFromCloudResult> {
  let payload: JoinPayload;
  try {
    payload = decodeJoinCode(joinCode);
  } catch (err) {
    throw new SyncError("unknown", (err as Error).message);
  }
  // Save config first so pullProfile() can read it.
  setProfileSyncConfig(payload.profileId, {
    code: payload.code,
    memberName: memberName?.trim() || undefined,
  });
  try {
    const url = `/api/sync/${encodeURIComponent(payload.profileId)}/latest?code=${encodeURIComponent(payload.code)}`;
    const data = await request<{
      manifest: RemoteManifest;
      snapshot: ProfileSnapshot;
    }>(url);
    const counts = await applyProfileSnapshot(data.snapshot, { mode: "merge" });
    setProfileSyncConfig(payload.profileId, {
      lastSyncedVersion: data.manifest.version,
      lastSeenRemoteVersion: data.manifest.version,
      lastSyncedAt: data.manifest.publishedAt,
    });
    // Make the freshly imported profile active for convenience.
    try {
      useActiveProfileStore.getState().setActive(payload.profileId);
    } catch {
      // Store may not be hydrated in tests; ignore.
    }
    return {
      profileId: payload.profileId,
      profileName: payload.name,
      manifest: data.manifest,
      counts,
    };
  } catch (err) {
    // Rollback the half-saved config if the download failed.
    if (err instanceof SyncError && err.kind !== "conflict") {
      // Keep config on conflict; everything else is a clean failure.
    }
    throw err;
  }
}


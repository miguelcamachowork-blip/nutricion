// Per-device sync configuration. Stored in localStorage so each member
// only types the family code once on each of their devices.

const STORAGE_KEY = "nutricion-mcz:sync";

export interface ProfileSyncConfig {
  /** The family code in plain text (used to compute the hash on the wire). */
  code: string;
  /** Optional human-friendly editor name (e.g. "Juan", "María"). */
  memberName?: string;
  /** Last snapshot version this device successfully published or pulled. */
  lastSyncedVersion?: number;
  /** Last manifest version observed via the watcher. */
  lastSeenRemoteVersion?: number;
  /** ISO timestamp of the last successful sync. */
  lastSyncedAt?: string;
}

interface SyncStorage {
  byProfile: Record<string, ProfileSyncConfig>;
}

function load(): SyncStorage {
  if (typeof window === "undefined") return { byProfile: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byProfile: {} };
    const parsed = JSON.parse(raw) as SyncStorage;
    return parsed && typeof parsed === "object" && parsed.byProfile
      ? parsed
      : { byProfile: {} };
  } catch {
    return { byProfile: {} };
  }
}

function save(state: SyncStorage): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getProfileSyncConfig(
  profileId: string,
): ProfileSyncConfig | null {
  return load().byProfile[profileId] ?? null;
}

export function setProfileSyncConfig(
  profileId: string,
  patch: Partial<ProfileSyncConfig>,
): ProfileSyncConfig {
  const state = load();
  const prev = state.byProfile[profileId] ?? { code: "" };
  const next: ProfileSyncConfig = { ...prev, ...patch };
  state.byProfile[profileId] = next;
  save(state);
  return next;
}

export function clearProfileSyncConfig(profileId: string): void {
  const state = load();
  delete state.byProfile[profileId];
  save(state);
}

export function listConfiguredProfileIds(): string[] {
  return Object.keys(load().byProfile);
}

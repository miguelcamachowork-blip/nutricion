"use client";

/**
 * Wrapper around `navigator.storage` to make IndexedDB durable
 * (especially important on Safari iOS, which evicts non-persistent
 * storage after ~7 days of inactivity).
 */

export interface StorageStatus {
  /** True when the browser has granted persistent storage. */
  persisted: boolean;
  /** True if the browser supports `navigator.storage`. */
  supported: boolean;
  /** Bytes currently used by the origin, when available. */
  usage?: number;
  /** Bytes available to the origin, when available. */
  quota?: number;
}

function hasStorageAPI(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined"
  );
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!hasStorageAPI()) return { persisted: false, supported: false };
  const storage = navigator.storage;
  let persisted = false;
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    if (typeof storage.persisted === "function") {
      persisted = await storage.persisted();
    }
    if (typeof storage.estimate === "function") {
      const est = await storage.estimate();
      usage = est.usage;
      quota = est.quota;
    }
  } catch {
    /* ignore */
  }
  return { persisted, supported: true, usage, quota };
}

/**
 * Asks the browser to mark this origin's storage as persistent.
 * Safe to call repeatedly; returns the resulting state.
 *
 * Browsers grant or deny based on heuristics (PWA installed, bookmarked,
 * permissions previously granted, etc.). This call MUST be triggered
 * inside a user gesture in some browsers, so we expose it as a function
 * that callers can invoke from a click handler if needed.
 */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  if (!hasStorageAPI()) return { persisted: false, supported: false };
  const storage = navigator.storage;
  try {
    if (typeof storage.persist === "function") {
      await storage.persist();
    }
  } catch {
    /* ignore — return current status anyway */
  }
  return getStorageStatus();
}

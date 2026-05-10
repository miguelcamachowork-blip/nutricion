"use client";

import { useEffect, useState } from "react";
import {
  checkRemoteVersion,
  SyncError,
} from "@/lib/sync";
import { getProfileSyncConfig } from "@/lib/sync/config";

const POLL_MS = 5 * 60 * 1000; // 5 minutes

export interface SyncStatus {
  /** Whether the active profile has cloud sync configured. */
  configured: boolean;
  /** True when the remote manifest version is greater than the local one. */
  hasUpdate: boolean;
  /** The latest remote version observed, or null if unknown. */
  remoteVersion: number | null;
}

/**
 * Polls the remote manifest of the given profile to surface a "new version
 * available" indicator. Polls on mount, on `visibilitychange` (when the tab
 * comes back into focus) and every 5 minutes while visible.
 *
 * Silently no-ops when the profile is not configured for sync.
 */
export function useRemoteVersionWatcher(
  profileId: string | null,
): SyncStatus {
  const [state, setState] = useState<SyncStatus>({
    configured: false,
    hasUpdate: false,
    remoteVersion: null,
  });

  useEffect(() => {
    if (!profileId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ configured: false, hasUpdate: false, remoteVersion: null });
      return;
    }
    const cfg = getProfileSyncConfig(profileId);
    if (!cfg) {
      setState({ configured: false, hasUpdate: false, remoteVersion: null });
      return;
    }
    setState((s) => ({ ...s, configured: true }));

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function check() {
      try {
        const m = await checkRemoteVersion(profileId!);
        if (cancelled) return;
        const local = getProfileSyncConfig(profileId!)?.lastSyncedVersion ?? 0;
        setState({
          configured: true,
          hasUpdate: m.version > local,
          remoteVersion: m.version,
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof SyncError && err.kind === "not-found") {
          setState({ configured: true, hasUpdate: false, remoteVersion: null });
        }
        // Other errors (network, unauthorized, server-not-configured) are
        // intentionally silent here — the watcher is a hint, not a primary UI.
      }
    }

    void check();

    function onVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisibility);
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearInterval(timer);
    };
  }, [profileId]);

  return state;
}

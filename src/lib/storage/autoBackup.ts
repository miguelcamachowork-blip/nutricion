"use client";

/**
 * Rolling automatic backups stored inside IndexedDB.
 *
 *   - Up to MAX_BACKUPS entries are kept, oldest pruned.
 *   - One snapshot per BACKUP_INTERVAL_MS by default (24h), based on the
 *     newest existing entry's timestamp.
 *   - Identical payloads (by string equality) are NOT duplicated; the most
 *     recent entry is touched instead.
 */

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB, type AutoBackupRow } from "@/lib/db/database";
import {
  assertFullBackup,
  exportAllData,
  importAllData,
  type FullBackup,
  type ImportMode,
  type BackupCounts,
} from "@/lib/db/repos";
import { uid } from "@/lib/utils";

export const MAX_BACKUPS = 7;
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

export interface AutoBackupSummary {
  id: string;
  createdAt: number;
  size: number;
}

function summarize(row: AutoBackupRow): AutoBackupSummary {
  return { id: row.id, createdAt: row.createdAt, size: row.size };
}

export async function listAutoBackups(): Promise<AutoBackupSummary[]> {
  const rows = await getDB().backups.orderBy("createdAt").reverse().toArray();
  return rows.map(summarize);
}

async function newestBackup(): Promise<AutoBackupRow | undefined> {
  return getDB().backups.orderBy("createdAt").reverse().first();
}

export async function lastBackupAt(): Promise<number | null> {
  const row = await newestBackup();
  return row?.createdAt ?? null;
}

/** Force a backup right now (used by the manual button). */
export async function createAutoBackupNow(): Promise<AutoBackupSummary> {
  const data = await exportAllData();
  const payload = JSON.stringify(data);
  const newest = await newestBackup();
  const db = getDB();
  if (newest && newest.payload === payload) {
    // Nothing changed — bump the timestamp instead of duplicating.
    await db.backups.update(newest.id, { createdAt: Date.now() });
    const refreshed = (await db.backups.get(newest.id))!;
    return summarize(refreshed);
  }
  const row: AutoBackupRow = {
    id: uid(),
    createdAt: Date.now(),
    payload,
    size: payload.length,
  };
  await db.transaction("rw", db.backups, async () => {
    await db.backups.add(row);
    const all = await db.backups.orderBy("createdAt").reverse().toArray();
    const stale = all.slice(MAX_BACKUPS);
    if (stale.length) await db.backups.bulkDelete(stale.map((r) => r.id));
  });
  return summarize(row);
}

/** Run a backup if the newest entry is older than `intervalMs`. */
export async function createAutoBackupIfDue(
  intervalMs: number = BACKUP_INTERVAL_MS,
): Promise<AutoBackupSummary | null> {
  const newest = await newestBackup();
  if (newest && Date.now() - newest.createdAt < intervalMs) return null;
  return createAutoBackupNow();
}

export async function deleteAutoBackup(id: string): Promise<void> {
  await getDB().backups.delete(id);
}

export async function getAutoBackupPayload(id: string): Promise<FullBackup | null> {
  const row = await getDB().backups.get(id);
  if (!row) return null;
  const parsed = JSON.parse(row.payload) as unknown;
  assertFullBackup(parsed);
  return parsed;
}

export async function restoreAutoBackup(
  id: string,
  mode: ImportMode = "replace",
): Promise<BackupCounts> {
  const data = await getAutoBackupPayload(id);
  if (!data) throw new Error("El respaldo no existe.");
  return importAllData(data, { mode });
}

/** React hook: triggers `createAutoBackupIfDue` on mount and once per hour. */
export function useAutoBackup(intervalMs: number = BACKUP_INTERVAL_MS): void {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void createAutoBackupIfDue(intervalMs).catch(() => {});
    };
    run();
    // Re-check periodically — cheaper than waking exactly at the boundary.
    const id = window.setInterval(run, Math.min(intervalMs, 60 * 60 * 1000));
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
}

/** Live list of backup summaries for UI components. */
export function useAutoBackups(): AutoBackupSummary[] | undefined {
  return useLiveQuery(() => listAutoBackups(), []);
}

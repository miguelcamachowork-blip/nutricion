"use client";

/**
 * Cross-browser helpers to save and open backup files.
 *
 *   saveBackupFile  → File System Access API (Chrome/Edge desktop, lets the
 *                     user pick a folder) → Web Share API (iOS/Safari, opens
 *                     the share sheet with AirDrop / Files / Mail) → plain
 *                     `<a download>` fallback.
 *
 *   openBackupFile  → File System Access API when available, otherwise a
 *                     hidden `<input type="file">`. On iOS this opens the
 *                     Files app and iCloud Drive.
 */

export type SaveResult =
  | { kind: "saved-to-folder"; name: string }
  | { kind: "shared" }
  | { kind: "downloaded"; name: string }
  | { kind: "cancelled" };

export interface SaveOptions {
  suggestedName: string;
  /** Friendly description shown in the picker dialog. */
  description?: string;
}

const JSON_MIME = "application/json";

interface FsAccessWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (opts: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

function fsAccess(): FsAccessWindow {
  return typeof window !== "undefined" ? (window as unknown as FsAccessWindow) : {};
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Write `blob` to a user-chosen location. */
export async function saveBackupFile(
  blob: Blob,
  opts: SaveOptions,
): Promise<SaveResult> {
  const { suggestedName, description = "Respaldo Nutrición MCZ" } = opts;

  // 1) File System Access API → user picks folder + filename.
  const fs = fsAccess();
  if (typeof fs.showSaveFilePicker === "function") {
    try {
      const handle = await fs.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [JSON_MIME]: [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { kind: "saved-to-folder", name: handle.name };
    } catch (err) {
      if (isAbortError(err)) return { kind: "cancelled" };
      // fall through to next strategy
    }
  }

  // 2) Web Share API (iOS Safari / mobile) → AirDrop, Files, Mail…
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const file = new File([blob], suggestedName, { type: JSON_MIME });
      const shareData: ShareData = { files: [file], title: suggestedName };
      const canShare = navigator.canShare?.(shareData) ?? true;
      if (canShare) {
        await navigator.share(shareData);
        return { kind: "shared" };
      }
    } catch (err) {
      if (isAbortError(err)) return { kind: "cancelled" };
      // fall through to download
    }
  }

  // 3) Universal fallback — anchor download (goes to Downloads folder).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { kind: "downloaded", name: suggestedName };
}

/** Prompt the user to pick a JSON file. Returns `null` if cancelled. */
export async function openBackupFile(): Promise<File | null> {
  const fs = fsAccess();
  if (typeof fs.showOpenFilePicker === "function") {
    try {
      const [handle] = await fs.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Respaldo Nutrición MCZ",
            accept: { [JSON_MIME]: [".json"] },
          },
        ],
        excludeAcceptAllOption: false,
      });
      return await handle.getFile();
    } catch (err) {
      if (isAbortError(err)) return null;
      // fall through to input
    }
  }

  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = JSON_MIME + ",.json";
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });
    // `cancel` event is supported in modern browsers; otherwise the promise
    // simply stays pending until the user does pick a file.
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export function suggestBackupFilename(profileName?: string | null): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const slug = (profileName ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const tag = slug ? `-${slug}` : "";
  return `nutricion-mcz${tag}-${yyyy}-${mm}-${dd}-${hh}${mi}.json`;
}

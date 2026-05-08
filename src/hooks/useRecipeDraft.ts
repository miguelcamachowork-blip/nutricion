"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearRecipeDraft,
  getRecipeDraft,
  saveRecipeDraft,
} from "@/lib/db/repos";
import type { RecipeItem } from "@/lib/types";

export interface UseRecipeDraftOptions {
  profileId: string;
  mealId: string;
  /** ISO date `YYYY-MM-DD` for scheduled recipes; `null` for the per-meal
   *  template editor (no calendarised target). */
  date: string | null;
  /** Items as currently persisted (recipe template / scheduled recipe). */
  baselineItems: RecipeItem[];
  /** Optional initial title/preparation (used when editing an AI-created
   *  scheduled recipe). */
  baselineTitle?: string;
  baselinePreparation?: string[];
  /** Debounce delay in milliseconds. Defaults to 500 ms. */
  debounceMs?: number;
}

export interface UseRecipeDraftResult {
  /** Current items (may originate from a draft). */
  items: RecipeItem[];
  setItems: React.Dispatch<React.SetStateAction<RecipeItem[]>>;
  title: string | undefined;
  setTitle: (t: string | undefined) => void;
  preparation: string[] | undefined;
  setPreparation: (s: string[] | undefined) => void;
  /** True once the initial load (draft lookup) has finished. */
  ready: boolean;
  /** True when a saved draft was loaded instead of the baseline. */
  loadedFromDraft: boolean;
  /** Timestamp of the draft currently in storage (or `null` if none). */
  draftUpdatedAt: number | null;
  /** Discards the draft and resets state to the baseline. */
  discardDraft: () => Promise<void>;
  /** Clears the draft from storage (call after a successful real save). */
  clearAfterSave: () => Promise<void>;
}

/**
 * Persists in-progress recipe edits to IndexedDB so navigating away (or
 * reloading the page) doesn't lose them. There is at most one draft per
 * destination `(profileId, mealId, date|"template")`.
 *
 * The hook performs a debounced write whenever `items`, `title`, or
 * `preparation` change. The first render performs an asynchronous lookup; the
 * baseline is shown until `ready` flips to `true`.
 */
export function useRecipeDraft(
  opts: UseRecipeDraftOptions,
): UseRecipeDraftResult {
  const {
    profileId,
    mealId,
    date,
    baselineItems,
    baselineTitle,
    baselinePreparation,
    debounceMs = 500,
  } = opts;

  const [items, setItems] = useState<RecipeItem[]>(baselineItems);
  const [title, setTitle] = useState<string | undefined>(baselineTitle);
  const [preparation, setPreparation] = useState<string[] | undefined>(
    baselinePreparation,
  );
  const [ready, setReady] = useState(false);
  const [loadedFromDraft, setLoadedFromDraft] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<number | null>(null);

  // Skip writing the draft on the very first effect run (would otherwise
  // overwrite a freshly-loaded draft with the baseline).
  const skipNextWrite = useRef(true);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    skipNextWrite.current = true;
    // Reset `ready` synchronously when the destination changes so the
    // banner (and any consumer waiting on `ready`) doesn't flash stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    void (async () => {
      const draft = await getRecipeDraft(profileId, mealId, date);
      if (cancelled) return;
      if (draft) {
        setItems(draft.items);
        if (draft.title !== undefined) setTitle(draft.title);
        if (draft.preparation !== undefined) setPreparation(draft.preparation);
        setLoadedFromDraft(true);
        setDraftUpdatedAt(draft.updatedAt);
      } else {
        setItems(baselineItems);
        setTitle(baselineTitle);
        setPreparation(baselinePreparation);
        setLoadedFromDraft(false);
        setDraftUpdatedAt(null);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // We deliberately only re-run on destination changes, not on baseline
    // identity changes (the baseline is recomputed on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, mealId, date]);

  // Debounced write on every change after the initial load.
  useEffect(() => {
    if (!ready) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      void saveRecipeDraft({
        profileId,
        mealId,
        date,
        items,
        title,
        preparation,
      }).then(() => setDraftUpdatedAt(Date.now()));
    }, debounceMs);
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
    };
  }, [
    ready,
    profileId,
    mealId,
    date,
    items,
    title,
    preparation,
    debounceMs,
  ]);

  const discardDraft = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    skipNextWrite.current = true;
    await clearRecipeDraft(profileId, mealId, date);
    setItems(baselineItems);
    setTitle(baselineTitle);
    setPreparation(baselinePreparation);
    setLoadedFromDraft(false);
    setDraftUpdatedAt(null);
  }, [profileId, mealId, date, baselineItems, baselineTitle, baselinePreparation]);

  const clearAfterSave = useCallback(async () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    await clearRecipeDraft(profileId, mealId, date);
    setLoadedFromDraft(false);
    setDraftUpdatedAt(null);
  }, [profileId, mealId, date]);

  return {
    items,
    setItems,
    title,
    setTitle,
    preparation,
    setPreparation,
    ready,
    loadedFromDraft,
    draftUpdatedAt,
    discardDraft,
    clearAfterSave,
  };
}

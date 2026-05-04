"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

const STORAGE_KEY = "nutricion-mcz:activeProfileId";

interface ActiveProfileStore {
  activeProfileId: string | null;
  setActive: (id: string | null) => void;
}

export const useActiveProfileStore = create<ActiveProfileStore>((set) => ({
  activeProfileId: null,
  setActive: (id) => {
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
    set({ activeProfileId: id });
  },
}));

/** Hydrates the active profile id from localStorage on mount. */
export function useActiveProfileHydration(): boolean {
  const setActive = useActiveProfileStore((s) => s.setActive);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    if (stored) setActive(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [setActive]);
  return hydrated;
}

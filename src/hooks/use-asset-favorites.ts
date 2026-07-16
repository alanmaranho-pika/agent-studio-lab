import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "v2:asset-favorites";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useAssetFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(read());
    };
    const onLocal = () => setFavorites(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("v2:asset-favorites-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("v2:asset-favorites-changed", onLocal);
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    setFavorites(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("v2:asset-favorites-changed"));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const set = new Set(favorites);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      persist(Array.from(set));
    },
    [favorites, persist],
  );

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  );

  return { favorites, toggle, isFavorite };
}

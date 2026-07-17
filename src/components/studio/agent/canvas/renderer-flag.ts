// Runtime toggle between the DOM (GenerativeCard) and canvas (Pixi) card
// renderers. Precedence: ?renderer=canvas|dom query param → localStorage →
// default "dom". SSR-guarded — always reports "dom" on the server.

import { useSyncExternalStore } from "react";

export type CardRenderer = "dom" | "canvas";

const STORAGE_KEY = "pika:renderer";
const CHANGE_EVENT = "pika:renderer-change";

function resolveRenderer(): CardRenderer {
  if (typeof window === "undefined") return "dom";
  const param = new URLSearchParams(window.location.search).get("renderer");
  if (param === "canvas" || param === "dom") return param;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "canvas" || stored === "dom") return stored;
  } catch {
    // localStorage unavailable (private mode) — fall through
  }
  // Canvas (WebGL) is the default renderer. Opt out per-browser with
  // ?renderer=dom, localStorage "pika:renderer"="dom", or __toggleRenderer().
  return "canvas";
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Reactive renderer flag — re-renders live when toggleRenderer() fires. */
export function useCanvasRenderer(): boolean {
  const renderer = useSyncExternalStore(subscribe, resolveRenderer, () => "dom" as const);
  return renderer === "canvas";
}

/** Flip the persisted renderer (query param still wins while present).
 * Exposed on window in dev for quick console flipping. */
export function toggleRenderer(): CardRenderer {
  const next: CardRenderer = resolveRenderer() === "canvas" ? "dom" : "canvas";
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__toggleRenderer = toggleRenderer;
}

// Module-level cache that returns a stable signed URL for a given asset id.
//
// Background: project / library queries periodically refetch (polling while a
// run is pending). Each refetch re-signs Supabase storage URLs, so the
// returned `url` string changes on every poll — even though it points at the
// exact same object. When that URL is plugged straight into a <video> or <img>
// `src`, the browser sees a new URL and tears down + reloads the media,
// causing visible flicker / "the video keeps refreshing in the output column
// and timeline".
//
// Signed URLs use a 7-day TTL (see SIGNED_URL_TTL in projects.functions.ts),
// so reusing the first URL we see for the lifetime of the tab is safe and
// keeps media elements stable across refetches.

const cache = new Map<string, string>();

export function stableAssetUrl(
  id: string | undefined | null,
  url: string | undefined | null,
): string {
  if (!id) return url ?? "";
  const existing = cache.get(id);
  if (existing) return existing;
  if (url) {
    cache.set(id, url);
    return url;
  }
  return "";
}

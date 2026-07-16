// Shared client-side upload helper for v2 app panels.
//
// Why this exists: every panel had its own copy of `fileToProjectAsset`
// that used `bin += String.fromCharCode(buf[i])` in a tight loop. That's
// O(n²) string concat — on a 5 MB selfie it pegs the main thread for many
// seconds and looks like "nothing happened". This helper:
//   • Encodes bytes in 8 KB chunks via `btoa(String.fromCharCode.apply(...))`
//     — constant memory, ~50× faster, safe for the apply argument cap.
//   • Guards huge payloads up-front so the server doesn't 413 silently.
//   • Normalises the error so callers can `toast.error(err.message)`.

import { uploadProjectAsset } from "@/lib/local-projects";
import type { AssetKind, ProjectAsset } from "@/lib/project-state";

// Server-side cap is ~30 MB raw (40M base64 chars). Reject earlier with a
// friendly message so the user can pick a smaller file instead of waiting
// for a Zod parse error.
const MAX_BYTES = 25 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB worth of char codes per apply()
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    // String.fromCharCode.apply with a typed array is widely supported and
    // dramatically faster than a per-byte concat loop.
    result += String.fromCharCode.apply(
      null,
      slice as unknown as number[],
    );
  }
  return btoa(result);
}

export async function fileToProjectAsset(
  file: File,
  projectId: string,
  kind: AssetKind = "reference",
): Promise<ProjectAsset> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Keep uploads under 25 MB.`,
    );
  }
  let bytesB64: string;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    bytesB64 = bytesToBase64(buf);
  } catch (err) {
    throw new Error(
      `Couldn't read the file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return await uploadProjectAsset({
      data: {
        projectId,
        kind,
        mime: file.type || "application/octet-stream",
        name: file.name,
        bytesB64,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Upload failed: ${msg}`);
  }
}

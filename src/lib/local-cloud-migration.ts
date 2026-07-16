// One-shot migration from the pre-Cloud IndexedDB store into Supabase.
// Runs on first successful sign-in per browser+user; skips itself thereafter.
//
// The old shape:
//   IDB db "agent-studio-local"
//     - object store "projects" — { id, title, status, createdAt, updatedAt,
//         projectState, skill, studioMode, studioModel }
//     - object store "assets"   — { id, projectId, kind, mime, name, blob,
//         label?, width?, height?, duration? }
//
// We upload each asset as base64 through `uploadProjectAsset`, create the
// project row, then let the flag prevent re-runs.

import {
  createProject,
  updateProjectStudioPrefs,
  updateProjectState,
  uploadProjectAsset,
} from "@/lib/projects.functions";

const DB = "agent-studio-local";
const VERSION = 1;
const FLAG_KEY = (uid: string) => `agent-studio:migrated:${uid}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      // If the DB never existed, there's nothing to migrate — create empty
      // stores so onsuccess still fires without a version mismatch.
      const d = req.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("assets")) {
        const s = d.createObjectStore("assets", { keyPath: "id" });
        s.createIndex("projectId", "projectId", { unique: false });
      }
    };
  });
}

function getAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function getAllByIndex<T>(index: IDBIndex, key: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

type StoredProject = {
  id: string;
  title: string;
  status: string;
  projectState: unknown;
  skill: string | null;
  studioMode: string;
  studioModel: string | null;
};

type StoredAsset = {
  id: string;
  projectId: string;
  kind: string;
  mime: string;
  name: string;
  blob: Blob;
  label?: string;
  width?: number;
  height?: number;
  duration?: number;
};

let inflight = false;

export async function migrateLocalProjectsToCloud(userId: string): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;
  if (inflight) return;
  const flag = FLAG_KEY(userId);
  if (localStorage.getItem(flag)) return;
  inflight = true;

  try {
    const db = await openDB();
    const projects = await getAll<StoredProject>(
      db.transaction("projects").objectStore("projects"),
    );
    if (projects.length === 0) {
      localStorage.setItem(flag, new Date().toISOString());
      db.close();
      return;
    }

    for (const p of projects) {
      try {
        await createProject({
          data: {
            id: p.id,
            title: p.title,
            skill: p.skill ?? undefined,
            studioMode: p.studioMode,
            studioModel: p.studioModel ?? undefined,
          },
        });
        if (p.studioMode || p.studioModel || p.skill) {
          await updateProjectStudioPrefs({
            data: {
              id: p.id,
              studioMode: p.studioMode || "agent",
              studioModel: p.studioModel ?? null,
              skill: p.skill ?? null,
            },
          }).catch(() => {});
        }

        const assets = await getAllByIndex<StoredAsset>(
          db.transaction("assets").objectStore("assets").index("projectId"),
          p.id,
        );
        for (const a of assets) {
          try {
            const bytesB64 = await blobToBase64(a.blob);
            await uploadProjectAsset({
              data: {
                projectId: p.id,
                kind: a.kind as never,
                mime: a.mime,
                name: a.name,
                bytesB64,
                label: a.label,
                width: a.width,
                height: a.height,
                duration: a.duration,
              },
            });
          } catch (err) {
            console.warn("[local→cloud] asset upload failed", a.id, err);
          }
        }

        // Re-apply the project_state snapshot so scenes/timeline persist.
        if (p.projectState) {
          await updateProjectState({
            data: {
              id: p.id,
              patch: { fullReplace: p.projectState as never } as never,
            },
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("[local→cloud] project migration failed", p.id, err);
      }
    }

    db.close();
    localStorage.setItem(flag, new Date().toISOString());
  } catch (err) {
    console.warn("[local→cloud] migration aborted", err);
  } finally {
    inflight = false;
  }
}

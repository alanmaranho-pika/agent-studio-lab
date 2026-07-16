// Compatibility shim over the Supabase-backed server functions in
// `projects.functions.ts`. The app previously used IndexedDB (via this file)
// for local persistence; every consumer imports these names, so we now
// re-export the cloud server-fns here to keep the call sites working. The
// `useLocalProjectFn` hook wraps a server fn with `useServerFn` so its
// bearer token is attached from React components.

import { useServerFn } from "@tanstack/react-start";
import {
  attachLibraryAssetToProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProjectState,
  updateProjectStudioPrefs,
  uploadProjectAsset,
} from "@/lib/projects.functions";

export {
  attachLibraryAssetToProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProjectState,
  updateProjectStudioPrefs,
  uploadProjectAsset,
};

export function useLocalProjectFn<T extends (...args: never[]) => unknown>(fn: T): T {
  return useServerFn(fn as unknown as Parameters<typeof useServerFn>[0]) as unknown as T;
}

function openDatabase(): Promise<IDBDatabase> {
  browserOnly();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ASSETS)) {
        const store = db.createObjectStore(ASSETS, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open local storage."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

async function readProject(id: string): Promise<StoredProject | null> {
  const db = await openDatabase();
  try {
    return (await requestValue(db.transaction(PROJECTS).objectStore(PROJECTS).get(id))) ?? null;
  } finally {
    db.close();
  }
}

async function writeProject(project: StoredProject) {
  const db = await openDatabase();
  try {
    await requestValue(db.transaction(PROJECTS, "readwrite").objectStore(PROJECTS).put(project));
  } finally {
    db.close();
  }
}

async function assetsForProject(projectId: string): Promise<ProjectAsset[]> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(ASSETS);
    const rows = await requestValue(transaction.objectStore(ASSETS).index("projectId").getAll(projectId)) as StoredAsset[];
    return rows.map(({ blob, projectId: _projectId, ...asset }) => ({
      ...asset,
      url: URL.createObjectURL(blob),
    }));
  } finally {
    db.close();
  }
}

function hydratedState(state: ProjectState, assets: ProjectAsset[]): ProjectState {
  const urls = new Map(assets.map((asset) => [asset.id, asset.url]));
  const known = new Set(state.assets.map((asset) => asset.id));
  return {
    ...state,
    assets: [...state.assets.map((asset) => ({ ...asset, url: urls.get(asset.id) ?? asset.url })), ...assets.filter((asset) => !known.has(asset.id))],
  };
}

export async function listProjects({ data = {} }: { data?: { limit?: number; cursor?: string } } = {}) {
  if (typeof window === "undefined") return { projects: [], nextCursor: null };
  const db = await openDatabase();
  let rows: StoredProject[];
  try {
    rows = await requestValue(db.transaction(PROJECTS).objectStore(PROJECTS).getAll()) as StoredProject[];
  } finally {
    db.close();
  }
  const limit = Math.min(Math.max(data.limit ?? 24, 1), 60);
  const sorted = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const afterCursor = data.cursor ? sorted.filter((row) => row.updatedAt < data.cursor!) : sorted;
  const page = afterCursor.slice(0, limit + 1);
  const visible = page.slice(0, limit);
  return {
    projects: await Promise.all(visible.map(async (project) => {
      const assets = await assetsForProject(project.id);
      const state = hydratedState(project.projectState, assets);
      const thumbnail = state.assets.find((asset) => asset.mime.startsWith("image/")) ?? state.assets.find((asset) => asset.mime.startsWith("video/"));
      return {
        id: project.id,
        title: state.meta.title || project.title,
        status: project.status,
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        format: state.meta.format,
        aspectRatio: state.meta.aspectRatio,
        sceneCount: state.scenes.length,
        thumbnailUrl: thumbnail?.url ?? null,
        thumbnailKind: thumbnail ? (thumbnail.mime.startsWith("video/") ? "video" : "image") as "video" | "image" : null,
        mediaUrls: state.assets.filter((asset) => /^(image|video)\//.test(asset.mime)).map((asset) => asset.url),
      };
    })),
    nextCursor: page.length > limit ? visible.at(-1)?.updatedAt ?? null : null,
  };
}

export async function createProject({ data = {} }: { data?: { id?: string; title?: string; skill?: string; studioMode?: string; studioModel?: string } } = {}) {
  const existing = await listProjects({ data: { limit: 60 } });
  const id = data.id ?? crypto.randomUUID();
  const title = data.title?.trim() || `Untitled Project #${existing.projects.filter((project) => /^Untitled Project #\d+$/.test(project.title)).length + 1}`;
  const now = new Date().toISOString();
  await writeProject({
    id,
    title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    projectState: { ...INITIAL_PROJECT, meta: { ...INITIAL_PROJECT.meta, title } },
    skill: data.skill ?? null,
    studioMode: data.studioMode ?? "agent",
    studioModel: data.studioModel ?? null,
  });
  return { id };
}

export async function deleteProject({ data }: { data: { id: string } }) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([PROJECTS, ASSETS], "readwrite");
    transaction.objectStore(PROJECTS).delete(data.id);
    const index = transaction.objectStore(ASSETS).index("projectId");
    for (const asset of await requestValue(index.getAll(data.id)) as StoredAsset[]) transaction.objectStore(ASSETS).delete(asset.id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Couldn't delete local project."));
    });
  } finally {
    db.close();
  }
  return { ok: true };
}

export async function getProject({ data }: { data: { id: string } }) {
  const project = await readProject(data.id);
  if (!project) return null;
  const assets = await assetsForProject(data.id);
  return {
    project: { ...project, projectState: hydratedState(project.projectState, assets) },
    messages: [] as Array<{ id: string; role: "user" | "assistant"; parts: unknown[] }>,
    assets,
  };
}

export async function updateProjectState({ data }: { data: { id: string; patch: ProjectPatch } }) {
  const project = await readProject(data.id);
  if (!project) throw new Error("Project not found");
  const next = applyPatch(project.projectState, data.patch);
  await writeProject({ ...project, title: next.meta.title || project.title, projectState: next, updatedAt: new Date().toISOString() });
  return { ok: true, projectState: next };
}

export async function updateProjectStudioPrefs({ data }: { data: { id: string; studioMode: string; studioModel: string | null; skill?: string | null } }) {
  const project = await readProject(data.id);
  if (!project) throw new Error("Project not found");
  await writeProject({ ...project, studioMode: data.studioMode, studioModel: data.studioModel, skill: data.skill === undefined ? project.skill : data.skill, updatedAt: new Date().toISOString() });
  return { ok: true };
}

export async function uploadProjectAsset({ data }: { data: { projectId: string; kind: AssetKind; mime: string; name: string; bytesB64: string; label?: string; width?: number; height?: number; duration?: number } }): Promise<ProjectAsset> {
  const project = await readProject(data.projectId);
  if (!project) throw new Error("Project not found");
  const binary = atob(data.bytesB64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const asset: ProjectAsset = {
    id: crypto.randomUUID(), kind: data.kind, mime: data.mime, name: data.name,
    url: "", label: data.label, width: data.width, height: data.height, duration: data.duration,
    createdAt: new Date().toISOString(),
  };
  const blob = new Blob([bytes], { type: data.mime });
  const db = await openDatabase();
  try {
    await requestValue(db.transaction(ASSETS, "readwrite").objectStore(ASSETS).put({ ...asset, projectId: data.projectId, blob }));
  } finally {
    db.close();
  }
  const withUrl = { ...asset, url: URL.createObjectURL(blob) };
  const next = applyPatch(project.projectState, { assetsAppend: [withUrl] });
  await writeProject({ ...project, projectState: next, updatedAt: new Date().toISOString() });
  return withUrl;
}

export async function attachLibraryAssetToProject({ data }: { data: { sourceAssetId: string; targetProjectId: string } }): Promise<ProjectAsset> {
  const db = await openDatabase();
  let source: StoredAsset | undefined;
  try {
    source = await requestValue(db.transaction(ASSETS).objectStore(ASSETS).get(data.sourceAssetId));
  } finally {
    db.close();
  }
  if (!source) throw new Error("Local asset not found");
  const encoded = await source.blob.arrayBuffer();
  const bytes = new Uint8Array(encoded);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return uploadProjectAsset({ data: {
    projectId: data.targetProjectId, kind: source.kind, mime: source.mime, name: source.name,
    bytesB64: btoa(binary), label: source.label, width: source.width, height: source.height, duration: source.duration,
  } });
}

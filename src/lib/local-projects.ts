// Compatibility shim over the Supabase-backed server functions in
// `projects.functions.ts`. Every call site historically imported from
// `local-projects`; re-exporting the cloud server-fns keeps them working
// while persisting per-user data in Lovable Cloud.

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

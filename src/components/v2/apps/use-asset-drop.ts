import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getProject, useLocalProjectFn } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";

export type AssetDropAccept = "image" | "audio" | "image-or-video";

function mimeMatches(mime: string, accept: AssetDropAccept): boolean {
  if (accept === "image") return mime.startsWith("image/");
  if (accept === "audio") return mime.startsWith("audio/");
  return mime.startsWith("image/") || mime.startsWith("video/");
}

/**
 * Lets a panel accept drag-and-drop of project assets (e.g. dropping a
 * generated output from the middle column into a reference slot).
 *
 * Returns drop handlers to spread on the drop target, plus an `isOver` flag
 * for hover styling.
 */
export function useAssetDropTarget(opts: {
  projectId?: string;
  accept: AssetDropAccept;
  onAsset: (asset: ProjectAsset) => void;
}) {
  const { projectId, accept, onAsset } = opts;
  const fetchProject = useLocalProjectFn(getProject);
  const projectQ = useQuery({
    queryKey: ["v2-project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId! } }),
    enabled: !!projectId && projectId !== "anonymous-draft",
  });

  const assetsById = useMemo(() => {
    const map = new Map<string, ProjectAsset>();
    for (const a of projectQ.data?.assets ?? []) map.set(a.id, a);
    return map;
  }, [projectQ.data]);

  const [isOver, setIsOver] = useState(false);

  const canHandle = useCallback(
    (e: React.DragEvent) => {
      const types = e.dataTransfer.types;
      if (!types || !Array.from(types).includes("application/x-v2-asset-id")) {
        return false;
      }
      const mime = e.dataTransfer.getData("application/x-v2-asset-mime") || "";
      // dataTransfer.getData is only reliable on drop in some browsers; if
      // empty during dragover we still optimistically accept and validate on
      // drop.
      if (!mime) return true;
      return mimeMatches(mime, accept);
    },
    [accept],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canHandle(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsOver(true);
    },
    [canHandle],
  );

  const onDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      setIsOver(false);
      const id = e.dataTransfer.getData("application/x-v2-asset-id");
      if (!id) return;
      const mime =
        e.dataTransfer.getData("application/x-v2-asset-mime") ||
        assetsById.get(id)?.mime ||
        "";
      if (mime && !mimeMatches(mime, accept)) return;
      const asset = assetsById.get(id);
      if (!asset) return;
      e.preventDefault();
      e.stopPropagation();
      onAsset(asset);
    },
    [accept, assetsById, onAsset],
  );

  return {
    isOver,
    dropProps: { onDragOver, onDragLeave, onDrop },
  };
}

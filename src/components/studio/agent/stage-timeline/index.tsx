// StageTimelineView — dispatcher for the composable timeline system. All
// variants render from the same useTimelineModel and compose the same
// primitives, so a cut looks identical whether the agent shows the preview
// strip, the multi-track editor, or a focused scene.

import type {
  ProjectAsset,
  ProjectPatch,
  ProjectState,
} from "@/lib/project-state";
import type { StageIntent } from "@/components/studio/agent/intents";
import { useTimelineModel } from "./use-timeline-model";
import { TimelinePreview } from "./variant-preview";
import { TimelineEditor } from "./variant-editor";
import { TimelineScenes } from "./variant-scenes";

export type TimelineVariant = "preview" | "editor" | "scenes";

export const TIMELINE_VARIANTS: readonly TimelineVariant[] = [
  "preview",
  "editor",
  "scenes",
];

export function StageTimelineView({
  project,
  assets,
  variant = "preview",
  focusSceneId,
  onPatch,
  onIntent,
}: {
  project: ProjectState;
  assets: ProjectAsset[];
  variant?: TimelineVariant;
  focusSceneId?: string;
  onPatch?: (patch: ProjectPatch) => void;
  onIntent?: (intent: StageIntent) => void;
}) {
  const model = useTimelineModel(project, assets, focusSceneId);
  switch (variant) {
    case "editor":
      return (
        <TimelineEditor
          model={model}
          project={project}
          assets={assets}
          onPatch={onPatch}
          onIntent={onIntent}
        />
      );
    case "scenes":
      return <TimelineScenes model={model} project={project} assets={assets} />;
    default:
      return (
        <TimelinePreview
          model={model}
          project={project}
          assets={assets}
          onIntent={onIntent}
        />
      );
  }
}

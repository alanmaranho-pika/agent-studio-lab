import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Video as VideoIcon, X } from "lucide-react";


import { Switch } from "@/components/ui/switch";
import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { AssetKind, ProjectAsset } from "@/lib/project-state";
import type { Skill } from "@/lib/skills";
import { cn } from "@/lib/utils";

async function fileToAsset(
  file: File,
  projectId: string,
  kind: AssetKind,
): Promise<ProjectAsset> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return uploadProjectAsset({
    data: {
      projectId,
      kind,
      mime: file.type || "application/octet-stream",
      name: file.name,
      bytesB64: btoa(bin),
    },
  });
}

type Orientation = "image" | "video";

export function KlingMotionControlPanel({
  skill,
  projectId,
  busy,
  seedAsset,
  onSeedConsumed,
  onSubmit,
}: {
  skill: Skill;
  projectId: string;
  busy: boolean;
  seedAsset?: ProjectAsset | null;
  onSeedConsumed?: () => void;
  onSubmit: (args: {
    prompt: string;
    assets: ProjectAsset[];
    params: Record<string, string | number | boolean>;
  }) => void;
}) {
  const [image, setImage] = useState<ProjectAsset | null>(null);
  const [video, setVideo] = useState<ProjectAsset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("image");
  const [keepSound, setKeepSound] = useState(true);
  const [imgPicker, setImgPicker] = useState(false);
  const [vidPicker, setVidPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setImage(null);
    setVideo(null);
    setPrompt("");
    setOrientation("image");
    setKeepSound(true);
  }, [skill.model]);

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime.startsWith("image/")) setImage(seedAsset);
    else if (seedAsset.mime.startsWith("video/")) setVideo(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handleImagePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const a = result.assets.find((a) => a.mime.startsWith("image/"));
      if (a) setImage(a);
      return;
    }
    setUploading(true);
    try {
      const f = result.files[0];
      if (f) setImage(await fileToAsset(f, projectId, "reference"));
    } finally {
      setUploading(false);
    }
  };
  const handleVideoPicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const a = result.assets.find((a) => a.mime.startsWith("video/"));
      if (a) setVideo(a);
      return;
    }
    setUploading(true);
    try {
      const f = result.files[0];
      if (f) setVideo(await fileToAsset(f, projectId, "video"));
    } finally {
      setUploading(false);
    }
  };

  const imgDrop = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setImage(a),
  });
  const vidDrop = useAssetDropTarget({
    projectId,
    accept: "image-or-video",
    onAsset: (a) => {
      if (a.mime.startsWith("video/")) setVideo(a);
    },
  });

  const canSubmit = !!image && !!video;

  return (
    <div className="flex flex-col gap-4">
      {/* Character image */}
      <section
        {...imgDrop.dropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          imgDrop.isOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Character image
          </div>
          <div className="text-[11px] text-muted-foreground">required</div>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Subject must occupy &gt;5% of the frame, with clear body proportions
          and no occlusion.
        </p>
        {image ? (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2">
            <img
              src={image.url}
              alt={image.name}
              className="h-16 w-16 rounded object-cover"
            />
            <span className="flex-1 truncate text-xs text-foreground">
              {image.name}
            </span>
            <button
              type="button"
              onClick={() => setImage(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setImgPicker(true)}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Pick a character image
              </>
            )}
          </button>
        )}
        <AssetPickerDialog
          open={imgPicker}
          onOpenChange={setImgPicker}
          accept="image"
          onPick={(r) => void handleImagePicked(r)}
        />
      </section>

      {/* Motion reference video */}
      <section
        {...vidDrop.dropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          vidDrop.isOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Motion reference video
          </div>
          <div className="text-[11px] text-muted-foreground">required</div>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Realistic-style character with head + upper or full body visible.
          Max 10s in “image” orientation, 30s in “video” orientation.
        </p>
        {video ? (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2">
            <video
              src={video.url}
              muted
              preload="metadata"
              className="h-16 w-24 rounded object-cover"
            />
            <span className="flex-1 truncate text-xs text-foreground">
              {video.name}
            </span>
            <button
              type="button"
              onClick={() => setVideo(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVidPicker(true)}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <VideoIcon className="h-4 w-4" /> Pick a reference video
          </button>
        )}
        <AssetPickerDialog
          open={vidPicker}
          onOpenChange={setVidPicker}
          accept="video"
          onPick={(r) => void handleVideoPicked(r)}
        />
      </section>

      {/* Prompt */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">Prompt</div>
          <div className="text-[11px] text-muted-foreground">optional</div>
        </div>
        <AppTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A man dancing"
          rows={3}
        />
      </section>

      {/* Settings */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">
          Settings
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Character orientation
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["image", "video"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setOrientation(opt)}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs capitalize transition",
                  orientation === opt
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-hairline bg-background/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {opt === "image"
                  ? "Image (follow camera, max 10s)"
                  : "Video (complex motion, max 30s)"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Keep original audio from reference video
          </label>
          <Switch checked={keepSound} onCheckedChange={setKeepSound} />
        </div>
      </section>

      <GenerateButton
        skill={skill}
        disabled={!canSubmit || busy || uploading}
        onClick={() => {
          const assets: ProjectAsset[] = [];
          if (image) assets.push(image);
          if (video) assets.push(video);
          const effectivePrompt = prompt.trim() || "Transfer the reference motion to the character.";
          onSubmit({
            prompt: effectivePrompt,
            assets,
            params: {
              character_orientation: orientation,
              keep_original_sound: keepSound,
            },
          });
        }}
      />
    </div>
  );
}

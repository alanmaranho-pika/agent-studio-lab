import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Video as VideoIcon, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

async function fileToAsset(
  file: File,
  projectId: string,
  kind: AssetKind,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, kind);
}

export function PikaswapsPanel({
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
  const [modifyRegion, setModifyRegion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [video, setVideo] = useState<ProjectAsset | null>(null);
  const [refImage, setRefImage] = useState<ProjectAsset | null>(null);
  const [seed, setSeed] = useState(42);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setModifyRegion("");
    setPrompt("");
    setVideo(null);
    setRefImage(null);
    setSeed(42);
  }, [skill.model]);

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime.startsWith("video/")) setVideo(seedAsset);
    else if (seedAsset.mime.startsWith("image/")) setRefImage(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handleVideoPicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const v = result.assets.find((a) => a.mime.startsWith("video/"));
      if (v) setVideo(v);
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

  const handleImagePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const i = result.assets.find((a) => a.mime.startsWith("image/"));
      if (i) setRefImage(i);
      return;
    }
    setUploading(true);
    try {
      const f = result.files[0];
      if (f) setRefImage(await fileToAsset(f, projectId, "reference"));
    } finally {
      setUploading(false);
    }
  };

  const videoDrop = useAssetDropTarget({
    projectId,
    accept: "image-or-video",
    onAsset: (a) => {
      if (a.mime.startsWith("video/")) setVideo(a);
    },
  });
  const imageDrop = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setRefImage(a),
  });

  const canSubmit = !!video && modifyRegion.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Source video */}
      <section
        {...videoDrop.dropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          videoDrop.isOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">Source video</div>
          <div className="text-[11px] text-muted-foreground">required</div>
        </div>
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
            onClick={() => setVideoPickerOpen(true)}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <VideoIcon className="h-4 w-4" />
                Pick a video (or drop from outputs)
              </>
            )}
          </button>
        )}
        <AssetPickerDialog
          open={videoPickerOpen}
          onOpenChange={setVideoPickerOpen}
          accept="video"
          onPick={(r) => void handleVideoPicked(r)}
        />
      </section>

      {/* Region to modify */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Region to modify
          </div>
          <div className="text-[11px] text-muted-foreground">required</div>
        </div>
        <Input
          value={modifyRegion}
          onChange={(e) => setModifyRegion(e.target.value)}
          placeholder="e.g. the red car in the background"
        />
      </section>

      {/* Reference image */}
      <section
        {...imageDrop.dropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          imageDrop.isOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Reference image
          </div>
          <div className="text-[11px] text-muted-foreground">optional</div>
        </div>
        {refImage ? (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2">
            <img
              src={refImage.url}
              alt={refImage.name}
              className="h-12 w-12 rounded object-cover"
            />
            <span className="flex-1 truncate text-xs text-foreground">
              {refImage.name}
            </span>
            <button
              type="button"
              onClick={() => setRefImage(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setImagePickerOpen(true)}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-4 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Attach a reference image
          </button>
        )}
        <AssetPickerDialog
          open={imagePickerOpen}
          onOpenChange={setImagePickerOpen}
          accept="image"
          onPick={(r) => void handleImagePicked(r)}
        />
      </section>

      {/* Prompt (optional) */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            What to put there
          </div>
          <div className="text-[11px] text-muted-foreground">optional</div>
        </div>
        <AppTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the replacement (style, color, behavior)…"
          rows={3}
        />
      </section>

      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">Settings</div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Seed
            </label>
            <span className="font-mono text-xs text-foreground">{seed}</span>
          </div>
          <Slider
            value={[seed]}
            min={0}
            max={9999}
            step={1}
            onValueChange={(v) => setSeed(v[0])}
          />
        </div>
      </section>

      <GenerateButton
        skill={skill}
        disabled={!canSubmit || busy || uploading}
        onClick={() => {
          const assets: ProjectAsset[] = [];
          if (video) assets.push(video);
          if (refImage) assets.push(refImage);
          const effectivePrompt = prompt.trim() || modifyRegion.trim();
          onSubmit({
            prompt: effectivePrompt,
            assets,
            params: { modify_region: modifyRegion.trim(), seed },
          });
        }}
      />
    </div>
  );
}

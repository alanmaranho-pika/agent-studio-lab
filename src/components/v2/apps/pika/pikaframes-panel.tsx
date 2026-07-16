import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Upload, X } from "lucide-react";


import { Slider } from "@/components/ui/slider";
import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";
import type { Skill } from "@/lib/skills";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

const MAX_KEYFRAMES = 5;
const MIN_KEYFRAMES = 2;

async function fileToAsset(file: File, projectId: string): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

export function PikaframesPanel({
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
  const [prompt, setPrompt] = useState("");
  const [frames, setFrames] = useState<ProjectAsset[]>([]);
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState("5");
  const [seed, setSeed] = useState(42);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPrompt("");
    setFrames([]);
    setResolution("720p");
    setDuration("5");
    setSeed(42);
  }, [skill.model]);

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    setFrames((prev) =>
      prev.length >= MAX_KEYFRAMES ? prev : [...prev, seedAsset],
    );
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const addAssets = (incoming: ProjectAsset[]) => {
    setFrames((prev) => {
      const slots = MAX_KEYFRAMES - prev.length;
      return [...prev, ...incoming.slice(0, Math.max(0, slots))];
    });
  };

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      addAssets(result.assets);
      return;
    }
    setUploading(true);
    try {
      const out: ProjectAsset[] = [];
      for (const f of result.files) out.push(await fileToAsset(f, projectId));
      addAssets(out);
    } finally {
      setUploading(false);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    setFrames((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const remove = (idx: number) =>
    setFrames((prev) => prev.filter((_, i) => i !== idx));

  const { isOver, dropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => addAssets([a]),
  });

  const canSubmit = frames.length >= MIN_KEYFRAMES && prompt.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">Prompt</div>
        <AppTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the overall motion between keyframes…"
          rows={3}
        />
      </section>

      <section
        {...dropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          isOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Keyframes ({frames.length}/{MAX_KEYFRAMES})
          </div>
          <div className="text-[11px] text-muted-foreground">
            {MIN_KEYFRAMES}–{MAX_KEYFRAMES}, ordered
          </div>
        </div>
        {frames.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {frames.map((a, i) => (
              <div
                key={`${a.id}-${i}`}
                className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2"
              >
                <div className="grid h-6 w-6 place-items-center rounded-full bg-foreground/10 text-xs font-semibold">
                  {i + 1}
                </div>
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-12 w-12 rounded-md object-cover"
                />
                <span className="flex-1 truncate text-xs text-foreground">
                  {a.name}
                </span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  disabled={i === frames.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => remove(i)}
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={uploading || frames.length >= MAX_KEYFRAMES}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-4 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              {frames.length === 0 ? (
                <Upload className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {frames.length === 0
                ? "Add first keyframe"
                : frames.length >= MAX_KEYFRAMES
                  ? "Max keyframes reached"
                  : "Add keyframe"}
            </>
          )}
        </button>
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          accept="image"
          multiple
          onPick={(r) => void handlePicked(r)}
        />
      </section>

      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">Settings</div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Resolution
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Per-transition duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm"
            >
              <option value="5">5s</option>
              <option value="10">10s</option>
            </select>
          </div>
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
        </div>
      </section>

      <GenerateButton
        skill={skill}
        disabled={!canSubmit || busy || uploading}
        onClick={() =>
          onSubmit({
            prompt: prompt.trim(),
            assets: frames,
            params: { resolution, duration, seed },
          })
        }
      />
    </div>
  );
}

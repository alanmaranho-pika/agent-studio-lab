import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";

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

async function fileToAsset(file: File, projectId: string): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

export function PikascenesPanel({
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
  const [ingredients, setIngredients] = useState<ProjectAsset[]>([]);
  const [aspect, setAspect] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState("5");
  const [mode, setMode] = useState("creative");
  const [seed, setSeed] = useState(42);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setPrompt("");
    setIngredients([]);
    setAspect("16:9");
    setResolution("720p");
    setDuration("5");
    setMode("creative");
    setSeed(42);
  }, [skill.model]);

  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    setIngredients((prev) => [...prev, seedAsset]);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      setIngredients((p) => [...p, ...result.assets]);
      return;
    }
    setUploading(true);
    try {
      const out: ProjectAsset[] = [];
      for (const f of result.files) out.push(await fileToAsset(f, projectId));
      setIngredients((p) => [...p, ...out]);
    } finally {
      setUploading(false);
    }
  };

  const { isOver, dropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setIngredients((p) => [...p, a]),
  });

  const canSubmit = ingredients.length >= 2 && prompt.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">Prompt</div>
        <AppTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the scene that combines these ingredients…"
          rows={4}
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
            Ingredients ({ingredients.length})
          </div>
          <div className="text-[11px] text-muted-foreground">
            At least 2 images
          </div>
        </div>
        {ingredients.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ingredients.map((a, i) => (
              <div
                key={`${a.id}-${i}`}
                className="group relative aspect-square overflow-hidden rounded-md border border-hairline"
              >
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setIngredients((p) => p.filter((_, j) => j !== i))
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-4 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              {ingredients.length === 0 ? (
                <Upload className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add ingredient
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Aspect
              </label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
                <option value="5:4">5:4</option>
              </select>
            </div>
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
                Duration
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
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Ingredients mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm"
              >
                <option value="creative">Creative</option>
                <option value="precise">Precise</option>
              </select>
            </div>
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
            assets: ingredients,
            params: {
              aspect_ratio: aspect,
              resolution,
              duration,
              ingredients_mode: mode,
              seed,
            },
          })
        }
      />
    </div>
  );
}

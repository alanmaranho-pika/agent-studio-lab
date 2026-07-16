import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload as UploadIcon, X, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon, Mic as MicIcon, MessageSquare } from "lucide-react";


import { Button } from "@/components/ui/button";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";
import {
  SKILLS_BY_KIND,
  DEFAULT_MODEL_BY_KIND,
  type SkillKind,
} from "@/lib/skills";
import {
  paramsFor,
  defaultValuesFor,
  type ParamControl,
} from "@/lib/model-params";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

/** Union of skill-kind modes plus the orthogonal "agent" mode. When agent is
 *  selected the wizard hides model/params and the parent routes to the
 *  Agent Studio (/studio/$projectId) on submit instead of running a skill. */
export type CreateMode = "agent" | SkillKind;

const MODES: { id: CreateMode; label: string; icon: typeof ImageIcon }[] = [
  { id: "agent", label: "Agent", icon: MessageSquare },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: VideoIcon },
  { id: "audio", label: "Audio", icon: MusicIcon },
  { id: "speech", label: "Voice", icon: MicIcon },
];


async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

export type CreateSubmit = {
  mode: CreateMode;
  model: string;
  prompt: string;
  assets: ProjectAsset[];
  params: Record<string, string | number | boolean>;
};

export function CreateAppWizard({
  projectId,
  busy,
  seedPrompt,
  seedMode,
  seedModel,
  seedAsset,
  mode: controlledMode,
  onModeChange,
  onSeedConsumed,
  onSubmit,
}: {
  projectId: string;
  busy: boolean;
  seedPrompt?: string;
  seedMode?: CreateMode;
  seedModel?: string;
  seedAsset?: ProjectAsset | null;
  /** Optional controlled mode kept in sync with the parent header. */
  mode?: CreateMode;
  onModeChange?: (mode: CreateMode) => void;
  onSeedConsumed?: () => void;
  onSubmit: (args: CreateSubmit) => void;
}) {
  const [internalMode, setInternalMode] = useState<CreateMode>(seedMode ?? "agent");
  const mode = controlledMode ?? internalMode;
  const isAgent = mode === "agent";
  const skillMode: SkillKind = isAgent ? "image" : mode;
  const [model, setModel] = useState<string>(
    seedModel ?? DEFAULT_MODEL_BY_KIND[isAgent ? "image" : (seedMode as SkillKind) ?? "image"],
  );

  const [prompt, setPrompt] = useState<string>(seedPrompt ?? "");
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [params, setParams] = useState<Record<string, string | number | boolean>>(
    () => defaultValuesFor(seedModel ?? DEFAULT_MODEL_BY_KIND[(seedMode === "agent" ? "image" : seedMode) ?? "image"]),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { isOver: refIsOver, dropProps: refDropProps } = useAssetDropTarget({
    projectId,
    accept: "image-or-video",
    onAsset: (a) => setAssets((prev) => [...prev, a]),
  });

  // Seed asset (e.g. "Use in app").
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    setAssets((prev) => [...prev, seedAsset]);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  // Available models for the current mode.
  const MODEL_CATEGORIES = new Set([
    "Models",
    "Audio Apps",
    "Voice Apps",
  ]);
  const models = useMemo(
    () => SKILLS_BY_KIND(skillMode).filter((s) => MODEL_CATEGORIES.has(s.category)),
    [skillMode],
  );
  const controls = useMemo(() => (isAgent ? [] : paramsFor(model)), [isAgent, model]);

  const handleModeChange = (next: CreateMode) => {
    setInternalMode(next);
    onModeChange?.(next);
    if (next === "agent") return;
    const nextModel = DEFAULT_MODEL_BY_KIND[next];
    setModel(nextModel);
    setParams(defaultValuesFor(nextModel));
  };


  const handleModelChange = (next: string) => {
    setModel(next);
    setParams(defaultValuesFor(next));
  };

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      setAssets((prev) => [...prev, ...result.assets]);
      return;
    }
    setUploading(true);
    try {
      const out: ProjectAsset[] = [];
      for (const f of result.files) {
        out.push(await fileToProjectAsset(f, projectId));
      }
      setAssets((prev) => [...prev, ...out]);
    } catch (err) {
      console.error("[create-app] upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = (id: string) =>
    setAssets((prev) => prev.filter((a) => a.id !== id));

  const canSubmit = prompt.trim().length > 0;
  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ mode, model, prompt: prompt.trim(), assets, params });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Mode tabs */}
      <div className="flex gap-1 border-b border-hairline px-4 pb-3 pt-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Reference uploads */}
        {mode !== "audio" && mode !== "speech" && (
          <div className="mb-3">
            <div
              {...refDropProps}
              className={cn(
                "flex gap-2 rounded-xl p-1 transition",
                refIsOver && "ring-2 ring-primary/50",
              )}
            >
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={uploading}
                className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-hairline bg-muted/30 text-[10px] text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UploadIcon className="h-4 w-4" />
                    Reference
                  </>
                )}
              </button>
              {assets.map((a) => (
                <div
                  key={a.id}
                  className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-hairline bg-muted/40"
                >
                  {a.mime.startsWith("image/") ? (
                    <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      {a.mime.startsWith("video/") ? "▶" : "•"}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAsset(a.id)}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <AssetPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              accept="image"
              multiple
              onPick={(result) => void handlePicked(result)}
            />
          </div>
        )}

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isAgent
              ? "Tell the Agent what you want to build — a scene, a character, a whole short film…"
              : mode === "speech"
                ? "Paste the text you want spoken…"
                : mode === "audio"
                  ? "Describe the music or sound — genre, tempo, instruments, mood…"
                  : mode === "video"
                    ? "Describe your shot — subject, motion, camera, atmosphere…"
                    : "Describe your shot, add image references, or sketch a scene."
          }

          rows={8}
          className="min-h-[180px] w-full resize-none rounded-2xl border border-hairline bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      {/* Bottom bar: params + model + generate */}
      <div className="border-t border-hairline bg-card/40 px-4 py-3">
        {!isAgent && (
          <div className="mb-2 flex flex-col gap-2">
            {controls.map((c) => (
              <ParamChip
                key={c.key}
                control={c}
                value={params[c.key]}
                onChange={(v) => setParams((prev) => ({ ...prev, [c.key]: v }))}
              />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {!isAgent && (
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="h-10 w-full truncate rounded-full border border-hairline bg-background px-4 text-xs font-medium text-foreground outline-none focus:border-primary"
            >
              {models.map((s) => (
                <option key={s.id} value={s.model}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || busy || uploading}
            className="w-full shadow-none"
          >
            {isAgent ? "Start with Agent" : "Generate"}
          </Button>
        </div>
      </div>

    </div>
  );
}


function ParamChip({
  control,
  value,
  onChange,
}: {
  control: ParamControl;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
}) {
  if (control.type === "select") {
    return (
      <label className="flex h-10 w-full items-center gap-2 rounded-full border border-hairline bg-background px-4 text-xs font-medium">
        <span className="text-muted-foreground">{control.label}</span>
        <select
          value={String(value ?? control.default)}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-foreground outline-none"
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (control.type === "slider") {
    const v = typeof value === "number" ? value : control.default;
    return (
      <label className="flex h-10 w-full items-center gap-3 rounded-full border border-hairline bg-background px-4 text-xs font-medium">
        <span className="text-muted-foreground">{control.label}</span>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 accent-primary"
        />
        <span className="tabular-nums text-foreground">
          {v}
          {control.unit ?? ""}
        </span>
      </label>
    );
  }
  const v = typeof value === "boolean" ? value : control.default;
  return (
    <button
      type="button"
      onClick={() => onChange(!v)}
      className={cn(
        "flex h-10 w-full items-center justify-center rounded-full border px-4 text-xs font-medium transition",
        v
          ? "border-primary bg-primary text-primary-foreground"
          : "border-hairline bg-background text-muted-foreground",
      )}
    >
      {control.label}
    </button>
  );
}

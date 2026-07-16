import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";
import { toast } from "sonner";


import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { Skill } from "@/lib/skills";
import { paramsFor, defaultValuesFor } from "@/lib/model-params";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { AssetKind, ProjectAsset } from "@/lib/project-state";
import {
  AssetPickerDialog,
  type PickerAccept,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { PikaframesPanel } from "@/components/v2/apps/pika/pikaframes-panel";
import { PikascenesPanel } from "@/components/v2/apps/pika/pikascenes-panel";
import { PikaswapsPanel } from "@/components/v2/apps/pika/pikaswaps-panel";
import { KlingMotionControlPanel } from "@/components/v2/apps/kling/kling-motion-control-panel";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

// Models that REQUIRE at least one reference attachment to run.
const REQUIRES_REFERENCE_EXPLICIT = new Set<string>([
  "fal-ai/nano-banana/edit",
]);
function requiresReferenceFor(model: string): boolean {
  if (REQUIRES_REFERENCE_EXPLICIT.has(model)) return true;
  // All image-to-video endpoints require a still image input.
  if (model.includes("image-to-video")) return true;
  // Lipsync / talking-avatar endpoints require a portrait image input.
  if (
    model.startsWith("fal-ai/sync-lipsync") ||
    model.startsWith("fal-ai/infinitalk") ||
    model.startsWith("fal-ai/kling-video/ai-avatar") ||
    model.startsWith("fal-ai/ai-avatar")
  ) {
    return true;
  }
  return false;
}

// What kind of attachment a given model accepts (for the picker).
function referenceAcceptFor(kind: Skill["kind"]): PickerAccept {
  if (kind === "video") return "image"; // image-to-video uses still images
  if (kind === "audio") return "audio";
  return "image";
}

function uploadKindFor(kind: Skill["kind"]): AssetKind {
  if (kind === "audio") return "audio";
  if (kind === "video") return "reference"; // still image input
  return "reference";
}

async function fileToProjectAsset(
  file: File,
  projectId: string,
  kind: AssetKind,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, kind);
}

function promptPlaceholderFor(skill: Skill): string {
  switch (skill.kind) {
    case "video":
      return "Describe the shot — subject, action, camera, lighting, mood…";
    case "audio":
      return "Describe the music or sound — genre, tempo, instruments, mood…";
    case "speech":
      return "Paste the text you want spoken…";
    default:
      return "Describe what you want to see — subject, style, composition…";
  }
}

function promptLabelFor(kind: Skill["kind"]): string {
  if (kind === "speech") return "Script";
  return "Prompt";
}

export function ModelAppPanel({
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
  // Per-endpoint Pika variants with bespoke input shapes.
  if (skill.model === "fal-ai/pika/v2.2/pikaframes") {
    return (
      <PikaframesPanel
        skill={skill}
        projectId={projectId}
        busy={busy}
        seedAsset={seedAsset}
        onSeedConsumed={onSeedConsumed}
        onSubmit={onSubmit}
      />
    );
  }
  if (skill.model === "fal-ai/pika/v2.2/pikascenes") {
    return (
      <PikascenesPanel
        skill={skill}
        projectId={projectId}
        busy={busy}
        seedAsset={seedAsset}
        onSeedConsumed={onSeedConsumed}
        onSubmit={onSubmit}
      />
    );
  }
  if (skill.model === "fal-ai/pika/v2/pikaswaps") {
    return (
      <PikaswapsPanel
        skill={skill}
        projectId={projectId}
        busy={busy}
        seedAsset={seedAsset}
        onSeedConsumed={onSeedConsumed}
        onSubmit={onSubmit}
      />
    );
  }
  if (skill.model === "fal-ai/kling-video/v3/pro/motion-control") {
    return (
      <KlingMotionControlPanel
        skill={skill}
        projectId={projectId}
        busy={busy}
        seedAsset={seedAsset}
        onSeedConsumed={onSeedConsumed}
        onSubmit={onSubmit}
      />
    );
  }

  const controls = paramsFor(skill.model);
  const requiresRef = requiresReferenceFor(skill.model);
  const refAccept = referenceAcceptFor(skill.kind);

  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<ProjectAsset[]>([]);
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    () => defaultValuesFor(skill.model),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Reset when model changes. Also reset the seed guard so a fresh seed
  // for the new model still applies.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    setPrompt("");
    setReferences([]);
    setValues(defaultValuesFor(skill.model));
    seededRef.current = null;
  }, [skill.model]);

  // Drop seed asset into references. For input-image models we treat the
  // seed as THE input (replace), so clicking "Edit" on an output reliably
  // loads it as the input image rather than adding a tiny chip.
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    setReferences(requiresRef ? [seedAsset] : (prev) => [...prev, seedAsset]);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed, requiresRef]);

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      setReferences((prev) => [...prev, ...result.assets]);
      return;
    }
    setUploading(true);
    try {
      const out: ProjectAsset[] = [];
      for (const f of result.files) {
        try {
          const asset = await fileToProjectAsset(
            f,
            projectId,
            uploadKindFor(skill.kind),
          );
          out.push(asset);
        } catch (err) {
          console.error("[model-app-panel] upload failed for", f.name, err);
          toast.error(
            `Couldn't upload ${f.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (out.length > 0) {
        setReferences((prev) => [...prev, ...out]);
      }
    } finally {
      setUploading(false);
    }
  };

  const removeRef = (id: string) =>
    setReferences((prev) => prev.filter((a) => a.id !== id));

  const canSubmit =
    prompt.trim().length > 0 && (!requiresRef || references.length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ prompt: prompt.trim(), assets: references, params: values });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Prompt */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">
          {promptLabelFor(skill.kind)}
        </div>
        <AppTextarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptPlaceholderFor(skill)}
          rows={skill.kind === "speech" ? 6 : 4}
        />
      </section>

      {/* References */}
      {skill.kind !== "speech" && skill.kind !== "audio" && (
        <ReferencesSection
          projectId={projectId}
          requiresRef={requiresRef}
          uploading={uploading}
          hasAny={references.length > 0}
          onAddAsset={(a) => setReferences((prev) => [...prev, a])}
          onOpenPicker={() => setPickerOpen(true)}
        >
          <AssetPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            accept={refAccept}
            multiple
            onPick={(r) => void handlePicked(r)}
          />
          {references.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {references.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-hairline bg-muted/40 p-2 pr-3 text-xs"
                >
                  {a.mime.startsWith("image/") ? (
                    <img
                      src={a.url}
                      alt={a.name}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                      •
                    </div>
                  )}
                  <span className="max-w-[140px] truncate text-foreground">
                    {a.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRef(a.id)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ReferencesSection>
      )}

      {/* Parameter controls */}
      {controls.length > 0 && (
        <section className="rounded-lg border border-hairline bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">
            Settings
          </div>
          <div className="flex flex-col gap-4">
            {controls.map((c) => {
              const v = values[c.key];
              if (c.type === "select") {
                return (
                  <div key={c.key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {c.label}
                    </label>
                    <select
                      value={String(v ?? c.default)}
                      onChange={(e) =>
                        setValues((p) => ({ ...p, [c.key]: e.target.value }))
                      }
                      className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    >
                      {c.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }
              if (c.type === "slider") {
                const num = typeof v === "number" ? v : c.default;
                return (
                  <div key={c.key} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        {c.label}
                      </label>
                      <span className="font-mono text-xs text-foreground">
                        {num}
                        {c.unit ?? ""}
                      </span>
                    </div>
                    <Slider
                      value={[num]}
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      onValueChange={(arr) =>
                        setValues((p) => ({ ...p, [c.key]: arr[0] }))
                      }
                    />
                  </div>
                );
              }
              // toggle
              return (
                <label
                  key={c.key}
                  className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-hairline bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                    {c.label}
                  </span>
                  <Switch
                    checked={Boolean(v)}
                    onCheckedChange={(checked) =>
                      setValues((p) => ({ ...p, [c.key]: checked }))
                    }
                    className="shrink-0"
                  />
                </label>
              );
            })}
          </div>
        </section>
      )}

      <GenerateButton
        skill={skill}
        onClick={handleSubmit}
        disabled={!canSubmit || busy || uploading}
      />

    </div>
  );
}

function ReferencesSection({
  projectId,
  requiresRef,
  uploading,
  hasAny,
  onAddAsset,
  onOpenPicker,
  children,
}: {
  projectId: string;
  requiresRef: boolean;
  uploading: boolean;
  hasAny: boolean;
  onAddAsset: (asset: ProjectAsset) => void;
  onOpenPicker: () => void;
  children: React.ReactNode;
}) {
  const { isOver, dropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: onAddAsset,
  });
  return (
    <section
      {...dropProps}
      className={cn(
        "rounded-lg border border-hairline bg-card p-4 transition",
        isOver && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-foreground">
          {requiresRef ? "Input image" : "Reference attachments"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {requiresRef ? "required" : "optional"}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenPicker}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover-lift hover:text-foreground disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <UploadIcon className="h-4 w-4" />
            {hasAny ? "Add another" : "Attach an image (or drop from outputs)"}
          </>
        )}
      </button>
      {children}
    </section>
  );
}

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Upload as UploadIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { AppRecipe, AppStep } from "@/lib/app-recipes";
import { composePrompt } from "@/lib/app-recipes";
import type { AssetKind, ProjectAsset } from "@/lib/project-state";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

type StepInputs = Record<string, string>;
type StepUploads = Record<string, ProjectAsset[]>;

function acceptAttr(accept: AppStep["accept"]): string {
  switch (accept) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "audio":
      return "audio/*";
    default:
      return "*/*";
  }
}

function kindForUpload(accept: AppStep["accept"]): AssetKind {
  if (accept === "audio") return "audio";
  if (accept === "video") return "video";
  return "reference";
}

async function fileToProjectAsset(
  file: File,
  projectId: string,
  accept: AppStep["accept"],
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, kindForUpload(accept));
}

function describeUpload(assets: ProjectAsset[]): string {
  if (!assets.length) return "(no file attached)";
  return assets.map((a) => a.name).join(", ");
}


export function AppWizard({
  recipe,
  projectId,
  busy,
  onSubmit,
}: {
  recipe: AppRecipe;
  projectId: string;
  busy: boolean;
  onSubmit: (args: { prompt: string; assets: ProjectAsset[] }) => void;
}) {
  // Only steps the user actively fills in (everything before the terminal node).
  const interactive = useMemo(
    () => recipe.steps.filter((s) => s.kind !== "generate"),
    [recipe],
  );
  const terminal = recipe.steps[recipe.steps.length - 1];

  const [stepIdx, setStepIdx] = useState(0);
  const [inputs, setInputs] = useState<StepInputs>({});
  const [uploads, setUploads] = useState<StepUploads>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (interactive.length === 0) {
    // No interactive steps — render a single Generate button (rare).
    return (
      <div className="rounded-3xl border border-border bg-card p-5">
        <Button
          className="w-full"
          disabled={busy}
          onClick={() =>
            onSubmit({
              prompt: composePrompt(recipe, {}, {}),
              assets: [],
            })
          }
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {terminal?.title ?? "Generate"}
        </Button>
      </div>
    );
  }

  const step = interactive[stepIdx];
  const isLast = stepIdx === interactive.length - 1;
  const value = inputs[step.id] ?? "";
  const stepUploads = uploads[step.id] ?? [];

  const canAdvance = (() => {
    if (step.kind === "upload") return stepUploads.length > 0;
    return value.trim().length > 0;
  })();

  const handleNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      const uploadsLabel: Record<string, string> = {};
      for (const [id, list] of Object.entries(uploads)) uploadsLabel[id] = describeUpload(list);
      const prompt = composePrompt(recipe, inputs, uploadsLabel);
      const allAssets = Object.values(uploads).flat();
      onSubmit({ prompt, assets: allAssets });
      return;
    }
    setStepIdx((i) => i + 1);
  };

  const handleBack = () => {
    if (stepIdx === 0) return;
    setStepIdx((i) => i - 1);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingId(step.id);
    try {
      const out: ProjectAsset[] = [];
      for (const f of Array.from(files)) {
        const a = await fileToProjectAsset(f, projectId, step.accept);
        out.push(a);
      }
      setUploads((prev) => ({ ...prev, [step.id]: [...(prev[step.id] ?? []), ...out] }));
    } catch (err) {
      console.error("[app-wizard] upload failed", err);
    } finally {
      setUploadingId(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeUpload = (assetId: string) => {
    setUploads((prev) => ({
      ...prev,
      [step.id]: (prev[step.id] ?? []).filter((a) => a.id !== assetId),
    }));
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-elegant">
      {/* Progress */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1.5">
          {interactive.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 w-8 rounded-full " +
                (i <= stepIdx ? "bg-primary" : "bg-muted")
              }
            />
          ))}
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Step {stepIdx + 1} / {interactive.length}
        </div>
      </div>

      {/* Header */}
      <div className="mb-4">
        <div className="text-base font-semibold tracking-tight text-foreground">
          {step.title}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{step.desc}</div>
      </div>

      {/* Body */}
      <div className="mb-5">
        {step.kind === "upload" && (
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingId === step.id}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/40 px-4 py-8 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-60"
            >
              {uploadingId === step.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <UploadIcon className="h-4 w-4" />
                  {stepUploads.length ? "Add another file" : "Choose a file or drop it here"}
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={acceptAttr(step.accept)}
              className="hidden"
              multiple
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {stepUploads.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stepUploads.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-2 pr-3 text-xs"
                  >
                    {a.mime.startsWith("image/") ? (
                      <img src={a.url} alt={a.name} className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                        {a.mime.startsWith("audio/") ? "♪" : a.mime.startsWith("video/") ? "▶" : "•"}
                      </div>
                    )}
                    <span className="max-w-[180px] truncate text-foreground">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeUpload(a.id)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step.kind === "choice" && (
          <div className="flex flex-col gap-3">
            {step.options && step.options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {step.options.map((opt) => {
                  const active = value === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setInputs((prev) => ({ ...prev, [step.id]: opt }))}
                      className={
                        "rounded-full border px-4 py-2 text-sm transition " +
                        (active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/50")
                      }
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
            <input
              type="text"
              value={value}
              onChange={(e) => setInputs((prev) => ({ ...prev, [step.id]: e.target.value }))}
              placeholder={step.options?.length ? "Or describe your own…" : "Type your choice…"}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        )}

        {step.kind === "prompt" && (
          <textarea
            value={value}
            onChange={(e) => setInputs((prev) => ({ ...prev, [step.id]: e.target.value }))}
            placeholder={step.placeholder ?? "Type here…"}
            rows={4}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleNext();
              }
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={stepIdx === 0 || busy}
          className="text-muted-foreground"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || busy || uploadingId === step.id}
        >
          {isLast ? (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {terminal?.title ?? "Generate"}
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

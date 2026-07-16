import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  PenLine,
  Sliders,
  Upload as UploadIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GenerateButton as SharedGenerateButton } from "@/components/v2/apps/shared/generate-button";
import type { Skill } from "@/lib/skills";
import { uploadProjectAsset } from "@/lib/local-projects";
import type { ProjectAsset } from "@/lib/project-state";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";

// ---------------------------------------------------------------------------
// Option data
// ---------------------------------------------------------------------------

type Tile = { id: string; label: string; color: string };

type ModeId = "image" | "describe" | "build";

const MODES: {
  id: ModeId;
  label: string;
  title: string;
  hint: string;
  icon: typeof ImageIcon;
  accent: string;
}[] = [
  {
    id: "image",
    label: "Start from image",
    title: "Start from image",
    hint: "Generate angles from a photo",
    icon: ImageIcon,
    accent: "#3b82f6",
  },
  {
    id: "describe",
    label: "Describe",
    title: "Describe",
    hint: "Write the look in words",
    icon: PenLine,
    accent: "#a855f7",
  },
  {
    id: "build",
    label: "Build from traits",
    title: "Build from traits",
    hint: "Pick type, looks, and style",
    icon: Sliders,
    accent: "#10b981",
  },
];

const STYLES: Tile[] = [
  { id: "Realistic", label: "Realistic", color: "#4b5563" },
  { id: "Anime", label: "Anime", color: "#f472b6" },
  { id: "3D Pixar", label: "3D Pixar", color: "#60a5fa" },
  { id: "Fantasy", label: "Fantasy", color: "#7c3aed" },
  { id: "RPG", label: "RPG", color: "#b45309" },
  { id: "Comic", label: "Comic", color: "#ef4444" },
  { id: "Cartoon", label: "Cartoon", color: "#f59e0b" },
  { id: "GTA", label: "GTA", color: "#10b981" },
  { id: "Studio Ghibli", label: "Studio Ghibli", color: "#86efac" },
  { id: "Low Poly 3D", label: "Low Poly 3D", color: "#22d3ee" },
  { id: "Claymation", label: "Claymation", color: "#d97706" },
];

const CHARACTER_TYPES: Tile[] = [
  { id: "human", label: "Human", color: "#a78bfa" },
  { id: "monster", label: "Monster", color: "#16a34a" },
  { id: "alien", label: "Alien", color: "#22d3ee" },
  { id: "elf", label: "Elf", color: "#84cc16" },
  { id: "crocodile", label: "Crocodile", color: "#15803d" },
  { id: "bug", label: "Bug", color: "#65a30d" },
  { id: "mantis", label: "Mantis", color: "#10b981" },
  { id: "dog", label: "Dog", color: "#b45309" },
  { id: "cat", label: "Cat", color: "#f97316" },
];

const GENDERS: Tile[] = [
  { id: "female", label: "Female", color: "#ec4899" },
  { id: "male", label: "Male", color: "#3b82f6" },
  { id: "trans-man", label: "Trans man", color: "#06b6d4" },
  { id: "trans-woman", label: "Trans woman", color: "#a855f7" },
  { id: "non-binary", label: "Non-binary", color: "#eab308" },
];

const ETHNICITIES: Tile[] = [
  { id: "African", label: "African", color: "#78350f" },
  { id: "Asian", label: "Asian", color: "#fde68a" },
  { id: "European", label: "European", color: "#fecaca" },
  { id: "Indian", label: "Indian", color: "#c2410c" },
  { id: "Middle Eastern", label: "Middle Eastern", color: "#a16207" },
  { id: "Mixed", label: "Mixed", color: "#9ca3af" },
];

const SKIN_COLORS: Tile[] = [
  { id: "#1c1310", label: "Ebony", color: "#1c1310" },
  { id: "#3b2418", label: "Deep", color: "#3b2418" },
  { id: "#6b4326", label: "Umber", color: "#6b4326" },
  { id: "#9b6a3f", label: "Tan", color: "#9b6a3f" },
  { id: "#c89b73", label: "Beige", color: "#c89b73" },
  { id: "#e9c3a0", label: "Fair", color: "#e9c3a0" },
  { id: "#f3d9bf", label: "Porcelain", color: "#f3d9bf" },
  { id: "#fbe8d3", label: "Ivory", color: "#fbe8d3" },
];

const EYE_COLORS: Tile[] = [
  { id: "#3b2412", label: "Brown", color: "#3b2412" },
  { id: "#1f2937", label: "Black", color: "#1f2937" },
  { id: "#1d4ed8", label: "Blue", color: "#1d4ed8" },
  { id: "#0e7490", label: "Teal", color: "#0e7490" },
  { id: "#15803d", label: "Green", color: "#15803d" },
  { id: "#a16207", label: "Hazel", color: "#a16207" },
  { id: "#6b21a8", label: "Violet", color: "#6b21a8" },
  { id: "#9ca3af", label: "Grey", color: "#9ca3af" },
];

const AGES: Tile[] = [
  { id: "Adult", label: "Adult", color: "#3b82f6" },
  { id: "Mature", label: "Mature", color: "#6366f1" },
  { id: "Senior", label: "Senior", color: "#64748b" },
];

const FASHION_STYLES: Tile[] = [
  { id: "Streetwear", label: "Streetwear", color: "#1f2937" },
  { id: "Formal", label: "Formal", color: "#111827" },
  { id: "Casual", label: "Casual", color: "#60a5fa" },
  { id: "Athleisure", label: "Athleisure", color: "#10b981" },
  { id: "Vintage", label: "Vintage", color: "#b45309" },
  { id: "Punk", label: "Punk", color: "#ef4444" },
  { id: "Gothic", label: "Gothic", color: "#0f172a" },
  { id: "Cyberpunk", label: "Cyberpunk", color: "#a855f7" },
  { id: "Boho", label: "Boho", color: "#d97706" },
  { id: "Minimalist", label: "Minimalist", color: "#9ca3af" },
  { id: "Y2K", label: "Y2K", color: "#f472b6" },
];

const VOICES = [
  { id: "", label: "No voice" },
  { id: "alloy", label: "Alloy — neutral" },
  { id: "verse", label: "Verse — warm" },
  { id: "aria", label: "Aria — bright" },
  { id: "sage", label: "Sage — calm" },
  { id: "ember", label: "Ember — gravelly" },
];

const MODELS = [
  { value: "fal-ai/nano-banana", label: "Nano Banana — fast" },
  { value: "fal-ai/nano-banana/edit", label: "Nano Banana Edit (uses reference)" },
  { value: "fal-ai/flux-pro/v1.1", label: "Flux Pro 1.1 — photoreal" },
  { value: "fal-ai/flux/schnell", label: "Flux Schnell — snappy" },
  { value: "fal-ai/ideogram/v3", label: "Ideogram v3" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}

// ---------------------------------------------------------------------------
// Reusable tile picker — solid color placeholder, label bottom-left
// ---------------------------------------------------------------------------

function TilePicker({
  label,
  tiles,
  value,
  onChange,
  columns = 2,
  allowCustom = false,
  customPlaceholder = "Type your own",
}: {
  label: string;
  tiles: Tile[];
  value: string;
  onChange: (id: string) => void;
  columns?: 2 | 3 | 4;
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const gridCols =
    columns === 4
      ? "grid-cols-4"
      : columns === 3
        ? "grid-cols-3"
        : "grid-cols-2";
  const isCustomActive =
    allowCustom && value !== "" && !tiles.some((t) => t.id === value);
  return (
    <section className="rounded-lg border border-hairline bg-card p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{label}</div>
      <div className={cn("grid gap-2", gridCols)}>
        {tiles.map((t) => {
          const selected = value === t.id;
          const isSwatch = t.id.startsWith("#");
          if (isSwatch) {
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className={cn(
                  "hover-lift group relative flex flex-col items-center justify-center gap-2 rounded-lg p-3 text-center",
                  "bg-muted text-foreground ring-1 ring-inset ring-hairline",
                  selected && "ring-2 ring-foreground",
                )}
                aria-pressed={selected}
              >
                <span
                  className="relative grid h-9 w-9 place-items-center rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: t.color }}
                >
                  {selected && (
                    <Check
                      className="h-4 w-4 text-white"
                      strokeWidth={3}
                      style={{
                        filter:
                          "drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.6))",
                      }}
                    />
                  )}
                </span>
                <span className="text-[11px] font-medium text-foreground">
                  {t.label}
                </span>
              </button>
            );
          }
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "hover-lift group relative aspect-square overflow-hidden rounded-lg text-left",
                "bg-muted text-foreground ring-1 ring-inset ring-hairline",
                selected && "ring-2 ring-foreground",
              )}
              aria-pressed={selected}
            >
              <span className="absolute bottom-2 left-2.5 text-xs font-semibold text-foreground">
                {t.label}
              </span>
              {selected && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
        {allowCustom && (
          <label
            className={cn(
              "hover-lift relative aspect-square cursor-text overflow-hidden rounded-lg",
              "bg-muted text-foreground ring-1 ring-inset ring-hairline",
              isCustomActive && "ring-2 ring-foreground",
            )}
          >
            <input
              type="text"
              value={isCustomActive ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={customPlaceholder}
              aria-label={`Custom ${label.toLowerCase()}`}
              className="absolute bottom-2 left-2.5 right-2.5 bg-transparent text-xs font-semibold text-foreground placeholder:font-semibold placeholder:text-muted-foreground focus:outline-none"
            />
            {isCustomActive && (
              <span className="pointer-events-none absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background">
                <Check className="h-3 w-3" />
              </span>
            )}
          </label>
        )}
      </div>

    </section>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function CharacterCreatorPanel({
  skill,
  projectId,
  busy,
  seedAsset,
  onSeedConsumed,
  onSubmit,
  onSubViewChange,
  onEnsureProject,
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
    modelOverride?: string;
  }) => void;
  /**
   * Reports the active sub-view so the App column header can override the
   * title and the back button. Pass `null` to clear.
   */
  onSubViewChange?: (
    view: { label: string; onBack: () => void } | null,
  ) => void;
  /**
   * When the panel needs a real project (e.g. to upload an asset), it calls
   * this to lazily create one. Without it the panel falls back to the
   * `projectId` prop, which is `"anonymous-draft"` before the user submits —
   * that fails the server-side UUID check and the upload silently no-ops.
   */
  onEnsureProject?: () => Promise<string>;
}) {
  void skill;
  const [mode, setMode] = useState<ModeId | null>(null);

  // Mode 1 — image (also shared photo input for describe)
  const [reference, setReference] = useState<ProjectAsset | null>(null);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState<string>("");
  const [story, setStory] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { isOver: refIsOver, dropProps: refDropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setReference(a),
  });

  // Mode 2 — describe
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<string>("fal-ai/nano-banana");
  const [style, setStyle] = useState<string>("Realistic");

  // Mode 1 — image model
  const [imageModel, setImageModel] = useState<string>("fal-ai/nano-banana/edit");

  // Mode 3 — build
  const [charType, setCharType] = useState<string>("human");
  const [gender, setGender] = useState<string>("female");
  const [ethnicity, setEthnicity] = useState<string>("European");
  const [skin, setSkin] = useState<string>(SKIN_COLORS[3].id);
  const [eye, setEye] = useState<string>(EYE_COLORS[0].id);
  const [age, setAge] = useState<string>("Adult");
  const [fashion, setFashion] = useState<string>("Casual");
  const [buildModel, setBuildModel] = useState<string>("fal-ai/nano-banana");


  const goBackToPicker = () => setMode(null);

  // Push header override up to AppRunner whenever the sub-view changes.
  useEffect(() => {
    if (!onSubViewChange) return;
    if (mode === null) {
      onSubViewChange(null);
      return;
    }
    const m = MODES.find((x) => x.id === mode);
    if (!m) return;
    onSubViewChange({ label: m.title, onBack: goBackToPicker });
    return () => onSubViewChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Auto-switch model when a reference is added in describe mode
  useEffect(() => {
    if (mode !== "describe") return;
    if (reference && model === "fal-ai/nano-banana") {
      setModel("fal-ai/nano-banana/edit");
    }
    if (!reference && model === "fal-ai/nano-banana/edit") {
      setModel("fal-ai/nano-banana");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  // Consume any seeded asset (drag-from-outputs) — auto-jump to Start from image
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    setReference(seedAsset);
    setMode("image");
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handlePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setReference(first);
      return;
    }
    const file = result.files[0];
    if (!file) return;
    setUploading(true);
    try {
      // Uploads need a real project row (UUID). Before the user has submitted
      // anything, `projectId` is the sentinel "anonymous-draft" — which fails
      // the server's UUID check and the upload silently no-ops. Lazily mint a
      // project here so first-time uploads work.
      let uploadProjectId = projectId;
      if (onEnsureProject && (!projectId || projectId === "anonymous-draft")) {
        uploadProjectId = await onEnsureProject();
      }
      const asset = await fileToProjectAsset(file, uploadProjectId);
      setReference(asset);
    } catch (err) {
      console.error("[character-creator] upload failed", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Approach picker (initial view)
  // -------------------------------------------------------------------------

  if (mode === null) {
    return (
      <div className="@container">
        <div className="flex flex-col gap-2 @sm:gap-3">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className="hover-lift group relative flex items-center gap-3 rounded-xl border border-hairline bg-card p-4 text-left @sm:gap-4 @sm:rounded-lg @sm:p-6"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white @sm:h-12 @sm:w-12 @sm:rounded-xl"
                  style={{ backgroundColor: m.accent }}
                >
                  <Icon className="h-4 w-4 @sm:h-5 @sm:w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {m.hint}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }


  // -------------------------------------------------------------------------
  // Sub-view: validation + prompt build
  // -------------------------------------------------------------------------

  const canSubmit =
    mode === "image"
      ? !!reference
      : mode === "describe"
        ? description.trim().length > 0
        : true;

  const GRID_LAYOUT = `Compose the output as a single image on a pure white seamless background, arranged as a clean reference sheet. ABSOLUTELY NO borders, frames, rectangles, outlines, strokes, panel edges, dividers, gutters, vertical or horizontal divider lines, separator lines, rules, lines of any kind, boxes, mats, drop shadows, vignettes, labels, captions, watermarks, or text of any kind anywhere in the image. Do NOT draw a vertical line down the middle of the canvas. Do NOT draw any line between subjects. The white background must read as one continuous unbroken field around and between every subject — separation between subjects comes ONLY from empty white space, never from any drawn line or stroke. Layout, exact proportions: the canvas is conceptually split vertically into two equal halves (left 50%, right 50%) by empty white space alone (no visible line), with generous empty white space separating every subject. The LEFT HALF shows a full-body shot of the character standing, facing camera, head-to-toe, centered, full figure visible with comfortable margin. The RIGHT HALF is arranged as two stacked regions separated only by empty white space: the TOP region (about 70% of the right column's height) shows ONE large 3/4 angle portrait (head and shoulders, three-quarter view, centered) — only a single portrait, not multiple; the BOTTOM region (about 30%) shows three small tight head-only close-ups of the SAME character side by side with three distinct facial expressions, in this order left to right: neutral, smiling, surprised, separated only by empty white space. Identical character identity (face, hair, skin, eyes, outfit, age) across every subject. Soft even studio lighting, pure white seamless background everywhere, sharp focus, photographic consistency, no props, no cast shadows on the background.`;
  const buildPrompt = (): { prompt: string; modelOverride?: string } => {
    if (mode === "image") {
      const base = `Character reference sheet of ${name.trim() || "the character"}, recreated from the supplied reference photo, preserving identity, face, hair, and proportions. ${GRID_LAYOUT}`;
      const extra = story.trim() ? ` Background story (for character only, do not render as scenery): ${story.trim()}.` : "";
      return { prompt: base + extra, modelOverride: imageModel };
    }
    if (mode === "describe") {
      const finalModel =
        reference && model === "fal-ai/nano-banana"
          ? "fal-ai/nano-banana/edit"
          : model;
      const prompt = `${reference ? `Recreate the character from the reference image as: ` : `Character: `}${description.trim()}. Style: ${style}. ${GRID_LAYOUT}`;
      return { prompt, modelOverride: finalModel };
    }
    const skinLabel = SKIN_COLORS.find((s) => s.id === skin)?.label ?? "";
    const eyeLabel = EYE_COLORS.find((e) => e.id === eye)?.label ?? "";
    const parts = [
      `Character: ${ethnicity} ${gender} ${charType}.`,
      `Age: ${age}.`,
      skinLabel ? `Skin tone: ${skinLabel} (${skin}).` : "",
      eyeLabel ? `Eye color: ${eyeLabel} (${eye}).` : "",
      `Fashion style: ${fashion}.`,
      GRID_LAYOUT,
    ].filter(Boolean);
    return { prompt: parts.join(" "), modelOverride: buildModel };
  };


  const handleGenerate = () => {
    if (!canSubmit) return;
    const { prompt, modelOverride } = buildPrompt();
    onSubmit({
      prompt,
      assets:
        (mode === "image" || mode === "describe") && reference ? [reference] : [],
      params: {
        // Wider canvas so the left full-body + right portrait/expressions grid fits cleanly.
        aspect_ratio: "3:2",
        num_images: 1,
        ...(name.trim() ? { character_name: name.trim() } : {}),
        ...(voice ? { voice, voice_label: VOICES.find((v) => v.id === voice)?.label ?? voice } : {}),
      },
      modelOverride,
    });
  };

  const nameAndVoiceSections = (
    <>
      <section className="rounded-lg border border-hairline bg-card p-4">
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Character name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mira Voss"
          className="w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </section>
      <section className="rounded-lg border border-hairline bg-card p-4">
        <label className="mb-1.5 block text-sm font-semibold text-foreground">
          Voice <span className="text-muted-foreground">(optional)</span>
        </label>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          {VOICES.map((v) => (
            <option key={v.id || "none"} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </section>
    </>
  );


  // -------------------------------------------------------------------------
  // Mode 1 — Start from image:  photo → name → voice → story
  // -------------------------------------------------------------------------

  if (mode === "image") {
    return (
      <div className="flex flex-col gap-4">
        {nameAndVoiceSections}
        <section
          {...refDropProps}
          className={cn(
            "rounded-lg border border-hairline bg-card p-4 transition",
            refIsOver && "border-primary ring-2 ring-primary/40",
          )}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-sm font-semibold text-foreground">
              Front-facing photo
            </div>
            <div className="text-[11px] text-muted-foreground">required</div>
          </div>
          {reference ? (
            <div className="flex items-center gap-3 rounded-xl border border-hairline bg-muted/40 p-2">
              <img
                src={reference.url}
                alt={reference.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1 text-xs">
                <div className="truncate font-medium text-foreground">
                  {reference.name}
                </div>
                <div className="text-muted-foreground">
                  We'll generate a 2×2 angle sheet from this photo.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReference(null)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove reference"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-background/40 px-4 py-6 text-sm text-muted-foreground hover-lift hover:text-foreground disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <UploadIcon className="h-4 w-4" /> Upload a front-facing photo
                </>
              )}
            </button>
          )}
          <AssetPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            accept="image"
            onPick={(r) => void handlePicked(r)}
          />
        </section>





        <section className="rounded-lg border border-hairline bg-card p-4">
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Background story{" "}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <AppTextarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Who are they? What's their world?"
            rows={3}
          />
        </section>

        <ModelPicker value={imageModel} onChange={setImageModel} />
        <GenerateButton skill={skill}
          disabled={!canSubmit || busy || uploading}
          onClick={handleGenerate}
        />
      </div>
    );
  }


  // -------------------------------------------------------------------------
  // Mode 2 — Describe
  // -------------------------------------------------------------------------

  if (mode === "describe") {
    return (
      <div className="flex flex-col gap-4">
        {nameAndVoiceSections}
        <section className="rounded-lg border border-hairline bg-card p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">
            Describe your character
          </div>
          <AppTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Appearance, style, clothing, unique features…"
            rows={5}
          />
        </section>
        <TilePicker label="Style" tiles={STYLES} value={style} onChange={setStyle} />

        <ModelPicker value={model} onChange={setModel} />


        <GenerateButton skill={skill}
          disabled={!canSubmit || busy || uploading}
          onClick={handleGenerate}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Mode 3 — Build from traits
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {nameAndVoiceSections}
      <TilePicker
        label="Character type"
        tiles={CHARACTER_TYPES}
        value={charType}
        onChange={setCharType}
        allowCustom
        customPlaceholder="Custom…"
      />
      <TilePicker label="Gender" tiles={GENDERS} value={gender} onChange={setGender} />
      <TilePicker
        label="Ethnicity / Origin base"
        tiles={ETHNICITIES}
        value={ethnicity}
        onChange={setEthnicity}
      />
      <TilePicker
        label="Skin color"
        tiles={SKIN_COLORS}
        value={skin}
        onChange={setSkin}
        columns={4}
      />
      <TilePicker
        label="Eye color"
        tiles={EYE_COLORS}
        value={eye}
        onChange={setEye}
        columns={4}
      />
      <TilePicker label="Age" tiles={AGES} value={age} onChange={setAge} columns={3} />
      <TilePicker
        label="Fashion style"
        tiles={FASHION_STYLES}
        value={fashion}
        onChange={setFashion}
        allowCustom
        customPlaceholder="Custom…"
      />
      <ModelPicker value={buildModel} onChange={setBuildModel} />



      <GenerateButton skill={skill}
        disabled={!canSubmit || busy}
        onClick={handleGenerate}
      />
    </div>
  );
}

function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section className="rounded-lg border border-hairline bg-card p-4">
      <div className="mb-2 text-sm font-semibold text-foreground">
        Image model
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </section>
  );
}

function GenerateButton({
  skill,
  disabled,
  onClick,
}: {
  skill: Skill;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <SharedGenerateButton
      skill={skill}
      label="Generate character"
      disabled={disabled}
      onClick={onClick}
    />
  );
}

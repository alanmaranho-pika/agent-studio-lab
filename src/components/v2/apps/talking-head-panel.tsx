import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload as UploadIcon, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import type { Skill } from "@/lib/skills";
import { generateVoiceoverAsset } from "@/lib/tts.functions";
import type { ProjectAsset } from "@/lib/project-state";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { fileToProjectAsset } from "@/lib/v2/upload-asset";
import { cn } from "@/lib/utils";

// Lipsync models available via fal.ai that accept a still image + audio pair.
// Note: sync-lipsync, Veo 3, and Wan only accept *video* inputs, so they aren't
// listed here — Talking Head Studio is image+audio → video.
const LIPSYNC_MODELS = [
  {
    value: "fal-ai/infinitalk",
    label: "InfiniteTalk",
    hint: "Talking avatars from a single image · natural expressions",
  },
  {
    value: "fal-ai/kling-video/ai-avatar/v2/standard",
    label: "Kling AI Avatar v2 (Standard)",
    hint: "Kling 2 avatar · humans, cartoons, stylized characters",
  },
  {
    value: "fal-ai/kling-video/ai-avatar/v2/pro",
    label: "Kling AI Avatar v2 (Pro)",
    hint: "Premium Kling avatar · highest fidelity",
  },
] as const;

const VOICES = [
  { value: "Rachel", label: "Rachel (warm female)" },
  { value: "Adam", label: "Adam (deep male)" },
  { value: "Bella", label: "Bella (soft female)" },
  { value: "Antoni", label: "Antoni (smooth male)" },
  { value: "Domi", label: "Domi (energetic female)" },
];

// `fileToProjectAsset` is now the shared chunked-base64 helper from
// `@/lib/v2/upload-asset`.

export function TalkingHeadPanel({
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
    modelOverride?: string;
  }) => void;
}) {
  const ttsFn = useServerFn(generateVoiceoverAsset);

  const [image, setImage] = useState<ProjectAsset | null>(null);
  const [audio, setAudio] = useState<ProjectAsset | null>(null);
  const [audioTab, setAudioTab] = useState<"text" | "generate">("text");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>("Rachel");
  const [model, setModel] = useState<string>(LIPSYNC_MODELS[0].value);

  const [imgPickerOpen, setImgPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isOver: imgIsOver, dropProps: imgDropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setImage(a),
  });
  const { isOver: audioIsOver, dropProps: audioDropProps } = useAssetDropTarget({
    projectId,
    accept: "audio",
    onAsset: (a) => setAudio(a),
  });

  // Seed an uploaded image from the wizard handoff.
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime.startsWith("image/")) setImage(seedAsset);
    else if (seedAsset.mime.startsWith("audio/")) setAudio(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handleImagePicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setImage(first);
      return;
    }
    const file = result.files[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      setImage(await fileToProjectAsset(file, projectId, "reference"));
    } catch (err) {
      console.error("[talking-head] image upload failed", err);
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploadingImg(false);
    }
  };

  const handleAudioPicked = async (result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setAudio(first);
      return;
    }
    const file = result.files[0];
    if (!file) return;
    setUploadingAudio(true);
    try {
      setAudio(await fileToProjectAsset(file, projectId, "audio"));
    } catch (err) {
      console.error("[talking-head] audio upload failed", err);
      toast.error(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
    }
  };

  const canSubmit =
    !!image &&
    ((audioTab === "text" && text.trim().length > 0) ||
      (audioTab === "generate" && (audio || text.trim().length > 0)) ||
      !!audio);

  const handleGenerate = async () => {
    if (!image) {
      setError("Upload an image of a face first.");
      return;
    }
    setError(null);

    let finalAudio = audio;
    if (!finalAudio) {
      // No uploaded audio — synthesize from the text in whichever tab is active.
      if (text.trim().length === 0) {
        setError("Type what the character should say, or upload an audio clip.");
        return;
      }
      setGeneratingVoice(true);
      try {
        finalAudio = await ttsFn({
          data: { projectId, text: text.trim(), voice },
        });
        setAudio(finalAudio);
      } catch (err) {
        console.error("[talking-head] tts failed", err);
        setError("Couldn't generate voiceover. Try again or upload audio.");
        setGeneratingVoice(false);
        return;
      }
      setGeneratingVoice(false);
    }

    onSubmit({
      prompt: text.trim() || "Lipsync the character to the provided audio.",
      assets: [image, finalAudio],
      params: { audio_url: finalAudio.url },
      modelOverride: model,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Face / character image */}
      <section
        {...imgDropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          imgIsOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">
            Face Image
          </div>
          <div className="text-[11px] text-muted-foreground">required</div>
        </div>
        {image ? (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2">
            <img
              src={image.url}
              alt={image.name}
              className="h-20 w-20 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1 text-xs">
              <div className="truncate font-medium text-foreground">
                {image.name}
              </div>
              <div className="text-muted-foreground">
                We'll animate this face to match the audio.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setImage(null)}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setImgPickerOpen(true)}
            disabled={uploadingImg}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover-lift hover:text-foreground disabled:opacity-60"
          >
            {uploadingImg ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : (
              <><UploadIcon className="h-4 w-4" /> Upload a face</>
            )}
          </button>
        )}
        <AssetPickerDialog
          open={imgPickerOpen}
          onOpenChange={setImgPickerOpen}
          accept="image"
          onPick={(r) => void handleImagePicked(r)}
        />
      </section>

      {/* Audio source: tabs */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-3 grid w-full grid-cols-2 rounded-full border border-hairline bg-muted/40 p-0.5 text-xs">
          {([
            { id: "text", label: "Audio text" },
            { id: "generate", label: "Generate Audio" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAudioTab(t.id)}
              className={cn(
                "rounded-full px-3 py-1 text-center transition",
                audioTab === t.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>


        <AppTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should the character say?"
          rows={4}
        />

        {audioTab === "generate" && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-muted-foreground">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {VOICES.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              We'll synthesize this text into speech with the chosen voice before lipsyncing.
            </p>
          </div>
        )}
      </section>

      {/* Optional audio upload */}
      <section
        {...audioDropProps}
        className={cn(
          "rounded-lg border border-hairline bg-card p-4 transition",
          audioIsOver && "border-primary ring-2 ring-primary/40",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">Upload audio</div>
          <div className="text-[11px] text-muted-foreground">optional · overrides text</div>
        </div>
        {audio ? (
          <div className="flex items-center gap-3 rounded-md border border-hairline bg-muted/40 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{audio.name}</div>
              <audio src={audio.url} controls className="mt-1 w-full" />
            </div>
            <button
              type="button"
              onClick={() => setAudio(null)}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Remove audio"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAudioPickerOpen(true)}
            disabled={uploadingAudio}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-4 text-sm text-muted-foreground hover-lift hover:text-foreground disabled:opacity-60"
          >
            {uploadingAudio ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : (
              <><UploadIcon className="h-4 w-4" /> Upload audio</>
            )}
          </button>
        )}
        <AssetPickerDialog
          open={audioPickerOpen}
          onOpenChange={setAudioPickerOpen}
          accept="audio"
          onPick={(r) => void handleAudioPicked(r)}
        />
      </section>

      {/* Model */}
      <section className="rounded-lg border border-hairline bg-card p-4">
        <div className="mb-2 text-sm font-semibold text-foreground">Model</div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          {LIPSYNC_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <GenerateButton
        skill={skill}
        onClick={() => void handleGenerate()}
        disabled={!canSubmit || busy || uploadingImg || uploadingAudio}
        busy={generatingVoice}
        busyLabel="Generating voice…"
      />

    </div>
  );
}

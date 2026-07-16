// SpecialProductAdPanel — a "Special App" (multi-shot) wizard that walks
// the user through Product → Brief → Concept → Style + Model → Produce and
// kicks off a Seedance 2.0 render. The wizard layout mirrors the regular
// app panels (same section shell) so it feels consistent; the only "special"
// signal is a subtle Multi-shot pill in the header below.

import { AppTextarea } from "@/components/v2/apps/shared/app-textarea";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload as UploadIcon, X, Sparkles, RefreshCw, ArrowLeft, Link as LinkIcon, User as UserIcon } from "lucide-react";
import { scrapeProductUrl } from "@/lib/product-scrape.functions";

import { Button } from "@/components/ui/button";
import { GenerateButton } from "@/components/v2/apps/shared/generate-button";
import { Slider } from "@/components/ui/slider";
import type { Skill } from "@/lib/skills";
import { uploadProjectAsset, getProject, updateProjectState, useLocalProjectFn } from "@/lib/local-projects";
import {
  generateAdConcept,
  composeSeedancePrompt,
  suggestAdLooks,
  type AdConcept,
  type SuggestedLook,
} from "@/lib/special-product-ad.functions";
import { produceKlingAd } from "@/lib/kling-render.functions";
import {
  createBeatPlaceholder,
  finalizeBeatPlaceholder,
} from "@/lib/short-film.functions";
import type { ProjectAsset } from "@/lib/project-state";
import {
  AssetPickerDialog,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";
import { CharacterPickerDialog } from "@/components/v2/library/character-picker-dialog";
import type { LibraryCharacter } from "@/lib/characters.functions";
import { useAssetDropTarget } from "@/components/v2/apps/use-asset-drop";
import { MultiShotBadge, Section } from "@/components/v2/apps/special-app-shell";
import { cn } from "@/lib/utils";
import { fileToProjectAsset as sharedUpload } from "@/lib/v2/upload-asset";



const DEFAULT_LOOKS: ReadonlyArray<SuggestedLook> = [
  { label: "Cinematic", hint: "Filmic lighting, shallow depth, dramatic camera" },
  { label: "Clean studio", hint: "Seamless backdrop, soft key, product-first" },
  { label: "Lifestyle", hint: "In-context, natural light, candid moments" },
  { label: "Editorial", hint: "Magazine-grade composition, considered color" },
];

const LENGTHS = [
  { value: 8, label: "8s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 90, label: "1m 30s" },
  { value: 120, label: "2m" },
] as const;

type LengthSec = (typeof LENGTHS)[number]["value"];

const ASPECTS = [
  { value: "16:9", label: "16:9", hint: "Landscape", w: 32, h: 18 },
  { value: "9:16", label: "9:16", hint: "Vertical", w: 18, h: 32 },
  { value: "1:1", label: "1:1", hint: "Square", w: 28, h: 28 },
  { value: "4:5", label: "4:5", hint: "Portrait", w: 24, h: 30 },
] as const;

type AudioOption = "music" | "voiceover" | "talking";
const AUDIO_OPTIONS: ReadonlyArray<{
  value: AudioOption;
  label: string;
  hint: string;
  notePlaceholder: string;
}> = [
  {
    value: "music",
    label: "Music bed",
    hint: "Instrumental score under the spot.",
    notePlaceholder: "Music direction (genre, mood, tempo, references…)",
  },
  {
    value: "voiceover",
    label: "Voiceover narration",
    hint: "AI narrator reads a line over the ad.",
    notePlaceholder: "What the narrator says — and voice notes (warm female, gravelly male…)",
  },
  {
    value: "talking",
    label: "Talking characters",
    hint: "On-screen character lip-syncs the line.",
    notePlaceholder: "Character line + voice notes (who they are, tone, accent…)",
  },
];

const VIDEO_PATHS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
  model: string;
  modelI2V: string;
  disabled?: boolean;
}> = [
  {
    value: "seedance",
    label: "Seedance 2.0",
    hint: "One long prompt with story beats, timecodes, and built-in audio. Premium.",
    model: "bytedance/seedance-2.0/text-to-video",
    modelI2V: "bytedance/seedance-2.0/reference-to-video",
  },

  {
    value: "kling-cheap",
    label: "Kling Standard (cheaper)",
    hint: "Per-shot keyframes animated with Kling Standard, then stitched together.",
    model: "fal-ai/kling-video/v2.1/standard/text-to-video",
    modelI2V: "fal-ai/kling-video/v2.1/standard/image-to-video",
  },
];

async function fileToProjectAsset(
  file: File,
  projectId: string,
): Promise<ProjectAsset> {
  return sharedUpload(file, projectId, "reference");
}


export function SpecialProductAdPanel({
  skill,
  projectId,
  busy,
  seedAsset,
  onSeedConsumed,
  onSubmit,
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
    params?: Record<string, string | number | boolean | string[]>;
    modelOverride?: string;
    intent?: { kind: "appendVisual" | "appendAudio" };
  }) => void;
  onEnsureProject?: () => Promise<string>;
}) {

  const conceptFn = useServerFn(generateAdConcept);
  const klingFn = useServerFn(produceKlingAd);
  const getProjectFn = useLocalProjectFn(getProject);
  const updateStateFn = useLocalProjectFn(updateProjectState);
  const scrapeFn = useServerFn(scrapeProductUrl);
  const suggestLooksFn = useServerFn(suggestAdLooks);
  const createPlaceholderFn = useServerFn(createBeatPlaceholder);
  const finalizePlaceholderFn = useServerFn(finalizeBeatPlaceholder);

  // Section 1 — product image
  const [image, setImage] = useState<ProjectAsset | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productUrl, setProductUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Section 2 — brief
  const [brief, setBrief] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  // Auto-grow the brief textarea to fit its content (set after URL scrape so
  // the input matches the height of the generated copy).
  const autoSizeBrief = () => {
    const el = briefRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 600)}px`;
  };
  const [lengthSec, setLengthSec] = useState<LengthSec>(15);
  const [aspect, setAspect] = useState<string>("16:9");
  const [productHint, setProductHint] = useState("");

  // Featured character (optional) — pulled from the user's Library so look
  // and voice stay consistent across spots.
  const [featuredCharacter, setFeaturedCharacter] = useState<LibraryCharacter | null>(null);
  const [charPickerOpen, setCharPickerOpen] = useState(false);


  // Section 4 — audio (multi-select, each with notes)
  const [audioSelected, setAudioSelected] = useState<Record<AudioOption, boolean>>({
    music: false,
    voiceover: false,
    talking: false,
  });
  const [audioNotes, setAudioNotes] = useState<Record<AudioOption, string>>({
    music: "",
    voiceover: "",
    talking: "",
  });
  const toggleAudio = (k: AudioOption) =>
    setAudioSelected((s) => ({ ...s, [k]: !s[k] }));
  const setAudioNote = (k: AudioOption, v: string) =>
    setAudioNotes((n) => ({ ...n, [k]: v }));
  const anyAudio =
    audioSelected.music || audioSelected.voiceover || audioSelected.talking;

  // Section 3 — concept
  const [concept, setConcept] = useState<AdConcept | null>(null);
  const [writingConcept, setWritingConcept] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);

  // Section 4 — style + model
  const [lookOptions, setLookOptions] = useState<SuggestedLook[]>([...DEFAULT_LOOKS]);
  const [looksLoading, setLooksLoading] = useState(false);
  const [look, setLook] = useState<string>(DEFAULT_LOOKS[0].label);
  const [customLook, setCustomLook] = useState<string>("");
  const [videoPath, setVideoPath] = useState<string>("seedance");

  // Section 5 — produce
  const [error, setError] = useState<string | null>(null);
  const [klingBusy, setKlingBusy] = useState(false);

  // Wizard step ordering: 0=Product, 1=Brief, 2=Audio, 3=Concept, 4=Look, 5=Render.
  const TOTAL_STEPS = 6;
  const [openStep, setOpenStep] = useState<number | null>(0);
  // Highest step the user has confirmed — drives Continue vs Update labels.
  const [maxStep, setMaxStep] = useState<number>(0);
  const goBack = (i: number) => setOpenStep(Math.max(0, i - 1));
  // Mark step `i` complete and open step `i+1` (or stay if last).
  const commitStep = (i: number) => {
    setMaxStep((m) => Math.max(m, i + 1));
    setOpenStep(i + 1 >= TOTAL_STEPS ? i : i + 1);
  };
  // Re-collapse after editing an already-completed step ("Update" tap).
  const applyEdit = () => setOpenStep(Math.min(TOTAL_STEPS - 1, maxStep));
  const currentStep = openStep ?? 0;
  const progressPct = Math.round(((currentStep + 1) / TOTAL_STEPS) * 100);

  // ── Durable wizard state ────────────────────────────────────────
  // Persist inputs to localStorage keyed by projectId so revisiting the
  // project restores the product image, brief, concept, style, audio, etc.
  // and the user can edit and re-generate.
  const storageKey =
    projectId && projectId !== "anonymous-draft"
      ? `pika.productad.v1:${projectId}`
      : null;
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !storageKey || typeof window === "undefined") return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (s.image && typeof s.image === "object") setImage(s.image as ProjectAsset);
      if (typeof s.brief === "string") {
        setBrief(s.brief);
        requestAnimationFrame(autoSizeBrief);
      }
      if (typeof s.lengthSec === "number") setLengthSec(s.lengthSec as LengthSec);
      if (typeof s.aspect === "string") setAspect(s.aspect);
      if (typeof s.productHint === "string") setProductHint(s.productHint);
      if (typeof s.productUrl === "string") setProductUrl(s.productUrl);
      if (s.audioSelected && typeof s.audioSelected === "object") {
        setAudioSelected(s.audioSelected as Record<AudioOption, boolean>);
      }
      if (s.audioNotes && typeof s.audioNotes === "object") {
        setAudioNotes(s.audioNotes as Record<AudioOption, string>);
      }
      if (s.concept) setConcept(s.concept as AdConcept);
      if (typeof s.look === "string") setLook(s.look);
      if (typeof s.videoPath === "string") setVideoPath(s.videoPath);
      if (typeof s.maxStep === "number") setMaxStep(s.maxStep);
      if (typeof s.openStep === "number") setOpenStep(s.openStep);
      if (s.featuredCharacter && typeof s.featuredCharacter === "object") {
        setFeaturedCharacter(s.featuredCharacter as LibraryCharacter);
      }
    } catch {
      /* corrupt cache — ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydratedRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          image,
          brief,
          lengthSec,
          aspect,
          productHint,
          productUrl,
          audioSelected,
          audioNotes,
          concept,
          look,
          videoPath,
          openStep,
          maxStep,
          featuredCharacter,
        }),
      );
    } catch {
      /* quota or serialization issue — ignore */
    }
  }, [
    storageKey,
    image,
    brief,
    lengthSec,
    aspect,
    productHint,
    productUrl,
    audioSelected,
    audioNotes,
    concept,
    look,
    videoPath,
    openStep,
    maxStep,
    featuredCharacter,
  ]);




  const { isOver: imgIsOver, dropProps: imgDropProps } = useAssetDropTarget({
    projectId,
    accept: "image",
    onAsset: (a) => setImage(a),
  });

  // Seed handoff (if user came in with a reference image).
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedAsset) return;
    if (seededRef.current === seedAsset.id) return;
    seededRef.current = seedAsset.id;
    if (seedAsset.mime?.startsWith("image/")) setImage(seedAsset);
    onSeedConsumed?.();
  }, [seedAsset, onSeedConsumed]);

  const handlePick = async (result: PickerResult) => {
    if (result.kind === "library") {
      const first = result.assets[0];
      if (first) setImage(first);
      return;
    }
    const file = result.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      setImage(await fileToProjectAsset(file, pid));
    } catch (err) {
      console.error("[special-product-ad] upload failed", err);
    } finally {
      setUploading(false);
    }

  };

  const handleScrape = async () => {
    const raw = productUrl.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setScrapeError(null);
    setScraping(true);
    try {
      const pid = onEnsureProject ? await onEnsureProject() : projectId;
      const result = await scrapeFn({ data: { projectId: pid, url } });

      if (result.image) setImage(result.image);
      if (result.productName) setProductHint(result.productName);
      if (result.brief) {
        setBrief(result.brief);
        requestAnimationFrame(autoSizeBrief);
      }
      if (result.look) setLook(result.look);
      if (!result.image) {
        setScrapeError(
          "Filled in product details, but couldn't grab the image (the site blocks downloads). Upload one below.",
        );
      }
    } catch (err) {
      console.error("[special-product-ad] scrape failed", err);
      setScrapeError(
        err instanceof Error
          ? err.message
          : "Couldn't read that page. Try a different URL or upload an image instead.",
      );
    } finally {
      setScraping(false);
    }
  };

  const briefReady = brief.trim().length >= 8;
  const conceptReady = !!concept;

  // Generate look suggestions tailored to the current concept (the screenplay).
  // Falls back to brief-only when no concept yet — but in the new flow the
  // Look step only opens after the concept exists, so we'll almost always
  // have it.
  const lookSigRef = useRef<string>("");
  const refreshLookSuggestions = async (_opts?: { silent?: boolean }) => {
    if (!briefReady && !concept) return;
    setLooksLoading(true);
    try {
      const conceptText = concept
        ? [
            concept.logline,
            ...concept.beats.map(
              (b, i) => `Shot ${i + 1} (${b.timecode}): ${b.action}`,
            ),
            concept.cta ? `CTA: ${concept.cta}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : undefined;
      const looks = await suggestLooksFn({
        data: {
          brief: brief.trim() || undefined,
          productHint: productHint.trim() || undefined,
          concept: conceptText,
        },
      });
      if (looks.length) {
        setLookOptions(looks);
        if (!customLook.trim()) setLook(looks[0].label);
      }
    } catch (err) {
      console.error("[special-product-ad] suggestLooks failed", err);
    } finally {
      setLooksLoading(false);
    }
  };

  // Auto-suggest once a concept is written — that's the screenplay the DP
  // would read before pitching looks. Re-fires when the concept changes.
  useEffect(() => {
    if (!concept) return;
    const sig = `${concept.logline}::${concept.beats.map((b) => b.action).join("|")}`;
    if (lookSigRef.current === sig) return;
    lookSigRef.current = sig;
    void refreshLookSuggestions({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept]);

  // Signature of inputs the current concept was written from. Used to detect
  // upstream edits (steps 1-3) and trigger an automatic regeneration so the
  // concept stays in sync with the brief, product, audio plan, and length.
  const conceptInputsSigRef = useRef<string>("");
  const buildConceptInputsSig = () =>
    JSON.stringify({
      b: brief.trim(),
      p: productHint.trim(),
      l: lengthSec,
      as: audioSelected,
      an: audioNotes,
      ch: featuredCharacter?.id ?? null,
    });

  // Compose a "featured character" snippet appended to the brief so the
  // concept writer treats them as the on-screen talent.
  const characterBriefLine = (): string => {
    const c = featuredCharacter;
    if (!c) return "";
    const parts = [`Featured character: ${c.name}`];
    if (c.description) parts.push(c.description);
    if (c.voiceLabel) parts.push(`Voice: ${c.voiceLabel}`);
    return `\n\n${parts.join(" — ")}.`;
  };

  const handleWriteConcept = async () => {
    if (!briefReady) return;
    setConceptError(null);
    setWritingConcept(true);
    // Park the user on the Concept step (now step 3) before AND after the
    // async call so nothing can race us forward while the LLM is thinking.
    setOpenStep(3);
    setMaxStep((m) => Math.max(m, 3));
    const sigAtCallTime = buildConceptInputsSig();
    try {
      const audioLines = AUDIO_OPTIONS.filter((o) => audioSelected[o.value]).map(
        (o) => `- ${o.label}${audioNotes[o.value].trim() ? `: ${audioNotes[o.value].trim()}` : ""}`,
      );
      const briefBase = `${brief.trim()}${characterBriefLine()}`;
      const briefWithAudio = audioLines.length
        ? `${briefBase}\n\nAudio plan:\n${audioLines.join("\n")}`
        : `${briefBase}\n\nAudio plan: silent — no narration or music.`;

      const out = await conceptFn({
        data: {
          brief: briefWithAudio,
          productHint: productHint.trim() || undefined,
          lengthSec,
          // Look is chosen AFTER the concept now — don't constrain the writer.
        },
      });
      setConcept(out);
      conceptInputsSigRef.current = sigAtCallTime;
      setOpenStep(3);
    } catch (err) {
      console.error("[special-product-ad] concept failed", err);
      setConceptError(
        err instanceof Error ? err.message : "Couldn't write the concept. Try again.",
      );
    } finally {
      setWritingConcept(false);
    }
  };

  // Auto-regenerate the concept when upstream inputs (steps 1-3) change after
  // a concept already exists. Debounced so rapid typing in the brief doesn't
  // fire a request on every keystroke.
  useEffect(() => {
    if (!concept) return;
    if (writingConcept) return;
    if (!briefReady) return;
    const sig = buildConceptInputsSig();
    if (sig === conceptInputsSigRef.current) return;
    const t = setTimeout(() => {
      void handleWriteConcept();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, productHint, lengthSec, audioSelected, audioNotes, concept, briefReady, writingConcept]);




  const finalPrompt = useMemo(() => {
    if (!concept) return "";
    return composeSeedancePrompt({
      concept,
      look,
      productHint: productHint.trim() || undefined,
      audio: {
        music: audioSelected.music,
        voiceover: audioSelected.voiceover,
        talking: audioSelected.talking,
      },
    });
  }, [concept, look, productHint, audioSelected]);

  const handleProduce = async () => {
    if (!concept) {
      setError("Write the concept first.");
      return;
    }
    setError(null);
    const path = VIDEO_PATHS.find((p) => p.value === videoPath)!;
    // With a product photo we switch to the model's reference-aware endpoint.
    // For Seedance that's `reference-to-video` (image_urls + @Image1 refs in
    // prompt) — the product is matched without being forced into frame 0.
    // For Kling we keep image-to-video (its only reference-aware mode).
    const useRef = !!image;
    const model = useRef ? path.modelI2V : path.model;
    const assets: ProjectAsset[] = useRef ? [image!] : [];
    // Include the featured character portrait as a secondary reference so
    // the renderer can keep their look consistent in the spot.
    if (featuredCharacter?.imageUrl) {
      assets.push({
        id: `lib-${featuredCharacter.id}`,
        kind: "reference",
        mime: featuredCharacter.imageMime ?? "image/png",
        name: `${featuredCharacter.name}.png`,
        url: featuredCharacter.imageUrl,
      });
    }

    const isSeedanceRef =
      useRef && model === "bytedance/seedance-2.0/reference-to-video";



    // Helper to append a finished asset to the project timeline.
    const appendAssetToTimeline = async (assetId: string) => {
      try {
        const cur = await getProjectFn({ data: { id: projectId } });
        const curOrder = cur?.project?.projectState?.timeline?.order ?? [];
        const sep = "::timeline-instance::";
        const uniq =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const nextOrder = [...curOrder, `${assetId}${sep}${uniq}`];
        await updateStateFn({
          data: { id: projectId, patch: { timeline: { order: nextOrder, seeded: true } } },
        });
      } catch (err) {
        console.error("[product-ad] timeline append failed", err);
      }
    };

    // Kling Standard branch: server-side per-shot pipeline returns one MP4.
    if (videoPath === "kling-cheap") {
      setKlingBusy(true);
      // Map the multi-select toggles to Kling's audio mode. "talking" maps
      // into voiceover for now since Kling Standard doesn't do lip-sync.
      const wantsVoice = audioSelected.voiceover || audioSelected.talking;
      const wantsMusic = audioSelected.music;
      const audioMode: "voiceover" | "music" | "voiceover+music" | "silent" =
        wantsVoice && wantsMusic
          ? "voiceover+music"
          : wantsVoice
            ? "voiceover"
            : wantsMusic
              ? "music"
              : "silent";
      // Drop a temporary placeholder onto the timeline so the user can watch
      // the render slot from the moment it starts. Swap on success, drop on
      // failure — mirrors Short Film beat lifecycle.
      let placeholderId: string | null = null;
      try {
        const ph = await createPlaceholderFn({
          data: {
            projectId,
            label: "Product Ad rendering…",
            durationSec: Math.min(120, Math.max(1, lengthSec)),
          },
        });
        placeholderId = ph.placeholderId;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("v2:open-timeline", { detail: { projectId } }),
          );
        }
      } catch (err) {
        console.error("[product-ad] placeholder create failed", err);
      }
      try {
        const result = await klingFn({
          data: {
            projectId,
            concept,
            look,
            productHint: productHint.trim() || undefined,
            productUrl: image?.url,
            totalDurationSec: lengthSec,
            aspect,
            audioMode,
          },
        });
        if (placeholderId) {
          await finalizePlaceholderFn({
            data: {
              projectId,
              placeholderId,
              realAssetId: result?.assetId ?? null,
            },
          });
        } else if (result?.assetId) {
          await appendAssetToTimeline(result.assetId);
        }
      } catch (err) {
        console.error("[product-ad] kling render failed", err);
        setError(err instanceof Error ? err.message : "Kling render failed.");
        if (placeholderId) {
          try {
            await finalizePlaceholderFn({
              data: { projectId, placeholderId, realAssetId: null },
            });
          } catch (e) {
            console.error("[product-ad] placeholder drop failed", e);
          }
        }
      } finally {
        setKlingBusy(false);
      }

      return;
    }

    // Seedance only accepts integer durations 4–15. Clamp longer requested
    // lengths so the call doesn't fail; for true long-form, the Kling
    // branch above is used.
    const seedanceDuration = Math.max(4, Math.min(15, lengthSec));
    // Seedance only accepts: auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16.
    // Remap unsupported portrait/landscape ratios to the closest accepted one.
    const SEEDANCE_ASPECT_MAP: Record<string, string> = {
      "4:5": "3:4",
      "5:4": "4:3",
      "2:3": "3:4",
      "3:2": "4:3",
    };
    const seedanceAspect = SEEDANCE_ASPECT_MAP[aspect] ?? aspect;
    // For Seedance reference-to-video, instruct the model to treat the
    // uploaded photo as the canonical product identity. The endpoint expects
    // @Image1 style references inline in the prompt.
    const seedancePrompt = isSeedanceRef
      ? `The product shown in @Image1 is the hero of this ad. Match its exact shape, colors, materials, branding, and proportions in every shot. Do not redesign it.\n\n${finalPrompt}`
      : finalPrompt;
    onSubmit({
      prompt: seedancePrompt,
      assets,
      modelOverride: model,
      params: {
        duration: String(seedanceDuration),
        resolution: "1080p",
        aspect_ratio: seedanceAspect,
        generate_audio: anyAudio,
        audio_modes: AUDIO_OPTIONS.filter((o) => audioSelected[o.value])
          .map((o) => o.value)
          .join(",") || "silent",


        ...(audioSelected.music && audioNotes.music.trim()
          ? { music_prompt: audioNotes.music.trim() }
          : {}),
        ...(audioSelected.voiceover && audioNotes.voiceover.trim()
          ? { voice_script: audioNotes.voiceover.trim() }
          : {}),
        ...(audioSelected.talking && audioNotes.talking.trim()
          ? { talking_script: audioNotes.talking.trim() }
          : {}),
      },
      // Drop the finished ad straight onto the timeline.
      intent: { kind: "appendVisual" },
    });
  };

  const summarize = (s: string, n = 80) =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

  const briefSummary = brief.trim()
    ? `${lengthSec}s · ${aspect} · ${summarize(brief.trim())}`
    : "Tell us what the ad should say";
  const productSummary = image
    ? productHint.trim()
      ? `${productHint.trim()} · ${image.name}`
      : image.name
    : "No product image yet";
  const conceptSummary = concept
    ? summarize(concept.logline || `${concept.beats.length} shots`)
    : "Generate a concept from the brief";
  const selectedPath = VIDEO_PATHS.find((p) => p.value === videoPath);
  const styleSummary = `${look} · ${selectedPath?.label ?? videoPath}`;
  const audioSummary =
    AUDIO_OPTIONS.filter((o) => audioSelected[o.value])
      .map((o) => o.label)
      .join(" · ") || "Silent — no audio";

  return (
    <div className="flex flex-col gap-3">
      {/* Subtle step progress */}
      <div className="px-1">
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={() => goBack(currentStep)}
                aria-label="Back"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
              </button>
            ) : null}
            <span>Step {currentStep + 1} of {TOTAL_STEPS}</span>
          </div>
        </div>
        <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-foreground/70 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 1. Product */}
      <Section
        title="Add product from URL"
        stepLabel={`Step 1 of ${TOTAL_STEPS}`}
        stepNumber={1}
        done={!!image}
        active={openStep === 0}
        cta={
          <Button
            type="button"
            onClick={() => commitStep(0)}
            disabled={!image}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {maxStep > 0 ? "Update & continue" : "Continue"}
          </Button>
        }
      >
        {/* Product URL → auto-fill image + brief + look from the page. */}
        <div className="mb-3">
          <div className="relative w-full">
            <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && productUrl.trim() && !scraping) {
                  e.preventDefault();
                  void handleScrape();
                }
              }}
              placeholder="https://yourbrand.com/product"
              className="w-full rounded-md border border-hairline bg-white py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleScrape()}
            disabled={!productUrl.trim() || scraping}
            variant="secondary"
            className="mt-2 h-10 w-full rounded-md text-sm font-medium shadow-none"
          >
            {scraping ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Reading…</>
            ) : (
              "Fetch"
            )}
          </Button>

          {scrapeError && (
            <div className="mt-2 rounded-sm border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {scrapeError}
            </div>
          )}
        </div>

        <div className="mb-2 text-sm font-semibold text-foreground">
          Add product manually
        </div>
        <div
          {...imgDropProps}
          className={cn(
            "rounded-md transition",
            imgIsOver && "ring-2 ring-primary/40",
          )}
        >
          {image ? (
            <div className="relative flex flex-col items-center gap-2 rounded-md border border-hairline bg-muted/40 p-3">
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove product image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <img
                src={image.url}
                alt={image.name}
                className="h-48 w-full rounded-lg object-contain"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-hairline bg-background/40 px-4 py-5 text-sm text-muted-foreground hover-lift hover:text-foreground disabled:opacity-60"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><UploadIcon className="h-4 w-4" /> Drop or upload the product image</>
              )}
            </button>
          )}
        </div>
        <input
          value={productHint}
          onChange={(e) => setProductHint(e.target.value)}
          placeholder="Product name"
          className="mt-3 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          accept="image"
          onPick={(r) => void handlePick(r)}
        />
      </Section>

      {/* 2. Brief */}
      <Section
        title="Brief"
        stepLabel={`Step 2 of ${TOTAL_STEPS}`}
        stepNumber={2}
        done={briefReady && maxStep > 1}
        active={openStep === 1}
        cta={
          <Button
            type="button"
            onClick={() => commitStep(1)}
            disabled={!briefReady}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {maxStep > 1 ? "Update & continue" : "Continue"}
          </Button>
        }
      >
        <AppTextarea
          ref={briefRef}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Audience, vibe, key message, mood. Think of the one-line brief you'd give a creative director."
          rows={4}
        />
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Length</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {LENGTHS.find((l) => l.value === lengthSec)?.label ?? `${lengthSec}s`}
            </span>
          </div>
          <Slider
            min={0}
            max={LENGTHS.length - 1}
            step={1}
            value={[Math.max(0, LENGTHS.findIndex((l) => l.value === lengthSec))]}
            onValueChange={([i]) => {
              const next = LENGTHS[i];
              if (next) setLengthSec(next.value);
            }}
            className="py-2"
          />
        </div>
        <div className="mt-5">
          <div className="mb-2 text-[11px] text-muted-foreground">Aspect</div>
          <div className="grid grid-cols-2 gap-2">
            {ASPECTS.map((a) => {
              const selected = aspect === a.value;
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAspect(a.value)}
                  title={a.hint}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border bg-card px-3 py-4 text-center transition-transform duration-200 hover:scale-[1.03] hover:shadow-elegant",
                    selected
                      ? "border-foreground bg-foreground/5"
                      : "border-hairline",
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                    <div
                      className={cn(
                        "rounded-[2px] border-2 transition",
                        selected ? "border-foreground" : "border-muted-foreground/60",
                      )}
                      style={{ width: a.w, height: a.h }}
                    />
                  </div>
                  <div className="flex flex-col items-center leading-tight">
                    <span className="text-sm font-medium text-foreground">{a.label}</span>
                    <span className="text-[11px] text-muted-foreground">{a.hint}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Featured character (optional) — pulls from the Library */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">
              Featured character <span className="opacity-60">(optional)</span>
            </span>
            {featuredCharacter && (
              <button
                type="button"
                onClick={() => setFeaturedCharacter(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>
          {featuredCharacter ? (
            <button
              type="button"
              onClick={() => setCharPickerOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-card p-2 text-left transition hover:border-foreground/40"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {featuredCharacter.imageUrl ? (
                  <img
                    src={featuredCharacter.imageUrl}
                    alt={featuredCharacter.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <UserIcon className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {featuredCharacter.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {featuredCharacter.voiceLabel ?? "No voice set"}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">Change</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCharPickerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-muted/20 px-3 py-3 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              <UserIcon className="h-3.5 w-3.5" /> Pick from Library
            </button>
          )}
        </div>

      </Section>
      <CharacterPickerDialog
        open={charPickerOpen}
        onOpenChange={setCharPickerOpen}
        onPick={(c) => setFeaturedCharacter(c)}
      />


      {/* 3. Audio — captured before the concept so dialogue/narration is */}
      {/*    woven into the generated beats. */}
      <Section
        title="Audio"
        stepLabel={`Step 3 of ${TOTAL_STEPS}`}
        stepNumber={3}
        done={maxStep > 2}
        active={openStep === 2}
        cta={
          <Button
            type="button"
            onClick={() => commitStep(2)}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {maxStep > 2 ? "Update & continue" : anyAudio ? "Continue" : "Skip — silent ad"}
          </Button>
        }
      >
        <p className="mb-3 text-[11px] text-muted-foreground">
          Pick any combination — or leave them all unchecked for a silent ad.
          Your choices shape the dialogue and pacing in the next step.
        </p>
        <div className="space-y-2">
          {AUDIO_OPTIONS.map((o) => {
            const checked = audioSelected[o.value];
            return (
              <div
                key={o.value}
                className={cn(
                  "rounded-md border border-hairline bg-background p-3 transition",
                  checked && "border-primary/60 ring-1 ring-primary/30",
                )}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAudio(o.value)}
                    className="mt-0.5 accent-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {o.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {o.hint}
                    </div>
                  </div>
                </label>
                {checked && (
                  <AppTextarea
                    value={audioNotes[o.value]}
                    onChange={(e) => setAudioNote(o.value, e.target.value)}
                    placeholder={o.notePlaceholder}
                    rows={2}
                    className="mt-3"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 4. Concept — the screenplay, written from brief + audio. */}
      <Section
        title="Concept"
        stepLabel={`Step 4 of ${TOTAL_STEPS}`}
        stepNumber={4}
        hint={concept ? "editable" : undefined}
        done={!!concept && maxStep > 3}
        active={openStep === 3}
        cta={
          <>
            <button
              type="button"
              onClick={() => void handleWriteConcept()}
              disabled={writingConcept}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {writingConcept ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </button>
            <Button
              type="button"
              onClick={() => {
                if (!concept) {
                  void handleWriteConcept();
                  return;
                }
                commitStep(3);
              }}
              disabled={writingConcept || (!concept && !briefReady)}
              className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
            >
              {!concept
                ? "Write concept"
                : maxStep > 3
                  ? "Update & continue"
                  : "Continue"}
            </Button>
          </>
        }
      >
        {writingConcept && !concept ? (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Writing the concept from your brief and audio plan…
          </div>
        ) : null}
        {!concept && !writingConcept ? (
          <p className="text-[11px] text-muted-foreground">
            The screenplay comes first. Click <strong>Write concept</strong> to
            turn your brief into a shot-by-shot ad. Your DP picks the look in
            the next step.
          </p>
        ) : null}
        {concept && (
          <div className="space-y-3">
            <div className="rounded-md border border-hairline bg-background p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Logline
              </div>
              {editingField === "logline" ? (
                <textarea
                  autoFocus
                  value={concept.logline}
                  onChange={(e) =>
                    setConcept({ ...concept, logline: e.target.value })
                  }
                  onBlur={() => setEditingField(null)}
                  rows={Math.max(2, Math.ceil(concept.logline.length / 60))}
                  className="mt-1 w-full resize-none bg-transparent text-sm font-normal text-foreground outline-none"
                />
              ) : (
                <div
                  onClick={() => setEditingField("logline")}
                  className="mt-1 cursor-text whitespace-pre-wrap text-sm font-normal text-foreground"
                >
                  {concept.logline}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {concept.beats.map((b, i) => {
                const isEditingAction = editingField === `beat-${i}-action`;
                const isEditingVo = editingField === `beat-${i}-vo`;
                return (
                <div
                  key={i}
                  className="rounded-md border border-hairline bg-background p-2.5"
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span>Shot {i + 1}</span>
                    <input
                      value={b.timecode}
                      onChange={(e) => {
                        const beats = [...concept.beats];
                        beats[i] = { ...beats[i], timecode: e.target.value };
                        setConcept({ ...concept, beats });
                      }}
                      className="w-20 bg-transparent text-right text-[10px] uppercase tracking-wide text-muted-foreground/60 outline-none"
                    />
                  </div>
                  {isEditingAction ? (
                    <textarea
                      autoFocus
                      value={b.action}
                      onChange={(e) => {
                        const beats = [...concept.beats];
                        beats[i] = { ...beats[i], action: e.target.value };
                        setConcept({ ...concept, beats });
                      }}
                      onBlur={() => setEditingField(null)}
                      rows={Math.max(2, Math.ceil(b.action.length / 60))}
                      className="mt-1 w-full resize-none bg-transparent text-sm font-normal text-foreground outline-none"
                    />
                  ) : (
                    <div
                      onClick={() => setEditingField(`beat-${i}-action`)}
                      className="mt-1 cursor-text whitespace-pre-wrap text-sm font-normal text-foreground"
                    >
                      {b.action}
                    </div>
                  )}
                  {b.voiceover !== undefined ? (
                    isEditingVo ? (
                      <input
                        autoFocus
                        value={b.voiceover}
                        onChange={(e) => {
                          const beats = [...concept.beats];
                          beats[i] = { ...beats[i], voiceover: e.target.value };
                          setConcept({ ...concept, beats });
                        }}
                        onBlur={() => setEditingField(null)}
                        placeholder="Voiceover (optional)"
                        className="mt-1 w-full bg-transparent text-xs text-muted-foreground outline-none"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingField(`beat-${i}-vo`)}
                        className="mt-1 cursor-text whitespace-pre-wrap text-xs text-muted-foreground"
                      >
                        {b.voiceover || "Voiceover (optional)"}
                      </div>
                    )
                  ) : null}
                </div>
                );
              })}
            </div>
            {concept.cta ? (
              <input
                value={concept.cta}
                onChange={(e) => setConcept({ ...concept, cta: e.target.value })}
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-foreground outline-none"
              />
            ) : null}
          </div>
        )}
        {conceptError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {conceptError}
          </div>
        )}
      </Section>

      {/* 5. Look — DP picks the photographic approach to shoot the concept. */}
      <Section
        title="Look"
        stepLabel={`Step 5 of ${TOTAL_STEPS}`}
        stepNumber={5}
        done={maxStep > 4}
        active={openStep === 4}
        cta={
          <Button
            type="button"
            onClick={() => commitStep(4)}
            disabled={!concept}
            className="h-12 w-full max-w-xs rounded-md text-base font-semibold shadow-none"
          >
            {maxStep > 4 ? "Update & continue" : "Continue"}
          </Button>
        }
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Your DP&apos;s pitch — camera, lens, lighting, and movement to
            shoot the concept above.
          </p>
          <button
            type="button"
            onClick={() => void refreshLookSuggestions()}
            disabled={looksLoading || !concept}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            title="Regenerate look suggestions based on the concept"
          >
            {looksLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Suggest
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {lookOptions.map((l) => {
            const selected = look === l.label;
            const shortLabel = l.label.split(/\s+/).slice(0, 4).join(" ");
            return (
              <button
                key={l.label}
                type="button"
                onClick={() => {
                  setLook(l.label);
                  setCustomLook("");
                }}
                title={l.hint}
                className={cn(
                  "flex items-center rounded-lg border bg-card px-3 py-3 text-left text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] hover:shadow-elegant",
                  selected
                    ? "border-foreground bg-foreground/5"
                    : "border-hairline",
                )}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <input
            type="text"
            value={customLook}
            onChange={(e) => {
              const v = e.target.value;
              setCustomLook(v);
              if (v.trim()) setLook(v.trim());
              else setLook(lookOptions[0]?.label ?? "Cinematic");
            }}
            placeholder="Or describe your own look…"
            className={cn(
              "w-full rounded-md border bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground/60",
              customLook.trim()
                ? "border-foreground"
                : "border-hairline focus:border-foreground/60",
            )}
          />
        </div>
      </Section>


      {/* 6. Render — model + produce */}
      <Section
        title="Render"
        stepLabel={`Step 6 of ${TOTAL_STEPS}`}
        stepNumber={6}
        active={openStep === 5}
      >
        <div className="mb-1 text-[11px] text-muted-foreground">Video model</div>
        <div className="space-y-2">
          {VIDEO_PATHS.map((p) => (
            <label
              key={p.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-background p-3 transition hover:border-foreground/40",
                videoPath === p.value && "border-foreground ring-1 ring-foreground",
                p.disabled && "cursor-not-allowed opacity-50 hover:border-hairline",
              )}
            >
              <input
                type="radio"
                name="video-path"
                value={p.value}
                checked={videoPath === p.value}
                disabled={p.disabled}
                onChange={() => !p.disabled && setVideoPath(p.value)}
                className="mt-0.5 accent-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{p.label}</div>
                <div className="text-[11px] text-muted-foreground">{p.hint}</div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <GenerateButton
          skill={skill}
          onClick={() => void handleProduce()}
          disabled={!conceptReady || busy || klingBusy}
          busy={busy || klingBusy}
          busyLabel={
            klingBusy
              ? `Rendering ${concept?.beats.length ?? 0} shots…`
              : "Rendering…"
          }
          label="Generate ad"
          className="mt-5"
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Want to iterate? Tap Back above to edit any section, then Generate again to render a new variant.
        </p>
      </Section>
    </div>
  );
}

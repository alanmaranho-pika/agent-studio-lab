import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ALL_BLOCKS, blockToHtml, type TurnBlock } from "@/agent/blocks/_registry";
import { GenerativeCard } from "@/components/studio/generative-card";
import {
  StageGenerationView,
  type StageGeneration,
} from "@/components/studio/agent/stage-generations";
import { INITIAL_PROJECT, type ProjectState, type Scene } from "@/lib/project-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/blocks")({
  component: BlocksPage,
});

// Placeholder stills for the image-bearing blocks (data: URIs are rejected by
// the card sanitizer, so use real https images).
const img = (seed: string) => `https://picsum.photos/seed/${seed}/640/420`;

// One representative payload per block type — serialized through the SAME
// blockToHtml + GenerativeCard pipeline the live stage uses, so this gallery
// is a faithful preview, not a re-implementation.
const EXAMPLES: Record<string, TurnBlock> = {
  options: {
    type: "options",
    cols: "3",
    items: [
      {
        value: "9:16 Vertical",
        title: "9:16",
        subtitle: "Reels, TikTok, Shorts",
        visual: { kind: "ratio", ratio: "9:16" },
      },
      {
        value: "Cinematic",
        title: "Cinematic",
        subtitle: "Filmic and wide",
        visual: { kind: "icon", icon: "film" },
      },
      {
        value: "This look",
        title: "Editorial",
        subtitle: "Magazine style",
        visual: { kind: "image", url: img("opt") },
      },
    ],
  },
  form: {
    type: "form",
    fields: [
      { type: "text", key: "tagline", label: "Tagline", placeholder: "One punchy line" },
      {
        type: "chips",
        key: "tone",
        label: "Tone",
        options: ["Playful", "Premium", "Bold", "Calm"],
        multi: true,
      },
    ],
    submitLabel: "Continue",
  },
  upload: {
    type: "upload",
    kind: "likeness",
    label: "Upload product photo",
    hint: "PNG, JPG, or WEBP",
    allowUrl: true,
    allowCamera: true,
    skipValue: "Agent decides",
  },
  media: {
    type: "media",
    url: img("media"),
    mediaKind: "image",
    title: "Take 1",
    caption: "Hero shot — soft morning light",
    actions: [
      { value: "Approve", label: "Approve", primary: true },
      { value: "Regenerate", label: "Regenerate" },
    ],
  },
  gallery: {
    type: "gallery",
    title: "Style concepts",
    items: [
      { url: img("g1"), label: "Warm" },
      { url: img("g2"), label: "Cool" },
      { url: img("g3"), label: "Mono" },
    ],
    actions: [
      { value: "Lock it in", label: "Lock it in", primary: true },
      { value: "Try again", label: "Try again" },
    ],
  },
  moodboard: {
    type: "moodboard",
    title: "Visual direction",
    items: [
      { kind: "image", url: img("m1"), label: "Texture" },
      { kind: "image", url: img("m2") },
      { kind: "image", url: img("m3"), label: "Light" },
      { kind: "palette", colors: ["#1B1B1F", "#E8C87E", "#6C7A89", "#F5F3EE"] },
      { kind: "type", text: "Aa", label: "Telka Extended", bg: "#EDE7FF" },
    ],
    actions: [
      { value: "Lock it in", label: "Lock it in", primary: true },
      { value: "Rework", label: "Let's rework" },
    ],
  },
  list: {
    type: "list",
    title: "Beat sheet",
    items: [
      { meta: "Beat 1 · 3s", text: "Cold open on the fog-wrapped lighthouse." },
      { meta: "Beat 2 · 4s", text: "The keeper climbs the spiral stair, lantern swinging." },
      { meta: "Beat 3 · 5s", text: "A storm cracks; the light gutters and dies." },
    ],
    actions: [{ value: "Looks right", label: "Looks right", primary: true }],
  },
  storyboard: {
    type: "storyboard",
    title: "Storyboard",
    items: [
      {
        meta: "Shot 1 · 5s",
        title: "Establishing wide",
        text: "Lighthouse against a bruised sky.",
        vo: "It started the night the light went out.",
      },
      { meta: "Shot 2 · 4s", title: "The climb", text: "Boots on wet iron stairs." },
      { meta: "Shot 3 · 6s", title: "Blackout", text: "The bulb dies; darkness floods in." },
    ],
    actions: [
      { value: "Lock it in", label: "Lock it in", primary: true },
      { value: "Rework a shot", label: "Rework a shot" },
    ],
  },
  actions: {
    type: "actions",
    buttons: [
      { value: "Animate all", label: "Animate all", primary: true },
      { value: "Render one", label: "Render one" },
      { value: "Edit the cut", label: "Edit the cut" },
    ],
  },
  custom_html: {
    type: "custom_html",
    html: `<div data-card><div class="rounded-2xl border border-border p-5"><h3 class="font-display text-lg mb-2">Custom escape hatch</h3><p class="text-sm text-muted-foreground">Any bespoke UI a typed block can't express — rendered as sanitized HTML when no typed block fits.</p></div></div>`,
  },
};

// stage + timeline render as full-stage React views driven by project state.
// A small mock project (scenes with placeholder keyframes) lets us preview
// them here exactly as they render on the live stage.
// Public sample clips (Google's gtv-videos bucket) stand in for rendered shots
// so the timeline/stage previews show finished media instead of "Rendering…".
const clip = (name: string) =>
  `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`;

const MOCK_SCENES: Scene[] = [
  {
    id: "sc1",
    n: 1,
    title: "The storm arrives",
    prompt:
      "Extreme wide of an isolated stone lighthouse on a rocky island at dusk, storm rolling in.",
    voPrompt: "It started the night the light went out.",
    duration: 5,
    thumb: img("sb1"),
    clipUrl: clip("ForBiggerBlazes"),
    status: "ready",
  },
  {
    id: "sc2",
    n: 2,
    title: "The climb",
    prompt: "The keeper climbs the spiral iron stair, lantern swinging, shadows stretching.",
    voPrompt: "Every step, the sea got louder.",
    duration: 4,
    thumb: img("sb2"),
    clipUrl: clip("ForBiggerEscapes"),
    status: "ready",
  },
  {
    id: "sc3",
    n: 3,
    title: "Blackout",
    prompt: "The great bulb gutters and dies; darkness floods the gallery.",
    voPrompt: "Then — nothing.",
    duration: 6,
    thumb: img("sb3"),
    clipUrl: clip("ForBiggerFun"),
    status: "ready",
  },
  {
    id: "sc4",
    n: 4,
    title: "The signal",
    prompt: "A single match flares; the keeper's face lit gold against the black.",
    duration: 4,
    thumb: img("sb4"),
    clipUrl: clip("ForBiggerJoyrides"),
    status: "ready",
  },
  {
    id: "sc5",
    n: 5,
    title: "Dawn",
    prompt: "Wide at first light — the lighthouse still standing, gulls wheeling.",
    voPrompt: "By morning, the storm had forgotten us.",
    duration: 5,
    thumb: img("sb5"),
    clipUrl: clip("ForBiggerMeltdowns"),
    status: "ready",
  },
];

const MOCK_PROJECT: ProjectState = {
  ...INITIAL_PROJECT,
  meta: {
    ...INITIAL_PROJECT.meta,
    title: "The Lighthouse Keeper",
    format: "Short film",
    aspectRatio: "16:9",
    logline: "A lighthouse keeper battles a storm — and his own unraveling mind.",
  },
  scenes: MOCK_SCENES,
  timeline: { order: MOCK_SCENES.map((s) => s.id), hidden: [] },
};

const STAGE_GEN: Record<string, StageGeneration> = {
  timeline: {
    kind: "timeline",
    variant: "preview",
    actions: [
      { value: "Animate all shots", label: "Animate all", primary: true },
      { value: "Edit the cut", label: "Edit" },
    ],
  },
  stage: {
    kind: "script-beats",
    actions: [
      { value: "Lock it in", label: "Lock it in", primary: true },
      { value: "Rework a beat", label: "Rework a beat" },
    ],
  },
};

// Blocks whose natural home is the 8-col stage column (not full-bleed).
const EIGHT_COL = new Set(["form", "upload", "list"]);

/** First non-heading line of a block's usage doc — the one-line description. */
function firstLine(md: string): string {
  const line = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line ?? "";
}

const anchorId = (type: string) => `blk-${type}`;

/** Sticky right-edge table of contents with scrollspy. */
function AnchorNav({ activeType }: { activeType: string | null }) {
  return (
    <nav className="pointer-events-auto fixed right-4 top-4 z-30 hidden max-h-[90vh] flex-col gap-0.5 overflow-y-auto lg:flex">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Blocks
      </div>
      {ALL_BLOCKS.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() =>
            document
              .getElementById(anchorId(b.type))
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className={cn(
            "rounded-full px-3 py-1 text-left font-mono text-[11px] transition",
            activeType === b.type
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {b.type}
        </button>
      ))}
    </nav>
  );
}

function BlocksPage() {
  const noop = () => {};
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeType, setActiveType] = useState<string | null>(ALL_BLOCKS[0]?.type ?? null);

  // Scrollspy — highlight the block section currently filling the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveType(visible.target.getAttribute("data-block-type"));
      },
      { root, threshold: [0.4, 0.6] },
    );
    root.querySelectorAll("[data-block-type]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="blocks-page flex h-full overflow-hidden bg-background text-foreground">
      <AnchorNav activeType={activeType} />
      <div className="relative flex h-full flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          {ALL_BLOCKS.map((b) => {
            const example = EXAMPLES[b.type];
            const stageGen = STAGE_GEN[b.type];
            const eightCol = EIGHT_COL.has(b.type);
            return (
              <section
                key={b.id}
                id={anchorId(b.type)}
                data-block-type={b.type}
                className="flex min-h-screen flex-col justify-center gap-6 border-b border-border py-16"
              >
                {/* Doc header — constrained to the 8-col stage column. */}
                <div className="grid-16">
                  <div className="col-span-8 col-start-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-display text-base font-semibold">{b.id}</h2>
                    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {b.type}
                    </code>
                    <p className="w-full text-sm text-muted-foreground sm:w-auto sm:flex-1">
                      {firstLine(b.usageMd)}
                    </p>
                  </div>
                </div>

                {/* Preview */}
                {stageGen ? (
                  <div className="w-full px-6">
                    <div className="mx-auto h-[80vh] w-full max-w-6xl">
                      <StageGenerationView
                        gen={stageGen}
                        project={MOCK_PROJECT}
                        assets={[]}
                        onAnswer={noop}
                      />
                    </div>
                  </div>
                ) : example ? (
                  eightCol ? (
                    <div className="grid-16">
                      <div className="col-span-8 col-start-5">
                        <GenerativeCard
                          html={blockToHtml(example)}
                          onAnswer={noop}
                          disabled
                          assets={[]}
                          projectId="__blocks_preview__"
                          seedKey={`blocks-${b.type}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full px-6">
                      <GenerativeCard
                        html={blockToHtml(example)}
                        onAnswer={noop}
                        disabled
                        assets={[]}
                        projectId="__blocks_preview__"
                        seedKey={`blocks-${b.type}`}
                      />
                    </div>
                  )
                ) : (
                  <div className="grid-16">
                    <div className="col-span-8 col-start-5 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-6 text-sm text-muted-foreground">
                      No standalone preview.
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
      </div>
    </div>
  );
}

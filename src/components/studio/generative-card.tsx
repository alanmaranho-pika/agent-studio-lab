import DOMPurify from "isomorphic-dompurify";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { AssetKind, ProjectAsset } from "@/lib/project-state";
import { uploadProjectAsset } from "@/lib/local-projects";
import { getSkillCover } from "@/lib/skills/skills.functions";
import {
  enhanceCardActions,
  enhanceGalleries,
  enhanceMoodboards,
  enhanceOptionGrids,
  enhanceVariantStrips,
} from "@/components/studio/agent/gen-option-enhancer";
import { HOLD_MS, WordsRamp } from "@/components/studio/agent/motion-primitives";
import type { StageIntent } from "@/components/studio/agent/intents";
// Type-only imports — no runtime cycle with the shell.
import type { InlineAskArgs } from "@/components/studio/agent/agent-shell";
import type { InlineAskResult } from "@/components/studio/agent/stage-generations";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ArrowUp } from "lucide-react";
import {
  AssetPickerDialog,
  type PickerAccept,
  type PickerResult,
} from "@/components/studio/asset-picker-dialog";

// Static rendering of the agent Lottie's resting frame (agent-symbol.json,
// frame 0) — traced from its two shape paths so the pill icon matches the
// idle glyph exactly without mounting a live Lottie instance.
const AGENT_SYMBOL_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<path d="M8.008 0.527C8.066 0.527 8.124 0.53 8.18 0.535C9.859 0.672 11.151 2.477 12.341 3.669C13.53 4.859 15.33 6.149 15.469 7.824C15.474 7.882 15.477 7.94 15.477 7.999C15.477 8.058 15.474 8.117 15.469 8.174C15.332 9.85 13.531 11.14 12.343 12.329C11.152 13.521 9.859 15.328 8.18 15.465C8.123 15.47 8.066 15.473 8.008 15.473C7.949 15.473 7.891 15.47 7.833 15.465C6.156 15.326 4.864 13.523 3.674 12.333C2.483 11.143 0.677 9.852 0.538 8.174C0.534 8.116 0.531 8.058 0.531 7.999C0.531 7.94 0.534 7.882 0.539 7.824C0.678 6.147 2.483 4.857 3.674 3.667C4.864 2.477 6.156 0.673 7.834 0.535C7.891 0.53 7.949 0.527 8.008 0.527Z"/>' +
  '<path d="M7.261 4.579C6.238 4.188 4.979 3.423 4.204 4.197C3.429 4.972 4.194 6.231 4.584 7.255C4.672 7.486 4.721 7.737 4.721 7.999C4.721 8.262 4.672 8.513 4.584 8.745C4.194 9.768 3.428 11.029 4.203 11.803C4.978 12.577 6.238 11.811 7.262 11.421C7.493 11.332 7.745 11.283 8.008 11.283C8.272 11.283 8.524 11.331 8.757 11.421C9.778 11.812 11.034 12.575 11.808 11.803C12.583 11.029 11.817 9.771 11.425 8.749C11.336 8.516 11.287 8.263 11.287 7.999C11.287 7.736 11.336 7.483 11.425 7.251C11.817 6.229 12.582 4.971 11.808 4.197C11.034 3.424 9.778 4.187 8.757 4.579C8.524 4.668 8.272 4.716 8.008 4.716C7.745 4.716 7.493 4.668 7.261 4.579Z"/>' +
  "</svg>";

const SANITIZE_CONFIG = {
  ADD_ATTR: [
    "data-card",
    "data-card-title",
    "data-card-caption",
    "data-card-action",
    "data-variants",
    "data-variant",
    "data-active",
    "data-storyboard",
    "data-shot",
    "data-shot-seg",
    "data-count",
    "data-action",
    "data-value",
    "data-pill",
    "data-upload",
    "data-capture",
    "data-kind",
    "data-asset-ref",
    "data-reorder",
    "data-compare",
    "data-bind",
    "data-min",
    "data-max",
    "data-step",
    "data-unit",
    "data-format",
    "accept",
    "capture",
    "multiple",
    "min",
    "max",
    "step",
    "type",
    "value",
    "checked",
    "controls",
    "playsinline",
    "muted",
    "loop",
    "autoplay",
  ],
  ADD_TAGS: ["img", "audio", "video", "source"],
  FORBID_TAGS: ["script", "style", "link", "iframe", "object", "embed"],
  FORBID_ATTR: ["style", "onclick", "onsubmit", "onload", "onerror"],
  // Mirror DOMPurify's default URI allow-list but additionally permit `blob:`
  // (needed for in-browser uploads). Keeping the same overall shape as the
  // default is important: a stricter custom regex here ends up rejecting
  // non-URI attribute values like `type="file"`, `accept="image/*"`, and
  // `capture="environment"`, which silently breaks photo upload / camera
  // capture inside generative cards.
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

export function extractCardTitle(html: string): string {
  const m = html.match(/data-card-title=["']([^"']+)["']/);
  return m ? m[1] : "";
}

// Pulls the conversational AI prose out of the card so it can be rendered
// in the chat history rather than inside the interactive surface.
// The model is instructed to put it in <p data-prose>…</p>.
export function extractCardProse(html: string): string {
  const m = html.match(/<p[^>]*data-prose[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function extractCardAck(html: string): string {
  const m = html.match(/<p[^>]*data-ack[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function stripCardProse(html: string): string {
  return html
    .replace(/<p[^>]*data-ack[^>]*>[\s\S]*?<\/p>/i, "")
    .replace(/<p[^>]*data-prose[^>]*>[\s\S]*?<\/p>/i, "");
}

export function stripCardWrapper(html: string): string {
  // strip a leading ```html fence or stray text the model may emit
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = html.indexOf("<div");
  if (start > 0) return html.slice(start);
  return html;
}

// Extract a hidden JSON project patch the model embeds in its reply.
// Shape:
//   <script type="application/json" data-project-patch>{ ... }</script>
// We always strip these out of the HTML before sanitizing/rendering.
export function extractProjectPatch(html: string): unknown | null {
  const m = html.match(
    /<script[^>]*data-project-patch[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

export function stripProjectPatch(html: string): string {
  return html.replace(
    /<script[^>]*data-project-patch[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// ---------- Typed answer collection ----------

export type CardAnswer = {
  summary: string;
  assets: ProjectAsset[];
  /** Declared shape of the NEXT turn (data-next on the clicked control) —
   *  chambers the composing skeleton so it's representative from frame one. */
  next?: string;
  /** Pre-written acknowledgement (data-ack on the clicked control) — shown
   *  instantly as the agent's reaction while the next turn composes. */
  ack?: string;
};

type LiveAsset = ProjectAsset; // identical for now

const KIND_LABEL: Record<AssetKind, string> = {
  likeness: "selfie / likeness",
  logo: "logo",
  reference: "reference",
  keyframe: "keyframe",
  image: "generated image",
  music: "music",
  voiceover: "voiceover",
  final: "final video",
  voice: "voice sample",
  audio: "audio",
  video: "video clip",
  pending: "rendering…",
  other: "file",
};

function inferKind(el: HTMLElement | null, file: File): AssetKind {
  const dk = (el?.getAttribute("data-kind") || "").toLowerCase();
  if (dk && dk in KIND_LABEL) return dk as AssetKind;
  if (file.type.startsWith("image/")) return "reference";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "other";
}

async function probeMedia(
  url: string,
  mime: string,
): Promise<Pick<ProjectAsset, "width" | "height" | "duration">> {
  return new Promise((resolve) => {
    if (mime.startsWith("image/")) {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({});
      img.src = url;
      return;
    }
    if (mime.startsWith("audio/") || mime.startsWith("video/")) {
      const el = document.createElement(
        mime.startsWith("audio/") ? "audio" : "video",
      ) as HTMLMediaElement;
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        const out: Pick<ProjectAsset, "width" | "height" | "duration"> = {
          duration: isFinite(el.duration) ? Math.round(el.duration) : undefined,
        };
        if ("videoWidth" in el) {
          const v = el as HTMLVideoElement;
          if (v.videoWidth) {
            out.width = v.videoWidth;
            out.height = v.videoHeight;
          }
        }
        resolve(out);
      };
      el.onerror = () => resolve({});
      el.src = url;
      return;
    }
    resolve({});
  });
}




const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function bytesToBase64Chunked(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    out += String.fromCharCode.apply(
      null,
      slice as unknown as number[],
    );
  }
  return btoa(out);
}

export async function fileToAsset(
  file: File,
  source: HTMLElement | null,
  projectId: string,
): Promise<LiveAsset> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File too large (${Math.round(file.size / 1024 / 1024)} MB). Keep uploads under 25 MB.`,
    );
  }
  const url = URL.createObjectURL(file);
  const meta = await probeMedia(url, file.type);
  const kind = inferKind(source, file);
  const label = source?.getAttribute("data-value") || undefined;
  // Upload to durable storage so external services (Pika, image gateways,
  // etc.) can fetch a real https URL — `blob:` URLs only exist in this tab.
  const buf = new Uint8Array(await file.arrayBuffer());
  const bytesB64 = bytesToBase64Chunked(buf);
  const uploaded = await uploadProjectAsset({
    data: {
      projectId,
      kind,
      mime: file.type || "application/octet-stream",
      name: file.name,
      bytesB64,
      label,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
    },
  });
  URL.revokeObjectURL(url);
  return { ...uploaded, ...meta };
}

export function describeAsset(a: LiveAsset): string {
  const kindLabel = KIND_LABEL[a.kind] ?? "file";
  const dims =
    a.width && a.height
      ? ` ${a.width}×${a.height}`
      : a.duration
        ? ` ${a.duration}s`
        : "";
  // Include the actual URL so the AI can pass it directly to downstream
  // services (Pika, image generators) instead of inventing one from the id.
  const urlPart =
    a.url && /^https?:/.test(a.url) ? ` url=${a.url}` : "";
  return `${kindLabel}: ${a.name}${dims} [${a.id}]${urlPart}`;
}

function fieldLabel(input: HTMLElement, name: string): string {
  // Prefer explicit labels over the placeholder so we don't echo "e.g. ..."
  // example text back to the user as if it were the field name.
  const aria = input.getAttribute("aria-label");
  if (aria) return aria;
  const label = input.closest("label");
  const spanText = label?.querySelector("span")?.textContent?.trim();
  if (spanText) return spanText;
  const labelText = label?.textContent?.trim();
  if (labelText) return labelText;
  if (input.id) {
    const forLabel = input.ownerDocument?.querySelector(
      `label[for="${input.id}"]`,
    );
    const forText = forLabel?.textContent?.trim();
    if (forText) return forText;
  }
  // Last resort: the field's own name. Never fall back to placeholder —
  // placeholders are example text, not labels.
  return name;
}


function coerceValue(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): unknown {
  if (input instanceof HTMLSelectElement && input.multiple) {
    return Array.from(input.selectedOptions).map((o) => o.value);
  }
  if (input instanceof HTMLInputElement) {
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number" || input.type === "range") {
      const n = input.valueAsNumber;
      return Number.isFinite(n) ? n : input.value;
    }
    if (input.type === "date" || input.type === "datetime-local" || input.type === "time") {
      return input.value; // ISO-ish
    }
  }
  return input.value;
}

export const GenerativeCard = memo(function GenerativeCard({
  html,
  onAnswer,
  disabled,
  assets,
  projectId,
  seedKey,
  onIntent,
  onInlineAsk,
}: {
  html: string;
  onAnswer: (answer: CardAnswer) => void;
  disabled?: boolean;
  assets?: ProjectAsset[];
  projectId: string;
  /** Stable per-message key so option-card scatter is random but repeatable. */
  seedKey?: string;
  /** Routes media-card actions (regenerate / more) to the shell. */
  onIntent?: (intent: StageIntent) => void;
  /** In-context piece/media edits — the popup conversation runs through the
   *  inline-edit API and never touches the center stage. */
  onInlineAsk?: (args: InlineAskArgs) => Promise<InlineAskResult>;
}) {

  const ref = useRef<HTMLDivElement>(null);
  const lastSafeHtmlRef = useRef<string | null>(null);
  const cleaned = stripProjectPatch(stripCardProse(stripCardWrapper(html)));
  const safe = DOMPurify.sanitize(cleaned, SANITIZE_CONFIG);

  // Keep the sanitized gen-UI DOM stable across unrelated parent renders
  // (notably every composer keystroke). React's dangerouslySetInnerHTML can
  // replace the card subtree on re-render even when the HTML text is the same,
  // which replays reveal animations and looks like the card flickers.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (lastSafeHtmlRef.current !== safe) {
      root.innerHTML = safe;
      lastSafeHtmlRef.current = safe;
      // Upgrade any [data-options] grids into styled option-picker cards
      // (per-card glow, ratio illos / icon badges, "Agent Decides" pill).
      enhanceOptionGrids(root, seedKey);
      // Paint the regenerate/edit/more icon trio + variant thumb strips the
      // model declares on media cards (clicks are wired in handleClick).
      enhanceCardActions(root);
      enhanceVariantStrips(root);
      // Pick one shared aspect ratio for image galleries (1/2/3-up).
      enhanceGalleries(root);
      // Paint moodboard palette swatches + type-tile colors (data attrs →
      // styles; DOMPurify strips inline styles server-side).
      enhanceMoodboards(root);
      // Note: no card-level "Ask agent" pill anymore — the piece-level hover
      // pill (wired below) covers every generation and its parts.
    }
  }, [safe, seedKey]);



  // Track files attached to inputs in this card (form not yet submitted).
  // Lifted to a ref so the AssetPickerDialog callback can write into the same
  // map the form-submit handler reads from.
  const pendingFilesRef = useRef<WeakMap<HTMLInputElement, LiveAsset[]>>(
    new WeakMap(),
  );
  // Sentinel input used for standalone (non-form) upload tiles so the picker
  // callback has a stable handle to attach assets to and to render previews
  // next to.
  const [picker, setPicker] = useState<{
    accept: PickerAccept;
    multiple: boolean;
    inputEl: HTMLInputElement | null;
    anchor: HTMLElement | null;
  } | null>(null);
  const [askPop, setAskPop] = useState<{
    mode: "caption" | "media";
    title: string;
    currentValue: string;
    rect: { top: number; left: number; width: number; height?: number };
    /** "right" = popover sits at rect.left (right of the edited element). */
    placement?: "right";
    /** Card eyebrow — context for the inline agent. */
    cardTitle?: string;
    /** media mode only. */
    mediaKind?: "image" | "video" | "audio";
  } | null>(null);
  // The parent-most generated block shifted left while its ask popover is
  // open (piece-level pill) — card + popover sit as one centered group.
  const askTargetElRef = useRef<HTMLElement | null>(null);
  // The exact PIECE element being edited — the popup writes the reworked
  // text (or fresh media src) back into it so the change lands in place on
  // the stage. Same "local to the card's DOM" semantics as direct edits.
  const pieceElRef = useRef<HTMLElement | null>(null);
  const releaseAskTarget = () => {
    const t = askTargetElRef.current;
    if (!t) return;
    askTargetElRef.current = null;
    t.style.transform = "";
    window.setTimeout(() => {
      t.style.transition = "";
    }, 400);
    // Let a paused storyboard resume its autoplay (the board may be the
    // shifted card itself or live inside it).
    const board =
      t.closest(".gen-storyboard") ?? t.querySelector(".gen-storyboard");
    board?.dispatchEvent(new Event("sb:resume"));
  };
  const [morePop, setMorePop] = useState<{
    mediaUrl: string;
    promptText: string;
    rect: { top: number; left: number };
  } | null>(null);


  useEffect(() => {
    const root = ref.current;
    if (root && assets && assets.length) {
      // Swap any <img data-asset-ref="ast_xxx"> placeholders the model
      // emits for real blob URLs from project state.
      const map = new Map(assets.map((a) => [a.id, a]));
      root
        .querySelectorAll<HTMLImageElement>("img[data-asset-ref]")
        .forEach((img) => {
          const a = map.get(img.getAttribute("data-asset-ref") || "");
          if (a) {
            img.src = a.url;
            img.alt = a.name;
          }
        });
    }
    // Defensive scrub: the model occasionally emits empty media placeholders
    // (an <img> with no src, an unresolved data-asset-ref, or an empty
    // <video>/<source>) inside handoff cards. They render as blank white
    // rectangles. Strip them so the card shows just prose + actions.
    if (root) {
      root
        .querySelectorAll<HTMLImageElement>("img")
        .forEach((img) => {
          const src = img.getAttribute("src");
          const ref = img.getAttribute("data-asset-ref");
          const hasSrc = !!src && src.trim() !== "";
          const hasResolvedRef =
            !!ref && !!assets?.some((a) => a.id === ref);
          if (!hasSrc && !hasResolvedRef) img.remove();
        });
      root.querySelectorAll<HTMLElement>("video, source").forEach((el) => {
        const src = el.getAttribute("src");
        if (!src || src.trim() === "") el.remove();
      });
    }
    if (!root || disabled) return;

    const pendingFiles = pendingFilesRef.current;

    type PreviewItem = {
      url: string;
      mime: string;
      name: string;
      pending?: boolean;
      error?: string;
    };
    const anchorFor = (input: HTMLInputElement): HTMLElement => {
      // Place the preview strip AFTER the enclosing <label> if any, so it
      // doesn't render inside the dashed drop-zone box (which looks like the
      // dropzone itself grew — hard to tell "did it work?").
      return (input.closest("label") as HTMLElement | null) ?? input;
    };
    const renderPreviewAt = (anchor: HTMLElement, items: PreviewItem[]) => {
      const host = anchor.parentElement;
      if (!host) return;
      let strip = Array.from(host.children).find(
        (c) =>
          c instanceof HTMLElement && c.getAttribute("data-card-preview") === "1",
      ) as HTMLElement | undefined;
      if (!strip) {
        strip = document.createElement("div");
        strip.setAttribute("data-card-preview", "1");
        strip.className =
          "mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground";
        anchor.after(strip);
      }
      strip.innerHTML = "";
      for (const a of items) {
        const wrap = document.createElement("div");
        wrap.className =
          "relative flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-2 pr-3" +
          (a.error ? " border-destructive text-destructive" : "");
        if (a.mime.startsWith("image/") && a.url) {
          const img = document.createElement("img");
          img.src = a.url;
          img.className =
            "h-12 w-12 rounded-xl object-cover" + (a.pending ? " opacity-60" : "");
          wrap.appendChild(img);
        } else {
          const dot = document.createElement("div");
          dot.className =
            "grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground" +
            (a.pending ? " opacity-60" : "");
          dot.textContent = a.mime.startsWith("audio/")
            ? "♪"
            : a.mime.startsWith("video/")
              ? "▶"
              : "•";
          wrap.appendChild(dot);
        }
        const col = document.createElement("div");
        col.className = "flex flex-col";
        const name = document.createElement("span");
        name.className = "max-w-[180px] truncate text-foreground";
        name.textContent = a.name;
        col.appendChild(name);
        const status = document.createElement("span");
        status.className = "text-[11px]";
        status.textContent = a.error
          ? a.error
          : a.pending
            ? "Uploading…"
            : "Attached";
        if (a.error) status.classList.add("text-destructive");
        else if (a.pending) status.classList.add("text-muted-foreground");
        else status.classList.add("text-emerald-600");
        col.appendChild(status);
        wrap.appendChild(col);
        strip.appendChild(wrap);
      }
    };
    const renderPreviewFor = (input: HTMLInputElement, assets: LiveAsset[]) => {
      renderPreviewAt(
        anchorFor(input),
        assets.map((a) => ({ url: a.url, mime: a.mime, name: a.name })),
      );
    };

    const handleFileChange = async (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.tagName !== "INPUT" || input.type !== "file") return;
      const list = input.files;
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      const anchor = anchorFor(input);
      // Show pending previews immediately so the user knows the file was
      // received while we upload it to storage.
      const pendingItems: PreviewItem[] = files.map((f) => ({
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
        mime: f.type || "application/octet-stream",
        name: f.name,
        pending: true,
      }));
      renderPreviewAt(anchor, pendingItems);

      const assets: LiveAsset[] = [];
      const finalItems: PreviewItem[] = [];
      for (const f of files) {
        try {
          const a = await fileToAsset(f, input, projectId);
          assets.push(a);
          finalItems.push({ url: a.url, mime: a.mime, name: a.name });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[generative-card] upload failed", err);
          finalItems.push({
            url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
            mime: f.type || "application/octet-stream",
            name: f.name,
            error: msg,
          });
        }
      }
      renderPreviewAt(anchor, finalItems);
      if (assets.length) pendingFiles.set(input, assets);

      // Standalone (not inside a form, no submit button next to it) →
      // auto-submit so a single file picker = a single answer.
      const standalone = !input.closest("form");
      if (standalone && assets.length) {
        onAnswer({
          summary: assets.map(describeAsset).join("; "),
          assets,
        });
      }
    };



    const startCapture = async (btn: HTMLElement) => {
      const mode = btn.getAttribute("data-capture") || "camera";
      const wantVideo = mode === "camera";
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          wantVideo ? { video: true, audio: false } : { audio: true },
        );
        if (wantVideo) {
          // Single-shot photo capture.
          const video = document.createElement("video");
          video.srcObject = stream;
          video.muted = true;
          await video.play();
          await new Promise((r) => setTimeout(r, 300));
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d")?.drawImage(video, 0, 0);
          stream.getTracks().forEach((t) => t.stop());
          const blob: Blob | null = await new Promise((r) =>
            canvas.toBlob(r, "image/jpeg", 0.92),
          );
          if (!blob) return;
          const file = new File([blob], `capture-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          const asset = await fileToAsset(file, btn, projectId);
          onAnswer({ summary: describeAsset(asset), assets: [asset] });
        } else {
          // Audio capture — record until user clicks again.
          const rec = new MediaRecorder(stream);
          const chunks: BlobPart[] = [];
          rec.ondataavailable = (ev) => chunks.push(ev.data);
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(chunks, { type: "audio/webm" });
            const file = new File([blob], `voice-${Date.now()}.webm`, {
              type: "audio/webm",
            });
            const asset = await fileToAsset(file, btn, projectId);
            asset.kind = "voice";
            onAnswer({ summary: describeAsset(asset), assets: [asset] });
          };
          rec.start();
          btn.textContent = "Stop recording";
          btn.setAttribute("data-recording", "1");
          const stopHandler = () => {
            btn.removeEventListener("click", stopHandler);
            rec.stop();
          };
          btn.addEventListener("click", stopHandler, { once: true });
        }
      } catch (err) {
        console.error("Capture failed", err);
        onAnswer({
          summary: "Capture unavailable on this device.",
          assets: [],
        });
      }
    };

    const inferAccept = (input: HTMLInputElement | null): PickerAccept => {
      const raw = (input?.getAttribute("accept") || "").toLowerCase();
      if (raw.includes("image")) return "image";
      if (raw.includes("video")) return "video";
      if (raw.includes("audio")) return "audio";
      return "any";
    };

    const openLibraryPicker = (
      input: HTMLInputElement | null,
      anchor: HTMLElement | null,
    ) => {
      setPicker({
        accept: inferAccept(input),
        multiple: !!input?.multiple,
        inputEl: input,
        anchor,
      });
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Variant thumb — swap the card's main media client-side, no round trip.
      const variantBtn = target.closest<HTMLElement>("[data-variant]");
      if (variantBtn && variantBtn.closest("[data-variants]")) {
        e.preventDefault();
        e.stopPropagation();
        const strip = variantBtn.closest<HTMLElement>("[data-variants]")!;
        const url =
          variantBtn.getAttribute("data-src") ??
          variantBtn.querySelector("img")?.getAttribute("src") ??
          "";
        if (url) {
          const card = strip.closest<HTMLElement>("[data-card]") ?? root;
          const main = Array.from(
            card.querySelectorAll<HTMLElement>("img, video"),
          ).find((el) => !strip.contains(el));
          if (main) main.setAttribute("src", url);
          strip
            .querySelectorAll<HTMLElement>("[data-variant]")
            .forEach((b) =>
              b.setAttribute("data-active", b === variantBtn ? "true" : "false"),
            );
        }
        return;
      }
      // Media-card action trio (regenerate / edit / more).
      const cardActionBtn = target.closest<HTMLElement>("[data-card-action]");
      if (cardActionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const action = cardActionBtn.getAttribute("data-card-action");
        const card = cardActionBtn.closest<HTMLElement>("[data-card]") ?? root;
        const title =
          (card.querySelector<HTMLElement>("[data-card-title]")?.textContent ?? "")
            .trim() || undefined;
        const caption = (
          card.querySelector<HTMLElement>("[data-card-caption]")?.textContent ?? ""
        ).trim();
        if (action === "regenerate") {
          onIntent?.({ kind: "regenerate", targetTitle: title });
          return;
        }
        if (action === "edit") {
          // Route through the same retained-target flow as the piece pill:
          // target = the card's main media, popup anchored beside the button.
          const media = Array.from(
            card.querySelectorAll<HTMLElement>("img, video, audio"),
          ).find((el) => !el.closest("[data-variants]"));
          pieceElRef.current = media ?? null;
          const kind = media?.tagName === "VIDEO" ? "video" : media?.tagName === "AUDIO" ? "audio" : "image";
          const rect = cardActionBtn.getBoundingClientRect();
          setAskPop({
            mode: "media",
            title: title ?? "",
            currentValue: media?.getAttribute("src") ?? "",
            rect: { top: rect.bottom + 8, left: rect.right, width: 320 },
            cardTitle: title,
            mediaKind: kind,
          });
          return;
        }
        if (action === "more") {
          const media = Array.from(
            card.querySelectorAll<HTMLElement>("img, video"),
          ).find((el) => !el.closest("[data-variants]"));
          const rect = cardActionBtn.getBoundingClientRect();
          setMorePop({
            mediaUrl: media?.getAttribute("src") ?? "",
            promptText: caption || title || "",
            rect: { top: rect.bottom + 8, left: rect.right },
          });
          return;
        }
        return;
      }
      const cap = target.closest<HTMLElement>('[data-capture]');

      if (cap) {
        e.preventDefault();
        if (cap.getAttribute("data-recording") === "1") return; // stop handled
        void startCapture(cap);
        return;
      }
      // Field-level [+] attach button — trigger the hidden multi-file input
      // in the same .gen-field card, which the file-input handler below
      // routes into the library picker.
      const attachBtn = target.closest<HTMLElement>('[data-field-attach]');
      if (attachBtn) {
        e.preventDefault();
        e.stopPropagation();
        const field = attachBtn.closest<HTMLElement>('.gen-field');
        const hidden = field?.querySelector<HTMLInputElement>(
          'input[type="file"][data-field-file="1"]',
        );
        if (hidden) openLibraryPicker(hidden, field ?? attachBtn);
        return;
      }
      // Field-level "AI Rewrite" button — open the inline-agent popover
      // anchored on the field, targeting its text input/textarea so the
      // reworked value lands back in place.
      const rewriteBtn = target.closest<HTMLElement>('[data-field-rewrite]');
      if (rewriteBtn && onInlineAsk) {
        e.preventDefault();
        e.stopPropagation();
        const field = rewriteBtn.closest<HTMLElement>('.gen-field');
        const input = field?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'textarea, input[type="text"], input[type="url"], input[type="email"], input[type="number"], input[type="search"], input:not([type])',
        );
        if (!input || !field) return;
        pieceElRef.current = input as unknown as HTMLElement;
        const rect = field.getBoundingClientRect();
        const labelEl = field.querySelector<HTMLElement>('.gen-field-label');
        const title = (labelEl?.textContent ?? input.getAttribute("name") ?? "text").trim();
        setAskPop({
          mode: "caption",
          title,
          currentValue: input.value ?? "",
          rect: { top: rect.top, left: rect.right + 8, width: 320, height: rect.height },
          placement: "right",
          cardTitle: title,
        });
        return;
      }
      // Selection pill — toggleable choice chip. Single-select per data-group
      // unless the pill carries data-multi. Selections are mirrored into
      // hidden inputs on the surrounding form so handleSubmit picks them up.
      const pill = target.closest<HTMLElement>('[data-pill]');
      if (pill && pill.tagName === "BUTTON") {
        e.preventDefault();
        e.stopPropagation();
        const group =
          pill.getAttribute("data-group") ||
          pill.getAttribute("name") ||
          "choice";
        const multi = pill.hasAttribute("data-multi");
        const form = pill.closest("form") as HTMLFormElement | null;
        const scope: ParentNode = form ?? root;
        const value =
          pill.getAttribute("data-value") || pill.textContent?.trim() || "";
        const selectedClasses = ["ring-2", "ring-primary", "bg-primary/10"];
        const setPressed = (el: HTMLElement, on: boolean) => {
          el.setAttribute("aria-pressed", on ? "true" : "false");
          if (on) el.classList.add(...selectedClasses);
          else el.classList.remove(...selectedClasses);
        };
        if (multi) {
          const already = pill.getAttribute("aria-pressed") === "true";
          setPressed(pill, !already);
        } else {
          scope
            .querySelectorAll<HTMLElement>(
              `[data-pill][data-group="${CSS.escape(group)}"]`,
            )
            .forEach((b) => setPressed(b, b === pill));
        }
        if (form) {
          const existing = form.querySelectorAll<HTMLInputElement>(
            `input[type="hidden"][data-pill-input="1"][name="${CSS.escape(group)}"]`,
          );
          if (multi) {
            let removed = false;
            existing.forEach((i) => {
              if (i.value === value) {
                i.remove();
                removed = true;
              }
            });
            if (!removed) {
              const inp = document.createElement("input");
              inp.type = "hidden";
              inp.name = group;
              inp.value = value;
              inp.setAttribute("data-pill-input", "1");
              // Prepend so we don't displace the action row from :last-child
              // (the sticky-footer CSS keys off that selector).
              form.insertBefore(inp, form.firstChild);
            }
          } else {
            existing.forEach((i) => i.remove());
            const inp = document.createElement("input");
            inp.type = "hidden";
            inp.name = group;
            inp.value = value;
            inp.setAttribute("data-pill-input", "1");
            form.insertBefore(inp, form.firstChild);
          }
        }
        return;
      }
      // Intercept any click that would have opened a native file picker
      // (the file input itself, or a <label> wrapping one, or a button
      // marked data-upload) and route it through the Library modal so the
      // user can pick existing assets in addition to uploading new files.
      const fileInput = target.closest<HTMLInputElement>('input[type="file"]');
      const fileLabel = target.closest<HTMLElement>("label");
      const uploadBtn = target.closest<HTMLElement>('[data-upload]');
      const labeledInput = (() => {
        if (!fileLabel) return null;
        const forId = fileLabel.getAttribute("for");
        if (forId) {
          const el = root.querySelector<HTMLInputElement>(
            `#${CSS.escape(forId)}[type="file"]`,
          );
          if (el) return el;
        }
        return fileLabel.querySelector<HTMLInputElement>('input[type="file"]');
      })();
      const inputForPick = fileInput || labeledInput;
      if (inputForPick || uploadBtn) {
        e.preventDefault();
        e.stopPropagation();
        const anchor = inputForPick?.parentElement ?? uploadBtn ?? null;
        openLibraryPicker(inputForPick ?? null, anchor);
        return;
      }
      const btn = target.closest<HTMLElement>('[data-action="answer"]');
      // Fallback: any plain <button type="button"> inside a form (or in the
      // card body with no form) that lacks special data hooks. Models often
      // emit secondary CTAs (e.g. "Create new character") without
      // data-action="answer"; treat them as answers so they're clickable.
      const plainBtn = (() => {
        if (btn) return null;
        const b = target.closest<HTMLButtonElement>("button");
        if (!b || b.tagName !== "BUTTON") return null;
        if (b.type === "submit") return null;
        if (b.hasAttribute("data-pill")) return null;
        if (b.hasAttribute("data-capture")) return null;
        if (b.hasAttribute("data-upload")) return null;
        return b;
      })();
      const actionBtn = btn ?? plainBtn;
      if (!actionBtn || actionBtn.tagName !== "BUTTON") return;
      // Inside a form, only intercept explicit type="button" controls
      // (e.g. "You decide for me"). Real submit buttons fall through to
      // the form submit handler below.
      if (actionBtn.closest("form") && (actionBtn as HTMLButtonElement).type !== "button") return;
      e.preventDefault();
      const value =
        actionBtn.getAttribute("data-value") ?? actionBtn.textContent?.trim() ?? "";
      if (!value) return;
      // Selection acknowledgment: keep the turn on screen for a beat with the
      // clicked control highlighted and its siblings dimmed (see
      // [data-answered]/[data-selected] in styles.css), THEN dispatch — the
      // busy flip that follows plays the whole zone's exit animation.
      if (root.getAttribute("data-answered") === "1") return;
      root.setAttribute("data-answered", "1");
      actionBtn.setAttribute("data-selected", "1");
      const next = actionBtn.getAttribute("data-next") ?? undefined;
      const ack = actionBtn.getAttribute("data-ack") ?? undefined;
      window.setTimeout(() => onAnswer({ summary: value, assets: [], next, ack }), HOLD_MS);
    };

    const handleSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("data-action") !== "answer") return;
      e.preventDefault();
      const pairs: string[] = [];
      const assets: LiveAsset[] = [];
      const seen = new Map<string, unknown[]>();
      // First: pick up every file input in the form, named or not, so an
      // upload always reaches the answer payload.
      form.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((c) => {
        const list = pendingFiles.get(c) || [];
        if (list.length) assets.push(...list);
      });
      const controls = form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input[name], select[name], textarea[name]");
      controls.forEach((c) => {
        const name = c.name;
        if (!name) return;
        if (c instanceof HTMLInputElement && c.type === "file") {
          // already collected above; just surface ids under the named field
          const list = pendingFiles.get(c) || [];
          if (list.length) {
            const arr = seen.get(name) || [];
            for (const a of list) arr.push(a.id);
            seen.set(name, arr);
          }
          return;
        }
        if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) {
          if (!c.checked) return;
          const arr = seen.get(name) || [];
          arr.push(c.value || true);
          seen.set(name, arr);
          return;
        }
        const val = coerceValue(c);
        const arr = seen.get(name) || [];
        if (Array.isArray(val)) arr.push(...val);
        else arr.push(val);
        seen.set(name, arr);
      });
      for (const [name, vals] of seen) {
        const label = (() => {
          const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
          return el instanceof HTMLElement ? fieldLabel(el, name) : name;
        })();
        const printable = vals
          .map((v) => {
            if (typeof v === "string") return v;
            if (typeof v === "number") return String(v);
            if (typeof v === "boolean") return v ? "yes" : "no";
            return JSON.stringify(v);
          })
          .filter((s) => s !== "" && s !== "null")
          .join(", ");
        if (printable) pairs.push(`${label}: ${printable}`);
      }
      if (assets.length) {
        pairs.push(
          `attached — ${assets.map(describeAsset).join("; ")}`,
        );
      }
      onAnswer({
        summary: pairs.length ? pairs.join(" · ") : "Submitted",
        assets,
      });
    };

    root.addEventListener("click", handleClick);
    root.addEventListener("submit", handleSubmit);
    root.addEventListener("change", handleFileChange);
    return () => {
      root.removeEventListener("click", handleClick);
      root.removeEventListener("submit", handleSubmit);
      root.removeEventListener("change", handleFileChange);
    };
  }, [onAnswer, disabled, safe, onIntent]);

  // ─── Piece-level "Ask agent" pill ──────────────────────────────────────
  // Hovering any generated element (image / video / audio) or piece of a
  // generation (storyboard title/description/VO, card titles & captions,
  // list rows, brief/lyric lines) floats an "Ask agent" pill beside it.
  // Tapping opens the inline ask popover to the RIGHT of the piece and
  // nudges the piece slightly left while it's open (mirrors the stage
  // sidebar gesture).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!onInlineAsk) return;

    const PIECE_SELECTOR = [
      "[data-card] .gen-shot-eyebrow",
      "[data-card] p",
      "[data-card] li",
      "[data-card] h1",
      "[data-card] h2",
      "[data-card] h3",
      "[data-card] h4",
      "[data-card] img",
      "[data-card] video",
      "[data-card] audio",
      "[data-card-title]",
      "[data-card-caption]",
    ].join(", ");

    const isMediaPiece = (el: HTMLElement) => /^(IMG|VIDEO|AUDIO)$/.test(el.tagName);

    const pieceLabel = (el: HTMLElement): string => {
      const shot = el.closest<HTMLElement>(".gen-shot");
      if (shot) {
        const spec = shot.querySelector(".gen-shot-eyebrow")?.textContent?.trim();
        const base = spec || `Shot ${Number(shot.getAttribute("data-shot") ?? 0) + 1}`;
        if (el.classList.contains("gen-shot-title")) return `${base} title`;
        if (el.classList.contains("gen-shot-text")) return `${base} description`;
        if (el.classList.contains("gen-shot-vo")) return `${base} voiceover`;
        if (el.classList.contains("gen-shot-eyebrow")) return `${base} spec`;
      }
      if (el.hasAttribute("data-card-title")) return "title";
      if (el.hasAttribute("data-card-caption")) return "caption";
      if (el.tagName === "LI" && el.parentElement) {
        const idx = Array.from(el.parentElement.children).indexOf(el);
        return `item ${idx + 1}`;
      }
      const t = (el.textContent ?? "").trim();
      if (!t) return "this part";
      return t.length > 40 ? `"${t.slice(0, 40)}…"` : `"${t}"`;
    };

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "ask-agent-pill piece-ask-pill";
    pill.setAttribute("aria-label", "Ask the agent to rework this");
    pill.innerHTML = `${AGENT_SYMBOL_SVG}<span>Edit</span>`;
    root.appendChild(pill);

    let piece: HTMLElement | null = null;
    const hidePill = () => {
      piece = null;
      pill.removeAttribute("data-show");
    };

    const PILL_INSET = 8;

    const positionPill = (el: HTMLElement) => {
      const rr = root.getBoundingClientRect();
      const pr = el.getBoundingClientRect();
      // Pinned to the hovered element's own top-right corner — top: 8px,
      // right: 8px of that element (not the card).
      pill.style.top = `${Math.max(0, pr.top - rr.top + PILL_INSET)}px`;
      pill.style.left = "auto";
      pill.style.right = `${Math.max(0, rr.right - pr.right + PILL_INSET)}px`;
      pill.setAttribute("data-show", "1");
    };

    const onOver = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (pill.contains(t)) return;
      const next = t.closest?.(PIECE_SELECTOR) as HTMLElement | null;
      if (!next || !root.contains(next)) {
        hidePill();
        return;
      }
      // Input surfaces, pickers, CTA rows, thumb strips: not generations.
      if (
        next.closest(
          "[data-options], [data-gen-actions], .gen-actions, form, label, [data-variants], [data-upload]",
        )
      ) {
        hidePill();
        return;
      }
      // Don't hover-flash the pill over a field mid-edit.
      if (next.isContentEditable && document.activeElement === next) {
        hidePill();
        return;
      }
      const media = isMediaPiece(next);
      if (!media && !(next.textContent ?? "").trim()) {
        hidePill();
        return;
      }
      if (next !== piece) {
        piece = next;
        positionPill(next);
      }
    };

    const onLeave = () => hidePill();
    const onScroll = () => hidePill();

    const onPillClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = piece;
      if (!el) return;
      const card = el.closest<HTMLElement>("[data-card]");
      const cardTitle = (
        card?.querySelector<HTMLElement>("[data-card-title]")?.textContent ??
        card?.getAttribute("data-card-title") ??
        ""
      ).trim();
      // Anchor the popover to the parent-most generated block (the whole
      // card / storyboard), not the small piece. The card shifts left by
      // half the popover's footprint so card + popover sit as one group,
      // horizontally centered where the card alone was centered.
      const POP_W = 320;
      const POP_GAP = 16;
      const MARGIN = 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const parentMost = card ?? root;
      const cr = parentMost.getBoundingClientRect();
      // Base shift centers the group when the card is viewport-centered; the
      // popover then sits GAP px to the right of the card's SHIFTED right edge
      // (= cr.right - shift). Grow the shift if that would push the popover
      // past the right margin so it — and the card — slide further left and
      // stay fully on screen (the popover is what the user interacts with).
      let shift = (POP_W + POP_GAP) / 2;
      let left = cr.right - shift + POP_GAP;
      const overflowR = left + POP_W - (vw - MARGIN);
      if (overflowR > 0) {
        shift += overflowR;
        left -= overflowR;
      }
      if (left < MARGIN) {
        shift -= MARGIN - left;
        left = MARGIN;
      }
      // Match the card's height, but never exceed the viewport; keep the
      // top aligned to the card yet fully on-screen vertically.
      const height = Math.min(cr.height, vh - 2 * MARGIN);
      const top = Math.min(Math.max(MARGIN, cr.top), vh - MARGIN - height);
      const rect = { top, left, width: POP_W, height };
      // Slide the whole card left while the popover is open, and freeze a
      // storyboard's autoplay so the slide can't change mid-instruction.
      releaseAskTarget();
      askTargetElRef.current = parentMost;
      parentMost.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
      parentMost.style.transform = `translateX(${-shift}px)`;
      el.closest(".gen-storyboard")?.dispatchEvent(new Event("sb:pause"));
      // Retain the exact piece so the popup can write the reworked
      // text / fresh media src back into it in place.
      pieceElRef.current = el;
      if (isMediaPiece(el)) {
        const kind = el.tagName === "IMG" ? "image" : el.tagName === "VIDEO" ? "video" : "audio";
        setAskPop({
          mode: "media",
          title: cardTitle,
          currentValue: el.getAttribute("src") ?? "",
          rect,
          placement: "right",
          cardTitle,
          mediaKind: kind,
        });
      } else {
        setAskPop({
          mode: "caption",
          title: pieceLabel(el),
          currentValue: (el.textContent ?? "").trim(),
          rect,
          placement: "right",
          cardTitle,
        });
      }
      hidePill();
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    pill.addEventListener("click", onPillClick);
    return () => {
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll, { capture: true });
      pill.removeEventListener("click", onPillClick);
      pill.remove();
    };
  }, [safe, onInlineAsk, onIntent]);

  const handlePicked = async (result: PickerResult) => {
    if (!picker) return;
    const inputEl = picker.inputEl;

    // Anchor previews after the enclosing <label>, mirroring the file-input
    // change path — this keeps the "Attached" strip visibly outside the drop
    // zone box so the user can tell the upload worked.
    const previewAnchor: HTMLElement | null = inputEl
      ? (inputEl.closest("label") as HTMLElement | null) ?? inputEl
      : picker.anchor;
    const renderStrip = (
      items: {
        url: string;
        mime: string;
        name: string;
        pending?: boolean;
        error?: string;
      }[],
    ) => {
      if (!previewAnchor) return;
      const host = previewAnchor.parentElement;
      if (!host) return;
      let strip = Array.from(host.children).find(
        (c) =>
          c instanceof HTMLElement &&
          c.getAttribute("data-card-preview") === "1",
      ) as HTMLElement | undefined;
      if (!strip) {
        strip = document.createElement("div");
        strip.setAttribute("data-card-preview", "1");
        strip.className =
          "mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground";
        previewAnchor.after(strip);
      }
      strip.innerHTML = "";
      for (const a of items) {
        const wrap = document.createElement("div");
        wrap.className =
          "relative flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-2 pr-3" +
          (a.error ? " border-destructive text-destructive" : "");
        if (a.mime.startsWith("image/") && a.url) {
          const img = document.createElement("img");
          img.src = a.url;
          img.className =
            "h-12 w-12 rounded-xl object-cover" +
            (a.pending ? " opacity-60" : "");
          wrap.appendChild(img);
        } else {
          const dot = document.createElement("div");
          dot.className =
            "grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground" +
            (a.pending ? " opacity-60" : "");
          dot.textContent = a.mime.startsWith("audio/")
            ? "♪"
            : a.mime.startsWith("video/")
              ? "▶"
              : "•";
          wrap.appendChild(dot);
        }
        const col = document.createElement("div");
        col.className = "flex flex-col";
        const name = document.createElement("span");
        name.className = "max-w-[180px] truncate text-foreground";
        name.textContent = a.name;
        col.appendChild(name);
        const status = document.createElement("span");
        status.className = "text-[11px]";
        status.textContent = a.error
          ? a.error
          : a.pending
            ? "Uploading…"
            : "Attached";
        if (a.error) status.classList.add("text-destructive");
        else if (a.pending) status.classList.add("text-muted-foreground");
        else status.classList.add("text-emerald-600");
        col.appendChild(status);
        wrap.appendChild(col);
        strip.appendChild(wrap);
      }
    };

    let assets: LiveAsset[] = [];
    if (result.kind === "library") {
      assets = result.assets;
      renderStrip(
        assets.map((a) => ({ url: a.url, mime: a.mime, name: a.name })),
      );
    } else {
      // Show pending previews IMMEDIATELY so the user sees the picked file
      // before the upload round-trip finishes.
      const pendingItems = result.files.map((f) => ({
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
        mime: f.type || "application/octet-stream",
        name: f.name,
        pending: true,
      }));
      renderStrip(pendingItems);
      setPicker(null);

      const anchor = inputEl ?? picker.anchor ?? ref.current ?? document.body;
      const finalItems: {
        url: string;
        mime: string;
        name: string;
        error?: string;
      }[] = [];
      for (const f of result.files) {
        try {
          const a = await fileToAsset(f, anchor as HTMLElement, projectId);
          assets.push(a);
          finalItems.push({ url: a.url, mime: a.mime, name: a.name });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[generative-card] upload failed", err);
          finalItems.push({
            url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
            mime: f.type || "application/octet-stream",
            name: f.name,
            error: msg,
          });
        }
      }
      renderStrip(finalItems);
    }

    if (!assets.length) {
      setPicker(null);
      return;
    }
    const standalone = !inputEl || !inputEl.closest("form");
    if (inputEl) {
      pendingFilesRef.current.set(inputEl, assets);
    }
    setPicker(null);
    if (standalone) {
      onAnswer({
        summary: assets.map(describeAsset).join("; "),
        assets,
      });
    } else if (inputEl) {
      // The user picked media inside a wrapping <form>. Most cards have
      // exactly one upload tile and no other required fields, so the user
      // expects the upload itself to advance the step. Try to auto-submit
      // the form — if other required fields are still empty, native form
      // validation will block and the user can fill them in.
      const form = inputEl.closest("form") as HTMLFormElement | null;
      if (form) {
        try {
          if (typeof form.requestSubmit === "function") form.requestSubmit();
          else form.submit();
        } catch (err) {
          console.warn("[generative-card] auto-submit after upload failed", err);
        }
      }
    }
  };



  return (
    <>
      <div
        ref={ref}
        className="generative-card relative flex w-full flex-col gap-4 text-base leading-relaxed"
      />
      {picker && (

        <AssetPickerDialog
          open
          onOpenChange={(v) => {
            if (!v) setPicker(null);
          }}
          accept={picker.accept}
          multiple={picker.multiple}
          onPick={(result) => {
            void handlePicked(result);
          }}
        />
      )}
      {/* Popovers portal to <body>: they're position:fixed, but an animated
          ancestor (the stage zone's motion.div leaves an inline filter /
          transform at rest) would otherwise become their containing block
          and offset their fixed coordinates. Portaling escapes that. */}
      {askPop &&
        !!onInlineAsk &&
        typeof document !== "undefined" &&
        createPortal(
          <CaptionAskPopover
            title={askPop.title}
            currentValue={askPop.currentValue}
            rect={askPop.rect}
            placement={askPop.placement}
            heading={askPop.mode === "media" ? "Edit with agent" : undefined}
            onClose={() => {
              releaseAskTarget();
              setAskPop(null);
            }}
            onAsk={async (instruction) => {
              // The conversation stays in the popup: the request runs through
              // the inline-edit API (no main-loop turn, stage untouched), and
              // the result is applied to the retained piece IN PLACE.
              const el = pieceElRef.current;
              if (askPop.mode === "media") {
                const result = await onInlineAsk({
                  kind: "media",
                  mediaKind: askPop.mediaKind ?? "image",
                  mediaUrl: el?.getAttribute("src") ?? askPop.currentValue,
                  cardTitle: askPop.cardTitle || undefined,
                  instruction,
                });
                if (result.ok && result.mediaUrl && el) {
                  el.setAttribute("src", result.mediaUrl);
                  if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) el.load();
                }
                return result;
              }
              const result = await onInlineAsk({
                kind: "piece",
                pieceLabel: askPop.title || "text",
                currentValue: askPop.currentValue,
                cardTitle: askPop.cardTitle || undefined,
                instruction,
              });
              if (result.ok && result.assistantText && el) {
                if (
                  el instanceof HTMLTextAreaElement ||
                  el instanceof HTMLInputElement
                ) {
                  el.value = result.assistantText;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                } else {
                  el.textContent = result.assistantText;
                }
                // Brief highlight so the in-place change is unmissable.
                el.animate(
                  [
                    { backgroundColor: "rgba(207, 195, 255, 0.45)" },
                    { backgroundColor: "transparent" },
                  ],
                  { duration: 900, easing: "ease-out" },
                );
                // Later instructions iterate on the NEW value.
                setAskPop((p) => (p ? { ...p, currentValue: result.assistantText! } : p));
              }
              return result;
            }}
          />,
          document.body,
        )}
      {morePop &&
        typeof document !== "undefined" &&
        createPortal(
          <MoreActionsPopover
            mediaUrl={morePop.mediaUrl}
            promptText={morePop.promptText}
            rect={morePop.rect}
            onClose={() => setMorePop(null)}
          />,
          document.body,
        )}
    </>
  );
});

function MoreActionsPopover({
  mediaUrl,
  promptText,
  rect,
  onClose,
}: {
  mediaUrl: string;
  promptText: string;
  rect: { top: number; left: number };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const top = Math.min(rect.top, window.innerHeight - 140);
  const left = Math.max(12, rect.left - 200);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed z-50 flex w-[200px] flex-col overflow-hidden rounded-2xl border border-border bg-background py-1 shadow-xl"
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
      >
        {mediaUrl && (
          <a
            href={mediaUrl}
            download
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="px-4 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
          >
            Download media
          </a>
        )}
        {promptText && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(promptText);
              setCopied(true);
              setTimeout(onClose, 700);
            }}
            className="px-4 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        )}
        {!mediaUrl && !promptText && (
          <div className="px-4 py-2.5 text-sm text-muted-foreground">
            No actions available
          </div>
        )}
      </div>
    </>
  );
}

const QUICK_CAPTION_INSTRUCTIONS = ["Rewrite", "Shorter", "Punchier", "More cinematic"];

// One in-popup exchange: the instruction, its live status, and the agent's
// reply (for text pieces the reply IS the reworked copy applied in place).
type AskThreadEntry = {
  id: number;
  instruction: string;
  status: "pending" | "done" | "error";
  replyText?: string;
  error?: string;
};

function CaptionAskPopover({
  title,
  currentValue,
  rect,
  placement,
  heading,
  onClose,
  onAsk,
}: {
  title: string;
  currentValue: string;
  /** height present = match the parent-most card (same top, same height). */
  rect: { top: number; left: number; width: number; height?: number };
  /** "right": rect.left already IS the popover's left edge (right of the
   *  element being edited); default keeps the legacy left-of-anchor math. */
  placement?: "right";
  heading?: string;
  onClose: () => void;
  /** Runs the instruction through the inline-edit API; the caller applies
   *  the result to the edited element. The popup stays open to iterate. */
  onAsk: (instruction: string) => Promise<InlineAskResult>;
}) {
  const [value, setValue] = useState("");
  const [thread, setThread] = useState<AskThreadEntry[]>([]);
  const busy = thread.some((t) => t.status === "pending");
  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    // rAF: the popover mounts mid-click — focusing on the next frame keeps
    // the click sequence from stealing focus straight back.
    const id = requestAnimationFrame(() =>
      textareaRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread]);

  const send = (instruction: string) => {
    const v = instruction.trim();
    if (!v || busy) return;
    const id = ++idRef.current;
    setThread((t) => [...t, { id, instruction: v, status: "pending" }]);
    setValue("");
    void (async () => {
      try {
        const result = await onAsk(v);
        setThread((t) =>
          t.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: result.ok ? "done" : "error",
                  replyText: result.assistantText,
                  error: result.ok ? undefined : (result.error ?? "Something went wrong"),
                }
              : e,
          ),
        );
      } catch (err) {
        setThread((t) =>
          t.map((e) =>
            e.id === id
              ? { ...e, status: "error", error: err instanceof Error ? err.message : "Something went wrong" }
              : e,
          ),
        );
      } finally {
        requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
      }
    })();
  };

  // With a height (piece-level pill): match the parent-most card exactly —
  // same top, same height. Without one (legacy trio path): float below the
  // anchor as before.
  const top = rect.height
    ? Math.max(12, rect.top)
    : Math.min(rect.top, window.innerHeight - 320);
  const height = rect.height
    ? Math.max(220, Math.min(rect.height, window.innerHeight - top - 12))
    : undefined;
  const left =
    placement === "right"
      ? Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))
      : Math.max(12, rect.left - rect.width);
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed z-50 flex flex-col overflow-hidden rounded-[24px] border shadow-xl"
        style={{
          top,
          left,
          width: rect.width,
          height,
          background: "var(--surface-light-1)",
          borderColor: "var(--surface-dark-6)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6" style={{ height: 81 }}>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex size-6 items-center justify-center text-black"
              dangerouslySetInnerHTML={{
                __html: AGENT_SYMBOL_SVG.replace(
                  'width="14" height="14"',
                  'width="22" height="22"',
                ),
              }}
            />
            <p className="text-[16px] font-medium leading-[20px] text-black" style={{ fontFamily: '"Telka Extended", Telka, sans-serif' }}>
              {heading ?? (title ? `Edit ${title}` : "Edit with Agent")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-[33px] items-center justify-center rounded-[12px] border px-2 text-[12px] font-medium leading-4"
              style={{
                borderColor: "var(--surface-dark-6)",
                color: "var(--content-dark-quaternary)",
                fontFamily: "Telka, sans-serif",
              }}
            >
              ESC
            </button>
            <span
              className="text-[12px] font-medium leading-4"
              style={{
                color: "var(--content-dark-quaternary)",
                fontFamily: "Telka, sans-serif",
              }}
            >
              to Close
            </span>
          </div>
        </div>

        {/* Body — conversation */}
        <div
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
        >
          {thread.length === 0 && currentValue && (
            <div className="text-[13px] leading-[18px] line-clamp-3" style={{ color: "var(--content-dark-quaternary)", fontFamily: "Telka, sans-serif" }}>
              {currentValue}
            </div>
          )}
          {thread.map((t) => (
            <div key={t.id} className="flex flex-col gap-3">
              <div className="flex flex-col items-end">
                <div
                  className="rounded-[16px] px-[10px] py-[10px] text-[15px] leading-[18px]"
                  style={{
                    background: "var(--surface-accent-4)",
                    color: "var(--content-dark-secondary)",
                    fontFamily: "Telka, sans-serif",
                    maxWidth: "85%",
                  }}
                >
                  {t.instruction}
                </div>
              </div>
              {t.status === "pending" && (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex size-4 items-center justify-center"
                    style={{ color: "var(--content-dark-quaternary)" }}
                    dangerouslySetInnerHTML={{ __html: AGENT_SYMBOL_SVG }}
                  />
                  <div
                    className="text-[12px] leading-4"
                    style={{
                      color: "var(--content-dark-quaternary)",
                      fontFamily: '"Telka Extended", Telka, sans-serif',
                      fontWeight: 500,
                    }}
                  >
                    <Shimmer>Regenerating...</Shimmer>
                  </div>
                </div>
              )}
              {t.status === "done" && (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex size-4 items-center justify-center"
                    style={{ color: "var(--content-accent-darkened)" }}
                    dangerouslySetInnerHTML={{ __html: AGENT_SYMBOL_SVG }}
                  />
                  <span
                    className="text-[12px] leading-4"
                    style={{
                      color: "var(--content-dark-quaternary)",
                      fontFamily: '"Telka Extended", Telka, sans-serif',
                      fontWeight: 500,
                    }}
                  >
                    Applied
                  </span>
                </div>
              )}
              {t.status === "error" && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {t.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer — quick chips + composer */}
        <div className="flex flex-col gap-[10px] p-3">
          <div className="flex flex-wrap gap-1">
            {QUICK_CAPTION_INSTRUCTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => send(q)}
                className="flex items-center justify-center rounded-[99px] px-3 pt-2 pb-[10px] text-[12px] leading-4 transition disabled:opacity-40"
                style={{
                  background: "var(--surface-accent-5)",
                  color: "var(--content-accent-darkened)",
                  fontFamily: "Telka, sans-serif",
                  fontWeight: 500,
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <div
            className="flex items-center justify-between gap-2 rounded-[16px] border p-2"
            style={{
              background: "var(--surface-light-2)",
              borderColor: "var(--surface-dark-6)",
            }}
          >
            <input
              ref={textareaRef as unknown as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(value);
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              placeholder="Describe the change..."
              disabled={busy}
              className="flex-1 bg-transparent pl-4 text-[15px] leading-[18px] outline-none placeholder:opacity-50 disabled:opacity-60"
              style={{
                color: "var(--content-dark-primary)",
                fontFamily: "Telka, sans-serif",
              }}
            />
            <button
              type="button"
              onClick={() => send(value)}
              disabled={!value.trim() || busy}
              aria-label="Ask agent"
              className="flex h-10 min-w-12 items-center justify-center rounded-[18px] px-3 py-[10px] text-white transition disabled:opacity-40"
              style={{ background: "var(--surface-dark-1)" }}
            >
              <ArrowUp className="size-5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


export function DecisionPill({
  title,
  answer,
  onRevise,
  assets,
  imageUrls,
  skillSlug,
}: {
  title: string;
  answer: string;
  onRevise?: () => void;
  assets?: ProjectAsset[];
  imageUrls?: string[];
  skillSlug?: string;
}) {
  const ID_RE = /\[((?:ast_[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\]/gi;
  const ids = Array.from(answer.matchAll(ID_RE)).map((m) => m[1]);
  const byId = new Map((assets ?? []).map((a) => [a.id, a]));
  const refs = ids.map((id) => byId.get(id)).filter(Boolean) as ProjectAsset[];
  const refImages = refs.filter((a) => a.mime.startsWith("image/"));
  const extraImages = (imageUrls ?? []).filter(
    (u) => !refImages.some((a) => a.url === u),
  );
  const images = refImages;
  const others = refs.filter((a) => !a.mime.startsWith("image/"));

  const DESCRIPTOR_RE = new RegExp(
    "(?:^|\\s|·|;)\\s*[^:;·\\n]+:\\s*[^;·\\n]*?\\[(?:(?:ast_[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\\](?:\\s+url=\\S+)?",
    "gi",
  );
  const cleaned = answer
    .replace(DESCRIPTOR_RE, "")
    .replace(ID_RE, "")
    .replace(/\s*url=\S+/gi, "")
    .replace(/^\s*attached\s*[—-]\s*/i, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^[\s·;,-]+|[\s·;,-]+$/g, "")
    .trim();

  const fetchCover = useServerFn(getSkillCover);
  const cover = useQuery({
    queryKey: ["skill-cover", skillSlug ?? ""],
    queryFn: () => fetchCover({ data: { slug: skillSlug! } }),
    enabled: !!skillSlug,
    staleTime: 5 * 60_000,
  });
  const skillHero = cover.data;
  const heroIsVideo = (skillHero?.mime ?? "").startsWith("video/");


  return (
    <button
      type="button"
      onClick={onRevise}
      disabled={!onRevise}
      title={onRevise ? "Revise this decision" : undefined}
      className="ml-auto flex max-w-[80%] animate-pill-land flex-col gap-1.5 self-end rounded-3xl bg-secondary px-5 py-3.5 text-left text-foreground transition enabled:cursor-pointer enabled:hover:shadow-glow"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {skillSlug && skillHero?.url && (
        <div className="flex flex-col gap-2 pt-1">
          {heroIsVideo ? (
            <video
              src={skillHero.url}
              autoPlay
              muted
              loop
              playsInline
              className="max-h-56 w-full rounded-2xl object-cover"
            />
          ) : (
            <img
              src={skillHero.url}
              alt={skillHero.name ?? "Skill"}
              className="max-h-56 w-full rounded-2xl object-cover"
            />
          )}
          {skillHero.name && (
            <span className="text-sm font-medium text-foreground">
              {skillHero.name}
            </span>
          )}
        </div>
      )}
      {(images.length > 0 || extraImages.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {images.map((a) => (
            <img
              key={a.id}
              src={a.url}
              alt={a.name}
              className="max-h-64 max-w-full rounded-2xl object-cover"
            />
          ))}
          {extraImages.map((url) => (
            <img
              key={url}
              src={url}
              alt="attachment"
              className="max-h-64 max-w-full rounded-2xl object-cover"
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {others.map((a) => (
            <div
              key={a.id}
              className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground"
            >
              {a.mime.startsWith("audio/") ? "♪ " : a.mime.startsWith("video/") ? "▶ " : "• "}
              {a.name}
            </div>
          ))}
        </div>
      )}
      {cleaned && <span className="text-lg font-normal leading-snug">{cleaned}</span>}
    </button>
  );
}

export function UserBubble({
  text,
  assets,
  meta,
  imageUrls,
  videoUrls,
}: {
  text: string;
  assets?: ProjectAsset[];
  meta?: { modelLabel?: string; summary?: string } | null;
  imageUrls?: string[];
  videoUrls?: string[];
}) {
  // Pull asset ids out of the summary so we can render attachments inline.
  // Asset IDs are UUIDs (or legacy `ast_…` strings).
  const ID_RE = /\[((?:ast_[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\]/gi;
  const ids = Array.from(text.matchAll(ID_RE)).map((m) => m[1]);
  const byId = new Map((assets ?? []).map((a) => [a.id, a]));
  const refs = ids.map((id) => byId.get(id)).filter(Boolean) as ProjectAsset[];

  // Strip "<label>: filename [id] url=…" descriptors so the bubble shows clean
  // prose instead of the raw wizard summary.
  const DESCRIPTOR_RE = new RegExp(
    "(?:^|\\s|·|;)\\s*[^:;·\\n]+:\\s*[^;·\\n]*?\\[(?:(?:ast_[a-z0-9]+)|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\\](?:\\s+url=\\S+)?",
    "gi",
  );
  let cleaned = text
    .replace(DESCRIPTOR_RE, "")
    .replace(ID_RE, "")
    .replace(/\s*url=\S+/gi, "")
    .replace(/^\s*attached\s*[—-]\s*/i, "")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/^[\s·;,-]+|[\s·;,-]+$/g, "")
    .trim();


  const images = refs.filter((a) => a.mime.startsWith("image/"));
  const others = refs.filter((a) => !a.mime.startsWith("image/"));

  return (
    <div className="ml-auto flex max-w-[80%] animate-pill-land flex-col gap-2 self-end">
      {(images.length > 0 || (imageUrls?.length ?? 0) > 0) && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((a) => (
            <img
              key={a.id}
              src={a.url}
              alt={a.name}
              className="max-h-64 max-w-full rounded-3xl object-cover shadow-elegant"
            />
          ))}
          {(imageUrls ?? []).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="max-h-64 max-w-full rounded-3xl object-cover shadow-elegant"
            />
          ))}
        </div>
      )}
      {(videoUrls?.length ?? 0) > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {(videoUrls ?? []).map((url) => (
            <video
              key={url}
              src={url}
              autoPlay
              loop
              muted
              playsInline
              className="max-h-64 max-w-full rounded-3xl object-cover shadow-elegant"
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {others.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground"
            >
              {a.mime.startsWith("audio/") ? "♪ " : a.mime.startsWith("video/") ? "▶ " : "• "}
              {a.name}
            </div>
          ))}
        </div>
      )}
      {cleaned && (
        <div className="rounded-3xl bg-secondary px-5 py-3.5 text-lg font-normal leading-snug text-foreground">
          {cleaned}
        </div>
      )}
      {meta && (meta.modelLabel || meta.summary) && (
        <div className="self-end text-[11px] text-muted-foreground">
          {[meta.modelLabel, meta.summary].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}

export function AssistantMessage({ text }: { text: string }) {
  const patch = extractProjectPatch(text) as
    | { assetsAppend?: Array<{ url?: string; mime?: string; name?: string; label?: string }> }
    | null;
  const assets = (patch?.assetsAppend ?? []).filter((a) => !!a.url);
  const routingMatch = text.match(/<div\s+data-routing-chip\s+data-app-label="([^"]+)"\s*><\/div>/);
  const routingLabel = routingMatch?.[1] ?? null;
  const prose = extractCardProse(text) || extractCardTitle(text) || (assets.length || routingLabel ? "" : text);
  return (
    <div className="flex max-w-[85%] flex-col gap-3 self-start">
      {routingLabel && (
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Using <strong className="font-medium text-foreground">{routingLabel}</strong>
        </div>
      )}
      {prose && (
        <WordsRamp
          text={prose}
          className="font-display text-2xl font-medium leading-snug tracking-tight text-foreground"
        />
      )}
      {assets.map((asset, i) => {
        const url = asset.url!;
        const mime = asset.mime ?? "";
        return (
          <div
            key={`${url}-${i}`}
            className="overflow-hidden rounded-2xl bg-muted"
          >
            {mime.startsWith("video/") ? (
              <video src={url} controls className="block max-h-[480px] w-full" />
            ) : mime.startsWith("audio/") ? (
              <audio src={url} controls className="w-full" />
            ) : (
              <img
                src={url}
                alt={asset.label ?? asset.name ?? "Generated media"}
                className="block max-h-[480px] w-full object-contain"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

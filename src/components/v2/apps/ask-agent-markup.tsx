import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Send, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileToProjectAsset } from "@/lib/v2/upload-asset";
import type { ProjectAsset } from "@/lib/project-state";

type Stroke = Array<{ x: number; y: number }>; // normalized 0..1

export function AskAgentMarkup({
  asset,
  displayUrl,
  projectId,
  onClose,
  onAsk,
}: {
  asset: ProjectAsset;
  displayUrl: string;
  projectId: string;
  onClose: () => void;
  onAsk: (args: {
    prompt: string;
    referenceImageUrls: string[];
  }) => void | Promise<void>;
}) {
  const isImage = asset.mime.startsWith("image/");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function toNormalized(e: React.PointerEvent) {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!isImage) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toNormalized(e);
    if (p) setCurrent([p]);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!current) return;
    const p = toNormalized(e);
    if (p) setCurrent((s) => (s ? [...s, p] : s));
  }
  function handlePointerUp() {
    if (current && current.length > 1) {
      setStrokes((all) => [...all, current]);
    }
    setCurrent(null);
  }

  function undo() {
    setStrokes((all) => all.slice(0, -1));
  }

  async function renderAnnotatedImage(): Promise<File | null> {
    if (!isImage) return null;
    const img = imgRef.current;
    if (!img) return null;
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Draw image via a fresh crossOrigin request so canvas isn't tainted.
    await new Promise<void>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        ctx.drawImage(im, 0, 0, w, h);
        resolve();
      };
      im.onerror = () => reject(new Error("Image load failed"));
      im.src = displayUrl;
    }).catch(() => {
      // Fallback: use the already-loaded (possibly tainted) img.
      try {
        ctx.drawImage(img, 0, 0, w, h);
      } catch {
        /* ignore */
      }
    });
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.006);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x * w, s[0].y * h);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * w, s[i].y * h);
      ctx.stroke();
    }
    const blob: Blob | null = await new Promise((r) =>
      canvas.toBlob(r, "image/png"),
    );
    if (!blob) return null;
    return new File([blob], `annotated-${asset.id}.png`, { type: "image/png" });
  }

  async function submit() {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const refs: string[] = [];
      if (isImage && strokes.length > 0) {
        const file = await renderAnnotatedImage();
        if (file) {
          const uploaded = await fileToProjectAsset(file, projectId, "reference");
          if (uploaded.url) refs.push(uploaded.url);
        }
      }
      // Always include the original asset URL as fallback context.
      if (refs.length === 0 && /^https?:/.test(asset.url)) {
        refs.push(asset.url);
      }
      const label = asset.label ? ` (${asset.label})` : "";
      const prefix = strokes.length > 0
        ? `About the circled area in this output${label} —`
        : `About this output${label} —`;
      await onAsk({
        prompt: `${prefix} ${trimmed}`,
        referenceImageUrls: refs,
      });
      onClose();
    } catch (err) {
      // Surface but keep dialog open so user can retry.
      console.error("Ask agent failed", err);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={wrapRef}
        className="relative flex max-h-[92vh] w-[min(92vw,900px)] flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Pencil className="h-4 w-4 text-rose-500" />
            Ask the agent about this
            {isImage && (
              <span className="text-xs text-muted-foreground font-normal">
                · Drag to circle, then type
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isImage && strokes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={undo}
                className="h-8 gap-1.5 text-xs"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 min-h-0 overflow-auto bg-muted/30 p-4">
          {isImage ? (
            <div className="relative mx-auto inline-block max-w-full">
              <img
                ref={imgRef}
                src={displayUrl}
                alt=""
                crossOrigin="anonymous"
                draggable={false}
                className="block max-h-[65vh] w-auto max-w-full select-none rounded-md"
              />
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: "crosshair" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
              >
                {[...strokes, ...(current ? [current] : [])].map((s, i) => (
                  <polyline
                    key={i}
                    points={s.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={0.008}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    style={{ strokeWidth: 4 }}
                  />
                ))}
              </svg>
            </div>
          ) : asset.mime.startsWith("video/") ? (
            <video
              src={displayUrl}
              controls
              className="mx-auto block max-h-[65vh] w-auto max-w-full rounded-md"
            />
          ) : (
            <div className="grid h-32 place-items-center text-sm text-muted-foreground">
              {asset.label ?? asset.name}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-hairline p-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={
              isImage && strokes.length > 0
                ? "What should the agent do with the circled area?"
                : "What should the agent do with this?"
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
          <Button
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            className="h-10 gap-1.5"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Ask
          </Button>
        </div>
      </div>
    </div>
  );
}

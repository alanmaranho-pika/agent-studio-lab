import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, X, Copy, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { startExport, getExportStatus } from "@/lib/export.functions";
import type {
  ExportAspect,
  ExportFormat,
  ExportResolution,
  ExportSettings,
} from "@/lib/export-types";
import { TimelinePlayer } from "@/components/v2/apps/timeline-player";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  hasMusic: boolean;
  visualCount: number;
};

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "mp4", label: "MP4", hint: "Universal video" },
  { id: "gif", label: "GIF", hint: "Looping, no audio" },
  { id: "webm", label: "WebM", hint: "Transparent ok" },
  { id: "mp3", label: "MP3", hint: "Audio only" },
];

const ASPECTS: { id: ExportAspect; label: string }[] = [
  { id: "original", label: "Source" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
];

const RESOLUTIONS: { id: ExportResolution; label: string }[] = [
  { id: "480p", label: "480p" },
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
];

const QUALITIES: { id: "low" | "medium" | "high"; label: string }[] = [
  { id: "low", label: "Draft" },
  { id: "medium", label: "Standard" },
  { id: "high", label: "High" },
];

const BACKGROUNDS: { id: "black" | "white" | "transparent"; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "white", label: "White" },
  { id: "transparent", label: "Transparent" },
];


function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-28 shrink-0 text-sm font-semibold text-foreground">
      {children}
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  disabled?: (id: T) => boolean;
}) {
  return (
    <div className="flex flex-1 flex-wrap gap-1.5">
      {options.map((o) => {
        const dis = disabled?.(o.id);
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={dis}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
              "min-w-[64px]",
              active
                ? "border-border bg-muted text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:text-foreground",
              dis && "cursor-not-allowed opacity-30 hover:text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  hasMusic,
  visualCount,
}: Props) {
  const [settings, setSettings] = useState<ExportSettings>(() => ({
    format: "mp4",
    resolution: "1080p",
    fps: 30,
    aspect: "original",
    quality: "medium",
    background: "black",
    includeMusic: hasMusic,
  }));

  useEffect(() => {
    setSettings((s) => ({ ...s, includeMusic: hasMusic && s.includeMusic }));
  }, [hasMusic]);




  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "rendering" | "done" | "failed">(
    "idle",
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const startFn = useServerFn(startExport);
  const statusFn = useServerFn(getExportStatus);

  const startMut = useMutation({
    mutationFn: (s: ExportSettings) =>
      startFn({ data: { projectId: projectId!, settings: s } }),
    onSuccess: (res) => {
      setJobId(res.jobId);
      setSubmissionError(res.error ?? null);
      if (res.status === "failed") {
        setPhase("failed");
      } else {
        setPhase("rendering");
      }
    },
    onError: (err) => {
      setSubmissionError(err instanceof Error ? err.message : String(err));
      setPhase("failed");
    },
  });

  const statusQ = useQuery({
    queryKey: ["export-status", jobId],
    queryFn: () => statusFn({ data: { jobId: jobId! } }),
    enabled: !!jobId && phase === "rendering",
    refetchInterval: 2000,
  });

  useEffect(() => {
    const s = statusQ.data;
    if (!s) return;
    if (s.status === "done") setPhase("done");
    else if (s.status === "failed") setPhase("failed");
  }, [statusQ.data]);

  const fpsOptions = settings.format === "gif" ? [12, 15, 24] : [24, 30, 60];

  const dimensions = useMemo(() => {
    const map: Record<ExportResolution, [number, number]> = {
      "480p": [854, 480],
      "720p": [1280, 720],
      "1080p": [1920, 1080],
    };
    return map[settings.resolution];
  }, [settings.resolution]);

  const aspectRatio = useMemo(() => {
    if (settings.aspect === "original") return "16/9";
    return settings.aspect.replace(":", "/");
  }, [settings.aspect]);

  const reset = () => {
    setJobId(null);
    setPhase("idle");
    setSubmissionError(null);
    startMut.reset();
  };

  const handleClose = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      if (phase === "done" || phase === "failed") reset();
    }
  };

  const status = statusQ.data;
  const errorMsg =
    phase === "failed"
      ? (status?.error || submissionError || startMut.error?.message || "Render failed")
      : null;

  const isAudioOnly = settings.format === "mp3";
  const outputUrl = phase === "done" ? status?.outputUrl : undefined;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-2xl",
          "sm:rounded-2xl",
        )}
      >
        <DialogTitle className="sr-only">Export</DialogTitle>
          <DialogDescription className="sr-only">
            Configure export settings, render the project, and preview or download the result.
          </DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

        {/* Preview — large, top center, capped to viewport */}
        <div className="flex flex-col items-center px-8 pb-6 pt-6">
          {phase === "idle" ? (
            <div
              className="flex w-full items-center justify-center"
              style={{ maxWidth: "min(560px, 100%)" }}
            >
              <TimelinePlayer
                projectId={projectId}
                aspectRatio={aspectRatio}
                background={settings.background}
                maxHeight="min(28vh, 240px)"
              />
            </div>
          ) : (
            <div
              className="flex w-full items-center justify-center"
              style={{ height: "min(38vh, 360px)" }}
            >
              <div
                className={cn(
                  "relative h-full max-w-full overflow-hidden rounded-xl",
                  settings.background === "white" ? "bg-white" : "bg-black",
                )}
                style={{ aspectRatio }}
              >
                {phase === "rendering" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                    <div className="font-display text-6xl font-semibold tabular-nums text-white">
                      {Math.round(status?.progress ?? 5)}
                      <span className="text-2xl text-white/50">%</span>
                    </div>
                    <div className="h-2 w-2/3 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full bg-white transition-[width] duration-500"
                        style={{ width: `${Math.max(5, status?.progress ?? 5)}%` }}
                      />
                    </div>
                    <div className="text-xs font-medium text-white/70">
                      {labelForStatus(status?.status)}
                    </div>
                  </div>
                ) : phase === "failed" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-white text-white">
                      <X className="h-6 w-6" strokeWidth={3} />
                    </div>
                    <div className="max-w-xs px-4 text-sm text-white/80">{errorMsg}</div>
                  </div>
                ) : outputUrl ? (
                  isAudioOnly ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <audio src={outputUrl} controls className="w-full" />
                    </div>
                  ) : settings.format === "gif" ? (
                    <img src={outputUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <video
                      src={outputUrl}
                      controls
                      playsInline
                      className="h-full w-full"
                      style={{ aspectRatio }}
                    />
                  )
                ) : null}
              </div>
            </div>
          )}

        </div>


        {/* Settings */}
        {phase === "idle" && (
          <div className="space-y-4 border-t border-border/60 px-7 py-6">
            <div className="flex items-center gap-3">
              <FieldLabel>Format</FieldLabel>
              <Seg
                value={settings.format}
                options={FORMATS}
                onChange={(v) =>
                  setSettings((s) => ({
                    ...s,
                    format: v,
                    fps: v === "gif" ? 15 : s.fps > 30 ? 30 : s.fps,
                    resolution:
                      v === "gif" && s.resolution === "1080p" ? "720p" : s.resolution,
                  }))
                }
                disabled={(id) => id === "mp3" && !hasMusic}
              />
            </div>

            {!isAudioOnly && (
              <>
                <div className="flex items-center gap-3">
                  <FieldLabel>Aspect</FieldLabel>
                  <Seg
                    value={settings.aspect}
                    options={ASPECTS}
                    onChange={(v) => setSettings((s) => ({ ...s, aspect: v }))}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <FieldLabel>Resolution</FieldLabel>
                  <Seg
                    value={settings.resolution}
                    options={RESOLUTIONS}
                    onChange={(v) => setSettings((s) => ({ ...s, resolution: v }))}
                    disabled={(id) => settings.format === "gif" && id === "1080p"}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <FieldLabel>Frame rate</FieldLabel>
                  <Seg
                    value={String(settings.fps) as "24" | "30" | "60"}
                    options={fpsOptions.map((f) => ({
                      id: String(f) as "24" | "30" | "60",
                      label: `${f}`,
                    }))}
                    onChange={(v) => setSettings((s) => ({ ...s, fps: Number(v) }))}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <FieldLabel>Quality</FieldLabel>
                  <Seg
                    value={settings.quality}
                    options={QUALITIES}
                    onChange={(v) => setSettings((s) => ({ ...s, quality: v }))}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <FieldLabel>Background</FieldLabel>
                  <Seg
                    value={settings.background}
                    options={BACKGROUNDS}
                    onChange={(v) => setSettings((s) => ({ ...s, background: v }))}
                    disabled={(id) =>
                      id === "transparent" && settings.format !== "webm"
                    }
                  />
                </div>
              </>
            )}

            {hasMusic && (
              <div className="flex items-center gap-3">
                <FieldLabel>Music</FieldLabel>
                <Seg
                  value={settings.includeMusic ? "on" : "off"}
                  options={[
                    { id: "on", label: "On" },
                    { id: "off", label: "Off" },
                  ]}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, includeMusic: v === "on" }))
                  }
                />
              </div>
            )}
          </div>
        )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 border-t border-border/60 bg-muted/40 px-5 py-3">
          {phase === "idle" && (
            <button
              onClick={() => startMut.mutate(settings)}
              disabled={startMut.isPending || !projectId || visualCount === 0}
              className={cn(
                "flex h-11 items-center gap-2 rounded-xl bg-foreground px-6 text-base font-bold text-background transition-opacity",
                (startMut.isPending || !projectId || visualCount === 0) &&
                  "opacity-40",
              )}
            >
              {startMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Render
            </button>
          )}
          {phase === "rendering" && (
            <button
              onClick={() => handleClose(false)}
              className="h-11 rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-muted"
            >
              Run in background
            </button>
          )}
          {phase === "done" && status?.outputUrl && (
            <>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(status.outputUrl!);
                }}
                className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
              >
                <Copy className="h-4 w-4" /> Copy link
              </button>
              <button
                onClick={reset}
                className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" /> Again
              </button>
              <a
                href={status.outputUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex h-11 items-center gap-2 rounded-xl bg-foreground px-6 text-base font-bold text-background"
              >
                <Download className="h-4 w-4" /> Download
              </a>
            </>
          )}
          {phase === "failed" && (
            <button
              onClick={reset}
              className="h-11 rounded-xl bg-foreground px-6 text-base font-bold text-background"
            >
              Try again
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/70">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}

function labelForStatus(s: string | undefined) {
  switch (s) {
    case "queued":
      return "Queued";
    case "rendering":
      return "Stitching Encoding";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Uploading assets";
  }
}

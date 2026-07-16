import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, FolderOpen, Library, Loader2, Package, Upload, UserCircle2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { listLibraryAssets } from "@/lib/library.functions";
import { listCharacters } from "@/lib/characters.functions";
import { listLibrarySubjects } from "@/lib/library-subjects.functions";
import type { ProjectAsset } from "@/lib/project-state";

export type PickerAccept = "image" | "video" | "audio" | "any";

export type PickerResult =
  | { kind: "library"; assets: ProjectAsset[] }
  | { kind: "files"; files: File[] };

function acceptString(accept: PickerAccept): string {
  if (accept === "image") return "image/*";
  if (accept === "video") return "video/*";
  if (accept === "audio") return "audio/*";
  return "*/*";
}

function mimeMatches(mime: string, accept: PickerAccept): boolean {
  if (accept === "any") return true;
  return mime.startsWith(`${accept}/`);
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  accept,
  multiple,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accept: PickerAccept;
  multiple?: boolean;
  onPick: (result: PickerResult) => void;
}) {
  const listLibraryFn = useServerFn(listLibraryAssets);
  const listCharactersFn = useServerFn(listCharacters);
  const listSubjectsFn = useServerFn(listLibrarySubjects);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const charactersEnabled = accept === "image" || accept === "any";
  const subjectsEnabled = accept === "image" || accept === "any";
  const [tab, setTab] = useState<"library" | "subjects" | "characters" | "camera" | "computer">("library");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSelectedChar(null);
      setSelectedSubject(null);
      setTab("library");
    }
  }, [open]);

  const libraryQuery = useQuery({
    queryKey: ["v2-library-picker"],
    queryFn: () => listLibraryFn(),
    enabled: open,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const charactersQuery = useQuery({
    queryKey: ["v2-characters-picker"],
    queryFn: () => listCharactersFn(),
    enabled: open && charactersEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const characters = charactersQuery.data ?? [];

  const subjectsQuery = useQuery({
    queryKey: ["v2-subjects-picker"],
    queryFn: () => listSubjectsFn({ data: {} }),
    enabled: open && subjectsEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const subjects = subjectsQuery.data ?? [];

  const items = useMemo(() => {
    const lib = libraryQuery.data;
    if (!lib) return [];
    const all = [...(lib.references ?? []), ...(lib.generations ?? [])];
    return all.filter((a: { mime: string }) => mimeMatches(a.mime, accept));
  }, [libraryQuery.data, accept]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!multiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const confirmLibrary = () => {
    const picked = items
      .filter((it) => selected.has(it.id))
      .map(
        (it): ProjectAsset => ({
          id: it.id,
          kind:
            (it.kind as ProjectAsset["kind"]) ?? "reference",
          mime: it.mime,
          name: it.name,
          url: it.url,
          label: it.label ?? undefined,
        }),
      );
    if (picked.length === 0) return;
    onPick({ kind: "library", assets: picked });
    onOpenChange(false);
  };

  const confirmCharacter = () => {
    const c = characters.find((x) => x.id === selectedChar);
    if (!c || !c.imageUrl) return;
    const asset: ProjectAsset = {
      id: c.id,
      kind: "likeness",
      mime: c.imageMime ?? "image/jpeg",
      name: c.name || "Character",
      url: c.imageUrl,
      label: c.name || undefined,
    };
    onPick({ kind: "library", assets: [asset] });
    onOpenChange(false);
  };

  const confirmSubject = () => {
    const s = subjects.find((x) => x.id === selectedSubject);
    if (!s || !s.imageUrl) return;
    const kind: ProjectAsset["kind"] =
      s.kind === "character"
        ? "likeness"
        : s.kind === "logo" || s.kind === "brand_asset"
          ? "logo"
          : "reference";
    const asset: ProjectAsset = {
      id: s.id,
      kind,
      mime: "image/png",
      name: s.name,
      url: s.imageUrl,
      label: s.name,
    };
    onPick({ kind: "library", assets: [asset] });
    onOpenChange(false);
  };

  const onComputerFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onPick({ kind: "files", files: Array.from(files) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a file</DialogTitle>
          <DialogDescription>
            Pick from your Library, take a photo, or upload from your computer.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList
            className="grid w-full"
            style={{
              gridTemplateColumns: `repeat(${3 + (charactersEnabled ? 1 : 0) + (subjectsEnabled ? 1 : 0)}, minmax(0, 1fr))`,
            }}
          >
            <TabsTrigger value="library" className="gap-2">
              <Library className="h-4 w-4" /> Library
            </TabsTrigger>
            {subjectsEnabled && (
              <TabsTrigger value="subjects" className="gap-2">
                <Package className="h-4 w-4" /> Subjects
              </TabsTrigger>
            )}
            {charactersEnabled && (
              <TabsTrigger value="characters" className="gap-2">
                <UserCircle2 className="h-4 w-4" /> Characters
              </TabsTrigger>
            )}
            <TabsTrigger
              value="camera"
              className="gap-2"
              disabled={accept !== "image" && accept !== "any"}
            >
              <Camera className="h-4 w-4" /> Camera
            </TabsTrigger>
            <TabsTrigger value="computer" className="gap-2">
              <FolderOpen className="h-4 w-4" /> Computer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            {libraryQuery.isLoading ? (
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                Nothing in your library matches yet.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {items.map((it) => {
                    const active = selected.has(it.id);
                    return (
                      <button
                        type="button"
                        key={it.id}
                        onClick={() => toggle(it.id)}
                        className={
                          "group relative overflow-hidden rounded-xl border bg-card text-left transition " +
                          (active
                            ? "border-primary ring-2 ring-primary"
                            : "border-hairline hover:border-primary/50")
                        }
                      >
                        {it.mime.startsWith("image/") ? (
                          <img
                            src={(it as { thumbUrl?: string }).thumbUrl ?? it.url}
                            alt={it.name}
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full object-cover"
                          />
                        ) : it.mime.startsWith("video/") ? (
                          <video
                            src={it.url}
                            muted
                            preload="metadata"
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="grid aspect-square w-full place-items-center bg-muted text-muted-foreground">
                            ♪
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={confirmLibrary} disabled={selected.size === 0}>
                Use {selected.size || ""} selected
              </Button>
            </div>
          </TabsContent>

          {subjectsEnabled && (
            <TabsContent value="subjects" className="mt-4">
              {subjectsQuery.isLoading ? (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : subjects.length === 0 ? (
                <div className="grid h-64 place-items-center px-6 text-center text-sm text-muted-foreground">
                  No saved subjects yet. Save reusable products, scenes, and
                  logos from Library → Subjects so they stay consistent across
                  every project.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {subjects.map((s) => {
                      const active = selectedSubject === s.id;
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => setSelectedSubject(active ? null : s.id)}
                          className={
                            "group relative overflow-hidden rounded-xl border bg-card text-left transition " +
                            (active
                              ? "border-primary ring-2 ring-primary"
                              : "border-hairline hover:border-primary/50")
                          }
                        >
                          {s.imageUrl ? (
                            <img
                              src={s.imageUrl}
                              alt={s.name}
                              loading="lazy"
                              decoding="async"
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="grid aspect-square w-full place-items-center bg-muted text-muted-foreground">
                              <Package className="h-8 w-8" />
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5 px-2 py-1">
                            <div className="truncate text-[11px] text-foreground">
                              {s.name}
                            </div>
                            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                              {s.kind.replace("_", " ")}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmSubject} disabled={!selectedSubject}>
                  Use subject
                </Button>
              </div>
            </TabsContent>
          )}


          {charactersEnabled && (
            <TabsContent value="characters" className="mt-4">
              {charactersQuery.isLoading ? (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : characters.length === 0 ? (
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  No saved characters yet. Create one from the Character Creator app.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {characters.map((c) => {
                      const active = selectedChar === c.id;
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedChar(active ? null : c.id)}
                          className={
                            "group relative overflow-hidden rounded-xl border bg-card text-left transition " +
                            (active
                              ? "border-primary ring-2 ring-primary"
                              : "border-hairline hover:border-primary/50")
                          }
                        >
                          {c.imageUrl ? (
                            <img
                              src={c.imageUrl}
                              alt={c.name}
                              loading="lazy"
                              decoding="async"
                              className="aspect-square w-full object-cover"
                            />
                          ) : (
                            <div className="grid aspect-square w-full place-items-center bg-muted text-muted-foreground">
                              <UserCircle2 className="h-8 w-8" />
                            </div>
                          )}
                          <div className="truncate px-2 py-1 text-[11px] text-foreground">
                            {c.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmCharacter} disabled={!selectedChar}>
                  Use character
                </Button>
              </div>
            </TabsContent>
          )}

          <TabsContent value="camera" className="mt-4">
            <CameraCapture
              onCapture={(file) => {
                onPick({ kind: "files", files: [file] });
                onOpenChange(false);
              }}
            />
          </TabsContent>

          <TabsContent value="computer" className="mt-4">
            <div className="grid h-64 place-items-center rounded-xl border border-dashed border-hairline bg-background/40">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <Upload className="h-6 w-6" />
                <div>Drag &amp; drop or select files from your computer.</div>
                <Button onClick={() => fileRef.current?.click()}>
                  Choose files
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept={acceptString(accept)}
                  multiple={multiple}
                  onChange={(e) => onComputerFiles(e.target.files)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CameraCapture({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // After "Take photo" we hold the captured File + a preview URL so the
  // user can review and either retake or commit. Until they commit, the
  // parent never sees the photo — fixes "I took a picture and nothing
  // happened" because there's now an explicit confirm step.
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (err) {
        console.error("[camera] getUserMedia failed", err);
        setError("Couldn't access the camera. Check browser permissions.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Revoke preview blob URL on unmount or when a new shot replaces it.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  const snap = async () => {
    const video = videoRef.current;
    if (!video) return;
    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;
    // Downscale to ≤1280 on the long edge. A 4K webcam frame as PNG is
    // ~8 MB; a 1280 JPEG @ 0.92 is well under 500 KB and keeps the upload
    // fast enough that the UI never feels frozen.
    const MAX = 1280;
    const scale = Math.min(1, MAX / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    const file = new File([blob], `camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    setPending({ file, previewUrl: URL.createObjectURL(blob) });
  };

  const retake = () => {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  };

  const usePhoto = () => {
    if (!pending) return;
    const { file } = pending;
    setPending(null);
    onCapture(file);
  };

  if (error) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-hairline bg-background/40 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <X className="h-4 w-4" /> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full overflow-hidden rounded-xl border border-hairline bg-black">
        {pending ? (
          <img
            src={pending.previewUrl}
            alt="Captured photo preview"
            className="max-h-[420px] w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            className="max-h-[420px] w-full object-contain"
            playsInline
            muted
          />
        )}
        {!pending && !ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>
      {pending ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={retake}>
            Retake
          </Button>
          <Button onClick={usePhoto}>
            <Camera className="mr-2 h-4 w-4" /> Use photo
          </Button>
        </div>
      ) : (
        <Button onClick={snap} disabled={!ready}>
          <Camera className="mr-2 h-4 w-4" /> Take photo
        </Button>
      )}
    </div>
  );
}


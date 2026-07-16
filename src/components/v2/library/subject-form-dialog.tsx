// SubjectFormDialog — shared "create/save a Library Subject" dialog.
//
// Used from:
//   • Library › Subjects tab (New product / New scene / New logo).
//   • Any project output "Save to Library" action, which pre-seeds the
//     dialog with the source projectAssetId so the image copies over.
//
// Users can pick the primary image via: file upload, URL, or an existing
// project asset (via `initial.projectAssetId`).

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LIBRARY_SUBJECT_KINDS,
  upsertLibrarySubject,
  type LibrarySubject,
  type LibrarySubjectKind,
} from "@/lib/library-subjects.functions";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<LibrarySubjectKind, string> = {
  character: "Character",
  product: "Product",
  scene: "Scene",
  logo: "Logo",
  brand_asset: "Brand asset",
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export type SubjectFormInitial = {
  kind?: LibrarySubjectKind;
  name?: string;
  description?: string;
  brand?: string;
  projectAssetId?: string;
  previewUrl?: string;
  imageSourceUrl?: string;
  allowKindChange?: boolean;
};

export function SubjectFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: SubjectFormInitial;
  onSaved?: (s: LibrarySubject) => void;
}) {
  const upsertFn = useServerFn(upsertLibrarySubject);
  const qc = useQueryClient();

  const [kind, setKind] = useState<LibrarySubjectKind>(initial?.kind ?? "product");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageSourceUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? "product");
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setBrand(initial?.brand ?? "");
    setImageUrl(initial?.imageSourceUrl ?? "");
    setFile(null);
    setFilePreview(null);
  }, [open, initial]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setFilePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const allowKindChange = initial?.allowKindChange ?? true;

  const seededPreview = initial?.previewUrl ?? null;
  const activePreview = filePreview ?? (imageUrl.trim() || seededPreview);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Parameters<typeof upsertLibrarySubject>[0]["data"] = {
        kind,
        name: name.trim(),
        description: description.trim() || null,
        brand: brand.trim() || null,
      };
      if (file) {
        payload.imageBytesB64 = await fileToBase64(file);
        payload.imageMime = file.type || "image/png";
        payload.imageFilename = file.name;
      } else if (imageUrl.trim()) {
        payload.imageSourceUrl = imageUrl.trim();
      } else if (initial?.projectAssetId) {
        payload.projectAssetId = initial.projectAssetId;
      }
      return upsertFn({ data: payload });
    },
    onSuccess: (s) => {
      toast.success(`${KIND_LABEL[s.kind]} saved to Library`);
      qc.invalidateQueries({ queryKey: ["v2-library-subjects"] });
      onSaved?.(s);
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const canSave =
    !!name.trim() &&
    !save.isPending &&
    (!!file || !!imageUrl.trim() || !!initial?.projectAssetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save to Library</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {allowKindChange && (
            <div>
              <Label className="mb-1.5 block">Type</Label>
              <div className="flex flex-wrap gap-1.5">
                {LIBRARY_SUBJECT_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      kind === k
                        ? "border-foreground bg-foreground text-background"
                        : "border-hairline text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="sf-name">Name</Label>
            <Input
              id="sf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "product" ? "Air Jordan 1 Triple Stack" : "Name"}
            />
          </div>

          {kind === "product" && (
            <div>
              <Label htmlFor="sf-brand">Brand</Label>
              <Input
                id="sf-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Nike"
              />
            </div>
          )}

          <div>
            <Label htmlFor="sf-desc">Description</Label>
            <Textarea
              id="sf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Silhouette, materials, colorway, key details to preserve"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Primary image</Label>
            {activePreview ? (
              <div className="relative w-40">
                <img
                  src={activePreview}
                  alt=""
                  className="aspect-square w-full rounded-xl border border-hairline object-cover"
                />
                {(file || imageUrl.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setImageUrl("");
                    }}
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-hairline bg-background text-muted-foreground shadow-sm hover:text-foreground"
                    aria-label="Clear image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition hover:bg-muted/30">
                <Upload className="h-4 w-4" />
                <span>Upload from your computer</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setFile(f);
                      setImageUrl("");
                    }
                  }}
                />
              </label>
            )}

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-hairline" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                or paste URL
              </span>
              <div className="h-px flex-1 bg-hairline" />
            </div>
            <Input
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                if (e.target.value) setFile(null);
              }}
              placeholder="https://…"
            />
            {initial?.projectAssetId && !file && !imageUrl.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Will copy the current output image.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save to Library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

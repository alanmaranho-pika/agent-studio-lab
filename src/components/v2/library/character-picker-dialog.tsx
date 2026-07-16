// CharacterPickerDialog — used inside app panels (Short Film, Product Ad)
// to import a character from the user's library or create a brand-new one
// on the fly. "New character" opens the Character Creator app inside a
// large modal (outputs appear in its second column) so the user never
// leaves the app they're working in.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, UserCircle2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listCharacters, type LibraryCharacter } from "@/lib/characters.functions";
import { cn } from "@/lib/utils";

export function CharacterPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (character: LibraryCharacter) => void;
}) {
  const listFn = useServerFn(listCharacters);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const q = useQuery({
    queryKey: ["v2-characters"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const characters = q.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Library</DialogTitle>
            <DialogDescription>
              Pick a saved character to add to your cast, or create a new one.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs — Characters is preselected. Other library types live in
              the full Library view; this modal is scoped to characters. */}
          <div className="flex items-center gap-1 border-b border-hairline">
            <button
              type="button"
              className="border-b-2 border-foreground px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Characters
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {characters.length} {characters.length === 1 ? "character" : "characters"} in your
              library
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreatorOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create character
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {q.isLoading ? (
              <div className="grid place-items-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : characters.length === 0 ? (
              <div className="grid place-items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <UserCircle2 className="h-10 w-10 opacity-40" strokeWidth={1.5} />
                <div>
                  Your library is empty.
                  <br />
                  Create your first character to reuse it across projects.
                </div>
                <Button type="button" size="sm" onClick={() => setCreatorOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Create character
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onPick(c);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "group overflow-hidden rounded-lg border border-hairline bg-card text-left transition hover:scale-[1.02] hover:shadow-elegant",
                    )}
                  >
                    <div className="aspect-[3/4] w-full bg-muted/40">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={c.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-muted-foreground">
                          <UserCircle2 className="h-10 w-10" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </div>
                      {c.voiceLabel && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {c.voiceLabel}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Character Creator embedded as a near-fullscreen modal so the user
          never loses their place in the parent app. The Creator's own
          outputs column is the "second column" the brief calls for. */}
      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent
          className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div>
              <DialogTitle className="font-display text-base">Character Creator</DialogTitle>
              <DialogDescription className="text-xs">
                Create a character without leaving this app. Once saved, refresh the list to import it.
              </DialogDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreatorOpen(false);
                void q.refetch();
              }}
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Close
            </Button>
          </DialogHeader>
          {creatorOpen && (
            <iframe
              title="Character Creator"
              src="/v2/apps/character-creator"
              className="h-full w-full flex-1 border-0 bg-background"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


// Action-first asset menu used by the output column and timeline clips.
//
// Replaces the old flat "Edit with app" dropdown that just listed every skill
// that could accept the asset. Instead we surface intent-style actions
// ("Animate this", "Replace Background", "Edit Image", "Character Swap", …)
// and only expand into the underlying app picker when an action has multiple
// candidate apps. Users can also type a free-form query at the top to search
// across every app that accepts this asset's media kind.

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eraser,
  Film,
  Image as ImageIcon,
  Mic,
  Mountain,
  Music,
  Pencil,
  Plus,
  Replace,
  Scissors,
  Search,
  Shirt,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { SKILLS, SKILL_BY_ID, type Skill } from "@/lib/skills";
import { getRecipeForSkill } from "@/lib/app-recipes";
import { getAppSwatch } from "@/lib/app-swatch";
import type { ProjectAsset } from "@/lib/project-state";
import { cn } from "@/lib/utils";

type Kind = "image" | "video" | "audio";

function detectKind(mime: string): Kind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function appsAcceptingKind(want: Kind): Skill[] {
  return SKILLS.filter((s) => {
    const upload = getRecipeForSkill(s).steps.find((st) => st.kind === "upload");
    if (!upload) return false;
    return upload.accept === want || upload.accept === "any";
  });
}

type ActionDef = {
  id: string;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  // Returns the apps that satisfy this action. Already filtered to "accepts
  // this media kind"; we just narrow further by purpose.
  filter: (apps: Skill[]) => Skill[];
};

const byId = (...ids: string[]) => (apps: Skill[]) =>
  apps.filter((s) => ids.includes(s.id));

// Image actions
const IMAGE_ACTIONS: ActionDef[] = [
  {
    id: "animate",
    label: "Animate this",
    hint: "Turn this still into a moving clip",
    Icon: Film,
    filter: (apps) => apps.filter((s) => s.kind === "video"),
  },
  {
    id: "edit-image",
    label: "Edit Image",
    hint: "Tweak, restyle, or remix",
    Icon: Pencil,
    filter: (apps) =>
      apps.filter(
        (s) =>
          s.kind === "image" &&
          ![
            "app-character-swap",
            "app-background-swap",
            "app-outfit-try-on",
            "app-glow-up",
            "app-object-remove",
            "app-room-redesign",
          ].includes(s.id),
      ),
  },
  {
    id: "background",
    label: "Replace Background",
    hint: "Send your subject anywhere",
    Icon: Mountain,
    filter: byId("app-background-swap"),
  },
  {
    id: "character",
    label: "Character Swap",
    hint: "Drop a new character into the scene",
    Icon: Users,
    filter: byId("app-character-swap"),
  },
  {
    id: "tryon",
    label: "Virtual Try-On",
    hint: "Restyle a person in new clothing",
    Icon: Shirt,
    filter: byId("app-outfit-try-on"),
  },
  {
    id: "glow",
    label: "Style Glow-Up",
    hint: "Apply a cohesive look",
    Icon: Sparkles,
    filter: byId("app-glow-up"),
  },
  {
    id: "cleanup",
    label: "Cleanup & Remove",
    hint: "Erase distractions or objects",
    Icon: Eraser,
    filter: byId("app-object-remove"),
  },
];

// Video actions
const VIDEO_ACTIONS: ActionDef[] = [
  {
    id: "edit-video",
    label: "Edit Video",
    hint: "Restyle, extend, or remix this clip",
    Icon: Pencil,
    filter: (apps) =>
      apps.filter(
        (s) =>
          s.kind === "video" &&
          !["model-pikaswap", "model-pikaddition", "app-pika-lipsync"].includes(
            s.id,
          ),
      ),
  },
  {
    id: "swap-subject",
    label: "Swap Subject",
    hint: "Replace people, objects, or backgrounds",
    Icon: Replace,
    filter: byId("model-pikaswap"),
  },
  {
    id: "add-element",
    label: "Add Element",
    hint: "Drop a new object into the clip",
    Icon: Plus,
    filter: byId("model-pikaddition"),
  },
  {
    id: "lipsync",
    label: "Lip Sync",
    hint: "Make a face speak any line",
    Icon: Mic,
    filter: byId("app-pika-lipsync"),
  },
  {
    id: "trim",
    label: "Trim & Stitch",
    hint: "Stitch multiple scenes together",
    Icon: Scissors,
    filter: byId("model-pikascenes"),
  },
];

// Audio actions
const AUDIO_ACTIONS: ActionDef[] = [
  {
    id: "use-audio",
    label: "Use in App",
    hint: "Send to a speech or music app",
    Icon: Music,
    filter: (apps) => apps.filter((s) => s.kind === "audio" || s.kind === "speech"),
  },
];

function actionsForKind(kind: Kind): ActionDef[] {
  if (kind === "image") return IMAGE_ACTIONS;
  if (kind === "video") return VIDEO_ACTIONS;
  return AUDIO_ACTIONS;
}

function AppRow({ skill, onPick }: { skill: Skill; onPick: (s: Skill) => void }) {
  const sw = getAppSwatch(skill.id);
  const Icon = skill.icon;
  return (
    <button
      type="button"
      onClick={() => onPick(skill)}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted"
    >
      <div
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: sw.bg, color: sw.fg }}
      >
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{skill.label}</div>
        <div className="line-clamp-1 text-[10px] text-muted-foreground">
          {skill.description}
        </div>
      </div>
    </button>
  );
}

// Inline body (used both by Popover/Dropdown wrappers and timeline popover).
export function AssetActionsBody({
  asset,
  onPick,
  onClose,
}: {
  asset: ProjectAsset;
  onPick: (skill: Skill) => void;
  onClose?: () => void;
}) {
  const kind = detectKind(asset.mime);
  const availableApps = useMemo(
    () => (kind ? appsAcceptingKind(kind) : []),
    [kind],
  );
  const actions = useMemo(
    () => (kind ? actionsForKind(kind) : []),
    [kind],
  );

  const [activeAction, setActiveAction] = useState<ActionDef | null>(null);
  const [query, setQuery] = useState("");

  if (!kind) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        No actions for this asset.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const searchResults = searching
    ? availableApps.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    : [];

  const pick = (s: Skill) => {
    onPick(s);
    onClose?.();
  };

  // Subview: action drilled into
  if (activeAction && !searching) {
    const subApps = activeAction.filter(availableApps);
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-1 px-1 pb-1">
          <button
            type="button"
            onClick={() => setActiveAction(null)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
          <div className="ml-1 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {activeAction.label}
          </div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {subApps.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No matching apps yet.
            </p>
          ) : (
            subApps.map((s) => <AppRow key={s.id} skill={s} onPick={pick} />)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1 pt-1 text-sm font-semibold tracking-tight text-foreground">
        What do you want to do?
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions or apps…"
          className="h-9 rounded-xl pl-8 text-xs"
        />
      </div>

      {searching ? (
        <div className="max-h-[55vh] overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No apps match "{query}".
            </p>
          ) : (
            searchResults.map((s) => (
              <AppRow key={s.id} skill={s} onPick={pick} />
            ))
          )}
        </div>
      ) : (
        <>
          <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
            {actions.map((a) => {
              const matches = a.filter(availableApps);
              if (matches.length === 0) return null;
              const single = matches.length === 1;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (single) pick(matches[0]);
                    else setActiveAction(a);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/70 text-foreground">
                    <a.Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.label}</div>
                    <div className="line-clamp-1 text-[11px] text-muted-foreground">
                      {a.hint}
                    </div>
                  </div>
                  {single ? null : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}

// Output-column trigger button + popover.
export function AssetActionsMenu({
  asset,
  onUseInApp,
}: {
  asset: ProjectAsset;
  onUseInApp: (args: { skill: Skill; asset: ProjectAsset }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-0.5 rounded-full bg-background/85 px-3 backdrop-blur shadow-sm"
          title="Edit with app"
        >
          <span>Edit</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 rounded-3xl p-6">
        <AssetActionsBody
          asset={asset}
          onPick={(skill) => onUseInApp({ skill, asset })}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
// Re-export icon for backwards compatibility (unused but tree-shakable).
export { ImageIcon };

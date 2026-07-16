import { useMemo, useState, type ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Camera,
  ClapperboardIcon,
  Maximize2,
  Move3d,
  Music,
  Palette,
  PencilLine,
  Sparkles,
  Lightbulb,
  Trees,
  Wand2,
  Volume2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import relightVideoImg from "@/assets/toolkit/relight-video.jpg";
import changeCameraAngleImg from "@/assets/toolkit/change-camera-angle.jpg";
import cameraControlImg from "@/assets/toolkit/camera-control.jpg";
import createEnvironmentImg from "@/assets/toolkit/create-environment.jpg";
import createMusicImg from "@/assets/toolkit/create-music.jpg";
import createSfxImg from "@/assets/toolkit/create-sfx.jpg";
import upscaleVideoImg from "@/assets/toolkit/upscale-video.jpg";
import colorFilmEmulationImg from "@/assets/toolkit/color-film-emulation.jpg";
import scriptWriterImg from "@/assets/toolkit/script-writer.jpg";
import shotListImg from "@/assets/toolkit/shot-list.jpg";
import storyboardImg from "@/assets/toolkit/storyboard.jpg";
import artDirectorImg from "@/assets/toolkit/art-director.jpg";

type ToolkitItem = {
  id: string;
  label: string;
  subline: string;
  icon: ComponentType<{ className?: string }>;
  skillId: string;
  image: string;
  video?: string;
};

const TOOLKIT_ITEMS: ToolkitItem[] = [
  { id: "relight-video", label: "Relight Video", subline: "Re-light any clip", icon: Lightbulb, skillId: "app-relight-video", image: relightVideoImg, video: "/__l5e/assets-v1/50f90e0f-6ee2-4283-95e1-7be9446eadcc/relight-video-toolkit.mp4" },
  { id: "change-camera-angle", label: "Change Camera Angle", subline: "Restage from a new angle", icon: Camera, skillId: "app-cinematic-camera", image: changeCameraAngleImg, video: "/__l5e/assets-v1/a0fb72b8-702b-4ec5-b001-2829b9f04f7f/change-camera-angle.mp4" },
  { id: "camera-control", label: "Camera Control", subline: "Dolly, push-in, orbit, paths", icon: Move3d, skillId: "app-camera-control-video", image: cameraControlImg, video: "/__l5e/assets-v1/f0ec5c9b-cd47-41f1-a23e-fba23e69931f/cameracontrol.mp4" },
  { id: "create-environment", label: "Create Environment", subline: "Build a scene or world", icon: Trees, skillId: "app-create-environment", image: createEnvironmentImg, video: "/__l5e/assets-v1/617e723d-773f-49a5-b77e-6ff96bc598a3/create-environment.mp4" },
  { id: "create-music", label: "Create Music", subline: "Generate a track from a vibe", icon: Music, skillId: "app-create-music", image: createMusicImg, video: "/__l5e/assets-v1/14952450-e605-45a9-a937-4228a599c970/music2.mp4" },
  { id: "create-sfx", label: "Create SFX", subline: "One-shot sound effects", icon: Volume2, skillId: "app-create-sfx", image: createSfxImg, video: "/__l5e/assets-v1/c6071f1f-a3da-43da-8623-2c503c3a0362/sfx.mp4" },
  { id: "upscale-video", label: "Upscale Video", subline: "Sharper, higher resolution", icon: Maximize2, skillId: "app-upscale-video", image: upscaleVideoImg },
  { id: "color-film-emulation", label: "Color & Film Emulation", subline: "Grade + filmic stock looks", icon: Palette, skillId: "app-color-grading", image: colorFilmEmulationImg },
  { id: "script-writer", label: "Script Writer", subline: "Premise → scene-by-scene script", icon: PencilLine, skillId: "app-script-writer", image: scriptWriterImg },
  { id: "shot-list", label: "Shot List", subline: "Lens, framing, movement", icon: ClapperboardIcon, skillId: "app-shot-list", image: shotListImg },
  { id: "storyboard", label: "Storyboard / Previs", subline: "Keyframes from a script", icon: Sparkles, skillId: "app-storyboard-frames", image: storyboardImg },
  { id: "art-director", label: "Art Director", subline: "Style bible & creative direction", icon: Wand2, skillId: "app-art-director", image: artDirectorImg },
];



export function AiVideoToolkitSection() {
  const pageSize = 6;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(TOOLKIT_ITEMS.length / pageSize);
  const pageItems = useMemo(
    () => TOOLKIT_ITEMS.slice(page * pageSize, page * pageSize + pageSize),
    [page],
  );
  const rows = chunk(pageItems, 3);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-semibold text-foreground">
          AI Video Toolkit
        </h2>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)}
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => (p + 1) % totalPages)}
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div key={page} className="flex flex-col gap-4 animate-toolkit-page">
        {rows.map((row, ri) => (
          <ToolkitRow key={ri} items={row} defaultExpanded={ri % 2 === 1 ? 1 : 0} />
        ))}
      </div>
    </section>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ToolkitRow({ items, defaultExpanded = 0 }: { items: ToolkitItem[]; defaultExpanded?: number }) {
  const [expandedIdx, setExpandedIdx] = useState(defaultExpanded);
  const padCount = Math.max(0, 3 - items.length);
  return (
    <div className="flex gap-4">
      {items.map((item, i) => (
        <ToolkitCard
          key={item.id}
          item={item}
          expanded={i === expandedIdx}
          onHover={() => setExpandedIdx(i)}
        />
      ))}
      {Array.from({ length: padCount }).map((_, i) => (
        <div key={`pad-${i}`} className="flex-1 basis-0" />
      ))}
    </div>
  );
}

function ToolkitCard({
  item,
  expanded,
  onHover,
}: {
  item: ToolkitItem;
  expanded: boolean;
  onHover: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to="/studio"
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cn(
        "group flex h-[198px] flex-none flex-row items-start overflow-hidden rounded-2xl border border-hairline bg-card p-[18px] transition-[flex-grow,gap] duration-300 ease-out",
        expanded ? "grow-[1.35] gap-[18px]" : "grow-[1] gap-0",
      )}
      style={{ flexBasis: 0 }}
    >
      <div
        className={cn(
          "order-1 flex h-[162px] min-w-0 flex-col justify-between",
          expanded ? "flex-1" : "w-full",
        )}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div
            className={cn(
              "font-display text-xl font-medium leading-tight text-foreground",
              expanded ? "whitespace-normal break-words" : "truncate",
            )}
          >
            {item.label}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "order-2 ml-auto h-[162px] flex-none overflow-hidden rounded-[10px] bg-muted transition-[width,opacity] duration-300 ease-out",
          expanded ? "w-[162px] opacity-100" : "w-0 opacity-0",
        )}
        aria-hidden
      >
        {item.video ? (
          <video
            src={item.video}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
    </Link>
  );
}

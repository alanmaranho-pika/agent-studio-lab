// Lucide icons → Pixi textures. Mirrors gen-option-enhancer's ICONS map
// (same ICON_SLUGS contract from src/agent/blocks/types.ts) but rasterizes
// each icon through an SVG data-URI so the canvas renderer draws the exact
// glyphs the DOM renderer shows.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Assets, Texture } from "pixi.js";
import {
  ArrowRight,
  Building,
  Camera,
  Car,
  Circle,
  Clapperboard,
  Cloud,
  Coffee,
  Film,
  Flame,
  Globe,
  Heart,
  Image as ImageIcon,
  Layers,
  MessageCircle,
  Mic,
  Moon,
  Music,
  Palette,
  Play,
  Plus,
  Rocket,
  Shirt,
  ShoppingBag,
  Smile,
  Sparkles,
  Speaker,
  Square,
  Star,
  Sun,
  TreePine,
  Triangle,
  Type,
  UserRound,
  Users,
  Video,
  Volume2,
  Wand2,
  Waves,
  Zap,
} from "lucide-react";

const ICONS: Record<string, typeof Music> = {
  music: Music,
  users: Users,
  user: UserRound,
  voice: Mic,
  mic: Mic,
  camera: Camera,
  film: Film,
  image: ImageIcon,
  palette: Palette,
  sparkles: Sparkles,
  wand: Wand2,
  zap: Zap,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  star: Star,
  heart: Heart,
  play: Play,
  volume: Volume2,
  speaker: Speaker,
  video: Video,
  clapperboard: Clapperboard,
  type: Type,
  layers: Layers,
  square: Square,
  circle: Circle,
  triangle: Triangle,
  smile: Smile,
  bag: ShoppingBag,
  shirt: Shirt,
  coffee: Coffee,
  flame: Flame,
  waves: Waves,
  tree: TreePine,
  building: Building,
  car: Car,
  rocket: Rocket,
  globe: Globe,
  message: MessageCircle,
  arrow: ArrowRight,
  plus: Plus,
};

const cache = new Map<string, Promise<Texture | null>>();

/** Load (and cache) a lucide icon as a Pixi texture. `color` is a CSS color
 * string applied as the SVG stroke. Rasterized at 4× for crispness. */
export function loadIconTexture(slug: string, color: string): Promise<Texture | null> {
  const key = `${slug}::${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = (async () => {
    try {
      const Comp = ICONS[slug.toLowerCase().trim()] ?? Sparkles;
      const svg = renderToStaticMarkup(createElement(Comp, { size: 128, strokeWidth: 2, color }));
      const uri = `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
      return await Assets.load<Texture>({ src: uri, loadParser: "loadSVG" });
    } catch {
      return null;
    }
  })();
  cache.set(key, promise);
  return promise;
}

// Theme swatches — curated dark-bg + tinted-text palettes keyed off the
// creative content ("desert war epic" → rust/peach, "underwater doc" →
// teal). Shared by the full-stage generation views (stage-generations.tsx)
// and the inline storyboard card enhancer, so both surfaces speak the same
// color language. Plain module: no DOM, no React.

export type Swatch = { bg: string; fg: string; accent: string };

const SWATCH_LIBRARY: { keys: RegExp; swatch: Swatch }[] = [
  // Desert / earthy
  { keys: /desert|sand|dune|sahara|arid|savanna|clay|adobe|western|dust/i,
    swatch: { bg: "#5A2A12", fg: "#F0C79A", accent: "#E08A3C" } },
  // Space / cosmic
  { keys: /space|cosmic|galax|star|nebula|astronaut|orbit|moon|sci-?fi/i,
    swatch: { bg: "#0B1436", fg: "#B7C7FF", accent: "#7B8CFF" } },
  // Ocean / underwater
  { keys: /ocean|sea|underwater|beach|wave|coral|marine|nautical/i,
    swatch: { bg: "#062B3A", fg: "#8FE0D6", accent: "#3AB6C6" } },
  // Forest / jungle
  { keys: /forest|jungle|tree|wood|nature|hike|mountain|wild/i,
    swatch: { bg: "#132414", fg: "#B7DFA8", accent: "#5FA84A" } },
  // Neon / cyberpunk
  { keys: /neon|cyber|synth|arcade|glitch|rave|club|nightclub/i,
    swatch: { bg: "#160730", fg: "#F1B6FF", accent: "#FF3EA5" } },
  // Fire / battle
  { keys: /fire|flame|battle|war|explos|burn|molten|lava/i,
    swatch: { bg: "#2E0A08", fg: "#FFC59A", accent: "#FF5A2E" } },
  // Snow / winter
  { keys: /snow|winter|ice|arctic|frost|glacier|cold/i,
    swatch: { bg: "#0E1F2E", fg: "#DCEEFF", accent: "#7FB8E6" } },
  // Romance / warm
  { keys: /love|romance|wedding|heart|valentine|rose/i,
    swatch: { bg: "#2A0A18", fg: "#FFC8D8", accent: "#FF7095" } },
  // Sport / motion
  { keys: /sport|football|soccer|basket|race|run|athlete/i,
    swatch: { bg: "#111827", fg: "#F1F5F9", accent: "#F97316" } },
  // Retro / vintage
  { keys: /retro|vintage|70s|80s|analog|film grain|super\s?8/i,
    swatch: { bg: "#2A1D0E", fg: "#F5D7A1", accent: "#D98A3C" } },
];

export const DEFAULT_SWATCH: Swatch = { bg: "#1B1522", fg: "#EDE3F1", accent: "#B79CE0" };

/** Pick the themed swatch whose keywords appear in the given text. */
export function pickSwatchFromText(hay: string): Swatch {
  if (!hay.trim()) return DEFAULT_SWATCH;
  for (const entry of SWATCH_LIBRARY) {
    if (entry.keys.test(hay)) return entry.swatch;
  }
  return DEFAULT_SWATCH;
}

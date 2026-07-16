export type Scene = {
  id: string;
  n: number;
  title: string;
  prompt: string;
  duration: number;
  thumb: string;
  status: "ready" | "drafting" | "rendering";
  // Motion / camera direction used when generating the video clip from
  // the keyframe (e.g. "slow push-in, handheld, board flicks up at 0:02").
  motionPrompt?: string;
  // Optional voiceover line read during this shot.
  voPrompt?: string;
  // URL of the rendered video clip for this scene, once production finishes.
  clipUrl?: string;
  // Agent v5 · Phase 2 — Anchor system.
  // Reference keyframe asset IDs the user has reviewed before the shot is
  // rendered. anchorAssetIds[0] = first frame; [1] optional last frame.
  // The producer must pass these as referenceImageUrls on the video render
  // so the shot stays on-model. anchorApproved gates whether the producer
  // may render this shot; false = still awaiting user approval.
  anchorAssetIds?: string[];
  anchorApproved?: boolean;
};

export type Character = {
  id: string;
  name: string;
  role: string;
  ref: string;
  notes: string;
};

export type Music = {
  title: string;
  artist: string;
  bpm: number;
  key: string;
  beats: number[];
  duration: number;
} | null;

// User-provided or AI-generated reference assets attached to the project.
// `kind` tells the panel where to surface it (likeness → Cast tab,
// audio refs → Audio tab, anything else → Overview).
export type AssetKind =
  | "likeness"
  | "logo"
  | "reference"
  | "keyframe"
  | "image"
  | "music"
  | "voiceover"
  | "final"
  | "voice"
  | "audio"
  | "video"
  | "pending"
  | "other";

// Special placeholder mime for in-flight beats that haven't rendered yet.
// Shows a spinner card in outputs / timeline; replaced with the real
// asset once the underlying render finishes.
export const PENDING_MIME = "video/x-pending";

export type ProjectAsset = {
  id: string;
  kind: AssetKind;
  mime: string;
  name: string;
  url: string; // blob: URL today, https: when we move to Cloud storage
  label?: string;
  attachedTo?: string; // e.g. character id, scene id
  createdAt?: string;
  width?: number;
  height?: number;
  duration?: number;
};

// A scene.thumb is usually a URL (https/blob/data) but agent patches sometimes
// commit a bare asset id (UUID). Resolve to a usable URL by looking up the
// matching ProjectAsset; fall back to the raw value so existing URLs pass
// through unchanged.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function resolveThumb(thumb: string | undefined | null, assets: ProjectAsset[]): string {
  if (!thumb) return "";
  if (/^(https?:|blob:|data:|\/)/.test(thumb)) return thumb;
  if (UUID_RE.test(thumb) || thumb.startsWith("ast_")) {
    const hit = assets.find((a) => a.id === thumb);
    if (hit?.url) return hit.url;
  }
  return thumb;
}


export type ProjectMeta = {
  title: string;
  format: string; // "Music video", "Short film", ...
  aspectRatio: string; // "9:16", "16:9", ...
  logline: string; // 1–2 sentence evolving description of the video
  targetDuration: string; // human-readable length, e.g. "30s", "2 min"
  fps: string; // "24", "30", "60"
  resolution: string; // "1080p", "4K"
};

export type TimelineTrim = { start: number; end: number; offset?: number };

export type TrackKind = "video" | "audio";

export type TimelineTrack = {
  id: string;
  kind: TrackKind;
  name: string;
  order: string[];
  mute?: boolean;
  solo?: boolean;
  lock?: boolean;
  /** Per-track fader gain, 0..1.5 (1 = unity). */
  volume?: number;
  /** Per-track pan, -1 (L) .. 1 (R). Audio tracks only. */
  pan?: number;
};

export type TimelineFade = { in?: number; out?: number };

export type TimelineComment = {
  id: string;
  /** Timeline time in ms. */
  at: number;
  text: string;
  author?: string;
  clipId?: string;
  createdAt: string;
  resolved?: boolean;
};

export type TimelineState = {
  order?: string[];
  hidden?: string[];
  seeded?: boolean;
  trims?: Record<string, TimelineTrim>;
  volumes?: Record<string, number>;
  videoMuted?: Record<string, boolean>;
  fades?: Record<string, TimelineFade>;
  tracks?: TimelineTrack[];
  /** Leading gap in seconds before this ref on its track. Lets a clip be
   *  "nudged forward" without breaking the butt-joined order model. */
  offsets?: Record<string, number>;
  /** Master mixer gain, 0..1.5. */
  masterVolume?: number;
  /** Review comments pinned to timeline time. */
  comments?: TimelineComment[];
};

// Agent decision log — append-only memory of durable choices the user has
// already made on this project (picked model, locked aspect, approved
// concept, etc.). The agent reads these every turn and must never re-ask
// what's been recorded here.
export type ProjectNote = {
  at: string; // ISO timestamp
  text: string; // 1–2 sentences, decision-shaped
  tag?: string; // optional grouping: "model" | "concept" | "audio" | …
};

// Phase-1 additions: durable artifacts, mood-board tiles, typed locations,
// and a project-wide style lock the agent prepends to every produce_*.

export type ProjectDoc = {
  id: string; // slug: "brief", "script", "style", "notes-audio", …
  title: string;
  body: string; // markdown
  updatedAt: string; // ISO
};

export type ReferenceTile = {
  id: string;
  url: string;
  thumb?: string;
  source?: string; // "pinterest", "instagram", "web", …
  handle?: string; // "@wavykings"
  caption?: string;
  addedAt: string; // ISO
  selected?: boolean;
};

export type Location = {
  id: string;
  name: string;
  description: string;
  ref: string; // URL of a reference image
  notes?: string;
};

export type StyleLock = {
  anchor: string; // 1–3 sentence style-anchor paragraph
  updatedAt: string; // ISO
  sources?: string[]; // reference tile ids or URLs the lock was derived from
};

export type ProjectState = {
  meta: ProjectMeta;
  scenes: Scene[];
  cast: Character[];
  music: Music;
  assets: ProjectAsset[];
  timeline?: TimelineState;
  notes?: ProjectNote[];
  // Phase 1 additions
  docs?: ProjectDoc[];
  references?: ReferenceTile[];
  locations?: Location[];
  styleLock?: StyleLock | null;
};

// Patches the model can emit. Each field, if present, replaces (or in the
// case of *Append, extends) that slice of state. Keep this loose — we
// validate field-by-field in applyPatch.
export type ProjectPatch = Partial<{
  meta: Partial<ProjectMeta>;
  scenes: Partial<Scene>[];
  scenesReplace: Partial<Scene>[];
  scenesAppend: Partial<Scene>[];
  cast: Partial<Character>[];
  castReplace: Partial<Character>[];
  castAppend: Partial<Character>[];
  music: Partial<NonNullable<Music>>;
  assets: Partial<ProjectAsset>[];
  assetsReplace: Partial<ProjectAsset>[];
  assetsAppend: Partial<ProjectAsset>[];
  timeline: Partial<TimelineState>;
  notesAppend: ProjectNote[];
  // Phase 1 additions
  docs: Partial<ProjectDoc>[]; // upsert-by-id
  docsReplace: Partial<ProjectDoc>[];
  references: Partial<ReferenceTile>[]; // upsert-by-id
  referencesReplace: Partial<ReferenceTile>[];
  referencesAppend: Partial<ReferenceTile>[];
  locations: Partial<Location>[]; // upsert-by-id or name
  locationsReplace: Partial<Location>[];
  locationsAppend: Partial<Location>[];
  styleLock: StyleLock | null;
}>;

export const INITIAL_PROJECT: ProjectState = {
  meta: {
    title: "Untitled project",
    format: "—",
    aspectRatio: "—",
    logline: "",
    targetDuration: "",
    fps: "",
    resolution: "",
  },
  scenes: [],
  cast: [],
  music: null,
  assets: [],
  timeline: { order: [], hidden: [] },
  docs: [],
  references: [],
  locations: [],
  styleLock: null,
};

let idCounter = 1000;
const newId = (prefix: string) => `${prefix}${++idCounter}`;

function normalizeScene(s: Partial<Scene>, fallbackN: number): Scene {
  return {
    id: s.id ?? newId("s"),
    n: typeof s.n === "number" ? s.n : fallbackN,
    title: s.title ?? "Untitled scene",
    prompt: s.prompt ?? "",
    duration: typeof s.duration === "number" ? s.duration : 5,
    thumb: s.thumb ?? "",
    status: s.status ?? "drafting",
    motionPrompt: s.motionPrompt,
    voPrompt: s.voPrompt,
    clipUrl: s.clipUrl,
    anchorAssetIds: Array.isArray(s.anchorAssetIds) ? s.anchorAssetIds : undefined,
    anchorApproved: typeof s.anchorApproved === "boolean" ? s.anchorApproved : undefined,
  };
}

function normalizeCharacter(c: Partial<Character>, idx: number): Character {
  return {
    id: c.id ?? newId("c"),
    name: c.name ?? "Unnamed",
    role: c.role ?? "Character",
    ref: c.ref ?? "",
    notes: c.notes ?? "",
  };
}

function normalizeAsset(a: Partial<ProjectAsset>): ProjectAsset {
  return {
    id: a.id ?? newId("ast"),
    kind: a.kind ?? "reference",
    mime: a.mime ?? "application/octet-stream",
    name: a.name ?? "asset",
    url: a.url ?? "",
    label: a.label,
    attachedTo: a.attachedTo,
    createdAt: a.createdAt,
    width: a.width,
    height: a.height,
    duration: a.duration,
  };
}

function normalizeDoc(d: Partial<ProjectDoc>): ProjectDoc {
  return {
    id: (d.id ?? newId("doc")).toString().trim().toLowerCase().slice(0, 60),
    title: (d.title ?? d.id ?? "Untitled").toString().slice(0, 160),
    body: (d.body ?? "").toString().slice(0, 40_000),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeReference(r: Partial<ReferenceTile>): ReferenceTile {
  return {
    id: r.id ?? newId("ref"),
    url: (r.url ?? "").toString(),
    thumb: r.thumb,
    source: r.source,
    handle: r.handle,
    caption: r.caption,
    addedAt: r.addedAt ?? new Date().toISOString(),
    selected: typeof r.selected === "boolean" ? r.selected : false,
  };
}

function normalizeLocation(l: Partial<Location>): Location {
  return {
    id: l.id ?? newId("loc"),
    name: (l.name ?? "Unnamed location").toString(),
    description: (l.description ?? "").toString(),
    ref: (l.ref ?? "").toString(),
    notes: l.notes,
  };
}


export function applyPatch(
  state: ProjectState,
  patch: ProjectPatch | null | undefined,
): ProjectState {
  if (!patch || typeof patch !== "object") return state;
  let next = state;

  if (patch.meta) {
    next = { ...next, meta: { ...next.meta, ...patch.meta } };
  }

  // Destructive replace — caller explicitly asked to overwrite the full list.
  if (Array.isArray(patch.scenesReplace)) {
    next = {
      ...next,
      scenes: patch.scenesReplace.map((s, i) => normalizeScene(s, i + 1)),
    };
  } else if (Array.isArray(patch.scenes)) {
    // "scenes" is treated as an UPSERT — entries with a matching id update
    // the existing scene in place; entries with a new/missing id are
    // appended. Existing scenes not referenced in the patch are preserved.
    // (Use `scenesReplace` for the rare destructive rewrite.)
    const byId = new Map<string, (typeof patch.scenes)[number]>();
    const fresh: (typeof patch.scenes)[number][] = [];
    for (const s of patch.scenes) {
      if (s.id && next.scenes.some((existing) => existing.id === s.id)) {
        byId.set(s.id, s);
      } else {
        fresh.push(s);
      }
    }
    const merged = next.scenes.map((existing) => {
      const incoming = byId.get(existing.id);
      if (!incoming) return existing;
      return normalizeScene({ ...existing, ...incoming }, existing.n);
    });
    const base = merged.length;
    next = {
      ...next,
      scenes: [
        ...merged,
        ...fresh.map((s, i) => normalizeScene(s, base + i + 1)),
      ],
    };
  }

  if (Array.isArray(patch.scenesAppend)) {
    const base = next.scenes.length;
    next = {
      ...next,
      scenes: [
        ...next.scenes,
        ...patch.scenesAppend.map((s, i) => normalizeScene(s, base + i + 1)),
      ],
    };
  }

  if (Array.isArray(patch.castReplace)) {
    next = {
      ...next,
      cast: patch.castReplace.map((c, i) => normalizeCharacter(c, i)),
    };
  } else if (Array.isArray(patch.cast)) {
    // Upsert semantics: merge by id OR by case-insensitive name match so
    // the agent can iterate on the same character ("Rus") without spawning
    // duplicates each turn.
    const normName = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    const byId = new Map<string, (typeof patch.cast)[number]>();
    const byName = new Map<string, (typeof patch.cast)[number]>();
    const fresh: (typeof patch.cast)[number][] = [];
    for (const c of patch.cast) {
      const idMatch = c.id && next.cast.some((existing) => existing.id === c.id);
      const nameKey = normName(c.name);
      const nameMatch =
        !idMatch && nameKey && next.cast.some((existing) => normName(existing.name) === nameKey);
      if (idMatch) {
        byId.set(c.id as string, c);
      } else if (nameMatch) {
        byName.set(nameKey, c);
      } else {
        fresh.push(c);
      }
    }
    const merged = next.cast.map((existing) => {
      const incoming = byId.get(existing.id) ?? byName.get(normName(existing.name));
      if (!incoming) return existing;
      return normalizeCharacter({ ...existing, ...incoming, id: existing.id }, 0);
    });
    next = {
      ...next,
      cast: [
        ...merged,
        ...fresh.map((c, i) => normalizeCharacter(c, merged.length + i)),
      ],
    };
  }

  if (Array.isArray(patch.castAppend)) {
    // Dedupe by name against the existing cast — if a character with the
    // same name already exists, merge into it instead of appending.
    const normName = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    const existingByName = new Map(
      next.cast.map((c, i) => [normName(c.name), i] as const).filter(([k]) => k),
    );
    let merged = [...next.cast];
    const toAppend: typeof patch.castAppend = [];
    for (const c of patch.castAppend) {
      const key = normName(c.name);
      const hitIdx = key ? existingByName.get(key) : undefined;
      if (hitIdx != null) {
        const existing = merged[hitIdx];
        merged[hitIdx] = normalizeCharacter({ ...existing, ...c, id: existing.id }, hitIdx);
      } else {
        toAppend.push(c);
      }
    }
    const base = merged.length;
    next = {
      ...next,
      cast: [
        ...merged,
        ...toAppend.map((c, i) => normalizeCharacter(c, base + i)),
      ],
    };
  }


  if (patch.music) {
    const base = next.music ?? {
      title: "",
      artist: "",
      bpm: 0,
      key: "",
      beats: [],
      duration: 0,
    };
    next = { ...next, music: { ...base, ...patch.music } };
  }

  if (Array.isArray(patch.assetsReplace)) {
    next = { ...next, assets: patch.assetsReplace.map(normalizeAsset) };
  } else if (Array.isArray(patch.assets)) {
    next = { ...next, assets: patch.assets.map(normalizeAsset) };
  }
  if (Array.isArray(patch.assetsAppend)) {
    next = {
      ...next,
      assets: [...next.assets, ...patch.assetsAppend.map(normalizeAsset)],
    };
  }

  if (patch.timeline && typeof patch.timeline === "object") {
    const base = next.timeline ?? { order: [], hidden: [] };
    next = {
      ...next,
      timeline: {
        order: Array.isArray(patch.timeline.order) ? patch.timeline.order : base.order,
        hidden: Array.isArray(patch.timeline.hidden) ? patch.timeline.hidden : base.hidden,
        seeded:
          typeof patch.timeline.seeded === "boolean"
            ? patch.timeline.seeded
            : base.seeded,
        trims:
          patch.timeline.trims && typeof patch.timeline.trims === "object"
            ? (patch.timeline.trims as Record<string, TimelineTrim>)
            : base.trims,
        volumes:
          patch.timeline.volumes && typeof patch.timeline.volumes === "object"
            ? (patch.timeline.volumes as Record<string, number>)
            : base.volumes,
        videoMuted:
          patch.timeline.videoMuted && typeof patch.timeline.videoMuted === "object"
            ? (patch.timeline.videoMuted as Record<string, boolean>)
            : base.videoMuted,
        fades:
          patch.timeline.fades && typeof patch.timeline.fades === "object"
            ? (patch.timeline.fades as Record<string, TimelineFade>)
            : base.fades,
        tracks: Array.isArray(patch.timeline.tracks)
          ? (patch.timeline.tracks as TimelineTrack[])
          : base.tracks,
        offsets:
          patch.timeline.offsets && typeof patch.timeline.offsets === "object"
            ? (patch.timeline.offsets as Record<string, number>)
            : base.offsets,
        masterVolume:
          typeof patch.timeline.masterVolume === "number"
            ? patch.timeline.masterVolume
            : base.masterVolume,
        comments: Array.isArray(patch.timeline.comments)
          ? (patch.timeline.comments as TimelineComment[])
          : base.comments,
      },
    };
  }

  if (Array.isArray(patch.notesAppend) && patch.notesAppend.length) {
    const base = next.notes ?? [];
    const fresh = patch.notesAppend
      .filter((n) => n && typeof n.text === "string" && n.text.trim().length > 0)
      .map((n) => ({
        at: n.at || new Date().toISOString(),
        text: n.text.trim().slice(0, 600),
        tag: n.tag?.slice(0, 40),
      }));
    next = { ...next, notes: [...base, ...fresh].slice(-200) };
  }

  // ---- Phase 1: docs (upsert by id) ----
  if (Array.isArray(patch.docsReplace)) {
    next = { ...next, docs: patch.docsReplace.map(normalizeDoc) };
  } else if (Array.isArray(patch.docs)) {
    const base = next.docs ?? [];
    const byId = new Map(base.map((d) => [d.id, d] as const));
    for (const d of patch.docs) {
      const norm = normalizeDoc({
        ...(d.id ? byId.get(String(d.id).toLowerCase()) : undefined),
        ...d,
        updatedAt: new Date().toISOString(),
      });
      byId.set(norm.id, norm);
    }
    next = { ...next, docs: Array.from(byId.values()) };
  }

  // ---- Phase 1: references (upsert by id, dedupe by url) ----
  if (Array.isArray(patch.referencesReplace)) {
    next = { ...next, references: patch.referencesReplace.map(normalizeReference) };
  } else {
    const base = next.references ?? [];
    let refs = base.slice();
    const byId = new Map(refs.map((r, i) => [r.id, i] as const));
    const byUrl = new Map(refs.map((r, i) => [r.url, i] as const));
    const applyOne = (r: Partial<ReferenceTile>) => {
      const idKey = r.id ? byId.get(String(r.id)) : undefined;
      const urlKey = !r.id && r.url ? byUrl.get(String(r.url)) : undefined;
      const idx = idKey ?? urlKey;
      if (idx != null) {
        const merged = normalizeReference({ ...refs[idx], ...r, id: refs[idx].id });
        refs[idx] = merged;
      } else {
        const norm = normalizeReference(r);
        refs.push(norm);
        byId.set(norm.id, refs.length - 1);
        if (norm.url) byUrl.set(norm.url, refs.length - 1);
      }
    };
    if (Array.isArray(patch.references)) for (const r of patch.references) applyOne(r);
    if (Array.isArray(patch.referencesAppend)) for (const r of patch.referencesAppend) applyOne(r);
    if (refs !== base) next = { ...next, references: refs };
  }

  // ---- Phase 1: locations (upsert by id or name) ----
  if (Array.isArray(patch.locationsReplace)) {
    next = { ...next, locations: patch.locationsReplace.map(normalizeLocation) };
  } else {
    const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    const base = next.locations ?? [];
    let locs = base.slice();
    const applyOne = (l: Partial<Location>) => {
      const idIdx = l.id ? locs.findIndex((x) => x.id === l.id) : -1;
      const nameIdx =
        idIdx < 0 && l.name ? locs.findIndex((x) => norm(x.name) === norm(l.name)) : -1;
      const idx = idIdx >= 0 ? idIdx : nameIdx;
      if (idx >= 0) {
        locs[idx] = normalizeLocation({ ...locs[idx], ...l, id: locs[idx].id });
      } else {
        locs.push(normalizeLocation(l));
      }
    };
    if (Array.isArray(patch.locations)) for (const l of patch.locations) applyOne(l);
    if (Array.isArray(patch.locationsAppend)) for (const l of patch.locationsAppend) applyOne(l);
    if (locs !== base) next = { ...next, locations: locs };
  }

  // ---- Phase 1: styleLock ----
  if (patch.styleLock !== undefined) {
    next = {
      ...next,
      styleLock:
        patch.styleLock === null
          ? null
          : {
              anchor: (patch.styleLock.anchor ?? "").toString().slice(0, 4000),
              updatedAt: patch.styleLock.updatedAt ?? new Date().toISOString(),
              sources: Array.isArray(patch.styleLock.sources)
                ? patch.styleLock.sources.slice(0, 20)
                : undefined,
            },
    };
  }

  return next;
}

// Synthesize the visible track stack from project state. V1/A1 are always
// derived from `timeline.order` (so existing add/drag/trim flows that mutate
// order keep working). Any user-added extra tracks (V2+, A2+) are appended
// after the defaults — they live in `timeline.tracks` and own their own
// `order`. Stage 1 multi-track UI only adds empty extras; future stages will
// migrate clips into them.
export function deriveTracks(
  state: Pick<ProjectState, "assets" | "timeline">,
): TimelineTrack[] {
  const order = state.timeline?.order ?? [];
  const byId = new Map(state.assets.map((a) => [a.id, a] as const));
  const DETACHED = "::audio";
  const idOf = (ref: string) => {
    const stripped = ref.endsWith(DETACHED) ? ref.slice(0, -DETACHED.length) : ref;
    return stripped.includes("::timeline-instance::")
      ? stripped.split("::timeline-instance::")[0]
      : stripped;
  };
  const stored = state.timeline?.tracks ?? [];
  const extras = stored.filter((t) => t.id !== "v1" && t.id !== "a1");
  // Refs owned by extras are removed from V1/A1 so a clip only appears on one track.
  const claimedByExtras = new Set<string>();
  for (const e of extras) for (const r of e.order) claimedByExtras.add(r);

  const videoOrder: string[] = [];
  const audioOrder: string[] = [];
  for (const ref of order) {
    if (claimedByExtras.has(ref)) continue;
    const isDetached = ref.endsWith(DETACHED);
    const a = byId.get(idOf(ref));
    if (!a) continue;
    if (isDetached && a.mime.startsWith("video/")) audioOrder.push(ref);
    else if (a.mime.startsWith("audio/")) audioOrder.push(ref);
    else if (a.mime.startsWith("image/") || a.mime.startsWith("video/"))
      videoOrder.push(ref);
  }
  const v1 = stored.find((t) => t.id === "v1");
  const a1 = stored.find((t) => t.id === "a1");
  const videoExtras = extras.filter((t) => t.kind === "video");
  const audioExtras = extras.filter((t) => t.kind === "audio");
  // Always ensure a default V2 / A2 exist (no add-track UI). If they aren't
  // already stored, synthesize empty ones with stable IDs so drag-to-track
  // works and persistence is consistent.
  if (!videoExtras.some((t) => t.id === "v2")) {
    videoExtras.unshift({ id: "v2", kind: "video", name: "V2", order: [] });
  }
  if (!audioExtras.some((t) => t.id === "a2")) {
    audioExtras.unshift({ id: "a2", kind: "audio", name: "A2", order: [] });
  }
  return [
    { id: "v1", kind: "video", name: "V1", order: videoOrder, mute: v1?.mute, solo: v1?.solo, lock: v1?.lock },
    ...videoExtras,
    { id: "a1", kind: "audio", name: "A1", order: audioOrder, mute: a1?.mute, solo: a1?.solo, lock: a1?.lock },
    ...audioExtras,
  ];
}
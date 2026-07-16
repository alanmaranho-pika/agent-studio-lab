// Skill pack registry — the single source of truth for every "app" the
// agent can invoke. Each wizard skill is authored as a folder
// (src/agent/skills/<id>/{skill.md, skill.ts}); model skills are
// generated from a compact manifest in _models.ts.
//
// Adding a new wizard skill:
//   1. mkdir src/agent/skills/<id>/
//   2. write skill.md (frontmatter + step-by-step referencing BLK_* ids)
//   3. write skill.ts (typed SkillPack that imports skill.md?raw)
//   4. add its export here
//
// Downstream code (src/lib/agent/app-registry.ts, chat.ts,
// src/lib/skills/registry.ts) reads through the APP_REGISTRY-shaped
// facade below — nothing else has to change.

import type { SkillPack } from "./types";
import { ShortFilmSkill } from "./short-film/skill";
import { ProductAdSkill } from "./product-ad/skill";
import { MusicVideoSkill } from "./music-video/skill";
import { CharacterCreatorSkill } from "./character-creator/skill";
import { TalkingHeadSkill } from "./talking-head/skill";
import { AnimeWorldCupSkill } from "./anime-world-cup/skill";
import { CreateSkillSkill } from "./create-skill/skill";
import { MODEL_SKILLS } from "./_models";

export const WIZARD_SKILLS: SkillPack[] = [
  ShortFilmSkill,
  ProductAdSkill,
  MusicVideoSkill,
  CharacterCreatorSkill,
  TalkingHeadSkill,
  AnimeWorldCupSkill,
];

/** Every registered skill in stable order (wizards → models → meta). */
export const ALL_SKILLS: SkillPack[] = [
  ...WIZARD_SKILLS,
  ...MODEL_SKILLS,
  CreateSkillSkill,
];

export const SKILL_BY_ID = new Map(ALL_SKILLS.map((s) => [s.id, s] as const));
export const SKILL_BY_APP_ID = new Map(ALL_SKILLS.map((s) => [s.appId, s] as const));

export function findSkillByAppId(appId: string): SkillPack | undefined {
  return SKILL_BY_APP_ID.get(appId);
}

export type { SkillPack } from "./types";
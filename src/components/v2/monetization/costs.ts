import type { Skill, SkillKind } from "@/lib/skills";

// Rough demo credit costs. Real pricing lives in /pricing.
const COST_BY_KIND: Record<SkillKind, number> = {
  image: 20,
  video: 200,
  audio: 40,
  speech: 30,
};

// Skill-specific overrides — bump a few of the expensive ones so the user
// can actually run out of credits during a demo.
const COST_OVERRIDES: Record<string, number> = {
  "app-short-film": 2000,
  "app-special-product-ad": 1200,
  "app-world-cup-2026": 800,
  "app-anime-world-cup-2026": 800,
  "app-talking-head": 400,
  "app-character-creator": 150,
};

export function costForSkill(skill: Pick<Skill, "id" | "kind">): number {
  return COST_OVERRIDES[skill.id] ?? COST_BY_KIND[skill.kind] ?? 50;
}

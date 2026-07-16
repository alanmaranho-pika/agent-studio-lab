import type { Skill } from "@/lib/skills";
import { getRecipeForSkill } from "@/lib/app-recipes";
import { getAppSwatch } from "@/lib/app-swatch";

export function HowItWorksV2({ skill }: { skill: Skill }) {
  const recipe = getRecipeForSkill(skill);
  const Icon = skill.icon;
  const swatch = getAppSwatch(skill.id);
  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <div
          className="grid h-14 w-14 place-items-center rounded-[30%] shadow-elegant"
          style={{ backgroundColor: swatch.bg, color: swatch.fg }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {skill.label}
          </h2>
          <p className="text-sm text-muted-foreground">{skill.category}</p>
        </div>
      </div>

      <p className="mx-auto max-w-2xl text-center text-base text-foreground">{skill.description}</p>

      <h3 className="mt-10 mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        How it works
      </h3>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipe.steps.map((step, i) => (
          <li
            key={step.id}
            className="flex flex-col gap-3 rounded-2xl border border-hairline bg-card p-4"
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-sm font-bold text-background">
              {i + 1}
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {step.title}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {step.desc}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-xs text-muted-foreground">
        Model: <span className="font-mono">{skill.model}</span>
      </p>
    </div>
  );
}

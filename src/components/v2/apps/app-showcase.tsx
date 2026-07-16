import { Play } from "lucide-react";
import type { Skill } from "@/lib/skills";
import { getAppSwatch } from "@/lib/app-swatch";
import { APP_SHOWCASES } from "@/lib/v2/app-showcases";
import { cn } from "@/lib/utils";
import { HoverMuteVideo } from "@/components/marketing/hover-mute-video";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function AppShowcase({ skill }: { skill: Skill }) {
  const showcase = APP_SHOWCASES[skill.id];
  if (!showcase) return null;
  const Icon = skill.icon;
  const swatch = getAppSwatch(skill.id);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-8 py-10">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div
              className="grid h-11 w-11 place-items-center rounded-[26%]"
              style={{ backgroundColor: swatch.bg, color: swatch.fg }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {showcase.eyebrow}
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
              {showcase.title}
            </h1>
            <p className="max-w-2xl text-base font-normal leading-relaxed text-muted-foreground md:text-lg">
              {showcase.subtitle}
            </p>
          </div>

          <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-elegant">
            <HoverMuteVideo
              src={showcase.heroVideoUrl}
              loop
              playsInline
              className="absolute inset-0 h-full w-full"
              videoClassName="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">
              <Play className="h-3 w-3 fill-current" />
              Powered by {showcase.title}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {showcase.highlights.map((h) => (
              <div
                key={h.label}
                className="rounded-xl border border-hairline bg-card px-4 py-3"
              >
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {h.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {h.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {showcase.howItWorks ? (
          <section className="mt-12">
            <SectionHeader title={showcase.howItWorks.title} />
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {showcase.howItWorks.steps.map((s, i) => (
                <div
                  key={s.title}
                  className="rounded-2xl border border-hairline bg-card p-5"
                >
                  <div className="inline-flex rounded-full border border-hairline bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Step {i + 1}
                  </div>
                  <h4 className="mt-3 font-display text-lg font-semibold tracking-tight">
                    {s.title}
                  </h4>
                  <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Features ─────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHeader
            kicker="Key features"
            title="Everything you need to direct AI video"
          />
          <div className="mt-8 space-y-6">
            {showcase.features.map((f, i) => (
              <article
                key={f.title}
                className={cn(
                  "grid gap-6 overflow-hidden rounded-2xl border border-hairline bg-card p-4 md:grid-cols-2 md:gap-8 md:p-5",
                )}
              >
                <div
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-xl bg-black",
                  )}
                >
                  {f.mediaKind === "video" ? (
                    <HoverMuteVideo
                      src={f.mediaUrl}
                      loop
                      playsInline
                      className="absolute inset-0 h-full w-full"
                      videoClassName="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={f.mediaUrl}
                      alt={f.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col justify-center gap-3 px-1 md:px-2">
                  <h3 className="text-xl font-normal tracking-tight md:text-2xl">
                    {f.title}
                  </h3>
                  <p className="text-sm font-normal leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Use cases ────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHeader title="What people make with it" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {showcase.useCases.map((u) => (
              <div
                key={u.title}
                className="rounded-2xl border border-hairline bg-card p-5"
              >
                <h4 className="font-display text-lg font-semibold tracking-tight">
                  {u.title}
                </h4>
                <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Examples ─────────────────────────────────────────────── */}
        <section className="mt-16">
          <SectionHeader title="See it in action" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {showcase.examples.map((ex) => (
              <figure
                key={ex.prompt}
                className="overflow-hidden rounded-2xl border border-hairline bg-card transition-transform duration-200 hover:scale-[1.03] hover:shadow-elegant"
              >
                <div className="relative aspect-video bg-black">
                  <HoverMuteVideo
                    src={ex.mediaUrl}
                    loop
                    playsInline
                    className="absolute inset-0 h-full w-full"
                    videoClassName="h-full w-full object-cover"
                  />
                </div>
                <figcaption className="px-4 py-3 text-xs font-normal leading-tight text-muted-foreground">
                  <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-foreground/60">
                    prompt
                  </span>
                  {ex.prompt}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>


        {showcase.faqs && showcase.faqs.length > 0 ? (
          <section className="mt-16">
            <SectionHeader title="FAQ" />
            <Accordion type="single" collapsible className="mt-6 rounded-2xl border border-hairline bg-card">
              {showcase.faqs.map((f, i) => (
                <AccordionItem
                  key={f.question}
                  value={`faq-${i}`}
                  className="border-hairline px-5 last:border-b-0"
                >
                  <AccordionTrigger className="py-4 text-left text-sm font-medium hover:no-underline">
                    {f.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-sm font-normal leading-relaxed text-muted-foreground">
                    {f.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ) : null}

        <div className="h-16" />
      </div>
    </div>
  );
}

function SectionHeader({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      {kicker ? (
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {kicker}
        </div>
      ) : null}
      <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
    </div>
  );
}

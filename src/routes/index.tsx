import { createFileRoute, Link } from "@tanstack/react-router";
import { PikaWordmark } from "@/components/pika-wordmark";

export const Route = createFileRoute("/")({
  // Local projects do not require an authenticated session.
  component: Landing,
  head: () => ({
    meta: [
      { title: "Pika X — Agent Studio" },
      {
        name: "description",
        content:
          "Talk to the Pika agent to storyboard, cast, render and edit — one turn at a time.",
      },
      { property: "og:title", content: "Pika X — Agent Studio" },
      {
        property: "og:description",
        content:
          "Talk to the Pika agent to storyboard, cast, render and edit — one turn at a time.",
      },
    ],
  }),
});

function Landing() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <PikaWordmark className="h-8 w-auto text-foreground" />
      <h1 className="mt-8 max-w-2xl font-display text-4xl font-medium tracking-tight text-foreground md:text-6xl">
        The agent studio for video.
      </h1>
      <div className="mt-5 grid w-full max-w-6xl grid-cols-12">
        <p className="col-span-8 col-start-3 text-base text-muted-foreground">
          Storyboard, cast, render and edit — one turn at a time with the Pika agent.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/projects"
          className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90"
        >
          Open projects
        </Link>
        <Link
          to="/studio"
          className="inline-flex h-11 items-center justify-center rounded-full border border-hairline bg-card px-6 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Explore apps
        </Link>
      </div>
    </main>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PikaWordmark } from "@/components/pika-wordmark";

const searchSchema = z.object({
  redirect: z.string().max(500).optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Pika X" },
      { name: "description", content: "Sign in to the Pika agent studio." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect, mode: modeParam } = Route.useSearch();

  const [mode, setMode] = useState<"signin" | "signup">(modeParam ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = redirect && redirect.startsWith("/") ? redirect : "/projects";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      void navigate({ to: target, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      void navigate({ to: target, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <Link to="/" className="mb-8">
        <PikaWordmark className="h-6 w-auto text-foreground" />
      </Link>

      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl border border-hairline bg-card p-8"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "signup" ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup" ? "Start using the Pika agent." : "Welcome back."}
        </p>

        <label className="mt-5 block text-sm">
          <span className="text-foreground/80">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-foreground/80">Password</span>
          <input
            type="password"
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-hairline bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          Continue with Google
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </form>
    </main>
  );
}

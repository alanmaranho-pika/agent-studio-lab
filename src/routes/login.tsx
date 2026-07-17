import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PikaWordmark } from "@/components/pika-wordmark";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { useServerFn } from "@tanstack/react-start";
import { unlockSite } from "@/lib/gate.functions";

const searchSchema = z.object({
  redirect: z.string().max(500).optional(),
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
  const { redirect } = Route.useSearch();
  const unlock = useServerFn(unlockSite);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = redirect && redirect.startsWith("/") ? redirect : "/projects";

  // If already signed in, skip the form.
  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: target, replace: true });
    }).catch(() => {});
  }, [navigate, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const client = getBrowserSupabase();
      if (!client) throw new Error("Auth is not configured for this build.");
      const result = await unlock({ data: { username, password } });
      if (!result.ok) {
        setError("Incorrect username or password");
        return;
      }
      const { error: authErr } = await client.auth.signInWithPassword({
        email: result.email,
        password: result.password,
      });
      if (authErr) throw authErr;
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
          Enter password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This studio is private. Enter your access credentials to continue.
        </p>

        <label className="mt-5 block text-sm">
          <span className="text-foreground/80">Username</span>
          <input
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-foreground/80">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
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
          {busy ? "…" : "Enter"}
        </button>
      </form>
    </main>
  );
}

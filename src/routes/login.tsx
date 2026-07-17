import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().max(500).optional(),
});

// LOCAL MODE: the password gate has been removed. This route no longer renders
// a login form — it just forwards to the requested destination (or /projects).
// The previous gate-based implementation lives in git history (commit 184adf5).
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
  const target = redirect && redirect.startsWith("/") ? redirect : "/projects";

  useEffect(() => {
    void navigate({ to: target, replace: true });
  }, [navigate, target]);

  return null;
}

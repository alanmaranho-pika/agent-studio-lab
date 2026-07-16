## What's happening

The "This page didn't load / Something went wrong on our end" screen isn't the in-app React error boundary — it's the raw HTML SSR fallback from `src/lib/error-page.ts`, served by `src/server.ts` when the server runtime returns a 500.

Worker logs confirm every route on the published/preview build is 500ing (e.g. `/`, `/account`) with:

```
Error: h3 swallowed SSR error: {"status":500,"unhandled":true,"message":"HTTPError"}
```

Locally (dev server), the same routes render fine. So the failure is production-build-specific and happens inside the h3 handler — our `consumeLastCapturedError()` is coming back empty because the throw is caught by h3 before the `globalThis` error listeners see it, leaving us with no stack trace.

Most likely cause: something in the recent `src/agent/**` refactor (blocks/skills/instructions registries with many `?raw` markdown imports) is throwing at module initialization inside the Cloudflare Worker bundle. It's reachable from client-imported files like `src/components/studio/agent/agent-shell.tsx` → `@/lib/agent/render-turn-html` → `@/agent/blocks/_registry` and `@/agent/skills/_registry`, which get evaluated during SSR.

## Plan

**1. Restore visibility into the real error (small, targeted).**
Currently `server.ts` only surfaces a captured error when a `globalThis` listener fired first. Change the wrapper so we also try/catch around the awaited handler `fetch` and, when h3's swallowed 500 body appears, do one *retry* of the same request with `console.error` patched to a capturing sink so the internal h3 log line becomes visible in worker logs. Also log `error?.stack` explicitly (not just `error`) so Cloudflare's log pipeline keeps the full stack.

**2. Reproduce the module-init failure by narrowing the import chain.**
Audit the client-reachable chain from `agent-shell.tsx` through the new registries:
   - `src/lib/agent/render-turn-html.ts`, `ui-schema.ts`
   - `src/agent/blocks/_registry.ts` (imports every `block.ts` + `block.md?raw`)
   - `src/agent/skills/_registry.ts` (imports every `skill.ts` + `skill.md?raw`)
   - `src/agent/instructions/_registry.ts`

Look specifically for:
   - a `.server.ts` (or `process.env`) reference smuggled into the client graph through one of the new skill/block modules
   - a top-level `throw` / zod parse / dynamic key that runs at import time
   - `?raw` imports pointing at a file that doesn't exist (case mismatch, missing `skill.md` — we already suspect this once for `short-film`)

**3. Fix the offending module.**
Typical fixes are one of:
   - move a server-only import behind a lazy `await import()` inside a handler
   - guard a module-scope statement so it can't throw at init
   - correct a missing/renamed `?raw` file path

**4. Verify.**
   - `bunx tsgo --noEmit`
   - Rebuild preview and hit `/`, `/account`, `/projects` — expect 200s and normal pages
   - Confirm worker logs are clean (no more `h3 swallowed SSR error`)

## Scope

Frontend/agent-module code only. No database, RLS, or auth changes. Existing UI, routes, and skill/block behavior stay the same — this is a build/runtime bug fix, not a redesign.

## Not doing

- Not reverting the block/skill/instruction refactor
- Not changing the fallback error page's copy or layout
- Not touching unrelated routes or backend functions

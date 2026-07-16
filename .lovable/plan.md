# Replicate `agent-studio` into this project

## What the repo is

`alanmaranho-pika/agent-studio` is a TanStack Start app (same stack as this project) exported from Lovable. It's a video/image generation "Agent Studio" with a chat-driven creative canvas, timeline editor, and asset toolkit. Local projects and uploaded assets are stored in the browser's IndexedDB, so a Supabase backend is optional.

Key stack pieces from `package.json`:
- AI SDK: `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `@anthropic-ai/sdk`
- MCP client: `@modelcontextprotocol/sdk`, `@ai-sdk/mcp`
- UI: full shadcn/Radix set, `@phosphor-icons/react`, `tailwindcss`
- Cloudflare Workers deploy: `@cloudflare/vite-plugin`
- Runtime: Node 22, npm (their setup); we run on bun here, which is fine

The tree is large (~2,300 entries): custom Telka fonts, dozens of demo images/videos (mostly `.asset.json` reference files), and a deep `src/components/studio/agent/*` module including `agent-shell.tsx` (~93 KB) and `stage-generations.tsx` (~57 KB).

## Approach

Because the tree is huge and content-heavy, I'll port it in phases and check the preview between phases rather than dumping everything at once.

### Phase 1 — Foundations
- Add dependencies from their `package.json` that we don't already have (AI SDK, MCP SDK, Phosphor icons, missing Radix packages, etc.).
- Port config: `components.json`, `eslint.config.js`, `bunfig.toml` diffs, `.env.example`, `.prettierrc` if different.
- Port `public/fonts/Telka-*.otf` and `public/robots.txt`.
- Port `src/styles.css` (their Telka font-face + design tokens) and any global CSS.
- Port `src/lib/*` (utils, storage, AI clients, MCP helpers).

### Phase 2 — Routes & shell
- Replace placeholder `src/routes/index.tsx` with their home route.
- Add every other route file under `src/routes/` (studio, project, api endpoints under `src/routes/api/`).
- Port `src/routes/__root.tsx` head metadata (title, description, og) — replace current "Lovable App" placeholder.
- Wire providers (`QueryClientProvider`, any studio-wide context) inside `RootComponent`.

### Phase 3 — Shared components
- Port `src/components/*` non-studio pieces: `side-nav`, `account-popover`, `pika-mark`, `pika-wordmark`, `project-thumbnail`, `marketing/*`, `ai-elements/*` (conversation, prompt-input, shimmer).
- Port shadcn `src/components/ui/*` variants they've customized.

### Phase 4 — Studio module
- Port `src/components/studio/agent/*` (agent shell, symbol, ethereal backdrop, intents, motion primitives, dropzone, generations, render progress, skeleton, timeline subfolder).
- Port related hooks/state (timeline model, playback, edits, variant editor).
- Port toolkit + anime-modes screens that consume the asset images.

### Phase 5 — Assets
- Copy binary assets: font files, `src/assets/anime-modes/*.jpg`, `src/assets/toolkit/*.jpg`, `src/assets/symbol.svg`, `src/assets/showcases/*`, `src/assets/pika-api/*`.
- Note: many entries in the repo are `*.mp4.asset.json` pointer files, not the mp4 itself. I'll port them as-is; if their loader expects to fetch real mp4s from a CDN referenced inside those JSON files, videos will stream from there. If they expect local binaries, we may need you to provide URLs or upload the mp4s.

### Phase 6 — Server functions & API routes
- Port `createServerFn` handlers (AI streaming, MCP calls) into TanStack Start-compatible modules.
- Port `src/routes/api/*` server routes for webhooks/streaming endpoints.
- Set up runtime secrets (`ANTHROPIC_API_KEY`, any others they reference) via the secrets tool — I'll list what's needed after reading `.env.example` and the server code.

### Phase 7 — Verify
- Run typecheck/build, load the preview, click through home → studio → generation flow, and fix runtime errors.

## Constraints & caveats

1. **Direct-fetch of raw files is blocked** because the repo default branch requires auth for `raw.githubusercontent.com` even though the API says it's public. In build mode I'll clone via `git` in the sandbox (`git clone --depth 1`) to get every file, then port them in.
2. **Serverless runtime differences.** Their `@cloudflare/vite-plugin` deploy config maps closely to this template's Cloudflare Workers runtime, but any Node-only dependency they use (e.g. anything that spawns subprocesses) will need to be swapped or removed.
3. **Secrets you'll need to provide.** At minimum `ANTHROPIC_API_KEY`; likely also OpenAI-compatible base URL/key and Pika API credentials. I'll surface the exact list once I've read `.env.example` in build mode.
4. **This is a large port.** Expect several iterations to reach a fully working preview. I'll pause after each phase for you to sanity-check.

## Ready to build?

Approve this plan and I'll start Phase 1 (clone the repo, install deps, port config + fonts + styles).

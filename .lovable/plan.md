
## Goal

Bring back the Supabase backend so each user signs in with Google, and their projects and generated/uploaded assets are saved to their own account in the cloud. Existing local (IndexedDB) projects get pushed up the first time a user signs in.

## 1. Enable Lovable Cloud + Google sign-in

- Enable Lovable Cloud (provisions Supabase project, keys, and the managed `_authenticated` route gate).
- Configure Google as the social provider.
- Add a public `/auth` route with a "Continue with Google" button (uses the Lovable-brokered OAuth helper — iframe-safe in preview).
- Root route subscribes once to `onAuthStateChange` to invalidate the router/queries on sign-in / sign-out.
- Sign-out button in the account popover clears cache and redirects to `/auth`.

## 2. Database schema (migration)

Tables in `public`, all with RLS + explicit grants:

```text
profiles
  id uuid PK  (references auth.users on delete cascade)
  display_name text
  avatar_url text
  created_at, updated_at timestamptz
  -- auto-created via on_auth_user_created trigger

projects
  id uuid PK
  user_id uuid  (references auth.users, not null)
  title text, status text
  skill text, studio_mode text, studio_model text
  project_state jsonb          -- ProjectState blob (same shape as today)
  created_at, updated_at timestamptz

project_assets
  id uuid PK
  project_id uuid  (references projects on delete cascade)
  user_id uuid     (denormalized for RLS)
  kind text, name text, mime text, size_bytes int
  storage_path text    -- path in the `project-assets` bucket
  metadata jsonb
  created_at timestamptz
```

RLS: each user can CRUD only rows where `user_id = auth.uid()`. Profiles readable by owner. No `anon` grants.

## 3. Storage

- Private `project-assets` bucket (Supabase Storage).
- Path convention: `<user_id>/<project_id>/<asset_id>.<ext>`.
- RLS on `storage.objects` restricts read/write to the owning user (first path segment = `auth.uid()`).
- Client uploads directly via the Supabase JS client; server functions issue signed URLs for downloads/exports.

## 4. Replace the local shims

Today the app runs on `createLocalDatabaseShim()` (returns empty results) and `local-projects.ts` (IndexedDB). Rewrite the data layer:

- `src/lib/projects.functions.ts` → server functions (list/get/create/update/delete project) using `requireSupabaseAuth`.
- `src/lib/project-assets.server.ts` → server helpers for asset rows + signed URLs.
- Browser client from `@/integrations/supabase/client` used only for auth + direct Storage uploads.
- Delete `local-database-shim.ts` and `local-projects.ts` once callers are migrated.

Routes:
- `/projects`, `/library`, `/studio/:projectId`, `/account` move under `_authenticated/` (already there — just ensure loaders call the new server fns).
- `/` stays public (landing); `Sign in` CTA → `/auth`.

## 5. One-time IndexedDB → Supabase migration

On first successful sign-in per browser:
1. Detect projects in IndexedDB.
2. For each project: create the Supabase row, upload every stored asset Blob to Storage, insert `project_assets` rows, rewrite `project_state` asset refs to the new ids.
3. Mark the IndexedDB DB as `migrated:<user_id>` so it only runs once; keep the local data as a fallback for one release, then drop.

A small "Importing your local projects…" toast covers the migration; failures are logged and retried on next sign-in.

## 6. Technical notes

- Server fns live in `*.functions.ts` under `src/lib/`; never import `client.server` at module scope.
- `src/start.ts` keeps the existing `errorMiddleware`; append `attachSupabaseAuth` to `functionMiddleware`.
- Env: `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser; `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY` for admin ops like the profile trigger backfill) on the server. All auto-provisioned by Lovable Cloud.
- Google provider must be enabled via `supabase--configure_social_auth` in the same turn Google sign-in ships.
- No changes to AI/FAL/Anthropic pipelines — they keep reading their own secrets.

## What you'll see when done

- Landing page has "Sign in with Google".
- After signing in, you land on `/projects` showing your own projects only.
- Creating a project, uploading a reference image, and generating outputs all persist to your account and reload correctly on another device.
- Your previous local projects appear automatically after the first sign-in.

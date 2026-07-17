## Important constraint to know up front

Lovable Cloud cannot be disconnected from a project once it's been added — that's a platform limitation, not something I can override in code. In practice this means:

- `.env` values `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are managed by Cloud and get re-injected by the platform.
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts` are auto-generated against the Cloud project.
- `supabase/config.toml` pins the Cloud project ref.
- The `supabase--migration` / `supabase--insert` tools operate on the Cloud project, not your personal one.

To actually run against your personal Supabase we bypass the managed integration and wire in our own client. The managed files stay in the repo but stop being used by app code.

## Plan

### 1. Store your credentials as secrets
Add these as runtime secrets (I'll open the secure form when we implement):
- `MY_SUPABASE_URL` — `https://<your-ref>.supabase.co`
- `MY_SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_...` or legacy anon key
- `MY_SUPABASE_SERVICE_ROLE_KEY` — service role key
- `MY_SUPABASE_PROJECT_ID` — your project ref

And browser-visible copies (needed because Vite inlines only `VITE_*` at build):
- `VITE_MY_SUPABASE_URL`
- `VITE_MY_SUPABASE_PUBLISHABLE_KEY`

### 2. Create a parallel, hand-rolled Supabase integration
New files that read `MY_SUPABASE_*` / `VITE_MY_SUPABASE_*` instead of the Cloud vars:
- `src/integrations/supabase/my-client.ts` — browser client (mirrors current `client.ts`, same `sb_*` fetch shim).
- `src/integrations/supabase/my-client.server.ts` — service-role admin client.
- `src/integrations/supabase/my-auth-middleware.ts` — `requireSupabaseAuth` equivalent bound to your keys.
- `src/integrations/supabase/my-auth-attacher.ts` — bearer attacher for server-fn RPCs.
- `src/integrations/supabase/my-types.ts` — placeholder `Database` type (regenerated in step 4).

The generated Lovable files are left untouched so the platform doesn't fight our edits.

### 3. Swap every import site
Replace project-wide:
- `@/integrations/supabase/client` → `@/integrations/supabase/my-client`
- `@/integrations/supabase/client.server` → `@/integrations/supabase/my-client.server`
- `@/integrations/supabase/auth-middleware` → `@/integrations/supabase/my-auth-middleware`
- `@/integrations/supabase/auth-attacher` → `@/integrations/supabase/my-auth-attacher` (in `src/start.ts`)
- `@/integrations/supabase/types` → `@/integrations/supabase/my-types`

Also update `src/lib/supabase-browser.ts` and `src/lib/auth-route.server.ts` to read the `VITE_MY_*` / `MY_*` vars.

### 4. Recreate schema in your personal Supabase (you run this)
I'll produce a single `schema.sql` bundling everything from `supabase/migrations/` plus the two DB functions currently in Cloud (`handle_new_user`, `touch_updated_at`, `set_user_id_from_project`), all GRANTs, RLS policies, and the `project-assets` storage bucket. You paste it into your Supabase SQL editor.

Then regenerate `my-types.ts` locally with the Supabase CLI:
```
supabase gen types typescript --project-id <your-ref> > src/integrations/supabase/my-types.ts
```
(Or I can inline a `Database` type by hand from the schema — say the word.)

### 5. Configure auth on your Supabase (you do this in Supabase dashboard)
- Enable Email provider (and disable auto-confirm if you want confirmation emails).
- Enable Google provider with your own OAuth client (redirect URLs: `https://<your-ref>.supabase.co/auth/v1/callback` plus the app's origins).
- Add `Site URL` and additional redirect URLs for the preview + published domains.

### 6. Verification
- Build check.
- Sign up a new user → confirm a `profiles` row is created by the trigger.
- Create a project → confirm it appears in your Supabase `projects` table (not the Cloud one).
- Upload an asset → confirm it lands in your `project-assets` bucket.

## What I need from you before build mode
Just confirm the plan and I'll start with step 1 (opening the secret form). Have your 4 credential values ready.

## Follow-ups worth flagging
- The `supabase--*` tools in this chat will still target Lovable Cloud — schema changes to your personal DB happen via SQL you paste in your own dashboard, not through me.
- If Lovable Cloud ever wipes/rewrites the `MY_*` secrets or generated files, we'd need to reapply — I don't expect that since the names don't collide with the managed ones, but flagging it.

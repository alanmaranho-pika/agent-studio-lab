
-- Shared updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── profiles ────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── projects ────────────────────────────────────────────────────────────
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Project',
  status text NOT NULL DEFAULT 'draft',
  skill text,
  studio_mode text NOT NULL DEFAULT 'agent',
  studio_model text,
  project_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_updated_idx ON public.projects (user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own projects" ON public.projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── project_assets ──────────────────────────────────────────────────────
CREATE TABLE public.project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reference',
  mime text NOT NULL DEFAULT 'application/octet-stream',
  name text NOT NULL DEFAULT 'asset',
  storage_path text,
  url text NOT NULL DEFAULT '',
  label text,
  attached_to text,
  width int,
  height int,
  duration double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_assets_project_idx ON public.project_assets (project_id, created_at DESC);
CREATE INDEX project_assets_user_idx ON public.project_assets (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_assets TO authenticated;
GRANT ALL ON public.project_assets TO service_role;
ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project assets" ON public.project_assets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── project_messages ────────────────────────────────────────────────────
CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_messages_project_idx ON public.project_messages (project_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_messages TO authenticated;
GRANT ALL ON public.project_messages TO service_role;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project messages" ON public.project_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── project_jobs ────────────────────────────────────────────────────────
CREATE TABLE public.project_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL,
  app_label text,
  input jsonb,
  status text NOT NULL DEFAULT 'queued',
  error text,
  external_id text,
  status_url text,
  response_url text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  placeholder_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_jobs_project_idx ON public.project_jobs (project_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_jobs TO authenticated;
GRANT ALL ON public.project_jobs TO service_role;
ALTER TABLE public.project_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project jobs" ON public.project_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_project_jobs_touch BEFORE UPDATE ON public.project_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Storage bucket RLS: users only inside their own <uid>/ folder ──────
CREATE POLICY "Users can read own project files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own project files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own project files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

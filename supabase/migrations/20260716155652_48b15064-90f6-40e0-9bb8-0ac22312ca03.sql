
-- project_messages: rename content -> parts
ALTER TABLE public.project_messages RENAME COLUMN content TO parts;

-- project_jobs: add tracking columns
ALTER TABLE public.project_jobs
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS result_url text,
  ADD COLUMN IF NOT EXISTS asset_id uuid;

-- Auto-populate user_id on child inserts from the parent project.
CREATE OR REPLACE FUNCTION public.set_user_id_from_project()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT user_id INTO NEW.user_id FROM public.projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.set_user_id_from_project() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.project_assets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.project_messages ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.project_jobs ALTER COLUMN user_id DROP NOT NULL;

CREATE TRIGGER trg_project_assets_user_id BEFORE INSERT ON public.project_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_project();
CREATE TRIGGER trg_project_messages_user_id BEFORE INSERT ON public.project_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_project();
CREATE TRIGGER trg_project_jobs_user_id BEFORE INSERT ON public.project_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_project();

-- Also lock down previously-created SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

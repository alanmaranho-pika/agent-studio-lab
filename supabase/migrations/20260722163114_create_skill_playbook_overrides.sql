-- Runtime overrides for the built-in, version-controlled skill playbooks.
-- The Markdown files in src/agent/skills remain the deployable defaults;
-- this table stores each user's live edits for both local and hosted runtimes.
CREATE TABLE public.skill_playbook_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK (app_id ~ '^[a-z0-9][a-z0-9-]*$'),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_playbook_overrides TO authenticated;
GRANT ALL ON public.skill_playbook_overrides TO service_role;

ALTER TABLE public.skill_playbook_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own skill playbook overrides"
  ON public.skill_playbook_overrides FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own skill playbook overrides"
  ON public.skill_playbook_overrides FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own skill playbook overrides"
  ON public.skill_playbook_overrides FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own skill playbook overrides"
  ON public.skill_playbook_overrides FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE TRIGGER trg_skill_playbook_overrides_touch
  BEFORE UPDATE ON public.skill_playbook_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

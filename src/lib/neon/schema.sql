CREATE TABLE IF NOT EXISTS public.app_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Project',
  status text NOT NULL DEFAULT 'draft',
  skill text,
  studio_mode text NOT NULL DEFAULT 'agent',
  studio_model text,
  project_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_projects_touch ON public.projects;
CREATE TRIGGER trg_projects_touch
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.project_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL DEFAULT 'reference',
  mime text NOT NULL DEFAULT 'application/octet-stream',
  name text NOT NULL DEFAULT 'asset',
  storage_path text,
  url text NOT NULL DEFAULT '',
  label text,
  attached_to text,
  width integer,
  height integer,
  duration double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_assets_project_idx
  ON public.project_assets (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_assets_user_idx
  ON public.project_assets (user_id);

CREATE TABLE IF NOT EXISTS public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL,
  parts jsonb NOT NULL DEFAULT '{}'::jsonb,
  tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_messages_project_idx
  ON public.project_messages (project_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.project_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  model text NOT NULL,
  app_label text,
  app_id text,
  mode text,
  prompt text,
  input jsonb,
  status text NOT NULL DEFAULT 'queued',
  error text,
  external_id text,
  status_url text,
  response_url text,
  result_url text,
  asset_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  placeholder_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_jobs_project_idx
  ON public.project_jobs (project_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_project_jobs_touch ON public.project_jobs;
CREATE TRIGGER trg_project_jobs_touch
  BEFORE UPDATE ON public.project_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.skill_playbook_overrides (
  user_id uuid NOT NULL,
  app_id text NOT NULL CHECK (app_id ~ '^[a-z0-9][a-z0-9-]*$'),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS skill_playbook_overrides_user_idx
  ON public.skill_playbook_overrides (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_skill_playbook_overrides_touch
  ON public.skill_playbook_overrides;
CREATE TRIGGER trg_skill_playbook_overrides_touch
  BEFORE UPDATE ON public.skill_playbook_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_skills (
  id text PRIMARY KEY CHECK (id ~ '^SKL_[A-Z0-9_]+$'),
  app_id text NOT NULL UNIQUE CHECK (app_id ~ '^[a-z0-9][a-z0-9-]*$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('wizard', 'model', 'meta')),
  intent text NOT NULL CHECK (char_length(intent) BETWEEN 1 AND 1000),
  one_liner text NOT NULL CHECK (char_length(one_liner) BETWEEN 1 AND 1000),
  outputs text[] NOT NULL DEFAULT ARRAY[]::text[],
  matches text[] NOT NULL DEFAULT ARRAY[]::text[],
  uses_blocks text[] NOT NULL DEFAULT ARRAY[]::text[],
  model text,
  mode text CHECK (mode IS NULL OR mode IN ('image', 'video', 'audio', 'speech')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'model' AND model IS NOT NULL AND mode IS NOT NULL)
    OR (kind <> 'model' AND model IS NULL AND mode IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS agent_skills_active_order_idx
  ON public.agent_skills (is_active, sort_order, app_id);

DROP TRIGGER IF EXISTS trg_agent_skills_touch ON public.agent_skills;
CREATE TRIGGER trg_agent_skills_touch
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agent_skill_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skill_id text NOT NULL REFERENCES public.agent_skills(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'coding_agent', 'system')),
  actor_id uuid,
  actor_name text NOT NULL CHECK (char_length(actor_name) BETWEEN 1 AND 160),
  action text NOT NULL DEFAULT 'edit' CHECK (action IN ('initial', 'edit', 'restore')),
  restored_from_version integer CHECK (
    restored_from_version IS NULL OR restored_from_version > 0
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS agent_skill_versions_skill_version_idx
  ON public.agent_skill_versions (skill_id, version DESC);

CREATE OR REPLACE FUNCTION public.bump_agent_skill_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.body_md IS DISTINCT FROM OLD.body_md THEN
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agent_skill_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_actor_type text := NULLIF(current_setting('app.skill_actor_type', true), '');
  v_actor_id_text text := NULLIF(current_setting('app.skill_actor_id', true), '');
  v_actor_id uuid;
  v_actor_name text := NULLIF(current_setting('app.skill_actor_name', true), '');
  v_action text := NULLIF(current_setting('app.skill_action', true), '');
  v_restored_from_text text :=
    NULLIF(current_setting('app.skill_restored_from_version', true), '');
  v_restored_from_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.body_md IS NOT DISTINCT FROM OLD.body_md THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_actor_id := v_actor_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor_id := NULL;
  END;

  BEGIN
    v_restored_from_version := v_restored_from_text::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    v_restored_from_version := NULL;
  END;

  IF v_actor_type IS NULL
    OR v_actor_type NOT IN ('user', 'coding_agent', 'system') THEN
    v_actor_type := 'coding_agent';
  END IF;

  IF v_actor_name IS NULL
    AND v_actor_type = 'user'
    AND v_actor_id IS NOT NULL THEN
    SELECT NULLIF(display_name, '')
      INTO v_actor_name
      FROM public.profiles
      WHERE id = v_actor_id;
  END IF;

  IF v_actor_name IS NULL THEN
    v_actor_name := CASE
      WHEN v_actor_type = 'user' THEN 'User'
      WHEN v_actor_type = 'system' THEN 'System'
      ELSE format('Coding agent (%s)', current_user)
    END;
  END IF;

  IF v_action IS NULL OR v_action NOT IN ('initial', 'edit', 'restore') THEN
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'initial' ELSE 'edit' END;
  END IF;

  IF v_action <> 'restore' THEN
    v_restored_from_version := NULL;
  END IF;

  INSERT INTO public.agent_skill_versions (
    skill_id,
    version,
    body_md,
    actor_type,
    actor_id,
    actor_name,
    action,
    restored_from_version,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.version,
    NEW.body_md,
    v_actor_type,
    v_actor_id,
    left(v_actor_name, 160),
    v_action,
    v_restored_from_version,
    NEW.updated_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_skills_version_bump ON public.agent_skills;
CREATE TRIGGER trg_agent_skills_version_bump
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.bump_agent_skill_version();

DROP TRIGGER IF EXISTS trg_agent_skills_version_record ON public.agent_skills;
CREATE TRIGGER trg_agent_skills_version_record
  AFTER INSERT OR UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.record_agent_skill_version();

CREATE OR REPLACE FUNCTION public.update_agent_skill_body(
  p_app_id text,
  p_body_md text,
  p_expected_version integer,
  p_actor_type text,
  p_actor_id uuid,
  p_actor_name text
)
RETURNS TABLE (
  new_version integer,
  new_updated_at timestamptz,
  new_body_md text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_type NOT IN ('user', 'coding_agent') THEN
    RAISE EXCEPTION 'Invalid skill version actor type';
  END IF;
  IF NULLIF(trim(p_actor_name), '') IS NULL THEN
    RAISE EXCEPTION 'Skill version actor name is required';
  END IF;

  PERFORM set_config('app.skill_actor_type', p_actor_type, true);
  PERFORM set_config('app.skill_actor_id', COALESCE(p_actor_id::text, ''), true);
  PERFORM set_config('app.skill_actor_name', left(trim(p_actor_name), 160), true);
  PERFORM set_config('app.skill_action', 'edit', true);
  PERFORM set_config('app.skill_restored_from_version', '', true);

  RETURN QUERY
  UPDATE public.agent_skills
  SET body_md = trim(p_body_md)
  WHERE app_id = p_app_id
    AND is_active = true
    AND version = p_expected_version
  RETURNING version, updated_at, body_md;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_agent_skill_body(
  p_app_id text,
  p_target_version integer,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_name text
)
RETURNS TABLE (
  new_version integer,
  new_updated_at timestamptz,
  new_body_md text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_skill_id text;
  v_body_md text;
BEGIN
  IF NULLIF(trim(p_actor_name), '') IS NULL THEN
    RAISE EXCEPTION 'Skill version actor name is required';
  END IF;

  SELECT id
    INTO v_skill_id
    FROM public.agent_skills
    WHERE app_id = p_app_id
      AND is_active = true;

  IF v_skill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT body_md
    INTO v_body_md
    FROM public.agent_skill_versions
    WHERE skill_id = v_skill_id
      AND version = p_target_version;

  IF v_body_md IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.skill_actor_type', 'user', true);
  PERFORM set_config('app.skill_actor_id', COALESCE(p_actor_id::text, ''), true);
  PERFORM set_config('app.skill_actor_name', left(trim(p_actor_name), 160), true);
  PERFORM set_config('app.skill_action', 'restore', true);
  PERFORM set_config(
    'app.skill_restored_from_version',
    p_target_version::text,
    true
  );

  RETURN QUERY
  UPDATE public.agent_skills
  SET body_md = v_body_md
  WHERE id = v_skill_id
    AND version = p_expected_version
  RETURNING version, updated_at, body_md;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agent_skill(
  p_id text,
  p_app_id text,
  p_label text,
  p_kind text,
  p_intent text,
  p_one_liner text,
  p_outputs text[],
  p_matches text[],
  p_uses_blocks text[],
  p_model text,
  p_mode text,
  p_steps jsonb,
  p_body_md text,
  p_actor_id uuid,
  p_actor_name text
)
RETURNS TABLE (
  new_id text,
  new_app_id text,
  new_version integer,
  new_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_kind NOT IN ('wizard', 'model') THEN
    RAISE EXCEPTION 'New skills must be a workflow or model skill';
  END IF;
  IF NULLIF(trim(p_actor_name), '') IS NULL THEN
    RAISE EXCEPTION 'Skill creator name is required';
  END IF;
  IF p_kind = 'model'
    AND (NULLIF(trim(p_model), '') IS NULL OR p_mode IS NULL) THEN
    RAISE EXCEPTION 'Model skills require a model and output mode';
  END IF;
  IF p_kind = 'wizard' AND (p_model IS NOT NULL OR p_mode IS NOT NULL) THEN
    RAISE EXCEPTION 'Workflow skills cannot define a model or output mode';
  END IF;

  PERFORM set_config('app.skill_actor_type', 'user', true);
  PERFORM set_config('app.skill_actor_id', COALESCE(p_actor_id::text, ''), true);
  PERFORM set_config('app.skill_actor_name', left(trim(p_actor_name), 160), true);
  PERFORM set_config('app.skill_action', 'initial', true);
  PERFORM set_config('app.skill_restored_from_version', '', true);

  RETURN QUERY
  INSERT INTO public.agent_skills (
    id,
    app_id,
    label,
    kind,
    intent,
    one_liner,
    outputs,
    matches,
    uses_blocks,
    model,
    mode,
    steps,
    body_md,
    sort_order,
    version
  )
  VALUES (
    trim(p_id),
    trim(p_app_id),
    trim(p_label),
    p_kind,
    trim(p_intent),
    trim(p_one_liner),
    COALESCE(p_outputs, ARRAY[]::text[]),
    COALESCE(p_matches, ARRAY[]::text[]),
    COALESCE(p_uses_blocks, ARRAY[]::text[]),
    NULLIF(trim(p_model), ''),
    p_mode,
    COALESCE(p_steps, '[]'::jsonb),
    trim(p_body_md),
    COALESCE((SELECT max(sort_order) + 1 FROM public.agent_skills), 0),
    1
  )
  RETURNING id, app_id, version, created_at;
END;
$$;

INSERT INTO public.app_migrations (name)
VALUES ('001_supabase_application_schema')
ON CONFLICT (name) DO UPDATE SET applied_at = now();

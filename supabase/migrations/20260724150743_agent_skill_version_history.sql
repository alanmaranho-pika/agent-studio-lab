-- Immutable version history for the live agent-skill editor.
-- The trigger is the final safety net: editor writes, restores, and direct
-- coding-agent SQL updates all create a new snapshot.

CREATE TABLE public.agent_skill_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skill_id text NOT NULL REFERENCES public.agent_skills(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  body_md text NOT NULL CHECK (char_length(body_md) BETWEEN 1 AND 200000),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'coding_agent', 'system')),
  actor_id uuid,
  actor_name text NOT NULL CHECK (char_length(actor_name) BETWEEN 1 AND 160),
  action text NOT NULL DEFAULT 'edit' CHECK (action IN ('initial', 'edit', 'restore')),
  restored_from_version integer CHECK (restored_from_version IS NULL OR restored_from_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);

CREATE INDEX agent_skill_versions_skill_version_idx
  ON public.agent_skill_versions (skill_id, version DESC);

REVOKE ALL ON public.agent_skill_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_skill_versions TO service_role;
GRANT ALL ON SEQUENCE public.agent_skill_versions_id_seq TO service_role;
ALTER TABLE public.agent_skill_versions ENABLE ROW LEVEL SECURITY;

-- Preserve the current live state as the first known snapshot. Existing
-- version numbers are retained even if history was enabled after version 1.
INSERT INTO public.agent_skill_versions (
  skill_id,
  version,
  body_md,
  actor_type,
  actor_name,
  action
)
SELECT
  id,
  version,
  body_md,
  'system',
  'History enabled',
  'initial'
FROM public.agent_skills
ON CONFLICT (skill_id, version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_agent_skill_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- version is derived from actual playbook changes and cannot be advanced
  -- independently by an accidental/manual UPDATE.
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
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_actor_id := NULL;
  END;

  BEGIN
    v_restored_from_version := v_restored_from_text::integer;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_restored_from_version := NULL;
  END;

  IF v_actor_type NOT IN ('user', 'coding_agent', 'system') THEN
    IF (SELECT auth.uid()) IS NOT NULL THEN
      v_actor_type := 'user';
      v_actor_id := (SELECT auth.uid());
    ELSE
      v_actor_type := 'coding_agent';
    END IF;
  END IF;

  IF v_actor_name IS NULL AND v_actor_type = 'user' AND v_actor_id IS NOT NULL THEN
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

  IF v_action NOT IN ('initial', 'edit', 'restore') THEN
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

CREATE TRIGGER trg_agent_skills_version_bump
  BEFORE UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.bump_agent_skill_version();

CREATE TRIGGER trg_agent_skills_version_record
  AFTER INSERT OR UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.record_agent_skill_version();

-- Application-server write path. Transaction-local actor context is consumed
-- by the trigger above; only the service role may call this function.
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

REVOKE ALL ON FUNCTION public.update_agent_skill_body(
  text, text, integer, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_skill_body(
  text, text, integer, text, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.restore_agent_skill_body(
  text, integer, integer, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_agent_skill_body(
  text, integer, integer, uuid, text
) TO service_role;

COMMENT ON TABLE public.agent_skill_versions IS
  'Immutable live-editor history. Direct SQL body_md updates are attributed to the current coding-agent database role unless explicit actor context is supplied.';

-- PostgreSQL's `NULL NOT IN (...)` evaluates to NULL, not true. Make the
-- trigger's direct-SQL fallback explicit so coding-agent edits always receive
-- an actor type and action.

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

  IF v_actor_type IS NULL OR v_actor_type NOT IN ('user', 'coding_agent', 'system') THEN
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

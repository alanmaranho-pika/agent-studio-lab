-- Authenticated application users create global agent skills through the
-- server. The function is service-role only and supplies creator attribution
-- to the existing immutable version-history trigger.

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
  IF p_kind = 'model' AND (NULLIF(trim(p_model), '') IS NULL OR p_mode IS NULL) THEN
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

REVOKE ALL ON FUNCTION public.create_agent_skill(
  text, text, text, text, text, text, text[], text[], text[],
  text, text, jsonb, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_skill(
  text, text, text, text, text, text, text[], text[], text[],
  text, text, jsonb, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.create_agent_skill(
  text, text, text, text, text, text, text[], text[], text[],
  text, text, jsonb, text, uuid, text
) IS 'Creates an agent skill and records version 1 with the authenticated creator attribution supplied by the application server.';

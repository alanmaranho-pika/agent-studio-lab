-- History is available only through authenticated server functions. The
-- explicit deny policy documents that intent for RLS and security advisors.
CREATE POLICY "Skill history is server-only"
  ON public.agent_skill_versions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

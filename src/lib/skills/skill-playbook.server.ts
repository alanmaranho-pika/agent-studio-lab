import { supabaseAdmin } from "@/integrations/supabase/client.server";

const APP_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Return the user's live override for a built-in app playbook.
 * A missing row deliberately returns null so the bundled skill.md remains the
 * version-controlled fallback.
 */
export async function getSkillPlaybookOverride(
  userId: string,
  appId: string,
): Promise<string | null> {
  if (!APP_ID_RE.test(appId)) return null;

  const { data, error } = await supabaseAdmin
    .from("skill_playbook_overrides")
    .select("body_md")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .maybeSingle();

  if (error) {
    // Keep the bundled playbook usable during a rolling deploy in which the
    // application reaches production before its database migration does.
    console.warn(`[skills] live override unavailable for ${appId}: ${error.message}`);
    return null;
  }

  return data?.body_md?.trim() ? data.body_md : null;
}

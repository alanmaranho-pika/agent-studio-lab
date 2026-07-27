import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getUserDisplayProfile(userId: string): Promise<{
  avatarUrl: string | null;
  name: string | null;
}> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const fallbackName =
    process.env.SHARED_ACCOUNT_EMAIL?.split("@")[0]?.trim() || null;
  return {
    avatarUrl: (data?.avatar_url as string | null | undefined) ?? null,
    name: ((data?.display_name as string | null | undefined) ?? fallbackName) || null,
  };
}

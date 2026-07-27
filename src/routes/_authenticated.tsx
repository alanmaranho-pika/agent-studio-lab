import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { TopNav } from "@/components/top-nav";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { getSharedCredentials } from "@/lib/gate.functions";
import { configureBrowserAuth } from "@/integrations/supabase/client";

// No visible login form — the app signs into the shared account silently so
// RLS-protected server functions keep working. Deduped across concurrent
// route loads with a module-level promise.
let silentSignIn: Promise<void> | null = null;

function ensureSignedIn(): Promise<void> {
  if (!silentSignIn) {
    silentSignIn = (async () => {
      const { authUrl, email, password } = await getSharedCredentials();
      configureBrowserAuth(authUrl);
      const client = getBrowserSupabase();
      if (!client) throw new Error("Neon Auth client did not initialize");
      const { data } = await client.auth.getSession();
      if (data.session) return;
      try {
        let userId: string | null = null;
        const initialSignIn = await client.auth.signInWithPassword({ email, password });
        if (
          initialSignIn.error &&
          /invalid|credential|not found/i.test(initialSignIn.error.message)
        ) {
          const signup = await client.auth.signUp({
            email,
            password,
            options: { data: { name: email.split("@")[0] } },
          });
          if (signup.error && !/already|exists|registered/i.test(signup.error.message)) {
            throw signup.error;
          }
          if (signup.data.session) {
            userId = signup.data.user?.id ?? null;
          } else {
            const retrySignIn = await client.auth.signInWithPassword({ email, password });
            if (retrySignIn.error) throw retrySignIn.error;
            userId = retrySignIn.data.user.id;
          }
        } else {
          if (initialSignIn.error) throw initialSignIn.error;
          userId = initialSignIn.data.user.id;
        }
        const { initCreditsForUser } = await import(
          "@/components/v2/monetization/credits-store"
        );
        initCreditsForUser(userId);
      } catch (error) {
        console.error("[auth] silent sign-in failed", error);
        silentSignIn = null;
      }
    })();
  }
  return silentSignIn;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => ensureSignedIn(),
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Inside a project the ProjectChrome (agent shell) owns ALL navigation —
  // no hover sidebar; the only way out is the chrome's nav logo.
  const inStudio = pathname.startsWith("/studio");
  if (inStudio) return <Outlet />;

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* Horizontal top nav for the top-level pages (Projects / Library /
          Skills / Blocks). Replaces the old left rail. */}
      <TopNav />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

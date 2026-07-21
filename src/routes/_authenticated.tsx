import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { TopNav } from "@/components/top-nav";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { getSharedCredentials } from "@/lib/gate.functions";

// No visible login form — the app signs into the shared account silently so
// RLS-protected server functions keep working. Deduped across concurrent
// route loads with a module-level promise.
let silentSignIn: Promise<void> | null = null;

function ensureSignedIn(): Promise<void> {
  const client = getBrowserSupabase();
  if (!client) return Promise.resolve();
  if (!silentSignIn) {
    silentSignIn = (async () => {
      const { data } = await client.auth.getSession();
      if (data.session) return;
      try {
        const { email, password } = await getSharedCredentials();
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
          Blocks). Replaces the old left rail. */}
      <TopNav />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

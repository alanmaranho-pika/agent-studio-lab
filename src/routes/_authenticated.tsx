import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SideNav } from "@/components/side-nav";
import chromeLogo from "@/assets/logo.png";
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
  return (
    <div className="relative flex h-screen w-full bg-background">
      {/* Detached chrome logo — always visible, aligns with the nav's
          brand slot when the rail slides in. */}
      <div className="pointer-events-none absolute left-3 top-7 z-50 flex w-[80px] justify-center">
        <img
          src={chromeLogo}
          alt="Agent"
          className="h-10 w-10 object-contain drop-shadow-sm"
        />
      </div>

      {/* Hover-reveal left nav. The hit zone spans the full nav width
          (including its outer padding) so the rail opens as soon as the
          cursor enters that column. */}
      <div className="group/nav absolute inset-y-0 left-0 z-40">
        <div className="h-full w-[104px]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 -translate-x-full py-3 pl-3 pr-3 opacity-0 transition-all duration-200 group-hover/nav:pointer-events-auto group-hover/nav:translate-x-0 group-hover/nav:opacity-100"
        >
          <div className="h-full rounded-xl bg-white shadow-[0_8px_24px_-12px_rgba(40,30,15,0.15)]">
            <SideNav />
          </div>
        </div>
      </div>
      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SideNav } from "@/components/side-nav";
import chromeLogo from "@/assets/chrome-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // LOCAL MODE: password gate removed — the app is open, so no auth check /
  // redirect to /login here. Restore the beforeLoad below when re-enabling it.
  //
  // beforeLoad: async ({ location }) => {
  //   const client = getBrowserSupabase();
  //   if (!client) return;
  //   const { data } = await client.auth.getSession();
  //   if (!data.session) {
  //     throw redirect({ to: "/login", search: { redirect: location.href } });
  //   }
  // },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="relative flex h-screen w-full bg-background">
      {/* Detached chrome logo — always visible, aligns with the nav's
          brand slot when the rail slides in. */}
      <div className="pointer-events-none absolute left-3 top-7 z-50 flex w-[80px] justify-center">
        <img
          src={chromeLogo.url}
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { SiteGate } from "@/components/site-gate";
import { migrateLocalProjectsToCloud } from "@/lib/local-cloud-migration";
import { getBrowserSupabase } from "@/lib/supabase-browser";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <a
            href="/projects"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={async () => {
              await queryClient.resetQueries();
              await router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/projects"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pika Agent Studio" },
      { name: "description", content: "Talk to the Pika agent to storyboard, cast, render and edit — one turn at a time." },
      { property: "og:title", content: "Pika Agent Studio" },
      { property: "og:description", content: "Talk to the Pika agent to storyboard, cast, render and edit — one turn at a time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Pika Agent Studio" },
      { name: "twitter:description", content: "Talk to the Pika agent to storyboard, cast, render and edit — one turn at a time." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/889eef0f-3798-498d-87f0-305147b66d10/id-preview-94cb8da9--65994fc3-c38e-46dd-8c82-15918e8661d5.lovable.app-1784218066369.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/889eef0f-3798-498d-87f0-305147b66d10/id-preview-94cb8da9--65994fc3-c38e-46dd-8c82-15918e8661d5.lovable.app-1784218066369.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preload", href: "/fonts/Telka-Regular.otf", as: "font", type: "font/otf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/Telka-Medium.otf", as: "font", type: "font/otf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/Telka-Bold.otf", as: "font", type: "font/otf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/Telka-Extended-Regular.otf", as: "font", type: "font/otf", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/Telka-Extended-Bold.otf", as: "font", type: "font/otf", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const client = getBrowserSupabase();
    if (!client) return;

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void router.invalidate();
      if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      if (event === "SIGNED_IN" && session?.user?.id) {
        void migrateLocalProjectsToCloud(session.user.id);
      }
    });
    // Also run migration on hard refresh with an existing session.
    void client.auth.getSession().then(({ data: s }) => {
      if (s.session?.user?.id) void migrateLocalProjectsToCloud(s.session.user.id);
    }).catch((error) => console.warn("[auth] initial session unavailable", error));
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SiteGate>
        <Outlet />
      </SiteGate>
      <Toaster />
    </QueryClientProvider>
  );
}

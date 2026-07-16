import { createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Pika Agent" },
      { name: "description", content: "Your Pika Agent account details." },
      { property: "og:title", content: "Account — Pika Agent" },
      { property: "og:description", content: "Your Pika Agent account details." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const user = { name: "Local workspace", email: null, avatar: null };

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your profile and session.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            {user?.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">
              {user?.name ?? "Account"}
            </div>
            {user?.email && (
              <div className="truncate text-sm text-muted-foreground">
                {user.email}
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
          This workspace saves projects in this browser.
        </p>
      </div>
    </div>
  );
}

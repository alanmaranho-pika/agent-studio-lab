import { Link, useRouterState } from "@tanstack/react-router";
import { FolderOpen, Library } from "lucide-react";
import type { ComponentType } from "react";

import { AccountPopover } from "@/components/account-popover";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/logo.png.asset.json";

const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/library", label: "Library", icon: Library },
];

/** Left vertical navigation for the authenticated agent shell. */
export function SideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="flex h-full w-[80px] flex-col items-center py-4">
      <Link to="/projects" aria-label="Home" className="h-10 w-10">
        <img src={logoAsset.url} alt="Logo" className="h-10 w-10 object-contain" />
      </Link>

      <nav className="flex flex-1 flex-col items-stretch justify-center gap-5 self-stretch px-2">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group flex w-full flex-col items-center gap-2"
            >
              <span
                className={cn(
                  "relative grid h-12 w-12 place-items-center rounded-[38%] transition",
                  active
                    ? "bg-foreground text-background shadow-elegant"
                    : "text-foreground/60 group-hover:bg-muted group-hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium tracking-wide transition",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex w-full items-center justify-center pt-2">
        <AccountPopover />
      </div>
    </aside>
  );
}

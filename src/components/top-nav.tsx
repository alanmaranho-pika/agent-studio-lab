import { Link, useRouterState } from "@tanstack/react-router";
import { FolderOpen, Library, Blocks } from "lucide-react";
import type { ComponentType } from "react";

import { AccountPopover } from "@/components/account-popover";
import chromeLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/library", label: "Library", icon: Library },
  { to: "/blocks", label: "Blocks", icon: Blocks },
];

/** Horizontal top navigation for the authenticated (non-studio) pages. */
export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="flex h-16 w-full shrink-0 items-center justify-between px-4">
      <Link to="/projects" aria-label="Home" className="shrink-0">
        <img src={chromeLogo} alt="" className="h-9 w-9 object-contain" />
      </Link>

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                active
                  ? "bg-foreground text-background shadow-elegant"
                  : "text-foreground/60 hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <AccountPopover />
    </header>
  );
}

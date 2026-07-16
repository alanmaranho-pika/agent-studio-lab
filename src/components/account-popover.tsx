import { Link, useNavigate } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function AccountPopover() {
  const navigate = useNavigate();
  const user = { name: "Local workspace", email: null, avatar: null };

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={user?.name ?? user?.email ?? "Account"}
          className="grid h-10 w-10 place-items-center rounded-full transition hover:opacity-90"
        >
          <Avatar className="h-8 w-8">
            {user?.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
            <AvatarFallback>{initials || "U"}</AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64 p-2">
        <div className="px-2 py-2 border-b border-border mb-1">
          <p className="text-sm font-medium truncate">{user?.name ?? "Account"}</p>
          {user?.email && (
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          )}
        </div>
        <Button asChild variant="ghost" className="w-full justify-start gap-2">
          <Link to="/account">
            <UserCog className="h-4 w-4" />
            Account
          </Link>
        </Button>
        {/* Hosted-session controls are intentionally disabled for local mode. */}
      </PopoverContent>
    </Popover>
  );
}

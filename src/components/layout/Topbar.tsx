"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuLabel,
  MenuGroup,
} from "@/components/ui/menu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileSidebar } from "@/components/layout/Sidebar";
import { useAuthStore } from "@/stores/auth-store";
import { notify } from "@/lib/notify";
import { useNotificationStore } from "@/stores/notification-store";
import { formatRoleLabel } from "@/lib/utils";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const handleLogout = async () => {
    await logout();
    notify.info("Signed out", "See you next time.");
    router.push("/login");
  };

  // Search goes to the leads list (company / contact); Accounts doesn't use the leads list
  const canSearch = user?.role === "ADMIN" || user?.role === "MSP_TL" || user?.role === "SALES";
  const [query, setQuery] = useState("");
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/leads?search=${encodeURIComponent(q)}` : "/leads");
    setQuery("");
  };

  const displayName = user?.name ?? "User";
  const initials = user ? getInitials(user.name) : "??";
  const roleLabel = user ? formatRoleLabel(user.role) : "";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
      {/* Mobile menu */}
      <div className="md:hidden">
        <MobileSidebar />
      </div>

      {/* Search → leads list */}
      {canSearch ? (
        <form role="search" onSubmit={search} className="hidden flex-1 sm:flex">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search leads by company or contact"
              placeholder="Search leads by company or contact…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 bg-muted/50 border-transparent focus:border-border"
            />
          </div>
        </form>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}

      {/* Spacer for mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        {/* Mobile search button → the leads list, which has its own search box */}
        {canSearch && (
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search leads" onClick={() => router.push("/leads")}>
            <Search className="size-4" />
          </Button>
        )}

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications — opens the full page */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
          title="Notifications"
          onClick={() => router.push("/notifications")}
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white ring-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>

        {/* User menu */}
        <Menu>
          <MenuTrigger>
            <Button
              variant="ghost"
              className="relative ml-1 size-8 rounded-full p-0"
              aria-label="User menu"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-[#3B82F6] text-xs font-medium text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </MenuTrigger>
          <MenuContent align="end" sideOffset={8} className="w-56">
            <MenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {roleLabel}
                  {user?.email ? ` · ${user.email}` : ""}
                </span>
              </div>
            </MenuLabel>
            <MenuSeparator />
            {user?.role === "ADMIN" && (
              <>
                <MenuGroup>
                  <MenuItem onClick={() => router.push("/settings")}>
                    <SettingsIcon />
                    Company settings
                  </MenuItem>
                </MenuGroup>
                <MenuSeparator />
              </>
            )}
            <MenuItem variant="destructive" onClick={handleLogout}>
              <LogOut />
              Log out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

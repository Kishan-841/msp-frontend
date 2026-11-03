"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  BellRing,
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Building2,
  UserCog,
  Settings,
  ChevronLeft,
  Menu,
  PhoneCall,
  LogOut,
  Truck,
  Wallet,
  ScrollText,
} from "lucide-react";
import type { UserRole } from "@/types";
import { useTaskStore } from "@/stores/task-store";
import { cn, formatRoleLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface NavItemDef {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** If set, only these roles see this item. */
  roles?: UserRole[];
  adminOnly?: boolean;
}

const navItems: NavItemDef[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/follow-ups", label: "Follow-ups", icon: BellRing },
  { href: "/leads", label: "Leads", icon: Users, roles: ["ADMIN", "MSP_TL", "SALES"] },
  {
    href: "/my-leads",
    label: "Assigned Leads",
    icon: PhoneCall,
    roles: ["SALES", "ADMIN"],
  },
  { href: "/meetings", label: "Meetings", icon: Calendar, roles: ["ADMIN", "MSP_TL", "SALES"] },
  { href: "/quotes", label: "Quotes", icon: FileText, roles: ["ADMIN", "MSP_TL", "SALES"] },
  { href: "/purchase-orders", label: "Purchase Orders", icon: Truck },
  // Customers (invoices, receipts) and Vendors (bills, payments) — two tabs, each with ledgers
  { href: "/accounts", label: "Accounts", icon: Wallet, roles: ["ACCOUNTS", "MSP_TL", "ADMIN"] },
  { href: "/vendors", label: "Vendors", icon: Building2, roles: ["ADMIN", "MSP_TL", "ACCOUNTS"] },
  { href: "/users", label: "Users", icon: UserCog, adminOnly: true },
  { href: "/system-logs", label: "System log", icon: ScrollText, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({
  item,
  isActive,
  collapsed,
}: {
  item: NavItemDef;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const badge = useTaskStore((s) => s.badges[item.href] ?? 0);
  const badgeText = badge > 99 ? "99+" : String(badge);

  return (
    <Link
      href={item.href}
      title={badge ? `${item.label} — ${badge} waiting for you` : undefined}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        "text-slate-400 hover:bg-white/8 hover:text-white",
        isActive && "bg-[#3B82F6]/15 text-white",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon
        className={cn(
          "size-5 shrink-0",
          isActive ? "text-[#3B82F6]" : "text-slate-400"
        )}
      />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {badge > 0 &&
        (collapsed ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {badgeText}
          </span>
        ) : (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {badgeText}
          </span>
        ))}
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void; // mobile: close the sheet when a link is followed
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly && user?.role !== "ADMIN") return false;
    if (item.roles && !item.roles.includes(user?.role as UserRole)) return false;
    return true;
  });

  return (
    <div
      className="flex h-full flex-col"
      onClickCapture={(e) => {
        if (onNavigate && (e.target as HTMLElement).closest("a")) onNavigate();
      }}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-white/8",
          collapsed ? "justify-center px-2" : "gap-2 px-4"
        )}
      >
        {!collapsed && (
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8 shrink-0" priority />
            <span className="truncate text-lg font-semibold text-white">
              MSP CRM
            </span>
          </Link>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
          >
            <ChevronLeft
              className={cn(
                "size-5 transition-transform duration-300",
                collapsed && "rotate-180"
              )}
            />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavItems.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            isActive={
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            }
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* User + logout */}
      {user && (
        <div className="border-t border-white/8 px-3 py-3">
          {collapsed ? (
            <button
              type="button"
              onClick={handleLogout}
              title={`Log out (${user.name})`}
              aria-label="Log out"
              className="flex w-full items-center justify-center rounded-lg py-2 text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            >
              <LogOut className="size-5" />
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-[#3B82F6] text-xs font-medium text-white">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {formatRoleLabel(user.role)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                aria-label="Log out"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/8 hover:text-red-400"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "relative hidden h-screen flex-col border-r border-white/8 bg-[#111318] transition-all duration-300 md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Mobile: the menu button lives in the Topbar (MobileSidebar) */}
    </>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 bg-[#111318] p-0 text-white [&>[data-slot=sheet-close]]:text-white"
        showCloseButton={true}
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SidebarContent collapsed={false} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

import type { UserRole } from "@/types";

// Which roles may open each section — drives both the sidebar and the route guard.
// The API enforces the same rules; this just keeps people off pages they can't use.
// Sections not listed are open to every signed-in user.
export const PAGE_ROLES: Record<string, UserRole[]> = {
  "/leads": ["ADMIN", "MSP_TL", "SALES", "ACCOUNTS"], // Accounts: only via links to accepted deals
  "/my-leads": ["ADMIN", "SALES"],
  "/meetings": ["ADMIN", "MSP_TL", "SALES"],
  "/quotes": ["ADMIN", "MSP_TL", "SALES", "ACCOUNTS"], // Accounts: read-only, via links from POs / invoices
  "/accounts": ["ADMIN", "ACCOUNTS", "MSP_TL"],
  "/ledgers": ["ADMIN", "ACCOUNTS", "MSP_TL"],
  "/invoices": ["ADMIN", "ACCOUNTS", "MSP_TL", "SALES"], // Sales: their own deals' invoices
  "/vendors": ["ADMIN", "MSP_TL", "ACCOUNTS"],
  "/users": ["ADMIN"],
  "/team": ["ADMIN", "MSP_TL"], // per-person performance
};

export function canOpenPage(pathname: string, role?: UserRole | null): boolean {
  if (!role) return true; // auth not loaded yet — the auth provider handles signed-out users
  const section = Object.keys(PAGE_ROLES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return !section || PAGE_ROLES[section].includes(role);
}

import type { UserRole } from "@/types";

/**
 * May this user do the Sales steps on a lead (calls, meetings, MOM, send for quote, send the
 * quote / PO, record acceptance)? Admin always; otherwise only the person the lead is assigned
 * to — a Sales user, or an MSP TL who took the lead. Mirrors `canWorkAsSales` in the API.
 */
export function canWorkLead(
  user: { id?: string; role?: UserRole } | null | undefined,
  assignedToId: string | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return (user.role === "SALES" || user.role === "MSP_TL") && !!assignedToId && assignedToId === user.id;
}

/** Roles a lead can be assigned to */
export const ASSIGNABLE_ROLES: UserRole[] = ["SALES", "MSP_TL"];

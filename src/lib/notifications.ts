import {
  BadgeCheck,
  Bell,
  Calendar,
  CheckCircle,
  ClipboardList,
  FileCheck,
  FileText,
  PartyPopper,
  Repeat,
  Receipt,
  Sun,
  Truck,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

// Notification types (backend `type` field) → icon, colour and the filter group they belong to.

export type NotificationGroup = "leads" | "quotes" | "orders" | "accounts" | "reminders";

export const NOTIFICATION_GROUPS: { value: NotificationGroup; label: string }[] = [
  { value: "leads", label: "Leads & meetings" },
  { value: "quotes", label: "Quotes" },
  { value: "orders", label: "Purchase orders" },
  { value: "accounts", label: "Accounts" },
  { value: "reminders", label: "Reminders" },
];

const META: Record<string, { icon: LucideIcon; group: NotificationGroup; tone: string }> = {
  LEAD_NEW: { icon: Users, group: "leads", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  LEAD_ASSIGNED: { icon: UserPlus, group: "leads", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  MEETING_SCHEDULED: { icon: Calendar, group: "leads", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  MOM_ADDED: { icon: FileCheck, group: "leads", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  QUOTE_REQUESTED: { icon: ClipboardList, group: "quotes", tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
  QUOTE_SUBMITTED: { icon: FileText, group: "quotes", tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
  QUOTE_APPROVED: { icon: CheckCircle, group: "quotes", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  QUOTE_REJECTED: { icon: XCircle, group: "quotes", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  QUOTE_ACCEPTED: { icon: BadgeCheck, group: "quotes", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  PO_SUBMITTED: { icon: Truck, group: "orders", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  PO_CONFIRMED: { icon: CheckCircle, group: "orders", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  PO_REJECTED: { icon: XCircle, group: "orders", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  PO_SENT: { icon: Truck, group: "orders", tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  VENDOR_BILL: { icon: Receipt, group: "accounts", tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  INVOICE_RAISED: { icon: Receipt, group: "accounts", tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  DEAL_CLOSED: { icon: PartyPopper, group: "accounts", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  REPEAT_ORDER: { icon: Repeat, group: "leads", tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
  DAILY_DIGEST: { icon: Sun, group: "reminders", tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
};

export function notificationMeta(type: string) {
  return META[type] ?? { icon: Bell, group: "reminders" as NotificationGroup, tone: "bg-muted text-muted-foreground" };
}

/** Backend `types` filter for a group */
export function typesOfGroup(group: NotificationGroup): string[] {
  return Object.entries(META)
    .filter(([, m]) => m.group === group)
    .map(([t]) => t);
}

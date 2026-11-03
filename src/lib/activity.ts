import {
  Activity,
  BadgeCheck,
  Banknote,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  FileText,
  HandCoins,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  PhoneOff,
  Plug,
  PlusCircle,
  Receipt,
  ReceiptText,
  Repeat,
  Send,
  ShoppingCart,
  Sparkles,
  Tags,
  Trash2,
  Truck,
  UserPlus,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { formatINR, formatStatusLabel } from "@/lib/utils";
import type { LeadStatus } from "@/types";

// Turns the activity-log text the backend writes (ActivityLog.action) into a readable
// timeline entry: icon + colour + plain-English title + small detail chips.
// Works on the stored text, so old entries read better too. When the backend adds a new
// message, add a rule here — anything unmatched falls back to the raw text.

export interface ActivityView {
  icon: LucideIcon;
  tone: string;
  title: string;
  details: string[];
}

const TONE = {
  blue: "bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/25",
  cyan: "bg-cyan-50 text-cyan-600 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25",
  teal: "bg-teal-50 text-teal-600 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/25",
  sky: "bg-sky-50 text-sky-600 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
  red: "bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
  purple: "bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/25",
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25",
  amber: "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
  orange: "bg-orange-50 text-orange-600 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/25",
  violet: "bg-violet-50 text-violet-600 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  slate: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/25",
  muted: "bg-muted text-muted-foreground ring-border",
};

const money = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? formatINR(n) : s;
};
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
/** "(emailed to a@b.com)" / "(dev mode…)" notes → a chip */
const how = (note?: string) =>
  note
    ? [note.replace(/^emailed to /i, "Emailed to ").replace(/\s*[—-]\s*dev mode, not actually sent/i, " (test mode)")]
    : [];

type Rule = [RegExp, (m: RegExpMatchArray) => ActivityView];

const RULES: Rule[] = [
  // ── Lead ────────────────────────────────────────────────────────────────
  [/^Call logged \(([^)]+)\) — Outcome: ([^.]+)\.?\s*(.*)$/i, (m) => {
    const [, dur, outcome, rest] = m;
    const details = [`Call length ${dur.trim()}`];
    const callback = rest.match(/Callback scheduled for ([^.]+)/i);
    const meeting = rest.match(/Meeting at (.+?) on ([^.]+)/i);
    const reason = rest.match(/Reason:\s*(.+?)\.?$/i);
    const notes = rest.match(/Notes:\s*(.+?)\.?$/i);
    if (callback) details.push(`Call back ${callback[1].trim()}`);
    if (meeting) details.push(`${meeting[2].trim()} · ${meeting[1].trim()}`);
    if (reason) details.push(`Reason: ${reason[1].trim()}`);
    if (notes) details.push(notes[1].trim());
    const o = outcome.trim().toLowerCase();
    if (o.startsWith("meeting"))
      return { icon: Phone, tone: TONE.blue, title: "Called the customer — meeting fixed", details };
    if (o.startsWith("dropped"))
      return { icon: PhoneOff, tone: TONE.red, title: "Called the customer — lead dropped", details };
    return { icon: Phone, tone: TONE.blue, title: "Called the customer — will call back", details };
  }],
  [/^Lead created and categorized as (\w+) - (.+)$/i, (m) => ({
    icon: PlusCircle, tone: TONE.green, title: "Lead created",
    details: [titleCase(m[1]), m[2].trim()],
  })],
  [/^Lead received from (.+?)(?: by (.+))?$/i, (m) => ({
    icon: Plug, tone: TONE.green, title: `Lead received from ${m[1]}`, details: m[2] ? [`Submitted by ${m[2]}`] : [],
  })],
  [/^Lead created$/i, () => ({ icon: PlusCircle, tone: TONE.green, title: "Lead created", details: [] })],
  [/^Lead categorized as (\w+) - (.+)$/i, (m) => ({
    icon: Tags, tone: TONE.violet, title: `Lead marked as ${titleCase(m[1])}`, details: [m[2].trim()],
  })],
  [/^Lead category updated to (\S+) - (.+)$/i, (m) => ({
    icon: Tags, tone: TONE.violet, title: `Category changed to ${m[1] === "—" ? "none" : titleCase(m[1])}`, details: [m[2].trim()],
  })],
  [/^Lead assigned to (.+)$/i, (m) => ({
    icon: UserPlus, tone: TONE.amber, title: `Lead handed to ${m[1].trim()} (Sales)`, details: [],
  })],
  [/^Meeting scheduled for (.+?) at (.+)$/i, (m) => ({
    icon: Calendar, tone: TONE.cyan, title: "Meeting booked with the customer", details: [m[1].trim(), m[2].trim()],
  })],
  [/^Minutes of Meeting added/i, () => ({
    icon: ClipboardList, tone: TONE.teal, title: "Meeting notes (MOM) added", details: [],
  })],
  [/^Lead (sent to MSP TL for quote|pushed for quote.*)$/i, () => ({
    icon: FilePlus2, tone: TONE.blue, title: "Requirement sent to MSP TL for a quote", details: [],
  })],
  [/^New order #(\d+) started$/i, (m) => ({
    icon: Repeat, tone: TONE.blue, title: `Repeat order — order #${m[1]} started`, details: ["Same customer, back to Sales"],
  })],
  [/^Status changed to (\w+)$/i, (m) => ({
    icon: Activity, tone: TONE.slate, title: "Stage changed manually by Admin",
    details: [`Now: ${formatStatusLabel(m[1] as LeadStatus)}`],
  })],

  // ── Quote ───────────────────────────────────────────────────────────────
  [/^Quote (\S+) created$/i, (m) => ({ icon: FileText, tone: TONE.indigo, title: "Quote prepared", details: [m[1]] })],
  [/^Quote (\S+) submitted for approval$/i, (m) => ({
    icon: Send, tone: TONE.purple, title: "Quote sent to Admin for approval", details: [m[1]],
  })],
  [/^Quote (\S+) approved$/i, (m) => ({ icon: CheckCircle2, tone: TONE.green, title: "Quote approved by Admin", details: [m[1]] })],
  [/^Quote (\S+) rejected(?::\s*(.+))?$/i, (m) => ({
    icon: XCircle, tone: TONE.red, title: "Quote rejected by Admin — needs a new quote",
    details: [m[1], ...(m[2] ? [`Reason: ${m[2].trim()}`] : [])],
  })],
  [/^Quote (\S+) (?:marked as sent to customer|sent to customer(?: \((.+)\))?)$/i, (m) => ({
    icon: Mail, tone: TONE.sky, title: "Quote shared with the customer", details: [m[1], ...how(m[2])],
  })],
  [/^Quote (\S+) (?:re-sent to|shared with) (.+?)(?: \((.+)\))?$/i, (m) => ({
    icon: Mail, tone: TONE.sky, title: "Quote emailed to the customer again",
    details: [m[1], m[2].trim(), ...(m[3] ? ["test mode"] : [])],
  })],
  [/^Followed up on (quote|invoice) (\S+)$/i, (m) => ({
    icon: MessageSquarePlus, tone: TONE.blue, title: `Followed up with the customer on the ${m[1].toLowerCase()}`, details: [m[2]],
  })],
  [/^Customer accepted quote (\S+)(?: \(customer PO (.+)\))?$/i, (m) => ({
    icon: BadgeCheck, tone: TONE.green, title: "Customer accepted the quote",
    details: [m[1], ...(m[2] ? [`Customer PO ${m[2]}`] : [])],
  })],

  // ── Purchase order (vendor) ─────────────────────────────────────────────
  [/^PO (\S+) drafted for (.+)$/i, (m) => ({
    icon: ShoppingCart, tone: TONE.amber, title: `Purchase order prepared for ${m[2].trim()}`, details: [m[1]],
  })],
  [/^PO (\S+) sent to Accounts for confirmation$/i, (m) => ({
    icon: Send, tone: TONE.amber, title: "PO sent to Accounts for checking", details: [m[1]],
  })],
  [/^PO (\S+) confirmed by Accounts$/i, (m) => ({
    icon: CheckCircle2, tone: TONE.green, title: "Accounts approved the PO", details: [m[1]],
  })],
  [/^PO (\S+) rejected by Accounts$/i, (m) => ({
    icon: XCircle, tone: TONE.red, title: "Accounts sent the PO back for changes", details: [m[1]],
  })],
  [/^PO (\S+) sent to vendor(?: \((.+)\))?$/i, (m) => ({
    icon: Truck, tone: TONE.orange, title: "PO sent to the vendor", details: [m[1], ...how(m[2])],
  })],
  [/^PO (\S+) re-sent: (.+)$/i, (m) => ({
    icon: Truck, tone: TONE.orange, title: "PO emailed to the vendor again", details: [m[1], ...how(m[2])],
  })],
  [/^Vendor invoice (\S+)(?: \(vendor no\. (.+?)\))? recorded for (\S+) \(([\d.,]+)\)$/i, (m) => ({
    icon: ReceiptText, tone: TONE.orange, title: `Vendor's invoice recorded — ${money(m[4])}`,
    details: [m[1], ...(m[2] ? [`Vendor no. ${m[2]}`] : []), `For ${m[3]}`],
  })],
  [/^Vendor invoice (\S+) updated(?: \(vendor no\. (.+)\))?$/i, (m) => ({
    icon: Pencil, tone: TONE.slate, title: "Vendor invoice details updated", details: [m[1], ...(m[2] ? [`Vendor no. ${m[2]}`] : [])],
  })],
  [/^Vendor invoice (\S+) deleted$/i, (m) => ({
    icon: Trash2, tone: TONE.red, title: "Vendor invoice deleted (to be recorded again)", details: [m[1]],
  })],
  [/^Vendor payment (\S+): ([\d.,]+)(?: \+ TDS ([\d.,]+))? against (.+)$/i, (m) => ({
    icon: Banknote, tone: TONE.orange, title: `Paid the vendor ${money(m[2])}`,
    details: [m[1], `Against ${m[4]}`, ...(m[3] ? [`TDS deducted ${money(m[3])}`] : [])],
  })],

  // older wording (before vendor invoices got our PINV number / sales orders were removed)
  [/^Vendor invoice (\S+) recorded against (\S+)$/i, (m) => ({
    icon: ReceiptText, tone: TONE.orange, title: "Vendor's invoice recorded", details: [`Vendor no. ${m[1]}`, `For ${m[2]}`],
  })],
  [/^Sales order (\S+) created against (\S+)$/i, (m) => ({
    icon: FileText, tone: TONE.slate, title: "Sales order created (no longer used)", details: [m[1], `For ${m[2]}`],
  })],

  // ── Customer billing ────────────────────────────────────────────────────
  [/^Invoice (\S+) raised \(([\d.,]+)\)$/i, (m) => ({
    icon: Receipt, tone: TONE.teal, title: `Customer invoiced ${money(m[2])}`, details: [m[1]],
  })],
  [/^Receipt (\S+): ([\d.,]+)(?: \+ TDS ([\d.,]+))? against (.+)$/i, (m) => ({
    icon: Wallet, tone: TONE.green, title: `Customer paid ${money(m[2])}`,
    details: [m[1], `Against ${m[4]}`, ...(m[3] ? [`TDS by customer ${money(m[3])}`] : [])],
  })],
  [/^Advance (\S+) received: ([\d.,]+)$/i, (m) => ({
    icon: HandCoins, tone: TONE.green, title: `Advance received from the customer — ${money(m[2])}`, details: [m[1]],
  })],
  [/^Advance (\S+): ([\d.,]+) applied to (\S+)$/i, (m) => ({
    icon: HandCoins, tone: TONE.teal, title: `Advance of ${money(m[2])} adjusted against the invoice`, details: [m[1], `Against ${m[3]}`],
  })],
];

export function describeActivity(action: string): ActivityView {
  for (const [re, view] of RULES) {
    const m = action.match(re);
    if (m) return view(m);
  }
  return { icon: Sparkles, tone: TONE.muted, title: action, details: [] };
}

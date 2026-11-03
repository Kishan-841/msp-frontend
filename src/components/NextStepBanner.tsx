import Link from "next/link";
import { ArrowRight, ArrowUpRight, Hourglass, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadStatus, PurchaseOrderStatus, QuoteStatus, UserRole } from "@/types";

export interface NextStep {
  /** who acts next, e.g. "Admin" */
  actor: string;
  /** what they do, e.g. "Approve or reject this quote" */
  action: string;
  /** true when the signed-in user is the one who acts — highlights + points at the buttons */
  mine: boolean;
  done?: boolean;
  /** where the button lives, when it's on another page */
  href?: string;
  linkLabel?: string;
  /** where on this page to act (default: "use the buttons above") */
  where?: string;
}

/** One line under a record's header: whose turn it is and what to do. */
export function NextStepBanner({ step, className }: { step: NextStep | null; className?: string }) {
  if (!step) return null;
  const Icon = step.done ? PartyPopper : step.mine ? ArrowUpRight : Hourglass;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
        step.done
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
          : step.mine
            ? "bg-[#3B82F6]/10 text-foreground ring-1 ring-inset ring-[#3B82F6]/30"
            : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className={cn("size-4 shrink-0", step.mine && !step.done && "text-[#3B82F6]")} />
      <p>
        <span className="font-semibold">
          {step.done ? "Done" : step.mine ? "Your turn" : `Waiting for ${step.actor}`}
          {": "}
        </span>
        {step.action}
        {step.mine && !step.done && !step.href && (
          <span className="text-muted-foreground"> — {step.where ?? "use the buttons above"}.</span>
        )}
      </p>
      {step.href && (
        <Link
          href={step.href}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium",
            step.mine && !step.done
              ? "bg-[#3B82F6] text-white hover:bg-[#2563EB]"
              : "bg-background text-foreground ring-1 ring-border hover:bg-accent"
          )}
        >
          {step.linkLabel ?? "Open"} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

interface Viewer {
  id?: string;
  role?: UserRole;
}

const isAdmin = (v: Viewer) => v.role === "ADMIN";
const isTl = (v: Viewer) => v.role === "MSP_TL" || isAdmin(v);
const isAccounts = (v: Viewer) => v.role === "ACCOUNTS" || isAdmin(v);
const isAssignedSales = (v: Viewer, assignedToId?: string | null) =>
  isAdmin(v) || (v.role === "SALES" && !!v.id && v.id === assignedToId);

export function quoteNextStep(
  status: QuoteStatus,
  viewer: Viewer,
  ctx: { assignedToId?: string | null; hasPo: boolean }
): NextStep | null {
  switch (status) {
    case "DRAFT":
      return { actor: "MSP TL", action: "Finish the quote and Submit for Approval.", mine: isTl(viewer) };
    case "SUBMITTED":
      return { actor: "Admin", action: "Approve or Reject this quote.", mine: isAdmin(viewer) };
    case "APPROVED":
      return {
        actor: "the Sales person",
        action: "Email the quote to the customer, or Mark as Sent if you shared it another way.",
        mine: isAssignedSales(viewer, ctx.assignedToId),
      };
    case "SENT":
      return {
        actor: "the customer",
        action: "When the customer confirms, click Customer Accepted and enter their PO number.",
        mine: isAssignedSales(viewer, ctx.assignedToId),
      };
    case "ACCEPTED":
      return ctx.hasPo
        ? { actor: "", action: "Customer accepted and the PO is created — follow it on the PO page.", mine: false, done: true }
        : { actor: "MSP TL", action: "Create the PO to the vendor with the buying prices.", mine: isTl(viewer) };
    case "REJECTED":
      return { actor: "MSP TL", action: "Admin rejected this quote — create a new quote for the lead.", mine: isTl(viewer) };
    default:
      return null;
  }
}

export function poNextStep(
  status: PurchaseOrderStatus,
  viewer: Viewer,
  ctx: { assignedToId?: string | null; billPending: boolean; billUnpaid: boolean }
): NextStep | null {
  switch (status) {
    case "DRAFT":
      return { actor: "MSP TL", action: "Enter every buying price, then Send to Accounts.", mine: isTl(viewer) };
    case "REJECTED":
      return { actor: "MSP TL", action: "Fix what Accounts flagged, then Send to Accounts again.", mine: isTl(viewer) };
    case "PENDING_ACCOUNTS":
      return { actor: "Accounts", action: "Check the PO and Confirm or Reject it.", mine: isAccounts(viewer) };
    case "CONFIRMED":
      return {
        actor: "the Sales person",
        action: "Email the PO to the vendor, or Mark as Sent.",
        mine: isAssignedSales(viewer, ctx.assignedToId),
      };
    case "SENT_TO_VENDOR":
      if (ctx.billPending)
        return {
          actor: "Accounts",
          action: "When the vendor's invoice arrives, Record Vendor Invoice (we number it); raise the customer invoice in Accounts.",
          mine: isAccounts(viewer),
        };
      if (ctx.billUnpaid)
        return { actor: "Accounts", action: "Pay the vendor bill below when due.", mine: isAccounts(viewer) };
      return { actor: "", action: "PO sent and the vendor bill is paid.", mine: false, done: true };
    default:
      return null;
  }
}

/** The lead workspace: one banner for the whole deal, linking to the page where the next button is. */
export function leadNextStep(
  status: LeadStatus,
  viewer: Viewer,
  ctx: {
    assignedToId?: string | null;
    callbackAt?: string | null;
    quoteId?: string;
    poId?: string;
  }
): NextStep | null {
  const sales = isAssignedSales(viewer, ctx.assignedToId);
  const below = "see the highlighted step below";
  const quote = ctx.quoteId ? { href: `/quotes/${ctx.quoteId}`, linkLabel: "Open quote" } : {};
  const po = ctx.poId ? { href: `/purchase-orders/${ctx.poId}`, linkLabel: "Open PO" } : {};
  switch (status) {
    case "NEW":
      return { actor: "MSP TL", action: "Categorize this lead (Hardware / Software).", mine: isTl(viewer), href: "/leads?stage=categorize", linkLabel: "Leads to categorize" };
    case "CATEGORIZED":
      return { actor: "MSP TL", action: "Assign this lead to a Sales person.", mine: isTl(viewer), href: "/leads?stage=assign", linkLabel: "Leads to assign" };
    case "ASSIGNED":
      return ctx.callbackAt
        ? { actor: "the Sales person", action: `Call back on ${new Date(ctx.callbackAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} and log the outcome.`, mine: sales, where: below }
        : { actor: "the Sales person", action: "Call the customer and log the outcome.", mine: sales, where: below };
    case "MEETING_SCHEDULED":
    case "MEETING_DONE":
      return { actor: "the Sales person", action: "After the meeting, add the MOM.", mine: sales, where: below };
    case "MOM_ADDED":
      return { actor: "the Sales person", action: "Pick the final requirement and send the lead for a quote.", mine: sales, where: below };
    case "QUOTE_REQUESTED":
      return { actor: "MSP TL", action: "Build the quote.", mine: isTl(viewer), href: "/quotes?tab=pending", linkLabel: "Quote requests" };
    case "QUOTE_CREATED":
      return { actor: "MSP TL", action: "Submit the draft quote for approval.", mine: isTl(viewer), ...quote };
    case "QUOTE_SUBMITTED":
      return { actor: "Admin", action: "Approve or reject the quote.", mine: isAdmin(viewer), ...quote };
    case "QUOTE_REJECTED":
      return { actor: "MSP TL", action: "The quote was rejected — create a new one.", mine: isTl(viewer), ...quote };
    case "QUOTE_APPROVED":
      return { actor: "the Sales person", action: "Send the approved quote to the customer.", mine: sales, ...quote };
    case "QUOTE_SENT":
      return { actor: "the customer", action: "When they confirm, mark Customer Accepted on the quote.", mine: sales, ...quote };
    case "CUSTOMER_ACCEPTED":
      return ctx.poId
        ? { actor: "MSP TL", action: "Finish the PO (buying prices) and send it to Accounts.", mine: isTl(viewer), ...po }
        : { actor: "MSP TL", action: "Create the PO to the vendor.", mine: isTl(viewer), href: "/purchase-orders?tab=ready", linkLabel: "Ready for PO" };
    case "PO_PENDING_ACCOUNTS":
      return { actor: "Accounts", action: "Confirm or reject the PO.", mine: isAccounts(viewer), ...po };
    case "PO_CONFIRMED":
      return { actor: "the Sales person", action: "Send the confirmed PO to the vendor.", mine: sales, ...po };
    case "PO_SENT":
      return { actor: "Accounts", action: "Raise the customer invoice and add the vendor's bill details.", mine: isAccounts(viewer), href: "/accounts?side=customers&view=ready", linkLabel: "To invoice" };
    case "INVOICED":
      return { actor: "the customer", action: "Record receipts as the customer pays — the deal closes when everything is paid.", mine: isAccounts(viewer), href: "/accounts?side=customers&view=invoices", linkLabel: "Invoices" };
    case "DEAL_REGISTERED":
      return {
        actor: "",
        action: "Deal closed — fully invoiced and paid. If the customer orders again, use New Order (same lead, same details).",
        mine: false,
        done: true,
      };
    default:
      return null;
  }
}

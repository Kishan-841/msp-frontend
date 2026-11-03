// What each to-do count means, where to go to act on it, and which sidebar item it badges.
// Counts come from GET /tasks/counts (backend services/tasks.service.ts).

export type TaskKey =
  | "toCategorize"
  | "toAssign"
  | "toCall"
  | "callbacksDue"
  | "momPending"
  | "finalRequirement"
  | "quoteRequests"
  | "quoteDrafts"
  | "quotesToApprove"
  | "quotesToSend"
  | "awaitingAcceptance"
  | "readyForPo"
  | "posToFix"
  | "posToConfirm"
  | "posToSend"
  | "posToBill"
  | "billsToPay"
  | "dealsToInvoice"
  | "invoicesUnpaid"
  | "followUpsDue";

export interface TaskInfo {
  title: (n: number) => string;
  hint: string; // what to do there
  href: string; // exact page + tab
  section: string; // sidebar item it counts towards
  waiting?: boolean; // ball is in someone else's court — shown, but not badged
}

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const TASKS: Record<TaskKey, TaskInfo> = {
  quotesToApprove: {
    title: (n) => `${s(n, "quote")} waiting for your approval`,
    hint: "Open the quote and Approve or Reject it.",
    href: "/quotes?tab=done&status=SUBMITTED",
    section: "/quotes",
  },
  toCategorize: {
    title: (n) => `${s(n, "lead")} to categorize`,
    hint: "Pick Hardware / Software and the products.",
    href: "/leads?stage=categorize",
    section: "/leads",
  },
  toAssign: {
    title: (n) => `${s(n, "lead")} to assign to Sales`,
    hint: "Choose the Sales person who will call them.",
    href: "/leads?stage=assign",
    section: "/leads",
  },
  callbacksDue: {
    title: (n) => `${s(n, "callback")} due now`,
    hint: "Customers you promised to call back.",
    href: "/my-leads?tab=call_later",
    section: "/my-leads",
  },
  toCall: {
    title: (n) => `${s(n, "new lead")} to call`,
    hint: "Call, then log the outcome.",
    href: "/my-leads?tab=to_call",
    section: "/my-leads",
  },
  momPending: {
    title: (n) => `${s(n, "meeting")} without MOM`,
    hint: "Add the minutes of the meeting.",
    href: "/meetings?tab=overdue",
    section: "/meetings",
  },
  finalRequirement: {
    title: (n) => `${s(n, "lead")} need the final requirement`,
    hint: "Pick the products and send the lead to MSP TL for a quote.",
    href: "/meetings?tab=requirement",
    section: "/meetings",
  },
  quoteRequests: {
    title: (n) => `${s(n, "quote")} to build`,
    hint: "Sales sent these leads for a quote.",
    href: "/quotes?tab=pending",
    section: "/quotes",
  },
  quoteDrafts: {
    title: (n) => `${s(n, "draft quote")} not submitted`,
    hint: "Finish and submit them for Admin approval.",
    href: "/quotes?tab=done&status=DRAFT",
    section: "/quotes",
  },
  quotesToSend: {
    title: (n) => `${s(n, "approved quote")} to send to the customer`,
    hint: "Email it or mark it as sent.",
    href: "/quotes?tab=done&status=APPROVED",
    section: "/quotes",
  },
  awaitingAcceptance: {
    title: (n) => `${s(n, "quote")} waiting for the customer`,
    hint: "Mark Customer Accepted when they confirm.",
    href: "/quotes?tab=done&status=SENT",
    section: "/quotes",
    waiting: true,
  },
  readyForPo: {
    title: (n) => `${s(n, "accepted quote")} need a PO`,
    hint: "Create the PO and enter the vendor's buying prices.",
    href: "/purchase-orders?tab=ready",
    section: "/purchase-orders",
  },
  posToFix: {
    title: (n) => `${s(n, "PO")} in draft or rejected`,
    hint: "Fix and send to Accounts.",
    href: "/purchase-orders?tab=all",
    section: "/purchase-orders",
  },
  posToConfirm: {
    title: (n) => `${s(n, "PO")} waiting for your confirmation`,
    hint: "Check the PO and Confirm or Reject.",
    href: "/purchase-orders?tab=all&status=PENDING_ACCOUNTS",
    section: "/purchase-orders",
  },
  posToSend: {
    title: (n) => `${s(n, "confirmed PO")} to send to the vendor`,
    hint: "Email the PO or mark it as sent.",
    href: "/purchase-orders?tab=all&status=CONFIRMED",
    section: "/purchase-orders",
  },
  posToBill: {
    title: (n) => `${s(n, "PO")} awaiting the vendor invoice`,
    hint: "When the vendor's invoice arrives, record it (we give it a PINV number).",
    href: "/accounts?side=vendors&view=ready",
    section: "/accounts",
  },
  billsToPay: {
    title: (n) => `${s(n, "vendor invoice")} to pay`,
    hint: "Pay it from Accounts → Vendors → Vendor invoices.",
    href: "/accounts?side=vendors&view=bills",
    section: "/accounts",
  },
  dealsToInvoice: {
    title: (n) => `${s(n, "deal")} ready to invoice`,
    hint: "Raise the customer invoice.",
    href: "/accounts?side=customers&view=ready",
    section: "/accounts",
  },
  followUpsDue: {
    title: (n) => `${s(n, "customer follow-up")} due`,
    hint: "Quotes with no response for 3+ days, and overdue invoices.",
    href: "/follow-ups",
    section: "/follow-ups",
  },
  invoicesUnpaid: {
    title: (n) => `${s(n, "customer invoice")} unpaid`,
    hint: "Record receipts as customers pay.",
    href: "/accounts?side=customers&view=invoices",
    section: "/accounts",
    waiting: true,
  },
};

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { UserRole, LeadStatus, QuoteStatus, PurchaseOrderStatus, PaymentStatus } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  MSP_TL: "MSP TL",
  SALES: "Sales",
  ACCOUNTS: "Accounts",
}

export function formatRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CATEGORIZED: "Categorized",
  ASSIGNED: "Assigned",
  MEETING_SCHEDULED: "Meeting Scheduled",
  MEETING_DONE: "Meeting Done",
  MOM_ADDED: "MOM Added",
  QUOTE_REQUESTED: "Quote Requested",
  QUOTE_CREATED: "Quote Created",
  QUOTE_SUBMITTED: "Quote Submitted",
  QUOTE_APPROVED: "Quote Approved",
  QUOTE_REJECTED: "Quote Rejected",
  QUOTE_SENT: "Quote Sent",
  CUSTOMER_ACCEPTED: "Customer Accepted",
  PO_PENDING_ACCOUNTS: "PO with Accounts",
  PO_CONFIRMED: "PO Confirmed",
  PO_SENT: "PO Sent to Vendor",
  INVOICED: "Invoiced",
  DEAL_REGISTERED: "Deal Closed",
}

export function formatStatusLabel(status: LeadStatus): string {
  return STATUS_LABELS[status] ?? status
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  CATEGORIZED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ASSIGNED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  MEETING_SCHEDULED: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  MEETING_DONE: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  MOM_ADDED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  QUOTE_REQUESTED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  QUOTE_CREATED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  QUOTE_SUBMITTED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  QUOTE_APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  QUOTE_REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CUSTOMER_ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  QUOTE_SENT: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  PO_PENDING_ACCOUNTS: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  PO_CONFIRMED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  PO_SENT: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  INVOICED: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  DEAL_REGISTERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
}

export function getStatusColor(status: LeadStatus): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.NEW
}

const CATEGORY_COLORS: Record<string, string> = {
  HARDWARE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  SOFTWARE: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-700"
}

const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SENT: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

export function getQuoteStatusColor(status: QuoteStatus): string {
  return QUOTE_STATUS_COLORS[status] ?? QUOTE_STATUS_COLORS.DRAFT
}

const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent to customer",
  ACCEPTED: "Customer accepted",
}

export function formatQuoteStatusLabel(status: QuoteStatus): string {
  return QUOTE_STATUS_LABELS[status] ?? status
}

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  PENDING_ACCOUNTS: "With Accounts",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected by Accounts",
  SENT_TO_VENDOR: "Sent to vendor",
}

const PO_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PENDING_ACCOUNTS: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CONFIRMED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SENT_TO_VENDOR: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

export function formatPoStatusLabel(status: PurchaseOrderStatus): string {
  return PO_STATUS_LABELS[status] ?? status
}

export function getPoStatusColor(status: PurchaseOrderStatus): string {
  return PO_STATUS_COLORS[status] ?? PO_STATUS_COLORS.DRAFT
}

export const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
}

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  UNPAID: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  PARTIALLY_PAID: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

export const formatPaymentStatus = (s: PaymentStatus) => PAYMENT_STATUS_LABELS[s] ?? s
export const getPaymentStatusColor = (s: PaymentStatus) => PAYMENT_STATUS_COLORS[s] ?? ""

/** "HDFC Bank ·7244" — short bank + last 4 digits for lists */
export const shortBank = (bank?: string | null, account?: string | null) =>
  account ? `${bank ? `${bank} ` : ""}·${account.slice(-4)}` : null

export const apiErrorMessage = (err: unknown, fallback = "Something went wrong") =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

// Date + time in IST, e.g. 28 Oct 2026, 2:30 pm — use for meetings, callbacks, activity
export const formatDateTimeIN = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      })
    : "—"

// Dates shown in IST, e.g. 28 Oct 2026
export const formatDateIN = (d?: string | Date | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—"

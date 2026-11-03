"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  User as UserIcon,
  Calendar,
  ChevronRight,
  Building2,
  StickyNote,
  Receipt,
  Mail,
  Eye,
  Package,
  Wrench,
  BadgeCheck,
  Printer,
  RotateCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn, formatDateIN, formatINR } from "@/lib/utils";
import { canOpenPage } from "@/lib/pageAccess";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import { NextStepBanner, quoteNextStep } from "@/components/NextStepBanner";
import type { Quote, QuoteStatus } from "@/types";
import { QuoteDialog } from "../_components/QuoteDialog";
import { AcceptQuoteDialog } from "../_components/AcceptQuoteDialog";
import { PoDialog } from "@/app/(dashboard)/purchase-orders/_components/PoDialog";
import { AttachmentList } from "@/components/attachments/AttachmentList";

const STATUS_TONE: Record<QuoteStatus, string> = {
  DRAFT:
    "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30",
  SUBMITTED:
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  APPROVED:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  REJECTED:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  SENT:
    "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
  ACCEPTED:
    "bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/30",
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent to customer",
  ACCEPTED: "Customer accepted",
};

function StatusPill({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        STATUS_TONE[status]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function InfoItem({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="truncate text-sm font-medium text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  // "notfound" (deleted / not yours) vs "error" (network, server) — only the latter offers Retry
  const [loadError, setLoadError] = useState<"notfound" | "error" | null>(null);
  const hasLoaded = useRef(false);
  const [actionLoading, setActionLoading] = useState(false);
  const searchParams = useSearchParams();
  // "Reject" in the quotes list lands here with ?reject=1 so the reason can be entered
  const [rejectDialogOpen, setRejectDialogOpen] = useState(searchParams.get("reject") === "1");
  const [rejectionReason, setRejectionReason] = useState("");

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareRecipient, setShareRecipient] = useState("");
  const [sharePreviewHtml, setSharePreviewHtml] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);

  // MSP TL builds/edits, Admin approves, anyone on the lead marks it sent
  const canEdit = user?.role === "MSP_TL" || user?.role === "ADMIN";
  const canApprove = user?.role === "ADMIN";
  // Customer-facing steps (email, mark sent, customer accepted): the assigned Sales person or Admin
  const canShare = user?.role === "ADMIN" || user?.role === "SALES";

  const fetchQuote = useCallback(async () => {
    try {
      // spinner only on the first load — refreshes after actions keep the page on screen
      if (!hasLoaded.current) setLoading(true);
      const { data } = await api.get(`/quotes/${id}`);
      setQuote(data.data);
      setLoadError(null);
      hasLoaded.current = true;
    } catch (err) {
      const notFound = (err as { response?: { status?: number } })?.response?.status === 404;
      // a failed background refresh keeps what's on screen; only the first load shows the error
      if (!hasLoaded.current) setLoadError(notFound ? "notfound" : "error");
      if (!notFound) notify.apiError(err, "Couldn't load the quote");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Admin approved / Sales sent it / customer accepted elsewhere → this page follows
  useDataChanged(fetchQuote);

  const handleSubmitQuote = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/quotes/${id}/submit`);
      notify.success("Quote sent for approval", `${quote?.quoteNumber ?? "The quote"} — Admin will approve or reject it.`);
      fetchQuote();
    } catch (err) {
      notify.apiError(err, "Couldn't submit the quote");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/quotes/${id}/approve`);
      notify.success("Quote approved", `${quote?.quoteNumber ?? "The quote"} — Sales can now send it to the customer.`);
      fetchQuote();
    } catch (err) {
      notify.apiError(err, "Couldn't approve the quote");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkSent = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/quotes/${id}/mark-sent`);
      notify.success(
        "Quote marked as sent",
        `${quote?.quoteNumber ?? "The quote"} — mark Customer Accepted when ${quote?.lead?.companyName ?? "the customer"} confirms.`
      );
      fetchQuote();
    } catch (err) {
      notify.apiError(err, "Couldn't mark the quote as sent");
    } finally {
      setActionLoading(false);
    }
  };

  const openShareDialog = async () => {
    setShareMessage(null);
    setShareRecipient(quote?.lead?.email ?? "");
    setShareDialogOpen(true);
    try {
      const { data } = await api.post(`/quotes/${id}/share-email`, {
        previewOnly: true,
      });
      setSharePreviewHtml(data.data?.html ?? null);
    } catch {
      // preview only — sending still works; the dialog says the preview is unavailable
      setSharePreviewHtml(null);
      setShareMessage("Couldn't load the email preview — you can still send it.");
    }
  };

  const handleShareEmail = async () => {
    const to = shareRecipient || quote?.lead?.email || "the customer";
    const qn = quote?.quoteNumber ?? "The quote";
    setActionLoading(true);
    try {
      await notify.promise(
        api.post(`/quotes/${id}/share-email`, { recipient: shareRecipient || undefined }),
        {
          loading: `Emailing quote to ${to}…`,
          description: qn,
          // test mode (no mail server): it "worked" but nothing was delivered → warning
          success: (res) =>
            res.data?.data?.delivered === false
              ? {
                  type: "warning" as const,
                  title: "Email not actually sent",
                  description: `Test mode — no mail server configured. ${qn} is still marked as sent.`,
                }
              : { title: `Quote emailed to ${to}`, description: `${qn} — marked as sent to the customer.` },
          error: "Couldn't email the quote",
        }
      );
      setShareDialogOpen(false);
      setSharePreviewHtml(null);
      await fetchQuote();
    } catch {
      /* the promise toast already shows the reason; keep the dialog open to retry */
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setActionLoading(true);
      await api.patch(`/quotes/${id}/reject`, {
        reason: rejectionReason || undefined,
      });
      setRejectDialogOpen(false);
      notify.warning(
        "Quote rejected",
        `${quote?.quoteNumber ?? "The quote"}${rejectionReason.trim() ? ` — ${rejectionReason.trim()}.` : "."} MSP TL will prepare a new quote.`
      );
      setRejectionReason("");
      fetchQuote();
    } catch (err) {
      notify.apiError(err, "Couldn't reject the quote");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/quotes")}>
          <ArrowLeft className="size-4" />
          Back to Quotes
        </Button>
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          {loadError === "error" ? (
            <>
              <p>Couldn&apos;t load this quote — check your connection and try again.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  fetchQuote();
                }}
              >
                <RotateCw className="size-4" /> Retry
              </Button>
            </>
          ) : (
            <p>Quote not found — it may have been deleted, or it isn&apos;t one of yours.</p>
          )}
        </div>
      </div>
    );
  }

  const status = quote.status as QuoteStatus;
  const hasItems = quote.items && quote.items.length > 0;

  return (
    <div className="space-y-6 pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          onClick={() => router.push("/quotes")}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Quotes
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-mono font-medium text-foreground">
          {quote.quoteNumber}
        </span>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#3B82F6]/8 via-[#3B82F6]/3 to-transparent dark:from-[#3B82F6]/15" />

        <div className="relative p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white shadow-lg shadow-[#3B82F6]/20 ring-1 ring-white/20">
                <Receipt className="size-7" />
              </div>
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quote
                  </p>
                  <h1 className="mt-0.5 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
                    {quote.quoteNumber}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Created{" "}
                    {formatDistanceToNow(new Date(quote.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={status} />
                  {quote.lead &&
                    (canOpenPage(`/leads/${quote.leadId}`, user?.role) ? (
                      <button
                        onClick={() => router.push(`/leads/${quote.leadId}`)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent"
                      >
                        <Building2 className="size-3" />
                        {quote.lead.companyName}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
                        <Building2 className="size-3" />
                        {quote.lead.companyName}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {/* the quote as a document — print or Save as PDF to share outside email */}
              {hasItems && (
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(`/print/quotes/${quote.id}`, "_blank");
                    notify.info("Opening the quote PDF", "Use Print → Save as PDF to download it.");
                  }}
                >
                  <Printer className="size-4" />
                  PDF
                </Button>
              )}
              {status === "DRAFT" && canEdit && (
                <>
                  <Button
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => setEditOpen(true)}
                  >
                    Edit
                  </Button>
                  <Button onClick={handleSubmitQuote} disabled={actionLoading}>
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Submit for Approval
                  </Button>
                </>
              )}
              {status === "SUBMITTED" && canApprove && (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={actionLoading}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                </>
              )}
              {status === "APPROVED" && canShare && (
                <>
                  <Button
                    variant="outline"
                    onClick={openShareDialog}
                    disabled={actionLoading}
                  >
                    <Mail className="size-4" />
                    Email to Customer
                  </Button>
                  <Button onClick={handleMarkSent} disabled={actionLoading}>
                    {actionLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Mark as Sent
                  </Button>
                </>
              )}
              {status === "SENT" && canShare && (
                <Button onClick={() => setAcceptOpen(true)}>
                  <BadgeCheck className="size-4" />
                  Customer Accepted
                </Button>
              )}
              {status === "ACCEPTED" &&
                (quote.purchaseOrder ? (
                  canOpenPage(`/purchase-orders/${quote.purchaseOrder.id}`, user?.role) && <Button
                    variant="outline"
                    onClick={() => router.push(`/purchase-orders/${quote.purchaseOrder!.id}`)}
                  >
                    <Receipt className="size-4" />
                    View {quote.purchaseOrder.poNumber}
                  </Button>
                ) : (
                  canEdit && (
                    <Button onClick={() => setPoOpen(true)}>
                      <Plus className="size-4" />
                      Create PO
                    </Button>
                  )
                ))}
              {status === "REJECTED" && canEdit && (
                <Button
                  onClick={() =>
                    router.push(`/quotes?newForLead=${quote.leadId}`)
                  }
                >
                  <Plus className="size-4" />
                  Create New Quote
                </Button>
              )}
            </div>
          </div>

          <NextStepBanner
            className="mt-6"
            step={quoteNextStep(status, { id: user?.id, role: user?.role }, {
              assignedToId: quote.lead?.assignedToId,
              hasPo: !!quote.purchaseOrder,
            })}
          />

          {/* Meta grid */}
          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {quote.createdBy && (
              <InfoItem icon={UserIcon} label="Created By">
                {quote.createdBy.name}
              </InfoItem>
            )}
            <InfoItem icon={Calendar} label="Created">
              {formatDateIN(quote.createdAt)}
            </InfoItem>
            <InfoItem icon={Receipt} label="Total">
              <span className="text-base font-semibold tabular-nums">
                {formatINR(quote.totalAmount)}
              </span>
            </InfoItem>
            {quote.approvedBy && (status === "APPROVED" || status === "REJECTED") && (
              <InfoItem
                icon={status === "APPROVED" ? CheckCircle2 : XCircle}
                label={status === "APPROVED" ? "Approved By" : "Rejected By"}
              >
                {quote.approvedBy.name}
              </InfoItem>
            )}
            {status === "ACCEPTED" && quote.acceptedAt && (
              <InfoItem icon={BadgeCheck} label="Customer Accepted">
                {formatDateIN(quote.acceptedAt)}
                {quote.acceptedBy ? ` · ${quote.acceptedBy.name}` : ""}
              </InfoItem>
            )}
            {(status === "SENT" || status === "ACCEPTED") && quote.sentAt && (
              <InfoItem icon={Send} label="Sent to Customer">
                {formatDateIN(quote.sentAt)}
                {quote.sentBy ? ` · ${quote.sentBy.name}` : ""}
              </InfoItem>
            )}
          </div>
        </div>
      </div>

      {status === "ACCEPTED" && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/50 p-4 dark:border-green-500/20 dark:bg-green-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
            <BadgeCheck className="size-4" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-green-900 dark:text-green-200">
              Customer accepted — ready for PO to vendor
            </p>
            {(quote.customerPoNumber || quote.customerPoDate) && (
              <p className="mt-0.5 text-xs text-green-800/80 dark:text-green-300/80">
                Customer PO {quote.customerPoNumber ?? "—"}
                {quote.customerPoDate
                  ? ` · ${formatDateIN(quote.customerPoDate)}`
                  : ""}
              </p>
            )}
            {quote.acceptanceNote && (
              <p className="mt-1 whitespace-pre-wrap text-green-900/90 dark:text-green-200/90">
                {quote.acceptanceNote}
              </p>
            )}
            <div className="mt-3">
              <AttachmentList
                entityType="QUOTE_ACCEPTANCE"
                entityId={quote.id}
                canUpload={canShare}
                emptyText="No customer PO / confirmation attached."
              />
            </div>
          </div>
        </div>
      )}

      {/* Approval / rejection callouts */}
      {status === "APPROVED" && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Quote approved
            </p>
            {quote.approvedBy && (
              <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                Approved by {quote.approvedBy.name}
              </p>
            )}
          </div>
        </div>
      )}

      {status === "REJECTED" && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-500/20 dark:bg-rose-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            <XCircle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              Quote rejected
              {quote.approvedBy && (
                <span className="font-normal text-rose-800/80 dark:text-rose-300/80">
                  {" "}
                  by {quote.approvedBy.name}
                </span>
              )}
            </p>
            {quote.rejectionReason && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-rose-800/90 dark:text-rose-300/90">
                {quote.rejectionReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Line items */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-6 py-4">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Line Items</h2>
        </header>
        <div className="overflow-x-auto">
          {hasItems ? (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="w-24 px-4 py-3 text-left font-medium">HSN</th>
                  <th className="w-24 px-4 py-3 text-right font-medium">Qty</th>
                  <th className="w-32 px-4 py-3 text-right font-medium">Rate</th>
                  <th className="w-20 px-4 py-3 text-right font-medium">GST</th>
                  <th className="w-32 px-4 py-3 text-right font-medium">Taxable</th>
                  <th className="w-32 px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              {quote.items.map((req, ri) => (
                <tbody key={ri} className="divide-y divide-border border-b border-border">
                  <tr className="bg-indigo-50/60 dark:bg-indigo-500/10">
                    <td colSpan={6} className="px-4 py-2.5 font-semibold text-indigo-900 dark:text-indigo-200">
                      {req.name}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-indigo-900 dark:text-indigo-200">
                      {formatINR(req.total)}
                    </td>
                  </tr>
                  {req.items.map((it, ii) => (
                    <tr key={`i${ii}`} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium">
                          <Package className="size-3.5 shrink-0 text-muted-foreground" />
                          {it.make}
                          {it.description && (
                            <span className="font-normal text-muted-foreground">
                              — {it.description}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{it.hsnCode}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatINR(it.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {it.gstPercent}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatINR(it.taxableAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium tabular-nums">
                        {formatINR(it.total)}
                      </td>
                    </tr>
                  ))}
                  {req.services.map((sv, si) => (
                    <tr key={`s${si}`} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium">
                          <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
                          {sv.description}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatINR(sv.price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {sv.gstPercent}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatINR(sv.taxableAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium tabular-nums">
                        {formatINR(sv.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={6} className="px-4 pt-4 pb-1 text-right text-sm text-muted-foreground">
                    Subtotal (excl. GST)
                  </td>
                  <td className="px-4 pt-4 pb-1 text-right font-mono tabular-nums">
                    {formatINR(quote.subtotal)}
                  </td>
                </tr>
                <tr className="bg-muted/30">
                  <td colSpan={6} className="px-4 py-1 text-right text-sm text-muted-foreground">
                    GST
                  </td>
                  <td className="px-4 py-1 text-right font-mono tabular-nums">
                    {formatINR(quote.gstAmount)}
                  </td>
                </tr>
                <tr className="bg-muted/30">
                  <td colSpan={6} className="px-4 pt-1 pb-4 text-right text-sm font-semibold">
                    Grand total
                  </td>
                  <td className="px-4 pt-1 pb-4 text-right font-mono text-lg font-bold tabular-nums">
                    {formatINR(quote.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              No line items.
            </div>
          )}
        </div>
      </section>

      {/* Notes */}
      {quote.notes && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-6 py-4">
            <StickyNote className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Notes</h2>
          </header>
          <div className="p-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {quote.notes}
            </p>
          </div>
        </section>
      )}

      <PoDialog
        open={poOpen}
        onClose={() => setPoOpen(false)}
        quoteId={quote.id}
        onSuccess={(po) => router.push(`/purchase-orders/${po.id}`)}
      />

      <AcceptQuoteDialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        onSuccess={fetchQuote}
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        onCreatePo={() => setPoOpen(true)}
      />

      <QuoteDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={fetchQuote}
        quote={quote}
      />

      {/* Share via Email Dialog */}
      <Dialog
        open={shareDialogOpen}
        onOpenChange={(v) => {
          if (!v && !actionLoading) {
            setShareDialogOpen(false);
            setSharePreviewHtml(null);
            setShareMessage(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-5 text-[#3B82F6]" />
              Share Quote via Email
            </DialogTitle>
            <DialogDescription>
              Send quote{" "}
              <span className="font-mono font-medium">{quote.quoteNumber}</span>{" "}
              to {quote.lead?.companyName ?? "the customer"}. You can edit the
              recipient below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="shareRecipient">Recipient</Label>
              <Input
                id="shareRecipient"
                type="email"
                value={shareRecipient}
                onChange={(e) => setShareRecipient(e.target.value)}
                placeholder="customer@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Eye className="size-3" />
                Email Preview
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-border bg-muted/30">
                {sharePreviewHtml ? (
                  <iframe
                    title="Quote email preview"
                    srcDoc={sharePreviewHtml}
                    className="h-[360px] w-full"
                    sandbox=""
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating preview...
                  </div>
                )}
              </div>
            </div>

            {shareMessage && (
              <p className="rounded-md bg-muted px-3 py-2 text-center text-sm">
                {shareMessage}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShareDialogOpen(false);
                setSharePreviewHtml(null);
                setShareMessage(null);
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareEmail}
              disabled={actionLoading || !shareRecipient}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(val) => !val && setRejectDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Quote</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject quote{" "}
              <span className="font-mono font-medium">{quote.quoteNumber}</span>
              ? The quote creator will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="rejectionReason" className="text-muted-foreground">
              Rejection reason <span className="text-xs">(optional)</span>
            </Label>
            <Textarea
              id="rejectionReason"
              placeholder="Provide a reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={actionLoading}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                "Reject Quote"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

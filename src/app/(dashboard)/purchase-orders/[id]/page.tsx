"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Mail,
  Pencil,
  Send,
  Truck,
  AlertTriangle,
  Printer,
  Wallet,
  FileMinus,
  RotateCw,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { canWorkLead } from "@/lib/leadAccess";
import {
  formatINR,
  formatPaymentStatus,
  formatPoStatusLabel,
  getPaymentStatusColor,
  getPoStatusColor,
  shortBank,
  formatDateIN,
} from "@/lib/utils";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import { RecordBillDialog } from "@/components/accounts/RecordBillDialog";
import { NoteDialog } from "@/components/accounts/NoteDialog";
import { stateName } from "@/lib/gst";
import { useAuthStore } from "@/stores/auth-store";
import { canOpenPage } from "@/lib/pageAccess";
import { useDataChanged } from "@/hooks/useDataChanged";
import { NextStepBanner, poNextStep } from "@/components/NextStepBanner";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import type { PurchaseInvoice, PurchaseOrder, ReadyToBill } from "@/types";
import { PoDialog } from "../_components/PoDialog";
import { BillDialog } from "@/components/accounts/BillDialog";

// dates shown in IST
const fmtDate = (d?: string | null) => formatDateIN(d);

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const canBuild = role === "MSP_TL" || isAdmin;
  const isAccounts = role === "ACCOUNTS" || isAdmin;

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  // sending to the vendor: Admin, or whoever the lead is assigned to (Sales or an MSP TL)
  const canSend = canWorkLead(user, po?.lead?.assignedTo?.id);
  const [loading, setLoading] = useState(true);
  // "notfound" (deleted / not yours) vs "error" (network, server) — only the latter offers Retry
  const [loadError, setLoadError] = useState<"notfound" | "error" | null>(null);
  const hasLoaded = useRef(false);
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [editBill, setEditBill] = useState<PurchaseInvoice | null>(null);
  const [payBill, setPayBill] = useState<PurchaseInvoice | null>(null);
  const [noteBill, setNoteBill] = useState<PurchaseInvoice | null>(null);

  const fetchPo = useCallback(async () => {
    try {
      const { data } = await api.get(`/purchase-orders/${id}`);
      setPo(data.data);
      setLoadError(null);
      hasLoaded.current = true;
    } catch (err) {
      const notFound = (err as { response?: { status?: number } })?.response?.status === 404;
      // a failed background refresh keeps what's on screen; only the first load shows the error
      if (!hasLoaded.current || notFound) {
        setPo(null);
        setLoadError(notFound ? "notfound" : "error");
      }
      if (!notFound) notify.apiError(err, "Couldn't load the PO");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPo();
  }, [fetchPo]);

  // Accounts confirmed / Sales sent it / a vendor invoice was recorded elsewhere → follow along
  useDataChanged(fetchPo);

  const [recording, setRecording] = useState<ReadyToBill | null>(null);

  // What's left to invoice on this PO comes from the same list as Accounts → Vendors → Awaiting vendor invoice
  const openRecordBill = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/purchase-invoices/ready");
      const mine = (data.data as ReadyToBill[]).find((p) => p.id === id);
      if (mine) setRecording(mine);
      else notify.info("Nothing left to invoice", `Every line of ${po?.poNumber ?? "this PO"} already has a vendor invoice.`);
    } catch (err) {
      notify.apiError(err, "Couldn't open the vendor invoice form");
    } finally {
      setBusy(false);
    }
  };

  /** Runs a PO action, refreshes, and reports: `done` on success, the server's reason on failure */
  const run = async (fn: () => Promise<unknown>, done: () => void, failTitle: string) => {
    try {
      setBusy(true);
      await fn();
      await fetchPo();
      done();
      return true;
    } catch (err) {
      notify.apiError(err, failTitle);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** After the PO goes to the vendor: Accounts' next step is recording the vendor's invoice */
  const sentToVendor = (title: string, description: string) =>
    isAccounts
      ? notify.action(title, description, { label: "Record vendor invoice", onClick: openRecordBill })
      : notify.success(title, `${description} Accounts will record the vendor's invoice.`);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!po) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/purchase-orders")}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        {loadError === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">Couldn&apos;t load this purchase order — check your connection and try again.</p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                fetchPo();
              }}
            >
              <RotateCw className="size-4" /> Retry
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">Purchase order not found — it may have been deleted, or it isn&apos;t one of yours.</p>
        )}
      </div>
    );
  }

  const status = po.status;
  const invoices = po.purchaseInvoices ?? [];
  const billed = invoices.reduce((a, i) => a + i.totalAmount, 0);

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button onClick={() => router.push("/purchase-orders")} className="flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Purchase Orders
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-mono font-medium text-foreground">{po.poNumber}</span>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold">{po.poNumber}</h1>
              <Badge variant="secondary" className={getPoStatusColor(status)}>
                {formatPoStatusLabel(status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              For{" "}
              {canOpenPage(`/leads/${po.leadId}`, role) ? (
                <button className="font-medium text-foreground hover:underline" onClick={() => router.push(`/leads/${po.leadId}`)}>
                  {po.lead?.companyName}
                </button>
              ) : (
                <span className="font-medium text-foreground">{po.lead?.companyName}</span>
              )}{" "}
              · Quote{" "}
              {canOpenPage(`/quotes/${po.quoteId}`, role) ? (
                <button className="font-mono hover:underline" onClick={() => router.push(`/quotes/${po.quoteId}`)}>
                  {po.quote?.quoteNumber}
                </button>
              ) : (
                <span className="font-mono">{po.quote?.quoteNumber}</span>
              )}
              {po.quote?.customerPoNumber ? ` · Customer PO ${po.quote.customerPoNumber}` : ""}
            </p>
          </div>

          {/* Actions — each role only sees its step */}
          <div className="flex flex-wrap gap-2">
            {canBuild && (status === "DRAFT" || status === "REJECTED") && (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button
                  onClick={() =>
                    run(
                      () => api.patch(`/purchase-orders/${po.id}/submit`),
                      () => notify.success("PO sent to Accounts", `${po.poNumber} — Accounts will confirm or send it back.`),
                      "Couldn't send the PO to Accounts"
                    )
                  }
                  disabled={busy}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send to Accounts
                </Button>
              </>
            )}
            {isAccounts && status === "PENDING_ACCOUNTS" && (
              <>
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-400"
                  onClick={() => {
                    setRejectReason("");
                    setRejectOpen(true);
                  }}
                  disabled={busy}
                >
                  <XCircle className="size-4" /> Reject
                </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() =>
                    run(
                      () => api.patch(`/purchase-orders/${po.id}/confirm`),
                      () => notify.success("PO confirmed", `${po.poNumber} — Sales can now send it to ${po.vendor.name}.`),
                      "Couldn't confirm the PO"
                    )
                  }
                  disabled={busy}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Confirm PO
                </Button>
              </>
            )}
            {isAccounts && status === "SENT_TO_VENDOR" && billed < po.totalAmount - 0.5 && (
              <Button onClick={openRecordBill} disabled={busy}>
                <Receipt className="size-4" /> Record Vendor Invoice
              </Button>
            )}
            {canSend && status === "CONFIRMED" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRecipient(po.vendor.email);
                    setEmailOpen(true);
                  }}
                  disabled={busy}
                >
                  <Mail className="size-4" /> Email to Vendor
                </Button>
                <Button
                  onClick={() =>
                    run(
                      () => api.patch(`/purchase-orders/${po.id}/mark-sent`, {}),
                      () => sentToVendor(`PO sent to ${po.vendor.name}`, `${po.poNumber} is marked as sent.`),
                      "Couldn't mark the PO as sent"
                    )
                  }
                  disabled={busy}
                >
                  <Truck className="size-4" /> Mark as Sent
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                window.open(`/print/purchase-orders/${po.id}`, "_blank");
                notify.info("Opening the PDF", `${po.poNumber} opens in a new tab — use Print → Save as PDF.`);
              }}
            >
              <Printer className="size-4" /> PDF
            </Button>
          </div>
        </div>

        {status === "REJECTED" && po.rejectionReason && (
          <p className="mt-4 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Rejected by Accounts{po.confirmedBy ? ` (${po.confirmedBy.name})` : ""}: {po.rejectionReason}
          </p>
        )}
        <NextStepBanner
          className="mt-4"
          step={poNextStep(status, { id: user?.id, role: user?.role }, {
            assignedToId: po.lead?.assignedTo?.id,
            billPending: billed < po.totalAmount - 0.5, // vendor invoice not (fully) recorded yet
            billUnpaid: (po.purchaseInvoices ?? []).some((b) => b.paymentStatus !== "PAID"),
          })}
        />

        {/* Parties + timeline */}
        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Vendor">
            {po.vendor.name}
            <span className="block text-xs text-muted-foreground">
              {po.vendor.gstNumber ?? "No GSTIN"} · {stateName(po.vendor.state) ?? "—"}
            </span>
          </Info>
          <Info label="Created">
            {fmtDate(po.createdAt)}
            <span className="block text-xs text-muted-foreground">{po.createdBy?.name}</span>
          </Info>
          <Info label="Accounts">
            {po.confirmedAt && status !== "REJECTED" ? fmtDate(po.confirmedAt) : "—"}
            <span className="block text-xs text-muted-foreground">
              {status !== "REJECTED" ? po.confirmedBy?.name : ""}
            </span>
          </Info>
          <Info label="Sent to vendor">
            {fmtDate(po.sentAt)}
            <span className="block text-xs text-muted-foreground">{po.sentBy?.name}</span>
          </Info>
        </div>
      </div>

      {/* Lines */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Lines</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Buying rate</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground/80">Customer rate</th>
                <th className="px-4 py-3 text-right font-medium">GST</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {po.items.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.requirement}
                      {l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(l.rate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {l.customerRate !== undefined ? formatINR(l.customerRate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{l.gstPercent}%</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(l.taxableAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 border-t border-border p-6 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            {po.deliveryAddress && (
              <Info label="Deliver to">
                <span className="whitespace-pre-wrap">{po.deliveryAddress}</span>
              </Info>
            )}
            {po.expectedDeliveryDate && <Info label="Expected delivery">{fmtDate(po.expectedDeliveryDate)}</Info>}
            {po.notes && (
              <Info label="Terms / notes">
                <span className="whitespace-pre-wrap">{po.notes}</span>
              </Info>
            )}
          </div>
          <div className="space-y-1.5 self-end rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
            <Row label="Subtotal" value={po.subtotal} />
            {po.gstType === "INTRA" ? (
              <>
                <Row label="CGST" value={po.cgstAmount} />
                <Row label="SGST" value={po.sgstAmount} />
              </>
            ) : (
              <Row label="IGST" value={po.igstAmount} />
            )}
            <div className="flex justify-between border-t border-border pt-1.5">
              <span className="font-medium">PO total</span>
              <span className="text-lg font-semibold tabular-nums">{formatINR(po.totalAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Vendor invoices — Accounts' side (the API doesn't send them to Sales) */}
      {role !== "SALES" && (
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Vendor invoices</h2>
          {invoices.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Invoiced {formatINR(billed)} of {formatINR(po.totalAmount)}
            </span>
          )}
        </header>
        <div className="space-y-4 p-6">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {status === "SENT_TO_VENDOR"
                ? "No vendor invoice recorded yet — Accounts records it with Record Vendor Invoice when it arrives."
                : "Once the PO is sent, Accounts records the vendor's invoice here."}
            </p>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold">{inv.billNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(inv.invoiceDate)}
                      {inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ""}
                      {inv.vendorInvoiceNumber ? ` · vendor no. ${inv.vendorInvoiceNumber}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatINR(inv.totalAmount)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(inv.taxableAmount)} +{" "}
                      {inv.gstType === "INTRA"
                        ? `CGST ${formatINR(inv.cgstAmount)} + SGST ${formatINR(inv.sgstAmount)}`
                        : `IGST ${formatINR(inv.igstAmount)}`}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <Badge variant="secondary" className={getPaymentStatusColor(inv.paymentStatus)}>
                        {formatPaymentStatus(inv.paymentStatus)}
                      </Badge>
                      {inv.outstanding !== undefined && inv.outstanding > 0 && (
                        <span className="text-xs text-muted-foreground">{formatINR(inv.outstanding)} due</span>
                      )}
                    </div>
                    {isAccounts && (
                      <div className="mt-2 flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setEditBill(inv)}>
                          <Pencil className="size-3.5" /> Vendor invoice details
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNoteBill(inv)} title="Credit / debit note">
                          <FileMinus className="size-3.5" /> Credit / debit note
                        </Button>
                        {(inv.outstanding ?? 0) > 0 && (
                          <Button size="sm" onClick={() => setPayBill(inv)}>
                            <Wallet className="size-3.5" /> Pay
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {inv.notes && <p className="text-sm text-muted-foreground">{inv.notes}</p>}
                {(inv.allocations ?? []).length > 0 && (
                  <ul className="divide-y divide-border rounded-md border border-border text-xs">
                    {inv.allocations!.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                        <span className="font-mono">{a.payment?.number}</span>
                        <span className="text-muted-foreground">
                          {formatDateIN(a.payment?.paymentDate)} · {a.payment?.mode}
                          {shortBank(a.payment?.ourBankName, a.payment?.ourBankAccountNumber)
                            ? ` · from ${shortBank(a.payment?.ourBankName, a.payment?.ourBankAccountNumber)}`
                            : ""}
                          {shortBank(a.payment?.partyBankName, a.payment?.partyBankAccountNumber)
                            ? ` · to ${shortBank(a.payment?.partyBankName, a.payment?.partyBankAccountNumber)}`
                            : ""}
                        </span>
                        <span className="ml-auto tabular-nums">{formatINR(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <AttachmentList
                  entityType="PURCHASE_INVOICE"
                  entityId={inv.id}
                  canUpload={isAccounts}
                  emptyText="No vendor invoice file attached."
                />
              </div>
            ))
          )}
        </div>
      </section>
      )}

      {/* PO documents (e.g. vendor's acknowledgement) */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Documents</h2>
        </header>
        <div className="p-6">
          <AttachmentList entityType="PURCHASE_ORDER" entityId={po.id} canUpload emptyText="No documents yet." />
        </div>
      </section>

      {/* Dialogs */}
      <PoDialog open={editOpen} onClose={() => setEditOpen(false)} po={po} onSuccess={() => fetchPo()} />

      <BillDialog
        bill={editBill}
        title={`${po.vendor.name} · ${po.poNumber}`}
        onClose={() => setEditBill(null)}
        onSuccess={fetchPo}
      />

      <RecordBillDialog
        po={recording}
        onClose={() => setRecording(null)}
        onSuccess={() => {
          setRecording(null);
          fetchPo();
        }}
      />

      {payBill && (
        <PaymentDialog
          open
          onClose={() => setPayBill(null)}
          onSuccess={fetchPo}
          direction="OUT"
          party={{ id: po.vendorId, name: po.vendor.name }}
          invoice={{
            id: payBill.id,
            number: payBill.billNumber,
            outstanding: payBill.outstanding ?? payBill.totalAmount,
            taxable: payBill.taxableAmount,
            total: payBill.totalAmount,
          }}
        />
      )}
      {noteBill && (
        <NoteDialog
          open
          onClose={() => setNoteBill(null)}
          onSuccess={fetchPo}
          side="PURCHASE"
          invoice={{ id: noteBill.id, number: noteBill.billNumber }}
        />
      )}

      <Dialog open={rejectOpen} onOpenChange={(v) => !v && !busy && setRejectOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {po.poNumber}</DialogTitle>
            <DialogDescription>It goes back to MSP TL to fix and resubmit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              placeholder="e.g. Fortinet rate is higher than the last PO"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !rejectReason.trim()}
              onClick={async () => {
                const reason = rejectReason.trim();
                const ok = await run(
                  () => api.patch(`/purchase-orders/${po.id}/reject`, { reason }),
                  () => notify.warning("PO sent back to MSP TL", `${po.poNumber} — ${reason}. MSP TL will fix it and resend.`),
                  "Couldn't reject the PO"
                );
                if (ok) setRejectOpen(false);
              }}
            >
              Reject PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailOpen} onOpenChange={(v) => !v && !busy && setEmailOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email {po.poNumber} to vendor</DialogTitle>
            <DialogDescription>
              Sending marks the PO as sent. Accounts then records the vendor&apos;s invoice when it arrives.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="po-recipient">Recipient</Label>
            <Input id="po-recipient" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !recipient}
              onClick={async () => {
                const firstSend = status === "CONFIRMED";
                setBusy(true);
                try {
                  const res = await notify.promise(api.post(`/purchase-orders/${po.id}/share-email`, { recipient }), {
                    loading: `Emailing PO to ${recipient}…`,
                    description: `${po.poNumber} · ${po.vendor.name}`,
                    // test mode (no mail server): it "worked" but nothing was delivered → warning
                    success: (r) =>
                      r.data?.data?.delivered === false
                        ? {
                            type: "warning" as const,
                  title: "Email not actually sent",
                            description: `Test mode — no mail server configured. ${po.poNumber} is still ${firstSend ? "marked as sent" : "logged as re-sent"}.`,
                          }
                        : { title: `PO emailed to ${recipient}`, description: `${po.poNumber} · ${po.vendor.name}` },
                    error: "Couldn't email the PO",
                  });
                  setEmailOpen(false);
                  await fetchPo();
                  // first send moves the PO on — point Accounts at the next step
                  if (firstSend && res.data?.data?.delivered !== false && isAccounts) {
                    notify.action("Next: the vendor's invoice", `${po.poNumber} — record it when it arrives.`, {
                      label: "Record vendor invoice",
                      onClick: openRecordBill,
                    });
                  }
                } catch {
                  /* the promise toast shows the reason; the dialog stays open to retry */
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatINR(value)}</span>
    </div>
  );
}

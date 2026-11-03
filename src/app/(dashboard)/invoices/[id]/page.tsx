"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FileMinus, Loader2, Printer, RotateCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatDateIN, formatINR, formatPaymentStatus, getPaymentStatusColor, shortBank } from "@/lib/utils";
import { stateName } from "@/lib/gst";
import { useAuthStore } from "@/stores/auth-store";
import { canOpenPage } from "@/lib/pageAccess";
import { useDataChanged } from "@/hooks/useDataChanged";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import { NoteDialog } from "@/components/accounts/NoteDialog";
import type { SalesInvoice } from "@/types";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canAccount = user?.role === "ACCOUNTS" || user?.role === "ADMIN";

  const [inv, setInv] = useState<(SalesInvoice & { lead?: { id: string; companyName: string } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"notfound" | "error" | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const fetchInv = useCallback(async () => {
    try {
      const { data } = await api.get(`/invoices/${id}`);
      setInv(data.data);
      setLoadError(null);
    } catch (err) {
      // 404 = gone / not yours; anything else (network, session) is worth a retry
      const status = (err as { response?: { status?: number } }).response?.status;
      setLoadError(status === 404 ? "notfound" : "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInv();
  }, [fetchInv]);
  useDataChanged(fetchInv); // e.g. a receipt recorded elsewhere updates the balance here

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  if (!inv)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">
          {loadError === "notfound"
            ? "Invoice not found — it may have been removed, or it isn't on one of your deals."
            : "Couldn't load this invoice. Check your connection and try again."}
        </p>
        {loadError === "error" && (
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              fetchInv();
            }}
          >
            <RotateCw className="size-4" /> Retry
          </Button>
        )}
      </div>
    );

  // Back link: Accounts for those who use it; Sales go back to the deal instead
  const back = canOpenPage("/accounts", user?.role)
    ? { href: "/accounts?side=customers&view=invoices", label: "Accounts" }
    : canOpenPage("/leads", user?.role)
      ? { href: `/leads/${inv.leadId}/workspace`, label: inv.customerName }
      : null;

  const notes = inv.adjustmentNotes ?? [];
  const allocations = inv.allocations ?? [];

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {back && (
          <>
            <button onClick={() => router.push(back.href)} className="flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> {back.label}
            </button>
            <ChevronRight className="size-3.5" />
          </>
        )}
        <span className="font-mono font-medium text-foreground">{inv.invoiceNumber}</span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold">{inv.invoiceNumber}</h1>
              <Badge variant="secondary" className={getPaymentStatusColor(inv.paymentStatus)}>
                {formatPaymentStatus(inv.paymentStatus)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {inv.customerName} · {formatDateIN(inv.invoiceDate)}
              {inv.dueDate ? ` · due ${formatDateIN(inv.dueDate)}` : ""} ·{" "}
              <button className="font-mono hover:underline" onClick={() => router.push(`/quotes/${inv.quoteId}`)}>
                {inv.quote?.quoteNumber}
              </button>
              {inv.quote?.customerPoNumber ? ` · Customer PO ${inv.quote.customerPoNumber}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              GSTIN {inv.customerGstin ?? "Unregistered"} · Place of supply {inv.placeOfSupply}-{stateName(inv.placeOfSupply)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.open(`/print/invoices/${inv.id}`, "_blank");
                notify.info("Print view opened", "Use Print → Save as PDF in the new tab.");
              }}
            >
              <Printer className="size-4" /> PDF
            </Button>
            {canAccount && (
              <>
                <Button variant="outline" onClick={() => setNoteOpen(true)}>
                  <FileMinus className="size-4" /> Credit / Debit Note
                </Button>
                {inv.outstanding > 0 && (
                  <Button onClick={() => setPayOpen(true)}>
                    <Wallet className="size-4" /> Record Receipt
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">HSN/SAC</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
                <th className="px-4 py-3 text-right font-medium">GST</th>
                <th className="px-4 py-3 text-right font-medium">Taxable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inv.items.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{l.description}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{l.hsnCode ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(l.rate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{l.gstPercent}%</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(l.taxableAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-border p-6">
          <div className="w-80 space-y-1.5 text-sm">
            <Row label="Taxable value" value={inv.subtotal} />
            {inv.gstType === "INTRA" ? (
              <>
                <Row label="CGST" value={inv.cgstAmount} />
                <Row label="SGST" value={inv.sgstAmount} />
              </>
            ) : (
              <Row label="IGST" value={inv.igstAmount} />
            )}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Invoice total</span>
              <span className="tabular-nums">{formatINR(inv.totalAmount)}</span>
            </div>
            {notes.map((n) => (
              <Row
                key={n.id}
                label={`${n.kind === "CREDIT" ? "Credit" : "Debit"} note ${n.number}`}
                value={n.kind === "CREDIT" ? -n.totalAmount : n.totalAmount}
              />
            ))}
            {allocations.map((a) => (
              <Row key={a.id} label={`Received ${a.payment?.number}`} value={-a.amount} />
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <span>Outstanding</span>
              <span className="tabular-nums">{formatINR(inv.outstanding)}</span>
            </div>
          </div>
        </div>
      </section>

      {(notes.length > 0 || allocations.length > 0) && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">Receipts & notes</h2>
          </header>
          <ul className="divide-y divide-border text-sm">
            {allocations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="font-mono">{a.payment?.number}</span>
                <span className="text-muted-foreground">
                  {formatDateIN(a.payment?.paymentDate)} · {a.payment?.mode}
                  {a.payment?.reference ? ` ${a.payment.reference}` : ""}
                  {a.payment?.tdsAmount ? ` · TDS ${formatINR(a.payment.tdsAmount)}` : ""}
                  {shortBank(a.payment?.ourBankName, a.payment?.ourBankAccountNumber)
                    ? ` · into ${shortBank(a.payment?.ourBankName, a.payment?.ourBankAccountNumber)}`
                    : ""}
                  {shortBank(a.payment?.partyBankName, a.payment?.partyBankAccountNumber)
                    ? ` · from ${shortBank(a.payment?.partyBankName, a.payment?.partyBankAccountNumber)}`
                    : ""}
                </span>
                <span className="ml-auto tabular-nums">{formatINR(a.amount)}</span>
              </li>
            ))}
            {notes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="font-mono">{n.number}</span>
                <span className="text-muted-foreground">
                  {formatDateIN(n.noteDate)} · {n.kind === "CREDIT" ? "Credit" : "Debit"} note · {n.reason}
                </span>
                <span className="ml-auto tabular-nums">{formatINR(n.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canAccount && inv.lead && (
        <>
          <PaymentDialog
            open={payOpen}
            onClose={() => setPayOpen(false)}
            onSuccess={fetchInv}
            direction="IN"
            party={{ id: inv.leadId, name: inv.customerName }}
            invoice={{
              id: inv.id,
              number: inv.invoiceNumber,
              outstanding: inv.outstanding,
              taxable: inv.subtotal,
              total: inv.totalAmount,
            }}
          />
          <NoteDialog
            open={noteOpen}
            onClose={() => setNoteOpen(false)}
            onSuccess={fetchInv}
            side="SALES"
            invoice={{ id: inv.id, number: inv.invoiceNumber }}
          />
        </>
      )}
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/axios";
import { useDataChanged } from "@/hooks/useDataChanged";
import { notify } from "@/lib/notify";
import { formatDateIN, formatINR, formatPaymentStatus, getPaymentStatusColor, shortBank } from "@/lib/utils";
import { BillDialog } from "@/components/accounts/BillDialog";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import type { Payment, PaymentStatus, PurchaseInvoice, SalesInvoice } from "@/types";

// One row shape for vendor bills and customer invoices
type Doc = {
  id: string;
  number: string;
  vendorNo?: string | null; // vendor bills: the vendor's own invoice no.
  reference: string; // PO no. / quote no.
  link: string;
  date: string;
  dueDate?: string | null;
  total: number;
  outstanding: number;
  taxable: number;
  status: PaymentStatus;
  bill?: PurchaseInvoice;
};

/**
 * Party overview above the ledger: totals, then every bill/invoice with what's still owed
 * (and Pay / Vendor invoice details actions), then every payment with bank and TDS.
 */
export function PartyDocuments({
  kind,
  partyId,
  partyName,
  canRecord,
  onChanged,
  refreshKey = 0,
}: {
  kind: "customers" | "vendors";
  partyId: string;
  partyName: string;
  canRecord: boolean;
  onChanged: () => void;
  refreshKey?: number; // bump to refetch (e.g. after a payment recorded from the page header)
}) {
  const router = useRouter();
  const isVendor = kind === "vendors";
  const [docs, setDocs] = useState<Doc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paying, setPaying] = useState<Doc | null>(null);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        isVendor
          ? api.get("/purchase-invoices", { params: { vendorId: partyId } })
          : api.get("/invoices", { params: { leadId: partyId } }),
        api.get("/payments", { params: { direction: isVendor ? "OUT" : "IN", partyId } }),
      ]);
      setDocs(
        isVendor
          ? (d.data.data as PurchaseInvoice[]).map((b) => ({
              id: b.id,
              number: b.billNumber,
              vendorNo: b.vendorInvoiceNumber,
              reference: b.purchaseOrder?.poNumber ?? "",
              link: `/purchase-orders/${b.purchaseOrder?.id}`,
              date: b.invoiceDate,
              dueDate: b.dueDate,
              total: b.totalAmount,
              outstanding: b.outstanding ?? 0,
              taxable: b.taxableAmount,
              status: b.paymentStatus,
              bill: b,
            }))
          : (d.data.data as SalesInvoice[]).map((i) => ({
              id: i.id,
              number: i.invoiceNumber,
              reference: i.quote?.quoteNumber ?? "",
              link: `/invoices/${i.id}`,
              date: i.invoiceDate,
              dueDate: i.dueDate,
              total: i.totalAmount,
              outstanding: i.outstanding,
              taxable: i.subtotal,
              status: i.paymentStatus,
            }))
      );
      setPayments(p.data.data ?? []);
    } catch (err) {
      notify.apiError(err, isVendor ? "Couldn't load this vendor's bills" : "Couldn't load this customer's invoices");
    }
  }, [isVendor, partyId]);

  useEffect(() => {
    // fetch runs after the effect; state is only set once the requests resolve
    const t = setTimeout(fetchAll, 0);
    return () => clearTimeout(t);
  }, [fetchAll, refreshKey]);
  useDataChanged(fetchAll);

  const changed = () => {
    fetchAll();
    onChanged();
  };

  const billed = docs.reduce((a, d) => a + d.total, 0);
  const owed = docs.reduce((a, d) => a + Math.max(0, d.outstanding), 0);
  const cash = payments.reduce((a, p) => a + p.amount, 0);
  const tds = payments.reduce((a, p) => a + p.tdsAmount, 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // IST, for "overdue"

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={isVendor ? "Billed by vendor" : "Invoiced"} value={billed} />
        <Stat label={isVendor ? "Paid (cash)" : "Received (cash)"} value={cash} />
        <Stat label={isVendor ? "TDS deducted by us" : "TDS deducted by customer"} value={tds} />
        <Stat label={isVendor ? "Payable" : "Receivable"} value={owed} strong />
      </div>

      {/* Bills / invoices */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">
            {isVendor ? "Vendor invoices" : "Invoices"} <span className="font-normal text-muted-foreground">({docs.length})</span>
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{isVendor ? "Bill" : "Invoice"}</th>
                <th className="px-4 py-3 text-left font-medium">{isVendor ? "PO" : "Quote"}</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">{isVendor ? "Payable" : "Outstanding"}</th>
                {canRecord && <th className="w-44 px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    {isVendor ? "No vendor invoices recorded yet." : "No invoices yet."}
                  </td>
                </tr>
              ) : (
                docs.map((d) => {
                  const overdue = d.status !== "PAID" && d.dueDate && d.dueDate.slice(0, 10) < today;
                  return (
                    <tr key={d.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(d.link)}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono">{d.number}</span>
                        <p className="text-xs text-muted-foreground">
                          {formatDateIN(d.date)}
                          {d.vendorNo ? ` · vendor no. ${d.vendorNo}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{d.reference}</td>
                      <td className={overdue ? "px-4 py-2.5 font-medium text-destructive" : "px-4 py-2.5 text-muted-foreground"}>
                        {formatDateIN(d.dueDate)}
                        {overdue ? " · overdue" : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className={getPaymentStatusColor(d.status)}>
                          {formatPaymentStatus(d.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(d.total)}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatINR(d.outstanding)}</td>
                      {canRecord && (
                        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-1.5">
                            {d.bill && (
                              <Button size="icon-sm" variant="outline" aria-label="Vendor invoice details" title="Vendor invoice details" onClick={() => setEditing(d.bill!)}>
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {d.outstanding > 0 && (
                              <Button size="sm" onClick={() => setPaying(d)}>
                                <Wallet className="size-3.5" />
                                {isVendor ? "Pay" : "Receipt"}
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payments */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">
            {isVendor ? "Payments" : "Receipts"} <span className="font-normal text-muted-foreground">({payments.length})</span>
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Voucher</th>
                <th className="px-4 py-3 text-left font-medium">Mode</th>
                <th className="px-4 py-3 text-left font-medium">Bank</th>
                <th className="px-4 py-3 text-left font-medium">Against</th>
                <th className="px-4 py-3 text-right font-medium">Cash</th>
                <th className="px-4 py-3 text-right font-medium">TDS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No {isVendor ? "payments" : "receipts"} yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono">{p.number}</span>
                      <p className="text-xs text-muted-foreground">{formatDateIN(p.paymentDate)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {p.mode}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs leading-5">
                      <p>
                        <span className="text-muted-foreground">{isVendor ? "From " : "Into "}</span>
                        {shortBank(p.ourBankName, p.ourBankAccountNumber) ?? "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">{isVendor ? "To " : "From "}</span>
                        {shortBank(p.partyBankName, p.partyBankAccountNumber) ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {p.allocations.length === 0
                        ? "Advance"
                        : p.allocations
                            .map((a) => a.salesInvoice?.invoiceNumber ?? a.purchaseInvoice?.billNumber ?? "bill")
                            .join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(p.amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {p.tdsAmount ? `${formatINR(p.tdsAmount)} @${p.tdsPercent}%` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BillDialog
        bill={editing}
        title={`${partyName} · ${editing?.purchaseOrder?.poNumber ?? ""}`}
        onClose={() => setEditing(null)}
        onSuccess={changed}
      />
      {paying && (
        <PaymentDialog
          open
          onClose={() => setPaying(null)}
          onSuccess={changed}
          direction={isVendor ? "OUT" : "IN"}
          party={{ id: partyId, name: partyName }}
          invoice={{
            id: paying.id,
            number: paying.number,
            outstanding: paying.outstanding,
            taxable: paying.taxable,
            total: paying.total,
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={strong ? "text-xl font-semibold tabular-nums" : "text-lg tabular-nums"}>{formatINR(value)}</p>
    </div>
  );
}

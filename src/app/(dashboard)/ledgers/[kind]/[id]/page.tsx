"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Download, Loader2, RotateCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { downloadFile } from "@/lib/download";
import { cn, formatDateIN, formatINR } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useDataChanged } from "@/hooks/useDataChanged";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import type { LedgerEntry } from "@/types";
import { PartyDocuments } from "./_components/PartyDocuments";

type Ledger = {
  party: { id: string; companyName?: string; name?: string; customerGstin?: string | null; gstNumber?: string | null; stateName?: string | null };
  entries: LedgerEntry[];
  closingBalance: number;
};

const TYPE_LABEL: Record<LedgerEntry["type"], string> = {
  INVOICE: "Invoice", // shown as "Vendor invoice" on vendor ledgers
  CREDIT_NOTE: "Credit note",
  DEBIT_NOTE: "Debit note",
  RECEIPT: "Receipt",
  PAYMENT: "Payment",
  TDS: "TDS",
};

export default function PartyLedgerPage() {
  const { kind, id } = useParams<{ kind: "customers" | "vendors"; id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canRecord = user?.role === "ACCOUNTS" || user?.role === "ADMIN";
  const isCustomer = kind === "customers";

  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [loadError, setLoadError] = useState<"notfound" | "error" | null>(null);
  const [docsKey, setDocsKey] = useState(0); // refetch the invoices/payments section after a header payment

  const fetchLedger = useCallback(async () => {
    try {
      const { data } = await api.get(`/ledgers/${kind}/${id}`);
      setLedger(data.data);
      setLoadError(null);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setLoadError(status === 404 ? "notfound" : "error");
    } finally {
      setLoading(false);
    }
  }, [kind, id]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);
  useDataChanged(fetchLedger);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  if (!ledger)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">
          {loadError === "notfound" ? "Ledger not found." : "Couldn't load this ledger. Check your connection and try again."}
        </p>
        {loadError === "error" && (
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              fetchLedger();
            }}
          >
            <RotateCw className="size-4" /> Retry
          </Button>
        )}
      </div>
    );

  const name = ledger.party.companyName ?? ledger.party.name ?? "";
  const gstin = ledger.party.customerGstin ?? ledger.party.gstNumber;
  const totalDr = ledger.entries.reduce((a, e) => a + e.debit, 0);
  const totalCr = ledger.entries.reduce((a, e) => a + e.credit, 0);

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button onClick={() => router.push(`/accounts?side=${kind}`)} className="flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Accounts
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {isCustomer ? "Customer" : "Vendor"} ledger · GSTIN {gstin ?? "—"}
            {ledger.party.stateName ? ` · ${ledger.party.stateName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {isCustomer ? "Receivable" : "Payable"}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{formatINR(ledger.closingBalance)}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => downloadFile(`/ledgers/${kind}/${id}`, `ledger-${name}.csv`, { format: "csv" })}
          >
            <Download className="size-4" /> CSV
          </Button>
          {canRecord && (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet className="size-4" /> {isCustomer ? "Record Receipt" : "Record Payment"}
            </Button>
          )}
        </div>
      </div>

      <PartyDocuments
        refreshKey={docsKey}
        kind={kind}
        partyId={id}
        partyName={name}
        canRecord={canRecord}
        onChanged={fetchLedger}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Ledger</h2>
          <p className="text-xs text-muted-foreground">
            Every {isCustomer ? "invoice, receipt, TDS and note" : "bill, payment, TDS and note"} in date order, with running
            balance.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Doc no.</th>
                <th className="px-4 py-3 text-left font-medium">Particulars</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Credit</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No entries yet.
                  </td>
                </tr>
              ) : (
                ledger.entries.map((e, i) => (
                  <tr
                    key={i}
                    className={cn(e.link && "cursor-pointer hover:bg-muted/40")}
                    onClick={() => e.link && router.push(e.link)}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateIN(e.date)}</td>
                    <td className="px-4 py-2.5">{!isCustomer && e.type === "INVOICE" ? "Vendor invoice" : TYPE_LABEL[e.type]}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.number}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{e.debit ? formatINR(e.debit) : ""}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{e.credit ? formatINR(e.credit) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatINR(e.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-right">
                  Totals
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(totalDr)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(totalCr)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatINR(ledger.closingBalance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {canRecord && (
        <PaymentDialog
          open={payOpen}
          onClose={() => setPayOpen(false)}
          onSuccess={() => {
            fetchLedger();
            setDocsKey((k) => k + 1);
          }}
          direction={isCustomer ? "IN" : "OUT"}
          party={{ id, name }}
        />
      )}
    </div>
  );
}

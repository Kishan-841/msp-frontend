"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileWarning, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/axios";
import { formatDateIN, formatINR, formatPaymentStatus, getPaymentStatusColor } from "@/lib/utils";
import { RaiseInvoiceDialog } from "@/components/accounts/RaiseInvoiceDialog";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import type { PaymentStatus, ReadyToInvoice, SalesInvoice } from "@/types";
import { usePagedCount, usePagedList } from "./usePagedList";
import { BalancesTable, PaymentsTable } from "./shared";
import { CustomerTaxDialog, type TaxCustomer } from "./CustomerTaxDialog";

const VIEWS = ["ready", "invoices", "receipts", "balances"] as const;
type View = (typeof VIEWS)[number];
type StatusFilter = PaymentStatus | "OVERDUE" | "ALL";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partly paid" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
];

/**
 * Customer side: deals to invoice → invoices → receipts → balances / ledgers.
 * The sub-tab lives in the URL (?view=) so "next step" links and back/forward land on it.
 */
export function CustomerTab({
  canWrite,
  view: viewParam,
  onViewChange,
  refreshKey,
}: {
  canWrite: boolean;
  view: string | null;
  onViewChange: (v: View) => void;
  refreshKey: number;
}) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "ready";
  const [raising, setRaising] = useState<ReadyToInvoice | null>(null);
  const [receiptFor, setReceiptFor] = useState<SalesInvoice | null>(null);
  const [fixingTax, setFixingTax] = useState<TaxCustomer | null>(null);
  const [ourGstinMissing, setOurGstinMissing] = useState(false);
  const [localKey, setLocalKey] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const rk = refreshKey + localKey;

  // Only the open view's page is fetched (server-side paging, search and status)
  const ready = usePagedList<ReadyToInvoice>("/invoices/ready", {}, {
    enabled: view === "ready",
    refreshKey: rk,
    errorTitle: "Couldn't load deals to invoice",
  });
  const invoices = usePagedList<SalesInvoice>("/invoices", { status: status === "ALL" ? undefined : status }, {
    enabled: view === "invoices",
    refreshKey: rk,
    errorTitle: "Couldn't load customer invoices",
  });
  // pill counts from 1-row pages (cheap), whichever view is open
  const readyCount = usePagedCount("/invoices/ready", {}, rk);
  const unpaidCount = usePagedCount("/invoices", {}, rk, "unpaid");

  // our GSTIN — only for the reminder banner
  useEffect(() => {
    api
      .get("/settings/company")
      .then((c) => setOurGstinMissing(!c.data.data?.gstin))
      .catch(() => undefined);
  }, [rk]);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // IST

  const readyColumns: DataTableColumn<ReadyToInvoice>[] = useMemo(
    () => [
      {
        key: "customer",
        header: "Customer",
        cell: (d) => (
          <div>
            <p className="text-sm font-medium">{d.lead.companyName}</p>
            <p className="font-mono text-xs text-muted-foreground">{d.lead.customerGstin ?? "No GSTIN"}</p>
          </div>
        ),
      },
      {
        key: "deal",
        header: "Quote / customer PO",
        cell: (d) => (
          <div className="text-sm">
            <p className="font-mono">{d.quoteNumber}</p>
            <p className="text-xs text-muted-foreground">{d.customerPoNumber ? `Cust. PO ${d.customerPoNumber}` : "—"}</p>
          </div>
        ),
      },
      {
        key: "billed",
        header: "Invoiced so far",
        cell: (d) => (
          <span className="text-sm text-muted-foreground">
            {d.invoiceCount ? `${d.invoiceCount} invoice${d.invoiceCount === 1 ? "" : "s"}` : "None"}
          </span>
        ),
      },
      {
        key: "left",
        header: "Left to bill (incl. GST)",
        className: "text-right",
        headClassName: "text-right",
        cell: (d) => <span className="font-medium tabular-nums">{formatINR(d.remainingValue)}</span>,
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-48 text-right",
        className: "text-right",
        cell: (d) =>
          !canWrite ? null : d.lead.customerState ? (
            <Button size="sm" onClick={() => setRaising(d)}>
              <Receipt className="size-3.5" />
              Raise Invoice
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setFixingTax(d.lead)}>
              <FileWarning className="size-3.5" />
              Add customer GSTIN / state
            </Button>
          ),
      },
    ],
    [canWrite]
  );

  const invoiceColumns: DataTableColumn<SalesInvoice>[] = useMemo(
    () => [
      {
        key: "no",
        header: "Invoice",
        cell: (i) => (
          <div>
            <p className="font-mono text-sm font-medium">{i.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">{formatDateIN(i.invoiceDate)}</p>
          </div>
        ),
      },
      { key: "customer", header: "Customer", cell: (i) => <span className="text-sm">{i.customerName}</span> },
      {
        key: "due",
        header: "Due",
        cell: (i) => {
          const overdue = i.paymentStatus !== "PAID" && i.dueDate && i.dueDate.slice(0, 10) < today;
          return (
            <span className={overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
              {formatDateIN(i.dueDate)}
              {overdue ? " · overdue" : ""}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        cell: (i) => (
          <Badge variant="secondary" className={getPaymentStatusColor(i.paymentStatus)}>
            {formatPaymentStatus(i.paymentStatus)}
          </Badge>
        ),
      },
      {
        key: "total",
        header: "Total",
        className: "text-right",
        headClassName: "text-right",
        cell: (i) => <span className="tabular-nums">{formatINR(i.totalAmount)}</span>,
      },
      {
        key: "outstanding",
        header: "Outstanding",
        className: "text-right",
        headClassName: "text-right",
        cell: (i) => <span className="font-medium tabular-nums">{formatINR(i.outstanding)}</span>,
      },
      {
        key: "actions",
        header: "",
        headClassName: "w-32 text-right",
        className: "text-right",
        cell: (i) =>
          canWrite && i.outstanding > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setReceiptFor(i);
              }}
            >
              <Wallet className="size-3.5" />
              Receipt
            </Button>
          ) : null,
      },
    ],
    [canWrite, today]
  );

  const refresh = () => setLocalKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <PillTabs
        tabs={[
          { value: "ready", label: "To invoice", count: readyCount },
          { value: "invoices", label: "Unpaid invoices", count: unpaidCount },
          { value: "receipts", label: "Receipts" },
          { value: "balances", label: "Balances" },
        ] as PillTab<View>[]}
        value={view}
        onChange={onViewChange}
      />

      {view === "ready" && ourGstinMissing && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Your company GSTIN isn&apos;t set yet — invoices can still be raised, but they&apos;ll print without it.{" "}
            {role === "ADMIN" ? (
              <Link href="/settings" className="font-medium underline underline-offset-4">
                Open Settings
              </Link>
            ) : (
              "Ask an Admin to add it."
            )}
          </p>
        </div>
      )}
      {view === "ready" && (
        <DataTable
          title="Deals ready to invoice"
          count={ready.total}
          columns={readyColumns}
          data={ready.items}
          getRowKey={(d) => d.id}
          loading={ready.loading}
          searchValue={ready.search}
          onSearchChange={ready.setSearch}
          searchPlaceholder="Search customer or quote no."
          {...ready.pagination}
          emptyMessage="Deals appear here once their PO has been sent to the vendor."
        />
      )}
      {view === "invoices" && (
        <DataTable
          title={
            <span>
              Customer invoices
              {!!unpaidCount && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{unpaidCount} unpaid</span>
              )}
            </span>
          }
          count={invoices.total}
          columns={invoiceColumns}
          data={invoices.items}
          getRowKey={(i) => i.id}
          loading={invoices.loading}
          searchValue={invoices.search}
          onSearchChange={invoices.setSearch}
          {...invoices.pagination}
          searchPlaceholder="Search invoice no. or customer"
          toolbar={
            <Select value={status} onValueChange={(v) => setStatus((v as StatusFilter) ?? "ALL")}>
              <SelectTrigger className="h-9 w-36" aria-label="Payment status">
                <SelectValue>{(v: string) => STATUS_FILTERS.find((f) => f.value === v)?.label ?? "All statuses"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          emptyMessage={invoices.search || status !== "ALL" ? "No invoices match." : "No invoices yet."}
          onRowClick={(i) => router.push(`/invoices/${i.id}`)}
        />
      )}
      {view === "receipts" && <PaymentsTable direction="IN" canWrite={canWrite} refreshKey={rk} />}
      {view === "balances" && <BalancesTable side="customers" refreshKey={rk} />}

      <CustomerTaxDialog customer={fixingTax} onClose={() => setFixingTax(null)} onSaved={refresh} />

      <RaiseInvoiceDialog
        deal={raising}
        onClose={() => setRaising(null)}
        onSuccess={(id) => router.push(`/invoices/${id}`)}
      />
      {receiptFor && (
        <PaymentDialog
          open
          onClose={() => setReceiptFor(null)}
          onSuccess={refresh}
          direction="IN"
          party={{ id: receiptFor.leadId, name: receiptFor.customerName }}
          invoice={{
            id: receiptFor.id,
            number: receiptFor.invoiceNumber,
            outstanding: receiptFor.outstanding,
            taxable: receiptFor.subtotal,
            total: receiptFor.totalAmount,
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDateIN, formatINR, shortBank } from "@/lib/utils";
import { AllocateDialog } from "@/components/accounts/AllocateDialog";
import type { Payment, PaymentDirection } from "@/types";
import { usePagedList } from "./usePagedList";

/** Receipts (IN) or vendor payments (OUT), with bank details and advance application */
export function PaymentsTable({
  direction,
  canWrite,
  refreshKey,
}: {
  direction: PaymentDirection;
  canWrite: boolean;
  refreshKey: number;
}) {
  const [allocating, setAllocating] = useState<Payment | null>(null);
  // one server page at a time; search covers voucher no., reference, customer / vendor
  const payments = usePagedList<Payment>("/payments", { direction }, {
    refreshKey,
    errorTitle: "Couldn't load payments",
  });

  const isIn = direction === "IN";
  const columns: DataTableColumn<Payment>[] = useMemo(
    () => [
      {
        key: "no",
        header: "Voucher",
        cell: (p) => (
          <div>
            <p className="font-mono text-sm font-medium">{p.number}</p>
            <p className="text-xs text-muted-foreground">{formatDateIN(p.paymentDate)}</p>
          </div>
        ),
      },
      {
        key: "party",
        header: isIn ? "Customer" : "Vendor",
        cell: (p) => <span className="text-sm">{p.lead?.companyName ?? p.vendor?.name}</span>,
      },
      {
        key: "mode",
        header: "Mode",
        cell: (p) => (
          <span className="text-sm text-muted-foreground">
            {p.mode}
            {p.reference ? ` · ${p.reference}` : ""}
          </span>
        ),
      },
      {
        key: "bank",
        header: "Bank",
        cell: (p) => (
          <div className="text-xs leading-5">
            <p>
              <span className="text-muted-foreground">{isIn ? "Into" : "From"} </span>
              {shortBank(p.ourBankName, p.ourBankAccountNumber) ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{isIn ? "From" : "To"} </span>
              {shortBank(p.partyBankName, p.partyBankAccountNumber) ?? "—"}
            </p>
          </div>
        ),
      },
      {
        key: "against",
        header: "Against",
        cell: (p) =>
          p.allocations.length === 0 ? (
            <span className="text-sm text-amber-600 dark:text-amber-400">Advance</span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {p.allocations
                .map((a) => a.salesInvoice?.invoiceNumber ?? a.purchaseInvoice?.billNumber ?? "vendor bill")
                .join(", ")}
            </span>
          ),
      },
      {
        key: "amount",
        header: "Amount",
        className: "text-right",
        headClassName: "text-right",
        cell: (p) => (
          <div className="tabular-nums">
            <p>{formatINR(p.amount)}</p>
            {p.tdsAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                + TDS {formatINR(p.tdsAmount)} @ {p.tdsPercent}%
              </p>
            )}
          </div>
        ),
      },
      {
        key: "unapplied",
        header: "Unapplied",
        className: "text-right",
        headClassName: "text-right",
        cell: (p) =>
          p.unallocated > 0 ? (
            <div className="flex items-center justify-end gap-2">
              <span className="tabular-nums text-amber-600 dark:text-amber-400">{formatINR(p.unallocated)}</span>
              {canWrite && (
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Apply to invoice"
                  title="Apply to invoice"
                  onClick={() => setAllocating(p)}
                >
                  <Link2 className="size-4" />
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
    ],
    [isIn, canWrite]
  );

  return (
    <>
      <DataTable
        title={isIn ? "Receipts from customers" : "Payments to vendors"}
        count={payments.total}
        columns={columns}
        data={payments.items}
        getRowKey={(p) => p.id}
        loading={payments.loading}
        searchValue={payments.search}
        onSearchChange={payments.setSearch}
        searchPlaceholder={isIn ? "Search voucher, reference or customer" : "Search voucher, reference or vendor"}
        {...payments.pagination}
        emptyMessage={payments.search ? "No payments match." : "Nothing recorded yet."}
      />
      {allocating && (
        <AllocateDialog open onClose={() => setAllocating(null)} onSuccess={payments.refetch} payment={allocating} />
      )}
    </>
  );
}

type Balance = { id: string; name: string; gstin?: string | null; total: number; settled: number; outstanding: number };

/** Per-party balances; a row opens that party's full ledger */
export function BalancesTable({ side, refreshKey }: { side: "customers" | "vendors"; refreshKey: number }) {
  const router = useRouter();
  const isCustomers = side === "customers";
  // one page of parties; the server works out each party's ledger only for that page
  const list = usePagedList<Record<string, unknown>>(`/ledgers/${side}`, {}, {
    refreshKey,
    errorTitle: "Couldn't load balances",
  });
  const rows: Balance[] = useMemo(
    () =>
      list.items.map((r) =>
        (isCustomers
          ? { id: r.id, name: r.companyName, gstin: r.customerGstin, total: r.invoiced, settled: r.received, outstanding: r.outstanding }
          : { id: r.id, name: r.name, gstin: r.gstNumber, total: r.billed, settled: r.paid, outstanding: r.outstanding }) as Balance
      ),
    [list.items, isCustomers]
  );

  const columns: DataTableColumn<Balance>[] = useMemo(
    () => [
      {
        key: "name",
        header: isCustomers ? "Customer" : "Vendor",
        cell: (r) => (
          <div>
            <p className="text-sm font-medium">{r.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.gstin ?? "—"}</p>
          </div>
        ),
      },
      {
        key: "total",
        header: isCustomers ? "Invoiced" : "Billed",
        className: "text-right",
        headClassName: "text-right",
        cell: (r) => <span className="tabular-nums">{formatINR(r.total)}</span>,
      },
      {
        key: "settled",
        header: isCustomers ? "Received (incl. TDS)" : "Paid (incl. TDS)",
        className: "text-right",
        headClassName: "text-right",
        cell: (r) => <span className="tabular-nums">{formatINR(r.settled)}</span>,
      },
      {
        key: "outstanding",
        header: isCustomers ? "Receivable" : "Payable",
        className: "text-right",
        headClassName: "text-right",
        cell: (r) => (
          <span className={r.outstanding < 0 ? "font-medium tabular-nums text-amber-600" : "font-medium tabular-nums"}>
            {formatINR(r.outstanding)}
            {r.outstanding < 0 ? " (advance)" : ""}
          </span>
        ),
      },
    ],
    [isCustomers]
  );

  // (overall receivable / payable totals are on Dashboard → Profit & insights; a page-only sum would mislead)
  return (
    <DataTable
      title={isCustomers ? "Customer balances" : "Vendor balances"}
      count={list.total}
      columns={columns}
      data={rows}
      getRowKey={(r) => r.id}
      loading={list.loading}
      searchValue={list.search}
      onSearchChange={list.setSearch}
      searchPlaceholder={isCustomers ? "Search customer" : "Search vendor"}
      {...list.pagination}
      emptyMessage={list.search ? "No match." : "No entries yet."}
      onRowClick={(r) => router.push(`/ledgers/${side}/${r.id}`)}
    />
  );
}

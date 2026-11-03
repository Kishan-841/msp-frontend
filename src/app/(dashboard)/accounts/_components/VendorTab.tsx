"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateIN, formatINR, formatPaymentStatus, getPaymentStatusColor } from "@/lib/utils";
import { BillDialog } from "@/components/accounts/BillDialog";
import { RecordBillDialog } from "@/components/accounts/RecordBillDialog";
import { PaymentDialog } from "@/components/accounts/PaymentDialog";
import type { PaymentStatus, PurchaseInvoice, ReadyToBill } from "@/types";
import { BalancesTable, PaymentsTable } from "./shared";
import { usePagedCount, usePagedList } from "./usePagedList";

const VIEWS = ["ready", "bills", "payments", "balances"] as const;
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
 * Vendor side: POs sent → record the vendor's invoice (our PINV no.) → payments → balances / ledgers.
 * The sub-tab lives in the URL (?view=).
 */
export function VendorTab({
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
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "ready";
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [recording, setRecording] = useState<ReadyToBill | null>(null);
  const [editing, setEditing] = useState<PurchaseInvoice | null>(null);
  const [paying, setPaying] = useState<PurchaseInvoice | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const rk = refreshKey + localKey;

  // Only the open view's page is fetched (server-side paging, search and status)
  const ready = usePagedList<ReadyToBill>("/purchase-invoices/ready", {}, {
    enabled: view === "ready",
    refreshKey: rk,
    errorTitle: "Couldn't load POs awaiting a vendor invoice",
  });
  const bills = usePagedList<PurchaseInvoice>("/purchase-invoices", { status: status === "ALL" ? undefined : status }, {
    enabled: view === "bills",
    refreshKey: rk,
    errorTitle: "Couldn't load vendor invoices",
  });
  const readyCount = usePagedCount("/purchase-invoices/ready", {}, rk);
  const unpaidCount = usePagedCount("/purchase-invoices", {}, rk, "unpaid");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // IST

  const columns: DataTableColumn<PurchaseInvoice>[] = useMemo(
    () => [
      {
        key: "vendor",
        header: "Vendor",
        cell: (b) => (
          <div>
            <p className="text-sm font-medium">{b.vendor?.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{b.purchaseOrder?.poNumber}</p>
          </div>
        ),
      },
      {
        key: "billNo",
        header: "Vendor invoice",
        cell: (b) => (
          <div>
            <p className="font-mono text-sm">{b.billNumber}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateIN(b.invoiceDate)}
              {b.vendorInvoiceNumber ? ` · vendor no. ${b.vendorInvoiceNumber}` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "due",
        header: "Due",
        cell: (b) => {
          const overdue = b.paymentStatus !== "PAID" && b.dueDate && b.dueDate.slice(0, 10) < today;
          return (
            <span className={overdue ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
              {formatDateIN(b.dueDate)}
              {overdue ? " · overdue" : ""}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        cell: (b) => (
          <Badge variant="secondary" className={getPaymentStatusColor(b.paymentStatus)}>
            {formatPaymentStatus(b.paymentStatus)}
          </Badge>
        ),
      },
      {
        key: "total",
        header: "Total",
        className: "text-right",
        headClassName: "text-right",
        cell: (b) => <span className="tabular-nums">{formatINR(b.totalAmount)}</span>,
      },
      {
        key: "outstanding",
        header: "Payable",
        className: "text-right",
        headClassName: "text-right",
        cell: (b) => <span className="font-medium tabular-nums">{formatINR(b.outstanding ?? 0)}</span>,
      },
      {
        key: "actions",
        header: "",
        headClassName: "w-40 text-right",
        className: "text-right",
        cell: (b) =>
          canWrite ? (
            <div className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button size="icon-sm" variant="outline" aria-label="Vendor invoice details" title="Vendor invoice details" onClick={() => setEditing(b)}>
                <Pencil className="size-4" />
              </Button>
              {(b.outstanding ?? 0) > 0 && (
                <Button size="sm" onClick={() => setPaying(b)}>
                  <Wallet className="size-3.5" />
                  Pay
                </Button>
              )}
            </div>
          ) : null,
      },
    ],
    [canWrite, today]
  );

  const refresh = () => setLocalKey((k) => k + 1);

  const readyColumns: DataTableColumn<ReadyToBill>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (p) => (
        <div>
          <p className="text-sm font-medium">{p.vendor.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{p.vendor.gstNumber ?? "No GSTIN"}</p>
        </div>
      ),
    },
    {
      key: "po",
      header: "PO",
      cell: (p) => (
        <div className="text-sm">
          <p className="font-mono">{p.poNumber}</p>
          <p className="text-xs text-muted-foreground">
            Sent {formatDateIN(p.sentAt)} · for {p.lead.companyName}
          </p>
        </div>
      ),
    },
    {
      key: "billed",
      header: "Recorded so far",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.billCount ? `${p.billCount} vendor invoice${p.billCount === 1 ? "" : "s"}` : "None"}
        </span>
      ),
    },
    {
      key: "left",
      header: "Not yet invoiced (incl. GST)",
      className: "text-right",
      headClassName: "text-right",
      cell: (p) => <span className="font-medium tabular-nums">{formatINR(p.remainingValue)}</span>,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-56 text-right",
      className: "text-right",
      cell: (p) =>
        canWrite ? (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); setRecording(p); }}>
            <Receipt className="size-3.5" />
            Record Vendor Invoice
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <PillTabs
        tabs={[
          { value: "ready", label: "Awaiting vendor invoice", count: readyCount },
          { value: "bills", label: "Vendor invoices to pay", count: unpaidCount },
          { value: "payments", label: "Payments" },
          { value: "balances", label: "Balances" },
        ] as PillTab<View>[]}
        value={view}
        onChange={onViewChange}
      />

      {view === "ready" && (
        <DataTable
          title="POs sent to vendors, waiting for their invoice"
          count={ready.total}
          columns={readyColumns}
          data={ready.items}
          getRowKey={(p) => p.id}
          loading={ready.loading}
          searchValue={ready.search}
          onSearchChange={ready.setSearch}
          searchPlaceholder="Search PO, vendor or customer"
          {...ready.pagination}
          emptyMessage="Nothing waiting — POs appear here once they're sent to the vendor."
          onRowClick={(p) => router.push(`/purchase-orders/${p.id}`)}
        />
      )}
      {view === "bills" && (
        <DataTable
          title={
            <span>
              Vendor invoices
              {!!unpaidCount && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{unpaidCount} to pay</span>
              )}
            </span>
          }
          count={bills.total}
          columns={columns}
          data={bills.items}
          getRowKey={(b) => b.id}
          loading={bills.loading}
          searchValue={bills.search}
          onSearchChange={bills.setSearch}
          {...bills.pagination}
          searchPlaceholder="Search PINV, vendor no., vendor or PO"
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
          emptyMessage={
            bills.search || status !== "ALL"
              ? "No vendor invoices match."
              : "No vendor invoices recorded yet — record them from Awaiting vendor invoice."
          }
          onRowClick={(b) => b.purchaseOrder && router.push(`/purchase-orders/${b.purchaseOrder.id}`)}
        />
      )}
      {view === "payments" && <PaymentsTable direction="OUT" canWrite={canWrite} refreshKey={rk} />}
      {view === "balances" && <BalancesTable side="vendors" refreshKey={rk} />}

      <BillDialog
        bill={editing}
        title={`${editing?.vendor?.name ?? ""} · ${editing?.purchaseOrder?.poNumber ?? ""}`}
        onClose={() => setEditing(null)}
        onSuccess={refresh}
      />
      <RecordBillDialog
        po={recording}
        onClose={() => setRecording(null)}
        onSuccess={() => {
          setRecording(null);
          refresh();
          onViewChange("bills"); // straight to the new vendor invoice, where Pay is
        }}
      />
      {paying && (
        <PaymentDialog
          open
          onClose={() => setPaying(null)}
          onSuccess={refresh}
          direction="OUT"
          party={{ id: paying.vendorId, name: paying.vendor?.name ?? "Vendor" }}
          invoice={{
            id: paying.id,
            number: paying.billNumber,
            outstanding: paying.outstanding ?? paying.totalAmount,
            taxable: paying.taxableAmount,
            total: paying.totalAmount,
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, FilePlus2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { canWorkLead } from "@/lib/leadAccess";
import { formatDateIN, formatINR, formatPoStatusLabel, getPoStatusColor } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import type { PurchaseOrder, PurchaseOrderStatus, Quote } from "@/types";
import { PoDialog } from "./_components/PoDialog";

type Tab = "ready" | "all";
type ReadyQuote = Quote & { lead: { id: string; companyName: string; contactPerson: string } };

const STATUSES: PurchaseOrderStatus[] = [
  "DRAFT",
  "PENDING_ACCOUNTS",
  "CONFIRMED",
  "REJECTED",
  "SENT_TO_VENDOR",
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canCreate = user?.role === "MSP_TL" || user?.role === "ADMIN";
  const canConfirm = user?.role === "ACCOUNTS" || user?.role === "ADMIN";
  const [confirming, setConfirming] = useState<string | null>(null);

  // Tab + status live in the URL, so badges / next-step links switch the view even on this page.
  // "Ready for PO" is MSP TL's work — other roles only get the PO list.
  const tab: Tab = canCreate && searchParams.get("tab") === "ready" ? "ready" : "all";
  const status = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  /** Update several URL params at once ("" removes a key) */
  const setParams = (changes: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    router.replace(`/purchase-orders?${sp.toString()}`);
  };
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  // the server sends one page at a time; totals drive the pager and the tab pills
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [posTotal, setPosTotal] = useState(0);
  const [ready, setReady] = useState<ReadyQuote[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createFor, setCreateFor] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  // a new search starts from page 1 (not on first load, so ?page= in a link survives)
  const lastSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (lastSearch.current === debouncedSearch) return;
    lastSearch.current = debouncedSearch;
    if (page !== 1) setParams({ page: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const hasLoaded = useRef(false);
  const fetchPos = useCallback(async () => {
    const active = tab === "all";
    try {
      // spinner only on the first load — later refreshes keep the list on screen
      if (active && !hasLoaded.current) setLoading(true);
      // on the other tab only the count is needed (limit 1)
      const { data } = await api.get("/purchase-orders", {
        params: active
          ? { page, limit: pageSize, status: status || undefined, search: debouncedSearch || undefined }
          : { page: 1, limit: 1 },
      });
      const r = data.data ?? {};
      if (active) {
        setPos(r.items ?? []);
        hasLoaded.current = true;
      }
      setPosTotal(r.total ?? 0);
    } catch (err) {
      notify.apiError(err, "Couldn't load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [tab, page, pageSize, status, debouncedSearch]);

  const fetchReady = useCallback(async () => {
    if (!canCreate) return; // MSP TL / Admin list
    const active = tab === "ready";
    try {
      const { data } = await api.get("/purchase-orders/ready", {
        params: active ? { page, limit: pageSize, search: debouncedSearch || undefined } : { page: 1, limit: 1 },
      });
      const r = data.data ?? {};
      if (active) setReady(r.items ?? []);
      setReadyTotal(r.total ?? 0);
    } catch (err) {
      notify.apiError(err, "Couldn't load quotes ready for a PO");
    } finally {
      if (active) setLoading(false);
    }
  }, [canCreate, tab, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchPos();
  }, [fetchPos]);
  useEffect(() => {
    fetchReady();
  }, [fetchReady]);

  // Accounts confirmed / Sales sent / a customer accepted → refresh in the background
  useDataChanged(() => {
    fetchPos();
    fetchReady();
  });

  const readyColumns: DataTableColumn<ReadyQuote>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Customer",
        cell: (q) => (
          <div>
            <p className="text-sm font-medium">{q.lead.companyName}</p>
            <p className="text-xs text-muted-foreground">{q.lead.contactPerson}</p>
          </div>
        ),
      },
      {
        key: "quote",
        header: "Quote",
        cell: (q) => <span className="font-mono text-sm">{q.quoteNumber}</span>,
      },
      {
        key: "customerPo",
        header: "Customer PO",
        cell: (q) => (
          <span className="text-sm text-muted-foreground">{q.customerPoNumber ?? "—"}</span>
        ),
      },
      {
        key: "accepted",
        header: "Accepted",
        cell: (q) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateIN(q.acceptedAt)}
          </span>
        ),
      },
      {
        key: "value",
        header: "Quote value",
        className: "text-right",
        headClassName: "text-right",
        cell: (q) => <span className="tabular-nums">{formatINR(q.totalAmount)}</span>,
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-36 text-right",
        className: "text-right",
        cell: (q) =>
          canCreate ? (
            <Button size="sm" onClick={() => setCreateFor(q.id)}>
              <FilePlus2 className="size-3.5" />
              Create PO
            </Button>
          ) : null,
      },
    ],
    [canCreate]
  );

  const columns: DataTableColumn<PurchaseOrder>[] = useMemo(
    () => [
      {
        key: "po",
        header: "PO",
        cell: (p) => (
          <div>
            <p className="font-mono text-sm font-medium">{p.poNumber}</p>
            <p className="text-xs text-muted-foreground">{p.quote?.quoteNumber}</p>
          </div>
        ),
      },
      {
        key: "vendor",
        header: "Vendor",
        cell: (p) => <span className="text-sm">{p.vendor?.name}</span>,
      },
      {
        key: "customer",
        header: "Customer",
        cell: (p) => <span className="text-sm text-muted-foreground">{p.lead?.companyName}</span>,
      },
      {
        key: "status",
        header: "Status",
        cell: (p) => (
          <Badge variant="secondary" className={getPoStatusColor(p.status)}>
            {formatPoStatusLabel(p.status)}
          </Badge>
        ),
      },
      {
        key: "total",
        header: "PO total",
        className: "text-right",
        headClassName: "text-right",
        cell: (p) => <span className="tabular-nums">{formatINR(p.totalAmount)}</span>,
      },
      {
        key: "actions",
        header: "",
        headClassName: "w-52 text-right",
        className: "text-right",
        cell: (p) => {
          // Accounts confirms right here; everything else opens the PO (rejecting needs a reason,
          // sending to the vendor has the email form)
          if (p.status === "PENDING_ACCOUNTS" && canConfirm) {
            return (
              <div className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={confirming === p.id}
                  onClick={async () => {
                    setConfirming(p.id);
                    try {
                      await api.patch(`/purchase-orders/${p.id}/confirm`);
                      notify.success("PO confirmed", `${p.poNumber} for ${p.vendor?.name ?? "the vendor"} — Sales can now send it to the vendor.`);
                      fetchPos();
                    } catch (err) {
                      notify.apiError(err, `Couldn't confirm ${p.poNumber}`);
                    } finally {
                      setConfirming(null);
                    }
                  }}
                >
                  <CheckCircle2 className="size-3.5" /> Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => router.push(`/purchase-orders/${p.id}`)}>
                  Review
                </Button>
              </div>
            );
          }
          const label =
            p.status === "CONFIRMED" && canWorkLead(user, p.lead?.assignedTo?.id)
              ? "Send to vendor"
              : (p.status === "DRAFT" || p.status === "REJECTED") && canCreate
                ? "Finish & send"
                : null;
          return label ? (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); router.push(`/purchase-orders/${p.id}`); }}>
              {label} <ArrowRight className="size-3.5" />
            </Button>
          ) : null;
        },
      },
    ],
    [canConfirm, canCreate, confirming, fetchPos, router, user]
  );


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
        <p className="text-sm text-muted-foreground">
          {user?.role === "ACCOUNTS"
            ? "Check and confirm POs, then record the vendor's invoice once a PO is sent."
            : user?.role === "SALES"
              ? "POs for your deals — send confirmed ones to the vendor."
              : "POs to vendors: MSP TL creates, Accounts confirms, Sales sends to the vendor."}
        </p>
      </div>

      {canCreate && (
        <PillTabs
          tabs={
            [
              { value: "ready", label: "Ready for PO", count: readyTotal },
              { value: "all", label: "Purchase Orders", count: posTotal },
            ] as PillTab<Tab>[]
          }
          value={tab}
          onChange={(t) => {
            setSearch("");
            setParams({ tab: t, page: "" });
          }}
        />
      )}

      {tab === "ready" ? (
        <DataTable
          title="Accepted quotes without a PO"
          count={readyTotal}
          columns={readyColumns}
          data={ready}
          getRowKey={(q) => q.id}
          loading={loading}
          emptyMessage={debouncedSearch ? "No accepted quote matches your search." : "Quotes appear here once the customer accepts them."}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search quote or customer..."
          total={readyTotal}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => setParams({ page: p > 1 ? String(p) : "" })}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setParams({ page: "" });
          }}
          onRowClick={(q) => router.push(`/quotes/${q.id}`)}
        />
      ) : (
        <DataTable
          title="Purchase Orders"
          count={posTotal}
          columns={columns}
          data={pos}
          getRowKey={(p) => p.id}
          loading={loading}
          emptyMessage={
            <span className="inline-flex items-center gap-2">
              <Truck className="size-4" /> {debouncedSearch || status ? "No purchase order matches these filters." : "No purchase orders yet."}
            </span>
          }
          total={posTotal}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => setParams({ page: p > 1 ? String(p) : "" })}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setParams({ page: "" });
          }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search PO, vendor or customer..."
          toolbar={
            <Select value={status || "ALL"} onValueChange={(v) => setParams({ status: !v || v === "ALL" ? "" : v, page: "" })}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatPoStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          onRowClick={(p) => router.push(`/purchase-orders/${p.id}`)}
        />
      )}

      <PoDialog
        open={!!createFor}
        onClose={() => setCreateFor(null)}
        quoteId={createFor ?? undefined}
        onSuccess={(po) => router.push(`/purchase-orders/${po.id}`)}
      />
    </div>
  );
}

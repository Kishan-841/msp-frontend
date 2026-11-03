"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Pencil,
  Send,
  CheckCircle2,
  XCircle,
  X,
  FilePlus2,
  Building2,
  BadgeCheck,
  Loader2,
} from "lucide-react";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatDateIN, formatINR, getQuoteStatusColor, formatQuoteStatusLabel } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import type {
  Quote,
  QuoteStatus,
  QuoteListResponse,
  Lead,
} from "@/types";
import { QuoteDialog } from "./_components/QuoteDialog";
import { AcceptQuoteDialog } from "./_components/AcceptQuoteDialog";

const ALL_STATUSES: QuoteStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SENT", "ACCEPTED"];

type QuotesTab = "pending" | "done";

export default function QuotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingLeads, setPendingLeads] = useState<Lead[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Tab, status, page and search live in the URL, so sidebar badges / toast "Open" / next-step
  // links switch the view even when you're already on this page.
  const urlTab = searchParams.get("tab") as QuotesTab | null;
  const statusFilter = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);
  const [pageSize, setPageSize] = useState(10);

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [acceptQuote, setAcceptQuote] = useState<Quote | null>(null);
  const [preselectedLeadId, setPreselectedLeadId] = useState<string | undefined>();

  // MSP TL builds quotes, Admin approves them
  const canCreate = user?.role === "ADMIN" || user?.role === "MSP_TL";
  // Customer-facing steps are Sales' (they only see quotes on their own leads)
  const canSell = user?.role === "ADMIN" || user?.role === "SALES";
  const canApprove = user?.role === "ADMIN";

  // Quote requests are MSP TL's work: it's their default tab when something is waiting.
  // Other roles only have the Created list.
  const activeTab: QuotesTab = !canCreate
    ? "done"
    : urlTab ?? (pendingLeads && pendingLeads.length > 0 ? "pending" : "done");

  // Handle newForLead query param from lead detail page
  useEffect(() => {
    const newForLead = searchParams.get("newForLead");
    if (newForLead) {
      setPreselectedLeadId(newForLead);
      setEditQuote(null);
      setQuoteDialogOpen(true);
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("newForLead");
      router.replace(`/quotes${sp.toString() ? `?${sp.toString()}` : ""}`);
    }
  }, [searchParams, router]);

  const updateUrlParams = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
      router.replace(`/quotes?${sp.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // typed search → URL (only when it actually changed, so ?page= survives the first load)
  useEffect(() => {
    if (debouncedSearch !== urlSearch) updateUrlParams({ search: debouncedSearch, page: "1" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // URL search changed from outside (link, Clear) → the input follows
  useEffect(() => {
    setSearch((s) => (s === urlSearch ? s : urlSearch));
    setDebouncedSearch((s) => (s === urlSearch ? s : urlSearch));
  }, [urlSearch]);

  const hasLoaded = useRef(false);
  const fetchQuotes = useCallback(async () => {
    try {
      // spinner only on the first load — later refreshes keep the table on screen
      if (!hasLoaded.current) setLoading(true);
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (urlSearch) params.search = urlSearch;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get("/quotes", { params });
      const result: QuoteListResponse = data.data ?? {
        quotes: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
      setQuotes(result.quotes);
      setTotal(result.total);
      hasLoaded.current = true;
    } catch (err) {
      notify.apiError(err, "Couldn't load quotes");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, urlSearch, statusFilter]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const fetchPendingLeads = useCallback(async () => {
    if (!canCreate) return; // the Quote requests tab is MSP TL / Admin work
    try {
      const { data } = await api.get("/leads/pending-quotes");
      setPendingLeads((data.data ?? []) as Lead[]);
    } catch {
      /* secondary list (Quote requests tab) — the main quotes load reports errors */
    }
  }, [canCreate]);

  useEffect(() => {
    fetchPendingLeads();
  }, [fetchPendingLeads]);

  // someone else approved / sent / requested a quote → refresh in the background
  useDataChanged(() => {
    fetchQuotes();
    fetchPendingLeads();
  });

  const handleCreateForLead = (leadId: string) => {
    setPreselectedLeadId(leadId);
    setEditQuote(null);
    setQuoteDialogOpen(true);
  };

  const handleStatusChange = (value: string | null) => {
    const v = !value || value === "ALL" ? "" : value;
    updateUrlParams({ status: v, page: "1" });
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    router.replace(urlTab ? `/quotes?tab=${urlTab}` : "/quotes");
  };

  const hasFilters = !!urlSearch || !!statusFilter;

  const handleEdit = (quote: Quote) => {
    setEditQuote(quote);
    setQuoteDialogOpen(true);
  };

  // Every list action reports back — a silent failure is how buttons "don't work"
  // The row's buttons are disabled while its action runs (no double approve / double send)
  const act = useCallback(
    async (id: string, call: () => Promise<unknown>, done: () => void, failTitle: string) => {
      setBusyId(id);
      try {
        await call();
        done();
        fetchQuotes();
      } catch (err) {
        notify.apiError(err, failTitle);
      } finally {
        setBusyId(null);
      }
    },
    [fetchQuotes]
  );

  const handleSubmitQuote = useCallback(
    (q: Quote) =>
      act(
        q.id,
        () => api.patch(`/quotes/${q.id}/submit`),
        () => notify.success("Quote sent for approval", `${q.quoteNumber} — Admin will approve or reject it.`),
        "Couldn't submit the quote"
      ),
    [act]
  );
  const handleApprove = useCallback(
    (q: Quote) =>
      act(
        q.id,
        () => api.patch(`/quotes/${q.id}/approve`),
        () => notify.success("Quote approved", `${q.quoteNumber} — Sales can now send it to the customer.`),
        "Couldn't approve the quote"
      ),
    [act]
  );
  const handleMarkSent = useCallback(
    (q: Quote) =>
      act(
        q.id,
        () => api.patch(`/quotes/${q.id}/mark-sent`),
        () =>
          notify.success(
            "Quote marked as sent",
            `${q.quoteNumber} — mark Customer Accepted when ${q.lead?.companyName ?? "the customer"} confirms.`
          ),
        "Couldn't mark the quote as sent"
      ),
    [act]
  );

  const pendingColumns: DataTableColumn<Lead>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Company",
        cell: (l) => (
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {l.companyName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {l.contactPerson}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        cell: (l) =>
          l.category ? (
            <span className="text-sm">
              {l.category === "HARDWARE" ? "Hardware" : "Software"}
              {l.subcategory && l.subcategory.length > 0 && (
                <span className="text-muted-foreground">
                  {" · "}
                  {l.subcategory.join(", ")}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "assignedTo",
        header: "Assigned To",
        cell: (l) => (
          <span className="text-sm text-muted-foreground">
            {l.assignedTo?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "requestedAt",
        header: "Requested",
        cell: (l) => (
          <div className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateIN(l.quoteRequestedAt)}
            {l.status === "QUOTE_REJECTED" && (
              <Badge variant="secondary" className="ml-2">
                Re-quote
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-40 text-right",
        className: "text-right",
        cell: (l) =>
          canCreate ? (
            <Button size="sm" onClick={() => handleCreateForLead(l.id)}>
              <FilePlus2 className="size-3.5" />
              Build Quote
            </Button>
          ) : null,
      },
    ],
    [canCreate]
  );

  const columns: DataTableColumn<Quote>[] = useMemo(
    () => [
      {
        key: "quoteNumber",
        header: "Quote #",
        cell: (q) => (
          <span className="font-mono text-sm font-medium">{q.quoteNumber}</span>
        ),
      },
      {
        key: "company",
        header: "Company",
        cell: (q) => (
          <span className="font-medium text-foreground">
            {q.lead?.companyName ?? "—"}
          </span>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        cell: (q) => (
          <span className="font-medium tabular-nums">
            {formatINR(q.totalAmount)}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (q) => (
          <Badge variant="secondary" className={getQuoteStatusColor(q.status)}>
            {formatQuoteStatusLabel(q.status)}
          </Badge>
        ),
      },
      {
        key: "createdBy",
        header: "Created By",
        cell: (q) => (
          <span className="text-muted-foreground">
            {q.createdBy?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "date",
        header: "Date",
        cell: (q) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDateIN(q.createdAt)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-48 text-right",
        className: "text-right",
        cell: (q) => {
          const busy = busyId === q.id;
          const spin = (icon: React.ReactNode) => (busy ? <Loader2 className="size-3.5 animate-spin" /> : icon);
          if (q.status === "SUBMITTED" && canApprove) {
            return (
              <div className="inline-flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(q);
                  }}
                >
                  {spin(<CheckCircle2 className="size-3.5" />)}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title="Opens the quote to enter the reason"
                  disabled={busy}
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/quotes/${q.id}?reject=1`);
                  }}
                >
                  <XCircle className="size-3.5" />
                  Reject
                </Button>
              </div>
            );
          }
          if (q.status === "APPROVED" && canSell) {
            return (
              <Button
                variant="outline"
                size="sm"
                title="Shared with the customer"
                disabled={busy}
                className="border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-500/30 dark:text-teal-300 dark:hover:bg-teal-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkSent(q);
                }}
              >
                {spin(<Send className="size-3.5" />)}
                Mark as Sent
              </Button>
            );
          }
          if (q.status === "SENT" && canSell) {
            return (
              <Button
                variant="outline"
                size="sm"
                className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-500/30 dark:text-green-300 dark:hover:bg-green-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setAcceptQuote(q);
                }}
              >
                <BadgeCheck className="size-3.5" />
                Customer Accepted
              </Button>
            );
          }
          if (q.status === "DRAFT" && canCreate) {
            return (
              <div className="inline-flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="Edit"
                  aria-label={`Edit ${q.quoteNumber}`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(q);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmitQuote(q);
                  }}
                >
                  {spin(<Send className="size-3.5" />)}
                  Submit
                </Button>
              </div>
            );
          }
          return <span className="text-xs text-muted-foreground">—</span>;
        },
      },
    ],
    [busyId, canApprove, canCreate, canSell, router, handleApprove, handleMarkSent, handleSubmitQuote]
  );

  const toolbar = (
    <>
      <Select value={statusFilter || "ALL"} onValueChange={handleStatusChange}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          {ALL_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {formatQuoteStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="size-4" />
          Clear
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">
            {user?.role === "SALES"
              ? "Quotes for your leads — send approved ones to the customer and record acceptance."
              : user?.role === "ACCOUNTS"
                ? "Customer quotes (read-only)."
                : "Build, submit and approve customer quotes."}
          </p>
        </div>
      </div>

      {canCreate && (
        <PillTabs
          tabs={
            [
              {
                value: "pending",
                label: "Quote Requests",
                count: pendingLeads?.length ?? 0,
              },
              { value: "done", label: "Created", count: total },
            ] as PillTab<QuotesTab>[]
          }
          value={activeTab}
          onChange={(v) => updateUrlParams({ tab: v })}
        />
      )}

      {activeTab === "pending" ? (
        <DataTable
          title="Quote Requests"
          count={pendingLeads?.length ?? 0}
          columns={pendingColumns}
          data={pendingLeads ?? []}
          getRowKey={(l) => l.id}
          loading={pendingLeads === null}
          emptyMessage="Leads appear here once Sales sends them for a quote (after the MOM)."
        />
      ) : (
        <DataTable
          title="Quotes"
          count={total}
          columns={columns}
          data={quotes}
          getRowKey={(q) => q.id}
          loading={loading}
          emptyMessage={
            hasFilters
              ? "No quotes match your filters."
              : user?.role === "SALES"
                ? "Quotes for your leads appear here once MSP TL builds them."
                : canCreate
                  ? "No quotes yet — build one from Quote Requests."
                  : "No quotes yet."
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by company name..."
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => updateUrlParams({ page: String(p) })}
          onPageSizeChange={setPageSize}
          toolbar={toolbar}
          onRowClick={(q) => router.push(`/quotes/${q.id}`)}
        />
      )}

      {acceptQuote && (
        <AcceptQuoteDialog
          open
          onClose={() => setAcceptQuote(null)}
          onSuccess={fetchQuotes}
          quoteId={acceptQuote.id}
          quoteNumber={acceptQuote.quoteNumber}
        />
      )}

      <QuoteDialog
        open={quoteDialogOpen}
        onClose={() => {
          setQuoteDialogOpen(false);
          setPreselectedLeadId(undefined);
        }}
        onSuccess={() => {
          fetchQuotes();
          fetchPendingLeads();
        }}
        quote={editQuote}
        preselectedLeadId={preselectedLeadId}
      />
    </div>
  );
}

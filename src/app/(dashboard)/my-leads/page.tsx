"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Phone, PhoneOff, Clock } from "lucide-react";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn, formatDateIN, getCategoryColor } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import type { Lead, LeadListResponse } from "@/types";
import { CallOutcomeDialog } from "./_components/CallOutcomeDialog";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// "to_call" = never called / no outcome yet; "call_later" = callback scheduled.
// Any other outcome moves the lead out of this page, so it can't be called again.
type CallTab = "to_call" | "call_later";

const formatCallback = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

interface ActiveCall {
  leadId: string;
  startedAt: number;
}

export default function MyLeadsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Sales only see their own leads anyway; an MSP TL sees every lead, so ask for theirs
  const mine = useMemo(
    () => (user?.role === "MSP_TL" ? { assignedToId: user.id } : ({} as Record<string, string>)),
    [user?.role, user?.id]
  );

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const searchParams = useSearchParams();
  // the tab lives in the URL, so "Call later" links (dashboard, sidebar, toasts) switch it even here
  const tab: CallTab = searchParams.get("tab") === "call_later" ? "call_later" : "to_call";
  const setTab = (t: CallTab) => {
    setPage(1);
    router.replace(t === "to_call" ? "/my-leads" : `/my-leads?tab=${t}`);
  };
  const [counts, setCounts] = useState<Record<CallTab, number>>({ to_call: 0, call_later: 0 });

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  // for "· due" on callbacks — a 30 s tick is plenty (the call timer ticks on its own)
  const [now, setNow] = useState<number>(() => Date.now());

  const [outcomeLead, setOutcomeLead] = useState<Lead | null>(null);
  const [outcomeDuration, setOutcomeDuration] = useState(0);

  // Redirect users who shouldn't see this page.
  useEffect(() => {
    if (
      user &&
      user.role !== "SALES" &&
      user.role !== "MSP_TL" &&
      user.role !== "ADMIN"
    ) {
      router.replace("/");
    }
  }, [user, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // `quiet`: live refresh — keep the list on screen
  const fetchLeads = useCallback(async (quiet?: boolean) => {
    try {
      if (quiet !== true) setLoading(true);
      const params: Record<string, string | number> = { page, limit: pageSize, stage: tab, ...mine };
      if (debouncedSearch) params.search = debouncedSearch;

      const { data } = await api.get("/leads", { params });
      const result: LeadListResponse = data.data ?? {
        leads: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
      setLeads(result.leads);
      setTotal(result.total);
    } catch (err) {
      notify.apiError(err, "Couldn't load your leads");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, tab, mine]);

  // Tab badges — just the totals
  const fetchCounts = useCallback(async () => {
    try {
      const [toCall, later] = await Promise.all(
        (["to_call", "call_later"] as const).map((stage) =>
          api.get("/leads", { params: { stage, limit: 1, ...mine } })
        )
      );
      setCounts({ to_call: toCall.data.data?.total ?? 0, call_later: later.data.data?.total ?? 0 });
    } catch {
      // tab badges only — the list load above already reports failures
    }
  }, [mine]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // a lead assigned to me / moved on elsewhere → refresh in the background
  useDataChanged(() => {
    fetchLeads(true);
    fetchCounts();
  });

  const handleStartCall = (lead: Lead) => {
    setActiveCall({ leadId: lead.id, startedAt: Date.now() });
  };

  const handleEndCall = (lead: Lead) => {
    if (!activeCall) return;
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - activeCall.startedAt) / 1000)
    );
    setOutcomeDuration(durationSec);
    setOutcomeLead(lead);
    setActiveCall(null);
  };

  const handleOutcomeClose = () => {
    setOutcomeLead(null);
    setOutcomeDuration(0);
  };

  const handleOutcomeSuccess = () => {
    handleOutcomeClose();
    fetchLeads();
    fetchCounts();
  };

  const columns: DataTableColumn<Lead>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Company Name",
        cell: (lead) => (
          <span className="font-medium text-foreground">
            {lead.companyName}
          </span>
        ),
      },
      {
        key: "contact",
        header: "Contact Person",
        cell: (lead) => (
          <div>
            <div className="text-foreground">{lead.contactPerson}</div>
            <a
              href={`tel:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {lead.phone}
            </a>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        cell: (lead) =>
          lead.category ? (
            <Badge
              variant="secondary"
              className={getCategoryColor(lead.category)}
            >
              {lead.category === "HARDWARE" ? "Hardware" : "Software"}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          ),
      },
      {
        key: "product",
        header: "Product",
        cell: (lead) =>
          lead.subcategory && lead.subcategory.length > 0 ? (
            <span>{lead.subcategory.join(", ")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">--</span>
          ),
      },
      tab === "call_later"
        ? {
            key: "callback",
            header: "Call Back",
            cell: (lead: Lead) => {
              const due = lead.callbackAt ? new Date(lead.callbackAt).getTime() <= now : false;
              return lead.callbackAt ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap text-sm",
                    due ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}
                >
                  <Clock className="size-3.5" />
                  {formatCallback(lead.callbackAt)}
                  {due && " · due"}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">--</span>
              );
            },
          }
        : {
            key: "created",
            header: "Added",
            cell: (lead: Lead) => (
              <span className="whitespace-nowrap text-muted-foreground">{formatDateIN(lead.createdAt)}</span>
            ),
          },
      {
        key: "call",
        header: "Call",
        headClassName: "w-[1%] whitespace-nowrap",
        className: "w-[1%] whitespace-nowrap",
        cell: (lead) => {
          const isActive = activeCall?.leadId === lead.id;
          const disabledByOther = !!activeCall && !isActive;

          if (isActive) {
            return (
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <CallTimer startedAt={activeCall.startedAt} />
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => handleEndCall(lead)}
                >
                  <PhoneOff className="size-4" />
                  End Call
                </Button>
              </div>
            );
          }

          return (
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                disabled={disabledByOther}
                onClick={() => handleStartCall(lead)}
              >
                <Phone className="size-4" />
                Call
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Open ${lead.companyName} workspace`}
                title="Open workspace"
                onClick={() => router.push(`/leads/${lead.id}/workspace`)}
              >
                <Eye className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [activeCall, now, router, tab]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Assigned Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Call your leads and log the outcome. Scheduling a meeting moves the lead on.
          </p>
        </div>
      </div>

      <PillTabs
        tabs={
          [
            { value: "to_call", label: "To Call", count: counts.to_call },
            { value: "call_later", label: "Call Later", count: counts.call_later },
          ] as PillTab<CallTab>[]
        }
        value={tab}
        onChange={setTab}
      />

      <DataTable
        title={tab === "to_call" ? "To Call" : "Call Later"}
        count={total}
        columns={columns}
        data={leads}
        getRowKey={(lead) => lead.id}
        loading={loading}
        emptyMessage={
          tab === "to_call"
            ? "No leads waiting for a call."
            : "No callbacks scheduled. Leads land here when a call ends with “Call later”."
        }
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search company or contact..."
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onRowClick={(lead) => router.push(`/leads/${lead.id}/workspace`)}
      />

      <CallOutcomeDialog
        open={!!outcomeLead}
        onClose={handleOutcomeClose}
        onSuccess={handleOutcomeSuccess}
        lead={outcomeLead}
        duration={outcomeDuration}
      />
    </div>
  );
}

/** Ticks on its own, so the whole table doesn't re-render every second during a call */
function CallTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm tabular-nums text-red-600 dark:text-red-400" aria-live="off">
      {formatDuration(Math.max(0, Math.floor((now - startedAt) / 1000)))}
    </span>
  );
}

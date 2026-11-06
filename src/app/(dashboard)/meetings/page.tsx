"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  FileText,
  Calendar,
  FilePlus2,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import { canWorkLead } from "@/lib/leadAccess";
import { cn, formatDateTimeIN } from "@/lib/utils";
import type { Lead, Meeting, MeetingListResponse } from "@/types";
import { RequirementDialog } from "@/components/requirements/RequirementDialog";
import { MeetingDialog } from "./_components/MeetingDialog";
import { MOMDialog } from "./_components/MOMDialog";

// "requirement" = meeting + MOM done, final requirement not sent to MSP TL yet
type MeetingTab = "today" | "upcoming" | "overdue" | "all" | "requirement";

// Tabs are worked out by the server (IST calendar day, MOM not added yet) — GET /meetings?bucket=
type Bucket = Exclude<MeetingTab, "requirement">;

/** Calendar day in IST as YYYY-MM-DD — only for marking a row overdue (red date) */
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const isOverdueMeeting = (m: Meeting) => !m.momContent && istDay(new Date(m.meetingDate)) < istDay(new Date());

export default function MeetingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  // the tab lives in the URL, so dashboard / sidebar links switch it even when this page is open
  const urlTab = searchParams.get("tab") as MeetingTab | null;
  const activeTab: MeetingTab =
    urlTab && ["today", "upcoming", "overdue", "all", "requirement"].includes(urlTab) ? urlTab : "today";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // one page of the active tab + every tab's count, from the server
  const [meetingTotal, setMeetingTotal] = useState(0);
  const [counts, setCounts] = useState<Record<Bucket, number>>({ today: 0, upcoming: 0, overdue: 0, all: 0 });
  const [reqTotal, setReqTotal] = useState(0);

  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [momMeeting, setMomMeeting] = useState<Meeting | null>(null);
  const [requirementLeads, setRequirementLeads] = useState<Lead[]>([]);
  const [requirementFor, setRequirementFor] = useState<string | null>(null);

  // Meetings, MOM and final requirement are Sales work (Sales only sees their own leads here).
  // MSP TL can follow along read-only.
  // Sales work: Sales, Admin, and MSP TLs on leads assigned to them (row actions check the lead)
  const canCreate = user?.role === "ADMIN" || user?.role === "SALES" || user?.role === "MSP_TL";
  const canWork = useCallback((assignedToId?: string | null) => canWorkLead(user, assignedToId), [user]);

  const updateUrlParams = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
      router.replace(`/meetings?${sp.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // `quiet`: live refresh — keep the list on screen
  const fetchMeetings = useCallback(async (quiet?: boolean) => {
    const onMeetings = activeTab !== "requirement";
    try {
      if (onMeetings && quiet !== true) setLoading(true);
      // on the Final Requirement tab only the tab counts are needed (limit 1)
      const params: Record<string, string | number> = onMeetings
        ? { page, limit: pageSize, bucket: activeTab }
        : { page: 1, limit: 1, bucket: "all" };
      if (debouncedSearch) params.search = debouncedSearch;

      const { data } = await api.get("/meetings", { params });
      const result = (data.data ?? {}) as Partial<MeetingListResponse> & { counts?: Record<Bucket, number> };
      if (onMeetings) {
        setMeetings(result.meetings ?? []);
        setMeetingTotal(result.total ?? 0);
      }
      if (result.counts) setCounts(result.counts);
    } catch (err) {
      notify.apiError(err, "Couldn't load meetings");
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Leads at MOM_ADDED (not dropped) — waiting for Sales to add the final requirement
  const [reqLoading, setReqLoading] = useState(true);
  const fetchRequirementLeads = useCallback(async () => {
    const onReq = activeTab === "requirement";
    try {
      // other tabs only need the count for the pill (limit 1)
      const params: Record<string, string | number> = onReq
        ? { stage: "request_quote", page, limit: pageSize }
        : { stage: "request_quote", page: 1, limit: 1 };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get("/leads", { params });
      if (onReq) setRequirementLeads(data.data?.leads ?? []);
      setReqTotal(data.data?.total ?? 0);
    } catch (err) {
      if (onReq) notify.apiError(err, "Couldn't load leads waiting for a final requirement");
    } finally {
      setReqLoading(false);
    }
  }, [activeTab, page, pageSize, debouncedSearch]);

  useEffect(() => {
    fetchRequirementLeads();
  }, [fetchRequirementLeads]);

  const refreshAll = useCallback(() => {
    fetchMeetings(true);
    fetchRequirementLeads();
  }, [fetchMeetings, fetchRequirementLeads]);

  // a meeting booked / MOM added elsewhere → refresh in the background
  useDataChanged(refreshAll);

  const tabs: PillTab<MeetingTab>[] = [
    { value: "today", label: "Today", count: counts.today },
    { value: "upcoming", label: "Upcoming", count: counts.upcoming },
    { value: "overdue", label: "Overdue", count: counts.overdue },
    { value: "all", label: "All", count: counts.all },
    { value: "requirement", label: "Final Requirement", count: reqTotal },
  ];

  const requirementColumns: DataTableColumn<Lead>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Company",
        cell: (l) => (
          <div>
            <p className="font-medium text-foreground">{l.companyName}</p>
            <p className="text-xs text-muted-foreground">
              {l.contactPerson} · {l.phone}
            </p>
          </div>
        ),
      },
      {
        key: "products",
        header: "Products (from categorize)",
        cell: (l) =>
          l.subcategory?.length ? (
            <span className="text-sm">{l.subcategory.join(", ")}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Not categorized</span>
          ),
      },
      {
        key: "owner",
        header: "Sales",
        cell: (l) => <span className="text-sm text-muted-foreground">{l.assignedTo?.name ?? "—"}</span>,
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-48 text-right",
        className: "text-right",
        cell: (l) =>
          canWork(l.assignedTo?.id) ? (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setRequirementFor(l.id);
            }}
          >
            <ListChecks className="size-3.5" />
            Add Requirement
          </Button>
          ) : null,
      },
    ],
    [canWork]
  );

  const columns: DataTableColumn<Meeting>[] = useMemo(
    () => [
      {
        key: "company",
        header: "Company",
        cell: (m) => (
          <span className="font-medium text-foreground">
            {m.lead?.companyName ?? "—"}
          </span>
        ),
      },
      {
        key: "date",
        header: "Date & Time",
        cell: (m) => {
          const d = new Date(m.meetingDate);
          const isOverdue = isOverdueMeeting(m);
          return (
            <div
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap",
                isOverdue && "text-rose-600 dark:text-rose-400"
              )}
            >
              <Calendar className="size-3.5" />
              {formatDateTimeIN(d)}
            </div>
          );
        },
      },
      {
        key: "location",
        header: "Location",
        cell: (m) => (
          <span className="text-muted-foreground">{m.location}</span>
        ),
      },
      {
        key: "attendees",
        header: "Attendees",
        cell: (m) => (
          <Badge variant="secondary" className="text-xs">
            {m.attendees.length}
          </Badge>
        ),
      },
      {
        key: "mom",
        header: "MOM",
        cell: (m) =>
          m.momContent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
              <CheckCircle2 className="size-2.5" />
              Added
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
              Pending
            </span>
          ),
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-24 text-right",
        className: "text-right",
        cell: (m) => {
          if (!canWork(m.lead?.assignedToId)) return <span className="text-xs text-muted-foreground">—</span>;
          if (!m.momContent) {
            return (
              <Button
                variant="outline"
                size="icon-sm"
                title="Add MOM"
                aria-label="Add MOM"
                onClick={(e) => {
                  e.stopPropagation();
                  setMomMeeting(m);
                }}
              >
                <FileText className="size-4" />
              </Button>
            );
          }
          if (m.lead?.quoteRequestedAt) {
            return (
              <span
                title="Sent for quote"
                className="inline-flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
              >
                <CheckCircle2 className="size-4" />
              </span>
            );
          }
          // Sending for a quote needs the final requirement
          return (
            <Button
              variant="outline"
              size="icon-sm"
              title="Add final requirement & send for quote"
              aria-label="Add final requirement and send for quote"
              disabled={!m.lead}
              onClick={(e) => {
                e.stopPropagation();
                if (m.lead) setRequirementFor(m.lead.id);
              }}
            >
              <FilePlus2 className="size-4" />
            </Button>
          );
        },
      },
    ],
    [canWork]
  );

  const emptyMessageMap: Record<MeetingTab, string> = {
    today: "No meetings scheduled for today.",
    upcoming: "No upcoming meetings.",
    overdue: "Nothing overdue — you're on top of it!",
    all: "No meetings found. Schedule your first meeting to get started.",
    requirement: "Nothing waiting — leads appear here once their MOM is added.",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Track meetings and minutes of meetings.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setMeetingDialogOpen(true)}>
            <Plus className="size-4" />
            Schedule Meeting
          </Button>
        )}
      </div>

      <PillTabs
        tabs={tabs}
        value={activeTab}
        onChange={(v) => {
          setPage(1);
          updateUrlParams({ tab: v });
        }}
      />

      {activeTab === "requirement" ? (
        <DataTable
          title="Waiting for final requirement"
          count={reqTotal}
          columns={requirementColumns}
          data={requirementLeads}
          getRowKey={(l) => l.id}
          loading={reqLoading}
          emptyMessage={emptyMessageMap.requirement}
          searchValue={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          searchPlaceholder="Search by company name..."
          total={reqTotal}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onRowClick={(l) => router.push(`/leads/${l.id}/workspace`)}
        />
      ) : (
      <DataTable
        title="Meetings"
        count={meetingTotal}
        columns={columns}
        data={meetings}
        getRowKey={(m) => m.id}
        loading={loading}
        emptyMessage={emptyMessageMap[activeTab]}
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by company name..."
        total={meetingTotal}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={(m) => router.push(`/meetings/${m.id}`)}
      />
      )}

      <RequirementDialog
        leadId={requirementFor}
        onClose={() => setRequirementFor(null)}
        onSent={refreshAll}
      />

      <MeetingDialog
        open={meetingDialogOpen}
        onClose={() => setMeetingDialogOpen(false)}
        onSuccess={fetchMeetings}
      />

      <MOMDialog
        open={!!momMeeting}
        onClose={() => setMomMeeting(null)}
        onSuccess={refreshAll}
        meeting={momMeeting}
      />
    </div>
  );
}

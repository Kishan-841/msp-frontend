"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Eye,
  Pencil,
  Tags,
  Trash2,
  UserPlus,
  X,
  Loader2,
  Phone,
  Calendar,
  ClipboardList,
  Receipt,
  CheckCircle2,
  Mail,
  Trophy,
  RefreshCw,
  Inbox,
  FileCheck,
  XCircle,
  Send,
} from "lucide-react";
import { cn, formatDateIN } from "@/lib/utils";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import api from "@/lib/axios";
import {
  formatStatusLabel,
  getCategoryColor,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { notify } from "@/lib/notify";
import { canWorkLead } from "@/lib/leadAccess";
import { useDataChanged } from "@/hooks/useDataChanged";
import type { Lead, LeadStatus, LeadListResponse } from "@/types";
import { LeadDialog } from "./_components/LeadDialog";
import { CategorizeDialog } from "./_components/CategorizeDialog";
import { AssignDialog } from "./_components/AssignDialog";

type StageInfo = {
  label: string;
  icon: React.ElementType;
  tint: string;
};

function stageForStatus(status: LeadStatus): StageInfo {
  switch (status) {
    case "NEW":
      return {
        label: "Categorize",
        icon: Tags,
        tint:
          "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30",
      };
    case "CATEGORIZED":
      return {
        label: "Assign",
        icon: UserPlus,
        tint:
          "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
      };
    case "ASSIGNED":
      return {
        label: "Call",
        icon: Phone,
        tint:
          "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
      };
    case "MEETING_SCHEDULED":
      return {
        label: "Meeting",
        icon: Calendar,
        tint:
          "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30",
      };
    case "MEETING_DONE":
      return {
        label: "MOM",
        icon: ClipboardList,
        tint:
          "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30",
      };
    case "MOM_ADDED":
      return {
        label: "Request Quote",
        icon: Send,
        tint:
          "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
      };
    case "QUOTE_REQUESTED":
      return {
        label: "Quote",
        icon: Receipt,
        tint:
          "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30",
      };
    case "QUOTE_CREATED":
    case "QUOTE_SUBMITTED":
      return {
        label: "Approval",
        icon: CheckCircle2,
        tint:
          "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/30",
      };
    case "QUOTE_APPROVED":
      return {
        label: "Send",
        icon: Mail,
        tint:
          "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
      };
    case "QUOTE_REJECTED":
      return {
        label: "Re-quote",
        icon: RefreshCw,
        tint:
          "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
      };
    case "QUOTE_SENT":
      return {
        label: "Awaiting Acceptance",
        icon: Inbox,
        tint:
          "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
      };
    case "CUSTOMER_ACCEPTED":
      return {
        label: "Create PO",
        icon: FileCheck,
        tint:
          "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/10 dark:text-lime-300 dark:ring-lime-500/30",
      };
    case "PO_PENDING_ACCOUNTS":
      return {
        label: "Accounts Check",
        icon: FileCheck,
        tint:
          "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30",
      };
    case "PO_CONFIRMED":
      return {
        label: "Send PO",
        icon: Send,
        tint:
          "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30",
      };
    case "PO_SENT":
      return {
        label: "Invoicing",
        icon: Inbox,
        tint:
          "bg-green-50 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/30",
      };
    case "INVOICED":
      return {
        label: "Collection",
        icon: Inbox,
        tint:
          "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
      };
    case "DEAL_REGISTERED":
      return {
        label: "Deal Closed",
        icon: Trophy,
        tint:
          "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
      };
  }
}

const QUICK_STAGES: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "categorize", label: "To categorize" },
  { value: "assign", label: "To assign" },
  { value: "call", label: "To call" },
  { value: "quote", label: "Quote requested" },
  { value: "approval", label: "Awaiting approval" },
  { value: "invoicing", label: "To invoice" },
  { value: "won", label: "Deal Closed" },
  { value: "dropped", label: "Dropped" },
];

const AVATAR_TINTS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];

/** Initials avatar; the tint follows the name, so the same company always looks the same */
function Initials({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-9 text-xs",
        AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length]
      )}
    >
      {initials}
    </span>
  );
}

const ALL_STATUSES: LeadStatus[] = [
  "NEW",
  "CATEGORIZED",
  "ASSIGNED",
  "MEETING_SCHEDULED",
  "MEETING_DONE",
  "MOM_ADDED",
  "QUOTE_REQUESTED",
  "QUOTE_CREATED",
  "QUOTE_SUBMITTED",
  "QUOTE_APPROVED",
  "QUOTE_REJECTED",
  "QUOTE_SENT",
  "CUSTOMER_ACCEPTED",
  "PO_PENDING_ACCOUNTS",
  "PO_CONFIRMED",
  "PO_SENT",
  "INVOICED",
  "DEAL_REGISTERED",
];

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters live in the URL — so a link (dashboard next step, sidebar, toast "Open") applies
  // them even when this page is already open, and Back/Forward work.
  const debouncedSearch = searchParams.get("search") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const stageFilter = searchParams.get("stage") ?? "";
  const categoryFilter = searchParams.get("category") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const [pageSize, setPageSize] = useState(10);
  // the search box: typed text, synced from the URL when the URL changes from outside
  const [search, setSearch] = useState(debouncedSearch);
  const [seenUrlSearch, setSeenUrlSearch] = useState(debouncedSearch);
  if (debouncedSearch !== seenUrlSearch) {
    setSeenUrlSearch(debouncedSearch);
    if (debouncedSearch !== search.trim()) setSearch(debouncedSearch);
  }

  // Dialog state
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [categorizeLead, setCategorizeLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canCreate =
    user?.role === "ADMIN" ||
    user?.role === "MSP_TL" ||
    user?.role === "SALES";

  const isMspTl = user?.role === "MSP_TL" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  const updateUrlParams = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      });
      router.replace(`/leads?${sp.toString()}`);
    },
    [router, searchParams]
  );

  // Typing → URL after 400 ms (back to page 1). Nothing is written on first load, so ?page= survives.
  useEffect(() => {
    if (search.trim() === debouncedSearch) return;
    const timer = setTimeout(() => updateUrlParams({ search: search.trim(), page: "" }), 400);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch, updateUrlParams]);

  // `quiet`: live refresh — keep the table on screen instead of flashing the spinner
  const fetchLeads = useCallback(async (quiet?: boolean) => {
    try {
      if (quiet !== true) setLoading(true);
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (stageFilter) params.stage = stageFilter;
      if (categoryFilter) params.category = categoryFilter;

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
      notify.apiError(err, "Couldn't load leads");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, stageFilter, categoryFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // someone else added / moved a lead → refresh in the background
  useDataChanged(() => fetchLeads(true));

  const handleStatusChange = (value: string | null) => {
    const v = !value || value === "ALL" ? "" : value;
    updateUrlParams({ status: v, page: "" });
  };

  const handleCategoryChange = (value: string | null) => {
    const v = !value || value === "ALL" ? "" : value;
    updateUrlParams({ category: v, page: "" });
  };

  const handleStageChange = (value: string | null) => {
    const v = !value || value === "ALL" ? "" : value;
    updateUrlParams({ stage: v, page: "" });
  };

  const clearFilters = () => {
    setSearch("");
    router.replace("/leads");
  };

  // Assigned leads open in the workspace (where the work happens) for those who can work them;
  // everyone else (and unassigned leads) gets the detail page.
  const openLead = (lead: Lead) => {
    const canWork = isMspTl || canWorkLead(user, lead.assignedTo?.id);
    const working = !!lead.assignedTo && !["NEW", "CATEGORIZED"].includes(lead.status);
    router.push(canWork && working ? `/leads/${lead.id}/workspace` : `/leads/${lead.id}`);
  };

  const hasFilters =
    !!debouncedSearch || !!statusFilter || !!stageFilter || !!categoryFilter;

  const handleCreateLead = () => {
    setEditLead(null);
    setLeadDialogOpen(true);
  };

  const handleEditLead = (lead: Lead) => {
    setEditLead(lead);
    setLeadDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteLead) return;
    try {
      setDeleting(true);
      await api.delete(`/leads/${deleteLead.id}`);
      notify.success("Lead deleted", `${deleteLead.companyName} and its meetings and quotes were removed`);
      setDeleteLead(null);
      await fetchLeads();
    } catch (err) {
      notify.apiError(err, `Couldn't delete ${deleteLead.companyName}`);
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Lead>[] = useMemo(
    () => [
      {
        key: "lead",
        header: "Lead",
        cell: (lead) => (
          <div className="flex min-w-[220px] items-center gap-3">
            <Initials name={lead.companyName} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{lead.companyName}</span>
                {(lead.orderNo ?? 1) > 1 && (
                  <span className="shrink-0 rounded-full bg-[#3B82F6]/10 px-1.5 py-px text-[10px] font-semibold text-[#3B82F6]">
                    Order #{lead.orderNo}
                  </span>
                )}
                {(lead.possibleDuplicateIds?.length ?? 0) > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:text-amber-300" title="Same phone, email or GSTIN as another lead">
                    Possible duplicate
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {lead.contactPerson}
                {lead.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${lead.phone}`} className="hover:text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                      {lead.phone}
                    </a>
                  </>
                )}
              </p>
              {lead.integrationClient && (
                <p className="truncate text-[11px] text-muted-foreground">
                  From {lead.integrationClient.name}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "products",
        header: "Products",
        cell: (lead) => {
          const products = lead.subcategory ?? [];
          if (!lead.category && products.length === 0) {
            return <span className="text-xs text-muted-foreground">Not categorized</span>;
          }
          return (
            <div className="flex max-w-[260px] flex-wrap items-center gap-1">
              {lead.category && (
                <Badge variant="secondary" className={cn("text-[11px]", getCategoryColor(lead.category))}>
                  {lead.category === "HARDWARE" ? "Hardware" : "Software"}
                </Badge>
              )}
              {products.slice(0, 2).map((p) => (
                <span key={p} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground">
                  {p}
                </span>
              ))}
              {products.length > 2 && (
                <span className="text-[11px] text-muted-foreground" title={products.slice(2).join(", ")}>
                  +{products.length - 2}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "stage",
        header: "Stage",
        cell: (lead) => {
          const stage = lead.droppedAt
            ? {
                label: "Dropped",
                icon: XCircle,
                tint: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
              }
            : stageForStatus(lead.status);
          const Icon = stage.icon;
          return (
            <div className="space-y-0.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                  stage.tint
                )}
              >
                <Icon className="size-3" />
                {stage.label}
              </span>
              {/* the exact status, small — the pill above says what happens next */}
              <p className="text-[11px] text-muted-foreground">{lead.droppedAt ? `Dropped ${formatDateIN(lead.droppedAt)}` : formatStatusLabel(lead.status)}</p>
            </div>
          );
        },
      },
      {
        key: "owner",
        header: "Owner",
        cell: (lead) =>
          lead.submittedByName ? (
            // from another software: the person who sent it owns it; Sales works it
            <div className="flex items-center gap-2">
              <Initials name={lead.submittedByName} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm">{lead.submittedByName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {lead.assignedTo ? `Sales: ${lead.assignedTo.name}` : "No Sales person yet"}
                </p>
              </div>
            </div>
          ) : lead.assignedTo ? (
            <div className="flex items-center gap-2">
              <Initials name={lead.assignedTo.name} size="sm" />
              <span className="text-sm">{lead.assignedTo.name}</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-border">
                <UserPlus className="size-3" />
              </span>
              Unassigned
            </span>
          ),
      },
      {
        key: "created",
        header: "Created",
        cell: (lead) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDateIN(lead.createdAt)}>
            {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
          </span>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        headClassName: "w-[1%] whitespace-nowrap",
        className: "w-[1%] whitespace-nowrap",
        cell: (lead) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {/* the lead's next step for MSP TL, then view / edit / delete */}
            {isMspTl && !lead.category && !lead.droppedAt && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCategorizeLead(lead)}>
                <Tags className="size-3.5" /> Categorize
              </Button>
            )}
            {isMspTl && lead.status === "CATEGORIZED" && !lead.droppedAt && (
              <Button size="sm" className="h-7 text-xs" onClick={() => setAssignLead(lead)}>
                <UserPlus className="size-3.5" /> Assign
              </Button>
            )}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="View details" title="View details" onClick={() => router.push(`/leads/${lead.id}`)}>
                <Eye className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" title="Edit" onClick={() => handleEditLead(lead)}>
                <Pencil className="size-4" />
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete lead"
                  title="Delete lead"
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => setDeleteLead(lead)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ),
      },
    ],
    [isMspTl, isAdmin, router]
  );

  const toolbar = (
    <>
      <Select value={stageFilter || "ALL"} onValueChange={handleStageChange}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="All Stages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Stages</SelectItem>
          <SelectItem value="categorize">Categorize</SelectItem>
          <SelectItem value="assign">Assign</SelectItem>
          <SelectItem value="call">Call</SelectItem>
          <SelectItem value="meeting">Meeting</SelectItem>
          <SelectItem value="mom">MOM</SelectItem>
          <SelectItem value="request_quote">Request Quote</SelectItem>
          <SelectItem value="quote">Quote</SelectItem>
          <SelectItem value="approval">Approval</SelectItem>
          <SelectItem value="send">Send</SelectItem>
          <SelectItem value="requote">Re-quote</SelectItem>
          <SelectItem value="awaiting_acceptance">Awaiting Acceptance</SelectItem>
          <SelectItem value="create_po">Create PO</SelectItem>
          <SelectItem value="po_accounts">Accounts Check</SelectItem>
          <SelectItem value="po_send">Send PO</SelectItem>
          <SelectItem value="invoicing">Invoicing</SelectItem>
          <SelectItem value="collection">Collection</SelectItem>
          <SelectItem value="won">Deal Closed</SelectItem>
          <SelectItem value="dropped">Dropped</SelectItem>
        </SelectContent>
      </Select>
      <Select value={statusFilter || "ALL"} onValueChange={handleStatusChange}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          {ALL_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {formatStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={categoryFilter || "ALL"}
        onValueChange={handleCategoryChange}
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Categories</SelectItem>
          <SelectItem value="HARDWARE">Hardware</SelectItem>
          <SelectItem value="SOFTWARE">Software</SelectItem>
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
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Every lead in your pipeline — click one to work on it.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateLead}>
            <Plus className="size-4" />
            Add Lead
          </Button>
        )}
      </div>

      {/* one-click stage filters (the Stage dropdown below has every stage) */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quick stage filter">
        {QUICK_STAGES.map((q) => {
          const active = (stageFilter || "") === q.value;
          return (
            <button
              key={q.value || "all"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleStageChange(q.value || null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                active
                  ? "bg-foreground text-background ring-foreground"
                  : "bg-card text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <DataTable
        title="Leads"
        count={total}
        columns={columns}
        data={leads}
        getRowKey={(lead) => lead.id}
        loading={loading}
        emptyMessage={
          hasFilters
            ? "No leads match your filters."
            : "No leads found. Create your first lead to get started."
        }
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search company or contact..."
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => updateUrlParams({ page: p > 1 ? String(p) : "" })}
        onPageSizeChange={setPageSize}
        toolbar={toolbar}
        onRowClick={openLead}
      />

      {/* Dialogs */}
      <LeadDialog
        open={leadDialogOpen}
        onClose={() => setLeadDialogOpen(false)}
        onSuccess={fetchLeads}
        lead={editLead}
      />

      <CategorizeDialog
        open={!!categorizeLead}
        onClose={() => setCategorizeLead(null)}
        onSuccess={fetchLeads}
        lead={categorizeLead}
      />

      <AssignDialog
        open={!!assignLead}
        onClose={() => setAssignLead(null)}
        onSuccess={fetchLeads}
        lead={assignLead}
      />

      {/* Admin delete confirmation */}
      <AlertDialog
        open={!!deleteLead}
        onOpenChange={(val) => !val && setDeleteLead(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleteLead?.companyName}
              </span>{" "}
              along with its meetings, quotes, and activity
              history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete lead"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

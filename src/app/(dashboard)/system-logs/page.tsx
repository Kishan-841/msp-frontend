"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowRight,
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  ScrollText,
  Search,
  ShieldAlert,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/axios";
import { downloadFile } from "@/lib/download";
import { notify } from "@/lib/notify";
import {
  cn,
  formatPoStatusLabel,
  formatQuoteStatusLabel,
  formatRoleLabel,
  formatStatusLabel,
} from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";
import type { LeadStatus, PurchaseOrderStatus, QuoteStatus, UserRole } from "@/types";

// ---------------------------------------------------------------- types & vocab

interface Change {
  from: unknown;
  to: unknown;
  fromLabel?: string | null;
  toLabel?: string | null;
}
interface LogEntry {
  id: string;
  createdAt: string;
  category: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  leadId: string | null;
  changes: Record<string, Change> | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
}
interface Actor {
  id: string;
  name: string;
  role: string | null;
}

const PAGE_SIZES = [20, 30, 50, 100];
const DEFAULT_PAGE_SIZE = 30;

const CATEGORIES: [string, string][] = [
  ["AUTH", "Sign-ins"],
  ["LEAD", "Leads"],
  ["MEETING", "Meetings"],
  ["QUOTE", "Quotes"],
  ["PURCHASE_ORDER", "Purchase orders"],
  ["ACCOUNTS", "Accounts"],
  ["USER", "Users"],
  ["VENDOR", "Vendors"],
  ["MATERIAL", "Materials"],
  ["SETTINGS", "Settings"],
  ["FILE", "Files"],
];

const ACTIONS: Record<string, { label: string; verb: string; icon: LucideIcon; tone: string }> = {
  CREATE: { label: "Created", verb: "created", icon: Plus, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  UPDATE: { label: "Updated", verb: "updated", icon: Pencil, tone: "bg-[#3B82F6]/10 text-[#2563EB] dark:text-[#60A5FA]" },
  DELETE: { label: "Deleted", verb: "deleted", icon: Trash2, tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  LOGIN: { label: "Signed in", verb: "signed in", icon: LogIn, tone: "bg-muted text-muted-foreground" },
  LOGOUT: { label: "Signed out", verb: "signed out", icon: LogOut, tone: "bg-muted text-muted-foreground" },
  LOGIN_FAILED: { label: "Failed sign-in", verb: "failed to sign in", icon: KeyRound, tone: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  LOGIN_BLOCKED: { label: "Sign-in blocked", verb: "was blocked from signing in", icon: Ban, tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  SESSION_REVOKED: { label: "Session ended", verb: "had a session ended", icon: ShieldAlert, tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};
const actionMeta = (a: string) => ACTIONS[a] ?? { label: a, verb: a.toLowerCase(), icon: ScrollText, tone: "bg-muted text-muted-foreground" };

/** Prisma model → how a person calls it */
const RECORD: Record<string, string> = {
  Lead: "lead",
  Meeting: "meeting",
  Quote: "quote",
  PurchaseOrder: "purchase order",
  SalesInvoice: "customer invoice",
  PurchaseInvoice: "vendor invoice",
  Payment: "payment",
  PaymentAllocation: "payment allocation",
  AdjustmentNote: "credit/debit note",
  User: "user",
  Vendor: "vendor",
  Material: "catalogue item",
  CompanySettings: "company settings",
  IntegrationClient: "integration key",
  Attachment: "file",
};

/** Where a record opens (only while it exists) */
function recordHref(e: LogEntry): string | null {
  if (!e.entityId || e.action === "DELETE") return null;
  switch (e.entityType) {
    case "Lead":
      return `/leads/${e.entityId}`;
    case "Quote":
      return `/quotes/${e.entityId}`;
    case "PurchaseOrder":
      return `/purchase-orders/${e.entityId}`;
    case "SalesInvoice":
      return `/invoices/${e.entityId}`;
    case "Meeting":
      return `/meetings/${e.entityId}`;
    case "Vendor":
      return "/vendors";
    case "User":
      return e.category === "AUTH" ? null : "/users";
    case "CompanySettings":
    case "IntegrationClient":
      return "/settings";
    default:
      return e.leadId ? `/leads/${e.leadId}` : null;
  }
}

// ---------------------------------------------------------------- formatting changes

const FIELD_LABEL: Record<string, string> = {
  assignedToId: "Assigned to",
  mspTlId: "MSP TL",
  createdById: "Created by",
  approvedById: "Approved by",
  sentById: "Sent by",
  acceptedById: "Accepted by",
  confirmedById: "Confirmed by",
  quoteRequestedById: "Quote requested by",
  conductedById: "Conducted by",
  uploadedById: "Uploaded by",
  systemUserId: "System user",
  userId: "User",
  vendorId: "Vendor",
  leadId: "Lead",
  momContent: "MOM",
  customerGstin: "Customer GSTIN",
  gstNumber: "GSTIN",
  gstin: "GSTIN",
  gstType: "GST type",
  gstAmount: "GST amount",
  igstAmount: "IGST",
  cgstAmount: "CGST",
  sgstAmount: "SGST",
  customerPoNumber: "Customer PO no.",
  customerPoDate: "Customer PO date",
  poNumber: "PO number",
  billNumber: "Our bill no.",
  vendorInvoiceNumber: "Vendor invoice no.",
  isActive: "Active",
  callbackAt: "Call back at",
  droppedAt: "Dropped at",
  orderNo: "Order no.",
  tdsPercent: "TDS %",
  tdsAmount: "TDS",
  ifsc: "IFSC",
  pan: "PAN",
  cin: "CIN",
  tan: "TAN",
};

const humanize = (k: string) =>
  FIELD_LABEL[k] ??
  k
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b([A-Z])([a-z])/g, (_m, a: string, b: string) => a.toLowerCase() + b)
    .replace(/^./, (c) => c.toUpperCase());

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ENUM = /^[A-Z][A-Z0-9_]+$/;

function formatValue(field: string, v: unknown, label: string | null | undefined, entityType: string | null): string {
  if (label) return label;
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (typeof v === "string") {
    if (ISO.test(v)) return format(new Date(v), "d MMM yyyy, h:mm a");
    if (field === "status" && entityType === "Lead") return formatStatusLabel(v as LeadStatus);
    if (field === "status" && entityType === "Quote") return formatQuoteStatusLabel(v as QuoteStatus);
    if (field === "status" && entityType === "PurchaseOrder") return formatPoStatusLabel(v as PurchaseOrderStatus);
    if (field === "role") return formatRoleLabel(v as UserRole);
    if (ENUM.test(v)) return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");
    return v;
  }
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) return v.length ? v.join(", ") : "—";
  return "(details)";
}

const isStructured = (v: unknown) => v !== null && typeof v === "object" && !(Array.isArray(v) && v.every((x) => typeof x !== "object"));

/** Most telling fields first in the one-line summary */
const PRIORITY = ["status", "assignedToId", "totalAmount", "isActive", "role", "droppedAt", "callbackAt"];

function sortedFields(changes: Record<string, Change>) {
  return Object.keys(changes).sort((a, b) => {
    const pa = PRIORITY.indexOf(a);
    const pb = PRIORITY.indexOf(b);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
}

// ---------------------------------------------------------------- page

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

export default function SystemLogsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const category = params.get("category") ?? "";
  const action = params.get("action") ?? "";
  const actorId = params.get("actorId") ?? "";
  const leadId = params.get("leadId") ?? "";
  const leadLabel = params.get("label") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const search = params.get("search") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const sizeParam = Number(params.get("size"));
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;

  const [searchText, setSearchText] = useState(search);
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<Actor[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      router.replace(`/system-logs${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router]
  );

  // search: wait until typing pauses
  useEffect(() => {
    if (searchText === search) return;
    const t = setTimeout(() => setParam({ search: searchText.trim() }), 350);
    return () => clearTimeout(t);
  }, [searchText, search, setParam]);

  const query = useMemo(
    () => ({
      category: category || undefined,
      action: action || undefined,
      actorId: actorId || undefined,
      leadId: leadId || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
    }),
    [category, action, actorId, leadId, from, to, search]
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/audit-logs", { params: { ...query, page, limit: pageSize } });
      setItems(data.data.items);
      setTotal(data.data.total);
    } catch (err) {
      notify.apiError(err, "Couldn't load the system log");
    } finally {
      setLoading(false);
    }
  }, [query, page, pageSize]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);
  useDataChanged(load);

  useEffect(() => {
    api
      .get("/audit-logs/actors")
      .then(({ data }) => setActors(data.data))
      .catch(() => undefined);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!(category || action || actorId || leadId || from || to || search);


  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every sign-in and every change to leads, quotes, POs, accounts and settings — who did it, when, and what
            changed.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            downloadFile("/audit-logs", `system-log-${format(new Date(), "yyyy-MM-dd")}.csv`, { ...query, format: "csv" })
          }
        >
          <Download className="size-4" /> Export CSV
        </Button>
      </div>

      {/* filters */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search person, company, quote / PO / invoice no., IP…"
              className="h-9 pl-9"
            />
          </div>
          <FilterSelect
            value={category}
            onChange={(v) => setParam({ category: v })}
            all="All areas"
            options={CATEGORIES}
            width="w-[160px]"
          />
          <FilterSelect
            value={action}
            onChange={(v) => setParam({ action: v })}
            all="All actions"
            options={Object.entries(ACTIONS).map(([k, a]) => [k, a.label])}
            width="w-[160px]"
          />
          <FilterSelect
            value={actorId}
            onChange={(v) => setParam({ actorId: v })}
            all="Everyone"
            options={actors.map((a) => [a.id, a.name])}
            width="w-[170px]"
          />
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setParam({ from: e.target.value })}
              className="h-9 w-[150px]"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setParam({ to: e.target.value })}
              className="h-9 w-[150px]"
              aria-label="To date"
            />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-muted-foreground"
              onClick={() => {
                setSearchText("");
                router.replace("/system-logs", { scroll: false });
              }}
            >
              <X className="size-3.5" /> Clear
            </Button>
          )}
        </div>
        {leadId && (
          <div className="mt-2.5 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Showing the history of</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3B82F6]/10 px-2.5 py-0.5 font-medium text-[#2563EB] dark:text-[#60A5FA]">
              {leadLabel || "one lead"}
              <button
                type="button"
                aria-label="Show all leads"
                onClick={() => setParam({ leadId: "", label: "" })}
                className="rounded-full hover:bg-[#3B82F6]/20"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* list */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-sm">
          <span className="text-muted-foreground">
            {loading && !items.length ? "Loading…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "entry" : "entries"}`}
          </span>
          {totalPages > 1 && (
            <span className="tabular-nums text-muted-foreground">
              Page {page} of {totalPages}
            </span>
          )}
        </header>

        {!loading && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ScrollText className="size-8 text-muted-foreground/60" />
            <p className="font-medium">{filtered ? "Nothing matches these filters" : "Nothing logged yet"}</p>
            <p className="text-sm text-muted-foreground">
              {filtered ? "Try a wider date range or clear the filters." : "Sign-ins and changes will appear here as they happen."}
            </p>
          </div>
        ) : (
          <div className={cn("overflow-x-auto", loading && items.length > 0 && "opacity-60 transition-opacity")}>
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr className="divide-x divide-border">
                  <th className="w-[150px] px-5 py-2.5 font-medium">When</th>
                  <th className="w-[200px] px-3 py-2.5 font-medium">User</th>
                  <th className="w-[160px] px-3 py-2.5 font-medium">Action</th>
                  <th className="w-[220px] px-3 py-2.5 font-medium">Record</th>
                  <th className="px-3 py-2.5 font-medium">Details</th>
                  <th className="w-[130px] px-5 py-2.5 font-medium">IP address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && !items.length
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} aria-hidden className="divide-x divide-border">
                        {[90, 130, 100, 140, 220, 80].map((w, j) => (
                          <td key={j} className={cn("py-3.5", j === 0 || j === 5 ? "px-5" : "px-3")}>
                            <span className="block h-3.5 animate-pulse rounded bg-muted" style={{ width: w }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : items.map((e) => <LogRow key={e.id} entry={e} active={selected?.id === e.id} onOpen={() => setSelected(e)} />)}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <Pager
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPage={(p) => setParam({ page: p > 1 ? String(p) : "" })}
            onPageSize={(n) => setParam({ size: n === DEFAULT_PAGE_SIZE ? "" : String(n) })}
          />
        )}
      </section>

      <LogSheet
        entry={selected}
        onClose={() => setSelected(null)}
        onLeadHistory={(id, label) => {
          setSelected(null);
          setParam({ leadId: id, label });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function FilterSelect({
  value,
  onChange,
  all,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: [string, string][];
  width: string;
}) {
  const items = useMemo(() => [{ value: "ALL", label: all }, ...options.map(([v, l]) => ({ value: v, label: l }))], [all, options]);
  return (
    <Select items={items} value={value || "ALL"} onValueChange={(v) => onChange(!v || v === "ALL" ? "" : String(v))}>
      <SelectTrigger className={cn("h-9", width)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 — first, last and two either side of the current page */
function pageList(page: number, totalPages: number): (number | "gap")[] {
  const keep = new Set([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) keep.add(p);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : "gap");
    out.push(p);
  });
  return out;
}

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const sizes = useMemo(() => PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })), []);
  const go = (p: number) => {
    onPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="flex flex-col gap-3 border-t border-border px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
        <span className="tabular-nums">
          Showing <span className="font-medium text-foreground">{start.toLocaleString("en-IN")}</span>–
          <span className="font-medium text-foreground">{end.toLocaleString("en-IN")}</span> of{" "}
          <span className="font-medium text-foreground">{total.toLocaleString("en-IN")}</span>
        </span>
        <span className="flex items-center gap-2">
          Rows per page
          <Select items={sizes} value={String(pageSize)} onValueChange={(v) => v && onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pages">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => go(1)} aria-label="First page">
            <ChevronsLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="hidden items-center gap-1 sm:flex">
            {pageList(page, totalPages).map((p, i) =>
              p === "gap" ? (
                <span key={`gap${i}`} className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "ghost"}
                  size="icon-sm"
                  className="min-w-8 px-2 tabular-nums"
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => p !== page && go(p)}
                >
                  {p}
                </Button>
              )
            )}
          </span>
          <span className="px-2 tabular-nums text-muted-foreground sm:hidden">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => go(page + 1)} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => go(totalPages)} aria-label="Last page">
            <ChevronsRight className="size-4" />
          </Button>
        </nav>
      )}
    </footer>
  );
}

/** "Status: Quote sent → Customer accepted" for the first fields of an update */
function changeSummary(e: LogEntry, max = 2) {
  const changes = e.changes ?? {};
  const fields = sortedFields(changes);
  const parts = fields.slice(0, max).map((f) => {
    const c = changes[f];
    if (isStructured(c.from) || isStructured(c.to)) return `${humanize(f)} changed`;
    return `${humanize(f)}: ${formatValue(f, c.from, c.fromLabel, e.entityType)} → ${formatValue(f, c.to, c.toLabel, e.entityType)}`;
  });
  return { parts, more: Math.max(0, fields.length - max), count: fields.length };
}

function details(e: LogEntry) {
  const reason = typeof e.meta?.reason === "string" ? e.meta.reason : null;
  if (e.category === "AUTH") return reason ?? "—";
  if (e.action === "UPDATE") {
    const { parts, more } = changeSummary(e);
    return [...parts, more ? `+${more} more` : null].filter(Boolean).join(" · ");
  }
  const n = Object.keys(e.changes ?? {}).length;
  return e.action === "CREATE" ? `${n} field${n === 1 ? "" : "s"} filled in` : e.action === "DELETE" ? "Record removed" : "—";
}

function Initials({ name }: { name: string }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#3B82F6]/10 text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA]">
      {ini || "?"}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const a = actionMeta(action);
  const Icon = a.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", a.tone)}>
      <Icon className="size-3.5" />
      {a.label}
    </span>
  );
}

function LogRow({ entry: e, active, onOpen }: { entry: LogEntry; active: boolean; onOpen: () => void }) {
  const when = new Date(e.createdAt);
  const role = e.actorRole && !["SYSTEM", "API"].includes(e.actorRole) ? formatRoleLabel(e.actorRole as UserRole) : e.actorRole === "API" ? "Integration" : null;
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer divide-x divide-border align-middle transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
        active && "bg-[#3B82F6]/5"
      )}
    >
      <td className="whitespace-nowrap px-5 py-3">
        <div className="font-medium tabular-nums">{format(when, "h:mm a")}</div>
        <div className="text-xs text-muted-foreground">{dayLabel(when)}</div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Initials name={e.actorName ?? "System"} />
          <div className="min-w-0">
            <div className="truncate font-medium">{e.actorName ?? "System"}</div>
            {role && <div className="truncate text-xs text-muted-foreground">{role}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <ActionBadge action={e.action} />
      </td>
      <td className="px-3 py-3">
        {e.category === "AUTH" ? (
          <span className="text-muted-foreground">Sign-in</span>
        ) : (
          <div className="min-w-0">
            <div className="truncate font-medium">{e.entityLabel ?? "—"}</div>
            <div className="truncate text-xs capitalize text-muted-foreground">{RECORD[e.entityType ?? ""] ?? e.entityType}</div>
          </div>
        )}
      </td>
      <td className="max-w-0 px-3 py-3">
        <div className="truncate text-muted-foreground">{details(e)}</div>
      </td>
      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted-foreground">{e.ip ?? "—"}</td>
    </tr>
  );
}

function LogSheet({
  entry: e,
  onClose,
  onLeadHistory,
}: {
  entry: LogEntry | null;
  onClose: () => void;
  onLeadHistory: (leadId: string, label: string) => void;
}) {
  // keep showing the last entry while the panel slides out
  const [shown, setShown] = useState<LogEntry | null>(e);
  if (e && e !== shown) setShown(e); // update during render (React's "derived state" pattern)
  const x = e ?? shown;

  return (
    <Sheet open={!!e} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        {x && <SheetBody e={x} onLeadHistory={onLeadHistory} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ e, onLeadHistory }: { e: LogEntry; onLeadHistory: (leadId: string, label: string) => void }) {
  const a = actionMeta(e.action);
  const Icon = a.icon;
  const isAuth = e.category === "AUTH";
  const changes = e.changes ?? {};
  const fields = sortedFields(changes);
  const href = recordHref(e);
  const record = RECORD[e.entityType ?? ""] ?? e.entityType ?? "record";
  const role = e.actorRole && !["SYSTEM", "API"].includes(e.actorRole) ? formatRoleLabel(e.actorRole as UserRole) : null;

  return (
    <>
      <SheetHeader className="border-b border-border p-5 pr-12">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", a.tone)}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="text-base leading-snug">
              {isAuth ? a.label : `${a.label} ${record}`}
              {!isAuth && e.entityLabel && <span className="font-semibold"> · {e.entityLabel}</span>}
            </SheetTitle>
            <SheetDescription className="mt-0.5">
              {e.actorName ?? "System"}
              {role && ` (${role})`} · {format(new Date(e.createdAt), "d MMM yyyy, h:mm:ss a")}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {fields.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {e.action === "CREATE" ? "Values" : e.action === "DELETE" ? "What it held" : `What changed (${fields.length})`}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[34%] px-3 py-2 font-medium">Field</th>
                    {e.action !== "CREATE" && <th className="px-3 py-2 font-medium">{e.action === "DELETE" ? "Value" : "Before"}</th>}
                    {e.action !== "DELETE" && <th className="px-3 py-2 font-medium">{e.action === "CREATE" ? "Value" : "After"}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fields.map((f) => {
                    const c = changes[f];
                    return (
                      <tr key={f} className="align-top">
                        <td className="px-3 py-2 font-medium">{humanize(f)}</td>
                        {e.action !== "CREATE" && (
                          <td className={cn("px-3 py-2", e.action === "UPDATE" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                            <Value field={f} v={c.from} label={c.fromLabel} entityType={e.entityType} />
                          </td>
                        )}
                        {e.action !== "DELETE" && (
                          <td className="px-3 py-2">
                            <Value field={f} v={c.to} label={c.toLabel} entityType={e.entityType} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            <Meta label="When">{format(new Date(e.createdAt), "EEEE, d MMM yyyy, h:mm:ss a")}</Meta>
            <Meta label="User">
              {e.actorName ?? "System"}
              {role && <span className="text-muted-foreground"> · {role}</span>}
            </Meta>
            {e.actorEmail && <Meta label="Account">{e.actorEmail}</Meta>}
            {e.meta &&
              Object.entries(e.meta).map(([k, v]) => (
                <Meta key={k} label={humanize(k)}>
                  {String(v)}
                </Meta>
              ))}
            <Meta label="IP address">
              <span className="font-mono text-xs">{e.ip ?? "—"}</span>
            </Meta>
            {e.userAgent && (
              <Meta label="Browser">
                <span className="break-all text-xs text-muted-foreground">{e.userAgent}</span>
              </Meta>
            )}
            {e.entityId && !isAuth && (
              <Meta label="Record ID">
                <span className="break-all font-mono text-xs">{e.entityId}</span>
              </Meta>
            )}
          </dl>
        </section>
      </div>

      {(href || e.leadId) && (
        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          {href && (
            <Link href={href} className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
              Open {record} <ArrowRight className="size-3.5" />
            </Link>
          )}
          {e.leadId && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onLeadHistory(e.leadId!, e.entityType === "Lead" ? (e.entityLabel ?? "") : "")}
            >
              <ScrollText className="size-3.5" /> Full history of this lead
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Value({ field, v, label, entityType }: { field: string; v: unknown; label?: string | null; entityType: string | null }) {
  if (isStructured(v)) {
    return (
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Show data</summary>
        <pre className="mt-1 max-h-64 max-w-[520px] overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-relaxed">
          {JSON.stringify(v, null, 2)}
        </pre>
      </details>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{formatValue(field, v, label, entityType)}</span>;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowRight,
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

const PAGE_SIZE = 30;

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
  return format(d, "EEEE, d MMM yyyy");
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

  const [searchText, setSearchText] = useState(search);
  const [items, setItems] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<Actor[]>([]);
  const [open, setOpen] = useState<string | null>(null);

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
      const { data } = await api.get("/audit-logs", { params: { ...query, page, limit: PAGE_SIZE } });
      setItems(data.data.items);
      setTotal(data.data.total);
    } catch (err) {
      notify.apiError(err, "Couldn't load the system log");
    } finally {
      setLoading(false);
    }
  }, [query, page]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(category || action || actorId || leadId || from || to || search);

  // group by IST day (the browser shows local time; the team is in India)
  const groups = useMemo(() => {
    const out: { day: string; rows: LogEntry[] }[] = [];
    for (const e of items) {
      const day = dayLabel(new Date(e.createdAt));
      const last = out[out.length - 1];
      if (last?.day === day) last.rows.push(e);
      else out.push({ day, rows: [e] });
    }
    return out;
  }, [items]);

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
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3 text-sm">
          <span className="text-muted-foreground">
            {loading && !items.length ? "Loading…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "entry" : "entries"}`}
          </span>
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onPage={(p) => setParam({ page: String(p) })} />}
        </header>

        {loading && !items.length ? (
          <div className="divide-y divide-border" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <span className="h-3 w-12 animate-pulse rounded bg-muted" />
                <span className="size-8 animate-pulse rounded-lg bg-muted" />
                <span className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <ScrollText className="size-8 text-muted-foreground/60" />
            <p className="font-medium">{filtered ? "Nothing matches these filters" : "Nothing logged yet"}</p>
            <p className="text-sm text-muted-foreground">
              {filtered ? "Try a wider date range or clear the filters." : "Sign-ins and changes will appear here as they happen."}
            </p>
          </div>
        ) : (
          <div className={cn(loading && "opacity-60 transition-opacity")}>
            {groups.map((g) => (
              <Fragment key={g.day}>
                <div className="sticky top-0 z-[1] border-b border-border bg-muted/60 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {g.day}
                </div>
                <ul className="divide-y divide-border">
                  {g.rows.map((e) => (
                    <LogRow
                      key={e.id}
                      entry={e}
                      open={open === e.id}
                      onToggle={() => setOpen((o) => (o === e.id ? null : e.id))}
                      onLeadHistory={(id, label) => setParam({ leadId: id, label })}
                    />
                  ))}
                </ul>
              </Fragment>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <footer className="flex justify-end border-t border-border px-5 py-3">
            <Pager page={page} totalPages={totalPages} onPage={(p) => setParam({ page: String(p) })} />
          </footer>
        )}
      </section>
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

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Newer">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[88px] text-center tabular-nums text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Older"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function LogRow({
  entry: e,
  open,
  onToggle,
  onLeadHistory,
}: {
  entry: LogEntry;
  open: boolean;
  onToggle: () => void;
  onLeadHistory: (leadId: string, label: string) => void;
}) {
  const a = actionMeta(e.action);
  const Icon = a.icon;
  const isAuth = e.category === "AUTH";
  const changes = e.changes ?? {};
  const fields = sortedFields(changes);
  const href = recordHref(e);
  const reason = typeof e.meta?.reason === "string" ? e.meta.reason : null;

  // "status: Quote sent → Customer accepted" for the first two fields of an update
  const summary =
    e.action === "UPDATE"
      ? fields.slice(0, 2).map((f) => {
          const c = changes[f];
          if (isStructured(c.from) || isStructured(c.to)) return `${humanize(f)} changed`;
          return `${humanize(f)}: ${formatValue(f, c.from, c.fromLabel, e.entityType)} → ${formatValue(f, c.to, c.toLabel, e.entityType)}`;
        })
      : [];

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="w-14 shrink-0 pt-1.5 text-xs tabular-nums text-muted-foreground">
          {format(new Date(e.createdAt), "h:mm a")}
        </span>
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", a.tone)}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-6">
            <span className="font-medium">{e.actorName ?? "System"}</span>
            {e.actorRole && !["SYSTEM", "API"].includes(e.actorRole) && (
              <span className="ml-1.5 rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                {formatRoleLabel(e.actorRole as UserRole)}
              </span>
            )}{" "}
            <span className="text-muted-foreground">{a.verb}</span>
            {!isAuth && (
              <>
                {" "}
                <span className="text-muted-foreground">{RECORD[e.entityType ?? ""] ?? e.entityType}</span>{" "}
                {e.entityLabel && <span className="font-medium">{e.entityLabel}</span>}
              </>
            )}
          </span>
          {(summary.length > 0 || reason || (isAuth && e.ip)) && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {[...summary, fields.length > 2 ? `+${fields.length - 2} more` : null, reason, isAuth ? `IP ${e.ip}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
        <ChevronDown className={cn("mt-2 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-dashed border-border bg-muted/20 px-5 py-4 sm:pl-[7.5rem]">
          {fields.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field</th>
                    {e.action !== "CREATE" && <th className="px-3 py-2 font-medium">Before</th>}
                    {e.action !== "DELETE" && <th className="px-3 py-2 font-medium">{e.action === "CREATE" ? "Value" : "After"}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fields.map((f) => {
                    const c = changes[f];
                    return (
                      <tr key={f} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{humanize(f)}</td>
                        {e.action !== "CREATE" && (
                          <td className="px-3 py-2 text-muted-foreground">
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
          )}

          <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <Meta label="When">{format(new Date(e.createdAt), "d MMM yyyy, h:mm:ss a")}</Meta>
            {e.actorEmail && <Meta label="Account">{e.actorEmail}</Meta>}
            {e.ip && <Meta label="IP address">{e.ip}</Meta>}
            {e.userAgent && (
              <Meta label="Browser">
                <span className="break-all">{e.userAgent}</span>
              </Meta>
            )}
            {e.meta &&
              Object.entries(e.meta).map(([k, v]) => (
                <Meta key={k} label={humanize(k)}>
                  {String(v)}
                </Meta>
              ))}
            {e.entityId && !isAuth && (
              <Meta label="Record ID">
                <span className="font-mono">{e.entityId}</span>
              </Meta>
            )}
          </dl>

          {(href || e.leadId) && (
            <div className="flex flex-wrap gap-2">
              {href && (
                <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                  Open {RECORD[e.entityType ?? ""] ?? "record"} <ArrowRight className="size-3.5" />
                </Link>
              )}
              {e.leadId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onLeadHistory(e.leadId!, e.entityType === "Lead" ? (e.entityLabel ?? "") : "")}
                >
                  <ScrollText className="size-3.5" /> Full history of this lead
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
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
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

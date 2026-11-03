"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  ChevronRight,
  Loader2,
  RotateCcw,
  Scale,
  Table2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn, formatDateIN, formatINR } from "@/lib/utils";
import { useDataChanged } from "@/hooks/useDataChanged";

// ── Data shape: GET /dashboard/profit (backend services/insights.service.ts) ──────────────
// All money excl. GST except cash in/out and balances (those are what actually moved / is owed).
interface Deal {
  quoteId: string;
  quoteNumber: string;
  orderNo: number;
  acceptedAt: string | null;
  customer: { id: string; name: string };
  category: string | null;
  po: { id: string; poNumber: string; status: string; vendor: { id: string; name: string } } | null;
  sell: number;
  buy: number | null;
  margin: number | null;
  marginPct: number | null;
  invoiced: number;
  vendorBilled: number;
  realisedMargin: number;
}
interface Insights {
  totals: {
    deals: number;
    dealsAwaitingPo: number;
    sellAwaitingPo: number;
    sell: number;
    buy: number;
    margin: number;
    marginPct: number | null;
    invoiced: number;
    vendorBilled: number;
    realisedMargin: number;
    cashIn: number;
    cashOut: number;
  };
  deals: Deal[];
  customers: { id: string; name: string; deals: number; sell: number; buy: number; margin: number; marginPct: number | null; awaitingPo: number }[];
  trend: { month: string; sell: number; buy: number; margin: number; marginPct: number | null }[];
  categories: { category: string; sell: number; buy: number; margin: number; marginPct: number | null; deals: number }[];
  vendors: { id: string; name: string; pos: number; spend: number }[];
  pipeline: { status: string; quotes: number; value: number }[];
  balances: { receivable: number; payable: number };
}

// Validated categorical slots 1–3 (dataviz reference palette), stepped per mode
const SERIES = {
  light: { sell: "#2a78d6", buy: "#eb6834", margin: "#1baf7a", grid: "#e7e5e4", axis: "#52514e" },
  dark: { sell: "#3987e5", buy: "#d95926", margin: "#199e70", grid: "#2e2d2b", axis: "#c3c2b7" },
};

type RangeKey = "month" | "quarter" | "fy" | "all" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "fy", label: "This FY" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];
interface Period {
  key: RangeKey;
  from?: string; // YYYY-MM-DD (IST calendar day)
  to?: string;
}

const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** IST calendar dates for a preset (filtering is by quote acceptance) */
function presetDates(key: Exclude<RangeKey, "custom">): { from?: string; to?: string } {
  const today = new Date(Date.now() + 330 * 60_000); // IST "now" as a UTC-shaped date
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (key === "month") return { from: ymd(new Date(Date.UTC(y, m, 1))), to: ymd(today) };
  if (key === "quarter") return { from: ymd(new Date(Date.UTC(y, m - 2, 1))), to: ymd(today) };
  if (key === "fy") return { from: ymd(new Date(Date.UTC(m >= 3 ? y : y - 1, 3, 1))), to: ymd(today) };
  return {};
}

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const periodLabel = (p: Period) =>
  !p.from && !p.to ? "All time" : `${p.from ? dayLabel(p.from) : "Start"} – ${p.to ? dayLabel(p.to) : "today"}`;

/** Whole rupees for the headline cards (the tables keep paise) */
const inr0 = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const compactINR = (n: number) =>
  Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : Math.abs(n) >= 1e3 ? `₹${(n / 1e3).toFixed(0)}k` : `₹${n}`;
const pctText = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)}%`);

/**
 * Profit & insights — buying vs selling, overall and per customer. Admin / MSP TL only
 * (the API refuses everyone else). Profit excludes GST.
 */
export function ProfitInsights() {
  const { resolvedTheme } = useTheme();
  const c = SERIES[resolvedTheme === "dark" ? "dark" : "light"];
  const [period, setPeriod] = useState<Period>({ key: "fy", ...presetDates("fy") });
  // custom range being edited (applied only on "Apply" so half-typed dates don't fetch)
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [customOpen, setCustomOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  // click outside the period picker closes the custom panel
  useEffect(() => {
    if (!customOpen) return;
    const onDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setCustomOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [customOpen]);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/profit", { params: { from: period.from, to: period.to } });
      setData(data.data);
      setError(false);
    } catch (err) {
      setError(true);
      notify.apiError(err, "Couldn't load profit figures");
    }
  }, [period]);

  useEffect(() => {
    // fetch after mount / range change; state is set when the request resolves
    const t = setTimeout(fetchData, 0);
    return () => clearTimeout(t);
  }, [fetchData]);
  useDataChanged(fetchData);

  const dealsByCustomer = useMemo(() => {
    const m = new Map<string, Deal[]>();
    for (const d of data?.deals ?? []) m.set(d.customer.id, [...(m.get(d.customer.id) ?? []), d]);
    return m;
  }, [data]);

  if (!data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        {error ? (
          <>
            <p>Couldn&apos;t load the profit figures.</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RotateCcw className="size-4" /> Retry
            </Button>
          </>
        ) : (
          <Loader2 className="size-6 animate-spin" />
        )}
      </div>
    );
  }

  const t = data.totals;
  const zeroMargin = data.customers.filter((x) => x.sell > 0 && x.margin <= 0);

  return (
    <div className="space-y-6">
      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{periodLabel(period)}</p>
          <p className="text-xs text-muted-foreground">Deals the customer accepted in this period · profit excludes GST</p>
        </div>
        <div className="relative" ref={pickerRef}>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm" role="radiogroup" aria-label="Period">
            {RANGES.map((r) => {
              // while the custom panel is open only "Custom" is highlighted
              const active = customOpen ? r.key === "custom" : period.key === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-expanded={r.key === "custom" ? customOpen : undefined}
                  onClick={() => {
                    if (r.key === "custom") {
                      setDraft({ from: period.from ?? "", to: period.to ?? todayIST() });
                      setCustomOpen((o) => !o);
                    } else {
                      setCustomOpen(false);
                      setPeriod({ key: r.key, ...presetDates(r.key) });
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.key === "custom" && <CalendarRange className="size-3.5" />}
                  {r.key === "custom" && period.key === "custom" && !customOpen ? periodLabel(period) : r.label}
                </button>
              );
            })}
          </div>

          {/* floating panel — doesn't push the page around */}
          {customOpen && (
            <form
              role="dialog"
              aria-label="Custom date range"
              className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
              onKeyDown={(e) => e.key === "Escape" && setCustomOpen(false)}
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.from || !draft.to || draft.from > draft.to) return;
                setPeriod({ key: "custom", from: draft.from, to: draft.to });
                setCustomOpen(false);
              }}
            >
              <p className="text-sm font-medium">Custom range</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pi-from" className="text-xs text-muted-foreground">From</Label>
                  <Input
                    id="pi-from"
                    type="date"
                    autoFocus
                    value={draft.from}
                    max={draft.to || todayIST()}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pi-to" className="text-xs text-muted-foreground">To</Label>
                  <Input
                    id="pi-to"
                    type="date"
                    value={draft.to}
                    min={draft.from || undefined}
                    max={todayIST()}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  />
                </div>
              </div>
              {draft.from && draft.to && draft.from > draft.to ? (
                <p className="text-xs text-destructive">“From” must be on or before “To”.</p>
              ) : (
                <p className="text-xs text-muted-foreground">By the date the customer accepted the quote.</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!draft.from || !draft.to || draft.from > draft.to}>
                  Apply
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Headline: profit as the sum it is, then cash and balances */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ProfitHero t={t} colors={c} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <CashCard cashIn={t.cashIn} cashOut={t.cashOut} colors={c} />
          <BalanceCard receivable={data.balances.receivable} payable={data.balances.payable} />
        </div>
      </div>

      {(t.dealsAwaitingPo > 0 || zeroMargin.length > 0) && (
        <div className="space-y-2">
          {t.dealsAwaitingPo > 0 && (
            <Note>
              {t.dealsAwaitingPo} accepted deal{t.dealsAwaitingPo === 1 ? "" : "s"} worth {formatINR(t.sellAwaitingPo)} have no PO yet — their
              cost isn&apos;t known, so they&apos;re left out of the profit above.
            </Note>
          )}
          {zeroMargin.length > 0 && (
            <Note>
              No profit on {zeroMargin.map((x) => x.name).join(", ")} — buying equals (or exceeds) selling. Check the buying prices on those
              POs.
            </Note>
          )}
        </div>
      )}

      {/* Trend */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold">Selling vs buying by month</h2>
            <p className="text-xs text-muted-foreground">By the month the customer accepted · excl. GST</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView(view === "chart" ? "table" : "chart")}>
            {view === "chart" ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
            {view === "chart" ? "Table" : "Chart"}
          </Button>
        </header>
        {data.trend.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No accepted deals with a PO in this period.</p>
        ) : view === "chart" ? (
          <div className="h-[300px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compactINR} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  cursor={{ fill: c.grid, opacity: 0.5 }}
                  formatter={(v, name) => [formatINR(Number(v)), name]}
                  labelFormatter={(m) => monthLabel(String(m))}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sell" name="Selling" fill={c.sell} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="buy" name="Buying" fill={c.buy} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Line dataKey="margin" name="Profit" stroke={c.margin} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: c.margin }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <SimpleTable
            head={["Month", "Selling", "Buying", "Profit", "Margin"]}
            rows={data.trend.map((m) => [monthLabel(m.month), formatINR(m.sell), formatINR(m.buy), formatINR(m.margin), pctText(m.marginPct)])}
          />
        )}
      </section>

      {/* Per customer */}
      <CustomerProfitTable customers={data.customers} dealsByCustomer={dealsByCustomer} colors={c} />

      {/* Smaller insights */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">By category</h2>
          </header>
          <SimpleTable
            head={["", "Selling", "Profit", "Margin"]}
            rows={data.categories.map((x) => [
              x.category === "HARDWARE" ? "Hardware" : x.category === "SOFTWARE" ? "Software" : "Uncategorized",
              compactINR(x.sell),
              compactINR(x.margin),
              pctText(x.marginPct),
            ])}
            empty="No deals with a PO yet."
          />
        </section>
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Top vendors by spend</h2>
          </header>
          <SimpleTable
            head={["Vendor", "POs", "Spend"]}
            rows={data.vendors.slice(0, 6).map((v) => [v.name, String(v.pos), compactINR(v.spend)])}
            empty="No POs in this period."
          />
        </section>
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Open quotes (now)</h2>
            <p className="text-xs text-muted-foreground">Selling value, excl. GST</p>
          </header>
          <SimpleTable
            head={["Stage", "Quotes", "Value"]}
            rows={data.pipeline.map((p) => [
              { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved, not sent", SENT: "With the customer" }[p.status] ?? p.status,
              String(p.quotes),
              compactINR(p.value),
            ])}
          />
        </section>
      </div>
    </div>
  );
}

type Totals = Insights["totals"];
type Colors = (typeof SERIES)["light"];

/** Selling − Buying = Profit, as numbers and as one split bar (selling = full width) */
function ProfitHero({ t, colors }: { t: Totals; colors: Colors }) {
  const costed = t.deals - t.dealsAwaitingPo;
  const loss = t.margin < 0;
  const buyShare = t.sell > 0 ? Math.min(100, (t.buy / t.sell) * 100) : 0;
  const profitShare = Math.max(0, 100 - buyShare);
  const realisedShare = t.margin > 0 ? Math.max(0, Math.min(100, (t.realisedMargin / t.margin) * 100)) : 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 lg:col-span-2">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/10 to-transparent dark:from-emerald-400/10" />
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: `${colors.margin}1f`, color: colors.margin }}>
                <TrendingUp className="size-4" />
              </span>
              Profit
            </p>
            <p className={cn("mt-2 text-4xl font-semibold tracking-tight tabular-nums", loss && "text-destructive")}>{inr0(t.margin)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              on {costed} deal{costed === 1 ? "" : "s"} with a PO
            </p>
          </div>
          {t.marginPct !== null && (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                loss ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              )}
            >
              {t.marginPct.toFixed(1)}% margin
            </span>
          )}
        </div>

        {/* the sum */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2 sm:gap-4">
          <Figure label="Selling" value={inr0(t.sell)} color={colors.sell} />
          <span className="pb-1 text-lg text-muted-foreground">−</span>
          <Figure label="Buying" value={inr0(t.buy)} color={colors.buy} />
          <span className="pb-1 text-lg text-muted-foreground">=</span>
          <Figure label="Profit" value={inr0(t.margin)} color={colors.margin} />
        </div>
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Buying is ${buyShare.toFixed(0)}% of selling, profit ${profitShare.toFixed(0)}%`}>
          {t.sell > 0 && (
            <>
              <span className="h-full rounded-l-full" style={{ width: `${buyShare}%`, background: colors.buy }} />
              {profitShare > 0 && <span className="h-full rounded-r-full" style={{ width: `${profitShare}%`, background: colors.margin }} />}
            </>
          )}
        </div>

        {/* realised so far */}
        <div className="rounded-xl bg-muted/50 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Realised so far: <span className="tabular-nums">{inr0(t.realisedMargin)}</span></span>
            <span className="text-xs text-muted-foreground">
              Invoiced {inr0(t.invoiced)} − vendor invoices {inr0(t.vendorBilled)}
            </span>
          </div>
          {t.margin > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
              <span className="block h-full rounded-full" style={{ width: `${realisedShare}%`, background: colors.margin, opacity: 0.7 }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <p className="truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function CashCard({ cashIn, cashOut, colors }: { cashIn: number; cashOut: number; colors: Colors }) {
  const net = cashIn - cashOut;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground">
            <Wallet className="size-4" />
          </span>
          Cash
        </p>
        <span className="text-xs text-muted-foreground">incl. GST & TDS</span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowDownLeft className="size-4" style={{ color: colors.sell }} /> Received
          </dt>
          <dd className="font-medium tabular-nums">{inr0(cashIn)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUpRight className="size-4" style={{ color: colors.buy }} /> Paid to vendors
          </dt>
          <dd className="font-medium tabular-nums">{inr0(cashOut)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="font-medium">Net cash</dt>
          <dd className={cn("text-base font-semibold tabular-nums", net < 0 && "text-destructive")}>{inr0(net)}</dd>
        </div>
      </dl>
    </section>
  );
}

function BalanceCard({ receivable, payable }: { receivable: number; payable: number }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground">
          <Scale className="size-4" />
        </span>
        Owed right now
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/accounts?side=customers&view=invoices" className="group rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50">
          <p className="text-xs text-muted-foreground">Customers owe us</p>
          <p className="text-lg font-semibold tabular-nums">{inr0(receivable)}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
            Invoices <ArrowRight className="size-3" />
          </p>
        </Link>
        <Link href="/accounts?side=vendors&view=bills" className="group rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/50">
          <p className="text-xs text-muted-foreground">We owe vendors</p>
          <p className="text-lg font-semibold tabular-nums">{inr0(payable)}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
            Vendor invoices <ArrowRight className="size-3" />
          </p>
        </Link>
      </div>
    </section>
  );
}

type CustomerRow = Insights["customers"][number];
type SortKey = "margin" | "marginPct" | "sell" | "deals";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "margin", label: "Profit" },
  { key: "marginPct", label: "Margin" },
  { key: "sell", label: "Selling" },
  { key: "deals", label: "Deals" },
];

/** Margin health: the % is always written, colour only reinforces it */
function MarginPill({ pct, hasCost }: { pct: number | null; hasCost: boolean }) {
  if (!hasCost || pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    pct <= 0
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : pct < 15
        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums", tone)}>
      {pct <= 0 && <AlertTriangle className="size-3" />}
      {pct.toFixed(1)}%
    </span>
  );
}

/** Bar sized by selling (vs the biggest customer), split into buying and profit */
function SplitBar({ sell, buy, max, colors }: { sell: number; buy: number; max: number; colors: Colors }) {
  if (sell <= 0) return <span className="block h-2 w-full rounded-full bg-muted" />;
  const width = Math.max(6, (sell / max) * 100);
  const buyPct = Math.min(100, (buy / sell) * 100);
  return (
    <span className="block h-2 w-full rounded-full bg-muted">
      <span className="flex h-full gap-0.5" style={{ width: `${width}%` }}>
        <span className="h-full rounded-l-full" style={{ width: `${buyPct}%`, background: colors.buy }} />
        {buyPct < 100 && <span className="h-full flex-1 rounded-r-full" style={{ background: colors.margin }} />}
      </span>
    </span>
  );
}

function CustomerProfitTable({
  customers,
  dealsByCustomer,
  colors,
}: {
  customers: CustomerRow[];
  dealsByCustomer: Map<string, Deal[]>;
  colors: Colors;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("margin");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((cu) => !q || cu.name.toLowerCase().includes(q))
      .sort((a, b) => (sort === "marginPct" ? (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity) : b[sort] - a[sort]));
  }, [customers, query, sort]);
  const maxSell = Math.max(1, ...customers.map((cu) => cu.sell));
  const total = rows.reduce((t, cu) => ({ sell: t.sell + cu.sell, buy: t.buy + cu.buy, margin: t.margin + cu.margin, deals: t.deals + cu.deals }), { sell: 0, buy: 0, margin: 0, deals: 0 });
  const totalPct = total.sell > 0 ? (total.margin / total.sell) * 100 : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">Profit by customer</h2>
          <p className="text-xs text-muted-foreground">
            {customers.length} customer{customers.length === 1 ? "" : "s"} · repeat orders add up · click a row for its deals
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer…"
            aria-label="Search customer"
            className="h-8 w-44"
          />
          <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Sort by">
            {SORTS.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={sort === o.key}
                onClick={() => setSort(o.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  sort === o.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-6 py-3 text-left font-medium">Customer</th>
              <th className="w-[26%] px-4 py-3 text-left font-medium">
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: colors.buy }} /> Buying</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: colors.margin }} /> Profit</span>
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Selling</th>
              <th className="px-4 py-3 text-right font-medium">Buying</th>
              <th className="px-4 py-3 text-right font-medium">Profit</th>
              <th className="px-6 py-3 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                  {customers.length === 0 ? "No accepted deals in this period." : `No customer matches “${query}”.`}
                </td>
              </tr>
            )}
            {rows.map((cu) => {
              const expanded = open === cu.id;
              const deals = dealsByCustomer.get(cu.id) ?? [];
              const repeat = deals.some((d) => d.orderNo > 1);
              const toggle = () => setOpen(expanded ? null : cu.id);
              return (
                <Fragment key={cu.id}>
                  <tr
                    className={cn("cursor-pointer border-t border-border transition-colors hover:bg-muted/40", expanded && "bg-muted/30")}
                    onClick={toggle}
                    tabIndex={0}
                    aria-expanded={expanded}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                          {cu.name.trim().charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{cu.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {cu.deals} deal{cu.deals === 1 ? "" : "s"}
                            {repeat ? " · repeat customer" : ""}
                            {cu.awaitingPo > 0 ? ` · ${cu.awaitingPo} awaiting PO` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SplitBar sell={cu.sell} buy={cu.buy} max={maxSell} colors={colors} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr0(cu.sell)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{inr0(cu.buy)}</td>
                    <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", cu.margin < 0 && "text-destructive")}>{inr0(cu.margin)}</td>
                    <td className="px-6 py-3 text-right">
                      <MarginPill pct={cu.marginPct} hasCost={cu.sell > 0} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-muted/30">
                      <td colSpan={6} className="px-6 pb-4 pt-1">
                        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                          {deals.map((d) => (
                            <li key={d.quoteId} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-4 py-3 text-xs sm:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-1.5">
                                  <Link href={`/quotes/${d.quoteId}`} className="font-mono text-sm font-medium hover:underline">
                                    {d.quoteNumber}
                                  </Link>
                                  {d.orderNo > 1 && <Badge variant="secondary" className="text-[10px]">Order #{d.orderNo}</Badge>}
                                  {d.category && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {d.category === "SOFTWARE" ? "Software" : "Hardware"}
                                    </Badge>
                                  )}
                                </p>
                                <p className="mt-0.5 text-muted-foreground">
                                  Accepted {formatDateIN(d.acceptedAt)} ·{" "}
                                  {d.po ? (
                                    <>
                                      <Link href={`/purchase-orders/${d.po.id}`} className="hover:underline">
                                        {d.po.poNumber}
                                      </Link>{" "}
                                      · {d.po.vendor.name}
                                    </>
                                  ) : (
                                    "no PO yet"
                                  )}
                                </p>
                              </div>
                              <DealFigure label="Selling" value={inr0(d.sell)} />
                              <DealFigure label="Buying" value={d.buy === null ? "—" : inr0(d.buy)} />
                              <DealFigure label="Profit" value={d.margin === null ? "—" : inr0(d.margin)} strong sub={`Realised ${inr0(d.realisedMargin)}`} />
                              <div className="text-right">
                                <MarginPill pct={d.marginPct} hasCost={d.buy !== null} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-medium">
                <td className="px-6 py-3">
                  Total <span className="font-normal text-muted-foreground">· {total.deals} deals</span>
                </td>
                <td className="px-4 py-3">
                  <SplitBar sell={total.sell} buy={total.buy} max={total.sell} colors={colors} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{inr0(total.sell)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{inr0(total.buy)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{inr0(total.margin)}</td>
                <td className="px-6 py-3 text-right">
                  <MarginPill pct={totalPct} hasCost={total.sell > 0} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function DealFigure({ label, value, sub, strong = false }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="hidden text-right sm:block">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong ? "text-sm font-semibold" : "text-sm")}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function SimpleTable({ head, rows, empty = "Nothing here yet." }: { head: string[]; rows: string[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn("px-4 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={cn("px-4 py-2", j === 0 ? "text-left" : "text-right tabular-nums")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

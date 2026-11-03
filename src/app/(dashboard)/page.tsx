"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  ClipboardCheck,
  CheckCircle2,
  Trophy,
  Wallet,
  ClipboardList,
  Loader2,
  BarChart3,
  PieChart as PieIcon,
  ArrowDownLeft,
  ArrowUpRight,
  AlarmClock,
  CalendarClock,
} from "lucide-react";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { useDataChanged } from "@/hooks/useDataChanged";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter, useSearchParams } from "next/navigation";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import { ProfitInsights } from "@/components/insights/ProfitInsights";
import { KpiCard } from "./_components/KpiCard";
import { NextSteps } from "./_components/NextSteps";
import {
  DateRangeToggle,
  type DashboardRange,
} from "./_components/DateRangeToggle";
import { FunnelChart, type FunnelStage } from "./_components/FunnelChart";
import {
  ActivityChart,
  type ActivityPoint,
} from "./_components/ActivityChart";
import {
  StatusDonut,
  type DistributionItem,
} from "./_components/StatusDonut";
import { TeamTable, type TeamMemberStats } from "./_components/TeamTable";

interface Overview {
  activeLeads: { value: number; delta: number };
  pendingApproval: { value: number };
  quotesApproved: { value: number; delta: number };
  winRate: { value: number };
  dealValue: { value: number };
  momsPending: { value: number };
}

// Short money for KPI tiles (₹1.2L) — full amounts use formatINR from lib/utils
const formatINRCompact = (n: number) => {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n}`;
};

interface Money {
  receivable: number;
  payable: number;
  overdueInvoices: number;
  overdueInvoiceAmount: number;
  overdueBills: number;
  overdueBillAmount: number;
}

/** Accounts' view: what's owed both ways and what's past due (IST "today") */
async function fetchMoney(): Promise<Money> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  type Row = { outstanding: number; dueDate?: string | null };
  const [cust, vend, invs, bills] = await Promise.all([
    api.get("/ledgers/customers").then((r) => (r.data.data ?? []) as Row[]),
    api.get("/ledgers/vendors").then((r) => (r.data.data ?? []) as Row[]),
    api.get("/invoices").then((r) => (r.data.data ?? []) as Row[]),
    api.get("/purchase-invoices").then((r) => (r.data.data ?? []) as Row[]),
  ]);
  const owed = (rows: Row[]) => rows.reduce((a, r) => a + Math.max(0, r.outstanding ?? 0), 0);
  const overdue = (rows: Row[]) => rows.filter((r) => (r.outstanding ?? 0) > 0 && r.dueDate && r.dueDate.slice(0, 10) < today);
  const od = overdue(invs);
  const ob = overdue(bills);
  return {
    receivable: owed(cust),
    payable: owed(vend),
    overdueInvoices: od.length,
    overdueInvoiceAmount: owed(od),
    overdueBills: ob.length,
    overdueBillAmount: owed(ob),
  };
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isManager = user?.role === "MSP_TL" || user?.role === "ADMIN";
  // Profit & insights tab — Admin / MSP TL only (the API refuses everyone else too)
  const router = useRouter();
  const searchParams = useSearchParams();
  const showProfit = isManager && searchParams.get("tab") === "profit";
  const setTab = (t: "overview" | "profit") => router.replace(t === "profit" ? "/?tab=profit" : "/");

  const [range, setRange] = useState<DashboardRange>(30);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [team, setTeam] = useState<TeamMemberStats[]>([]);
  const [money, setMoney] = useState<Money | null>(null);
  const isAccounts = user?.role === "ACCOUNTS";

  const fetchAll = useCallback(async () => {
    try {
      // loading starts true; later refreshes (range change, live updates) keep the page on screen
      if (isAccounts) fetchMoney().then(setMoney).catch((err) => notify.apiError(err, "Couldn't load receivables / payables"));
      const requests: Promise<unknown>[] = [
        api.get(`/dashboard/overview?range=${range}`),
        api.get(`/dashboard/funnel`),
        api.get(`/dashboard/activity?range=${range}`),
        api.get(`/dashboard/distribution`),
      ];
      if (isManager) {
        requests.push(api.get(`/dashboard/team?range=${range}`));
      }
      const results = await Promise.all(requests);
      const [ov, fu, ac, di, tm] = results as Array<{
        data: { data: unknown };
      }>;
      setOverview(ov.data.data as Overview);
      setFunnel(fu.data.data as FunnelStage[]);
      setActivity(ac.data.data as ActivityPoint[]);
      setDistribution(di.data.data as DistributionItem[]);
      if (tm) setTeam(tm.data.data as TeamMemberStats[]);
    } catch (err) {
      notify.apiError(err, "Couldn't load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [range, isManager, isAccounts]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useDataChanged(fetchAll);

  if (loading && !overview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {showProfit
              ? "Buying vs selling — overall, per customer and per deal."
              : isManager
                ? "Team pipeline, activity and performance."
                : "Your pipeline, activity and performance."}
          </p>
        </div>
        {!showProfit && <DateRangeToggle value={range} onChange={setRange} />}
      </div>

      {isManager && (
        <PillTabs
          tabs={
            [
              { value: "overview", label: "Overview" },
              { value: "profit", label: "Profit & insights" },
            ] as PillTab<"overview" | "profit">[]
          }
          value={showProfit ? "profit" : "overview"}
          onChange={setTab}
        />
      )}

      {showProfit ? (
        <ProfitInsights />
      ) : (
      <>

      <NextSteps />

      {/* Accounts: money KPIs instead of the sales pipeline ones */}
      {isAccounts && money && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Receivable" value={formatINRCompact(money.receivable)} icon={ArrowDownLeft} tint="emerald" subtle="Customers owe us" />
          <KpiCard label="Payable" value={formatINRCompact(money.payable)} icon={ArrowUpRight} tint="amber" subtle="We owe vendors" />
          <KpiCard
            label="Overdue invoices"
            value={money.overdueInvoices}
            icon={AlarmClock}
            tint="rose"
            subtle={money.overdueInvoices ? `${formatINRCompact(money.overdueInvoiceAmount)} past due` : "Nothing overdue"}
          />
          <KpiCard
            label="Overdue vendor invoices"
            value={money.overdueBills}
            icon={CalendarClock}
            tint="violet"
            subtle={money.overdueBills ? `${formatINRCompact(money.overdueBillAmount)} past due` : "Nothing overdue"}
          />
        </div>
      )}

      {/* KPI strip */}
      {overview && !isAccounts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Active Leads"
            value={overview.activeLeads.value}
            icon={Users}
            tint="blue"
            delta={overview.activeLeads.delta}
          />
          <KpiCard
            label="Pending Approval"
            value={overview.pendingApproval.value}
            icon={ClipboardCheck}
            tint="amber"
            subtle="Awaiting review"
          />
          <KpiCard
            label="Quotes Approved"
            value={overview.quotesApproved.value}
            icon={CheckCircle2}
            tint="emerald"
            delta={overview.quotesApproved.delta}
          />
          <KpiCard
            label="Win Rate"
            value={`${overview.winRate.value}%`}
            icon={Trophy}
            tint="violet"
            subtle={`Last ${range} days`}
          />
          <KpiCard
            label="Deal Value"
            value={formatINRCompact(overview.dealValue.value)}
            icon={Wallet}
            tint="sky"
            subtle="Approved quotes"
          />
          <KpiCard
            label="MOMs Pending"
            value={overview.momsPending.value}
            icon={ClipboardList}
            tint="rose"
            subtle="Past meetings w/o MOM"
          />
        </div>
      )}

      {/* Funnel */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <BarChart3 className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pipeline Funnel</h2>
        </header>
        <div className="p-5">
          <FunnelChart stages={funnel} />
        </div>
      </section>

      {/* Two-column charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card lg:col-span-2">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <BarChart3 className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Activity Timeline</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              Last {range} days
            </span>
          </header>
          <div className="p-5">
            <ActivityChart data={activity} />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <PieIcon className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Lead Distribution</h2>
          </header>
          <div className="p-5">
            <StatusDonut data={distribution} />
          </div>
        </section>
      </div>

      {/* Team performance (MSP TL / Admin only) */}
      {isManager && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Team Performance</h2>
            <span className="text-xs text-muted-foreground">
              Click a row to drill into a team member
            </span>
          </div>
          <TeamTable rows={team} />
        </section>
      )}
      </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Users,
  ClipboardCheck,
  CheckCircle2,
  Trophy,
  Wallet,
  Clock,
  Loader2,
  BarChart3,
  PieChart as PieIcon,
} from "lucide-react";
import api from "@/lib/axios";
import { cn, formatRoleLabel, formatStatusLabel, getStatusColor, formatDateTimeIN } from "@/lib/utils";
import type { UserRole, LeadStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "../../_components/KpiCard";
import {
  DateRangeToggle,
  type DashboardRange,
} from "../../_components/DateRangeToggle";
import { FunnelChart, type FunnelStage } from "../../_components/FunnelChart";
import {
  ActivityChart,
  type ActivityPoint,
} from "../../_components/ActivityChart";
import {
  StatusDonut,
  type DistributionItem,
} from "../../_components/StatusDonut";

interface UserDetail {
  user: { id: string; name: string; email: string; role: string };
  overview: {
    activeLeads: { value: number; delta: number };
    pendingApproval: { value: number };
    quotesApproved: { value: number; delta: number };
    winRate: { value: number };
    dealValue: { value: number };
    momsPending: { value: number };
  };
  funnel: FunnelStage[];
  activity: ActivityPoint[];
  distribution: DistributionItem[];
  activeLeads: Array<{
    id: string;
    companyName: string;
    status: string;
    category: string | null;
    subcategory: string[];
    updatedAt: string;
  }>;
  avgApprovalHours: number | null;
}

const formatINR = (n: number) => {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${n}`;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TeamMemberDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [range, setRange] = useState<DashboardRange>(30);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"forbidden" | "notfound" | "error" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get(
        `/dashboard/user/${userId}?range=${range}`
      );
      setData(data.data as UserDetail);
      setLoadError(null);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setLoadError(status === 403 ? "forbidden" : status === 404 ? "notfound" : "error");
    } finally {
      setLoading(false);
    }
  }, [userId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/")}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <p>
            {loadError === "forbidden"
              ? "You can only see your own performance — team views are for Admin and MSP TL."
              : loadError === "notfound"
                ? "That user doesn't exist (or was removed)."
                : "Couldn't load this dashboard. Check your connection and try again."}
          </p>
          {loadError === "error" && (
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { user, overview, funnel, activity, distribution, activeLeads, avgApprovalHours } =
    data;

  return (
    <div className="space-y-6 pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </button>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{user.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-lg font-semibold text-white">
            {initials(user.name)}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {formatRoleLabel(user.role as UserRole)}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {user.name}
            </h1>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DateRangeToggle value={range} onChange={setRange} />
      </div>

      {/* KPI strip */}
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
        />
        <KpiCard
          label="Deal Value"
          value={formatINR(overview.dealValue.value)}
          icon={Wallet}
          tint="sky"
        />
        <KpiCard
          label="Avg Approval"
          value={
            avgApprovalHours !== null
              ? avgApprovalHours < 24
                ? `${avgApprovalHours}h`
                : `${(avgApprovalHours / 24).toFixed(1)}d`
              : "—"
          }
          icon={Clock}
          tint="rose"
          subtle="Submit → approved"
        />
      </div>

      {/* Funnel */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <BarChart3 className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Their Pipeline</h2>
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

      {/* Active leads */}
      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Active Leads</h2>
            <Badge variant="secondary" className="text-xs">
              {activeLeads.length}
            </Badge>
          </div>
        </header>
        {activeLeads.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active leads.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Company</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Last activity
                  </th>
                  <th className="w-8 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeLeads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/leads/${l.id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-medium">{l.companyName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.category
                        ? `${l.category === "HARDWARE" ? "Hardware" : "Software"}${
                            l.subcategory.length
                              ? ` · ${l.subcategory.join(", ")}`
                              : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn("text-[11px]", getStatusColor(l.status as LeadStatus))}
                      >
                        {formatStatusLabel(l.status as LeadStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTimeIN(l.updatedAt)}
                    </td>
                    <td className="pr-3 text-muted-foreground">
                      <ChevronRight className="size-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

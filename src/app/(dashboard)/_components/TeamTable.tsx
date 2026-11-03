"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn, formatRoleLabel } from "@/lib/utils";
import type { UserRole } from "@/types";

export interface TeamMemberStats {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  activeLeads: number;
  calls: number;
  momsDone: number;
  quotesSubmitted: number;
  quotesApproved: number;
  winRate: number;
  dealValue: number;
  lastActivityAt: string | null;
  health: "on_track" | "stalled" | "silent";
}

const HEALTH_META: Record<
  TeamMemberStats["health"],
  { label: string; className: string; dot: string }
> = {
  on_track: {
    label: "On track",
    className:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
  stalled: {
    label: "Stalled",
    className:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
    dot: "bg-amber-500",
  },
  silent: {
    label: "Silent",
    className:
      "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
    dot: "bg-rose-500",
  },
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TeamTable({ rows }: { rows: TeamMemberStats[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-10 text-sm text-muted-foreground">
        No team members yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">Member</th>
              <th className="px-4 py-3 text-right font-medium">Active</th>
              <th className="px-4 py-3 text-right font-medium">Calls</th>
              <th className="px-4 py-3 text-right font-medium">MOMs</th>
              <th className="px-4 py-3 text-right font-medium">Submitted</th>
              <th className="px-4 py-3 text-right font-medium">Approved</th>
              <th className="px-4 py-3 text-right font-medium">Win %</th>
              <th className="px-4 py-3 text-right font-medium">Deal Value</th>
              <th className="px-4 py-3 text-left font-medium">Health</th>
              <th className="w-8 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const meta = HEALTH_META[r.health];
              return (
                <tr
                  key={r.user.id}
                  onClick={() => router.push(`/team/${r.user.id}`)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-xs font-semibold text-white">
                        {initials(r.user.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {r.user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatRoleLabel(r.user.role as UserRole)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.activeLeads}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.calls}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.momsDone}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.quotesSubmitted}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.quotesApproved}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                        r.winRate >= 60
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : r.winRate >= 30
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {r.winRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatINR(r.dealValue)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                        meta.className
                      )}
                    >
                      <span
                        className={cn("size-1.5 rounded-full", meta.dot)}
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td className="pr-3 text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

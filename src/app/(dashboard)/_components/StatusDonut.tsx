"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CSSProperties } from "react";
import { formatStatusLabel } from "@/lib/utils";
import type { LeadStatus } from "@/types";

export interface DistributionItem {
  status: string;
  count: number;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "#64748B",
  CATEGORIZED: "#8B5CF6",
  ASSIGNED: "#F59E0B",
  MEETING_SCHEDULED: "#06B6D4",
  MEETING_DONE: "#14B8A6",
  MOM_ADDED: "#6366F1",
  QUOTE_REQUESTED: "#EAB308",
  QUOTE_CREATED: "#3B82F6",
  QUOTE_SUBMITTED: "#A855F7",
  QUOTE_APPROVED: "#10B981",
  QUOTE_REJECTED: "#F43F5E",
  QUOTE_SENT: "#0EA5E9",
  CUSTOMER_ACCEPTED: "#84CC16",
  PO_PENDING_ACCOUNTS: "#FB923C",
  PO_CONFIRMED: "#22D3EE",
  PO_SENT: "#22C55E",
  INVOICED: "#A78BFA",
  DEAL_REGISTERED: "#16A34A",
};

export function StatusDonut({ data }: { data: DistributionItem[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No leads yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: formatStatusLabel(d.status as LeadStatus),
    value: d.count,
    status: d.status,
  }));

  return (
    <div className="relative h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.status}
                fill={STATUS_COLORS[entry.status] ?? "#94A3B8"}
              />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ outline: "none", zIndex: 20 } as CSSProperties}
            position={{ x: 0, y: 0 }}
            cursor={false}
            contentStyle={{
              borderRadius: 8,
              fontSize: 12,
              borderColor: "var(--border)",
              padding: "6px 10px",
            }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-[30px] top-0 flex flex-col items-center justify-center text-center">
        <div className="text-xl font-semibold leading-none tabular-nums">
          {total}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Total
        </div>
      </div>
    </div>
  );
}

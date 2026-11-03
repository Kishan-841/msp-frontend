"use client";

import * as React from "react";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

const STAGE_COLORS = [
  "#0EA5E9", // sky
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#22C55E", // green
];

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const widthPct = Math.max(2, (stage.count / maxCount) * 100);
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv =
          prev !== null && prev > 0
            ? Math.round((stage.count / prev) * 100)
            : null;
        const color = STAGE_COLORS[i % STAGE_COLORS.length];

        return (
          <div key={stage.key} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium text-foreground">
              {stage.label}
            </span>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="w-6 text-right font-semibold">
                {stage.count}
              </span>
              {conv !== null ? (
                <span
                  className={`inline-flex w-12 justify-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    conv >= 70
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : conv >= 40
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                  }`}
                >
                  {conv}%
                </span>
              ) : (
                <span className="w-12" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

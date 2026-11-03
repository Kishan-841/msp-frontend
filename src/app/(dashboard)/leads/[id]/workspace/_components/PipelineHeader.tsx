"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageStatus } from "./StageCard";

export interface PipelineStep {
  label: string;
  status: StageStatus;
  icon: React.ElementType;
}

export function PipelineHeader({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === steps.length - 1;
          return (
            <React.Fragment key={i}>
              <li className="flex min-w-[120px] flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors",
                    step.status === "done" &&
                      "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20",
                    step.status === "active" &&
                      "bg-[#3B82F6] text-white shadow-sm shadow-[#3B82F6]/30 ring-4 ring-[#3B82F6]/15",
                    step.status === "upcoming" &&
                      "bg-muted text-muted-foreground"
                  )}
                >
                  {step.status === "done" ? (
                    <Check className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    step.status === "active" && "text-foreground",
                    step.status === "done" && "text-foreground",
                    step.status === "upcoming" && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </li>
              {!isLast && (
                <div
                  className={cn(
                    "mb-5 h-0.5 min-w-8 flex-1 rounded-full",
                    step.status === "done" ? "bg-emerald-500" : "bg-border"
                  )}
                  aria-hidden
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
}

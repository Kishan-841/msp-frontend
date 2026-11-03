"use client";

import * as React from "react";
import { Check, Circle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageStatus = "done" | "active" | "upcoming";

interface StageCardProps {
  step: number;
  title: string;
  description?: string;
  icon?: React.ElementType;
  status: StageStatus;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  /** Set when this user may not do this step — shown instead of the step's controls */
  locked?: string;
}

export function StageCard({
  step,
  title,
  description,
  icon: Icon,
  status,
  summary,
  children,
  locked,
}: StageCardProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border transition-all",
        status === "active" && "border-[#3B82F6]/40 bg-card shadow-md shadow-[#3B82F6]/5",
        status === "done" && "border-border bg-card",
        status === "upcoming" && "border-dashed border-border bg-muted/30"
      )}
    >
      {/* Active accent bar */}
      {status === "active" && (
        <span className="absolute inset-y-0 left-0 w-1 bg-[#3B82F6]" aria-hidden />
      )}

      <header className="flex items-start gap-4 px-6 py-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
            status === "done" &&
              "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30",
            status === "active" &&
              "bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white shadow-sm shadow-[#3B82F6]/30",
            status === "upcoming" && "bg-muted text-muted-foreground"
          )}
        >
          {status === "done" ? (
            <Check className="size-5" />
          ) : status === "upcoming" ? (
            // not reached yet — a neutral dot (the lock means "not your step", below)
            <Circle className="size-4" />
          ) : locked ? (
            <Lock className="size-4" aria-label="Not your step" />
          ) : Icon ? (
            <Icon className="size-5" />
          ) : (
            <Circle className="size-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wide",
                status === "done" && "text-emerald-600 dark:text-emerald-400",
                status === "active" && "text-[#3B82F6]",
                status === "upcoming" && "text-muted-foreground"
              )}
            >
              Step {step}
            </span>
            {status === "done" && (
              <span className="text-[11px] font-medium text-muted-foreground">
                · Completed
              </span>
            )}
            {status === "active" && (
              <span className="text-[11px] font-medium text-[#3B82F6]">
                · In progress
              </span>
            )}
          </div>
          <h3
            className={cn(
              "mt-0.5 text-base font-semibold",
              status === "upcoming" && "text-muted-foreground"
            )}
          >
            {title}
          </h3>
          {description && status !== "done" && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
          {status === "done" && summary && (
            <div className="mt-1 text-sm text-muted-foreground">{summary}</div>
          )}
        </div>
      </header>

      {status === "active" && locked && (
        <div className="border-t border-border px-6 pb-5 pt-4 text-sm text-muted-foreground">{locked}</div>
      )}
      {status === "active" && !locked && children && (
        <div className="border-t border-border px-6 pb-6 pt-4">{children}</div>
      )}
    </section>
  );
}

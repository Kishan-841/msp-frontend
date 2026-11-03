"use client";

import { useState } from "react";
import { Loader2, Check, Tags, Cpu, Cloud, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { Lead, LeadCategory } from "@/types";
import { SUBCATEGORIES } from "@/lib/categories";


interface CategorizeDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead: Lead | null;
}

export function CategorizeDialog({
  open,
  onClose,
  onSuccess,
  lead,
}: CategorizeDialogProps) {
  const [category, setCategory] = useState<LeadCategory | "">("");
  const [subcategory, setSubcategory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCategoryChange = (value: LeadCategory) => {
    setCategory(value);
    setSubcategory([]);
  };

  const toggleSub = (sub: string) => {
    setSubcategory((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const reset = () => {
    setCategory("");
    setSubcategory([]);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!lead || !category || subcategory.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/leads/${lead.id}/categorize`, {
        category,
        subcategory,
      });
      notify.success(
        `Lead marked as ${category === "HARDWARE" ? "Hardware" : "Software"}`,
        `${lead.companyName} · ${subcategory.join(", ")}${lead.assignedTo ? "" : " — next, assign it to a Sales person"}`
      );
      onSuccess();
      onClose();
      reset();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to categorize lead";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="border-b border-border bg-gradient-to-br from-muted/40 to-transparent px-6 pt-5 pb-4">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-md bg-[#3B82F6]/10 text-[#3B82F6]">
                <Tags className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold">
                Categorize lead
              </DialogTitle>
            </div>
            {lead && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                <span className="font-medium text-foreground">
                  {lead.companyName}
                </span>
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Category picker */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Category
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "HARDWARE", label: "Hardware", icon: Cpu, hint: "Physical devices" },
                  { value: "SOFTWARE", label: "Software", icon: Cloud, hint: "Software & cloud" },
                ] as const
              ).map(({ value, label, icon: Icon, hint }) => {
                const active = category === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleCategoryChange(value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                      active
                        ? "border-[#3B82F6] bg-[#3B82F6]/[0.04] ring-1 ring-[#3B82F6]/30"
                        : "border-border bg-card hover:bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md",
                        active
                          ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {hint}
                      </div>
                    </div>
                    {active && <Check className="size-4 text-[#3B82F6]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subcategory chips */}
          {category && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subcategories
                </span>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">
                  {subcategory.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUBCATEGORIES[category as LeadCategory].map((sub) => {
                  const active = subcategory.includes(sub);
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => toggleSub(sub)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-[#3B82F6] bg-[#3B82F6] text-white"
                          : "border-border bg-card text-foreground hover:bg-muted/60"
                      )}
                    >
                      {active && <Check className="size-3" />}
                      {sub}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="m-0 flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {category && subcategory.length
              ? "Ready to categorize"
              : "Pick a category and at least one subcategory"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !category || subcategory.length === 0}
              size="sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Tags className="size-3.5" />
                  Categorize
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

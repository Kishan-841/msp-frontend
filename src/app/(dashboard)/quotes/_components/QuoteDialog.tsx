"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Building2,
  Send,
  Plus,
  Trash2,
  Package,
  Wrench,
  Save,
  ClipboardList,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_UNIT, UNITS } from "@/lib/units";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { formatINR } from "@/lib/utils";
import { notify } from "@/lib/notify";
import type { Quote, Lead } from "@/types";

// Draft shapes — prices are excl. GST; amounts are computed (backend recomputes on save)
type DraftItem = {
  make: string;
  description: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  gstPercent: number;
};
type DraftService = { description: string; price: number; gstPercent: number };
type DraftRequirement = {
  name: string;
  items: DraftItem[];
  services: DraftService[];
};

const DEFAULT_GST = 18;
const emptyItem = (): DraftItem => ({
  make: "",
  description: "",
  hsnCode: "",
  quantity: 1,
  unit: DEFAULT_UNIT,
  unitPrice: 0,
  gstPercent: DEFAULT_GST,
});
const emptyService = (): DraftService => ({
  description: "",
  price: 0,
  gstPercent: DEFAULT_GST,
});
const emptyRequirement = (): DraftRequirement => ({
  name: "",
  items: [emptyItem()],
  services: [],
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Same per-line rounding as backend utils/quoteCalc.ts
const line = (taxable: number, gstPercent: number) => {
  const t = round2(taxable);
  const g = round2((t * (Number(gstPercent) || 0)) / 100);
  return { taxable: t, gst: g, total: round2(t + g) };
};
const itemLine = (it: DraftItem) =>
  line((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), it.gstPercent);
const serviceLine = (sv: DraftService) => line(Number(sv.price) || 0, sv.gstPercent);

function totalsFor(reqs: DraftRequirement[]) {
  const lines = reqs.flatMap((r) => [
    ...r.items.map(itemLine),
    ...r.services.map(serviceLine),
  ]);
  const subtotal = round2(lines.reduce((a, l) => a + l.taxable, 0));
  const gst = round2(lines.reduce((a, l) => a + l.gst, 0));
  return { subtotal, gst, total: round2(subtotal + gst) };
}

function validate(reqs: DraftRequirement[]): string | null {
  if (reqs.length === 0) return "Add at least one requirement.";
  for (const [i, r] of reqs.entries()) {
    const label = r.name.trim() || `Requirement ${i + 1}`;
    if (!r.name.trim()) return `${label}: enter a requirement name (e.g. Firewall).`;
    if (r.items.length + r.services.length === 0)
      return `${label}: add at least one item or service.`;
    for (const it of r.items) {
      if (!it.make.trim()) return `${label}: every item needs a make (e.g. Fortinet).`;
      if (!it.hsnCode.trim()) return `${label}: every item needs an HSN code.`;
      if (!(Number(it.quantity) > 0)) return `${label}: item quantity must be more than 0.`;
    }
    for (const sv of r.services) {
      if (!sv.description.trim()) return `${label}: every service needs a description.`;
    }
  }
  return null;
}

interface QuoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  quote?: Quote | null;
  preselectedLeadId?: string;
}

function formatCategory(lead: Lead | null) {
  if (!lead?.category) return null;
  const main = lead.category === "HARDWARE" ? "Hardware" : "Software";
  return lead.subcategory && lead.subcategory.length > 0
    ? `${main} → ${lead.subcategory.join(", ")}`
    : main;
}


export function QuoteDialog({
  open,
  onClose,
  onSuccess,
  quote,
  preselectedLeadId,
}: QuoteDialogProps) {
  const isEdit = !!quote;
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadLoading, setLeadLoading] = useState(false);
  const [submitting, setSubmitting] = useState<"draft" | "submit" | null>(null);

  const [requirements, setRequirements] = useState<DraftRequirement[]>([
    emptyRequirement(),
  ]);
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const leadId = preselectedLeadId ?? quote?.leadId;

  const fetchLead = useCallback(async (id: string, prefill: boolean) => {
    setLeadLoading(true);
    try {
      const { data } = await api.get(`/leads/${id}`);
      const loaded = data.data as Lead;
      setLead(loaded);
      // New quote: one requirement per product Sales picked — hardware starts with an
      // item row, software (e.g. Cloud) with a service row
      if (prefill && loaded.requirementItems?.length) {
        setRequirements(
          loaded.requirementItems.map((r) => {
            // Catalogue items Sales picked → pre-filled rows (MSP TL adds HSN + price)
            const picked = (r.materials ?? []).map((m) => ({
              ...emptyItem(),
              make: m.brand || m.name,
              description: m.brand ? m.name : "",
              quantity: m.quantity,
            }));
            return {
              name: r.name,
              items: r.category === "HARDWARE" ? (picked.length ? picked : [emptyItem()]) : [],
              services:
                r.category === "SOFTWARE"
                  ? picked.length
                    ? (r.materials ?? []).map((m) => ({ ...emptyService(), description: `${m.name} × ${m.quantity}` }))
                    : [emptyService()]
                  : [],
            };
          })
        );
      }
    } catch (err) {
      setLead(null);
      notify.apiError(err, "Couldn't load the lead's requirement");
    } finally {
      setLeadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTouched(false);
    if (leadId) fetchLead(leadId, !quote);
    else setLead(null);

    if (quote) {
      setRequirements(
        (quote.items ?? []).map((r) => ({
          name: r.name,
          items: r.items.map((it) => ({
            make: it.make,
            description: it.description ?? "",
            hsnCode: it.hsnCode,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            gstPercent: it.gstPercent,
          })),
          services: r.services.map((sv) => ({
            description: sv.description,
            price: sv.price,
            gstPercent: sv.gstPercent,
          })),
        }))
      );
      setNotes(quote.notes ?? "");
    } else {
      setRequirements([emptyRequirement()]);
      setNotes("");
    }
  }, [open, leadId, quote, fetchLead]);

  // ---- state helpers
  // edits by the user mark the form dirty (closing then asks before discarding)
  const setReqs: typeof setRequirements = (v) => {
    setTouched(true);
    setRequirements(v);
  };

  const updateReq = (ri: number, patch: Partial<DraftRequirement>) =>
    setReqs((prev) =>
      prev.map((r, i) => (i === ri ? { ...r, ...patch } : r))
    );
  const updateItem = (ri: number, ii: number, patch: Partial<DraftItem>) =>
    setReqs((prev) =>
      prev.map((r, i) =>
        i === ri
          ? { ...r, items: r.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }
          : r
      )
    );
  const updateService = (ri: number, si: number, patch: Partial<DraftService>) =>
    setReqs((prev) =>
      prev.map((r, i) =>
        i === ri
          ? {
              ...r,
              services: r.services.map((sv, j) => (j === si ? { ...sv, ...patch } : sv)),
            }
          : r
      )
    );

  const totals = totalsFor(requirements);

  const save = async (mode: "draft" | "submit") => {
    if (!leadId) {
      setError("No lead selected.");
      return;
    }
    const problem = validate(requirements);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(mode);
    try {
      const payload = {
        notes: notes.trim() || undefined,
        requirements: requirements.map((r) => ({
          name: r.name.trim(),
          items: r.items.map((it) => ({
            make: it.make.trim(),
            description: it.description.trim() || undefined,
            hsnCode: it.hsnCode.trim(),
            quantity: Number(it.quantity),
            unit: it.unit.trim() || DEFAULT_UNIT,
            unitPrice: Number(it.unitPrice),
            gstPercent: Number(it.gstPercent),
          })),
          services: r.services.map((sv) => ({
            description: sv.description.trim(),
            price: Number(sv.price),
            gstPercent: Number(sv.gstPercent),
          })),
        })),
      };

      let quoteId: string;
      let quoteNumber: string;
      if (isEdit && quote) {
        await api.put(`/quotes/${quote.id}`, payload);
        quoteId = quote.id;
        quoteNumber = quote.quoteNumber;
      } else {
        const { data } = await api.post("/quotes", { leadId, ...payload });
        quoteId = data.data.id;
        quoteNumber = data.data.quoteNumber;
      }

      if (mode === "submit") {
        try {
          await api.patch(`/quotes/${quoteId}/submit`);
        } catch (err) {
          // saved, but not submitted — say so instead of a generic failure
          onSuccess();
          onClose();
          notify.warning("Quote saved, but not submitted", `${quoteNumber} is still a draft — ${(err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "submit it again from the quote."}`);
          return;
        }
      }

      onSuccess();
      onClose();
      const total = formatINR(totals.total);
      if (mode === "submit") {
        notify.success("Quote sent for approval", `${quoteNumber} (${total}) — Admin will approve or reject it.`);
      } else if (isEdit) {
        notify.success("Quote updated", `${quoteNumber} — still a draft. Submit it for approval when it's ready.`);
      } else {
        notify.action("Quote saved as draft", `${quoteNumber} (${total}) — submit it for Admin approval when it's ready.`, {
          label: "Open quote",
          onClick: () => router.push(`/quotes/${quoteId}`),
        });
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Something went wrong";
      setError(message);
    } finally {
      setSubmitting(null);
    }
  };

  const categoryLabel = formatCategory(lead);
  const busy = submitting !== null;
  const guard = useDiscardGuard(touched, onClose);

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => !val && !busy && guard.requestClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>{isEdit ? "Edit Quote" : "Build Quote"}</DialogTitle>
          <DialogDescription>
            Add each requirement with its items and services. Prices are without
            GST — GST is added per line.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Lead summary + Sales' final requirement */}
          {leadLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 py-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading lead...
            </div>
          ) : lead ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-white">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{lead.companyName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.contactPerson}
                    {categoryLabel && (
                      <>
                        {" · "}
                        <span className="font-medium text-foreground">{categoryLabel}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              {lead.finalRequirement && (
                <div className="flex gap-2 rounded-md bg-background px-3 py-2 text-sm ring-1 ring-inset ring-border">
                  <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Customer requirement (from Sales)
                    </p>
                    <p className="whitespace-pre-wrap">{lead.finalRequirement}</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Requirements */}
          {requirements.map((req, ri) => {
            const reqTotals = totalsFor([req]);
            return (
              <div key={ri} className="space-y-4 rounded-xl border border-border p-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`req-${ri}`}>Requirement {ri + 1}</Label>
                    <Input
                      id={`req-${ri}`}
                      placeholder="e.g. Firewall"
                      value={req.name}
                      onChange={(e) => updateReq(ri, { name: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={requirements.length === 1}
                    onClick={() =>
                      setReqs((prev) => prev.filter((_, i) => i !== ri))
                    }
                    aria-label={`Remove requirement ${ri + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Package className="size-3.5" /> Items
                  </p>
                  {req.items.length > 0 && (
                    <div className="-mx-1 overflow-x-auto px-1 py-1">
                      {/* padding gives focus rings room (a scroll container clips anything outside it);
                          negative margin only on the sides so the vertical spacing stays intact */}
                      <div className="min-w-[800px] space-y-1.5">
                        <div className="grid grid-cols-[1.4fr_1.6fr_0.9fr_0.7fr_0.9fr_1.1fr_0.7fr_1.1fr_auto] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                          <span>Make</span>
                          <span>Model / description</span>
                          <span>HSN</span>
                          <span>Qty</span>
                          <span>Unit</span>
                          <span>Rate (excl. GST)</span>
                          <span>GST %</span>
                          <span className="text-right">Amount</span>
                          <span className="w-8" />
                        </div>
                        {req.items.map((it, ii) => (
                          <div
                            key={ii}
                            className="grid grid-cols-[1.4fr_1.6fr_0.9fr_0.7fr_0.9fr_1.1fr_0.7fr_1.1fr_auto] items-center gap-2"
                          >
                            <Input
                              aria-label={`Item ${ii + 1} make`}
                              placeholder="Fortinet"
                              value={it.make}
                              onChange={(e) => updateItem(ri, ii, { make: e.target.value })}
                            />
                            <Input
                              aria-label={`Item ${ii + 1} model / description`}
                              placeholder="FortiGate 60F"
                              value={it.description}
                              onChange={(e) =>
                                updateItem(ri, ii, { description: e.target.value })
                              }
                            />
                            <Input
                              aria-label={`Item ${ii + 1} HSN code`}
                              placeholder="8517"
                              value={it.hsnCode}
                              onChange={(e) => updateItem(ri, ii, { hsnCode: e.target.value })}
                            />
                            <Input
                              type="number"
                              onFocus={(e) => e.target.select()}
                              min={0}
                              className="tabular-nums"
                              aria-label={`Item ${ii + 1} quantity`}
                              value={it.quantity}
                              onChange={(e) =>
                                updateItem(ri, ii, { quantity: Number(e.target.value) })
                              }
                            />
                            <UnitSelect
                              value={it.unit}
                              onChange={(unit) => updateItem(ri, ii, { unit })}
                            />
                            <Input
                              type="number"
                              onFocus={(e) => e.target.select()}
                              min={0}
                              className="tabular-nums"
                              aria-label={`Item ${ii + 1} rate excluding GST`}
                              value={it.unitPrice}
                              onChange={(e) =>
                                updateItem(ri, ii, { unitPrice: Number(e.target.value) })
                              }
                            />
                            <GstSelect
                              label={`Item ${ii + 1} GST %`}
                              value={it.gstPercent}
                              onChange={(gstPercent) => updateItem(ri, ii, { gstPercent })}
                            />
                            <span
                              className="truncate text-right text-sm font-medium tabular-nums"
                              title="Amount incl. GST"
                            >
                              {formatINR(itemLine(it).total)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                updateReq(ri, { items: req.items.filter((_, j) => j !== ii) })
                              }
                              aria-label={`Remove item ${ii + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateReq(ri, { items: [...req.items, emptyItem()] })}
                  >
                    <Plus className="size-4" />
                    Add item
                  </Button>
                </div>

                {/* Services */}
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Wrench className="size-3.5" /> Services
                  </p>
                  {req.services.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[4fr_1.1fr_0.7fr_1.1fr_auto] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                        <span>Description (incl. provider)</span>
                        <span>Price (excl. GST)</span>
                        <span>GST %</span>
                        <span className="text-right">Amount</span>
                        <span className="w-8" />
                      </div>
                      {req.services.map((sv, si) => (
                        <div
                          key={si}
                          className="grid grid-cols-[4fr_1.1fr_0.7fr_1.1fr_auto] items-center gap-2"
                        >
                          <Input
                            aria-label={`Service ${si + 1} description`}
                            placeholder="Firewall installation by ABC Networks"
                            value={sv.description}
                            onChange={(e) =>
                              updateService(ri, si, { description: e.target.value })
                            }
                          />
                          <Input
                            type="number"
                            onFocus={(e) => e.target.select()}
                            min={0}
                            className="tabular-nums"
                            aria-label={`Service ${si + 1} price excluding GST`}
                            value={sv.price}
                            onChange={(e) =>
                              updateService(ri, si, { price: Number(e.target.value) })
                            }
                          />
                          <GstSelect
                            label={`Service ${si + 1} GST %`}
                            value={sv.gstPercent}
                            onChange={(gstPercent) => updateService(ri, si, { gstPercent })}
                          />
                          <span className="truncate text-right text-sm font-medium tabular-nums">
                            {formatINR(serviceLine(sv).total)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              updateReq(ri, {
                                services: req.services.filter((_, j) => j !== si),
                              })
                            }
                            aria-label={`Remove service ${si + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateReq(ri, { services: [...req.services, emptyService()] })
                    }
                  >
                    <Plus className="size-4" />
                    Add service
                  </Button>
                </div>

                <div className="flex justify-end text-xs text-muted-foreground">
                  {req.name.trim() || `Requirement ${ri + 1}`}{" "}total:&nbsp;
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatINR(reqTotals.total)}
                  </span>
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() => setReqs((prev) => [...prev, emptyRequirement()])}
          >
            <Plus className="size-4" />
            Add requirement
          </Button>

          {/* Totals + meta */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-muted-foreground">
                  Notes <span className="text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="Terms, delivery, anything for the approver..."
                  value={notes}
                  onChange={(e) => {
                setTouched(true);
                setNotes(e.target.value);
              }}
                />
              </div>
            </div>
            <div className="space-y-1.5 self-end rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (excl. GST)</span>
                <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatINR(totals.gst)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5">
                <span className="font-medium">Grand total</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatINR(totals.total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="m-0 flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-xs text-destructive">{error}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={guard.requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => save("draft")}
              disabled={busy || !leadId}
            >
              {submitting === "draft" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Draft
            </Button>
            <Button type="button" onClick={() => save("submit")} disabled={busy || !leadId}>
              {submitting === "submit" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Submit for Approval
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {guard.dialog}
    </>
  );
}

/** Unit dropdown for item rows. A unit saved on an older quote that isn't in the list stays selectable. */
function UnitSelect({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const current = value?.trim() || DEFAULT_UNIT;
  const options = (UNITS as readonly string[]).includes(current) ? UNITS : [current, ...UNITS];
  return (
    <Select value={current} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger className="w-full" aria-label="Unit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-32">
        {options.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** GST slabs; a rate saved on an older quote that isn't a standard slab stays selectable */
const GST_SLABS = [0, 5, 12, 18, 28];
function GstSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const current = Number(value) || 0;
  const options = GST_SLABS.includes(current) ? GST_SLABS : [...GST_SLABS, current].sort((a, b) => a - b);
  return (
    <Select value={String(current)} onValueChange={(v) => v != null && onChange(Number(v))}>
      <SelectTrigger className="w-full tabular-nums" aria-label={label}>
        <SelectValue>{(v: string) => `${v}%`}</SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-24">
        {options.map((g) => (
          <SelectItem key={g} value={String(g)}>
            {g}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

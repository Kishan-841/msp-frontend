"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { CATEGORY_LABEL, SUBCATEGORIES } from "@/lib/categories";
import { apiErrorMessage, cn } from "@/lib/utils";
import type { Lead, LeadCategory, Material, RequirementItem, RequirementMaterial } from "@/types";
import { ProductItems } from "./ProductItems";

type PickerLead = Pick<Lead, "id" | "companyName" | "category" | "subcategory" | "requirementItems">;

/**
 * Sales picks the products the customer needs (from lib/categories), adds details,
 * and sends the lead to MSP TL for a quote. Used by the lead workspace and the
 * Meetings → Final Requirement tab.
 */
export function RequirementPicker({
  lead,
  onSent,
  inDialog = false,
}: {
  lead: PickerLead;
  onSent: () => void | Promise<void>;
  inDialog?: boolean;
}) {
  // Start from what was picked before, else from the lead's categorized products
  const [items, setItems] = useState<RequirementItem[]>(() =>
    lead.requirementItems?.length
      ? lead.requirementItems
      : lead.category
        ? (lead.subcategory ?? []).map((name) => ({ category: lead.category!, name }))
        : []
  );
  const [notes, setNotes] = useState("");
  const [catalogue, setCatalogue] = useState<Material[]>([]);

  // Whole catalogue once — it's small, and grouping by product happens per row
  useEffect(() => {
    api
      .get("/materials")
      .then(({ data }) => setCatalogue(data.data ?? []))
      .catch(() => {
        setCatalogue([]);
        notify.warning("Couldn't load the item catalogue", "You can still pick products and add items by hand.");
      });
  }, []);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPicked = (category: LeadCategory, name: string) =>
    items.some((i) => i.category === category && i.name === name);

  const toggle = (category: LeadCategory, name: string) =>
    setItems((prev) =>
      isPicked(category, name)
        ? prev.filter((i) => !(i.category === category && i.name === name))
        : [...prev, { category, name }]
    );

  const setDetails = (idx: number, details: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, details } : it)));

  const setMaterials = (idx: number, materials: RequirementMaterial[]) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, materials } : it)));

  const send = async () => {
    try {
      setSending(true);
      setError(null);
      await api.post(`/leads/${lead.id}/request-quote`, {
        items: items.map((i) => ({
          ...i,
          details: i.details?.trim() || undefined,
          materials: i.materials?.filter((m) => m.quantity > 0),
        })),
        notes: notes.trim() || undefined,
      });
      notify.success(
        "Requirement sent to MSP TL",
        `${lead.companyName} · ${items.map((i) => i.name).join(", ")} — MSP TL will now build the quote`
      );
      await onSent();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not send the lead for a quote"));
    } finally {
      setSending(false);
    }
  };

  const pickedCount = items.reduce((a, i) => a + (i.materials?.length ?? 0), 0);

  // In a dialog the body scrolls and the footer (Send) stays visible; inline it just flows
  return (
    <div className={cn("flex flex-col", inDialog && "min-h-0 flex-1")}>
      <div className={cn("space-y-4", inDialog && "min-h-0 flex-1 overflow-y-auto px-6 py-4")}>
        {(Object.keys(SUBCATEGORIES) as LeadCategory[]).map((category) => (
          <div key={category} className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[category]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUBCATEGORIES[category].map((name) => {
                const active = isPicked(category, name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(category, name)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#3B82F6]"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {active && <CheckCircle2 className="size-3.5" />}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <div className="space-y-2">
            <Label>Items & details</Label>
            {items.map((it, idx) => (
              <ProductItems
                key={`${it.category}-${it.name}`}
                product={it}
                catalogue={catalogue.filter((m) => m.product === it.name && m.category === it.category)}
                onCatalogueAdd={(m) =>
                  setCatalogue((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
                }
                onMaterialsChange={(materials) => setMaterials(idx, materials)}
                onDetailsChange={(details) => setDetails(idx, details)}
              />
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="req-notes">
            Other notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="req-notes"
            rows={2}
            placeholder="Budget, timeline, anything else MSP TL should know"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3",
          inDialog ? "border-t border-border bg-muted/30 px-6 py-3" : "pt-4"
        )}
      >
        <span className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {error ??
            (items.length
              ? `${items.length} product${items.length === 1 ? "" : "s"}${pickedCount ? ` · ${pickedCount} item${pickedCount === 1 ? "" : "s"}` : ""}`
              : "Pick at least one product")}
        </span>
        <Button onClick={send} disabled={items.length === 0 || sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send for Quote
        </Button>
      </div>
    </div>
  );
}

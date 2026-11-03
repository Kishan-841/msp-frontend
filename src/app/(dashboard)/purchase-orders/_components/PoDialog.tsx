"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Send, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { formatINR } from "@/lib/utils";
import { stateName } from "@/lib/gst";
import { VendorDialog } from "@/app/(dashboard)/vendors/_components/VendorDialog";
import type { CompanySettings, PurchaseOrder, Quote, Vendor } from "@/types";

// One row per quote line, in the same order the backend uses (utils/poCalc.ts quoteLines).
// MSP TL enters the vendor's buying rate; the customer's rate is shown for reference only
// and never goes on the vendor's PO.
type Row = {
  requirement: string;
  description: string;
  hsnCode?: string;
  quantity: number;
  unit: string;
  customerRate: number;
  buyingRate: number;
  gstPercent: number;
};

function rowsFromQuote(quote: Quote): Row[] {
  return quote.items.flatMap((req) => [
    ...req.items.map((it) => ({
      requirement: req.name,
      description: it.description ? `${it.make} — ${it.description}` : it.make,
      hsnCode: it.hsnCode,
      quantity: it.quantity,
      unit: it.unit,
      customerRate: it.unitPrice,
      buyingRate: 0,
      gstPercent: it.gstPercent,
    })),
    ...req.services.map((sv) => ({
      requirement: req.name,
      description: sv.description,
      quantity: 1,
      unit: "Service",
      customerRate: sv.price,
      buyingRate: 0,
      gstPercent: sv.gstPercent,
    })),
  ]);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface PoDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (po: PurchaseOrder) => void;
  quoteId?: string; // create
  po?: PurchaseOrder | null; // edit (draft / rejected)
}

export function PoDialog({ open, onClose, onSuccess, quoteId, po }: PoDialogProps) {
  const isEdit = !!po;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [title, setTitle] = useState("");

  const [vendorId, setVendorId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  // any edit by the user — closing then asks before throwing it away
  const [touched, setTouched] = useState(false);

  const fetchVendors = useCallback(async () => {
    const { data } = await api.get("/vendors");
    setVendors(data.data ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTouched(false);
    setLoading(true);
    (async () => {
      try {
        const [, settings] = await Promise.all([fetchVendors(), api.get("/settings/company")]);
        setCompany(settings.data.data ?? null);
        if (po) {
          setTitle(`${po.poNumber} · ${po.lead?.companyName ?? ""}`);
          setVendorId(po.vendorId);
          setRows(po.items.map((l) => ({ ...l, buyingRate: l.rate, customerRate: l.customerRate ?? l.rate })));
          setDeliveryAddress(po.deliveryAddress ?? "");
          setExpectedDate(po.expectedDeliveryDate?.slice(0, 10) ?? "");
          setNotes(po.notes ?? "");
        } else if (quoteId) {
          const { data } = await api.get(`/quotes/${quoteId}`);
          const quote = data.data as Quote & { lead?: { billingAddress?: string | null } };
          setTitle(`${quote.quoteNumber} · ${quote.lead?.companyName ?? ""}`);
          setVendorId("");
          setRows(rowsFromQuote(quote));
          // Default to our own address — the vendor must not see the customer's site
          setDeliveryAddress((settings.data.data as CompanySettings | null)?.address ?? "");
          setExpectedDate("");
          setNotes("");
        }
      } catch {
        setError("Could not load the quote or vendors.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, po, quoteId, fetchVendors]);

  const vendor = vendors.find((v) => v.id === vendorId) ?? po?.vendor;
  // Same rule as the backend: our state vs vendor state
  const gstType =
    company?.state && vendor?.state ? (company.state === vendor.state ? "INTRA" : "INTER") : null;

  const totals = useMemo(() => {
    const lines = rows.map((r) => {
      const taxable = round2(r.quantity * (Number(r.buyingRate) || 0));
      return { taxable, gst: round2((taxable * r.gstPercent) / 100) };
    });
    const subtotal = round2(lines.reduce((a, l) => a + l.taxable, 0));
    const gst = round2(lines.reduce((a, l) => a + l.gst, 0));
    return { lines, subtotal, gst, total: round2(subtotal + gst) };
  }, [rows]);

  const save = async (mode: "draft" | "submit") => {
    // checks before sending: a toast (the form is long — an inline note could be scrolled away)
    if (!vendorId) {
      notify.warning("Pick a vendor", "Choose who this PO goes to (or add a new vendor).");
      return;
    }
    const missing = rows.filter((r) => !(Number(r.buyingRate) > 0)).length;
    if (mode === "submit" && missing > 0) {
      notify.warning(
        "Buying price missing",
        `Enter the vendor's price for ${missing} more line${missing === 1 ? "" : "s"} before sending to Accounts — or save as draft.`
      );
      return;
    }
    setError(null);
    setSaving(mode);
    try {
      const payload = {
        vendorId,
        buyingRates: rows.map((r) => Number(r.buyingRate) || 0),
        deliveryAddress: deliveryAddress.trim(),
        expectedDeliveryDate: expectedDate,
        notes: notes.trim(),
      };
      const { data } = isEdit
        ? await api.put(`/purchase-orders/${po.id}`, payload)
        : await api.post("/purchase-orders", { quoteId, ...payload });
      let saved = data.data as PurchaseOrder;
      const vendorName = vendors.find((v) => v.id === vendorId)?.name ?? "the vendor";
      if (mode === "submit") {
        try {
          const res = await api.patch(`/purchase-orders/${saved.id}/submit`);
          saved = res.data.data;
        } catch (err) {
          // saved, but not sent — say so instead of a generic failure
          onSuccess(saved);
          onClose();
          notify.warning(
            "PO saved, but not sent to Accounts",
            `${saved.poNumber} is still a draft — ${(err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "send it again from the PO."}`
          );
          return;
        }
      }
      onSuccess(saved);
      onClose();
      if (mode === "submit") {
        notify.success("PO sent to Accounts", `${saved.poNumber} for ${vendorName} (${formatINR(saved.totalAmount)}) — Accounts will confirm or send it back.`);
      } else if (isEdit) {
        notify.success("PO updated", `${saved.poNumber} — still a draft. Send it to Accounts when the buying prices are final.`);
      } else {
        // callers open the new PO right away, so no "Open PO" button is needed here
        notify.success("PO created", `${saved.poNumber} for ${vendorName} saved as a draft — send it to Accounts when the buying prices are final.`);
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Something went wrong"
      );
    } finally {
      setSaving(null);
    }
  };

  const busy = saving !== null;

  const guard = useDiscardGuard(touched, onClose);
  // user edits mark the form dirty
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setTouched(true);
    set(v);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && !busy && guard.requestClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>{isEdit ? "Edit Purchase Order" : "Create Purchase Order"}</DialogTitle>
          <DialogDescription>
            {title} — lines come from the quote; pick the vendor and enter what they charge us.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Vendor */}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select value={vendorId || null} onValueChange={(v) => edit(setVendorId)(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a vendor">
                      {vendor ? `${vendor.name}${vendor.state ? ` · ${stateName(vendor.state)}` : ""}` : "Pick a vendor"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.state ? ` · ${stateName(v.state)}` : " · no state"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => setVendorDialogOpen(true)}>
                <Plus className="size-4" />
                New vendor
              </Button>
            </div>
            {!company?.state && (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4" /> Company state isn&apos;t set — an Admin must fill it in Settings
                before a PO can be saved.
              </p>
            )}
            {vendor && !vendor.state && (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="size-4" /> {vendor.name} has no GSTIN/state — edit the vendor first.
              </p>
            )}

            {/* Lines (from the quote) */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Line</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Customer rate</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Buying rate</th>
                    <th className="px-3 py-2 text-right font-medium">GST</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.requirement}
                          {r.hsnCode ? ` · HSN ${r.hsnCode}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.quantity} {r.unit}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(r.customerRate)}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          aria-label={`Buying rate for ${r.description}`}
                          className="text-right tabular-nums"
                          value={r.buyingRate}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            edit(setRows)(rows.map((x, j) => (j === i ? { ...x, buyingRate: Number(e.target.value) } : x)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.gstPercent}%</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatINR(totals.lines[i].taxable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals + meta */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="po-delivery">Deliver to</Label>
                  <Textarea
                    id="po-delivery"
                    rows={2}
                    value={deliveryAddress}
                    onChange={(e) => edit(setDeliveryAddress)(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="po-date">Expected delivery</Label>
                    <Input
                      id="po-date"
                      type="date"
                      value={expectedDate}
                      onChange={(e) => edit(setExpectedDate)(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="po-notes">Terms / notes for the vendor</Label>
                  <Textarea id="po-notes" rows={2} value={notes} onChange={(e) => edit(setNotes)(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5 self-end rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal at buying rates (excl. GST)</span>
                  <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {gstType === "INTRA" ? "CGST + SGST" : gstType === "INTER" ? "IGST" : "GST"}
                  </span>
                  <span className="tabular-nums">{formatINR(totals.gst)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="font-medium">PO total</span>
                  <span className="text-lg font-semibold tabular-nums">{formatINR(totals.total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="m-0 flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-xs text-destructive">{error}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={guard.requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save("draft")} disabled={busy || loading}>
              {saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Draft
            </Button>
            <Button onClick={() => save("submit")} disabled={busy || loading}>
              {saving === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send to Accounts
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <VendorDialog
        open={vendorDialogOpen}
        onClose={() => setVendorDialogOpen(false)}
        onSuccess={async (v) => {
          await fetchVendors();
          setVendorId(v.id);
          setTouched(true);
        }}
      />
    </Dialog>
    {guard.dialog}
    </>
  );
}

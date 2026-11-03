"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
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
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { apiErrorMessage, formatINR } from "@/lib/utils";
import type { ReadyToInvoice } from "@/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Customer invoice from an accepted quote — bill all or part of what's left, at customer prices */
export function RaiseInvoiceDialog({
  deal,
  onClose,
  onSuccess,
}: {
  deal: ReadyToInvoice | null;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<number[]>([]);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false); // any field edited → confirm before discarding

  useEffect(() => {
    if (!deal) return;
    setQty(deal.remaining);
    setInvoiceDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    setDueDate(new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    setNotes("");
    setError(null);
    setTouched(false);
  }, [deal]);
  const guard = useDiscardGuard(touched && !saving, onClose);

  if (!deal) return null;

  const lines = deal.lines.map((l, i) => {
    const taxable = round2((Number(qty[i]) || 0) * l.rate);
    return { taxable, gst: round2((taxable * l.gstPercent) / 100) };
  });
  const subtotal = round2(lines.reduce((a, l) => a + l.taxable, 0));
  const gst = round2(lines.reduce((a, l) => a + l.gst, 0));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/invoices", {
        quoteId: deal.id,
        invoiceDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        lines: qty.map((q, lineIndex) => ({ lineIndex, quantity: Number(q) || 0 })).filter((l) => l.quantity > 0),
      });
      const inv = data.data as { id: string; invoiceNumber: string; totalAmount: number };
      notify.action(
        `Invoice ${inv.invoiceNumber} raised`,
        `${formatINR(inv.totalAmount)} to ${deal.lead.companyName} — record the receipt when they pay.`,
        { label: "View invoice", onClick: () => router.push(`/invoices/${inv.id}`) }
      );
      onSuccess(inv.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not raise the invoice"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-2xl" onChangeCapture={() => setTouched(true)}>
        <DialogHeader>
          <DialogTitle>Invoice {deal.lead.companyName}</DialogTitle>
          <DialogDescription>
            {deal.quoteNumber}
            {deal.customerPoNumber ? ` · Customer PO ${deal.customerPoNumber}` : ""} — customer prices. Set a
            quantity to 0 to bill that line later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Line</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Left</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Bill now</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deal.lines.map((l, i) => (
                  <tr key={i} className={deal.remaining[i] <= 0 ? "opacity-50" : ""}>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {deal.remaining[i]} {l.unit}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={deal.remaining[i]}
                        step="any"
                        disabled={deal.remaining[i] <= 0}
                        className="text-right tabular-nums"
                        value={qty[i] ?? 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setQty((prev) => prev.map((q, j) => (j === i ? Number(e.target.value) : q)))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(lines[i].taxable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ri-date">Invoice date</Label>
              <Input id="ri-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ri-due">Due date</Label>
              <Input id="ri-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable</span>
                <span className="tabular-nums">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(subtotal + gst)}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ri-notes">Notes on invoice</Label>
            <Textarea id="ri-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || subtotal <= 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
            Raise Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

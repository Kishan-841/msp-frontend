"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Receipt } from "lucide-react";
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
import { uploadAttachment } from "@/components/attachments/AttachmentList";
import type { ReadyToBill } from "@/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Vendor invoice against a PO sent to the vendor — bill all or part of what's left at the
 * PO buying rates. We number it (PINV/FY/NNNN); the vendor's own invoice no. is kept alongside.
 */
export function RecordBillDialog({
  po,
  onClose,
  onSuccess,
}: {
  po: ReadyToBill | null;
  onClose: () => void;
  onSuccess: (billId: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [qty, setQty] = useState<number[]>([]);
  const [vendorNo, setVendorNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false); // any field edited → confirm before discarding

  useEffect(() => {
    if (!po) return;
    setQty(po.remaining);
    setInvoiceDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    setDueDate(new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    setVendorNo("");
    setNotes("");
    setFile(null);
    setError(null);
    setTouched(false);
  }, [po]);
  const guard = useDiscardGuard(touched && !saving, onClose);

  if (!po) return null;

  const lines = po.lines.map((l, i) => {
    const taxable = round2((Number(qty[i]) || 0) * l.rate);
    return { taxable, gst: round2((taxable * l.gstPercent) / 100) };
  });
  const subtotal = round2(lines.reduce((a, l) => a + l.taxable, 0));
  const gst = round2(lines.reduce((a, l) => a + l.gst, 0));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/purchase-invoices", {
        purchaseOrderId: po.id,
        vendorInvoiceNumber: vendorNo.trim() || undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        lines: qty.map((q, lineIndex) => ({ lineIndex, quantity: Number(q) || 0 })).filter((l) => l.quantity > 0),
      });
      const bill = data.data as { id: string; billNumber: string; totalAmount: number };
      notify.action(
        `Vendor invoice ${bill.billNumber} recorded`,
        `${formatINR(bill.totalAmount)} payable to ${po.vendor.name} for ${po.poNumber} — pay it from Vendors → Bills when due.`,
        { label: "Open vendor invoices", onClick: () => router.push("/accounts?side=vendors&view=bills") }
      );
      if (file) {
        // the bill exists either way — a failed upload only needs the file attached again
        await notify
          .promise(uploadAttachment(file, "PURCHASE_INVOICE", bill.id), {
            loading: `Attaching ${file.name}…`,
            success: "Vendor's invoice file attached",
            error: "Couldn't attach the file — add it from the PO page",
          })
          .catch(() => undefined);
      }
      onSuccess(bill.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not record the vendor invoice"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-2xl" onChangeCapture={() => setTouched(true)}>
        <DialogHeader>
          <DialogTitle>Vendor invoice · {po.vendor.name}</DialogTitle>
          <DialogDescription>
            {po.poNumber} — PO buying rates ({po.gstType === "INTRA" ? "CGST + SGST" : "IGST"}). We number it
            automatically; set a quantity to 0 if the vendor hasn&apos;t billed that line yet.
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
                  <th className="w-28 px-3 py-2 text-right font-medium">Billed now</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {po.lines.map((l, i) => (
                  <tr key={i} className={po.remaining[i] <= 0 ? "opacity-50" : ""}>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {po.remaining[i]} {l.unit}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={po.remaining[i]}
                        step="any"
                        disabled={po.remaining[i] <= 0}
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
              <Label htmlFor="rb-vno">Vendor&apos;s invoice no.</Label>
              <Input
                id="rb-vno"
                placeholder="As printed on their invoice"
                value={vendorNo}
                onChange={(e) => setVendorNo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-date">Invoice date</Label>
              <Input id="rb-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb-due">Due date</Label>
              <Input id="rb-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="rb-notes">Notes</Label>
              <Textarea id="rb-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="min-w-48 space-y-1 self-end rounded-md bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Taxable</span>
                <span className="tabular-nums">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatINR(gst)}</span>
              </div>
              <div className="flex justify-between gap-4 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(subtotal + gst)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.eml,.msg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" />
              {file ? "Change file" : "Attach vendor's invoice"}
            </Button>
            <span className="truncate text-xs text-muted-foreground">{file?.name ?? "PDF or image (optional)"}</span>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || subtotal <= 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
            Record Vendor Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

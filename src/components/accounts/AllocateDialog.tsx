"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { notify } from "@/lib/notify";
import { apiErrorMessage, formatINR } from "@/lib/utils";
import type { Payment } from "@/types";

type Open = { id: string; number: string; outstanding: number };

/** Apply the unapplied part of an advance to one of the same party's open invoices */
export function AllocateDialog({
  open,
  onClose,
  onSuccess,
  payment,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  payment: Payment;
}) {
  const [invoices, setInvoices] = useState<Open[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInvoiceId("");
    const req =
      payment.direction === "IN"
        ? api.get("/invoices", { params: { leadId: payment.leadId } }).then(({ data }) =>
            (data.data ?? []).map((i: { id: string; invoiceNumber: string; outstanding: number }) => ({
              id: i.id,
              number: i.invoiceNumber,
              outstanding: i.outstanding,
            }))
          )
        : api.get("/purchase-invoices", { params: { vendorId: payment.vendorId } }).then(({ data }) =>
            (data.data ?? []).map((b: { id: string; billNumber: string; outstanding: number }) => ({
              id: b.id,
              number: b.billNumber,
              outstanding: b.outstanding,
            }))
          );
    req.then((list: Open[]) => setInvoices(list.filter((i) => i.outstanding > 0))).catch(() => setInvoices([]));
  }, [open, payment]);

  const selected = invoices.find((i) => i.id === invoiceId);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/payments/${payment.id}/allocate`, { invoiceId, amount: Number(amount) });
      notify.success(
        "Advance applied",
        `${formatINR(Number(amount))} of ${payment.number} adjusted against ${selected?.number ?? "the invoice"}.`
      );
      await onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not apply the advance"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply {payment.number}</DialogTitle>
          <DialogDescription>{formatINR(payment.unallocated)} of this payment is not applied yet.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Invoice</Label>
            <Select
              value={invoiceId || null}
              onValueChange={(v) => {
                setInvoiceId(v ?? "");
                const inv = invoices.find((i) => i.id === v);
                setAmount(inv ? Math.min(inv.outstanding, payment.unallocated) : 0);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick an open invoice">
                  {selected ? `${selected.number} · ${formatINR(selected.outstanding)} due` : "Pick an open invoice"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {invoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.number} · {formatINR(i.outstanding)} due
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {invoices.length === 0 && <p className="text-xs text-muted-foreground">No open invoices for this party.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alloc-amount">Amount to apply</Label>
            <Input
              id="alloc-amount"
              type="number"
              min={0}
              className="tabular-nums"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !invoiceId || !(amount > 0)}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

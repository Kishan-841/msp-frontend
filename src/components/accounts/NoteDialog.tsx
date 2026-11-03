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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { apiErrorMessage, formatINR } from "@/lib/utils";

type Kind = "CREDIT" | "DEBIT";

interface NoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  side: "SALES" | "PURCHASE";
  invoice: { id: string; number: string };
}

/** Credit note reduces what's owed on the invoice; debit note increases it */
export function NoteDialog({ open, onClose, onSuccess, side, invoice }: NoteDialogProps) {
  const isSales = side === "SALES";
  const [kind, setKind] = useState<Kind>("CREDIT");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [taxable, setTaxable] = useState(0);
  const [gstPercent, setGstPercent] = useState(18);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false); // any field edited → confirm before discarding

  useEffect(() => {
    if (!open) return;
    setKind("CREDIT");
    setNumber("");
    setDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    setTaxable(0);
    setGstPercent(18);
    setReason("");
    setError(null);
    setTouched(false);
  }, [open]);
  const guard = useDiscardGuard(touched && !saving, onClose);

  const gst = Math.round(((Number(taxable) || 0) * gstPercent) / 100 * 100) / 100;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/notes", {
        side,
        kind,
        invoiceId: invoice.id,
        noteDate: date,
        taxableAmount: Number(taxable),
        gstAmount: gst,
        reason: reason.trim(),
        number: isSales ? undefined : number.trim(),
      });
      const noteNo: string = data.data?.number ?? (isSales ? "" : number.trim());
      const total = formatINR(Math.round(((Number(taxable) || 0) + gst) * 100) / 100);
      const owed = isSales ? "the customer owes" : "we owe the vendor";
      if (kind === "CREDIT") {
        notify.success("Credit note recorded", `${noteNo ? `${noteNo} · ` : ""}${total} off ${invoice.number} — reduces what ${owed}.`);
      } else {
        notify.warning("Debit note recorded", `${noteNo ? `${noteNo} · ` : ""}adds ${total} to what ${owed} on ${invoice.number}.`);
      }
      await onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not record the note"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-md" onChangeCapture={() => setTouched(true)}>
        <DialogHeader>
          <DialogTitle>{isSales ? "Credit / debit note" : "Vendor credit / debit note"}</DialogTitle>
          <DialogDescription>
            Against {invoice.number}.{" "}
            {kind === "CREDIT" ? "A credit note reduces what's owed." : "A debit note increases what's owed."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PillTabs
            tabs={[
              { value: "CREDIT", label: "Credit note" },
              { value: "DEBIT", label: "Debit note" },
            ] as PillTab<Kind>[]}
            value={kind}
            onChange={setKind}
          />
          <div className="grid grid-cols-2 gap-3">
            {!isSales && (
              <div className="space-y-1.5">
                <Label htmlFor="note-no">Vendor note no.</Label>
                <Input id="note-no" value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="note-date">Date</Label>
              <Input id="note-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="note-taxable">Taxable</Label>
              <Input
                id="note-taxable"
                type="number"
                min={0}
                className="tabular-nums"
                value={taxable}
                onChange={(e) => setTaxable(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-gst">GST %</Label>
              <Input
                id="note-gst"
                type="number"
                min={0}
                max={100}
                className="tabular-nums"
                value={gstPercent}
                onChange={(e) => setGstPercent(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <p className="flex h-9 items-center font-semibold tabular-nums">
                {formatINR((Number(taxable) || 0) + gst)}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-reason">Reason</Label>
            <Textarea
              id="note-reason"
              rows={2}
              placeholder={kind === "CREDIT" ? "e.g. Discount / returned item" : "e.g. Extra cabling supplied"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !(taxable > 0) || !reason.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Record {kind === "CREDIT" ? "Credit" : "Debit"} Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Save, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { notify } from "@/lib/notify";
import { apiErrorMessage, formatINR } from "@/lib/utils";
import { uploadAttachment } from "@/components/attachments/AttachmentList";
import type { PurchaseInvoice } from "@/types";

/**
 * Details of a recorded vendor invoice: the vendor's own number, dates, notes and file.
 * Amounts come from the billed lines — fix them with a credit/debit note, or delete the
 * bill (only while nothing is paid or noted against it) and record it again.
 */
export function BillDialog({
  bill,
  title,
  onClose,
  onSuccess,
}: {
  bill: PurchaseInvoice | null;
  title: string; // e.g. "Ingram MH · PO-20261028-0004"
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false); // any field edited → confirm before discarding

  useEffect(() => {
    if (!bill) return;
    setNumber(bill.vendorInvoiceNumber ?? "");
    setInvoiceDate(bill.invoiceDate.slice(0, 10));
    setDueDate(bill.dueDate?.slice(0, 10) ?? "");
    setNotes(bill.notes ?? "");
    setFile(null);
    setError(null);
    setTouched(false);
  }, [bill]);
  const guard = useDiscardGuard(touched && !saving, onClose);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!bill) return null;
  // anything paid or noted against it → can't delete (backend enforces the same)
  const canDelete = (bill.allocations?.length ?? 0) === 0 && (bill.adjustmentNotes?.length ?? 0) === 0;

  const remove = async () => {
    setConfirmDelete(false);
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/purchase-invoices/${bill.id}`);
      notify.warning("Vendor invoice deleted", `${bill.billNumber} is gone — its lines are back under "Awaiting vendor invoice" to record again.`);
      await onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete the bill"));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/purchase-invoices/${bill.id}`, {
        vendorInvoiceNumber: number.trim(),
        invoiceDate,
        dueDate,
        notes: notes.trim(),
      });
      if (file) {
        await notify.promise(uploadAttachment(file, "PURCHASE_INVOICE", bill.id), {
          loading: `Attaching ${file.name}…`,
          success: "Vendor's invoice file attached",
          error: "Couldn't attach the file — try again from the PO page",
        }).catch(() => undefined); // details are saved either way
      }
      notify.success("Vendor invoice details saved", `${bill.billNumber}${number.trim() ? ` · vendor no. ${number.trim()}` : ""}`);
      await onSuccess();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the bill"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <AlertDialog open={confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bill.billNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its lines go back under &quot;Awaiting vendor invoice&quot; so the vendor&apos;s invoice can be recorded again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DialogContent className="sm:max-w-lg" onChangeCapture={() => setTouched(true)}>
        <DialogHeader>
          <DialogTitle>Vendor invoice details · {bill.billNumber}</DialogTitle>
          <DialogDescription>
            {title} · {bill.gstType === "INTRA" ? "CGST + SGST" : "IGST"} · total {formatINR(bill.totalAmount)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-no">Vendor&apos;s invoice no.</Label>
              <Input id="bill-no" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-date">Invoice date</Label>
              <Input id="bill-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-due">Due date</Label>
              <Input id="bill-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Amounts come from the billed lines. To change them use a credit/debit note
            {canDelete ? ", or delete this bill and record it again" : ""}.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea id="bill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              {file ? "Change file" : "Attach vendor invoice"}
            </Button>
            <span className="truncate text-xs text-muted-foreground">{file?.name ?? "PDF or image"}</span>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {canDelete && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, Paperclip } from "lucide-react";
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
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { useAuthStore } from "@/stores/auth-store";
import { uploadAttachment } from "@/components/attachments/AttachmentList";

interface AcceptQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  quoteId: string;
  quoteNumber: string;
  /** opens the PO form for this quote (quote page); otherwise the button goes to "Ready for PO" */
  onCreatePo?: () => void;
}

// Records that the customer accepted a sent quote — this unlocks our PO to the vendor
export function AcceptQuoteDialog({
  open,
  onClose,
  onSuccess,
  quoteId,
  quoteNumber,
  onCreatePo,
}: AcceptQuoteDialogProps) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const canCreatePo = role === "ADMIN" || role === "MSP_TL";
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPoNumber("");
      setPoDate("");
      setNote("");
      setFile(null);
      setError(null);
    }
  }, [open]);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.patch(`/quotes/${quoteId}/mark-accepted`, {
        customerPoNumber: poNumber.trim() || undefined,
        customerPoDate: poDate || undefined,
        note: note.trim() || undefined,
      });
      // the acceptance is recorded — a failed upload shouldn't look like a failed acceptance
      let uploadFailed = false;
      if (file) {
        try {
          await uploadAttachment(file, "QUOTE_ACCEPTANCE", quoteId);
        } catch {
          uploadFailed = true;
        }
      }
      await onSuccess();
      onClose();
      const ref = poNumber.trim() ? ` (customer PO ${poNumber.trim()})` : "";
      if (uploadFailed) {
        notify.warning("Accepted, but the file didn't upload", `${quoteNumber} is accepted${ref}. Attach the customer's PO again from the quote page.`);
      } else if (canCreatePo) {
        notify.action(`Customer accepted ${quoteNumber}`, `Accepted${ref}. Next: raise the PO to the vendor.`, {
          label: "Create PO",
          onClick: () => (onCreatePo ? onCreatePo() : router.push("/purchase-orders?tab=ready")),
        });
      } else {
        notify.success(`Customer accepted ${quoteNumber}`, `Accepted${ref}. MSP TL will now raise the PO to the vendor.`);
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Could not mark the quote as accepted"
      );
    } finally {
      setSaving(false);
    }
  };

  // something typed or attached → closing asks before discarding it
  const guard = useDiscardGuard(!!(poNumber || poDate || note.trim() || file), onClose);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer accepted {quoteNumber}</DialogTitle>
          <DialogDescription>
            Record the customer&apos;s confirmation. MSP TL can then raise the PO
            to the vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="poNumber">
                Customer PO no. <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="poNumber"
                placeholder="e.g. ACME/PO/778"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="poDate">
                PO date <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="poDate"
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acceptNote">
              Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="acceptNote"
              rows={3}
              placeholder="e.g. Confirmed by email from the customer's purchase team"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.eml,.msg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" />
              {file ? "Change file" : "Attach proof"}
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {file?.name ?? "Customer PO / confirmation email (optional)"}
            </span>
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={guard.requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BadgeCheck className="size-4" />
            )}
            Mark Accepted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {guard.dialog}
    </>
  );
}

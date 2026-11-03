"use client";

import { useEffect, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { apiErrorMessage } from "@/lib/utils";
import type { User } from "@/types";

/**
 * Repeat order on a closed lead: same customer, same details — the lead goes back to Sales
 * as order #N+1 and runs the usual process. Admin / MSP TL may hand it to another Sales person.
 */
export function NewOrderDialog({
  open,
  lead,
  canPickSales,
  onClose,
  onDone,
}: {
  open: boolean;
  lead: { id: string; companyName: string; orderNo?: number; assignedTo?: User | null };
  canPickSales: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextNo = (lead.orderNo ?? 1) + 1;

  useEffect(() => {
    if (!open) return;
    setAssignedToId(lead.assignedTo?.id ?? null);
    setNotes("");
    setError(null);
    if (!canPickSales) return;
    (async () => {
      try {
        const { data } = await api.get("/users");
        setSalesUsers(((data.data ?? []) as User[]).filter((u) => u.isActive && u.role === "SALES"));
      } catch {
        notify.warning("Couldn't load Sales users", "The order will stay with the current Sales person.");
      }
    })();
  }, [open, canPickSales, lead.assignedTo?.id]);

  const start = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/leads/${lead.id}/new-order`, {
        assignedToId: canPickSales && assignedToId ? assignedToId : undefined,
        notes: notes.trim() || undefined,
      });
      const owner =
        (canPickSales && salesUsers.find((u) => u.id === assignedToId)?.name) || lead.assignedTo?.name || "Sales";
      notify.success(
        `Order #${nextNo} started`,
        `${lead.companyName} — back with ${owner} in their To Call list; same process from the call onwards`
      );
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not start the new order"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New order for {lead.companyName}</DialogTitle>
          <DialogDescription>
            Order #{nextNo} uses the same customer details (contact, GSTIN, billing address). It goes back to Sales
            and follows the usual steps: call → meeting → MOM → requirement → quote → PO → invoice. Earlier orders stay
            on the lead as history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sales person</Label>
            {canPickSales ? (
              <Select value={assignedToId} onValueChange={(v) => setAssignedToId((v as string) ?? null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a Sales person">
                    {(v: string | null) =>
                      salesUsers.find((u) => u.id === v)?.name ?? (v === lead.assignedTo?.id ? lead.assignedTo?.name : "Pick a Sales person")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {salesUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.id === lead.assignedTo?.id ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{lead.assignedTo?.name ?? "—"} (you)</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="no-notes">What does the customer want? (optional)</Label>
            <Textarea
              id="no-notes"
              rows={3}
              placeholder="e.g. Wants 2 more access points and a backup licence for the new branch"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={start} disabled={saving || (canPickSales && !assignedToId)}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Repeat className="size-4" />}
            Start Order #{nextNo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

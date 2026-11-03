"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { apiErrorMessage } from "@/lib/utils";
import { GST_STATE_OPTIONS, isValidGstin, stateName } from "@/lib/gst";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";

export interface TaxCustomer {
  id: string;
  companyName: string;
  customerGstin?: string | null;
  customerState?: string | null;
}

/**
 * The customer's tax details, right from Accounts → To invoice (Accounts may edit only these
 * three fields on a lead). A valid GSTIN sets the state; unregistered customers pick a state.
 */
export function CustomerTaxDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: TaxCustomer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gstin, setGstin] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useDiscardGuard(touched && !saving, onClose);

  useEffect(() => {
    if (!customer) return;
    setGstin(customer.customerGstin ?? "");
    setState(customer.customerState ?? null);
    setAddress("");
    setTouched(false);
    setError(null);
    // billing address isn't on the To-invoice row — load it so saving doesn't blank it
    api
      .get(`/leads/${customer.id}`)
      .then(({ data }) => setAddress(data.data?.billingAddress ?? ""))
      .catch(() => {
        /* field stays empty; the lead page has it */
      });
  }, [customer]);

  if (!customer) return null;

  const gstinUpper = gstin.trim().toUpperCase();
  const gstinOk = gstinUpper === "" || isValidGstin(gstinUpper);
  const effectiveState = gstinUpper && isValidGstin(gstinUpper) ? gstinUpper.slice(0, 2) : state;

  const save = async () => {
    if (!gstinOk) return setError("That GSTIN doesn't look right — 15 characters, starting with the state code.");
    if (!effectiveState) return setError("Pick the customer's state (or enter their GSTIN).");
    setSaving(true);
    setError(null);
    try {
      await api.put(`/leads/${customer.id}`, {
        customerGstin: gstinUpper || undefined,
        customerState: effectiveState,
        billingAddress: address.trim() || undefined,
      });
      notify.success(
        "Customer tax details saved",
        `${customer.companyName} · ${gstinUpper || "Unregistered"} · ${stateName(effectiveState)} — you can raise the invoice now.`
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the tax details"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-md" onChangeCapture={() => setTouched(true)}>
        <DialogHeader>
          <DialogTitle>Customer GSTIN / state</DialogTitle>
          <DialogDescription>
            {customer.companyName} — needed on the tax invoice and to decide CGST + SGST vs IGST.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tax-gstin">GSTIN</Label>
            <Input
              id="tax-gstin"
              placeholder="e.g. 27ABCDE1234F1Z5 — leave empty if unregistered"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              aria-invalid={!gstinOk}
              className="font-mono uppercase"
            />
            {!gstinOk && <p className="text-xs text-destructive">Not a valid GSTIN.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Select
              value={effectiveState}
              onValueChange={(v) => {
                setState((v as string) ?? null);
                setTouched(true);
              }}
              disabled={!!(gstinUpper && isValidGstin(gstinUpper))}
            >
              <SelectTrigger className="w-full" aria-label="State">
                <SelectValue placeholder="Pick a state">{(v: string | null) => stateName(v) ?? "Pick a state"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GST_STATE_OPTIONS.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gstinUpper && isValidGstin(gstinUpper) && (
              <p className="text-xs text-muted-foreground">Set from the GSTIN.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-address">Billing address</Label>
            <Textarea id="tax-address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
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

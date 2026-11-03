"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { GST_STATE_OPTIONS, isValidGstin, stateName } from "@/lib/gst";
import type { Vendor } from "@/types";

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
  contactPerson: z.string().trim().min(1, "Contact person is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  phone: z.string().trim().min(1, "Phone is required"),
  gstNumber: z
    .string()
    .optional()
    .refine((v) => !v || isValidGstin(v.toUpperCase()), "Invalid GSTIN (e.g. 29ABCDE1234F1Z5)"),
  state: z.string().optional(),
  address: z.string().optional(),
  products: z.string().optional(), // comma separated in the form
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z
    .string()
    .optional()
    .refine((v) => !v || /^[0-9]{9,18}$/.test(v), "Account number should be 9–18 digits"),
  bankIfsc: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v), "Invalid IFSC"),
});

type FormData = z.infer<typeof vendorSchema>;

const EMPTY: FormData = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  gstNumber: "",
  state: "",
  address: "",
  products: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
};

interface VendorDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (vendor: Vendor) => void;
  vendor?: Vendor | null;
}

export function VendorDialog({ open, onClose, onSuccess, vendor }: VendorDialogProps) {
  const isEdit = !!vendor;
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: EMPTY,
  });
  const guard = useDiscardGuard(isDirty && !isSubmitting, onClose);

  const gstin = (watch("gstNumber") ?? "").toUpperCase();
  const gstinState = isValidGstin(gstin) ? gstin.slice(0, 2) : null;
  const state = gstinState ?? watch("state") ?? "";

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      vendor
        ? {
            name: vendor.name,
            contactPerson: vendor.contactPerson,
            email: vendor.email,
            phone: vendor.phone,
            gstNumber: vendor.gstNumber ?? "",
            state: vendor.state ?? "",
            address: vendor.address ?? "",
            products: vendor.products.join(", "),
            bankName: vendor.bankName ?? "",
            bankAccountName: vendor.bankAccountName ?? "",
            bankAccountNumber: vendor.bankAccountNumber ?? "",
            bankIfsc: vendor.bankIfsc ?? "",
          }
        : EMPTY
    );
  }, [open, vendor, reset]);

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const payload = {
        name: data.name,
        contactPerson: data.contactPerson,
        email: data.email,
        phone: data.phone,
        gstNumber: (data.gstNumber ?? "").toUpperCase(),
        state: gstinState ?? data.state ?? "",
        address: data.address ?? "",
        products: (data.products ?? "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        bankName: data.bankName ?? "",
        bankAccountName: data.bankAccountName ?? "",
        bankAccountNumber: data.bankAccountNumber ?? "",
        bankIfsc: (data.bankIfsc ?? "").toUpperCase(),
      };
      const { data: res } = isEdit
        ? await api.put(`/vendors/${vendor.id}`, payload)
        : await api.post("/vendors", payload);
      const saved = res.data as Vendor;
      notify.success(isEdit ? "Vendor updated" : "Vendor added", isEdit ? saved.name : `${saved.name} can now be picked when creating a PO.`);
      onSuccess(saved);
      onClose();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Something went wrong"
      );
    }
  };

  const fieldError = (msg?: string) =>
    msg ? <p className="text-xs text-destructive">{msg}</p> : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isSubmitting && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription>
            Vendors are picked when MSP TL raises a PO. GSTIN sets the state used for GST.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-name">Vendor name</Label>
            <Input id="v-name" placeholder="e.g. Redington India" {...register("name")} />
            {fieldError(errors.name?.message)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-contact">Contact person</Label>
              <Input id="v-contact" {...register("contactPerson")} />
              {fieldError(errors.contactPerson?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-phone">Phone</Label>
              <Input id="v-phone" type="tel" {...register("phone")} />
              {fieldError(errors.phone?.message)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-email">Email (POs are sent here)</Label>
            <Input id="v-email" type="email" {...register("email")} />
            {fieldError(errors.email?.message)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-gstin">
                GSTIN <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="v-gstin"
                maxLength={15}
                className="uppercase"
                {...register("gstNumber")}
              />
              {fieldError(errors.gstNumber?.message)}
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select
                value={state || null}
                onValueChange={(v) => setValue("state", v ?? "", { shouldDirty: true })}
                disabled={!!gstinState}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select state">
                    {stateName(state) ?? "Select state"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GST_STATE_OPTIONS.map((st) => (
                    <SelectItem key={st.code} value={st.code}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-address">Address</Label>
            <Textarea id="v-address" rows={2} {...register("address")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-products">
              Brands / products{" "}
              <span className="text-xs font-normal text-muted-foreground">(comma separated)</span>
            </Label>
            <Input id="v-products" placeholder="Fortinet, Sophos" {...register("products")} />
          </div>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              Bank details <span className="text-xs font-normal text-muted-foreground">(pre-fills payments to this vendor)</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Bank" {...register("bankName")} />
              <Input placeholder="Account name" {...register("bankAccountName")} />
              <Input placeholder="Account number" inputMode="numeric" {...register("bankAccountNumber")} />
              <Input placeholder="IFSC" maxLength={11} className="uppercase" {...register("bankIfsc")} />
            </div>
            {fieldError(errors.bankAccountNumber?.message ?? errors.bankIfsc?.message)}
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={guard.requestClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

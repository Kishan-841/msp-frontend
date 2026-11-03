"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, FileText, ImagePlus, Landmark, Loader2, Save, Trash2 } from "lucide-react";
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
import { notify } from "@/lib/notify";
import { GST_STATE_OPTIONS, isValidGstin, stateName } from "@/lib/gst";
import { useAuthStore } from "@/stores/auth-store";
import { IntegrationsCard } from "@/components/settings/IntegrationsCard";
import type { CompanySettings } from "@/types";

const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  gstin: z
    .string()
    .optional()
    .refine((v) => !v || isValidGstin(v.toUpperCase()), "Invalid GSTIN (e.g. 27ABCDE1234F1Z5)"),
  state: z.string().optional(),
  pan: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(v), "Invalid PAN"),
  address: z.string().optional(),
  email: z.string().optional().refine((v) => !v || z.email().safeParse(v).success, "Invalid email"),
  phone: z.string().optional(),
  cin: z
    .string()
    .optional()
    .refine((v) => !v || /^[LU][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/.test(v), "Invalid CIN"),
  tan: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z]{4}[0-9]{5}[A-Za-z]$/.test(v), "Invalid TAN"),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z
    .string()
    .optional()
    .refine((v) => !v || /^[0-9]{9,18}$/.test(v), "Account number should be 9–18 digits"),
  bankIfsc: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v), "Invalid IFSC (e.g. HDFC0000794)"),
  bankBranch: z.string().optional(),
  poTerms: z.string().max(3000).optional(),
})
  // GSTIN embeds the PAN (characters 3–12)
  .refine((d) => !d.gstin || !d.pan || d.gstin.toUpperCase().slice(2, 12) === d.pan.toUpperCase(), {
    message: "GSTIN doesn't match the PAN",
    path: ["gstin"],
  });

const EMPTY = {
  name: "", gstin: "", state: "", pan: "", address: "", email: "", phone: "",
  cin: "", tan: "", bankName: "", bankAccountName: "", bankAccountNumber: "", bankIfsc: "", bankBranch: "", poTerms: "",
};

// Shown as the placeholder; the backend prints these when the field is empty (utils/poDocument.ts)
const DEFAULT_PO_TERMS = [
  "Please quote our PO number on your invoice and all correspondence.",
  "Invoice must be raised on our company name and GSTIN as shown above.",
  "Goods / services must match the description, quantity and rates in this PO.",
  "Delivery to the address mentioned; delivery challan to accompany the goods.",
  "Payment as per agreed terms, after receipt of goods and a valid tax invoice.",
].join("\n");

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 500 * 1024;

type FormData = z.infer<typeof companySchema>;

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.role === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(companySchema),
    defaultValues: EMPTY,
  });

  const gstin = (watch("gstin") ?? "").toUpperCase();
  const gstinState = isValidGstin(gstin) ? gstin.slice(0, 2) : null;
  const state = gstinState ?? watch("state") ?? "";

  useEffect(() => {
    api
      .get("/settings/company")
      .then(({ data }) => {
        const c = data.data as CompanySettings | null;
        if (c) {
          reset({
            name: c.name,
            gstin: c.gstin ?? "",
            state: c.state ?? "",
            pan: c.pan ?? "",
            address: c.address ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            cin: c.cin ?? "",
            tan: c.tan ?? "",
            bankName: c.bankName ?? "",
            bankAccountName: c.bankAccountName ?? "",
            bankAccountNumber: c.bankAccountNumber ?? "",
            bankIfsc: c.bankIfsc ?? "",
            bankBranch: c.bankBranch ?? "",
            poTerms: c.poTerms ?? "",
          });
          setLogo(c.logoDataUrl ?? null);
        }
      })
      .catch((err) => notify.apiError(err, "Couldn't load company settings"))
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: FormData) => {
    setMessage(null);
    try {
      await api.put("/settings/company", {
        ...data,
        gstin: (data.gstin ?? "").toUpperCase(),
        state: gstinState ?? data.state ?? "",
        pan: (data.pan ?? "").toUpperCase(),
        cin: (data.cin ?? "").toUpperCase(),
        tan: (data.tan ?? "").toUpperCase(),
        bankIfsc: (data.bankIfsc ?? "").toUpperCase(),
        // only send the logo when it changed — it can be a few hundred KB
        ...(logoChanged ? { logoDataUrl: logo ?? "" } : {}),
      });
      setLogoChanged(false);
      notify.success("Company details saved", "Used on every quote, PO, invoice and payment from now on.");
    } catch (err: unknown) {
      setMessage({
        ok: false,
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || "Could not save company details",
      });
    }
  };

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      notify.warning("Logo not added", "Use a PNG, JPG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      notify.warning("Logo is too large", "Keep it under 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(reader.result as string);
      setLogoChanged(true);
      setMessage(null);
      notify.info("Logo ready", "Click Save to use it on documents.");
    };
    reader.readAsDataURL(file);
  };

  const fieldError = (msg?: string) =>
    msg ? <p className="text-xs text-destructive">{msg}</p> : null;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company details printed on POs and invoices. The state decides CGST + SGST vs IGST.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5 rounded-2xl border border-border bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Company details</h2>
          {!canEdit && (
            <span className="ml-auto text-xs text-muted-foreground">Only Admin can edit</span>
          )}
        </div>

        <fieldset disabled={!canEdit} className="space-y-4">
          {/* Logo — printed on invoices, POs and sales orders */}
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise
                <img src={logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImagePlus className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Logo</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP or SVG, under 500 KB. Shown on printed documents.</p>
              {canEdit && (
                <div className="flex gap-2">
                  <input ref={logoInput} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={onLogoPick} />
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
                    <ImagePlus className="size-4" /> {logo ? "Change" : "Upload"}
                  </Button>
                  {logo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLogo(null);
                        setLogoChanged(true);
                      }}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-name">Company name</Label>
            <Input id="c-name" {...register("name")} />
            {fieldError(errors.name?.message)}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-gstin">GSTIN</Label>
              <Input id="c-gstin" maxLength={15} className="uppercase" {...register("gstin")} />
              {fieldError(errors.gstin?.message)}
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select
                value={state || null}
                onValueChange={(v) => setValue("state", v ?? "", { shouldDirty: true })}
                disabled={!canEdit || !!gstinState}
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
            <div className="space-y-1.5">
              <Label htmlFor="c-pan">PAN</Label>
              <Input id="c-pan" maxLength={10} className="uppercase" {...register("pan")} />
              {fieldError(errors.pan?.message)}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-address">Address</Label>
            <Textarea id="c-address" rows={3} {...register("address")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-cin">CIN</Label>
              <Input id="c-cin" maxLength={21} className="uppercase" {...register("cin")} />
              {fieldError(errors.cin?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tan">TAN</Label>
              <Input id="c-tan" maxLength={10} className="uppercase" {...register("tan")} />
              {fieldError(errors.tan?.message)}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" {...register("email")} />
              {fieldError(errors.email?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-4 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Bank details</h2>
              <span className="text-xs text-muted-foreground">— printed on invoices for customer payments</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-name">Bank</Label>
                <Input id="b-name" {...register("bankName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-holder">Account name</Label>
                <Input id="b-holder" {...register("bankAccountName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-acc">Account number</Label>
                <Input id="b-acc" inputMode="numeric" {...register("bankAccountNumber")} />
                {fieldError(errors.bankAccountNumber?.message)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-ifsc">IFSC</Label>
                <Input id="b-ifsc" maxLength={11} className="uppercase" {...register("bankIfsc")} />
                {fieldError(errors.bankIfsc?.message)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-branch">Branch</Label>
              <Input id="b-branch" {...register("bankBranch")} />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Purchase order terms</h2>
              <span className="text-xs text-muted-foreground">— one per line, printed on every PO</span>
            </div>
            <Textarea
              rows={6}
              placeholder={DEFAULT_PO_TERMS}
              {...register("poTerms")}
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the standard terms shown above.</p>
          </div>
        </fieldset>

        {message && (
          <p
            className={
              message.ok
                ? "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {message.text}
          </p>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
          </div>
        )}
      </form>

      {canEdit && <IntegrationsCard />}
    </div>
  );
}

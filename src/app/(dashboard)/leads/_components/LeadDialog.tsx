"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  Check,
  Building2,
  User as UserIcon,
  Phone,
  Mail,
  Cpu,
  Cloud,
  UserPlus,
  Sparkles,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatRoleLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { ASSIGNABLE_ROLES } from "@/lib/leadAccess";
import type { Lead, LeadCategory, User } from "@/types";
import { GST_STATE_OPTIONS, isValidGstin, stateName } from "@/lib/gst";
import { SUBCATEGORIES } from "@/lib/categories";


const leadSchema = z
  .object({
    companyName: z.string().min(1, "Company name is required"),
    contactPerson: z.string().min(1, "Contact person is required"),
    phone: z
      .string()
      .regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
    email: z.string().min(1, "Email is required").email("Invalid email"),
    notes: z.string().optional(),
    customerGstin: z
      .string()
      .optional()
      .refine((v) => !v || isValidGstin(v.toUpperCase()), "Invalid GSTIN (e.g. 27ABCDE1234F1Z5)"),
    customerState: z.string().optional(),
    billingAddress: z.string().optional(),
    category: z.enum(["HARDWARE", "SOFTWARE"]).optional(),
    subcategory: z.array(z.string()).optional(),
    assignedToId: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasSub = data.subcategory && data.subcategory.length > 0;
      if (data.category && !hasSub) return false;
      if (hasSub && !data.category) return false;
      return true;
    },
    {
      message: "Pick at least one subcategory",
      path: ["subcategory"],
    }
  );

type FormData = z.infer<typeof leadSchema>;

interface LeadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead?: Lead | null;
}

function SectionLabel({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {optional && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          Optional
        </span>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function IconInput({
  icon: Icon,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...props}
        className={cn(
          "h-9 pl-9",
          error && "border-destructive focus-visible:ring-destructive/30",
          props.className
        )}
      />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function LeadDialog({
  open,
  onClose,
  onSuccess,
  lead,
}: LeadDialogProps) {
  const isEdit = !!lead;
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<User[]>([]);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const canCategorize = user?.role === "MSP_TL" || user?.role === "ADMIN";

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      companyName: "",
      contactPerson: "",
      phone: "",
      email: "",
      notes: "",
      customerGstin: "",
      customerState: "",
      billingAddress: "",
      category: undefined,
      subcategory: undefined,
      assignedToId: undefined,
    },
  });

  // Esc / outside click / Cancel on a half-filled form asks before throwing it away
  const guard = useDiscardGuard(isDirty, onClose);

  const selectedCategory = watch("category");
  const selectedSubs = watch("subcategory") ?? [];
  const assigneeId = watch("assignedToId");
  const gstinValue = (watch("customerGstin") ?? "").toUpperCase();
  // A valid GSTIN fixes the state (its first 2 digits), so the dropdown follows it
  const gstinState = isValidGstin(gstinValue) ? gstinValue.slice(0, 2) : null;
  const customerState = gstinState ?? watch("customerState") ?? "";

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(
      lead
        ? {
            companyName: lead.companyName,
            contactPerson: lead.contactPerson,
            phone: lead.phone,
            email: lead.email,
            notes: lead.notes ?? "",
            customerGstin: lead.customerGstin ?? "",
            customerState: lead.customerState ?? "",
            billingAddress: lead.billingAddress ?? "",
            category: lead.category ?? undefined,
            subcategory:
              lead.subcategory && lead.subcategory.length > 0
                ? lead.subcategory
                : undefined,
            assignedToId: undefined,
          }
        : {
            companyName: "",
            contactPerson: "",
            phone: "",
            email: "",
            notes: "",
            customerGstin: "",
            customerState: "",
            billingAddress: "",
            category: undefined,
            subcategory: undefined,
            assignedToId: undefined,
          }
    );

    if (canCategorize) {
      api
        .get("/users")
        .then(({ data }) => {
          const all: User[] = data.data ?? [];
          setAssignees(
            all
              .filter((u) => u.isActive && ASSIGNABLE_ROLES.includes(u.role))
              .sort((a, b) => (a.role === "SALES" ? 0 : 1) - (b.role === "SALES" ? 0 : 1) || a.name.localeCompare(b.name))
          );
        })
        .catch(() => setAssignees([]));
    }
  }, [open, lead, reset, canCategorize]);

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        customerGstin: (data.customerGstin ?? "").toUpperCase(),
        customerState: gstinState ?? data.customerState ?? "",
        billingAddress: data.billingAddress ?? "",
      };
      if (canCategorize) {
        payload.category = data.category;
        payload.subcategory = data.subcategory;
      }

      if (isEdit) {
        await api.put(`/leads/${lead.id}`, payload);
        notify.success("Lead updated", data.companyName);
      } else {
        const { data: created } = await api.post("/leads", payload);
        const newId: string = created.data.id;
        let next = "";
        if (
          canCategorize &&
          data.assignedToId &&
          created.data?.status === "CATEGORIZED"
        ) {
          await api.patch(`/leads/${newId}/assign`, {
            assignedToId: data.assignedToId,
          });
          next =
            data.assignedToId === user?.id
              ? "Assigned to you — it's in Assigned Leads → To Call"
              : `Assigned to ${assignees.find((u) => u.id === data.assignedToId)?.name ?? "Sales"} — it's in their To Call list`;
        } else if (user?.role === "SALES") {
          next = "It's in your To Call list — MSP TL will add the category";
        } else if (created.data?.status === "CATEGORIZED") {
          next = "Next, assign it to a Sales person";
        } else {
          next = "Next, categorize it (Hardware / Software)";
        }
        notify.action(`Lead created`, `${data.companyName} — ${next}`, {
          label: "Open lead",
          onClick: () => router.push(`/leads/${newId}`),
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Something went wrong";
      setError(message);
    }
  };

  const hasAllRequired = !!(
    watch("companyName") &&
    watch("contactPerson") &&
    watch("phone") &&
    watch("email")
  );

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSubmitting && guard.requestClose()}>
      {/* overflow-y-auto (not hidden): on short screens the form scrolls and the footer stays reachable */}
      <DialogContent className="gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {/* Header with subtle accent */}
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-muted/40 to-transparent px-5 pt-4 pb-3">
          <DialogHeader className="space-y-1 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-md bg-[#3B82F6]/10 text-[#3B82F6]">
                <Building2 className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold">
                {isEdit ? "Edit lead" : "New lead"}
              </DialogTitle>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isEdit
                ? "Update the lead details below."
                : "Capture a potential customer — you can categorize and assign in the same step."}
            </p>
          </DialogHeader>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-3 px-5 py-3"
        >
          {/* Company + Contact in one block */}
          <section>
            <SectionLabel>Contact details</SectionLabel>
            <div className="space-y-2">
              <IconInput
                icon={Building2}
                placeholder="Company name"
                error={!!errors.companyName}
                {...register("companyName")}
              />
              <IconInput
                icon={UserIcon}
                placeholder="Contact person"
                error={!!errors.contactPerson}
                {...register("contactPerson")}
              />
              <div className="grid grid-cols-2 gap-2">
                <IconInput
                  icon={Phone}
                  placeholder="9876543210"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  error={!!errors.phone}
                  {...register("phone", {
                    onChange: (e) => {
                      e.target.value = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);
                    },
                  })}
                />
                <IconInput
                  icon={Mail}
                  placeholder="name@company.com"
                  type="email"
                  error={!!errors.email}
                  {...register("email")}
                />
              </div>
              {(errors.companyName ||
                errors.contactPerson ||
                errors.phone ||
                errors.email) && (
                <p className="text-xs text-destructive">
                  {errors.companyName?.message ||
                    errors.contactPerson?.message ||
                    errors.phone?.message ||
                    errors.email?.message}
                </p>
              )}
            </div>
          </section>

          {/* Customer tax details — used for GST on POs and invoices */}
          <section>
            <SectionLabel optional>Tax details</SectionLabel>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <IconInput
                  icon={Receipt}
                  placeholder="GSTIN"
                  maxLength={15}
                  className="uppercase"
                  error={!!errors.customerGstin}
                  {...register("customerGstin")}
                />
                <Select
                  value={customerState || null}
                  onValueChange={(v) =>
                    setValue("customerState", v ?? "", { shouldDirty: true })
                  }
                  disabled={!!gstinState}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="State">
                      {stateName(customerState) ?? "State"}
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
              <Textarea
                rows={2}
                placeholder="Billing address"
                {...register("billingAddress")}
              />
              {errors.customerGstin && (
                <p className="text-xs text-destructive">
                  {errors.customerGstin.message}
                </p>
              )}
            </div>
          </section>

          {/* Classification (MSP TL / Admin) */}
          {canCategorize && (
            <section>
              <SectionLabel>Classification</SectionLabel>

              {/* Category as two big cards */}
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "HARDWARE", label: "Hardware", icon: Cpu },
                        { value: "SOFTWARE", label: "Software", icon: Cloud },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => {
                      const active = field.value === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            field.onChange(active ? undefined : value);
                            setValue("subcategory", undefined);
                          }}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all",
                            active
                              ? "border-[#3B82F6] bg-[#3B82F6]/[0.04] ring-1 ring-[#3B82F6]/30"
                              : "border-border bg-card hover:bg-muted/40"
                          )}
                        >
                          <div
                            className={cn(
                              "flex size-7 items-center justify-center rounded-md",
                              active
                                ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-tight">
                              {label}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {value === "HARDWARE"
                                ? "Physical devices"
                                : "Software & cloud"}
                            </div>
                          </div>
                          {active && (
                            <Check className="size-3.5 text-[#3B82F6]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              />

              {/* Subcategory chips */}
              {selectedCategory && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      Subcategories
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedSubs.length} selected
                    </span>
                  </div>
                  <Controller
                    name="subcategory"
                    control={control}
                    render={({ field }) => {
                      const current = field.value ?? [];
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {SUBCATEGORIES[selectedCategory].map((sub) => {
                            const active = current.includes(sub);
                            return (
                              <button
                                key={sub}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? current.filter((s) => s !== sub)
                                    : [...current, sub];
                                  field.onChange(
                                    next.length ? next : undefined
                                  );
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                                  active
                                    ? "border-[#3B82F6] bg-[#3B82F6] text-white"
                                    : "border-border bg-card text-foreground hover:bg-muted/60"
                                )}
                              >
                                {active && <Check className="size-3" />}
                                {sub}
                              </button>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  {errors.subcategory && (
                    <p className="text-xs text-destructive">
                      {errors.subcategory.message}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Assignment */}
          {canCategorize && !isEdit && selectedCategory && (
            <section>
              <SectionLabel optional>Assign to</SectionLabel>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <div className="space-y-1.5">
                    {assignees.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No active Sales users or MSP TLs.
                      </p>
                    ) : (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange((v ?? "") || undefined)
                        }
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue placeholder="Select a team member">
                            {(value: string) => {
                              const u = assignees.find((x) => x.id === value);
                              if (!u) return "Select a team member";
                              return (
                                <span className="flex items-center gap-2">
                                  <span className="flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-[9px] font-semibold text-white">
                                    {initials(u.name)}
                                  </span>
                                  <span className="font-medium">{u.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    · {formatRoleLabel(u.role)}
                                  </span>
                                </span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {assignees.map((u) => (
                            <SelectItem
                              key={u.id}
                              value={u.id}
                              className="py-2"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-[10px] font-semibold !text-white">
                                  {initials(u.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">
                                    {u.name}
                                  </div>
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {formatRoleLabel(u.role)} · {u.email}
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!assigneeId && (
                      <p className="text-[11px] text-muted-foreground">
                        Skip to assign later from the lead page.
                      </p>
                    )}
                  </div>
                )}
              />
            </section>
          )}

          {/* Notes */}
          <section>
            <SectionLabel optional>Notes</SectionLabel>
            <Textarea
              rows={2}
              placeholder="Context, requirements, next steps..."
              className="resize-none text-sm"
              {...register("notes")}
            />
          </section>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <DialogFooter className="m-0 flex items-center gap-3 border-t border-border bg-muted/40 px-7 py-4 sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {hasAllRequired ? (
              <>
                <Sparkles className="size-3.5 text-emerald-500" />
                <span>Ready to save</span>
              </>
            ) : (
              <span>Fill in the required fields</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={guard.requestClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Create lead
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}

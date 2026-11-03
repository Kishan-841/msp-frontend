"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/axios";
import { useDiscardGuard } from "@/hooks/useDiscardGuard";
import { notify } from "@/lib/notify";
import { formatRoleLabel } from "@/lib/utils";
import type { User, UserRole } from "@/types";

const ROLES: UserRole[] = ["ADMIN", "MSP_TL", "SALES", "ACCOUNTS"];

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string(),
  role: z.enum(["ADMIN", "MSP_TL", "SALES", "ACCOUNTS"]),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof userSchema>;

interface UserDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: User | null;
}

export function UserDialog({ open, onClose, onSuccess, user }: UserDialogProps) {
  const isEdit = !!user;
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "SALES" as UserRole,
      isActive: true,
    },
  });

  const guard = useDiscardGuard(isDirty && !isSubmitting, onClose);

  useEffect(() => {
    if (open) {
      setError(null);
      if (user) {
        reset({
          name: user.name,
          email: user.email,
          password: "",
          role: user.role,
          isActive: user.isActive,
        });
      } else {
        reset({
          name: "",
          email: "",
          password: "",
          role: "SALES",
          isActive: true,
        });
      }
    }
  }, [open, user, reset]);

  const onSubmit = async (data: FormData) => {
    setError(null);

    // Custom password validation
    if (!isEdit && (!data.password || data.password.length < 6)) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (isEdit && data.password && data.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
      };
      if (data.password) {
        payload.password = data.password;
      }

      if (isEdit) {
        await api.put(`/users/${user.id}`, payload);
        notify.success("User updated", `${data.name}${data.password ? " — new password set" : ""}`);
      } else {
        await api.post("/users", payload);
        notify.success("User created", `${data.name} can now sign in with ${data.email}.`);
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

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSubmitting && guard.requestClose()}>
      {guard.dialog}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the user details below."
              : "Fill in the details to create a new user."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="John Doe" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password{isEdit && " (leave blank to keep current)"}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={isEdit ? "Leave blank to keep current" : "Min 6 characters"}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {formatRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && (
              <p className="text-xs text-destructive">{errors.role.message}</p>
            )}
          </div>

          {isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="isActive">Active</Label>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    id="isActive"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={guard.requestClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {isEdit ? "Saving..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Save Changes"
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

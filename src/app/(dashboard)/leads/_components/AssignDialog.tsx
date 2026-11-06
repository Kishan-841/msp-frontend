"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Search, Check, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn, formatRoleLabel } from "@/lib/utils";
import type { Lead, User } from "@/types";
import { useAuthStore } from "@/stores/auth-store";
import { ASSIGNABLE_ROLES } from "@/lib/leadAccess";

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead: Lead | null;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AssignDialog({
  open,
  onClose,
  onSuccess,
  lead,
}: AssignDialogProps) {
  const me = useAuthStore((st) => st.user);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get("/users");
      const allUsers: User[] = data.data ?? [];
      setUsers(
        allUsers
          .filter(
            (u) =>
              u.isActive &&
              ASSIGNABLE_ROLES.includes(u.role) &&
              // an MSP TL may take a lead themselves only if they created it
              !(me?.role === "MSP_TL" && u.id === me.id && lead?.createdBy?.id !== me.id)
          )
          // Sales first, then MSP TLs; you at the top of your group
          .sort(
            (a, b) =>
              (a.role === "SALES" ? 0 : 1) - (b.role === "SALES" ? 0 : 1) ||
              (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0) ||
              a.name.localeCompare(b.name)
          )
      );
    } catch {
      notify.error("Couldn't load the team", "Close the dialog and try again.");
    } finally {
      setLoadingUsers(false);
    }
  }, [me?.id, me?.role, lead?.createdBy?.id]);

  useEffect(() => {
    if (open) {
      setError(null);
      setSelectedUserId("");
      setQuery("");
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const handleSubmit = async () => {
    if (!lead || !selectedUserId) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/leads/${lead.id}/assign`, {
        assignedToId: selectedUserId,
      });
      if (selectedUserId === me?.id) {
        notify.success("Lead assigned to you", `${lead.companyName} — it's in Assigned Leads → To Call`);
      } else {
        const assignee = users.find((u) => u.id === selectedUserId)?.name ?? "Sales";
        notify.success(`Lead assigned to ${assignee}`, `${lead.companyName} — it's now in their To Call list`);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to assign lead";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter((u) =>
    query
      ? [u.name, u.email, formatRoleLabel(u.role)]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      : true
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          onClose();
          setError(null);
        }
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="border-b border-border bg-gradient-to-br from-muted/40 to-transparent px-6 pt-5 pb-4">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-md bg-[#3B82F6]/10 text-[#3B82F6]">
                <UserPlus className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold">
                Assign lead
              </DialogTitle>
            </div>
            {lead && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3" />
                <span className="font-medium text-foreground">
                  {lead.companyName}
                </span>
                {lead.category && (
                  <>
                    <span>·</span>
                    <span>
                      {lead.category === "HARDWARE" ? "Hardware" : "Software"}
                      {lead.subcategory && lead.subcategory.length > 0
                        ? ` / ${lead.subcategory.join(", ")}`
                        : ""}
                    </span>
                  </>
                )}
              </div>
            )}
          </DialogHeader>
        </div>

        <div className="space-y-3 px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or role..."
              className="h-9 pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border bg-card p-1">
            {loadingUsers ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {query ? "No matches" : "No eligible users"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((u) => {
                  const active = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUserId(u.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
                        active
                          ? "bg-[#3B82F6]/[0.06] ring-1 ring-inset ring-[#3B82F6]/25"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-[11px] font-semibold text-white">
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {u.name}
                          {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {formatRoleLabel(u.role)} · {u.email}
                        </div>
                      </div>
                      {active && (
                        <Check className="size-4 text-[#3B82F6]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="m-0 flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {selectedUserId ? "Ready to assign" : "Pick a team member"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedUserId}
              size="sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <UserPlus className="size-3.5" />
                  Assign
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Pencil, Building2, Loader2, Power } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { stateName } from "@/lib/gst";
import { useAuthStore } from "@/stores/auth-store";
import type { Vendor } from "@/types";
import { VendorDialog } from "./_components/VendorDialog";
import { usePagedList } from "../accounts/_components/usePagedList";

export default function VendorsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage =
    user?.role === "ADMIN" || user?.role === "MSP_TL" || user?.role === "ACCOUNTS";

  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [confirmOff, setConfirmOff] = useState<Vendor | null>(null); // deactivate asks first
  const [busyId, setBusyId] = useState<string | null>(null);

  // one server page at a time (search + include-inactive on the server); refreshes live
  const list = usePagedList<Vendor>("/vendors", { includeInactive: showInactive ? "true" : undefined }, {
    errorTitle: "Couldn't load vendors",
  });
  const fetchVendors = list.refetch;

  const toggleActive = useCallback(
    async (v: Vendor) => {
      setBusyId(v.id);
      try {
        await api.put(`/vendors/${v.id}`, { isActive: !v.isActive });
        if (v.isActive) notify.warning(`${v.name} deactivated`, "It won't be offered for new POs. Existing POs and bills are unchanged.");
        else notify.success(`${v.name} reactivated`, "It can be picked for new POs again.");
        fetchVendors();
      } catch (err) {
        notify.apiError(err, `Couldn't update ${v.name}`);
      } finally {
        setBusyId(null);
      }
    },
    [fetchVendors]
  );

  const columns: DataTableColumn<Vendor>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Vendor",
        cell: (v) => (
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {v.name}
                {!v.isActive && <Badge variant="secondary">Inactive</Badge>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {v.products.length > 0 ? v.products.join(", ") : "—"}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: "contact",
        header: "Contact",
        cell: (v) => (
          <div className="text-sm">
            <p>{v.contactPerson}</p>
            <p className="text-xs text-muted-foreground">
              {v.email} · {v.phone}
            </p>
          </div>
        ),
      },
      {
        key: "gstin",
        header: "GSTIN",
        cell: (v) => (
          <span className="font-mono text-sm text-muted-foreground">
            {v.gstNumber ?? "—"}
          </span>
        ),
      },
      {
        key: "state",
        header: "State",
        cell: (v) => (
          <span className="text-sm text-muted-foreground">{stateName(v.state) ?? "—"}</span>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        headClassName: "w-28 text-right",
        className: "text-right",
        cell: (v) =>
          canManage ? (
            <div className="inline-flex gap-1.5">
              <Button
                variant="outline"
                size="icon-sm"
                title="Edit"
                aria-label="Edit vendor"
                onClick={() => {
                  setEditVendor(v);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                title={v.isActive ? "Deactivate" : "Reactivate"}
                aria-label={v.isActive ? "Deactivate vendor" : "Reactivate vendor"}
                disabled={busyId === v.id}
                onClick={() => (v.isActive ? setConfirmOff(v) : toggleActive(v))}
              >
                {busyId === v.id ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
              </Button>
            </div>
          ) : null,
      },
    ],
    [canManage, toggleActive, busyId]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Distributors and service providers used on purchase orders.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditVendor(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add Vendor
          </Button>
        )}
      </div>

      <DataTable
        title="Vendors"
        count={list.total}
        columns={columns}
        data={list.items}
        getRowKey={(v) => v.id}
        loading={list.loading}
        emptyMessage={
          list.search ? "No vendors match your search." : "No vendors yet. Add your first vendor."
        }
        searchValue={list.search}
        onSearchChange={list.setSearch}
        {...list.pagination}
        searchPlaceholder="Search name, contact or GSTIN..."
        toolbar={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
        }
      />

      <AlertDialog open={!!confirmOff} onOpenChange={(v) => !v && setConfirmOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirmOff?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It won&apos;t be offered for new POs. Existing POs, vendor invoices and payments stay as they are, and you
              can reactivate it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const v = confirmOff;
                setConfirmOff(null);
                if (v) toggleActive(v);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VendorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={fetchVendors}
        vendor={editVendor}
      />
    </div>
  );
}

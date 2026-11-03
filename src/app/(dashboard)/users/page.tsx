"use client";

import { useMemo, useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
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
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { formatRoleLabel } from "@/lib/utils";
import type { User } from "@/types";
import { UserDialog } from "./_components/UserDialog";
import { usePagedList } from "../accounts/_components/usePagedList";

const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMIN: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  MSP_TL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SALES: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ACCOUNTS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function UsersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // one server page at a time (search on the server); refreshes live
  const list = usePagedList<User>("/users", {}, { errorTitle: "Couldn't load users", defaultPageSize: 10 });
  const fetchUsers = list.refetch;

  const handleEdit = (user: User) => {
    setEditUser(user);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditUser(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      setDeleting(true);
      await api.delete(`/users/${deleteUser.id}`);
      notify.warning(`${deleteUser.name} deactivated`, "They can no longer sign in. Their leads and history stay as they are.");
      await fetchUsers();
    } catch (err) {
      notify.apiError(err, `Couldn't deactivate ${deleteUser.name}`);
    } finally {
      setDeleting(false);
      setDeleteUser(null);
    }
  };

  const columns: DataTableColumn<User>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        cell: (u) => (
          <span className="font-medium text-foreground">{u.name}</span>
        ),
      },
      {
        key: "email",
        header: "Email",
        cell: (u) => <span className="text-muted-foreground">{u.email}</span>,
      },
      {
        key: "role",
        header: "Role",
        cell: (u) => (
          <Badge
            variant="secondary"
            className={ROLE_BADGE_COLORS[u.role] ?? ""}
          >
            {formatRoleLabel(u.role)}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (u) => (
          <Badge
            variant="secondary"
            className={
              u.isActive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }
          >
            {u.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        headClassName: "w-12",
        cell: (u) => (
          <Menu>
            <MenuTrigger>
              <Button variant="ghost" size="icon-sm" aria-label="Actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onClick={() => handleEdit(u)}>
                <Pencil />
                Edit
              </MenuItem>
              <MenuItem
                variant="destructive"
                onClick={() => setDeleteUser(u)}
              >
                <Trash2 />
                Deactivate
              </MenuItem>
            </MenuContent>
          </Menu>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage team members and their roles.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="size-4" />
          Add User
        </Button>
      </div>

      <DataTable
        title="Users"
        count={list.total}
        columns={columns}
        data={list.items}
        getRowKey={(u) => u.id}
        loading={list.loading}
        emptyMessage="No users found."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search by name or email..."
        {...list.pagination}
      />

      {/* Create/Edit dialog */}
      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={fetchUsers}
        user={editUser}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteUser}
        onOpenChange={(val) => !val && setDeleteUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{" "}
              <span className="font-medium text-foreground">
                {deleteUser?.name}
              </span>
              ? They will no longer be able to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deactivating...
                </>
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

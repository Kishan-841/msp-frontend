"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ArrowRight, Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PillTabs, type PillTab } from "@/components/ui/tabs-pill";
import api from "@/lib/axios";
import { notify } from "@/lib/notify";
import { cn, formatDateTimeIN } from "@/lib/utils";
import { NOTIFICATION_GROUPS, notificationMeta, typesOfGroup, type NotificationGroup } from "@/lib/notifications";
import { useNotificationStore } from "@/stores/notification-store";
import type { Notification } from "@/types";

type Show = "all" | "unread";
const PAGE_SIZE = 30;

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMM yyyy");
}

export default function NotificationsPage() {
  const router = useRouter();
  const { unreadCount, markAsRead, markAllAsRead, fetchUnreadCount } = useNotificationStore();
  // A new notification arriving over the socket lands in the store — use it to refresh this list
  const latestLiveId = useNotificationStore((s) => s.notifications[0]?.id);

  const [show, setShow] = useState<Show>("all");
  const [group, setGroup] = useState<NotificationGroup | "">("");
  const [items, setItems] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (p: number) => {
      const { data } = await api.get("/notifications", {
        params: {
          page: p,
          limit: PAGE_SIZE,
          unreadOnly: show === "unread" ? "true" : undefined,
          types: group ? typesOfGroup(group).join(",") : undefined,
        },
      });
      const r = data.data ?? {};
      return { rows: (r.notifications ?? []) as Notification[], totalPages: (r.totalPages as number) || 1 };
    },
    [show, group]
  );

  // First page — on filter change and whenever a live notification arrives
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchPage(1);
        if (cancelled) return;
        setItems(r.rows);
        setTotalPages(r.totalPages);
        setPage(1);
      } catch {
        /* keep what we have */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, latestLiveId]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await fetchPage(page + 1);
      setItems((prev) => [...prev, ...r.rows.filter((n) => !prev.some((p) => p.id === n.id))]);
      setTotalPages(r.totalPages);
      setPage(page + 1);
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false);
    }
  };

  const markOne = async (n: Notification) => {
    if (n.isRead) return;
    await markAsRead(n.id);
    setItems((prev) =>
      show === "unread" ? prev.filter((x) => x.id !== n.id) : prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
    );
  };

  const open = async (n: Notification) => {
    if (n.available === false) return;
    await markOne(n);
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    const cleared = unreadCount;
    await markAllAsRead();
    await fetchUnreadCount();
    notify.success("All caught up", `${cleared} notification${cleared === 1 ? "" : "s"} marked as read.`);
    setItems((prev) => (show === "unread" ? [] : prev.map((x) => ({ ...x, isRead: true }))));
  };

  // Group by day for scanning
  const days = useMemo(() => {
    const out: { label: string; rows: Notification[] }[] = [];
    for (const n of items) {
      const label = dayLabel(new Date(n.createdAt));
      const last = out[out.length - 1];
      if (last?.label === label) last.rows.push(n);
      else out.push({ label, rows: [n] });
    }
    return out;
  }, [items]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"} · click one to go where you act on it
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAll}>
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          tabs={
            [
              { value: "all", label: "All" },
              { value: "unread", label: "Unread", count: unreadCount },
            ] as PillTab<Show>[]
          }
          value={show}
          onChange={(v) => {
            setLoading(true);
            setShow(v);
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "" as const, label: "Everything" }, ...NOTIFICATION_GROUPS].map((g) => (
            <button
              key={g.value || "all"}
              type="button"
              onClick={() => {
                setLoading(true);
                setGroup(g.value);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                group === g.value
                  ? "bg-foreground text-background ring-foreground"
                  : "text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Bell className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">
            {show === "unread" ? "No unread notifications" : "No notifications here yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You&apos;ll be notified when something needs you — leads, quotes, POs, bills and invoices.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {d.rows.map((n) => (
                  <NotificationRow key={n.id} n={n} onOpen={open} onMarkRead={markOne} />
                ))}
              </ul>
            </section>
          ))}
          {page < totalPages && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="size-4 animate-spin" />}
                Load older
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onOpen,
  onMarkRead,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  onMarkRead: (n: Notification) => void;
}) {
  const meta = notificationMeta(n.type);
  const Icon = meta.icon;
  const gone = n.available === false;
  const when = new Date(n.createdAt);

  return (
    <li
      className={cn(
        "group relative flex items-start gap-4 px-5 py-4 transition-colors",
        gone ? "opacity-60" : "cursor-pointer hover:bg-muted/40",
        !n.isRead && "bg-[#3B82F6]/[0.04]"
      )}
      onClick={() => onOpen(n)}
    >
      {!n.isRead && <span className="absolute inset-y-0 left-0 w-1 bg-[#3B82F6]" />}
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", meta.tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className={cn("text-sm", n.isRead ? "font-medium text-muted-foreground" : "font-semibold")}>{n.title}</p>
          <span className="text-xs text-muted-foreground" title={formatDateTimeIN(when)}>
            {formatDistanceToNow(when, { addSuffix: true })}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
        {gone && <p className="mt-1 text-xs italic text-muted-foreground">No longer available — the record was removed or isn&apos;t yours any more.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!n.isRead && (
          <Button size="icon-sm" variant="ghost" title="Mark as read" aria-label="Mark as read" onClick={() => onMarkRead(n)}>
            <Check className="size-4" />
          </Button>
        )}
        {!gone && n.link && (
          <Button size="sm" variant="outline" onClick={() => onOpen(n)}>
            Open <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

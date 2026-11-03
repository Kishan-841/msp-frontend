'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useTaskStore } from '@/stores/task-store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import type { Notification } from '@/types';
import { DATA_CHANGED_EVENT } from '@/hooks/useDataChanged';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const fetchCounts = useTaskStore((s) => s.fetchCounts);
  const markReadByLink = useNotificationStore((s) => s.markReadByLink);
  const pathname = usePathname();
  const router = useRouter();

  // Opening a record clears the notifications about it
  useEffect(() => {
    if (user && pathname) markReadByLink(pathname); // '/' clears the morning digest
  }, [user, pathname, markReadByLink]);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    if (!localStorage.getItem('accessToken')) return;

    // Fetch existing notifications + to-do counts on auth
    fetchNotifications();
    fetchUnreadCount();
    fetchCounts();

    // Connect socket (token is re-read on every reconnect)
    connectSocket();
    const socket = getSocket();

    // Something changed somewhere → refresh my sidebar counts, and tell open pages
    // (useDataChanged) so they refetch in the background
    const handleDataChanged = () => {
      fetchCounts();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    };
    // After a reconnect we may have missed events → resync everything
    const handleConnect = () => {
      fetchNotifications();
      fetchUnreadCount();
      handleDataChanged();
    };

    const handleNewNotification = (notification: Notification) => {
      addNotification(notification);
      // Already looking at that page? It refreshes by itself — just mark the notification read.
      const here = window.location.pathname;
      if (notification.link && notification.link.split('?')[0].replace(/\/workspace$/, '') === here.replace(/\/workspace$/, '')) {
        markReadByLink(here);
        return;
      }
      showLiveNotification(notification, (href) => router.push(href));
    };

    socket?.on('notification:new', handleNewNotification);
    socket?.on('data:changed', handleDataChanged);
    socket?.on('connect', handleConnect);

    return () => {
      socket?.off('notification:new', handleNewNotification);
      socket?.off('data:changed', handleDataChanged);
      socket?.off('connect', handleConnect);
      disconnectSocket();
    };
  }, [user, addNotification, fetchNotifications, fetchUnreadCount, fetchCounts, markReadByLink, router]);

  return <>{children}</>;
}

// Live notifications as toasts: good news → success, push-backs → warning, the morning
// digest → info, everything else → action with an "Open" button to where you act on it.
const GOOD = new Set(["QUOTE_APPROVED", "QUOTE_ACCEPTED", "PO_CONFIRMED", "INVOICE_RAISED", "DEAL_CLOSED"]);
const PUSHBACK = new Set(["QUOTE_REJECTED", "PO_REJECTED"]);

function showLiveNotification(n: Notification, open: (href: string) => void) {
  const button = n.link ? { label: "Open", onClick: () => open(n.link!) } : undefined;
  if (n.type === "DAILY_DIGEST") return notify.info(n.title, n.message);
  if (PUSHBACK.has(n.type))
    return notify.warning(n.title, n.message, button ? { button: { title: button.label, onClick: button.onClick } } : undefined);
  if (GOOD.has(n.type) || !button)
    return notify.success(n.title, n.message, button ? { button: { title: button.label, onClick: button.onClick } } : undefined);
  return notify.action(n.title, n.message, button);
}

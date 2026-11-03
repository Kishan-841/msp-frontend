import { create } from 'zustand';
import type { Notification } from '@/types';
import api from '@/lib/axios';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markReadByLink: (link: string) => Promise<void>;
  addNotification: (notification: Notification) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/notifications?limit=20');
      const result = data.data;
      set({
        notifications: result?.notifications ?? [],
        unreadCount: result?.unreadCount ?? 0,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      set({ unreadCount: data.data?.count ?? 0 });
    } catch {
      // silently fail
    }
  },

  markAsRead: async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      const { notifications } = get();
      set({
        notifications: notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, get().unreadCount - 1),
      });
    } catch {
      // silently fail
    }
  },

  markAllAsRead: async () => {
    try {
      await api.patch('/notifications/read-all');
      const { notifications } = get();
      set({
        notifications: notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      });
    } catch {
      // silently fail
    }
  },

  // Visiting a page clears the notifications that point to it
  markReadByLink: async (link: string) => {
    // same page = same path, ignoring ?query and a trailing /workspace (the server matches the same way)
    const norm = (l: string) => l.split('?')[0].replace(/\/workspace$/, '');
    const base = norm(link);
    const matches = (l?: string | null) => !!l && norm(l) === base;
    const { notifications } = get();
    if (!notifications.some((n) => !n.isRead && matches(n.link)) && get().unreadCount === 0) return;
    try {
      const { data } = await api.patch('/notifications/read-link', { link });
      const cleared = data.data?.count ?? 0;
      if (!cleared) return;
      set({
        notifications: get().notifications.map((n) => (matches(n.link) ? { ...n, isRead: true } : n)),
        unreadCount: Math.max(0, get().unreadCount - cleared),
      });
    } catch {
      // silently fail
    }
  },

  addNotification: (notification: Notification) => {
    const { notifications } = get();
    set({
      notifications: [notification, ...notifications].slice(0, 50),
      unreadCount: get().unreadCount + 1,
    });
  },

  reset: () => {
    set({ notifications: [], unreadCount: 0, isLoading: false });
  },
}));

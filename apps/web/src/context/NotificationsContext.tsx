/**
 * Purpose: Global Notifications Context for tableDash.
 * Responsibilities: Manages a queue of in-app toast notifications and a persistent
 *   notification log. Provides helpers to push new notifications and dismiss them.
 *   Also tracks unread count for the admin bell badge.
 * Dependencies: React context.
 * When to modify: When adding new notification categories, persistence, or sound alerts.
 */

import React, { createContext, useCallback, useContext, useState } from "react";
import type { ToastNotification, ToastType } from "../components/NotificationToast";

/** A persisted notification entry in the admin notification log */
export interface NotificationEntry {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationsContextValue {
  toasts: ToastNotification[];
  notifications: NotificationEntry[];
  unreadCount: number;
  pushNotification: (type: ToastType, title: string, message: string, opts?: { duration?: number; persist?: boolean }) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
};

let _nextId = 0;
const nextId = () => `n-${Date.now()}-${_nextId++}`;

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  const pushNotification = useCallback(
    (type: ToastType, title: string, message: string, opts?: { duration?: number; persist?: boolean }) => {
      const id = nextId();
      const persist = opts?.persist !== false; // default: persist = true

      // Add to toast queue
      setToasts((prev) => [
        ...prev,
        { id, type, title, message, duration: opts?.duration ?? 5000 },
      ]);

      // Persist to notification log
      if (persist) {
        setNotifications((prev) => [
          { id, type, title, message, timestamp: new Date(), read: false },
          ...prev.slice(0, 49), // cap at 50
        ]);
      }
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ toasts, notifications, unreadCount, pushNotification, dismissToast, markAllRead, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

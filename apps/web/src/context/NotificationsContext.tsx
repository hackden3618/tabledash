/**
 * Purpose: Global Notifications Context for Ladha.
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
  scope?: "customer" | "admin" | "platform";
}

interface NotificationsContextValue {
  toasts: ToastNotification[];
  notifications: NotificationEntry[];
  unreadCount: number;
  currentScope: "customer" | "admin" | "platform";
  setScope: (scope: "customer" | "admin" | "platform") => void;
  pushNotification: (type: ToastType, title: string, message: string, opts?: { duration?: number; persist?: boolean; scope?: "customer" | "admin" | "platform" }) => void;
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  clearScope: (scope: "customer" | "admin" | "platform") => void;
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
  const [currentScope, setCurrentScope] = useState<"customer" | "admin" | "platform">("customer");

  const pushNotification = useCallback(
    (type: ToastType, title: string, message: string, opts?: { duration?: number; persist?: boolean; scope?: "customer" | "admin" | "platform" }) => {
      const id = nextId();
      const persist = opts?.persist !== false;
      const scope = opts?.scope ?? currentScope;

      setToasts((prev) => [
        ...prev,
        { id, type, title, message, duration: opts?.duration ?? 5000 },
      ]);

      if (persist) {
        setNotifications((prev) => [
          { id, type, title, message, timestamp: new Date(), read: false, scope },
          ...prev.slice(0, 49),
        ]);
      }
    },
    [currentScope]
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

  const clearScope = useCallback((scope: "customer" | "admin" | "platform") => {
    setNotifications((prev) => prev.filter((n) => n.scope !== scope));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read && n.scope === currentScope).length;

  return (
    <NotificationsContext.Provider
      value={{ toasts, notifications, unreadCount, currentScope, setScope: setCurrentScope, pushNotification, dismissToast, markAllRead, clearAll, clearScope }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

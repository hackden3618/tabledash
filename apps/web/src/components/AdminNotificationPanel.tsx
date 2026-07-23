/**
 * Purpose: Admin Notification Panel for tableDash.
 * Responsibilities: Slide-in panel (triggered by a bell icon with unread badge) that displays
 *   the full notification history for admins — new orders, bounced orders, status updates.
 *   Integrates with NotificationsContext for real data.
 * Dependencies: React, NotificationsContext, lucide-react.
 * When to modify: When adding notification filtering, sounds, or richer card designs.
 */

import React from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useNotifications, type NotificationEntry } from "../context/NotificationsContext";
import type { ToastType } from "./NotificationToast";

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  info:     <Info size={16} />,
  success:  <CheckCircle2 size={16} />,
  warning:  <AlertTriangle size={16} />,
  danger:   <AlertTriangle size={16} />,
  delivery: <Truck size={16} />,
};

const COLOR_MAP: Record<ToastType, { icon: string; bg: string }> = {
  info:     { icon: "#1E4D36", bg: "#EBF4F0" },
  success:  { icon: "#15803D", bg: "#DCFCE7" },
  warning:  { icon: "#D97706", bg: "#FEF3C7" },
  danger:   { icon: "#DC2626", bg: "#FEE2E2" },
  delivery: { icon: "#1D4ED8", bg: "#DBEAFE" },
};

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

interface AdminNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminNotificationPanel: React.FC<AdminNotificationPanelProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();

  const handleOpen = () => {
    markAllRead();
  };

  // Mark all read when panel opens
  React.useEffect(() => {
    if (isOpen) handleOpen();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(2px)",
          zIndex: 5000,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(380px, 100vw)",
          height: "100dvh",
          background: "#FFFFFF",
          zIndex: 5001,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
          animation: "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #F3F4F6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#1E4D36",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bell size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>Notifications</div>
              <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                title="Clear all"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: "6px", padding: "6px", cursor: "pointer", display: "flex" }}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex" }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#9CA3AF" }}>
              <BellOff size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>No notifications yet</p>
              <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>New orders and alerts will appear here in real time.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {notifications.map((n: NotificationEntry) => {
                const colors = COLOR_MAP[n.type];
                return (
                  <div
                    key={n.id}
                    style={{
                      background: n.read ? "#FAFAFA" : "#F0FDF4",
                      border: `1px solid ${n.read ? "#F3F4F6" : "#BBF7D0"}`,
                      borderRadius: "12px",
                      padding: "12px 14px",
                      display: "flex",
                      gap: "12px",
                      alignItems: "flex-start",
                      transition: "background 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "9px",
                        background: colors.bg,
                        color: colors.icon,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {ICON_MAP[n.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1F2937" }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#4B5563", marginTop: "2px", lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "5px" }}>
                        {timeAgo(n.timestamp)}
                      </div>
                    </div>
                    {!n.read && (
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E", flexShrink: 0, marginTop: "4px" }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
};

/** Bell icon button with unread badge — renders in the admin header */
export const AdminNotificationBell: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { unreadCount } = useNotifications();
  return (
    <button
      onClick={onClick}
      title="Notifications"
      style={{
        background: "rgba(255,255,255,0.15)",
        border: "none",
        color: "white",
        padding: "6px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      <Bell size={18} />
      {unreadCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            background: "#EF4444",
            color: "white",
            borderRadius: "50%",
            fontSize: "10px",
            fontWeight: 700,
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #1E4D36",
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
};

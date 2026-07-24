import React from "react";
import { useNotifications, NotificationEntry } from "../context/NotificationsContext";
import { Bell, CheckCheck, Trash2, X, AlertTriangle, CheckCircle2, Info, Package } from "lucide-react";

interface CustomerNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerNotificationPanel: React.FC<CustomerNotificationPanelProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();

  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={18} color="#16A34A" />;
      case "warning":
        return <AlertTriangle size={18} color="#D97706" />;
      case "danger":
        return <AlertTriangle size={18} color="#DC2626" />;
      default:
        return <Package size={18} color="#1E4D36" />;
    }
  };

  const formatTime = (date: Date) => {
    const d = new Date(date);
    const diffMs = Date.now() - d.getTime();
    const diffM = Math.floor(diffMs / (1000 * 60));
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          height: "100%",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
          animation: "slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", background: "#1E4D36", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bell size={20} />
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Notifications</div>
            {unreadCount > 0 && (
              <span style={{ background: "#22C55E", color: "white", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px" }}>
                {unreadCount} new
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        {/* Action controls */}
        {notifications.length > 0 && (
          <div style={{ padding: "10px 16px", background: "#F3F4F6", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={markAllRead}
              style={{ background: "none", border: "none", color: "#1E4D36", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
            <button
              onClick={clearAll}
              style={{ background: "none", border: "none", color: "#DC2626", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}
            >
              <Trash2 size={14} /> Clear all
            </button>
          </div>
        )}

        {/* Notification List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#6B7280" }}>
              <Bell size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#374151" }}>No notifications yet</h3>
              <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                Order status patches, dispatch alerts, and updates will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {notifications.map((item: NotificationEntry) => (
                <div
                  key={item.id}
                  style={{
                    background: item.read ? "#F9FAFB" : "#EBF4F0",
                    border: `1px solid ${item.read ? "#E5E7EB" : "#BBF7D0"}`,
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    position: "relative",
                  }}
                >
                  <div style={{ marginTop: "2px" }}>{getIcon(item.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#1F2937" }}>{item.title}</h4>
                      <span style={{ fontSize: "0.72rem", color: "#6B7280" }}>{formatTime(item.timestamp)}</span>
                    </div>
                    <p style={{ fontSize: "0.825rem", color: "#4B5563", marginTop: "2px", lineHeight: 1.4 }}>
                      {item.message}
                    </p>
                  </div>
                  {!item.read && (
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E", position: "absolute", top: "12px", right: "12px" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

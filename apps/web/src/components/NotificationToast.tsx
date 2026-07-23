/**
 * Purpose: Animated Toast Notification Component for tableDash.
 * Responsibilities: Displays short-lived, animated toast messages (bottom of screen) for
 *   real-time events like order updates, bounced orders, etc.
 * Dependencies: React, lucide-react.
 * When to modify: When changing toast style, animation duration, or adding new toast types.
 */

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Truck,
  X,
} from "lucide-react";

export type ToastType = "info" | "success" | "warning" | "danger" | "delivery";

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // ms, default 4500
}

interface ToastItemProps {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  info:     <Info size={18} />,
  success:  <CheckCircle2 size={18} />,
  warning:  <AlertTriangle size={18} />,
  danger:   <AlertTriangle size={18} />,
  delivery: <Truck size={18} />,
};

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; color: string; iconBg: string }> = {
  info:     { bg: "#FFFFFF",   border: "#E5E7EB",  color: "#1F2937",  iconBg: "#EBF4F0" },
  success:  { bg: "#FFFFFF",   border: "#BBF7D0",  color: "#15803D",  iconBg: "#DCFCE7" },
  warning:  { bg: "#FFFBEB",   border: "#FCD34D",  color: "#92400E",  iconBg: "#FEF3C7" },
  danger:   { bg: "#FFF5F5",   border: "#FECACA",  color: "#B91C1C",  iconBg: "#FEE2E2" },
  delivery: { bg: "#EFF6FF",   border: "#BFDBFE",  color: "#1D4ED8",  iconBg: "#DBEAFE" },
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setVisible(true), 16);
    // Auto-dismiss
    const duration = toast.duration ?? 4500;
    const exitTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 320);
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const colors = TOAST_COLORS[toast.type];

  return (
    <div
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: "14px",
        padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        transition: "all 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        maxWidth: "420px",
        width: "calc(100vw - 40px)",
        pointerEvents: "auto",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "10px",
          background: colors.iconBg,
          color: colors.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {TOAST_ICONS[toast.type]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: colors.color, lineHeight: 1.3 }}>
          {toast.title}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#4B5563", marginTop: "2px", lineHeight: 1.4 }}>
          {toast.message}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 320);
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#9CA3AF",
          padding: "2px",
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

interface NotificationToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

/**
 * Fixed-position container that renders all active toast notifications.
 * Place this once at the app root level.
 */
export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "80px",   // above the bottom nav bar
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column-reverse",
        gap: "8px",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
